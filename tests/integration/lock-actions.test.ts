import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { addMonths, dhakaToday, formatMonth, monthOf } from "@mbl/domain/dates";
import { computeBooks } from "@mbl/domain/engine/index";
import { defaultReversal } from "@mbl/domain/guards";
import { parse } from "@mbl/domain/money";
import type { Result } from "@mbl/domain/result";
import { loadCalendar } from "@/server/action";
import { loadBooksData } from "@/server/books";
import { loadJournal } from "@/server/journal";
import { expectBalanced } from "../engine/invariant";
import { partnerApi } from "./api";
import { localSql } from "./local-db";

// Task 5.3 (SRS §7 lock rule, §8): every create/edit/delete path rejects a closed month, and a
// locked entry is reversed into an open month (S18). Months are closed through the action. The
// session and `revalidatePath` are stood in for as in action.test.ts. N-3.2: money entries go
// through the api (the facade), as the same partner. Synthetic data only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
let api: Awaited<ReturnType<typeof partnerApi>>;
const closeMonth = (input: unknown) => api.closeMonth(input);
const reverseEntry = (input: unknown) => api.reverseEntry(input);
const savePurchase = (input: unknown) => api.savePurchase(input);
const deletePurchase = (input: unknown) => api.deletePurchase(input);
const saveSale = (input: unknown) => api.saveSale(input);
const deleteSale = (input: unknown) => api.deleteSale(input);
const saveReturn = (input: unknown) => api.saveReturn(input);
const deleteReturn = (input: unknown) => api.deleteReturn(input);
let userId = "";
const deleteMoneyEntry = (input: unknown) => api.deleteMoneyEntry(input);
const saveMoneyEntry = (input: unknown) => api.saveMoneyEntry(input);

const today = dhakaToday();
const month = monthOf(today); // "November" in S18
const lastMonth = addMonths(month, -1); // "October", closed
const ids = { arif: randomUUID(), sumon: randomUUID(), customer: randomUUID() };
const model = randomUUID();

const TABLES =
  "purchases, purchase_lines, sales, sale_lines, returns, return_lines, money_entries, " +
  "allocations, month_closes, audit_log";

const LOCKED = `This entry is in a closed month (${formatMonth(lastMonth)}) — reverse it instead`;
const CLOSED_DATE = `Date is in a closed month (${formatMonth(lastMonth)})`;

beforeAll(async () => {
  api = await partnerApi(sql, "Partner A");
  userId = api.user.userId;
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50)`;
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.customer}, 'Milon', 'Test Telecom')`;
  await sql`insert into models (id, name) values (${model}, 'Model L')`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql.unsafe(`truncate ${TABLES}`);
});

afterAll(async () => {
  await sql.unsafe(`truncate ${TABLES}, models cascade`);
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
  await api.close();
  await sql.end();
  await db.$client.end();
});

function ok(result: Result) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return { id: result.id, updatedAt: result.updatedAt as string };
}

/** Close `m` through the action: partners only (50/50), no investor lines. */
const close = async (m: string) => ok(await closeMonth({ id: randomUUID(), month: m }));

async function expectBooksBalanced() {
  const data = await loadBooksData();
  expectBalanced(computeBooks(data, today).posted, today, data.allocations, data.closed);
}

const purchaseInput = (date: string, lotId = randomUUID()) => ({
  id: randomUUID(),
  date,
  source: "cash",
  note: "",
  lines: [{ id: lotId, modelId: model, qty: "3", unitCost: "15,000", imeiNote: "" }],
});
const saleInput = (date: string) => ({
  id: randomUUID(),
  date,
  customerId: ids.customer,
  note: "",
  lines: [{ modelId: model, qty: "1", unitPrice: "18,000" }],
});
const returnInput = (date: string, saleLineId: string) => ({
  id: randomUUID(),
  kind: "customer",
  date,
  customerId: ids.customer,
  note: "",
  lines: [{ saleLineId, qty: "1", unitAmount: "18,000" }],
});
const paymentInput = (date: string) => ({
  id: randomUUID(),
  type: "customer_payment",
  date,
  amount: "2,000",
  customerId: ids.customer,
  note: "",
});
const expenseInput = (date: string, forMonth: string, amount = "1,000") => ({
  id: randomUUID(),
  type: "expense",
  date,
  amount,
  category: "rent",
  source: "cash",
  forMonth,
  note: "",
});

const count = async () =>
  (
    await sql.unsafe(`select
    (select count(*) from purchases) + (select count(*) from sales) +
    (select count(*) from returns) + (select count(*) from money_entries) as n`)
  )[0].n;

