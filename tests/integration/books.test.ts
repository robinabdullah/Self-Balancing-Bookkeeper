import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { addMonths, dhakaToday, monthOf } from "@/lib/dates";
import { type BooksData, type StoredEntry, computeBooks, toPosted } from "@/lib/engine/index";
import { type Allocation, computeClose, monthProfit } from "@/lib/engine/months";
import type { MoneyEntry, Partner, PurchaseEntry, ReturnEntry } from "@/lib/engine/post";
import { parse, toDecimal } from "@/lib/money";
import { loadBooksData } from "@/server/books";
import { expectBalanced } from "../engine/invariant";
import { localSql } from "./local-db";

// Task 4.1 (SRS §2, §5): the loader is the only path from the DB to the engine. A synthetic
// scenario (D-014) is written straight to the tables; the same facts, as engine entries, are the
// expected loader output and the direct engine run.

const sql = localSql();
const today = dhakaToday();
const m0 = addMonths(monthOf(today), -2); // closed
const m1 = addMonths(monthOf(today), -1);

const ids = {
  arif: randomUUID(),
  sumon: randomUUID(),
  old: randomUUID(),
  ivy: randomUUID(),
  customer: randomUUID(),
  supplier: randomUUID(),
  card: randomUUID(),
  model: randomUUID(),
};
// Active partners by name (as the forms list them); the first takes the splitShares residual.
const partners: Partner[] = [
  { id: ids.arif, pct: 50 },
  { id: ids.sumon, pct: 50 },
];

const expected: StoredEntry[] = []; // in date, created_at order
let seq = 0;
/** A distinct created_at; lines get later ones, so their order is fixed. */
const stamp = (date: string) => `${date}T00:00:${String(++seq).padStart(2, "0")}.000Z`;

type Head = { date: string; reversesId?: string | null };

