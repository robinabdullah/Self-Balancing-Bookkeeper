import { describe, expect, it } from "vitest";
import { chartPeriod } from "@mbl/domain/charts/period";
import { dailyCash, moneyCharts, positionAt, profitShares } from "@mbl/domain/charts/position";
import { wholeMonths } from "@mbl/domain/charts/profit";
import { cashBook } from "@mbl/domain/cash-book";
import { breakdown, cardAlerts } from "@mbl/domain/dashboard";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import { type Allocation, computeClose, monthProfit } from "@mbl/domain/engine/months";
import type { Entry } from "@mbl/domain/engine/post";
import { add, sub } from "@mbl/domain/money";
import { PARTNERS, expectBalanced } from "./invariant";

// CR-042 (D-064, clarified 2026-10-24): the Money tab's figures tie out to `computeBooks` (the
// Books balance sheet), the Cash book and the stored allocations. Synthetic ids and amounts only
// (D-014).
const [ARIF, SUMON] = PARTNERS.map((p) => p.id);
const NADIM = "person-nadim";
const CUST = "cust-1";
const SUPP = "supp-1";
const CARD = { id: "card-1", statementDay: 5, dueDay: 20 };
const COST = 1_000_000;

let seq = 0;
const stored = (entry: Entry): StoredEntry => {
  seq += 1;
  return {
    ...entry,
    id: `m-${seq}`,
    createdAt: `${entry.date}T10:00:00.${String(seq).padStart(3, "0")}Z`,
  };
};
const money = (type: string, date: string, amount: number, more = {}) =>
  stored({ table: "money", type, date, amount, ...more } as Entry);

const augOther = money("expense", "2026-08-25", 100_000, { source: "cash", category: "other" });
const entries: StoredEntry[] = [
  money("opening", "2026-08-01", 50_000_000, { openingKind: "cash" }),
  money("opening", "2026-08-01", 50_000_000, { openingKind: "capital", personId: ARIF }),
  stored({
    table: "purchase",
    date: "2026-08-02",
    source: "supplier_credit",
    supplierId: SUPP,
    lines: [{ qty: 10, unitCost: COST }],
  }),
  // A card EMI purchase: the whole cost counts in the card balance at once.
  stored({
    table: "purchase",
    date: "2026-08-05",
    source: "card",
    cardId: CARD.id,
    emiMonths: 6,
    lines: [{ qty: 2, unitCost: COST }],
  }),
  stored({
    table: "sale",
    date: "2026-08-10",
    customerId: CUST,
    lines: [{ qty: 3, unitPrice: 1_500_000, unitCost: COST }],
  }),
  money("customer_payment", "2026-08-12", 2_000_000, { customerId: CUST }),
  // 12,000,000 against a 10,000,000 due: a 2,000,000 supplier advance.
  money("supplier_payment", "2026-08-20", 12_000_000, { supplierId: SUPP, source: "cash" }),
  augOther,
  money("expense", "2026-08-26", 100_000, {
    source: "cash",
    category: "other",
    reversesId: augOther.id,
  }),
  money("card_payment", "2026-09-03", 500_000, { cardId: CARD.id }),
  // Cash 39,500,000 − 45,000,000: below 0 on 15 Sep, back above on 16 Sep. Sep is a loss.
  money("expense", "2026-09-15", 45_000_000, { source: "cash", category: "salary" }),
  money("capital_in", "2026-09-16", 10_000_000, { personId: ARIF }),
  stored({
    table: "sale",
    date: "2026-10-05",
    customerId: CUST,
    lines: [{ qty: 1, unitPrice: 1_500_000, unitCost: COST }],
  }),
];

const today = "2026-11-10";
const base: BooksData = {
  entries,
  partners: PARTNERS,
  allocations: [],
  closed: [],
  cards: [CARD],
  billDates: [],
};
// Aug closed on 2 Sep with Nadim's cash and card allocations; Sep (a loss) on 2 Oct.
const close = (month: string, on: string, investors: Allocation[]) => {
  const profit = monthProfit(computeBooks(base, on).posted, month, on);
  return [...investors, ...computeClose(profit, investors, PARTNERS)];
};
const nadim: Allocation[] = [
  { month: "2026-08-01", personId: NADIM, kind: "cash", basis: 0, ratePct: 0, amount: 100_000 },
  { month: "2026-08-01", personId: NADIM, kind: "card", basis: 0, ratePct: 0, amount: 50_000 },
];
const allocations = [
  ...close("2026-08", "2026-09-02", nadim),
  ...close("2026-09", "2026-10-02", []),
].map((a) => ({ ...a, month: `${a.month.slice(0, 7)}-01` }));
const closed = ["2026-08-01", "2026-09-01"];
const data: BooksData = { ...base, allocations, closed };
const books = computeBooks(data, today);
const MONTH_ENDS = ["2026-08-31", "2026-09-30", "2026-10-31", today];

