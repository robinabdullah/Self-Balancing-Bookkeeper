import { describe, expect, it } from "vitest";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import { computeClose, monthProfit } from "@mbl/domain/engine/months";
import type { Entry, MoneyEntry } from "@mbl/domain/engine/post";
import { splitShares } from "@mbl/domain/money";
import { PARTNERS } from "./invariant";

// Synthetic ids only (D-014).
const [ARIF, SUMON] = PARTNERS.map((p) => p.id);
const SELIM = "cust-selim";
const MILON = "cust-milon";
const SUPP = "supp-1";
const CARD = "card-1";
const OPEN = "2026-10-01";

let seq = 0;
const stored = (entry: Entry): StoredEntry => {
  seq += 1;
  return { ...entry, id: `e-${seq}`, createdAt: `${entry.date}T10:00:00.${seq}Z` };
};
const money = (m: Omit<MoneyEntry, "table">) => stored({ table: "money", ...m });
type OpeningKind = NonNullable<MoneyEntry["openingKind"]>;
const opening = (openingKind: OpeningKind, amount: number, more: Partial<MoneyEntry> = {}) =>
  money({ type: "opening", openingKind, amount, date: OPEN, ...more });
const data = (entries: StoredEntry[], more: Partial<BooksData> = {}): BooksData => ({
  entries,
  partners: PARTNERS,
  allocations: [],
  closed: [],
  cards: [{ id: CARD, statementDay: 5, dueDay: 20 }],
  billDates: [],
  ...more,
});

describe("U2.8.1 S16: computeBooks balances a mixed story", () => {
  const entries = [
    money({ type: "capital_in", date: OPEN, amount: 50_000_000, personId: ARIF }),
    stored({
      table: "purchase",
      date: "2026-10-02",
      source: "supplier_credit",
      supplierId: SUPP,
      lines: [{ qty: 10, unitCost: 1_770_000 }],
    }),
    stored({
      table: "purchase",
      date: "2026-10-03",
      source: "card",
      cardId: CARD,
      emiMonths: 6,
      lines: [{ qty: 1, unitCost: 6_000_000 }],
    }),
    stored({
      table: "sale",
      date: "2026-10-04",
      customerId: MILON,
      lines: [{ qty: 3, unitPrice: 1_800_000, unitCost: 1_770_000 }],
    }),
    money({
      type: "supplier_payment",
      date: "2026-10-05",
      supplierId: SUPP,
      amount: 10_000_000,
      source: "cash",
    }),
    money({
      type: "expense",
      date: "2026-10-06",
      amount: 150_000,
      category: "rent",
      source: "cash",
    }),
  ];
  const books = computeBooks(data(entries), "2026-10-07");

  it("both sides of the invariant agree", () => {
    expect(books.invariant.difference).toBe(0);
    // cash 39,850,000 + stock 18,390,000 + dues 5,400,000 − card 6,000,000 − supplier 7,700,000
    //   = capital 50,000,000 + undistributed (sale profit 90,000 − rent 150,000)
    expect(books.invariant).toEqual({ netAssets: 49_940_000, equity: 49_940_000, difference: 0 });
  });

  it("totals come from the posted effects", () => {
    expect(books.cash).toBe(50_000_000 - 10_000_000 - 150_000);
    expect(books.stock).toBe(17_700_000 + 6_000_000 - 5_310_000);
    expect(books.customerDues).toBe(5_400_000);
    expect(books.supplierDues).toBe(17_700_000 - 10_000_000);
    expect(books.cardBalances).toBe(6_000_000);
    expect(books.capital).toEqual({ [ARIF]: 50_000_000 });
    expect(books.undistributed).toBe(90_000 - 150_000);
    expect(books.customers[MILON].balance).toBe(5_400_000);
    expect(books.suppliers[SUPP].balance).toBe(7_700_000);
    expect(books.months).toEqual([{ month: "2026-10", profit: -60_000, closed: false }]);
  });

  it("the card bills use the entry's EMI months", () => {
    expect(books.cards[CARD].bills.map((b) => b.amount)).toEqual(Array(6).fill(1_000_000));
  });
});

