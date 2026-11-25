#!/usr/bin/env node

import {
  MANIFEST,
  PERMISSION_DEFINITIONS,
  POLICY_DEFINITIONS,
  REQUIRED_COLLECTIONS,
  REQUIRED_RELATIONS,
  ROLE_DEFINITIONS,
} from "./manifest.mjs";
import { validateManifest } from "./validate.mjs";

const DEFAULT_URL = "http://localhost:8055";
const DEFAULT_TIMEOUT_MS = 10_000;
const PAGE_SIZE = 100;

class DirectusApiError extends Error {
  constructor(message, { status = null, body = null } = {}) {
    super(message);
    this.name = "DirectusApiError";
    this.status = status;
    this.body = body;
  }
}

function parseArguments(argv) {
  const options = { dryRun: false, verbose: false, printManifest: false, help: false };

  for (const argument of argv) {
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--verbose") options.verbose = true;
    else if (argument === "--print-manifest") options.printManifest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`Mathia Directus 12 access-control bootstrap

Usage:
  node bootstrap.mjs [--dry-run] [--verbose]
  node bootstrap.mjs --print-manifest

Authentication environment variables:
  DIRECTUS_URL                 API URL (falls back to DIRECTUS_PUBLIC_URL)
  DIRECTUS_ADMIN_TOKEN         Optional static admin token
  DIRECTUS_ADMIN_EMAIL         Admin email when no static token is used
  DIRECTUS_ADMIN_PASSWORD      Admin password when no static token is used
  DIRECTUS_ADMIN_OTP           Optional one-time password

Operational environment variables:
  DIRECTUS_BOOTSTRAP_TIMEOUT_MS   Request timeout (default: 10000)
  DIRECTUS_BOOTSTRAP_RETRIES      Startup authentication attempts (default: 10)
  DIRECTUS_BOOTSTRAP_RETRY_MS     Delay between attempts (default: 2000)
`);
}

function readPositiveInteger(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function relationId(value) {
  if (value && typeof value === "object") return value.id ?? null;
  return value ?? null;
}

function parseJsonValue(value) {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeFields(value) {
  if (Array.isArray(value)) return [...value].map(String).sort();
  if (typeof value === "string") {
    return value
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean)
      .sort();
  }
  return [];
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function changed(existing, desired, keys) {
  return keys.some((key) => {
    let current = existing[key] ?? null;
    let expected = desired[key] ?? null;

    if (key === "parent") {
      current = relationId(current);
      expected = relationId(expected);
    }

    return !equal(current, expected);
  });
}

function permissionKey(policyId, collection, action) {
  return `${policyId}:${collection}:${action}`;
}

function describeError(error) {
  if (!(error instanceof DirectusApiError)) return error.message;
  const directusMessage =
    error.body?.errors?.map((entry) => entry?.message).filter(Boolean).join("; ") ?? null;
  return `${error.message}${directusMessage ? `: ${directusMessage}` : ""}`;
}

class DirectusClient {
  constructor({ baseUrl, timeoutMs }) {
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error(`DIRECTUS_URL is not a valid URL: ${baseUrl}`);
    }

    if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
      throw new Error("DIRECTUS_URL must use http or https");
    }

    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
    this.accessToken = null;
    this.refreshToken = null;
  }

  async request(path, { method = "GET", body = undefined, authenticated = true } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (authenticated && this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;

    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new DirectusApiError(`Unable to reach Directus at ${this.baseUrl}`, {
        body: { cause: error.message },
      });
    }

    const text = await response.text();
    let parsedBody = null;
    if (text) {
      try {
        parsedBody = JSON.parse(text);
      } catch {
        parsedBody = text;
      }
    }

    if (!response.ok) {
      throw new DirectusApiError(`${method} ${path} returned HTTP ${response.status}`, {
        status: response.status,
        body: parsedBody,
      });
    }

    if (parsedBody && typeof parsedBody === "object" && "data" in parsedBody) {
      return parsedBody.data;
    }
    return parsedBody;
  }

  async authenticate({ token, email, password, otp }) {
    if (token) {
      this.accessToken = token;
      await this.request("/users/me?fields=id");
      return;
    }

    const payload = { email, password, mode: "json" };
    if (otp) payload.otp = otp;
    const session = await this.request("/auth/login", {
      method: "POST",
      body: payload,
      authenticated: false,
    });
    this.accessToken = session?.access_token ?? null;
    this.refreshToken = session?.refresh_token ?? null;
    if (!this.accessToken) throw new Error("Directus login did not return an access token");
  }

  async logout() {
    if (!this.refreshToken) return;
    try {
      await this.request("/auth/logout", {
        method: "POST",
        body: { refresh_token: this.refreshToken, mode: "json" },
      });
    } catch (error) {
      console.warn(`Warning: could not invalidate bootstrap session (${describeError(error)}).`);
    }
  }

  async listAll(path, fields = null) {
    const results = [];
    const seen = new Set();
    let offset = 0;

    while (true) {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (fields?.length) query.set("fields", fields.join(","));
      const page = await this.request(`${path}?${query}`);
      if (!Array.isArray(page)) throw new Error(`${path} did not return a list`);
      let added = 0;
      for (const item of page) {
        const fingerprint = JSON.stringify(item);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        results.push(item);
        added += 1;
      }
      // Some Directus schema endpoints ignore limit/offset and return the full
      // list on every request. A repeated page is complete, not a reason to
      // continue increasing the offset forever.
      if (added === 0) return results;
      if (page.length < PAGE_SIZE) return results;
      offset += page.length;
    }
  }
}

