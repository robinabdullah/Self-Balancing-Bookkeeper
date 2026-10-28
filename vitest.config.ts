import { fileURLToPath } from "node:url";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";
import { LOCAL_DB_URL, LOCAL_SUPABASE_URL } from "./tests/integration/local-db";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
      // `server-only` throws outside Next's server bundle; tests import server modules directly.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/engine/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        // N-2.2: Nest's DI needs decorator metadata, which esbuild doesn't emit; swc does.
        plugins: [
          swc.vite({
            jsc: {
              parser: { syntax: "typescript", tsx: true, decorators: true },
              transform: {
                legacyDecorator: true,
                decoratorMetadata: true,
                react: { runtime: "automatic" },
              },
              target: "es2022",
            },
          }),
        ],
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // One shared local DB: files run one at a time.
          fileParallelism: false,
          env: { DATABASE_URL: LOCAL_DB_URL, SUPABASE_URL: LOCAL_SUPABASE_URL },
        },
      },
    ],
  },
});
