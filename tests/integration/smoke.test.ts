import { afterAll, describe, expect, it } from "vitest";
import { LOCAL_DB_URL, localSql } from "./local-db";

const sql = localSql();
afterAll(() => sql.end());

describe("integration tooling", () => {
  it("points DATABASE_URL at the local Supabase DB", () => {
    expect(process.env.DATABASE_URL).toBe(LOCAL_DB_URL);
  });

  it("reaches local Postgres with the app tables empty (except the seeded Walk-in and business)", async () => {
    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'`;
    for (const { tablename } of tables) {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(tablename)}`;
      expect(n, tablename).toBe(["customers", "business_profile"].includes(tablename) ? 1 : 0);
    }
  });
});