describe("CR-042 Money tab (D-064)", () => {
  it("U-CR-042.1 positionAt = computeBooks(data, end) at every month end (opening, reversal, card EMI, supplier advance)", () => {
    const at = positionAt(books.posted, MONTH_ENDS);
    for (const [n, end] of MONTH_ENDS.entries()) {
      const b = computeBooks(data, end);
      const sheet = breakdown(b);
      expect(at[n]).toEqual({
        end,
        cash: b.cash,
        stock: b.stock,
        customerDues: b.customerDues,
        cardBalances: b.cardBalances,
        supplierDues: b.supplierDues,
        businessAssets: sheet.businessAssets,
        netWorth: sheet.netAssets,
      });
      expectBalanced(b.posted, end, allocations, closed);
    }
    // The supplier advance is a negative due; the EMI's whole cost is on the card.
    expect(at[0].supplierDues).toBe(-2_000_000);
    expect(at[0].cardBalances).toBe(2_000_000);
    expect(at[1].cardBalances).toBe(1_500_000);

    // The tab: one position per bucket end, the last = today's books; the base = the first day.
    const period = chartPeriod({}, today, "2026-08-01");
    const charts = moneyCharts({
      period,
      window: wholeMonths(period, "2026-08-01", today),
      posted: books.posted,
      allocations,
      closed,
      cards: books.cards,
      today,
    });
    expect(charts.positions.map((p) => p.end)).toEqual(MONTH_ENDS);
    expect(charts.positions.at(-1)!.netWorth).toBe(breakdown(books).netAssets);
    expect(charts.start.cash).toBe(computeBooks(data, "2026-08-01").cash);
    expect(charts.bills).toEqual(cardAlerts(books.cards, today));
  });

  it("U-CR-042.2 the last dailyCash point = the Cash book closing; days carry over; a negative day is marked", () => {
    const { points, below } = dailyCash(books.posted, "2026-08-01", today);
    expect(points[0].key).toBe("2026-08-01");
    expect(points.at(-1)!.key).toBe(today);
    expect(points.at(-1)!.amount).toBe(cashBook(books.posted, "2026-08-01", today).closing);
    expect(points.at(-1)!.amount).toBe(books.cash);
    // No cash moves on 13 Aug: it carries 12 Aug's closing.
    const day = (d: string) => points.find((p) => p.key === d)!.amount;
    expect(day("2026-08-13")).toBe(day("2026-08-12"));
    expect(day("2026-08-12")).toBe(52_000_000);
    expect(below).toEqual([{ key: "2026-09-15", label: "15 Sep 2026", amount: -5_500_000 }]);

    // A window that starts later opens with the cash before it.
    const sep = dailyCash(books.posted, "2026-09-10", "2026-09-20");
    expect(sep.points[0].amount).toBe(cashBook(books.posted, "2026-09-10", "2026-09-10").closing);
    expect(sep.below.map((p) => p.key)).toEqual(["2026-09-15"]);
    expectBalanced(books.posted, today, allocations, closed);
  });

  it("U-CR-042.3 profit shares Σ per closed month = its MonthRow.profit; a loss is negative; an open month is not allocated yet", () => {
    const months = ["2026-08", "2026-09", "2026-10", "2026-11"];
    const shares = profitShares(allocations, closed, months);
    const row = new Map(books.months.map((m) => [m.month, m]));
    for (const s of shares.filter((m) => m.closed)) {
      expect(s.total).toBe(row.get(s.key)!.profit);
      expect(Object.values(s.byPerson).reduce(add, 0)).toBe(s.total);
    }
    // Nadim's cash and card rows are one figure.
    expect(shares[0].byPerson[NADIM]).toBe(150_000);
    expect(shares[0].total).toBe(1_500_000);
    // September's loss: each partner's share is negative.
    expect(shares[1].byPerson[ARIF]).toBeLessThan(0);
    expect(shares[1].byPerson[SUMON]).toBeLessThan(0);
    expect(shares[1].total).toBe(-45_000_000);
    // October and November are open: not allocated yet.
    expect(shares.slice(2).map((s) => [s.closed, s.total])).toEqual([
      [false, 0],
      [false, 0],
    ]);
    expectBalanced(books.posted, today, allocations, closed);
  });
});

describe("CR-046 Business value's Business assets column (D-064)", () => {
  it("U-CR-046.1 each position's businessAssets = cash + stock + customer dues; less card and supplier dues = net worth", () => {
    for (const p of positionAt(books.posted, MONTH_ENDS)) {
      expect(p.businessAssets).toBe(add(add(p.cash, p.stock), p.customerDues));
      expect(sub(sub(p.businessAssets, p.cardBalances), p.supplierDues)).toBe(p.netWorth);
    }
    // Today's = the Books balance's Business assets.
    expect(positionAt(books.posted, [today])[0].businessAssets).toBe(
      breakdown(books).businessAssets,
    );
    expectBalanced(books.posted, today, allocations, closed);
  });
});
