import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// The local Supabase DB (supabase/config.toml [db] port). Integration tests never touch the cloud.
export const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

export function localSql() {
  return postgres(LOCAL_DB_URL, { max: 1, onnotice: () => {} });
}

const MIGRATIONS = "packages/db/migrations";

// Checks local Supabase is up, then applies the migrations (integration and E2E setup).
export async function migrateLocal(sql: postgres.Sql) {
  try {
    await sql`select 1`;
  } catch {
    throw new Error("Local Supabase is not running. Start it with `npx supabase start`.");
  }
  if (existsSync(`${MIGRATIONS}/meta/_journal.json`)) {
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS });
    // Let the local API (PostgREST) see new tables right away (the RLS test uses it).
    await sql`notify pgrst, 'reload schema'`;
  }
}

// Empties every app table (schema `public`) and re-seeds the Walk-in; Drizzle's migration log
// lives in schema `drizzle`. The seeded business profile (migration 0004) is kept: it is set-up,
// not test data.
export async function truncateAll(sql: postgres.Sql) {
  await sql`
    do $$
    declare tables text;
    begin
      select string_agg(format('%I.%I', schemaname, tablename), ', ') into tables
      from pg_tables where schemaname = 'public' and tablename <> 'business_profile';
      if tables is not null then
        execute 'truncate ' || tables || ' restart identity cascade';
      end if;
    end $$`;
  // Same as migration 0001: the Walk-in is part of an empty DB.
  await sql`
    insert into customers (proprietor_name, is_system) values ('Walk-in', true)
    on conflict (proprietor_name, shop_name) do nothing`;
}
