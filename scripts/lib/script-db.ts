// The one-off scripts' DB client (D-066). `.env.local` is local Supabase; production keys live in
// `.env.prod`, and a non-local DATABASE_URL is refused unless CONFIRM_PROD=1 is set for that run
// (only after the user's OK). The check runs before any connection. In PowerShell the flag stays
// set for the window, so clear it after the run:
//   $env:CONFIRM_PROD=1; npx tsx --env-file=.env.prod scripts/…; Remove-Item Env:CONFIRM_PROD
import postgres from "postgres";

const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

export function scriptDbUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (use --env-file)");
  if (!LOCAL_HOSTS.includes(new URL(url).hostname) && env.CONFIRM_PROD !== "1")
    throw new Error(
      "DATABASE_URL is not local. Re-run with CONFIRM_PROD=1 only after the user's OK for this run.",
    );
  return url;
}

export const scriptDb = () => postgres(scriptDbUrl(), { prepare: false, onnotice: () => {} });
