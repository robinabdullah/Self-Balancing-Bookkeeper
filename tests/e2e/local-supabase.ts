import { execSync } from "node:child_process";

// Reads the local Supabase URL/keys from `supabase status` once; the env copy is shared with
// Playwright workers, so they don't re-run the CLI.
export function localSupabase() {
  if (!process.env.E2E_SUPABASE_URL) {
    let out: string;
    try {
      out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: "pipe" });
    } catch {
      throw new Error("Local Supabase is not running. Start it with `npx supabase start`.");
    }
    const vars = Object.fromEntries(
      [...out.matchAll(/^([A-Z_]+)="?([^"\r\n]*)"?\r?$/gm)].map((m) => [m[1], m[2]]),
    );
    process.env.E2E_SUPABASE_URL = vars.API_URL;
    process.env.E2E_SUPABASE_ANON_KEY = vars.ANON_KEY;
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = vars.SERVICE_ROLE_KEY;
    process.env.E2E_DATABASE_URL = vars.DB_URL;
  }
  return {
    url: process.env.E2E_SUPABASE_URL!,
    anonKey: process.env.E2E_SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    dbUrl: process.env.E2E_DATABASE_URL!,
  };
}