class Bootstrap {
  constructor(client, options) {
    this.client = client;
    this.options = options;
    this.stats = { create: 0, update: 0, delete: 0, unchanged: 0 };
  }

  logMutation(action, label, body = null) {
    const prefix = this.options.dryRun ? "DRY-RUN" : action.toUpperCase();
    console.log(`[${prefix}] ${label}`);
    if (this.options.verbose && body) console.log(JSON.stringify(body, null, 2));
  }

  async mutate(action, method, path, body, label) {
    this.stats[action] += 1;
    this.logMutation(action, label, body);
    if (this.options.dryRun) return null;
    return this.client.request(path, { method, body });
  }

  unchanged(label) {
    this.stats.unchanged += 1;
    if (this.options.verbose) console.log(`[UNCHANGED] ${label}`);
  }

  async preflight() {
    const ping = await this.client.request("/server/ping", { authenticated: false });
    if (ping !== "pong") throw new Error(`Unexpected /server/ping response: ${String(ping)}`);

    const [health, serverInfo] = await Promise.all([
      this.client.request("/server/health"),
      this.client.request("/server/info"),
    ]);
    const version = health?.releaseId ?? health?.version ?? null;
    if (version && !String(version).startsWith("11.") && !String(version).startsWith("12.")) {
      throw new Error(`This bootstrap targets Directus 11 or 12, but the server reports ${version}`);
    }
    console.log(`Directus ${version ?? "11/12 (version not disclosed)"} is reachable.`);

    // Directus 11 does not have license enforcement for custom permission rules
    // Directus 12 requires the custom_permission_rules_enabled entitlement
    if (version && String(version).startsWith("12.")) {
      const customPermissionRulesEnabled =
        serverInfo?.license?.entitlements?.custom_permission_rules_enabled === true;
      if (!customPermissionRulesEnabled) {
        throw new Error(
          [
            "Directus 12 reports that custom permission rules are not enabled by its license.",
            "Mathia's Student, Teacher, and Director isolation requires relational item filters;",
            "replacing them with unrestricted collection access would expose cross-user or cross-school data.",
            "Install a Directus license with custom_permission_rules_enabled, or use a supported Directus 11 release.",
            "No roles, policies, access links, or permissions were changed by this run.",
          ].join("\n"),
        );
      }
    }

    const [collections, relations] = await Promise.all([
      this.client.listAll("/collections", ["collection"]),
      this.client.listAll("/relations"),
    ]);

    const collectionNames = new Set(
      collections.map((entry) => entry.collection ?? entry.schema?.name).filter(Boolean),
    );
    const missingCollections = REQUIRED_COLLECTIONS.filter((name) => !collectionNames.has(name));
    if (missingCollections.length) {
      throw new Error(`Required Directus collections are missing: ${missingCollections.join(", ")}`);
    }

    const relationKeys = new Set(
      relations.map((entry) => {
        const collection = entry.collection ?? entry.meta?.many_collection;
        const field = entry.field ?? entry.meta?.many_field;
        const related = entry.related_collection ?? entry.meta?.one_collection;
        return `${collection}.${field}->${related}`;
      }),
    );

    const missingRelations = REQUIRED_RELATIONS.map(
      ([collection, field, related]) => `${collection}.${field}->${related}`,
    ).filter((key) => !relationKeys.has(key));

    if (missingRelations.length) {
      throw new Error(
        [
          "Directus does not expose all relations required by the permission filters.",
          ...missingRelations.map((relation) => `  - ${relation}`),
          "Add the missing single-column relation metadata/FKs in a versioned migration and rerun.",
          "No roles, policies, access links, or permissions were changed.",
        ].join("\n"),
      );
    }

    console.log(
      `Schema preflight passed (${REQUIRED_COLLECTIONS.length} collections, ${REQUIRED_RELATIONS.length} relations).`,
    );
  }

