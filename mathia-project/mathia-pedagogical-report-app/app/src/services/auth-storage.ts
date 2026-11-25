import type { AuthenticationData, AuthenticationStorage } from "@directus/sdk";

const AUTH_STORAGE_KEY = "mathia.directus.auth";
let volatileAuthenticationData: AuthenticationData | null = null;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

export function parseAuthenticationData(serialized: string): AuthenticationData | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== "object" || value === null) return null;

    const candidate = value as Partial<Record<keyof AuthenticationData, unknown>>;
    if (!isNullableString(candidate.access_token)) return null;
    if (!isNullableString(candidate.refresh_token)) return null;
    if (!isNullableNumber(candidate.expires)) return null;
    if (!isNullableNumber(candidate.expires_at)) return null;

    return {
      access_token: candidate.access_token,
      refresh_token: candidate.refresh_token,
      expires: candidate.expires,
      expires_at: candidate.expires_at,
    };
  } catch {
    return null;
  }
}

export const browserAuthenticationStorage: AuthenticationStorage = {
  get: () => {
    try {
      const serialized = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (!serialized) return volatileAuthenticationData;

      const authenticationData = parseAuthenticationData(serialized);
      if (!authenticationData) window.localStorage.removeItem(AUTH_STORAGE_KEY);
      volatileAuthenticationData = authenticationData;
      return authenticationData;
    } catch {
      return volatileAuthenticationData;
    }
  },

  set: (value) => {
    volatileAuthenticationData = value;

    try {
      if (!value || (!value.access_token && !value.refresh_token)) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Authentication remains available in the current request even when storage is restricted.
    }
  },
};
