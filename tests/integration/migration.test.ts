import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOCAL_DB_URL, localSql } from "./local-db";

// CR-016.1 (D-036): the v1.1 migration on a copy of the schema as it is in production (0000–0002)
// holding synthetic rows: it numbers the existing sales and customer payments in (date,
// created_at) order without the reversals, sets the sequences after them, seeds the business and
// lets one owner's "EBL" be both a Visa and a Mastercard. A throwaway database on local Supabase.
const MIGRATIONS = "apps/web/src/db/migrations";
const name = `mbl_migration_${randomUUID().replaceAll("-", "")}`;
const admin = localSql();
let sql: postgres.Sql;
let before: string; // migrations 0000–0002 only

const migrateFrom = (folder: string) => migrate(drizzle(sql), { migrationsFolder: folder });

beforeAll(async () => {
  await admin.unsafe(`create database ${name}`);
  sql = postgres(LOCAL_DB_URL.replace(/\/postgres$/, `/${name}`), { max: 1, onnotice: () => {} });
  // Supabase's auth.users, as far as the schema needs it.
  await sql`create schema auth`;
  await sql`create table auth.users (id uuid primary key)`;
  before = mkdtempSync(join(tmpdir(), "mbl-migrations-"));
  cpSync(MIGRATIONS, before, { recursive: true });
  const journal = JSON.parse(readFileSync(join(before, "meta/_journal.json"), "utf8"));
  journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 2);
  writeFileSync(join(before, "meta/_journal.json"), JSON.stringify(journal));
});

afterAll(async () => {
  await sql?.end();
  await admin.unsafe(`drop database if exists ${name} with (force)`);
  await admin.end();
  if (before) rmSync(before, { recursive: true, force: true });
});

describe("the v1.1 migration (CR-016.1, D-036)", () => {
  it("I-CR-016.1 applies on the current schema, backfills the numbers and seeds the business", async () => {
    await migrateFrom(before);
    const [{ id: arif }] = await sql`
      insert into people (name, kind, profit_share_pct) values ('Arif', 'partner', 100)
      returning id`;
    const [{ id: jamal }] = await sql`
      insert into customers (proprietor_name) values ('Jamal') returning id`;
    await sql`insert into cards (name, owner_person_id, statement_day, due_day)
      values ('EBL Visa', ${arif}, 5, 20), ('EBL Master', ${arif}, 5, 20)`;
    const [s1, s2, sr, p1, p2, pr, e] = Array.from({ length: 7 }, () => randomUUID());
    // s2 is dated before s1 though saved after it; sr reverses s1.
    await sql`insert into sales (id, date, customer_id, created_at) values
      (${s1}, '2026-09-02', ${jamal}, now() - interval '2 hours'),
      (${s2}, '2026-09-01', ${jamal}, now() - interval '1 hour')`;
    await sql`insert into sales (id, date, customer_id, reverses_id)
      values (${sr}, '2026-09-03', ${jamal}, ${s1})`;
    await sql`insert into money_entries (id, type, date, amount, customer_id) values
      (${p1}, 'customer_payment', '2026-09-05', 100, ${jamal}),
      (${p2}, 'customer_payment', '2026-09-04', 100, ${jamal})`;
    await sql`insert into money_entries (id, type, date, amount, customer_id, reverses_id)
      values (${pr}, 'customer_payment', '2026-09-06', 100, ${jamal}, ${p1})`;
    await sql`insert into money_entries (id, type, date, amount, category, source, for_month)
      values (${e}, 'expense', '2026-09-01', 50, 'rent', 'cash', '2026-09-01')`;

    await migrateFrom(MIGRATIONS);

    const sales = await sql`select id, invoice_no from sales`;
    const no = (rows: typeof sales, id: string, col: string) =>
      rows.find((r) => r.id === id)?.[col];
    expect([s2, s1, sr].map((id) => no(sales, id, "invoice_no"))).toEqual([1, 2, null]);
    const money = await sql`select id, receipt_no from money_entries`;
    expect([p2, p1, pr, e].map((id) => no(money, id, "receipt_no"))).toEqual([1, 2, null, null]);
    const [next] = await sql`select nextval('sales_invoice_no_seq')::int as invoice,
      nextval('money_entries_receipt_no_seq')::int as receipt`;
    expect(next).toEqual({ invoice: 3, receipt: 3 });

    // The cards keep their names (Type None) until the approved rename; then one owner's "EBL"
    // can be a Visa and a Mastercard.
    expect(await sql`select name, network from cards order by name`).toEqual([
      { name: "EBL Master", network: "none" },
      { name: "EBL Visa", network: "none" },
    ]);
    await sql`update cards set name = 'EBL', network = 'visa' where name = 'EBL Visa'`;
    await expect(
      sql`update cards set name = 'EBL', network = 'mastercard' where name = 'EBL Master'`,
    ).resolves.toBeDefined();

    const business = await sql`select name, phones, left(logo, 22) as logo from business_profile`;
    expect(business).toEqual([
      {
        name: "Demo Business Shop",
        phones: "01700000001, 01800000001",
        logo: "data:image/png;base64,",
      },
    ]);
    const [{ actions }] = await sql`
      select array_agg(e.enumlabel::text order by e.enumsortorder) as actions
      from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'audit_action'`;
    expect(actions).toContain("reveal");
  });
});
