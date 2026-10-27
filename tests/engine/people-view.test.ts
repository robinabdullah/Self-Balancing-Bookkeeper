import { describe, expect, it } from "vitest";
import { type BooksData, type StoredEntry, computeBooks } from "@/lib/engine/index";
import type { Allocation } from "@/lib/engine/months";
import type { MoneyEntry } from "@/lib/engine/post";
import { add, sub } from "@/lib/money";
import { peopleRows, personDetail } from "@/lib/people-view";
import { PARTNERS, expectBalanced } from "./invariant";

// Task 4.5 (UIDD §4.8): the People list and a person's detail, off `computeBooks`. Synthetic ids
// and amounts only (D-014).
const [ARIF, SUMON] = PARTNERS.map((p) => p.id);
const KAMAL = "person-kamal"; // an investor
const CUST = "cust-1";

let seq = 0;
const money = (m: Omit<MoneyEntry, "table">): StoredEntry => {
  seq += 1;
  const createdAt = `${m.date}T10:00:00.${String(seq).padStart(3, "0")}Z`;
  return { table: "money", id: `e-${seq}`, createdAt, ...m };
};
const opening = (openingKind: MoneyEntry["openingKind"], amount: number, more = {}) =>
  money({ type: "opening", date: "2026-10-01", openingKind, amount, ...more });

// The opening (balanced: 10,000 cash = 8,000 capital + 1,000 profit owed + 1,000 difference),
// ৳2,000 of October cashback, October closed, then November's capital and profit entries.
const payKamal = { type: "profit_paid", personId: KAMAL, amount: 10_000 } as const;
const kamalPaid = money({ ...payKamal, date: "2026-11-06" });
const entries: StoredEntry[] = [
  opening("cash", 1_000_000),
  opening("capital", 400_000, { personId: ARIF }),
  opening("capital", 400_000, { personId: SUMON }),
  opening("profit_owed", 100_000, { personId: KAMAL }),
  opening("opening_difference", 50_000, { personId: ARIF }),
  opening("opening_difference", 50_000, { personId: SUMON }),
  money({ type: "cashback", date: "2026-10-05", source: "cash", amount: 200_000 }),
  money({ type: "profit_paid", date: "2026-11-02", personId: ARIF, amount: 30_000 }),
  money({ type: "profit_reinvested", date: "2026-11-03", personId: ARIF, amount: 40_000 }),
  money({ type: "capital_in", date: "2026-11-04", personId: SUMON, amount: 100_000 }),
  money({ type: "capital_out", date: "2026-11-05", personId: ARIF, amount: 20_000 }),
  kamalPaid,
  money({ ...payKamal, date: "2026-11-07", reversesId: kamalPaid.id }), // its reversal
  // A missed customer credit of ৳1,000: D = −1,000, which resolves the opening difference.
  money({
    type: "opening_correction",
    date: "2026-11-20",
    openingKind: "customer_due",
    customerId: CUST,
    amount: -100_000,
  }),
];
const allocations: Allocation[] = [
  {
    month: "2026-10-01",
    personId: KAMAL,
    kind: "cash",
    basis: 1_000_000,
    ratePct: 2,
    amount: 20_000,
  },
  { month: "2026-10-01", personId: ARIF, kind: "partner", amount: 90_000 },
  { month: "2026-10-01", personId: SUMON, kind: "partner", amount: 90_000 },
];
const data: BooksData = {
  entries,
  partners: PARTNERS,
  allocations,
  closed: ["2026-10-01"],
  cards: [],
  billDates: [],
};
const types = new Map(entries.map((e) => [e.id, e.table === "money" ? e.type : e.table]));
const typeOf = (id: string) => types.get(id);
const setup = [
  {
    id: KAMAL,
    name: "Kamal",
    kind: "investor" as const,
    profitSharePct: null,
    note: "managed by Arif",
    active: true,
  },
  {
    id: SUMON,
    name: "Sumon",
    kind: "partner" as const,
    profitSharePct: "50.000",
    note: null,
    active: true,
  },
  {
    id: ARIF,
    name: "Arif",
    kind: "partner" as const,
    profitSharePct: "50.000",
    note: null,
    active: true,
  },
];

const at = (asOf: string) => {
  const books = computeBooks(data, asOf);
  expectBalanced(books.posted, asOf, allocations, data.closed);
  return books;
};

describe("4.5 people list and detail", () => {
  it("U4.5.1 rows carry each person's capital, profit owed and unresolved opening difference, in Setup's order", () => {
    const rows = peopleRows(setup, at("2026-11-10"));
    expect(rows.map((r) => [r.name, r.capital, r.profitOwed, r.openingDifference])).toEqual([
      ["Kamal", 0, 120_000, null],
      ["Sumon", 500_000, 90_000, 50_000],
      ["Arif", 420_000, 20_000, 50_000],
    ]);
  });

  it("U4.5.2 capital history: newest first with the running balance; reinvested profit is capital in", () => {
    const books = at("2026-11-10");
    const { capital } = personDetail(ARIF, books, allocations, "2026-11-10", typeOf);
    expect(capital.map((l) => [typeOf(l.entryId), l.amount, l.balance])).toEqual([
      ["capital_out", -20_000, 420_000],
      ["profit_reinvested", 40_000, 440_000],
      ["opening", 400_000, 400_000],
    ]);
    expect(capital[0].balance).toBe(books.capital[ARIF]);
  });

  it("U4.5.3 profit allocated per closed month / paid / reinvested / owed; a reversed payment nets out", () => {
    const books = at("2026-11-10");
    const arif = personDetail(ARIF, books, allocations, "2026-11-10", typeOf);
    expect(arif.profit).toEqual({
      allocated: 90_000,
      opening: 0,
      paid: 30_000,
      reinvested: 40_000,
      owed: 20_000,
    });
    const kamal = personDetail(KAMAL, books, allocations, "2026-11-10", typeOf);
    expect(kamal.allocations).toEqual([
      {
        month: "2026-10",
        personId: KAMAL,
        kind: "cash",
        basis: 1_000_000,
        ratePct: 2,
        amount: 20_000,
      },
    ]);
    expect(kamal.profit).toEqual({
      allocated: 20_000,
      opening: 100_000,
      paid: 0,
      reinvested: 0,
      owed: 120_000,
    });
    expect(kamal.profitMoves.map((l) => l.amount)).toEqual([10_000, -10_000, 100_000]);
    for (const { profit: p } of [arif, kamal]) {
      expect(sub(sub(add(p.allocated, p.opening), p.paid), p.reinvested)).toBe(p.owed);
    }
    // Before the close, October's allocations don't count (SRS §7).
    const open = computeBooks({ ...data, closed: [] }, "2026-11-10");
    expectBalanced(open.posted, "2026-11-10", allocations, []);
    expect(personDetail(KAMAL, open, allocations, "2026-11-10", typeOf).allocations).toEqual([]);
  });

  it("U4.5.4 the opening difference shows until its net total is 0 (SRS §5)", () => {
    const rows = peopleRows(setup, at("2026-11-30"));
    expect(rows.map((r) => r.openingDifference)).toEqual([null, null, null]);
    expect(rows.map((r) => r.capital)).toEqual([0, 500_000, 420_000]);
  });
});
