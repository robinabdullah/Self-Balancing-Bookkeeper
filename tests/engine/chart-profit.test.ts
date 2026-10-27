import { describe, expect, it } from "vitest";
import {
  CARD_FEES,
  type DatedLines,
  categoryShares,
  expenseSeries,
  netProfitSeries,
  profitCharts,
  profitsFor,
  salesProfitByDay,
  wholeMonths,
} from "@mbl/domain/charts/profit";
import { chartPeriod } from "@mbl/domain/charts/period";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import { computeClose, monthProfit, nextToClose } from "@mbl/domain/engine/months";
import type { Entry } from "@mbl/domain/engine/post";
import { add } from "@mbl/domain/money";
import { monthList } from "@mbl/domain/months-view";
import { salesReport } from "@mbl/domain/sales-report";
import { PARTNERS, expectBalanced } from "./invariant";

// CR-041 (D-064, clarified 2026-10-24): the Profit tab's figures tie out to the Months list, the
// month page and the Sales report. Synthetic ids and amounts only (D-014).
const [ARIF] = PARTNERS.map((p) => p.id);
const CUST = "cust-1";
const SUPP = "supp-1";
const CARD = { id: "card-1", statementDay: 5, dueDay: 20 };
const MODEL = "model-1";
const COST = 1_000_000;

let seq = 0;
const stored = (entry: Entry): StoredEntry => {
  seq += 1;
  return {
    ...entry,
    id: `p-${seq}`,
    createdAt: `${entry.date}T10:00:00.${String(seq).padStart(3, "0")}Z`,
  };
};
const sale = (date: string, qty: number, unitPrice: number) =>
  stored({ table: "sale", date, customerId: CUST, lines: [{ qty, unitPrice, unitCost: COST }] });
const expense = (date: string, category: string, amount: number, more = {}) =>
  stored({ table: "money", type: "expense", date, source: "cash", category, amount, ...more });

const augSale = sale("2026-08-10", 2, 1_200_000); // profit 400,000
const augReturn = stored({
  table: "return",
  kind: "customer",
  date: "2026-08-20",
  customerId: CUST,
  lines: [{ qty: 1, unitAmount: 1_200_000, unitCost: COST }], // profit −200,000
});
const sepSale = sale("2026-09-05", 3, 1_500_000); // profit 1,500,000
const octOther = expense("2026-10-02", "other", 80_000);
const novSale = sale("2026-11-03", 1, 1_300_000); // profit 300,000

