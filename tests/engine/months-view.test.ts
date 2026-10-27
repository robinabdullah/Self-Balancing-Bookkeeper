import { describe, expect, it } from "vitest";
import { type BooksData, type StoredEntry, computeBooks } from "@/lib/engine/index";
import { type Allocation, computeClose, monthProfit, nextToClose } from "@/lib/engine/months";
import type { MoneyEntry } from "@/lib/engine/post";
import { add } from "@/lib/money";
import { breakdownLines, closeScreen, monthList, parseRate, readLine } from "@/lib/months-view";
import { PARTNERS, expectBalanced } from "./invariant";

// Task 5.1 (UIDD §4.9, SRS §7): the Months list and the close screen's defaults. Synthetic ids
// and amounts only (D-014).
const [ARIF, SUMON] = PARTNERS.map((p) => p.id);
const KAMAL = "person-kamal"; // an investor with capital
const NILA = "person-nila"; // a new investor, nothing yet
const GONE = "person-gone"; // an inactive investor with no capital
const [A, B, C] = ["cust-a", "cust-b", "cust-c"];

let seq = 0;
const money = (m: Omit<MoneyEntry, "table">): StoredEntry => {
  seq += 1;
  const createdAt = `${m.date}T10:00:00.${String(seq).padStart(3, "0")}Z`;
  return { table: "money", id: `e-${seq}`, createdAt, ...m };
};
const opening = (openingKind: MoneyEntry["openingKind"], amount: number, more = {}) =>
  money({ type: "opening", date: "2026-09-01", openingKind, amount, ...more });
const share = (customerId: string, date: string, forMonth: string, more = {}) =>
  money({
    type: "customer_profit_share",
    date,
    forMonth,
    customerId,
    settleMode: "received",
    amount: 1_000_000,
    ...more,
  });

const cOct = share(C, "2026-11-02", "2026-10-01");
const entries: StoredEntry[] = [
  opening("cash", 100_000_000),
  opening("capital", 60_000_000, { personId: KAMAL }),
  opening("capital", 20_000_000, { personId: ARIF }),
  opening("capital", 20_000_000, { personId: SUMON }),
  money({ type: "cashback", date: "2026-09-10", source: "cash", amount: 5_000_000 }),
  share(A, "2026-10-02", "2026-09-01"),
  share(B, "2026-10-02", "2026-09-01"),
  share(C, "2026-10-02", "2026-09-01"),
  money({ type: "cashback", date: "2026-10-05", source: "cash", amount: 3_000_000 }),
  money({
    type: "expense",
    date: "2026-10-06",
    forMonth: "2026-10-01",
    source: "cash",
    category: "delivery",
    amount: 200_000,
  }),
  share(B, "2026-11-02", "2026-10-01"),
  cOct,
  share(C, "2026-11-03", "2026-10-01", { reversesId: cOct.id }), // C's October share reversed
  money({
    type: "expense",
    date: "2026-11-03",
    forMonth: "2026-10-01",
    source: "cash",
    category: "salary",
    amount: 100_000,
  }),
  money({ type: "capital_in", date: "2026-11-05", personId: KAMAL, amount: 10_000_000 }),
];
// September closed: Profit(Sep) = 5,000,000 + 3 × 1,000,000 = 8,000,000.
const allocations: Allocation[] = [
  {
    month: "2026-09-01",
    personId: KAMAL,
    kind: "cash",
    basis: 60_000_000,
    ratePct: 1.5,
    amount: 900_000,
  },
  {
    month: "2026-09-01",
    personId: KAMAL,
    kind: "card",
    basis: 20_000_000,
    ratePct: 1,
    amount: 200_000,
  },
  { month: "2026-09-01", personId: ARIF, kind: "partner", amount: 3_450_000 },
  { month: "2026-09-01", personId: SUMON, kind: "partner", amount: 3_450_000 },
];
const data: BooksData = {
  entries,
  partners: PARTNERS,
  allocations,
  closed: ["2026-09-01"],
  cards: [],
  billDates: [],
};
const people = [
  { id: GONE, name: "Gone", kind: "investor", active: false },
  { id: KAMAL, name: "Kamal", kind: "investor", active: true },
  { id: NILA, name: "Nila", kind: "investor", active: true },
  { id: SUMON, name: "Sumon", kind: "partner", active: true },
  { id: ARIF, name: "Arif", kind: "partner", active: true },
];
const asOf = "2026-11-10";
const books = computeBooks(data, asOf);
const next = nextToClose(data.closed, entries[0].date, asOf);
const screen = closeScreen(data, books, people, next, asOf);
const closes = [{ month: "2026-09-01", closeDate: "2026-10-03" }];

