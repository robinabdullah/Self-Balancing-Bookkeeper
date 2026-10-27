import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Reads DATABASE_URL from .env.local (needed by `migrate`; `generate` works without it). On the
// laptop that is local Supabase; on the VPS it is production (D-066).
loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "./apps/web/src/db/schema.ts",
  out: "./apps/web/src/db/migrations",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
