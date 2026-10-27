import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { auditChanges } from "@mbl/domain/audit";
import { addMonths, dhakaToday, monthOf } from "@mbl/domain/dates";
import { type Effect, type Entry, type Partner, postEntry } from "@mbl/domain/engine/post";
import { parse } from "@mbl/domain/money";
import type { Result } from "@/server/action";
import { deleteReturn, saveReturn } from "@/server/actions/return";
import { reverseEntry } from "@/server/actions/reverse";
import { loadEntry, loadJournal } from "@/server/journal";
import { stockLots } from "@/server/stock";
import { expectBalanced, posted } from "../engine/invariant";
import { partnerApi } from "./api";
import { localSql } from "./local-db";

// Task 3.8 + CR-007 (PRD §4.5; SRS §8; UIDD §4.10; D-003, D-008, D-026): Journal delete, reverse
// and edit through the actions. The session and `revalidatePath` are stood in for as in
// action.test.ts. N-3.2: money entries go through the api (the facade), as the same partner.
// Synthetic data only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
let api: Awaited<ReturnType<typeof partnerApi>>;
const savePurchase = (input: unknown) => api.savePurchase(input);
const deletePurchase = (input: unknown) => api.deletePurchase(input);
const saveSale = (input: unknown) => api.saveSale(input);
const deleteSale = (input: unknown) => api.deleteSale(input);
let userId = "";
const saveMoneyEntry = (input: unknown) => api.saveMoneyEntry(input);
const deleteMoneyEntry = (input: unknown) => api.deleteMoneyEntry(input);

const today = dhakaToday();
const month = monthOf(today);
const lastMonth = addMonths(month, -1);
const ids = {
  arif: randomUUID(),
  sumon: randomUUID(),
  customer: randomUUID(),
  model: randomUUID(),
};
const partners: Partner[] = [
  { id: ids.sumon, pct: 50 },
  { id: ids.arif, pct: 50 },
];

const TABLES = "purchases, purchase_lines, sales, sale_lines, returns, return_lines, money_entries";

beforeAll(async () => {
  api = await partnerApi(sql, "Partner A");
  userId = api.user.userId;
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50)`;
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.customer}, 'Milon', 'Test Telecom')`;
  await sql`insert into models (id, name) values (${ids.model}, 'Model V')`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql.unsafe(`truncate ${TABLES}, audit_log, month_closes`);
});

