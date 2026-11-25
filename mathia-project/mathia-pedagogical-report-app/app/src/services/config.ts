const DEFAULT_DIRECTUS_URL = "http://localhost:8055";
const DEFAULT_AI_SERVICE_URL = "http://localhost:8000";

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  return candidate.replace(/\/+$/, "");
}

export const appConfig = Object.freeze({
  directusUrl: normalizeBaseUrl(
    globalThis.window?.__MATHIA_CONFIG__?.directusUrl ?? import.meta.env.VITE_DIRECTUS_URL,
    DEFAULT_DIRECTUS_URL,
  ),
  aiServiceUrl: normalizeBaseUrl(
    globalThis.window?.__MATHIA_CONFIG__?.aiServiceUrl ?? import.meta.env.VITE_AI_SERVICE_URL,
    DEFAULT_AI_SERVICE_URL,
  ),
  schoolName: globalThis.window?.__MATHIA_CONFIG__?.schoolName?.trim() || "",
  schoolCode: globalThis.window?.__MATHIA_CONFIG__?.schoolCode?.trim() || "MATH001",
});