describe("U2.8.2 S17: an opening correction after October is closed", () => {
  const before = [
    money({ type: "capital_in", date: OPEN, amount: 2_000_000, personId: ARIF }),
    stored({
      table: "purchase",
      date: "2026-10-02",
      source: "cash",
      lines: [{ qty: 1, unitCost: 1_500_000 }],
    }),
    stored({
      table: "sale",
      date: "2026-10-15",
      customerId: SELIM,
      lines: [{ qty: 1, unitPrice: 2_000_000, unitCost: 1_500_000 }],
    }),
  ];
  const october = monthProfit(
    computeBooks(data(before), "2026-10-31").posted,
    "2026-10",
    "2026-10-31",
  );
  const closeData = (entries: StoredEntry[]) =>
    data(entries, {
      allocations: computeClose(october, [], PARTNERS),
      closed: ["2026-10"],
    });
  const correction = money({
    type: "opening_correction",
    openingKind: "customer_due",
    customerId: SELIM,
    amount: 2_000_000,
    date: "2026-11-05",
  });
  const was = computeBooks(closeData(before), "2026-11-05");
  const now = computeBooks(closeData([...before, correction]), "2026-11-05");

  it("Selim's due +20,000; opening difference +20,000 (10,000 per partner)", () => {
    expect(now.customers[SELIM].balance - was.customers[SELIM].balance).toBe(2_000_000);
    expect(now.openingDifference.total - was.openingDifference.total).toBe(2_000_000);
    expect(now.openingDifference.byPerson).toEqual({ [ARIF]: 1_000_000, [SUMON]: 1_000_000 });
  });

  it("no month's profit changes; the invariant holds", () => {
    expect(now.months).toEqual(was.months);
    expect(now.undistributed).toBe(was.undistributed);
    expect(now.profitOwed).toEqual(was.profitOwed);
    expect(was.invariant.difference).toBe(0);
    expect(now.invariant.difference).toBe(0);
  });
});

describe("U2.8.3 the opening import's residual is the opening difference", () => {
  const items = [
    opening("cash", 100_000_000),
    opening("customer_due", 30_000_000, { customerId: MILON }),
    opening("supplier_due", 10_000_000, { supplierId: SUPP }),
    opening("card_balance", 5_000_000, { cardId: CARD }),
    opening("capital", 50_000_000, { personId: ARIF }),
    opening("capital", 50_000_000, { personId: SUMON }),
    opening("profit_owed", 10_000_000, { personId: ARIF }),
    stored({
      table: "purchase",
      date: OPEN,
      source: "opening",
      lines: [{ qty: 2, unitCost: 10_000_001 }],
    }),
  ];
  // assets 100,000,000 + 30,000,000 + 20,000,002 − liabilities 15,000,000 − equity 110,000,000
  const residual = 25_000_002;

  it("before it is booked, the invariant is off by the residual", () => {
    expect(computeBooks(data(items), OPEN).invariant.difference).toBe(residual);
  });

  // The import splits it between the partners by profit share (SRS §9).
  const shares = splitShares(
    residual,
    PARTNERS.map((p) => p.pct),
  );
  const booked = [
    ...items,
    ...PARTNERS.map((p, i) => opening("opening_difference", shares[i], { personId: p.id })),
  ];

  it("booked as opening difference → ✓, not resolved", () => {
    const books = computeBooks(data(booked), OPEN);
    expect(books.invariant.difference).toBe(0);
    expect(books.openingDifference).toEqual({
      byPerson: { [ARIF]: 12_500_001, [SUMON]: 12_500_001 },
      total: residual,
      resolved: false,
    });
    expect(books.capital).toEqual({ [ARIF]: 50_000_000, [SUMON]: 50_000_000 });
  });

  it("resolved once corrections bring its net total to 0", () => {
    // A missed supplier due (a liability item): D = −X.
    const fix = money({
      type: "opening_correction",
      openingKind: "supplier_due",
      supplierId: SUPP,
      amount: residual,
      date: "2026-10-10",
    });
    const books = computeBooks(data([...booked, fix]), "2026-10-10");
    expect(books.openingDifference).toEqual({
      byPerson: { [ARIF]: 0, [SUMON]: 0 },
      total: 0,
      resolved: true,
    });
    expect(books.invariant.difference).toBe(0);
  });
});

describe("U2.8.4 the cash warning (D-018)", () => {
  const entries = [
    money({ type: "capital_in", date: "2026-10-10", amount: 10_000_000, personId: ARIF }),
    stored({
      table: "purchase",
      date: "2026-10-10",
      source: "supplier_credit",
      supplierId: SUPP,
      lines: [{ qty: 1, unitCost: 10_500_000 }],
    }),
    money({
      type: "supplier_payment",
      date: "2026-10-12",
      supplierId: SUPP,
      amount: 10_500_000,
      source: "cash",
    }),
    money({ type: "capital_in", date: "2026-10-14", amount: 1_000_000, personId: SUMON }),
  ];
  const at = (asOf: string) => computeBooks(data(entries), asOf);

  it("cash −5,000 on 12 Oct, back above 0 on 14 Oct → the first negative date is 12 Oct", () => {
    expect(at("2026-10-12").cash).toBe(-500_000);
    expect(at("2026-10-14").cash).toBe(500_000);
    expect(at("2026-10-14").firstNegativeCash).toBe("2026-10-12");
    expect(at("2026-10-14").invariant.difference).toBe(0);
  });

  it("none before cash goes negative", () => {
    expect(at("2026-10-11").firstNegativeCash).toBeNull();
  });
});