describe("Months view (task 5.1)", () => {
  // U-CR-024.1 (D-044): November has only a capital in (no profit), so it is filled as ৳0 · Open,
  // and linked: it is this month.
  it("U-CR-024.1 lists every month to this month newest first with Open / Closed on dd Mon; the next to close is October", () => {
    expect(next).toBe("2026-10");
    const rows = monthList(books.months, closes, next, "2026-11");
    expect(rows).toEqual([
      { month: "2026-11", profit: 0, status: "Open", next: false, closed: false, link: true },
      {
        month: "2026-10",
        profit: 3_700_000,
        status: "Open",
        next: true,
        closed: false,
        link: true,
      },
      {
        month: "2026-09",
        profit: 8_000_000,
        status: "Closed on 03 Oct",
        next: false,
        closed: true,
        link: true,
      },
    ]);
    expectBalanced(books.posted, asOf, allocations, data.closed);
  });

  it("adds the next month to close when it has no profit yet", () => {
    expect(monthList([], [], "2026-10", "2026-10")).toEqual([
      { month: "2026-10", profit: 0, status: "Open", next: true, closed: false, link: true },
    ]);
  });

  it("U-CR-024.1 fills the quiet months between; a for-month after this month has no link", () => {
    const months = [
      { month: "2026-09", profit: 500, closed: true },
      { month: "2026-12", profit: 700, closed: false },
    ];
    const rows = monthList(months, closes, "2026-10", "2026-11");
    expect(rows.map((r) => [r.month, r.profit, r.link])).toEqual([
      ["2026-12", 700, false],
      ["2026-11", 0, true],
      ["2026-10", 0, true],
      ["2026-09", 500, true],
    ]);
  });

  // U-CR-024.2 (D-044): a later open month's page shows `breakdownLines(monthProfit(...))`; for
  // every open month the lines and the total equal the Months list's profit. A cashback and an
  // expense in November give it a profit of its own.
  it("U-CR-024.2 each open month's breakdown sums to its Months list profit", () => {
    const more: BooksData = {
      ...data,
      entries: [
        ...entries,
        money({ type: "cashback", date: "2026-11-06", source: "cash", amount: 400_000 }),
        money({
          type: "expense",
          date: "2026-11-07",
          source: "cash",
          category: "delivery",
          amount: 150_000,
        }),
      ],
    };
    const b = computeBooks(more, asOf);
    const open = monthList(b.months, closes, next, "2026-11").filter((r) => !r.closed);
    expect(open.map((r) => [r.month, r.profit])).toEqual([
      ["2026-11", 250_000],
      ["2026-10", 3_700_000],
    ]);
    for (const row of open) {
      const p = monthProfit(b.posted, row.month, asOf);
      expect(p.total).toBe(row.profit);
      expect(breakdownLines(p).reduce((n, l) => add(n, l.amount), 0)).toBe(row.profit);
    }
    expectBalanced(b.posted, asOf, allocations, data.closed);
  });

  it("breaks October's profit down by component and expense category; the lines sum to it", () => {
    expect(screen.profit.total).toBe(3_700_000);
    const shown = Object.fromEntries(screen.lines.map((l) => [l.label, l.amount]));
    expect(shown).toMatchObject({
      "Sale profit": 0,
      "Profit share": 1_000_000,
      Cashback: 3_000_000,
      "Expense: Delivery": -200_000,
      "Expense: Salary": -100_000,
      "Card fees": 0,
    });
    expect(screen.lines.reduce((n, l) => add(n, l.amount), 0)).toBe(screen.profit.total);
    expect(breakdownLines(screen.profit).some((l) => l.label.startsWith("Expense: Rent"))).toBe(
      false,
    );
  });

  it("defaults the investor lines: cash basis = capital at month end, the rest from last month", () => {
    expect(screen.investors).toEqual([
      // November's capital in is after October's end: not in the basis.
      {
        personId: KAMAL,
        name: "Kamal",
        kind: "cash",
        basis: 60_000_000,
        ratePct: 1.5,
        amount: 900_000,
      },
      {
        personId: KAMAL,
        name: "Kamal",
        kind: "card",
        basis: 20_000_000,
        ratePct: 1,
        amount: 200_000,
      },
      // The first time: no capital and no last-month values → blank.
      { personId: NILA, name: "Nila", kind: "cash", basis: 0, ratePct: null, amount: null },
      { personId: NILA, name: "Nila", kind: "card", basis: null, ratePct: null, amount: null },
    ]);
  });

  it("splits what is left between the partners; with the investors it sums to Profit(M)", () => {
    const investors = screen.investors.map((l) => ({ amount: l.amount ?? 0 }));
    const partners = computeClose(screen.profit, investors, PARTNERS);
    expect(partners.map((p) => p.amount)).toEqual([1_300_000, 1_300_000]);
    const total = [...investors, ...partners].reduce((n, a) => add(n, a.amount), 0);
    expect(total).toBe(screen.profit.total);
  });

  it("reminds about customers with a share last month but none (standing) this month", () => {
    expect(screen.reminders).toEqual([A, C]);
  });

  it("reads a rate % with up to 3 decimals", () => {
    expect(parseRate("1.5")).toBe(1.5);
    expect(parseRate(" 1.125 ")).toBe(1.125);
    for (const bad of ["", "1.1255", "-1", "abc", "1,5"]) expect(parseRate(bad)).toBeNull();
  });
});