  async ensureApplicationCollections() {
    // PostgreSQL tables can be visible through schema introspection even when
    // Directus has no `directus_collections` metadata row for them. In that
    // state the API works, but the Admin Content module hides the collections.
    const collections = await this.client.listAll("/collections", ["collection", "meta"]);
    const existing = new Map(
      collections
        .map((entry) => [entry.collection ?? entry.schema?.name, entry])
        .filter(([name]) => Boolean(name)),
    );

    for (const collection of REQUIRED_COLLECTIONS) {
      const current = existing.get(collection);
      if (!current) {
        await this.mutate(
          "create",
          "POST",
          "/collections",
          {
            collection,
            meta: { hidden: false, singleton: false },
            // The PostgreSQL table is already the source of truth. A null schema
            // tells Directus to register the existing table without recreating it.
            schema: null,
          },
          `register collection ${collection}`,
        );
        continue;
      }

      // A collection returned with meta=null is introspected from PostgreSQL
      // but is not registered for the Admin UI. PATCHing its metadata makes it
      // appear in Content without changing the table or its fields.
      if (current.meta == null) {
        await this.mutate(
          "update",
          "PATCH",
          `/collections/${encodeURIComponent(collection)}`,
          { meta: { hidden: false, singleton: false } },
          `register collection metadata ${collection}`,
        );
      } else {
        this.unchanged(`collection metadata ${collection}`);
      }
    }
  }

  async ensureProjectCompliance() {
    const settings = await this.client.request("/settings");
    const owner = process.env.DIRECTUS_PROJECT_OWNER || process.env.DIRECTUS_ADMIN_EMAIL;
    const usage = process.env.DIRECTUS_PROJECT_USAGE || "community";
    if (!owner) throw new Error("Set DIRECTUS_PROJECT_OWNER or DIRECTUS_ADMIN_EMAIL");

    const desired = {
      project_owner: owner,
      project_usage: usage,
      product_updates: process.env.DIRECTUS_PRODUCT_UPDATES === "true",
    };
    const changes = Object.fromEntries(
      Object.entries(desired).filter(([key, value]) => settings?.[key] !== value),
    );
    if (Object.keys(changes).length === 0) {
      this.unchanged("project compliance settings");
      return;
    }
    await this.mutate("update", "PATCH", "/settings", changes, "project compliance settings");
  }

  findUniqueByName(items, definition, kind) {
    const matches = items.filter((item) => item.name === definition.name);
    if (matches.length > 1) {
      throw new Error(`Multiple ${kind} records named ${definition.name}; refusing to choose one`);
    }
    return matches[0] ?? null;
  }

