import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { addMonths, dhakaToday, formatMonth, monthOf } from "@/lib/dates";
import { type Effect, type Partner, type PurchaseEntry, postEntry } from "@/lib/engine/post";
import { parse } from "@/lib/money";
import { deletePurchase, savePurchase } from "@/server/actions/purchase";
import { expectBalanced, posted } from "../engine/invariant";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// Task 3.4 (PRD §4.2; SRS §4 purchases, §5, §8; UIDD §4.3; D-009). The session and
// `revalidatePath` are stood in for as in action.test.ts. Synthetic data only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
let userId = "";

const today = dhakaToday();
const ids = {
  arif: randomUUID(),
  sumon: randomUUID(),
  card: randomUUID(),
  supplier: randomUUID(),
  customer: randomUUID(),
  model: randomUUID(),
  model2: randomUUID(),
};
const partners: Partner[] = [
  { id: ids.sumon, pct: 50 },
  { id: ids.arif, pct: 50 },
];

const TABLES = "purchases, purchase_lines, sales, sale_lines, returns, return_lines";

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `purchase-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  await sql`insert into profiles (user_id, name, role) values (${userId}, 'Partner A', 'partner')`;
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50)`;
  await sql`insert into cards (id, owner_person_id, name, statement_day, due_day)
    values (${ids.card}, ${ids.arif}, 'Test Visa', 5, 20)`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, 'Test Supplier')`;
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.customer}, 'Jamal', 'Test Telecom')`;
  await sql`insert into models (id, name) values (${ids.model}, 'Model A'), (${ids.model2}, 'Model B')`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql.unsafe(`truncate ${TABLES}, audit_log, month_closes`);
});

afterAll(async () => {
  await sql.unsafe(`truncate ${TABLES}, audit_log, month_closes, cards, suppliers, models cascade`);
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
  await sql`delete from profiles where user_id = ${userId}`;
  await admin.auth.admin.deleteUser(userId);
  await sql.end();
  await db.$client.end();
});

/** The form's values (text, as FormData sends them); lines nest as `lines.0.qty` or an array. */
const purchase = (over: object = {}) => ({
  id: randomUUID(),
  date: today,
  source: "cash",
  note: "",
  lines: [
    { id: randomUUID(), modelId: ids.model, qty: "2", unitCost: "15,250.50", imeiNote: "" },
    { id: randomUUID(), modelId: ids.model2, qty: "1", unitCost: "15,250", imeiNote: "IMEI 1" },
  ],
  ...over,
});
const T = parse("45,751")!; // 2 × 15,250.50 + 1 × 15,250

async function saved(result: Awaited<ReturnType<typeof savePurchase>>) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result;
}

/** The stored purchases as engine entries (the same mapping the 4.1 loader will do). */
async function stored(): Promise<(PurchaseEntry & { id: string; createdAt: string })[]> {
  // Dates as text, as the app's Drizzle client reads them.
  const rows = await sql`select id, created_at, date::text, source, supplier_id, card_id,
    customer_id, emi_months, bill_month_override::text, reverses_id from purchases
    order by created_at`;
  const lines = await sql`select * from purchase_lines order by created_at`;
  return rows.map((p) => ({
    table: "purchase",
    id: p.id,
    createdAt: p.created_at.toISOString(),
    date: p.date,
    source: p.source,
    supplierId: p.supplier_id,
    cardId: p.card_id,
    customerId: p.customer_id,
    emiMonths: p.emi_months,
    billMonthOverride: p.bill_month_override,
    reversesId: p.reverses_id,
    lines: lines
      .filter((l) => l.purchase_id === p.id)
      .map((l) => ({ qty: l.qty, unitCost: parse(l.unit_cost)! })),
  }));
}

/** The effects of the stored purchase `id`, and the invariant over everything stored. */
async function effectsOf(id: string): Promise<Effect[]> {
  const entries = await stored();
  expectBalanced(entries.map((e) => posted(e, partners)));
  return postEntry(
    entries.find((e) => e.id === id)!,
    partners,
  );
}