describe("CR-009 readLine (D-028)", () => {
  const line = (basis: string, ratePct: string, amount: string) =>
    readLine({ basis, ratePct, amount });

  it("U-CR-009.1 stores basis > 0 + rate + amount; skips a line with no amount or basis 0", () => {
    expect(line("1000000.00", "2", "20000.00")).toEqual({
      row: { basis: 100_000_000, ratePct: 2, amount: 2_000_000 },
      amount: 2_000_000,
      errors: {},
    });
    expect(line("1000000.00", "2", "0")).toMatchObject({ row: { amount: 0 }, amount: 0 });
    for (const [b, r, a] of [
      ["", "", ""],
      ["500.00", "", ""],
      ["0.00", "1.5", "0.00"],
      ["", "", "0"],
    ])
      expect(line(b, r, a)).toEqual({ row: null, amount: 0, errors: {} });
  });

  it("U-CR-009.2 an amount without basis > 0 and a rate, or bad text → errors, counts 0", () => {
    const need = { amount: "Amount: enter a basis (more than 0) and a rate for it" };
    expect(line("", "", "5000")).toEqual({ row: null, amount: 0, errors: need });
    expect(line("0", "2", "5000")).toEqual({ row: null, amount: 0, errors: need });
    expect(line("-1", "x", "-5").errors).toEqual({
      basis: "Basis: enter 0 or more",
      ratePct: "Rate: a % like 1.5 (up to 3 decimals)",
      amount: "Amount: enter 0 or more",
    });
  });
});
