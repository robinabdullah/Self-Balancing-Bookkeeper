import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { addMonths, dhakaToday, formatMonth, monthOf } from "@mbl/domain/dates";
import { type Effect, type MoneyEntry, type Partner, postEntry } from "@mbl/domain/engine/post";
import { receivedAt } from "@mbl/domain/cash-out";
import { parse, plain } from "@mbl/domain/money";
import { reverseEntry } from "@/server/actions/reverse";
import { expectBalanced, posted } from "../engine/invariant";
import { partnerApi } from "./api";
import { localSql } from "./local-db";

// Task 3.7 (PRD §4.2; SRS §4 money_entries, §5; UIDD §4.6; D-005, D-007, D-009). The session and
// `revalidatePath` are stood in for as in action.test.ts. N-3.2: the money entries are saved
// through the api (the facade), as the same partner web's reversal still runs as. Synthetic data
// only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
let api: Awaited<ReturnType<typeof partnerApi>>;
let userId = "";
const saveMoneyEntry = (input: unknown) => api.saveMoneyEntry(input);
const deleteMoneyEntry = (input: unknown) => api.deleteMoneyEntry(input);
let walkIn = "";

const today = dhakaToday();
const thisMonth = monthOf(today);
const lastMonth = addMonths(thisMonth, -1);
const ids = {
  arif: randomUUID(),
  sumon: randomUUID(),
  investor: randomUUID(),
  card: randomUUID(),
  supplier: randomUUID(),
  customer: randomUUID(),
};
const partners: Partner[] = [
  { id: ids.sumon, pct: 50 },
  { id: ids.arif, pct: 50 },
];