  auditBeforeMutation({ roles, policies, access, users }) {
    const managedRoles = new Map();
    const managedPolicies = new Map();

    for (const definition of ROLE_DEFINITIONS) {
      const existing = this.findUniqueByName(roles, definition, "role");
      if (existing) managedRoles.set(String(existing.id), definition.key);
    }
    for (const definition of POLICY_DEFINITIONS) {
      const existing = this.findUniqueByName(policies, definition, "policy");
      if (existing) managedPolicies.set(String(existing.id), definition.key);
    }

    const inheritedBy = roles.filter((role) => {
      const parent = relationId(role.parent);
      return parent && managedRoles.has(String(parent)) && !managedRoles.has(String(role.id));
    });
    if (inheritedBy.length) {
      throw new Error(
        `Managed SPA roles cannot be parents of other roles. Detach: ${inheritedBy
          .map((role) => `${role.name} (${role.id})`)
          .join(", ")}`,
      );
    }

    const usersById = new Map(users.map((user) => [String(user.id), user]));
    const policyNameById = new Map(policies.map((policy) => [String(policy.id), policy.name]));
    const directExceptions = [];

    for (const row of access) {
      const userId = relationId(row.user);
      if (!userId) continue;
      const user = usersById.get(String(userId));
      const roleId = relationId(user?.role);
      if (!roleId || !managedRoles.has(String(roleId))) continue;

      const policyId = relationId(row.policy);
      const managedRoleKey = managedRoles.get(String(roleId));
      const managedPolicyKey = managedPolicies.get(String(policyId));
      if (managedPolicyKey === managedRoleKey) continue;

      directExceptions.push(
        `${user.email ?? user.id} -> ${policyNameById.get(String(policyId)) ?? policyId}`,
      );
    }

    if (directExceptions.length) {
      throw new Error(
        [
          "Users in managed SPA roles have direct policy assignments outside this manifest.",
          ...directExceptions.map((entry) => `  - ${entry}`),
          "Remove those assignments or use an unmanaged role before running the bootstrap.",
        ].join("\n"),
      );
    }
  }

  async upsertRoles(existingRoles) {
    const result = new Map();
    for (const definition of ROLE_DEFINITIONS) {
      const desired = {
        name: definition.name,
        icon: definition.icon,
        description: definition.description,
        parent: definition.parent,
      };
      const existing = this.findUniqueByName(existingRoles, definition, "role");

      if (!existing) {
        const created = await this.mutate(
          "create",
          "POST",
          "/roles",
          desired,
          `create role ${definition.name}`,
        );
        result.set(definition.key, created ?? { ...desired, id: `<new-role:${definition.key}>` });
      } else if (changed(existing, desired, ["name", "icon", "description", "parent"])) {
        const updated = await this.mutate(
          "update",
          "PATCH",
          `/roles/${encodeURIComponent(existing.id)}`,
          desired,
          `update role ${definition.name}`,
        );
        result.set(definition.key, updated ?? { ...existing, ...desired });
      } else {
        this.unchanged(`role ${definition.name}`);
        result.set(definition.key, existing);
      }
    }
    return result;
  }

  async upsertPolicies(existingPolicies) {
    const result = new Map();
    for (const definition of POLICY_DEFINITIONS) {
      const desired = {
        name: definition.name,
        icon: definition.icon,
        description: definition.description,
        app_access: definition.app_access,
        admin_access: definition.admin_access,
        enforce_tfa: definition.enforce_tfa,
        ip_access: definition.ip_access,
      };
      const existing = this.findUniqueByName(existingPolicies, definition, "policy");

      if (!existing) {
        const created = await this.mutate(
          "create",
          "POST",
          "/policies",
          desired,
          `create policy ${definition.name}`,
        );
        result.set(definition.key, created ?? { ...desired, id: `<new-policy:${definition.key}>` });
      } else if (
        changed(existing, desired, [
          "name",
          "icon",
          "description",
          "app_access",
          "admin_access",
          "enforce_tfa",
          "ip_access",
        ])
      ) {
        const updated = await this.mutate(
          "update",
          "PATCH",
          `/policies/${encodeURIComponent(existing.id)}`,
          desired,
          `update policy ${definition.name}`,
        );
        result.set(definition.key, updated ?? { ...existing, ...desired });
      } else {
        this.unchanged(`policy ${definition.name}`);
        result.set(definition.key, existing);
      }
    }
    return result;
  }

