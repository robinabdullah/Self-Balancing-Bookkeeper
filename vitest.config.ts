import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { LOCAL_DB_URL } from "./tests/integration/local-db";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
      // `server-only` throws outside Next's server bundle; tests import server modules directly.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    // N-1.2: tests run from the repo root; the PDF fonts are in the app (src/pdf/document.tsx).
    env: { PDF_FONT_DIR: fileURLToPath(new URL("./apps/web/src/pdf/fonts", import.meta.url)) },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/engine/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // One shared local DB: files run one at a time.
          fileParallelism: false,
          env: { DATABASE_URL: LOCAL_DB_URL },
        },
      },
    ],
  },
});
