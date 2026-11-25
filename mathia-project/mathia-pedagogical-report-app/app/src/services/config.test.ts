import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("API configuration", () => {
  it("uses portable runtime URLs before the build-time addresses", async () => {
    vi.stubEnv("VITE_DIRECTUS_URL", "http://localhost:8055");
    vi.stubGlobal("window", {
      __MATHIA_CONFIG__: {
        directusUrl: "https://api.school.example/",
        aiServiceUrl: "https://ai.school.example/",
      },
    });
    const { appConfig } = await import("./config");
    expect(appConfig.directusUrl).toBe("https://api.school.example");
    expect(appConfig.aiServiceUrl).toBe("https://ai.school.example");
  });

  it("keeps build-time configuration when no snapshot override is supplied", async () => {
    vi.stubGlobal("window", {});
    vi.stubEnv("VITE_DIRECTUS_URL", "https://existing.example/");
    vi.stubEnv("VITE_AI_SERVICE_URL", "https://existing-ai.example/");
    const { appConfig } = await import("./config");
    expect(appConfig.directusUrl).toBe("https://existing.example");
    expect(appConfig.aiServiceUrl).toBe("https://existing-ai.example");
  });
});
