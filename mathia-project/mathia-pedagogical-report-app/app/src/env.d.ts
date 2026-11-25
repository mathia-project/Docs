/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DIRECTUS_URL?: string;
  readonly VITE_AI_SERVICE_URL?: string;
  readonly VITE_DEFAULT_LOCALE?: "en" | "es" | "it";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __MATHIA_CONFIG__?: {
    directusUrl?: string;
    aiServiceUrl?: string;
    schoolName?: string;
    schoolCode?: string;
  };
}
