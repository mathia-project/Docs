import { authentication, createDirectus, rest } from "@directus/sdk";

import { appConfig } from "./config";
import { browserAuthenticationStorage } from "./auth-storage";
import type { AppSchema } from "./schema";

export const directus = createDirectus<AppSchema>(appConfig.directusUrl)
  .with(
    authentication("json", {
      autoRefresh: true,
      credentials: "include",
      storage: browserAuthenticationStorage,
    }),
  )
  .with(
    rest({
      credentials: "include",
    }),
  );