afterAll(async () => {
  await sql.unsafe(`truncate ${TABLES}, audit_log, month_closes, models cascade`);
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

/** A cash purchase of one lot of `qty` @ `cost`; returns the purchase and lot ids. */
async function buy(qty = 3, cost = "15,000") {
  const id = randomUUID();
  const lotId = randomUUID();
  const r = await savePurchase({
    id,
    date: today,
    source: "cash",
    note: "",
    lines: [{ id: lotId, modelId: ids.model, qty: String(qty), unitCost: cost, imeiNote: "" }],
  });
  return { ...ok(r), lotId };
}

/** A sale of `qty` @ ৳18,000 (oldest lot first); returns the sale and its line id. */
async function sell(qty = 1, price = "18,000") {
  const id = randomUUID();
  ok(
    await saveSale({
      id,
      date: today,
      customerId: ids.customer,
      note: "",
      lines: [{ modelId: ids.model, qty: String(qty), unitPrice: price }],
    }),
  );
  const [line] = await sql`select id, updated_at from sale_lines where sale_id = ${id}`;
  const [sale] = await sql`select updated_at from sales where id = ${id}`;
  return { id, updatedAt: sale.updated_at.toISOString() as string, lineId: line.id as string };
}

async function giveBack(saleLineId: string, qty = 1) {
  return ok(
    await saveReturn({
      id: randomUUID(),
      kind: "customer",
      date: today,
      customerId: ids.customer,
      note: "",
      lines: [{ saleLineId, qty: String(qty), unitAmount: "18,000" }],
    }),
  );
}

const reverse = (table: string, reversesId: string, over: object = {}) =>
  reverseEntry({ id: randomUUID(), table, reversesId, date: today, ...over });

const remaining = async (lotId: string) => (await stockLots(db, { lotIds: [lotId] }))[0]?.remaining;

/** Everything stored, as engine entries (the mapping the 4.1 loader will do). */
async function stored(): Promise<(Entry & { id: string })[]> {
  const purchases = await sql`select id, date::text, source, reverses_id from purchases`;
  const lots = await sql`select purchase_id, qty, unit_cost from purchase_lines`;
  const sales = await sql`select id, date::text, customer_id, reverses_id from sales`;
  const saleLines = await sql`select sl.sale_id, sl.qty, sl.unit_price, l.unit_cost
    from sale_lines sl join purchase_lines l on l.id = sl.lot_id`;
  const returns = await sql`select id, kind, date::text, customer_id, refund_to, reason,
    reverses_id from returns`;
  const returnLines = await sql`select rl.return_id, rl.qty, rl.unit_amount, l.unit_cost
    from return_lines rl join purchase_lines l on l.id = rl.lot_id`;
  const money = await sql`select id, type, date::text, amount, for_month::text, customer_id,
    source, category, reverses_id from money_entries`;
  return [
    ...purchases.map((p) => ({
      table: "purchase" as const,
      id: p.id,
      date: p.date,
      source: p.source,
      reversesId: p.reverses_id,
      lines: lots
        .filter((l) => l.purchase_id === p.id)
        .map((l) => ({ qty: l.qty, unitCost: parse(l.unit_cost)! })),
    })),
    ...sales.map((s) => ({
      table: "sale" as const,
      id: s.id,
      date: s.date,
      customerId: s.customer_id,
      reversesId: s.reverses_id,
      lines: saleLines
        .filter((l) => l.sale_id === s.id)
        .map((l) => ({
          qty: l.qty,
          unitPrice: parse(l.unit_price)!,
          unitCost: parse(l.unit_cost)!,
        })),
    })),
    ...returns.map((r) => ({
      table: "return" as const,
      id: r.id,
      kind: r.kind,
      date: r.date,
      customerId: r.customer_id,
      refundTo: r.refund_to,
      reason: r.reason,
      reversesId: r.reverses_id,
      lines: returnLines
        .filter((l) => l.return_id === r.id)
        .map((l) => ({
          qty: l.qty,
          unitAmount: parse(l.unit_amount)!,
          unitCost: parse(l.unit_cost)!,
        })),
    })),
    ...money.map((m) => ({
      table: "money" as const,
      id: m.id,
      type: m.type,
      date: m.date,
      amount: parse(m.amount)!,
      forMonth: m.for_month,
      customerId: m.customer_id,
      source: m.source,
      category: m.category,
      reversesId: m.reverses_id,
    })),
  ];
}

/** The effects of the stored entry `id`, and the invariant over everything stored. */
async function effectsOf(id: string): Promise<Effect[]> {
  const entries = await stored();
  expectBalanced(entries.map((e) => posted(e, partners)));
  return postEntry(
    entries.find((e) => e.id === id)!,
    partners,
  );
}

const blocked = (form: string) => ({ status: "invalid", errors: { form } });
const DEPENDS_DELETE = "Other entries depend on this one — delete or reverse them first";
const DEPENDS_REVERSE = "Other entries depend on this one — reverse them first";

describe("Journal: delete, reverse, edit (task 3.8, CR-007)", () => {
  it("I3.8.1 delete is blocked for a lot with sales, a sale line with returns, or an entry with a reversal", async () => {
    const purchase = await buy();
    const sale = await sell();
    expect(await deletePurchase(purchase)).toEqual(blocked(DEPENDS_DELETE));

    const ret = await giveBack(sale.lineId);
    expect(await deleteSale(sale)).toEqual(blocked(DEPENDS_DELETE));

    const r = ok(await reverse("return", ret.id));
    expect(await deleteReturn(ret)).toEqual(
      blocked("This entry has a reversal — delete the reversal first"),
    );
    // The reversal itself can go (open month); then the return can too.
    ok(await deleteReturn(r));
    ok(await deleteReturn(ret));
    await effectsOf(sale.id);
  });

  it("I3.8.2 reverse is blocked for a sale with returns or a purchase with sales; never a reversal", async () => {
    const purchase = await buy();
    const sale = await sell();
    expect(await reverse("purchase", purchase.id)).toEqual(blocked(DEPENDS_REVERSE));
    const ret = await giveBack(sale.lineId);
    expect(await reverse("sale", sale.id)).toEqual(blocked(DEPENDS_REVERSE));

    const r = ok(await reverse("return", ret.id));
    expect(await reverse("return", r.id)).toEqual(
      blocked("A reversal can't be reversed — delete it, or enter the original again"),
    );
    expect(await reverse("return", ret.id)).toEqual(blocked("This entry is already reversed"));
    // A reversal can't be dated before the original.
    const pay = ok(
      await saveMoneyEntry({
        id: randomUUID(),
        type: "customer_payment",
        date: today,
        customerId: ids.customer,
        amount: "1,000",
        note: "",
      }),
    );
    const before = `${lastMonth}-28`;
    expect(await reverse("money", pay.id, { date: before })).toMatchObject({
      status: "invalid",
      errors: { date: expect.stringMatching(/^A reversal can't be dated before the original/) },
    });
    await effectsOf(r.id);
  });

  it("I3.8.3 reversing a purchase removes its lot qty; reversing a sale restores it", async () => {
    const purchase = await buy(3);
    const sale = await sell(2);
    expect(await remaining(purchase.lotId)).toBe(1);

    const saleReversal = ok(await reverse("sale", sale.id));
    expect(await remaining(purchase.lotId)).toBe(3);
    // The same lines on the same lots; the engine negates them.
    const lines = await sql`select lot_id, qty, unit_price from sale_lines
      where sale_id = ${saleReversal.id}`;
    expect(lines.map((l) => [l.lot_id, l.qty, l.unit_price])).toEqual([
      [purchase.lotId, 2, "18000.00"],
    ]);
    expect(await effectsOf(saleReversal.id)).toEqual([
      { account: "stock", amount: parse("30,000")! },
      { account: "customer_due", amount: -parse("36,000")!, id: ids.customer },
      { account: "profit", amount: -parse("6,000")!, month, component: "sale" },
    ]);

    // CR-007.2: the sale is reversed, so it no longer blocks the purchase's reversal.
    const purchaseReversal = ok(await reverse("purchase", purchase.id));
    expect(await remaining(purchase.lotId)).toBe(0);
    // Its copied lines are not lots: nothing new to sell.
    expect(await stockLots()).toEqual([expect.objectContaining({ id: purchase.lotId })]);
    expect(await effectsOf(purchaseReversal.id)).toEqual([
      { account: "stock", amount: -parse("45,000")! },
      { account: "cash", amount: parse("45,000")! },
    ]);
    // The audit row: action reverse, the copy with its lines.
    const [audit] = await sql`select action, after from audit_log
      where row_id = ${purchaseReversal.id}`;
    expect(audit.action).toBe("reverse");
    expect(audit.after.reversesId).toBe(purchase.id);
    expect(audit.after.lines).toHaveLength(1);

    // The Journal shows the links.
    const rows = await loadJournal();
    expect(rows.find((r) => r.id === purchase.id)).toMatchObject({
      reversedBy: purchaseReversal.id,
      amount: parse("45,000"),
    });
    expect(rows.find((r) => r.id === purchaseReversal.id)?.reversesId).toBe(purchase.id);
  });

  it("I3.8.3 a reversal in a closed month's place lands today, with this month's for_month (S18)", async () => {
    const expense = ok(
      await saveMoneyEntry({
        id: randomUUID(),
        type: "expense",
        date: `${lastMonth}-15`,
        amount: "5,000",
        category: "rent",
        source: "cash",
        forMonth: lastMonth,
        note: "",
      }),
    );
    await sql`insert into month_closes (month, close_date, snapshot, closed_by)
      values (${`${lastMonth}-01`}, ${today}, '{}', ${userId})`;
    expect((await loadJournal())[0].locked).toBe(true);
    // A date in the closed month is rejected; today with this month is the default.
    expect(
      await reverse("money", expense.id, { date: `${lastMonth}-20`, forMonth: lastMonth }),
    ).toMatchObject({ status: "invalid", errors: { date: expect.stringMatching(/closed month/) } });
    expect(await reverse("money", expense.id)).toEqual({
      status: "invalid",
      errors: { forMonth: "Pick a month" },
    });
    const r = ok(await reverse("money", expense.id, { forMonth: month }));
    expect(await effectsOf(r.id)).toEqual([
      { account: "cash", amount: parse("5,000")! },
      { account: "profit", amount: parse("5,000")!, month, component: "expense", category: "rent" },
    ]);
  });

  it("I3.8.4 editing writes an audit row with before/after", async () => {
    const pay = ok(
      await saveMoneyEntry({
        id: randomUUID(),
        type: "customer_payment",
        date: today,
        customerId: ids.customer,
        amount: "1,000",
        note: "",
      }),
    );
    ok(
      await saveMoneyEntry({
        id: pay.id,
        updatedAt: pay.updatedAt,
        type: "customer_payment",
        date: today,
        customerId: ids.customer,
        amount: "1,250",
        note: "corrected",
      }),
    );
    const [audit] = await sql`select action, before, after, user_id from audit_log
      where row_id = ${pay.id} and action = 'update'`;
    expect(audit.user_id).toBe(userId);
    expect(audit.before.amount).toBe("1000.00");
    expect(audit.after.amount).toBe("1250.00");
    // jsonb keeps its own key order, so only the set of changes is compared.
    const changes = auditChanges(audit.before, audit.after);
    expect(changes).toHaveLength(2);
    expect(changes).toEqual(
      expect.arrayContaining([
        { field: "Amount", from: "৳1,000", to: "৳1,250" },
        { field: "Note", from: "—", to: "corrected" },
      ]),
    );

    // The detail's History has the add and the edit, who and when.
    const entry = await loadEntry(pay.id);
    expect(entry?.history.map((h) => [h.action, h.by])).toEqual([
      ["insert", "Partner A"],
      ["update", "Partner A"],
    ]);
    await effectsOf(pay.id);
  });

  it("I-CR-007.1 editing a reversed entry, or a reversal → invalid", async () => {
    const pay = ok(
      await saveMoneyEntry({
        id: randomUUID(),
        type: "customer_payment",
        date: today,
        customerId: ids.customer,
        amount: "1,000",
        note: "",
      }),
    );
    const r = ok(await reverse("money", pay.id));
    const edit = (row: { id: string; updatedAt: string }) =>
      saveMoneyEntry({
        ...row,
        type: "customer_payment",
        date: today,
        customerId: ids.customer,
        amount: "2,000",
        note: "",
      });
    expect(await edit(pay)).toEqual(
      blocked("A reversed entry can't be edited — delete the reversal first"),
    );
    expect(await edit(r)).toEqual(
      blocked("A reversal can't be edited — delete it and reverse again"),
    );
    // I3.8.1 for a money entry: not deletable while it has a reversal.
    expect(await deleteMoneyEntry(pay)).toEqual(
      blocked("This entry has a reversal — delete the reversal first"),
    );

    // A sale too (header + lines), through the same helper.
    await buy();
    const sale = await sell();
    ok(await reverse("sale", sale.id));
    const [line] = await sql`select id, lot_id from sale_lines where sale_id = ${sale.id}`;
    expect(
      await saveSale({
        id: sale.id,
        updatedAt: sale.updatedAt,
        date: today,
        customerId: ids.customer,
        note: "",
        lines: [
          { id: line.id, modelId: ids.model, qty: "1", unitPrice: "19,000", lotId: line.lot_id },
        ],
      }),
    ).toEqual(blocked("A reversed entry can't be edited — delete the reversal first"));
    await effectsOf(sale.id);
  });

  it("I-CR-007.3 stock stays ≥ 0: a re-sold customer return can't be reversed; a re-sold sale reversal can't be deleted", async () => {
    const purchase = await buy(1);
    const sale = await sell(1);
    const ret = await giveBack(sale.lineId);
    await sell(1, "18,500"); // the returned phone is sold again
    expect(await remaining(purchase.lotId)).toBe(0);
    expect(await reverse("return", ret.id)).toEqual(blocked(DEPENDS_REVERSE));

    // A sale reversal whose units were sold again.
    const purchase2 = await buy(1, "15,500");
    const sale2 = await sell(1, "19,000");
    const r = ok(await reverse("sale", sale2.id));
    await sell(1, "19,500"); // the restored phone is sold again
    expect(await remaining(purchase2.lotId)).toBe(0);
    expect(await deleteSale(r)).toEqual(blocked(DEPENDS_DELETE));
    await effectsOf(r.id);
  });
});
