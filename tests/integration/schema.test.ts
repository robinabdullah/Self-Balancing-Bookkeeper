import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

const sql = localSql();
afterAll(() => sql.end());

// SRS §4: every table in the data model.
const TABLES = [
  "profiles",
  "people",
  "cards",
  "card_bill_dates",
  "customers",
  "suppliers",
  "models",
  "business_profile",
  "bank_accounts",
  "card_secrets",
  "passkeys",
  "passkey_challenges",
  "purchases",
  "purchase_lines",
  "sales",
  "sale_lines",
  "returns",
  "return_lines",
  "money_entries",
  "month_closes",
  "allocations",
  "audit_log",
];

const CHECK = /violates check constraint/;

describe("database schema (task 1.3)", () => {
  it("I1.3.1 every SRS §4 table exists after the migration, with the common columns", async () => {
    const rows = await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'`;
    expect(rows.map((r) => r.tablename).sort()).toEqual([...TABLES].sort());

    const cols = await sql<{ table_name: string; n: number }[]>`
      select table_name, count(*)::int as n from information_schema.columns
      where table_schema = 'public'
        and column_name in ('id', 'created_at', 'updated_at', 'created_by')
      group by table_name`;
    for (const t of TABLES) expect(cols.find((c) => c.table_name === t)?.n, t).toBe(4);
  });

  describe("I1.3.2 CHECKs", () => {
    let personId: string, supplierId: string, modelId: string, purchaseId: string;

    beforeAll(async () => {
      [{ id: personId }] = await sql`
        insert into people (name, kind, profit_share_pct) values ('Partner A', 'partner', 50)
        returning id`;
      [{ id: supplierId }] =
        await sql`insert into suppliers (name) values ('Supplier A') returning id`;
      [{ id: modelId }] = await sql`insert into models (name) values ('Model A') returning id`;
      [{ id: purchaseId }] = await sql`
        insert into purchases (date, source) values ('2026-10-01', 'cash') returning id`;
    });

    const purchaseLine = (qty: number, unitCost: string) => sql`
      insert into purchase_lines (purchase_id, model_id, qty, unit_cost)
      values (${purchaseId}, ${modelId}, ${qty}, ${unitCost})`;
    const moneyEntry = (type: string, amount: string) => sql`
      insert into money_entries (type, date, amount, supplier_id, source, opening_kind)
      values (${type}, '2026-10-01', ${amount}, ${supplierId}, 'cash',
              ${type === "opening" ? "cash" : null})`;
    const card = (statementDay: number, dueDay = 10) => sql`
      insert into cards (name, owner_person_id, statement_day, due_day)
      values (${"Card " + randomUUID()}, ${personId}, ${statementDay}, ${dueDay})`;

    it("rejects a 0 or negative amount", async () => {
      await expect(moneyEntry("supplier_payment", "0")).rejects.toThrow(CHECK);
      await expect(moneyEntry("supplier_payment", "-5.00")).rejects.toThrow(CHECK);
      await expect(purchaseLine(1, "0")).rejects.toThrow(CHECK);
      await expect(purchaseLine(1, "-1")).rejects.toThrow(CHECK);
      await expect(moneyEntry("supplier_payment", "100.50")).resolves.toBeDefined();
    });

    it("lets opening amounts be negative but never 0", async () => {
      await expect(moneyEntry("opening", "0")).rejects.toThrow(CHECK);
      await expect(moneyEntry("opening", "-250.00")).resolves.toBeDefined();
    });

    it("rejects qty ≤ 0", async () => {
      await expect(purchaseLine(0, "100")).rejects.toThrow(CHECK);
      await expect(purchaseLine(-1, "100")).rejects.toThrow(CHECK);
      await expect(purchaseLine(1, "100")).resolves.toBeDefined();
    });

    it("rejects statement_day 32 (and 0)", async () => {
      await expect(card(32)).rejects.toThrow(CHECK);
      await expect(card(0)).rejects.toThrow(CHECK);
      await expect(card(31, 32)).rejects.toThrow(CHECK);
      await expect(card(31)).resolves.toBeDefined();
    });
  });

  it("I1.3.3 a second 'Milon' with no shop name is rejected (NULLS NOT DISTINCT)", async () => {
    await sql`insert into customers (proprietor_name) values ('Milon')`;
    await expect(sql`insert into customers (proprietor_name) values ('Milon')`).rejects.toThrow(
      /duplicate key value violates unique constraint/,
    );
    await expect(
      sql`insert into customers (proprietor_name, shop_name) values ('Milon', 'Milon Telecom')`,
    ).resolves.toBeDefined();
  });

  it("I-CR-003.1 card names are unique per owner, not across owners (D-022)", async () => {
    const owner = async (name: string) =>
      (
        await sql<{ id: string }[]>`
        insert into people (name, kind) values (${name}, 'investor') returning id`
      )[0].id;
    const [arif, babul] = [await owner("Investor R"), await owner("Investor P")];
    const brac = (ownerId: string, statementDay: number, dueDay: number) => sql`
      insert into cards (name, owner_person_id, statement_day, due_day)
      values ('Brac Visa', ${ownerId}, ${statementDay}, ${dueDay})`;

    await expect(brac(arif, 20, 8)).resolves.toBeDefined();
    await expect(brac(babul, 4, 20)).resolves.toBeDefined();
    await expect(brac(arif, 4, 20)).rejects.toThrow(
      /duplicate key value violates unique constraint/,
    );
  });

  it("I1.3.4 the anon key can read and write nothing (RLS, no policies)", async () => {
    const { url, anonKey } = localSupabase();
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    for (const t of TABLES) {
      const read = await anon.from(t).select("*");
      expect(read.error?.code === "PGRST205", `${t} missing from the API schema`).toBe(false);
      expect(read.data ?? [], t).toEqual([]);
      const write = await anon.from(t).insert({ id: randomUUID() });
      expect(write.error?.code, t).toBe("42501");
    }
    // The Walk-in row exists, so "nothing" above is RLS, not an empty table.
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from customers`;
    expect(n).toBeGreaterThan(0);
  });

  it("I1.3.5 the Walk-in exists after seeding", async () => {
    const rows = await sql`
      select proprietor_name, shop_name, active from customers where is_system`;
    expect(rows).toEqual([{ proprietor_name: "Walk-in", shop_name: null, active: true }]);
  });

  it("I-CR-016.1 the v1.1 tables keep their rules (D-036)", async () => {
    const [{ id: personId }] = await sql`
      insert into people (name, kind) values ('Investor B', 'investor') returning id`;
    const [{ id: customerId }] = await sql`
      insert into customers (proprietor_name) values ('Jamal B') returning id`;
    const account = (
      owners: { person?: string; customer?: string },
      routing: string | null = null,
    ) => sql`
      insert into bank_accounts (person_id, customer_id, bank_name, account_name, account_number,
        routing_number)
      values (${owners.person ?? null}, ${owners.customer ?? null}, 'Bank B', 'Name', '123', ${routing})`;
    await expect(account({ person: personId, customer: customerId })).rejects.toThrow(CHECK);
    await expect(account({ person: personId }, "12345")).rejects.toThrow(CHECK);
    await expect(account({ person: personId }, "123456789")).resolves.toBeDefined();
    await expect(account({})).resolves.toBeDefined(); // the business's own

    // One business row (seeded); a second is refused.
    await expect(sql`insert into business_profile (name) values ('Another')`).rejects.toThrow(
      /duplicate key value violates unique constraint/,
    );

    // A number only on a customer payment or sale that isn't a reversal.
    await expect(sql`
      insert into money_entries (type, date, amount, category, source, receipt_no)
      values ('expense', '2026-10-01', 10, 'rent', 'cash', 999001)`).rejects.toThrow(CHECK);
    const [{ id: saleId }] = await sql`
      insert into sales (date, customer_id, invoice_no) values ('2026-10-01', ${customerId}, 999001)
      returning id`;
    await expect(sql`
      insert into sales (date, customer_id, invoice_no, reverses_id)
      values ('2026-10-01', ${customerId}, 999002, ${saleId})`).rejects.toThrow(CHECK);

    const [{ id: cardId }] = await sql`
      insert into cards (name, owner_person_id, statement_day, due_day)
      values ('EBL', ${personId}, 5, 20) returning id`;
    await expect(sql`
      insert into card_secrets (card_id, number, last4) values (${cardId}, 'x', '12a4')`).rejects.toThrow(
      CHECK,
    );
    const [{ theme }] = await sql`
      select column_default as theme from information_schema.columns
      where table_name = 'profiles' and column_name = 'theme'`;
    expect(theme).toBe("'night_owl'::theme");
    await sql`delete from sales where id = ${saleId}`;
    await sql`delete from bank_accounts`;
  });
});