async function purchase(
  h: Head & Partial<Omit<PurchaseEntry, "lines" | "table" | "date">>,
  lines: { qty: number; unitCost: number }[],
) {
  const e: PurchaseEntry & StoredEntry = {
    table: "purchase",
    id: randomUUID(),
    date: h.date,
    createdAt: stamp(h.date),
    reversesId: h.reversesId ?? null,
    source: h.source ?? "cash",
    cardId: h.cardId ?? null,
    supplierId: h.supplierId ?? null,
    customerId: h.customerId ?? null,
    emiMonths: h.emiMonths ?? null,
    billMonthOverride: h.billMonthOverride ?? null,
    lines,
  };
  await sql`insert into purchases (id, date, source, card_id, supplier_id, customer_id,
      emi_months, bill_month_override, reverses_id, created_at)
    values (${e.id}, ${e.date}, ${e.source}, ${e.cardId ?? null}, ${e.supplierId ?? null},
      ${e.customerId ?? null}, ${e.emiMonths ?? null}, ${e.billMonthOverride ?? null},
      ${e.reversesId ?? null}, ${e.createdAt})`;
  const lots: string[] = [];
  for (const l of lines) {
    const lot = randomUUID();
    lots.push(lot);
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost, created_at)
      values (${lot}, ${e.id}, ${ids.model}, ${l.qty}, ${toDecimal(l.unitCost)}, ${stamp(h.date)})`;
  }
  expected.push(e);
  return { id: e.id, lots };
}

type SaleLine = { lotId: string; qty: number; unitPrice: number; unitCost: number };

async function sale(h: Head & { customerId: string }, lines: SaleLine[]) {
  const e: StoredEntry = {
    table: "sale",
    id: randomUUID(),
    date: h.date,
    createdAt: stamp(h.date),
    reversesId: h.reversesId ?? null,
    customerId: h.customerId,
    lines: lines.map(({ qty, unitPrice, unitCost }) => ({ qty, unitPrice, unitCost })),
  };
  await sql`insert into sales (id, date, customer_id, reverses_id, created_at)
    values (${e.id}, ${e.date}, ${h.customerId}, ${e.reversesId ?? null}, ${e.createdAt})`;
  const lineIds: string[] = [];
  for (const l of lines) {
    const lineId = randomUUID();
    lineIds.push(lineId);
    await sql`insert into sale_lines (id, sale_id, lot_id, qty, unit_price, created_at)
      values (${lineId}, ${e.id}, ${l.lotId}, ${l.qty}, ${toDecimal(l.unitPrice)},
        ${stamp(h.date)})`;
  }
  expected.push(e);
  return { id: e.id, lineIds };
}

type ReturnLine = {
  lotId: string;
  saleLineId?: string;
  qty: number;
  unitAmount: number;
  unitCost: number;
};

async function giveBack(
  h: Head & Partial<Omit<ReturnEntry, "lines" | "table" | "date">> & Pick<ReturnEntry, "kind">,
  lines: ReturnLine[],
) {
  const e: ReturnEntry & StoredEntry = {
    table: "return",
    id: randomUUID(),
    date: h.date,
    createdAt: stamp(h.date),
    reversesId: h.reversesId ?? null,
    kind: h.kind,
    customerId: h.customerId ?? null,
    cardId: h.cardId ?? null,
    supplierId: h.supplierId ?? null,
    refundTo: h.refundTo ?? null,
    reason: h.reason ?? null,
    lines: lines.map(({ qty, unitAmount, unitCost }) => ({ qty, unitAmount, unitCost })),
  };
  await sql`insert into returns (id, kind, date, customer_id, card_id, supplier_id, refund_to,
      reason, reverses_id, created_at)
    values (${e.id}, ${e.kind}, ${e.date}, ${e.customerId ?? null}, ${e.cardId ?? null},
      ${e.supplierId ?? null}, ${e.refundTo ?? null}, ${e.reason ?? null}, ${e.reversesId ?? null},
      ${e.createdAt})`;
  for (const l of lines) {
    await sql`insert into return_lines (return_id, sale_line_id, lot_id, qty, unit_amount,
        created_at)
      values (${e.id}, ${l.saleLineId ?? null}, ${l.lotId}, ${l.qty}, ${toDecimal(l.unitAmount)},
        ${stamp(h.date)})`;
  }
  expected.push(e);
}

const decimal = (poisha: number | null | undefined) => (poisha == null ? null : toDecimal(poisha));

async function money(m: Head & Partial<Omit<MoneyEntry, "table" | "date">>) {
  const e: MoneyEntry & StoredEntry = {
    table: "money",
    id: randomUUID(),
    date: m.date,
    createdAt: stamp(m.date),
    reversesId: m.reversesId ?? null,
    type: m.type ?? "customer_payment",
    amount: m.amount ?? 0,
    forMonth: m.forMonth ?? null,
    customerId: m.customerId ?? null,
    supplierId: m.supplierId ?? null,
    cardId: m.cardId ?? null,
    personId: m.personId ?? null,
    source: m.source ?? null,
    category: m.category ?? null,
    cardCharged: m.cardCharged ?? null,
    cashReceived: m.cashReceived ?? null,
    settleMode: m.settleMode ?? null,
    billMonthOverride: m.billMonthOverride ?? null,
    emiMonths: m.emiMonths ?? null,
    openingKind: m.openingKind ?? null,
  };
  await sql`insert into money_entries (id, type, date, amount, for_month, customer_id,
      supplier_id, card_id, person_id, source, category, card_charged, cash_received,
      settle_mode, bill_month_override, emi_months, opening_kind, reverses_id, created_at)
    values (${e.id}, ${e.type}, ${e.date}, ${toDecimal(e.amount)}, ${e.forMonth ?? null},
      ${e.customerId ?? null}, ${e.supplierId ?? null}, ${e.cardId ?? null},
      ${e.personId ?? null}, ${e.source ?? null}, ${e.category ?? null},
      ${decimal(e.cardCharged)}, ${decimal(e.cashReceived)}, ${e.settleMode ?? null},
      ${e.billMonthOverride ?? null}, ${e.emiMonths ?? null}, ${e.openingKind ?? null},
      ${e.reversesId ?? null}, ${e.createdAt})`;
  expected.push(e);
}

const tk = (taka: string) => parse(taka) as number;
let allocations: Allocation[] = [];
let billDates: BooksData["billDates"] = [];

beforeAll(async () => {
  await sql`insert into people (id, name, kind, profit_share_pct, active) values
    (${ids.arif}, 'Arif', 'partner', 50, true), (${ids.sumon}, 'Sumon', 'partner', 50, true),
    (${ids.old}, 'Old Partner', 'partner', 10, false), (${ids.ivy}, 'Ivy', 'investor', null, true)`;
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.customer}, 'Jamal', 'Test Telecom')`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, 'Supplier S')`;
  await sql`insert into cards (id, name, owner_person_id, statement_day, due_day)
    values (${ids.card}, 'Visa', ${ids.arif}, 10, 25)`;
  await sql`insert into models (id, name) values (${ids.model}, 'Model V')`;

  const c = { customerId: ids.customer };
  const d0 = (day: string) => `${m0}-${day}`;
  const d1 = (day: string) => `${m1}-${day}`;

  // m0 (closed): opening, card EMI and supplier-credit purchases, sale, both returns, money.
  await money({ date: d0("01"), type: "opening", openingKind: "cash", amount: tk("200000") });
  for (const personId of [ids.arif, ids.sumon]) {
    await money({
      date: d0("01"),
      type: "opening",
      openingKind: "opening_difference",
      personId,
      amount: tk("100000"),
    });
  }
  const card = await purchase({ date: d0("02"), source: "card", cardId: ids.card, emiMonths: 3 }, [
    { qty: 3, unitCost: tk("10000.5") },
    { qty: 1, unitCost: tk("9999") },
  ]);
  const credit = await purchase(
    { date: d0("03"), source: "supplier_credit", supplierId: ids.supplier },
    [{ qty: 2, unitCost: tk("12000") }],
  );
  const sold = await sale({ date: d0("04"), ...c }, [
    { lotId: card.lots[0], qty: 2, unitPrice: tk("15000.25"), unitCost: tk("10000.5") },
  ]);
  await giveBack({ date: d0("05"), kind: "customer", ...c }, [
    {
      lotId: card.lots[0],
      saleLineId: sold.lineIds[0],
      qty: 1,
      unitAmount: tk("15000.25"),
      unitCost: tk("10000.5"),
    },
  ]);
  await giveBack(
    {
      date: d0("06"),
      kind: "purchase",
      supplierId: ids.supplier,
      refundTo: "supplier",
      reason: "returned",
    },
    [{ lotId: credit.lots[0], qty: 1, unitAmount: tk("11500"), unitCost: tk("12000") }],
  );
  await money({ date: d0("07"), type: "customer_payment", amount: tk("10000"), ...c });
  await money({
    date: d0("08"),
    type: "card_cash_out",
    cardId: ids.card,
    amount: tk("10000"),
    cardCharged: tk("10000"),
    cashReceived: tk("9800"),
  });
  await money({
    date: d0("09"),
    type: "expense",
    source: "cash",
    category: "Rent",
    forMonth: `${m0}-01`,
    amount: tk("5000"),
  });
  const line = { lotId: credit.lots[0], qty: 1, unitPrice: tk("13000"), unitCost: tk("12000") };
  const reversed = await sale({ date: d0("10"), ...c }, [line]);

  // m1 (open): the sale's reversal, card payment, profit paid, opening correction, profit share,
  // a cash purchase, a write-off and a purchase against the customer's due.
  await sale({ date: d1("02"), reversesId: reversed.id, ...c }, [line]);
  await money({ date: d1("03"), type: "card_payment", cardId: ids.card, amount: tk("20000") });
  await money({ date: d1("04"), type: "profit_paid", personId: ids.arif, amount: tk("40") });
  await money({
    date: d1("05"),
    type: "opening_correction",
    openingKind: "customer_due",
    amount: tk("2000"),
    ...c,
  });
  await money({
    date: d1("06"),
    type: "customer_profit_share",
    settleMode: "added_to_due",
    forMonth: `${m1}-01`,
    amount: tk("3000"),
    ...c,
  });
  const cash = await purchase({ date: d1("07"), source: "cash" }, [
    { qty: 1, unitCost: tk("8000") },
  ]);
  await giveBack({ date: d1("08"), kind: "purchase", reason: "damaged_lost" }, [
    { lotId: cash.lots[0], qty: 1, unitAmount: 0, unitCost: tk("8000") },
  ]);
  await purchase({ date: d1("09"), source: "customer_offset", ...c }, [
    { qty: 1, unitCost: tk("5000") },
  ]);

  // Close m0: Ivy's cash allocation, the rest split by the engine (SRS §7).
  const posted = expected.map((e) => toPosted(e, partners));
  const ivy: Allocation = {
    month: `${m0}-01`,
    personId: ids.ivy,
    kind: "cash",
    basis: tk("10000"),
    ratePct: 2,
    amount: tk("200"),
  };
  const profit = monthProfit(posted, m0, today);
  allocations = [
    ivy,
    ...computeClose(profit, [ivy], partners).map((a) => ({
      ...a,
      month: `${m0}-01`,
      basis: null,
      ratePct: null,
    })),
  ];
  for (const a of allocations) {
    await sql`insert into allocations (month, person_id, kind, basis, rate_pct, amount)
      values (${a.month}, ${a.personId}, ${a.kind}, ${decimal(a.basis)}, ${a.ratePct ?? null},
        ${toDecimal(a.amount)})`;
  }
  await sql`insert into month_closes (month, close_date, snapshot, closed_by)
    values (${`${m0}-01`}, ${`${m1}-02`}, '{}', ${randomUUID()})`;

  billDates = [
    {
      cardId: ids.card,
      billMonth: `${m1}-01`,
      actualStatementDate: `${m1}-11`,
      actualDueDate: `${m1}-27`,
    },
  ];
  await sql`insert into card_bill_dates (card_id, bill_month, actual_statement_date,
      actual_due_date)
    values (${ids.card}, ${`${m1}-01`}, ${`${m1}-11`}, ${`${m1}-27`})`;
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

/** Order-free comparison for the rows whose order the engine doesn't use. */
const sorted = <T>(rows: T[]) =>
  [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

const direct = (): BooksData => ({
  entries: expected,
  partners,
  allocations,
  closed: [`${m0}-01`],
  cards: [{ id: ids.card, statementDay: 10, dueDay: 25 }],
  billDates,
});

describe("Books loader (task 4.1)", () => {
  it("I4.1.1 the loader returns every fact table's rows, mapped to engine types (money as poisha)", async () => {
    const data = await loadBooksData();
    expect(data.entries).toEqual(expected);
    expect(data.partners).toEqual(partners);
    expect(sorted(data.allocations)).toEqual(sorted(allocations));
    expect(data.closed).toEqual([`${m0}-01`]);
    expect(data.cards).toEqual([{ id: ids.card, statementDay: 10, dueDay: 25 }]);
    expect(data.billDates).toEqual(billDates);

    // Money is integer poisha: "10000.50" → 1,000,050; "-…" stays signed.
    const card = data.entries.find((e) => e.table === "purchase" && e.source === "card");
    expect(card?.table === "purchase" && card.lines[0].unitCost).toBe(1_000_050);
    expect(data.allocations.find((a) => a.kind === "cash")?.basis).toBe(1_000_000);
  });

  it("I4.1.2 computeBooks from the DB equals the same scenario run on the engine directly", async () => {
    const fromDb = computeBooks(await loadBooksData(), today);
    expect(fromDb).toEqual(computeBooks(direct(), today));

    // Hand-checked: 2,00,000 + 10,000 + 9,800 − 5,000 − 20,000 − 40 − 8,000.
    expect(fromDb.cash).toBe(tk("186760"));
    // 30,000.50 − 15,000.25 − 10,000 + 13,000 − 13,000 + 2,000 + 3,000 − 5,000.
    expect(fromDb.customers[ids.customer].balance).toBe(tk("5000.25"));
    expect(fromDb.months.find((m) => m.month === m0)).toMatchObject({ closed: true });
    expect(fromDb.invariant.difference).toBe(0);
    expectBalanced(fromDb.posted, today, allocations, [`${m0}-01`]);
  });
});