const entries: StoredEntry[] = [
  stored({
    table: "money",
    type: "opening",
    date: "2026-08-01",
    openingKind: "cash",
    amount: 50_000_000,
  }),
  stored({
    table: "money",
    type: "opening",
    date: "2026-08-01",
    openingKind: "capital",
    personId: ARIF,
    amount: 50_000_000,
  }),
  stored({
    table: "purchase",
    date: "2026-08-02",
    source: "supplier_credit",
    supplierId: SUPP,
    lines: [{ qty: 10, unitCost: COST }],
  }),
  augSale,
  augReturn,
  expense("2026-08-25", "salary", 300_000),
  sepSale,
  expense("2026-09-06", "delivery", 100_000),
  stored({ table: "money", type: "card_fee", date: "2026-09-07", cardId: CARD.id, amount: 50_000 }),
  octOther,
  expense("2026-10-03", "rent", 200_000),
  novSale,
  // October's "other" expense reversed in November: it nets in November, its own month.
  expense("2026-11-01", "other", 80_000, { reversesId: octOther.id }),
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
// September closed on 2 Oct: Profit(Sep) = 1,500,000 − 100,000 − 50,000 = 1,350,000.
const sepSnapshot = monthProfit(computeBooks(base, "2026-10-02").posted, "2026-09", "2026-10-02");
const allocations = computeClose(sepSnapshot, [], PARTNERS);
const data: BooksData = { ...base, allocations, closed: ["2026-09-01"] };
const books = computeBooks(data, today);
const closes = [{ month: "2026-09-01", closeDate: "2026-10-02" }];
const rows = monthList(
  books.months,
  closes,
  nextToClose(data.closed, "2026-08-01", today),
  "2026-11",
);
const MONTHS = ["2026-08", "2026-09", "2026-10", "2026-11"];

const lineOf = (e: StoredEntry) => {
  if (e.table === "sale") {
    return e.lines.map((l) => ({
      saleId: e.id,
      customerId: CUST,
      modelId: MODEL,
      reversal: false,
      date: e.date,
      ...l,
    }));
  }
  return [];
};
const lines: DatedLines = {
  sold: entries.flatMap(lineOf),
  returned: [
    {
      customerId: CUST,
      modelId: MODEL,
      qty: 1,
      unitAmount: 1_200_000,
      unitCost: COST,
      reversal: false,
      date: augReturn.date,
    },
  ],
};
const sumOf = (ns: number[]) => ns.reduce((a, b) => add(a, b), 0);

describe("CR-041 Profit tab (D-064)", () => {
  it("U-CR-041.1 net profit per month = the Months list rows; a closed month = Σ its allocations", () => {
    const series = netProfitSeries(rows, MONTHS);
    const listed = new Map(rows.map((r) => [r.month, r.profit]));
    expect(series.map((p) => p.amount)).toEqual(MONTHS.map((m) => listed.get(m)));
    expect(series.map((p) => [p.key, p.amount])).toEqual([
      ["2026-08", -100_000], // 400,000 − 200,000 − 300,000
      ["2026-09", 1_350_000],
      ["2026-10", -280_000],
      ["2026-11", 380_000], // 300,000 + the reversed 80,000
    ]);
    expect(series[1].amount).toBe(sumOf(allocations.map((a) => a.amount)));

    // 6M from the opening (1 Aug) to today is longer than 62 days: by month.
    const period = chartPeriod({}, today, "2026-08-01");
    expect(period.view).toBe("month");
    const charts = profitCharts({
      period,
      window: wholeMonths(period, "2026-08-01", today),
      rows,
      posted: books.posted,
      snapshots: { "2026-09": sepSnapshot },
      lines,
      today,
    });
    expect(charts.profit.points).toEqual(series);
    expect(charts.profit.total).toEqual({ amount: 1_350_000, prev: null });
    expect(sumOf(charts.breakdown["2026-10"].map((l) => l.amount))).toBe(-280_000);
    expectBalanced(books.posted, today, allocations, data.closed);
  });

  it("U-CR-041.2 Σ day sales profit = the Sales report's net sales profit; a month = sale + customer return", () => {
    const days = salesProfitByDay(books.posted, "2026-08-01", today);
    expect(days[0].key).toBe("2026-08-01");
    expect(days.at(-1)!.key).toBe(today);
    const report = salesReport(lines.sold, lines.returned);
    expect(sumOf(days.map((d) => d.amount))).toBe(report.netProfit);
    expect(report.netProfit).toBe(2_000_000);

    const aug = salesProfitByDay(books.posted, "2026-08-01", "2026-08-31");
    const { components } = monthProfit(books.posted, "2026-08", today);
    expect(sumOf(aug.map((d) => d.amount))).toBe(add(components.sale, components.customer_return));
    expect(aug.find((d) => d.key === "2026-08-20")!.amount).toBe(-200_000);
    expectBalanced(books.posted, today, allocations, data.closed);
  });

  it("U-CR-041.3 each month's categories + Card fees = −(expense + fee); a reversed expense nets in its own month", () => {
    const profits = profitsFor(MONTHS, { "2026-09": sepSnapshot }, books.posted, today);
    for (const m of MONTHS) {
      const p = profits[m];
      const parts = [...Object.keys(p.expenses), CARD_FEES].map(
        (c) => expenseSeries(profits, [m], c)[0].amount,
      );
      const all = expenseSeries(profits, [m])[0].amount;
      expect(sumOf(parts)).toBe(all);
      expect(all).toBe(0 - add(p.components.expense, p.components.fee));
    }
    expect(expenseSeries(profits, ["2026-10", "2026-11"], "other").map((p) => p.amount)).toEqual([
      80_000, -80_000,
    ]);
    expect(expenseSeries(profits, ["2026-09"], CARD_FEES)[0].amount).toBe(50_000);
    expectBalanced(books.posted, today, allocations, data.closed);
  });

  it("lists the categories largest first with share and change, Card fees last", () => {
    const profits = profitsFor(MONTHS, {}, books.posted, today);
    const rows = categoryShares(profits, ["2026-10", "2026-11"], ["2026-08", "2026-09"]);
    // Oct–Nov: rent 200,000; other 80,000 − 80,000 = 0 now and before, so it is left out. Aug–Sep's
    // categories stay with ৳0 and their change.
    expect(rows.map((r) => [r.label, r.amount, r.share, r.change])).toEqual([
      ["Rent", 200_000, 100, 200_000],
      ["Delivery", 0, 0, -100_000],
      ["Salary", 0, 0, -300_000],
      ["Card fees", 0, 0, -50_000],
    ]);
    const noPrev = categoryShares(profits, ["2026-09"], null);
    expect(noPrev.map((r) => [r.label, r.amount, r.share, r.change])).toEqual([
      ["Delivery", 100_000, 66.7, null],
      ["Card fees", 50_000, 33.3, null],
    ]);
  });

  it("profitsFor uses a closed month's snapshot, else the month's profit as known today", () => {
    const stale = { ...sepSnapshot, total: 1 };
    const profits = profitsFor(["2026-09", "2026-10"], { "2026-09": stale }, books.posted, today);
    expect(profits["2026-09"]).toBe(stale);
    expect(profits["2026-10"]).toEqual(monthProfit(books.posted, "2026-10", today));
  });

  it("wholeMonths: the months touched, the same number before (from the opening), and a part month", () => {
    expect(wholeMonths({ from: "2026-08-01", to: today }, "2026-08-01", today)).toEqual({
      months: MONTHS,
      prev: null,
      partial: false,
    });
    expect(wholeMonths({ from: "2026-10-01", to: today }, "2026-08-01", today)).toEqual({
      months: ["2026-10", "2026-11"],
      prev: ["2026-08", "2026-09"],
      partial: false,
    });
    expect(wholeMonths({ from: "2026-09-15", to: "2026-10-20" }, "2026-08-01", today)).toEqual({
      months: ["2026-09", "2026-10"],
      prev: null, // July is before the opening month
      partial: true,
    });
  });
});
