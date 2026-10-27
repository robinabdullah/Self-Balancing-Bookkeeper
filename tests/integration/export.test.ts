import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@mbl/db/schema";
import { addMonths, dhakaToday, monthOf } from "@mbl/domain/dates";
import { add, avgUnit, sub } from "@mbl/domain/money";
import { type Books, computeBooks } from "@mbl/domain/engine/index";
import type { Result } from "@mbl/domain/result";
import { loadBooksData } from "@/server/books";
import { exportWorkbook, lastExport } from "@/server/export";
import { expectBalanced } from "../engine/invariant";
import { partnerApi } from "./api";
import { localSql } from "./local-db";

// Task 6.4 (PRD §4.7, SRS §10, D-017): the export workbook has a sheet per table plus the summary
// sheets; amounts are numbers; each summary total equals `computeBooks`; each export writes an
// `export` audit row. The export's session is stood in for as in action.test.ts; N-3.6: the
// close goes through the api (the facade), as the same partner. Synthetic data only (D-014).
// Amounts in SQL are taka, as the DB stores them.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
let api: Awaited<ReturnType<typeof partnerApi>>;
const closeMonth = (input: unknown) => api.closeMonth(input);
let userId = "";

const today = dhakaToday();
const M1 = addMonths(monthOf(today), -1);
const d = (day: string) => `${M1}-${day}`;
const ids = {
  arif: randomUUID(),
  sumon: randomUUID(),
  ivy: randomUUID(),
  customer: randomUUID(),
  supplier: randomUUID(),
  card: randomUUID(),
  model: randomUUID(),
  cardBuy: randomUUID(),
  lot1: randomUUID(),
  creditBuy: randomUUID(),
  lot2: randomUUID(),
  sale: randomUUID(),
};

const SUMMARIES = ["Cash", "Stock", "Customers", "Suppliers", "Cards", "People", "Months"];
// Never exported: card details and passkeys (D-036).
const SECRET = ["card_secrets", "passkeys", "passkey_challenges"];
const TABLES = Object.values(schema)
  .filter((t) => is(t, PgTable))
  .map((t) => getTableName(t as PgTable))
  .filter((t) => !SECRET.includes(t))
  .map((t) => `${t} (raw)`);

let wb: ExcelJS.Workbook;
let books: Books;

/** A sheet's rows as header → value objects (row 1 = headers). */
function rows(name: string): Record<string, ExcelJS.CellValue>[] {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`no sheet ${name}`);
  const headers = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(String);
  const out: Record<string, ExcelJS.CellValue>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const values = (row.values as ExcelJS.CellValue[]).slice(1);
    out.push(Object.fromEntries(headers.map((h, i) => [h, values[i] ?? null])));
  });
  return out;
}

/** A money cell (taka, a number) as poisha. */
function poisha(value: ExcelJS.CellValue): number {
  expect(typeof value).toBe("number");
  return Math.round((value as number) * 100);
}

const total = (name: string) => rows(name).find((r) => Object.values(r)[0] === "Total")!;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

