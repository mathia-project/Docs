import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [solid(), tailwindcss(), {
    name: "local-report-examples",
    // configureServer is dev-only: fictional artifacts are never copied to dist.
    configureServer(server) {
      server.middlewares.use("/__report-examples", async (request, response) => {
        const name = request.url?.slice(1) ?? "";
        if (!/^(short|long|empty)-(en|es)\.(json|pdf)$/.test(name)) {
          response.statusCode = 404;
          response.end();
          return;
        }
        try {
          const path = fileURLToPath(new URL(`../output/pdf/${name}`, import.meta.url));
          const content = await readFile(path);
          response.setHeader("Content-Type", name.endsWith("pdf") ? "application/pdf" : "application/json");
          response.setHeader("Cache-Control", "no-store");
          response.end(content);
        } catch {
          response.statusCode = 404;
          response.end();
        }
      });
    },
  }],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    target: "es2022",
  },
});