describe("5.3 Locks everywhere", () => {
  it("I5.3.1 creating, editing or deleting an entry dated (or for) a closed month → rejected", async () => {
    // One of each entry in last month, and an expense dated this month *for* last month.
    const day = (d: string) => `${lastMonth}-${d}`;
    const lotId = randomUUID();
    const purchase = purchaseInput(day("10"), lotId);
    const purchaseSaved = ok(await savePurchase(purchase));
    const sale = saleInput(day("12"));
    const saleSaved = ok(await saveSale(sale));
    const [line] = await sql`select id, lot_id from sale_lines where sale_id = ${sale.id}`;
    const ret = returnInput(day("14"), line.id);
    const retSaved = ok(await saveReturn(ret));
    const pay = paymentInput(day("16"));
    const paySaved = ok(await saveMoneyEntry(pay));
    const expense = expenseInput(today, lastMonth);
    const expenseSaved = ok(await saveMoneyEntry(expense));
    await close(lastMonth);

    // The Journal shows every one of them 🔒.
    expect((await loadJournal()).map((r) => r.locked)).toEqual([true, true, true, true, true]);
    const before = await count();

    // Create: dated in the closed month, or for it.
    const closedDate = { status: "invalid", errors: { date: CLOSED_DATE } };
    expect(await savePurchase(purchaseInput(day("20")))).toMatchObject(closedDate);
    expect(await saveSale(saleInput(day("20")))).toMatchObject(closedDate);
    expect(await saveReturn(returnInput(day("20"), line.id))).toMatchObject(closedDate);
    expect(await saveMoneyEntry(paymentInput(day("20")))).toMatchObject(closedDate);
    expect(await saveMoneyEntry(expenseInput(today, lastMonth, "2,500"))).toMatchObject({
      status: "invalid",
      errors: { forMonth: `Month is closed (${formatMonth(lastMonth)})` },
    });

    // Edit (even moving it to today) and delete: the lock message, nothing else.
    const blocked = { status: "invalid", errors: { form: LOCKED } };
    const saleEdit = {
      ...sale,
      date: today,
      lines: [{ id: line.id, modelId: model, qty: "1", unitPrice: "18,500", lotId: line.lot_id }],
    };
    const edits: [(input: unknown) => Promise<Result>, object, { updatedAt: string }][] = [
      [savePurchase, { ...purchase, date: today }, purchaseSaved],
      [saveSale, saleEdit, saleSaved],
      [saveReturn, { ...ret, date: today }, retSaved],
      [saveMoneyEntry, { ...pay, date: today }, paySaved],
      [saveMoneyEntry, { ...expense, forMonth: month }, expenseSaved],
    ];
    for (const [save, values, { updatedAt }] of edits)
      expect(await save({ ...values, updatedAt })).toEqual(blocked);

    // Delete the return first, so the sale and purchase have no dependents: still locked.
    const deletes: [(input: unknown) => Promise<Result>, { id: string; updatedAt: string }][] = [
      [deleteReturn, retSaved],
      [deleteSale, saleSaved],
      [deletePurchase, purchaseSaved],
      [deleteMoneyEntry, paySaved],
      [deleteMoneyEntry, expenseSaved],
    ];
    for (const [del, { id, updatedAt }] of deletes)
      expect(await del({ id, updatedAt })).toEqual(blocked);

    expect(await count()).toBe(before);
    expect(await sql`select action from audit_log where action <> 'insert'`).toEqual([
      { action: "close" },
    ]);
    await expectBooksBalanced();
  });

  it("I5.3.2 S18 through the actions: reversing a locked October expense lands on today (November); November profit +5,000", async () => {
    const expense = expenseInput(`${lastMonth}-15`, lastMonth, "5,000");
    ok(await saveMoneyEntry(expense));
    const closed = await close(lastMonth);
    const [{ snapshot }] = await sql`select snapshot from month_closes where id = ${closed.id}`;
    const profitOf = async (m: string) =>
      computeBooks(await loadBooksData(), today).months.find((x) => x.month === m)?.profit ?? 0;
    const novemberBefore = await profitOf(month);

    // The reverse dialog's default (SRS §8): today, for this month.
    const [stored] = await sql`select date::text, for_month::text from money_entries`;
    const at = defaultReversal(
      { date: stored.date, forMonth: stored.for_month },
      await loadCalendar(),
    );
    expect(at).toEqual({ date: today, forMonth: month });
    const r = ok(
      await reverseEntry({ id: randomUUID(), table: "money", reversesId: expense.id, ...at }),
    );
    const [reversal] = await sql`select date::text, for_month::text, reverses_id
      from money_entries where id = ${r.id}`;
    expect(reversal).toEqual({
      date: today,
      for_month: `${month}-01`,
      reverses_id: expense.id,
    });

    expect((await profitOf(month)) - novemberBefore).toBe(parse("5,000"));
    // October's closed numbers are unchanged.
    expect(await profitOf(lastMonth)).toBe(-parse("5,000")!);
    const [after] = await sql`select snapshot from month_closes where id = ${closed.id}`;
    expect(after.snapshot).toEqual(snapshot);
    expect((await loadJournal()).find((row) => row.id === r.id)?.locked).toBe(false);
    await expectBooksBalanced();
  });
});