beforeAll(async () => {
  api = await partnerApi(sql, "Partner A");
  userId = api.user.userId;
  getUser.mockResolvedValue({ id: userId });
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50),
    (${ids.ivy}, 'Ivy', 'investor', null)`;
  await sql`insert into customers (id, proprietor_name, shop_name, target_balance)
    values (${ids.customer}, 'Jamal', 'Test Telecom', 100000)`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, 'Supplier S')`;
  await sql`insert into cards (id, name, owner_person_id, statement_day, due_day, credit_limit)
    values (${ids.card}, 'Visa', ${ids.arif}, 10, 25, 200000)`;
  await sql`insert into models (id, name) values (${ids.model}, 'Model V')`;
  // Saved details (D-036): a bank account is exported; card details never are (synthetic values).
  await sql`insert into bank_accounts (customer_id, bank_name, account_name, account_number)
    values (${ids.customer}, 'Bank B', 'Jamal', '0001112223')`;
  await sql`insert into card_secrets (card_id, number, cvv, last4)
    values (${ids.card}, 'SECRET-CIPHERTEXT', 'SECRET-CVV', '4242')`;
  // CR-026 (D-046): fingerprint keys and challenges never leave either.
  await sql`insert into passkeys (user_id, credential_id, public_key, device_name)
    values (${userId}, 'SECRET-CREDENTIAL', 'SECRET-PUBLIC-KEY', 'SECRET-DEVICE')`;
  await sql`insert into passkey_challenges (user_id, challenge, expires_at)
    values (${userId}, 'SECRET-CHALLENGE', now() + interval '2 minutes')`;

  // M1: 500,000 opening cash = Arif's capital; a card purchase (2 × 15,000) and a supplier
  // credit purchase (1 × 20,000); 2 units sold to Jamal at 18,000 (profit 6,000); he pays 10,000;
  // rent 1,000 in cash. Closing M1 splits 5,000 → 2,500 profit owed to each partner.
  await sql`insert into money_entries (type, date, amount, opening_kind, person_id) values
    ('opening', ${d("01")}, 500000, 'cash', null),
    ('opening', ${d("01")}, 500000, 'capital', ${ids.arif})`;
  await sql`insert into purchases (id, date, source, card_id) values
    (${ids.cardBuy}, ${d("05")}, 'card', ${ids.card})`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost, imei_note)
    values (${ids.lot1}, ${ids.cardBuy}, ${ids.model}, 3, 15000, 'IMEI 1')`;
  await sql`insert into purchases (id, date, source, supplier_id) values
    (${ids.creditBuy}, ${d("06")}, 'supplier_credit', ${ids.supplier})`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${ids.lot2}, ${ids.creditBuy}, ${ids.model}, 1, 20000)`;
  await sql`insert into sales (id, date, customer_id) values (${ids.sale}, ${d("10")}, ${ids.customer})`;
  await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price)
    values (${ids.sale}, ${ids.lot1}, 2, 18000)`;
  await sql`insert into money_entries (type, date, amount, customer_id) values
    ('customer_payment', ${d("12")}, 10000, ${ids.customer})`;
  await sql`insert into money_entries (type, date, amount, category, source, for_month) values
    ('expense', ${d("15")}, 1000, 'rent', 'cash', ${d("01")})`;
  const closed: Result = await closeMonth({ id: randomUUID(), month: M1 });
  if (closed.status !== "ok") throw new Error(JSON.stringify(closed));
  // This month: Ivy brings 50,000 of capital.
  await sql`insert into money_entries (type, date, amount, person_id) values
    ('capital_in', ${today}, 50000, ${ids.ivy})`;

  const facts = await loadBooksData();
  books = computeBooks(facts, today);
  expectBalanced(books.posted, today, facts.allocations, facts.closed);

  wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await exportWorkbook(userId, today));
});

afterAll(async () => {
  await api.close();
  await sql.end();
});

describe("I6.4.1 export workbook", () => {
  it("I6.4.1 has every summary sheet and one raw sheet per table", () => {
    const names = wb.worksheets.map((w) => w.name);
    expect(TABLES.length).toBe(19);
    expect(names).toEqual([...SUMMARIES, ...TABLES]);
  });

  it("I6.4.1 writes amounts as numbers in the raw sheets", () => {
    const money = rows("money_entries (raw)");
    expect(money.length).toBe(5);
    for (const r of money) expect(typeof r.amount).toBe("number");
    expect(rows("purchase_lines (raw)").map((r) => r.unit_cost)).toEqual(
      expect.arrayContaining([15000, 20000]),
    );
    expect(rows("sale_lines (raw)")[0].unit_price).toBe(18000);
    expect(rows("allocations (raw)").map((r) => r.amount)).toEqual([2500, 2500]);
    expect(rows("people (raw)").find((r) => r.name === "Arif")?.profit_share_pct).toBe(50);
  });

  it("I6.4.1 summary totals equal computeBooks (books-balance invariant)", () => {
    expect(books.invariant.difference).toBe(0);
    const cash = Object.fromEntries(
      rows("Cash")
        .filter((r) => r.Amount != null) // a section title has no amount
        .map((r) => [r.Line, poisha(r.Amount)]),
    );
    expect(cash["Cash"]).toBe(books.cash);
    expect(cash["Stock at cost"]).toBe(books.stock);
    expect(cash["Customers owe"]).toBe(books.customerDues);
    expect(cash["Card balances"]).toBe(-books.cardBalances);
    expect(cash["We owe suppliers"]).toBe(-books.supplierDues);
    // I-CR-039.1 (D-064): the Books balance sheet's rows; Net worth = Whose it is's Total.
    expect(rows("Cash").map((r) => r.Line)).toEqual([
      "What we have",
      "Cash",
      "Stock at cost",
      "Customers owe",
      "Business assets",
      "What we owe",
      "Card balances",
      "We owe suppliers",
      "Total we owe",
      "Net worth",
      "Whose it is",
      "Capital",
      "Opening difference",
      "Profit owed",
      "Undistributed profit",
      "Total",
      "Difference (0 = balanced)",
    ]);
    expect(cash["Business assets"]).toBe(add(add(books.cash, books.stock), books.customerDues));
    expect(cash["Total we owe"]).toBe(sub(0 - books.cardBalances, books.supplierDues));
    expect(cash["Net worth"]).toBe(books.invariant.netAssets);
    expect(cash["Net worth"]).toBe(books.invariant.equity);
    expect(cash["Total"]).toBe(books.invariant.equity);
    expect(cash["Difference (0 = balanced)"]).toBe(0);

    expect(poisha(total("Stock").Value)).toBe(books.stock);
    expect(total("Stock").Left).toBe(2);
    // I-CR-038.1 (D-063): each lot row carries its model's avg cost of the units left; the Total
    // row leaves it blank.
    const lotRows = rows("Stock").filter((r) => r.Model !== "Total");
    for (const r of lotRows) {
      const mine = lotRows.filter((o) => o.Model === r.Model);
      const left = sum(mine.map((o) => Number(o.Left)));
      const value = sum(mine.map((o) => poisha(o.Value)));
      expect(poisha(r["Model avg cost"])).toBe(avgUnit(value, left));
    }
    expect(lotRows.length).toBeGreaterThan(0);
    expect(total("Stock")["Model avg cost"] ?? null).toBeNull();
    expect(poisha(total("Customers").Due)).toBe(books.customerDues);
    expect(poisha(total("Suppliers")["We owe"])).toBe(books.supplierDues);
    expect(poisha(total("Cards").Balance)).toBe(books.cardBalances);
    const people = total("People");
    expect(poisha(people.Capital)).toBe(sum(Object.values(books.capital)));
    expect(poisha(people["Opening difference"])).toBe(books.openingDifference.total);
    expect(poisha(people["Profit owed"])).toBe(sum(Object.values(books.profitOwed)));
    expect(poisha(total("Months").Profit)).toBe(sum(books.months.map((m) => m.profit)));

    // The synthetic scenario's own numbers (taka): nothing is silently zero.
    expect(books.stock).toBe(3_500_000); // 1 × 15,000 + 1 × 20,000
    expect(books.customerDues).toBe(2_600_000);
    expect(rows("Months").find((r) => r.Month === M1)).toMatchObject({
      Profit: 5000,
      Status: "Closed",
    });
  });

  it("I-CR-016.3 / I-CR-026.4 has the business and bank accounts, never the card details or passkeys", () => {
    const names = wb.worksheets.map((w) => w.name);
    for (const t of SECRET) expect(names).not.toContain(`${t} (raw)`);
    const [business] = rows("business_profile (raw)");
    expect(business.name).toBe("Demo Business Shop");
    expect(business).not.toHaveProperty("logo"); // longer than an Excel cell holds
    // CR-029 (D-049): each document's terms go into the backup too.
    for (const c of ["invoice_terms", "receipt_terms", "statement_terms", "footer"])
      expect(business).toHaveProperty(c);
    expect(rows("bank_accounts (raw)")).toMatchObject([
      { customer_id: ids.customer, bank_name: "Bank B", account_number: "0001112223" },
    ]);
    const cells = wb.worksheets.flatMap((ws) => ws.getSheetValues().flat().map(String));
    expect(cells.some((c) => c.includes("SECRET"))).toBe(false);
  });

  it("I6.4.1 records the export in the audit log (D-017)", async () => {
    const audit = await sql`select row_id, user_id from audit_log where action = 'export'`;
    expect(audit).toEqual([{ row_id: null, user_id: userId }]);
    const last = await lastExport();
    expect(last?.by).toBe("Partner A");
  });
});
