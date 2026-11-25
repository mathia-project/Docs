import { readItems, readMe } from "@directus/sdk";

import { roleFromName, type AppRole } from "../lib/roles";
import { directus } from "./directus";

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AppRole;
}

export type AuthErrorCode =
  | "invalidCredentials"
  | "unsupportedRole"
  | "profileNotProvisioned"
  | "unavailable";

export class AuthServiceError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "AuthServiceError";
    this.code = code;
  }
}

interface DirectusUserSnapshot {
  id?: unknown;
  email?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  role?: unknown;
}

function asOptionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function roleNameFromValue(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("name" in value)) return null;
  return typeof value.name === "string" ? value.name : null;
}

function toAuthUser(value: unknown): AuthUser {
  if (typeof value !== "object" || value === null) {
    throw new AuthServiceError("unavailable");
  }

  const snapshot = value as DirectusUserSnapshot;
  const id = asOptionalString(snapshot.id);
  const email = asOptionalString(snapshot.email);
  const roleName = roleNameFromValue(snapshot.role);
  const role = roleName ? roleFromName(roleName) : null;

  if (!id || !email) throw new AuthServiceError("unavailable");
  if (!role) throw new AuthServiceError("unsupportedRole");

  return {
    id,
    email,
    firstName: asOptionalString(snapshot.first_name),
    lastName: asOptionalString(snapshot.last_name),
    role,
  };
}

function errorCodeFromDirectus(error: unknown): AuthErrorCode {
  if (typeof error !== "object" || error === null) return "unavailable";

  const responseStatus =
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "status" in error.response
      ? error.response.status
      : null;

  return responseStatus === 400 || responseStatus === 401 ? "invalidCredentials" : "unavailable";
}

async function hasActiveStudentProfile(userId: string): Promise<boolean> {
  const profiles = await directus.request(
    readItems("student_profiles", {
      fields: ["id"],
      filter: {
        directus_user_id: { _eq: userId },
        active: { _eq: true },
        school_id: { active: { _eq: true } },
      },
      limit: 1,
    }),
  );

  return profiles.length > 0;
}

async function hasActiveTeacherProfile(userId: string): Promise<boolean> {
  const profiles = await directus.request(
    readItems("teacher_profiles", {
      fields: ["id"],
      filter: {
        directus_user_id: { _eq: userId },
        active: { _eq: true },
        school_id: { active: { _eq: true } },
      },
      limit: 1,
    }),
  );

  return profiles.length > 0;
}

async function assertActiveProfile(user: AuthUser): Promise<void> {
  const profileExists =
    user.role === "student"
      ? await hasActiveStudentProfile(user.id)
      : await hasActiveTeacherProfile(user.id);

  if (!profileExists) throw new AuthServiceError("profileNotProvisioned");
}

async function getCurrentUser(): Promise<AuthUser> {
  const currentUser = await directus.request(
    readMe({
      fields: ["id", "email", "first_name", "last_name", { role: ["id", "name"] }],
    }),
  );

  const user = toAuthUser(currentUser);
  await assertActiveProfile(user);
  return user;
}

export const authService = {
  getCurrentUser,

  async signIn(credentials: AuthCredentials): Promise<AuthUser> {
    try {
      await directus.login({
        email: credentials.email.trim(),
        password: credentials.password,
      });
      return await getCurrentUser();
    } catch (error) {
      if (error instanceof AuthServiceError) {
        if (error.code === "unsupportedRole" || error.code === "profileNotProvisioned") {
          await directus.setToken(null);
        }
        throw error;
      }
      throw new AuthServiceError(errorCodeFromDirectus(error), { cause: error });
    }
  },

  async signOut(): Promise<void> {
    try {
      await directus.logout();
    } finally {
      await directus.setToken(null);
    }
  },
};