describe("Purchase actions (task 3.4)", () => {
  it("I3.4.1 each source posts as in SRS §5; the invariant holds", async () => {
    const cash = purchase();
    await saved(await savePurchase(cash));
    expect(await effectsOf(cash.id)).toEqual([
      { account: "stock", amount: T },
      { account: "cash", amount: -T },
    ]);
    // Each line is a lot at its unit cost.
    const lots = await sql`select model_id, qty, unit_cost, imei_note from purchase_lines
      where purchase_id = ${cash.id} order by unit_cost desc`;
    expect(lots.map((l) => [l.model_id, l.qty, l.unit_cost, l.imei_note])).toEqual([
      [ids.model, 2, "15250.50", null],
      [ids.model2, 1, "15250.00", "IMEI 1"],
    ]);

    // Card with EMI and a bill-month override: the full T on the card at once.
    const month = monthOf(today);
    const card = purchase({
      source: "card",
      cardId: ids.card,
      emiMonths: "3",
      billMonthOverride: month,
      supplierId: ids.supplier,
    });
    await saved(await savePurchase(card));
    expect(await effectsOf(card.id)).toEqual([
      { account: "stock", amount: T },
      { account: "card", amount: T, id: ids.card },
    ]);
    const [c] =
      await sql`select emi_months, bill_month_override::text from purchases where id = ${card.id}`;
    expect(c).toEqual({ emi_months: 3, bill_month_override: `${month}-01` });

    const credit = purchase({ source: "supplier_credit", supplierId: ids.supplier });
    await saved(await savePurchase(credit));
    expect(await effectsOf(credit.id)).toEqual([
      { account: "stock", amount: T },
      { account: "supplier_due", amount: T, id: ids.supplier },
    ]);

    // Against a customer's due: the stray card id is dropped.
    const offset = purchase({
      source: "customer_offset",
      customerId: ids.customer,
      cardId: ids.card,
    });
    await saved(await savePurchase(offset));
    expect(await effectsOf(offset.id)).toEqual([
      { account: "stock", amount: T },
      { account: "customer_due", amount: -T, id: ids.customer },
    ]);
    const [o] = await sql`select card_id from purchases where id = ${offset.id}`;
    expect(o.card_id).toBeNull();

    // Opening correction (a missed lot): D = +T, split between the partners.
    const missed = purchase({ source: "opening_correction" });
    await saved(await savePurchase(missed));
    expect(await effectsOf(missed.id)).toEqual([
      { account: "stock", amount: T },
      { account: "opening_diff", amount: T / 2, id: ids.sumon },
      { account: "opening_diff", amount: T / 2, id: ids.arif },
    ]);

    // Required picks; Walk-in can't be used against a due (D-009); nothing more is written.
    const [walkIn] = await sql`select id from customers where is_system`;
    expect(await savePurchase(purchase({ source: "supplier_credit" }))).toEqual({
      status: "invalid",
      errors: { supplierId: "Pick a supplier" },
    });
    expect(await savePurchase(purchase({ source: "card" }))).toEqual({
      status: "invalid",
      errors: { cardId: "Pick a card" },
    });
    expect(
      await savePurchase(purchase({ source: "customer_offset", customerId: walkIn.id })),
    ).toEqual({
      status: "invalid",
      errors: { customerId: "Walk-in can't be used here — pick a customer" },
    });
    expect(await savePurchase(purchase({ source: "opening" }))).toMatchObject({
      status: "invalid",
      errors: { source: "Choose how it was paid" },
    });
    expect(await savePurchase(purchase({ lines: [] }))).toEqual({
      status: "invalid",
      errors: { lines: "Add at least one line" },
    });
    // A line's error lands on its field, named as the form names it.
    const bad = purchase();
    bad.lines[1].unitCost = "0";
    expect(await savePurchase(bad)).toEqual({
      status: "invalid",
      errors: { "lines.1.unitCost": "Amount must be more than 0" },
    });
    expect(await sql`select id from purchases`).toHaveLength(5);

    // The audit row has the header and its lines.
    const [audit] = await sql`select after from audit_log where row_id = ${cash.id}`;
    expect(audit.after.lines).toHaveLength(2);
  });

  it("3.4 the form's flat FormData (lines.0.qty …) is accepted as is", async () => {
    const p = purchase();
    const flat: Record<string, string> = { id: p.id, date: p.date, source: "cash", note: "" };
    p.lines.forEach((l, i) => {
      for (const [k, v] of Object.entries(l)) flat[`lines.${i}.${k}`] = v;
    });
    await saved(await savePurchase(flat));
    expect(await effectsOf(p.id)).toEqual([
      { account: "stock", amount: T },
      { account: "cash", amount: -T },
    ]);
  });

  it("3.4 a similar purchase (same date, source, counterparty, total) → the duplicate warning", async () => {
    const first = purchase({ source: "supplier_credit", supplierId: ids.supplier });
    await saved(await savePurchase(first));
    const again = purchase({ source: "supplier_credit", supplierId: ids.supplier });
    expect(await savePurchase(again)).toMatchObject({
      status: "duplicate",
      id: first.id,
      by: "Partner A",
    });
    await saved(await savePurchase({ ...again, confirmDuplicate: true }));
    // Another total is not a duplicate.
    const other = purchase({ source: "supplier_credit", supplierId: ids.supplier });
    other.lines[0].qty = "3";
    await saved(await savePurchase(other));
  });

  it("I3.4.2 EMI months < 2 or a non-card source → rejected", async () => {
    expect(
      await savePurchase(purchase({ source: "card", cardId: ids.card, emiMonths: "1" })),
    ).toEqual({ status: "invalid", errors: { emiMonths: "Must be at least 2" } });
    expect(await savePurchase(purchase({ emiMonths: "3" }))).toEqual({
      status: "invalid",
      errors: { emiMonths: "EMI is only for card purchases" },
    });
    expect(
      await savePurchase(
        purchase({ source: "supplier_credit", supplierId: ids.supplier, emiMonths: "6" }),
      ),
    ).toEqual({ status: "invalid", errors: { emiMonths: "EMI is only for card purchases" } });
    expect(await sql`select id from purchases`).toHaveLength(0);
    expect(await sql`select id from audit_log`).toHaveLength(0);
  });

  it("I3.4.3 editing a lot's unit cost when it has a sale in a closed month → rejected", async () => {
    const p = purchase();
    const s = await saved(await savePurchase(p));
    const lot = p.lines[0].id;
    // Synthetic: a sale of the lot in a closed month. The date and lock rules keep real data from
    // getting here (a sale is never before its purchase), so the rows are written directly.
    const lastMonth = addMonths(monthOf(today), -1);
    const [sale] = await sql`insert into sales (date, customer_id, created_by)
      values (${`${lastMonth}-15`}, ${ids.customer}, ${userId}) returning id`;
    await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price, created_by)
      values (${sale.id}, ${lot}, 1, 16000, ${userId})`;
    await sql`insert into month_closes (month, close_date, snapshot, closed_by)
      values (${`${lastMonth}-01`}, ${today}, '{}', ${userId})`;

    const edited = structuredClone(p);
    edited.lines[0].unitCost = "15,000";
    const rejected = {
      status: "invalid",
      errors: {
        form: `This lot has sales or returns in a closed month (${formatMonth(lastMonth)}) — its cost and qty can't change`,
      },
    };
    expect(await savePurchase({ ...edited, updatedAt: s.updatedAt })).toEqual(rejected);
    edited.lines[0].unitCost = p.lines[0].unitCost;
    edited.lines[0].qty = "3";
    expect(await savePurchase({ ...edited, updatedAt: s.updatedAt })).toEqual(rejected);

    // The note, and the lot that wasn't sold, can still change.
    edited.lines[0].qty = p.lines[0].qty;
    edited.lines[1].unitCost = "15,100";
    await saved(await savePurchase({ ...edited, note: "fixed", updatedAt: s.updatedAt }));
    const [l] = await sql`select unit_cost from purchase_lines where id = ${p.lines[1].id}`;
    expect(l.unit_cost).toBe("15100.00");
  });

  it("3.4 edit syncs the lines (update, add, remove) with an audit before/after; used lots are kept", async () => {
    const p = purchase({ source: "supplier_credit", supplierId: ids.supplier });
    const s = await saved(await savePurchase(p));
    const added = {
      id: randomUUID(),
      modelId: ids.model,
      qty: "4",
      unitCost: "1,000",
      imeiNote: "",
    };
    const edited = { ...p, lines: [{ ...p.lines[0], qty: "5" }, added], updatedAt: s.updatedAt };
    const e = await saved(await savePurchase(edited));
    const lots = await sql`select id, qty from purchase_lines where purchase_id = ${p.id}`;
    expect(Object.fromEntries(lots.map((l) => [l.id, l.qty]))).toEqual({
      [p.lines[0].id]: 5,
      [added.id]: 4,
    });
    expect(await effectsOf(p.id)).toEqual([
      { account: "stock", amount: parse("80,252.50") },
      { account: "supplier_due", amount: parse("80,252.50"), id: ids.supplier },
    ]);
    const [audit] = await sql`select before, after from audit_log where action = 'update'`;
    expect(audit.before.lines).toHaveLength(2);
    expect(audit.after.lines.map((l: { qty: number }) => l.qty).sort()).toEqual([4, 5]);

    // A stale updatedAt → conflict.
    expect(await savePurchase(edited)).toMatchObject({ status: "conflict" });

    // Sold 3 of the first lot: its qty can't go below 3, it can't be removed, and the date can't
    // move after the sale.
    const [sale] = await sql`insert into sales (date, customer_id, created_by)
      values (${today}, ${ids.customer}, ${userId}) returning id`;
    await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price, created_by)
      values (${sale.id}, ${p.lines[0].id}, 3, 16000, ${userId})`;
    const now = { ...edited, updatedAt: e.updatedAt };
    expect(await savePurchase({ ...now, lines: [{ ...now.lines[0], qty: "2" }, added] })).toEqual({
      status: "invalid",
      errors: { "lines.0.qty": "Can't be less than 3 — already sold or returned from this lot" },
    });
    expect(await savePurchase({ ...now, lines: [added] })).toEqual({
      status: "invalid",
      errors: { form: "A removed line's phones were sold or returned — keep that line" },
    });
    expect(await deletePurchase({ id: p.id, updatedAt: e.updatedAt })).toEqual({
      status: "invalid",
      errors: { form: "Other entries depend on this one — delete or reverse them first" },
    });
  });

  it("3.4 Undo deletes the purchase and its lots", async () => {
    const p = purchase();
    const s = await saved(await savePurchase(p));
    expect(await deletePurchase({ id: p.id, updatedAt: s.updatedAt })).toEqual({
      status: "ok",
      id: p.id,
      updatedAt: null,
    });
    expect(await sql`select id from purchases`).toHaveLength(0);
    expect(await sql`select id from purchase_lines`).toHaveLength(0);
    const [audit] = await sql`select before, after from audit_log where action = 'delete'`;
    expect(audit.before.lines).toHaveLength(2);
    expect(audit.after).toBeNull();
  });
});
