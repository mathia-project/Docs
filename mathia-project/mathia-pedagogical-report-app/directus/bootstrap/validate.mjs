import { pathToFileURL } from "node:url";

import {
  MANIFEST,
  PERMISSION_DEFINITIONS,
  POLICY_DEFINITIONS,
  ROLE_DEFINITIONS,
} from "./manifest.mjs";

const FORBIDDEN_WRITE_FIELDS = new Set([
  "id",
  "school_id",
  "created_at",
  "updated_at",
]);

const GLOBAL_REFERENCE_COLLECTIONS = new Set([
  "curriculum_categories",
  "curriculum_courses",
  "curriculum_domains",
  "curriculum_clusters",
  "curriculum_standards",
  "curriculum_substandards",
  "curriculum_course_domains",
  "curriculum_course_standards",
  "curriculum_course_substandards",
  "curriculum_lookup_aliases",
]);

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid permission manifest: ${message}`);
}

function containsValue(value, expected) {
  if (value === expected || (typeof value === "string" && value.startsWith(`${expected}.`))) {
    return true;
  }
  if (Array.isArray(value)) return value.some((entry) => containsValue(entry, expected));
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([key, entry]) => key === expected || containsValue(entry, expected),
    );
  }
  return false;
}

export function validateManifest() {
  const roleKeys = new Set();
  const roleNames = new Set();

  for (const role of ROLE_DEFINITIONS) {
    assert(!roleKeys.has(role.key), `duplicate role key ${role.key}`);
    assert(!roleNames.has(role.name), `duplicate role name ${role.name}`);
    assert(role.parent === null, `${role.name} must not inherit another role`);
    roleKeys.add(role.key);
    roleNames.add(role.name);
  }

  const policyKeys = new Set();
  const policyNames = new Set();
  for (const policy of POLICY_DEFINITIONS) {
    assert(!policyKeys.has(policy.key), `duplicate policy key ${policy.key}`);
    assert(!policyNames.has(policy.name), `duplicate policy name ${policy.name}`);
    assert(policy.admin_access === false, `${policy.name} cannot grant admin access`);
    assert(policy.app_access === false, `${policy.name} cannot grant Data Studio access`);
    policyKeys.add(policy.key);
    policyNames.add(policy.name);
  }

  assert(
    roleKeys.size === policyKeys.size && [...roleKeys].every((key) => policyKeys.has(key)),
    "role and policy keys must match one-to-one",
  );

  const permissionKeys = new Set();
  for (const permission of PERMISSION_DEFINITIONS) {
    const key = `${permission.role}:${permission.collection}:${permission.action}`;
    assert(roleKeys.has(permission.role), `${key} references an unknown role`);
    assert(!permissionKeys.has(key), `duplicate permission ${key}`);
    assert(
      permission.action === "read" || permission.action === "update" || permission.action === "create",
      `${key} is not deny-by-default`,
    );
    const authorizationRule =
      permission.action === "create" ? permission.validation : permission.permissions;

    if (permission.action === "create") {
      assert(permission.permissions === null, `${key} cannot rely on an item filter for create`);
      assert(
        permission.validation && Object.keys(permission.validation).length > 0,
        `${key} must validate the submitted payload`,
      );
    } else {
      assert(
        permission.permissions && Object.keys(permission.permissions).length > 0,
        `${key} must have an item filter`,
      );
    }
    assert(Array.isArray(permission.fields) && permission.fields.length > 0, `${key} has no fields`);
    assert(!permission.fields.includes("*"), `${key} cannot use wildcard fields`);
    const usesAuthenticatedIdentity =
      containsValue(authorizationRule, "$CURRENT_USER") ||
      (permission.collection === "directus_roles" &&
        containsValue(authorizationRule, "$CURRENT_ROLE")) ||
      (permission.role === "director" &&
        ((permission.collection === "directus_users" && permission.action === "create") ||
          permission.collection === "directus_roles")) ||
      (permission.action === "read" && GLOBAL_REFERENCE_COLLECTIONS.has(permission.collection));
    assert(usesAuthenticatedIdentity, `${key} is not tied to the authenticated identity`);

    if (permission.action === "update") {
      for (const field of permission.fields) {
        assert(!FORBIDDEN_WRITE_FIELDS.has(field), `${key} can mutate protected field ${field}`);
      }
    }

    permissionKeys.add(key);
  }

  const studentTestRead = PERMISSION_DEFINITIONS.find(
    ({ role, collection, action }) =>
      role === "student" && collection === "tests" && action === "read",
  );
  assert(studentTestRead, "student test read permission is required");
  assert(
    !studentTestRead.fields.includes("definition"),
    "students cannot read tests.definition because it can contain scoring material",
  );

  return {
    roles: ROLE_DEFINITIONS.length,
    policies: POLICY_DEFINITIONS.length,
    permissions: PERMISSION_DEFINITIONS.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const counts = validateManifest();
  console.log(
    `Permission manifest valid: ${counts.roles} roles, ${counts.policies} policies, ${counts.permissions} permissions.`,
  );
  if (process.argv.includes("--print-manifest")) console.log(JSON.stringify(MANIFEST, null, 2));
}