beforeAll(async () => {
  api = await partnerApi(sql);
  userId = api.user.userId;
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50)`;
  await sql`insert into people (id, name, kind) values (${ids.investor}, 'Investor', 'investor')`;
  await sql`insert into cards (id, owner_person_id, name, statement_day, due_day)
    values (${ids.card}, ${ids.arif}, 'Test Visa', 5, 20)`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, 'Test Supplier')`;
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.customer}, 'Jamal', 'Test Telecom')`;
  [{ id: walkIn }] = await sql`select id from customers where is_system`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql`truncate money_entries, audit_log, month_closes`;
});

afterAll(async () => {
  await sql`truncate money_entries, audit_log, month_closes, cards, suppliers cascade`;
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
  await api.close();
  await sql.end();
  await db.$client.end();
});

/** The form's values (text, as FormData sends them). */
const entry = (fields: object) => ({ id: randomUUID(), date: today, note: "", ...fields });
const A = parse("1,250.50")!;

async function saved(result: Awaited<ReturnType<typeof saveMoneyEntry>>) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result;
}

const money = (v: string | null) => (v === null ? null : parse(v));

/** The stored money entries as engine entries (the same mapping the 4.1 loader will do). */
async function stored(): Promise<(MoneyEntry & { id: string; createdAt: string })[]> {
  // Dates as text, as the app's Drizzle client reads them.
  const rows = await sql`select *, date::text as day, for_month::text as month,
    bill_month_override::text as bill_month from money_entries order by created_at`;
  return rows.map((m) => ({
    table: "money",
    id: m.id,
    createdAt: m.created_at.toISOString(),
    type: m.type,
    date: m.day,
    amount: parse(m.amount)!,
    forMonth: m.month,
    customerId: m.customer_id,
    supplierId: m.supplier_id,
    cardId: m.card_id,
    personId: m.person_id,
    source: m.source,
    category: m.category,
    cardCharged: money(m.card_charged),
    cashReceived: money(m.cash_received),
    settleMode: m.settle_mode,
    billMonthOverride: m.bill_month,
    emiMonths: m.emi_months,
    openingKind: m.opening_kind,
    reversesId: m.reverses_id,
  }));
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

const fx = (account: Effect["account"], amount: number, id?: string, month?: string) =>
  expect.objectContaining({ account, amount, ...(id && { id }), ...(month && { month }) });

describe("Money entry actions (task 3.7)", () => {
  it("I3.7.1 one create per type posts as in SRS §5; the invariant holds", async () => {
    const { customer, supplier, card, arif, investor } = ids;
    const fee = parse("201")!; // 10,201 charged, 10,000 received
    const cases: [object, ReturnType<typeof fx>[]][] = [
      [
        { type: "customer_payment", customerId: customer, amount: "1,250.50" },
        [fx("cash", A), fx("customer_due", -A, customer)],
      ],
      [
        { type: "customer_cash_given", customerId: customer, amount: "1,250.50" },
        [fx("cash", -A), fx("customer_due", A, customer)],
      ],
      [
        { type: "customer_discount", customerId: customer, amount: "1,250.50" },
        [fx("customer_due", -A, customer), fx("profit", -A, undefined, thisMonth)],
      ],
      [
        {
          type: "customer_profit_share",
          customerId: customer,
          amount: "1,250.50",
          forMonth: lastMonth,
          settleMode: "received",
        },
        [fx("cash", A), fx("profit", A, undefined, lastMonth)],
      ],
      [
        {
          type: "customer_profit_share",
          customerId: customer,
          amount: "1,250.50",
          forMonth: lastMonth,
          settleMode: "added_to_due",
        },
        [fx("customer_due", A, customer), fx("profit", A, undefined, lastMonth)],
      ],
      [
        { type: "supplier_payment", supplierId: supplier, amount: "1,250.50", source: "cash" },
        [fx("supplier_due", -A, supplier), fx("cash", -A)],
      ],
      [
        {
          type: "supplier_payment",
          supplierId: supplier,
          amount: "1,250.50",
          source: "card",
          cardId: card,
        },
        [fx("supplier_due", -A, supplier), fx("card", A, card)],
      ],
      [
        { type: "card_payment", cardId: card, amount: "1,250.50" },
        [fx("cash", -A), fx("card", -A, card)],
      ],
      [
        { type: "card_cash_out", cardId: card, cardCharged: "10,201", cashReceived: "10,000" },
        [
          fx("cash", parse("10,000")!),
          fx("card", parse("10,201")!, card),
          fx("profit", -fee, undefined, thisMonth),
        ],
      ],
      [
        { type: "card_fee", cardId: card, amount: "1,250.50" },
        [fx("card", A, card), fx("profit", -A, undefined, thisMonth)],
      ],
      [
        { type: "cashback", amount: "1,250.50", source: "card", cardId: card },
        [fx("card", -A, card), fx("profit", A, undefined, thisMonth)],
      ],
      [
        { type: "cashback", amount: "1,250.50", source: "cash" },
        [fx("cash", A), fx("profit", A, undefined, thisMonth)],
      ],
      [
        { type: "expense", amount: "1,250.50", category: "salary", source: "cash" },
        [fx("cash", -A), fx("profit", -A, undefined, thisMonth)],
      ],
      [
        {
          type: "expense",
          amount: "1,250.50",
          category: "rent",
          source: "card",
          cardId: card,
          forMonth: lastMonth,
        },
        [fx("card", A, card), fx("profit", -A, undefined, lastMonth)],
      ],
      [
        { type: "capital_in", personId: investor, amount: "1,250.50" },
        [fx("cash", A), fx("capital", A, investor)],
      ],
      [
        { type: "capital_out", personId: arif, amount: "1,250.50" },
        [fx("cash", -A), fx("capital", -A, arif)],
      ],
      [
        { type: "profit_paid", personId: arif, amount: "1,250.50" },
        [fx("cash", -A), fx("profit_owed", -A, arif)],
      ],
      [
        { type: "profit_reinvested", personId: investor, amount: "1,250.50" },
        [fx("capital", A, investor), fx("profit_owed", -A, investor)],
      ],
    ];
    for (const [fields, effects] of cases) {
      const input = entry(fields);
      // The two profit shares differ only in how they settle, so the second is "similar".
      await saved(await saveMoneyEntry({ ...input, confirmDuplicate: true }));
      expect(await effectsOf(input.id), JSON.stringify(fields)).toEqual(effects);
    }
    // The schema drops what the type doesn't have: a cash payment stores no card; an expense
    // without a month is for the month of its date.
    const rows = await sql`select type, source, card_id, for_month::text, category
      from money_entries where type in ('supplier_payment', 'expense') order by created_at`;
    expect(rows.map((r) => [r.type, r.source, r.card_id, r.for_month, r.category])).toEqual([
      ["supplier_payment", "cash", null, null, null],
      ["supplier_payment", "card", card, null, null],
      ["expense", "cash", null, `${thisMonth}-01`, "salary"],
      ["expense", "card", card, `${lastMonth}-01`, "rent"],
    ]);
    const [audit] = await sql<{ n: number }[]>`select count(*)::int as n from audit_log
      where "table" = 'money_entries' and action = 'insert'`;
    expect(audit.n).toBe(cases.length);
  });

  it("I3.7.2 cash_received > card_charged → rejected", async () => {
    const input = entry({
      type: "card_cash_out",
      cardId: ids.card,
      cardCharged: "10,000",
      cashReceived: "10,001",
    });
    expect(await saveMoneyEntry(input)).toEqual({
      status: "invalid",
      errors: { cashReceived: "Cash received can't exceed amount charged" },
    });
    expect(await sql`select id from money_entries`).toHaveLength(0);
  });

  it("I3.7.3 a future for_month → rejected", async () => {
    const next = addMonths(thisMonth, 1);
    for (const fields of [
      { type: "expense", amount: "500", category: "rent", source: "cash", forMonth: next },
      {
        type: "customer_profit_share",
        customerId: ids.customer,
        amount: "500",
        forMonth: next,
        settleMode: "received",
      },
    ])
      expect(await saveMoneyEntry(entry(fields))).toEqual({
        status: "invalid",
        errors: { forMonth: `Month can't be after the date's month (${formatMonth(thisMonth)})` },
      });
    expect(await sql`select id from money_entries`).toHaveLength(0);
  });

  it("I3.7.4 opening correction S17 through the action", async () => {
    // Opening two months back: cash, balanced by the partners' opening difference (SRS §9).
    const opening = `${addMonths(thisMonth, -2)}-01`;
    const half = parse("50,000")!;
    await sql`insert into money_entries (type, date, amount, opening_kind, person_id, created_by)
      values ('opening', ${opening}, 50000, 'opening_difference', ${ids.arif}, ${userId}),
             ('opening', ${opening}, 50000, 'opening_difference', ${ids.sumon}, ${userId})`;
    await sql`insert into money_entries (type, date, amount, opening_kind, created_by)
      values ('opening', ${opening}, 100000, 'cash', ${userId})`;
    // Last month ("October") is closed; the correction is made this month ("November").
    await sql`insert into month_closes (month, close_date, snapshot, closed_by)
      values (${`${lastMonth}-01`}, ${today}, '{}', ${userId})`;

    const missed = parse("20,000")!;
    const fix = entry({
      type: "opening_correction",
      openingKind: "customer_due",
      customerId: ids.customer,
      amount: "20,000",
    });
    await saved(await saveMoneyEntry(fix));
    expect(await effectsOf(fix.id)).toEqual([
      fx("customer_due", missed, ids.customer),
      fx("opening_diff", parse("10,000")!, ids.sumon),
      fx("opening_diff", parse("10,000")!, ids.arif),
    ]);
    // No month's profit changes; the opening difference is +20,000 in all.
    const all = (await stored()).map((e) => posted(e, partners));
    const effects = all.flatMap((p) => p.effects);
    expect(effects.filter((e) => e.account === "profit")).toEqual([]);
    const diff = effects.filter((e) => e.account === "opening_diff");
    expect(diff.reduce((n, e) => n + e.amount, 0)).toBe(2 * half + missed);

    // Only its own target is stored; a correction dated in the closed month is rejected.
    const [row] = await sql`select opening_kind, customer_id, person_id, card_id
      from money_entries where id = ${fix.id}`;
    expect(row).toEqual({
      opening_kind: "customer_due",
      customer_id: ids.customer,
      person_id: null,
      card_id: null,
    });
    expect(await saveMoneyEntry({ ...fix, id: randomUUID(), date: `${lastMonth}-15` })).toEqual({
      status: "invalid",
      errors: { date: `Date is in a closed month (${formatMonth(lastMonth)})` },
    });
  });

  it("3.7 Walk-in can't get a profit share or cash given (D-009); a payment is fine", async () => {
    for (const fields of [
      { type: "customer_cash_given", amount: "500" },
      { type: "customer_profit_share", amount: "500", forMonth: lastMonth, settleMode: "received" },
    ])
      expect(await saveMoneyEntry(entry({ ...fields, customerId: walkIn }))).toEqual({
        status: "invalid",
        errors: { customerId: "Walk-in can't be used here — pick a customer" },
      });
    const payment = entry({ type: "customer_payment", customerId: walkIn, amount: "500" });
    expect(await saveMoneyEntry(payment)).toMatchObject({ status: "ok" });
  });

  it("3.7 a similar entry → the duplicate warning; Save anyway saves it", async () => {
    const first = entry({ type: "card_payment", cardId: ids.card, amount: "33,720" });
    await saved(await saveMoneyEntry(first));
    const again = entry({ type: "card_payment", cardId: ids.card, amount: "33720.00" });
    expect(await saveMoneyEntry(again)).toMatchObject({
      status: "duplicate",
      id: first.id,
      by: "Partner A",
    });
    // Another amount is not similar; Save anyway saves the same one again.
    expect(await saveMoneyEntry({ ...again, amount: "33,721" })).toMatchObject({ status: "ok" });
    expect(
      await saveMoneyEntry({ ...again, id: randomUUID(), confirmDuplicate: true }),
    ).toMatchObject({ status: "ok" });
    expect(await sql`select id from money_entries`).toHaveLength(3);
  });

  it("3.7 edit keeps the type and clears what no longer applies; Undo deletes", async () => {
    const input = entry({
      type: "expense",
      amount: "500",
      category: "delivery",
      source: "card",
      cardId: ids.card,
    });
    const first = await saved(await saveMoneyEntry(input));
    const edited = await saved(
      await saveMoneyEntry({ ...input, source: "cash", amount: "600", updatedAt: first.updatedAt }),
    );
    const [row] = await sql`select amount, source, card_id from money_entries`;
    expect(row).toEqual({ amount: "600.00", source: "cash", card_id: null });

    const asIncome = { ...input, type: "cashback", source: "cash", updatedAt: edited.updatedAt };
    expect(await saveMoneyEntry(asIncome)).toEqual({
      status: "invalid",
      errors: { type: "An entry's type can't change — delete it and enter the other type" },
    });

    expect(await deleteMoneyEntry({ id: input.id, updatedAt: first.updatedAt })).toMatchObject({
      status: "conflict",
    });
    expect(await deleteMoneyEntry({ id: input.id, updatedAt: edited.updatedAt })).toMatchObject({
      status: "ok",
    });
    expect(await sql`select id from money_entries`).toHaveLength(0);
    const audits = await sql`select action from audit_log order by at, created_at`;
    expect(audits.map((a) => a.action)).toEqual(["insert", "update", "delete"]);
  });

  it("I-CR-033.1 a cash-out filled from a Fee % saves the same two amounts, nothing else", async () => {
    const received = receivedAt("2,80,000", "1.3").received!; // what the form shows
    const input = entry({
      type: "card_cash_out",
      cardId: ids.card,
      cardCharged: "2,80,000",
      cashReceived: plain(received),
      feePct: "1.3", // even if it were sent, the % is never stored
    });
    const { id } = await saved(await saveMoneyEntry(input));
    const [row] = await sql`select * from money_entries`;
    expect(row).toMatchObject({ amount: "280000.00", card_charged: "280000.00" });
    expect(row.cash_received).toBe("276360.00");
    expect(Object.keys(row).filter((k) => /fee|rate|pct/.test(k))).toEqual([]);
    const fee = parse("3,640")!;
    expect(await effectsOf(id)).toEqual([
      fx("cash", received),
      fx("card", parse("2,80,000")!, ids.card),
      fx("profit", -fee, undefined, thisMonth),
    ]);
  });
});

// CR-035 (D-060; SRS §5): a Capital out paid by card. Card +A, the person's capital −A, no cash.
describe("I-CR-035.1 Capital out paid by card", () => {
  const spend = (more: object = {}) =>
    entry({
      type: "capital_out",
      personId: ids.sumon,
      amount: "2,206.90",
      source: "card",
      cardId: ids.card,
      ...more,
    });
  const B = parse("2,206.90")!;

  it("saves the source and card; posts card +A and capital −A; the books balance", async () => {
    const input = spend();
    await saved(await saveMoneyEntry(input));
    const [row] = await sql`select type, source, card_id, person_id, amount from money_entries`;
    expect(row).toEqual({
      type: "capital_out",
      source: "card",
      card_id: ids.card,
      person_id: ids.sumon,
      amount: "2206.90",
    });
    expect(await effectsOf(input.id)).toEqual([
      fx("card", B, ids.card),
      fx("capital", -B, ids.sumon),
    ]);
  });

  it("Card without a card is refused; no source saves as cash", async () => {
    expect(await saveMoneyEntry(spend({ cardId: "" }))).toEqual({
      status: "invalid",
      errors: { cardId: "Pick a card" },
    });
    const cash = entry({ type: "capital_out", personId: ids.sumon, amount: "2,206.90" });
    await saved(await saveMoneyEntry(cash));
    const [row] = await sql`select source, card_id from money_entries`;
    expect(row).toEqual({ source: "cash", card_id: null });
    expect(await effectsOf(cash.id)).toEqual([fx("cash", -B), fx("capital", -B, ids.sumon)]);
  });

  it("edit Card → Cash clears the card", async () => {
    const input = spend();
    const first = await saved(await saveMoneyEntry(input));
    await saved(
      await saveMoneyEntry({
        ...input,
        source: "cash",
        cardId: ids.card,
        updatedAt: first.updatedAt,
      }),
    );
    const [row] = await sql`select source, card_id from money_entries`;
    expect(row).toEqual({ source: "cash", card_id: null });
    expect(await effectsOf(input.id)).toEqual([fx("cash", -B), fx("capital", -B, ids.sumon)]);
  });

  it("a stored capital out with no source (before D-060) still posts as cash", async () => {
    const [{ id }] = await sql`insert into money_entries (type, date, amount, person_id, created_by)
      values ('capital_out', ${today}, 2206.90, ${ids.sumon}, ${userId}) returning id`;
    const [row] = await sql`select source from money_entries`;
    expect(row.source).toBeNull();
    expect(await effectsOf(id)).toEqual([fx("cash", -B), fx("capital", -B, ids.sumon)]);
  });

  it("reverse: the reversal keeps the card and negates both sides", async () => {
    const input = spend();
    await saved(await saveMoneyEntry(input));
    const undo = await reverseEntry({
      id: randomUUID(),
      table: "money",
      reversesId: input.id,
      date: today,
    });
    expect(undo).toMatchObject({ status: "ok" });
    const [row] =
      await sql`select source, card_id from money_entries where reverses_id = ${input.id}`;
    expect(row).toEqual({ source: "card", card_id: ids.card });
    const id = (undo as { id: string }).id;
    expect(await effectsOf(id)).toEqual([fx("card", -B, ids.card), fx("capital", B, ids.sumon)]);
  });

  it("the duplicate check counts the card; a closed month refuses it", async () => {
    await saved(await saveMoneyEntry(spend()));
    expect(await saveMoneyEntry(spend())).toMatchObject({ status: "duplicate" });
    await sql`insert into month_closes (month, close_date, snapshot, closed_by)
      values (${`${lastMonth}-01`}, ${today}, '{}', ${userId})`;
    expect(await saveMoneyEntry(spend({ date: `${lastMonth}-15` }))).toEqual({
      status: "invalid",
      errors: { date: `Date is in a closed month (${formatMonth(lastMonth)})` },
    });
  });
});