  buildAccessPlan(existingAccess, roles, policies) {
    const expected = new Map();
    const managedRoleIds = new Set();
    const managedPolicyIds = new Set();

    for (const definition of ROLE_DEFINITIONS) {
      const roleId = String(roles.get(definition.key).id);
      const policyId = String(policies.get(definition.key).id);
      managedRoleIds.add(roleId);
      managedPolicyIds.add(policyId);
      expected.set(`${roleId}:${policyId}`, { role: roleId, policy: policyId, user: null });
    }

    const valid = new Set();
    const remove = [];
    for (const row of existingAccess) {
      const roleId = relationId(row.role);
      const policyId = relationId(row.policy);
      const userId = relationId(row.user);
      const key = `${roleId}:${policyId}`;
      const touchesManaged =
        managedRoleIds.has(String(roleId)) || managedPolicyIds.has(String(policyId));
      if (!touchesManaged) continue;

      if (userId === null && expected.has(key) && !valid.has(key)) valid.add(key);
      else remove.push(row);
    }

    return {
      remove,
      missing: [...expected.entries()]
        .filter(([key]) => !valid.has(key))
        .map(([, value]) => value),
    };
  }

  async removeUnexpectedAccess(plan) {
    for (const row of plan.remove) {
      await this.mutate(
        "delete",
        "DELETE",
        `/access/${encodeURIComponent(row.id)}`,
        undefined,
        `remove unexpected managed access link ${row.id}`,
      );
    }
  }

  async ensureAccess(plan) {
    for (const row of plan.missing) {
      await this.mutate(
        "create",
        "POST",
        "/access",
        row,
        `attach policy ${row.policy} to role ${row.role}`,
      );
    }
  }

  normalizeExistingPermission(permission) {
    return {
      policy: String(relationId(permission.policy)),
      collection: permission.collection,
      action: permission.action,
      permissions: parseJsonValue(permission.permissions),
      validation: parseJsonValue(permission.validation),
      presets: parseJsonValue(permission.presets),
      fields: normalizeFields(permission.fields),
    };
  }

  desiredPermission(definition, policyId) {
    return {
      policy: String(policyId),
      collection: definition.collection,
      action: definition.action,
      permissions: definition.permissions,
      validation: definition.validation,
      presets: definition.presets,
      fields: [...definition.fields].sort(),
    };
  }

  async reconcilePermissions(existingPermissions, policies) {
    const desired = new Map();
    for (const definition of PERMISSION_DEFINITIONS) {
      const policyId = policies.get(definition.role).id;
      const payload = this.desiredPermission(definition, policyId);
      desired.set(permissionKey(payload.policy, payload.collection, payload.action), payload);
    }

    const managedPolicyIds = new Set(
      [...policies.values()].map((policy) => String(policy.id)),
    );
    const existingByKey = new Map();

    for (const existing of existingPermissions) {
      const normalized = this.normalizeExistingPermission(existing);
      if (!managedPolicyIds.has(normalized.policy)) continue;
      const key = permissionKey(normalized.policy, normalized.collection, normalized.action);

      if (!desired.has(key) || existingByKey.has(key)) {
        await this.mutate(
          "delete",
          "DELETE",
          `/permissions/${encodeURIComponent(existing.id)}`,
          undefined,
          `remove stale permission ${key}`,
        );
      } else {
        existingByKey.set(key, { raw: existing, normalized });
      }
    }

    for (const [key, payload] of desired) {
      const existing = existingByKey.get(key);
      if (!existing) {
        await this.mutate(
          "create",
          "POST",
          "/permissions",
          payload,
          `create permission ${key}`,
        );
      } else if (!equal(existing.normalized, payload)) {
        await this.mutate(
          "update",
          "PATCH",
          `/permissions/${encodeURIComponent(existing.raw.id)}`,
          payload,
          `update permission ${key}`,
        );
      } else {
        this.unchanged(`permission ${key}`);
      }
    }
  }

  async run() {
    validateManifest();
    await this.ensureProjectCompliance();
    await this.ensureApplicationCollections();
    await this.preflight();

    const [roles, policies, access, permissions, users] = await Promise.all([
      this.client.listAll("/roles", ["id", "name", "icon", "description", "parent"]),
      this.client.listAll("/policies", [
        "id",
        "name",
        "icon",
        "description",
        "app_access",
        "admin_access",
        "enforce_tfa",
        "ip_access",
      ]),
      this.client.listAll("/access", ["id", "role", "user", "policy"]),
      this.client.listAll("/permissions", [
        "id",
        "policy",
        "collection",
        "action",
        "permissions",
        "validation",
        "presets",
        "fields",
      ]),
      this.client.listAll("/users", ["id", "email", "role"]),
    ]);

    this.auditBeforeMutation({ roles, policies, access, users });

    const managedRoles = await this.upsertRoles(roles);
    const managedPolicies = await this.upsertPolicies(policies);
    const accessPlan = this.buildAccessPlan(access, managedRoles, managedPolicies);

    await this.removeUnexpectedAccess(accessPlan);
    await this.reconcilePermissions(permissions, managedPolicies);
    await this.ensureAccess(accessPlan);

    const verb = this.options.dryRun ? "Planned" : "Applied";
    console.log(
      `${verb}: ${this.stats.create} create, ${this.stats.update} update, ${this.stats.delete} delete, ${this.stats.unchanged} unchanged.`,
    );
  }
}

async function authenticateWithRetry(client, credentials, retries, retryMs) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await client.authenticate(credentials);
      return;
    } catch (error) {
      const retryable =
        error instanceof DirectusApiError &&
        (error.status === null || [429, 502, 503, 504].includes(error.status));
      if (!retryable || attempt === retries) throw error;
      console.warn(
        `Directus is not ready (attempt ${attempt}/${retries}); retrying in ${retryMs}ms.`,
      );
      await sleep(retryMs);
    }
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  validateManifest();
  if (options.printManifest) {
    console.log(JSON.stringify(MANIFEST, null, 2));
    return;
  }

  const token = process.env.DIRECTUS_ADMIN_TOKEN ?? process.env.DIRECTUS_TOKEN ?? null;
  const email = process.env.DIRECTUS_ADMIN_EMAIL ?? null;
  const password = process.env.DIRECTUS_ADMIN_PASSWORD ?? null;
  if (!token && (!email || !password)) {
    throw new Error(
      "Set DIRECTUS_ADMIN_TOKEN, or both DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD",
    );
  }

  const client = new DirectusClient({
    baseUrl: process.env.DIRECTUS_URL ?? process.env.DIRECTUS_PUBLIC_URL ?? DEFAULT_URL,
    timeoutMs: readPositiveInteger("DIRECTUS_BOOTSTRAP_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
  });

  try {
    await authenticateWithRetry(
      client,
      {
        token,
        email,
        password,
        otp: process.env.DIRECTUS_ADMIN_OTP ?? null,
      },
      readPositiveInteger("DIRECTUS_BOOTSTRAP_RETRIES", 10),
      readPositiveInteger("DIRECTUS_BOOTSTRAP_RETRY_MS", 2_000),
    );
    console.log(`Authenticated against ${client.baseUrl}.`);
    await new Bootstrap(client, options).run();
  } finally {
    await client.logout();
  }
}

main().catch((error) => {
  console.error(`Bootstrap failed: ${describeError(error)}`);
  process.exitCode = 1;
});
