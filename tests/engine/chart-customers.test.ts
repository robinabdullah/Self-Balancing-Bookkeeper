import { describe, expect, it } from "vitest";
import { customerCharts, dueFlows, dueTrend, lowestDues } from "@mbl/domain/charts/customers";
import { entryKinds, standing } from "@mbl/domain/charts/kinds";
import { chartPeriod } from "@mbl/domain/charts/period";
import { positionAt } from "@mbl/domain/charts/position";
import { salesIn } from "@mbl/domain/charts/profit";
import { addDays } from "@mbl/domain/dates";
import type { Statement, StatementRow } from "@mbl/domain/engine/customers";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import type { Entry } from "@mbl/domain/engine/post";
import { sumOf, topGroups } from "@mbl/domain/monthly-pack";
import { add, sub } from "@mbl/domain/money";
import { PARTNERS, expectBalanced } from "./invariant";

// CR-043 (D-064, clarified 2026-10-24): the Customers tab and the Due trend. Given = sales + cash
// given, Collected = payments, Other = the rest by kind; the dues tie out to `positionAt` and
// `computeBooks`. Synthetic ids and amounts only (D-014).
const [ARIF] = PARTNERS.map((p) => p.id);
const CUST = "cust-1";
const CUST2 = "cust-2";
const WALK = "walk-in";
const SUPP = "supp-1";
const COST = 1_000_000;
const PRICE = 1_500_000;

let seq = 0;
const stored = (entry: Entry): StoredEntry => {
  seq += 1;
  return {
    ...entry,
    id: `c-${seq}`,
    createdAt: `${entry.date}T10:00:00.${String(seq).padStart(3, "0")}Z`,
  };
};
const money = (type: string, date: string, amount: number, more = {}) =>
  stored({ table: "money", type, date, amount, ...more } as Entry);
const sale = (date: string, customerId: string, qty = 1) =>
  stored({ table: "sale", date, customerId, lines: [{ qty, unitPrice: PRICE, unitCost: COST }] });

const payment = money("customer_payment", "2026-08-12", 2_000_000, { customerId: CUST });
const entries: StoredEntry[] = [
  money("opening", "2026-08-01", 50_000_000, { openingKind: "cash" }),
  money("opening", "2026-08-01", 51_000_000, { openingKind: "capital", personId: ARIF }),
  money("opening", "2026-08-01", 1_000_000, { openingKind: "customer_due", customerId: CUST }),
  stored({
    table: "purchase",
    date: "2026-08-02",
    source: "supplier_credit",
    supplierId: SUPP,
    lines: [{ qty: 10, unitCost: COST }],
  }),
  sale("2026-08-10", CUST, 3),
  money("customer_cash_given", "2026-08-11", 500_000, { customerId: CUST }),
  payment,
  stored({
    table: "return",
    kind: "customer",
    date: "2026-08-15",
    customerId: CUST,
    lines: [{ qty: 1, unitAmount: 1_400_000, unitCost: COST }],
  }),
  money("customer_discount", "2026-08-20", 100_000, { customerId: CUST }),
  // The payment reversed: Collected falls in September.
  money("customer_payment", "2026-09-03", 2_000_000, { customerId: CUST, reversesId: payment.id }),
  money("customer_profit_share", "2026-09-05", 200_000, {
    customerId: CUST,
    settleMode: "added_to_due",
    forMonth: "2026-09",
  }),
  stored({
    table: "purchase",
    date: "2026-09-10",
    source: "customer_offset",
    customerId: CUST,
    lines: [{ qty: 1, unitCost: COST }],
  }),
  stored({
    table: "return",
    kind: "purchase",
    date: "2026-09-12",
    supplierId: SUPP,
    refundTo: "customer",
    customerId: CUST,
    reason: "returned",
    lines: [{ qty: 1, unitAmount: COST, unitCost: COST }],
  }),
  money("opening_correction", "2026-09-15", 300_000, {
    openingKind: "customer_due",
    customerId: CUST2,
  }),
  sale("2026-10-05", WALK),
  money("customer_payment", "2026-10-05", PRICE, { customerId: WALK }),
  sale("2026-10-06", CUST2),
];

const today = "2026-11-10";
const FIRST = "2026-08-01";
const data: BooksData = {
  entries,
  partners: PARTNERS,
  allocations: [],
  closed: [],
  cards: [],
  billDates: [],
};
const books = computeBooks(data, today);
const kinds = entryKinds(entries);

describe("CR-043 Customers tab (D-064)", () => {
  it("U-CR-043.1 per bucket Given − Collected + Other = the change in total dues (every kind, Walk-in, a reversal)", () => {
    for (const params of [{}, { from: "2026-10-01", to: today }]) {
      const period = chartPeriod(params, today, FIRST);
      const flows = dueFlows(books.posted, kinds, WALK, period);
      for (const b of flows.buckets) {
        const bucket = period.buckets.find((x) => x.key === b.key)!;
        const [before, end] = positionAt(books.posted, [addDays(bucket.start, -1), bucket.end]);
        expect(b.change).toBe(sub(end.customerDues, before.customerDues));
        expect(add(sub(b.given, b.collected), b.other)).toBe(b.change);
      }
    }

    const period = chartPeriod({}, today, FIRST);
    expect(period.view).toBe("month");
    const flows = dueFlows(books.posted, kinds, WALK, period);
    const [aug, sep, oct, nov] = flows.buckets;
    expect(aug).toMatchObject({ given: 3 * PRICE + 500_000, collected: 2_000_000 });
    expect(sep.collected).toBe(-2_000_000); // the reversed payment
    expect(oct.given).toBe(PRICE); // Cust 2's sale; Walk-in's is not Given
    expect(oct.collected).toBe(0); // Walk-in's payment is not Collected
    expect(nov.change).toBe(0);
    expect(Object.fromEntries(flows.other.map((o) => [o.kind, o.amount]))).toEqual({
      opening: 1_000_000,
      customer_return: -1_400_000,
      customer_discount: -100_000,
      customer_profit_share: 200_000,
      purchase: -COST,
      purchase_return: COST,
      opening_correction: 300_000,
      // walk_in nets to 0, so it isn't listed
    });
    expect(flows.total).toEqual({ amount: books.customerDues, prev: null });

    // A day window's "vs prev" is the change over the same days right before.
    const days = chartPeriod({ from: "2026-10-01", to: today }, today, FIRST);
    const [p0, p1] = positionAt(books.posted, [addDays(days.prev!.from, -1), days.prev!.to]);
    expect(dueFlows(books.posted, kinds, WALK, days).total.prev).toBe(
      sub(p1.customerDues, p0.customerDues),
    );
    expectBalanced(books.posted, today);
  });

  it("U-CR-043.1 the tab: total dues at each bucket end, the last = the books; Given's sales + Walk-in's = the Sales report", () => {
    const period = chartPeriod({}, today, FIRST);
    const sold = entries
      .filter((e) => e.table === "sale")
      .flatMap((e) =>
        e.lines.map((l) => ({
          date: e.date,
          saleId: e.id,
          customerId: e.customerId,
          modelId: "m",
          ...l,
          reversal: false,
        })),
      );
    const report = salesIn({ sold, returned: [] }, period.from, period.to);
    const charts = customerCharts({
      period,
      posted: books.posted,
      kinds,
      customers: books.customers,
      walkIn: WALK,
      byCustomer: report.byCustomer,
      by: "sales",
      today,
    });
    expect(charts.dues.at(-1)!.amount).toBe(books.customerDues);
    expect(charts.start).toBe(1_000_000); // the opening due, on the first day
    const given = sumOf(charts.flows.buckets, (b) => b.given);
    expect(add(sub(given, 500_000), PRICE)).toBe(report.sales); // − cash given + Walk-in's sale
    expect(charts.top.map((g) => g.id)).toEqual([CUST, CUST2, WALK]); // Walk-in included
    expectBalanced(books.posted, today);
  });

  it("U-CR-043.2 dueTrend: a hand-worked Average (a .5 tie, a credit day); Lowest/Highest at day end; a reversed payment isn't Last paid", () => {
    const row = (date: string, amount: number, balance: number): StatementRow => ({
      entryId: `${date}-${amount}`,
      date,
      amount,
      balance,
    });
    const rows = [
      row("2026-09-20", 1_000_000, 1_000_000),
      row("2026-10-02", -1_500_000, -500_000), // a credit day
      row("2026-10-03", -600_000, -1_100_000), // a dip within the day: not the Lowest
      row("2026-10-03", 2_000_300, 900_300),
      row("2026-10-06", 100_000, 1_000_300), // after the window
    ];
    // Day ends 10,000 · −5,000 · 9,003 · 9,003 taka: Σ 23,006 ÷ 4 = 5,751.5 → ৳5,752 (half away
    // from zero).
    const t = dueTrend(rows, "2026-10-01", "2026-10-04", "2026-10-10", ["2026-09-01"]);
    expect(t.points.map((p) => p.amount)).toEqual([1_000_000, -500_000, 900_300, 900_300]);
    expect(t.points.map((p) => p.key)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(t.average).toBe(575_200);
    expect(t.lowest).toBe(-500_000);
    expect(t.highest).toBe(1_000_000);
    expect(t.now).toBe(1_000_300);
    expect(t.lastPaid).toEqual({ date: "2026-09-01", days: 39 });
    expect(dueTrend(rows, "2026-10-01", "2026-10-04", "2026-10-10", []).lastPaid).toBeNull();

    // On the books: the only payment was reversed, so there's no Last paid; Now = the page's due.
    const paid = (id: string) =>
      standing(entries, "customer_payment")
        .filter((e) => e.table === "money" && e.customerId === id)
        .map((e) => e.date);
    const s = books.customers[CUST];
    const trend = dueTrend(s.rows, FIRST, today, today, paid(CUST));
    expect(trend.lastPaid).toBeNull();
    expect(trend.now).toBe(s.balance);
    expect(trend.points).toHaveLength(102);
    expect(paid(WALK)).toEqual(["2026-10-05"]);
    expectBalanced(books.posted, today);
  });

  it("U-CR-043.3 lowestDues leaves out Walk-in and lowest ≤ 0, highest first", () => {
    const of = (...rows: [string, number][]): Statement => {
      let balance = 0;
      return {
        balance: rows.reduce((b, [, a]) => add(b, a), 0),
        rows: rows.map(([date, amount]) => {
          balance = add(balance, amount);
          return { entryId: date, date, amount, balance };
        }),
      };
    };
    const customers = {
      a: of(["2026-09-01", 500_000], ["2026-10-20", 100_000]),
      b: of(["2026-09-01", 900_000], ["2026-10-03", -900_000]), // paid off: lowest 0
      c: of(["2026-09-01", 2_000_000]),
      d: of(["2026-10-02", 3_000_000]), // started inside the window: lowest 0
      e: of(["2026-09-01", -200_000]), // a credit
      [WALK]: of(["2026-09-01", 5_000_000]),
    };
    expect(lowestDues(customers, WALK, "2026-10-01", "2026-10-31", today)).toEqual([
      { id: "c", lowest: 2_000_000, now: 2_000_000 },
      { id: "a", lowest: 500_000, now: 600_000 },
    ]);
    expectBalanced(books.posted, today);
  });

  it("CR-043.2 topGroups: by sales or profit, the top n then Other, totalling the sales", () => {
    const g = (id: string, sales: number, profit: number) => ({
      id,
      pieces: 1,
      sales,
      profit,
      avgPieces: 1,
      avg: null,
    });
    const groups = [g("a", 300, 10), g("b", 200, 50), g("c", 100, 30), g("d", 100, 30)];
    expect(topGroups(groups, 2).map((x) => x.id)).toEqual(["a", "b", "others"]);
    const byProfit = topGroups(groups, 2, "profit");
    expect(byProfit.map((x) => x.id)).toEqual(["b", "c", "others"]);
    expect(byProfit[2]).toMatchObject({ pieces: 2, sales: 400, profit: 40 });
    expect(sumOf(byProfit, (x) => x.sales)).toBe(sumOf(groups, (x) => x.sales));
    expect(topGroups(groups, 10, "profit").map((x) => x.id)).toEqual(["b", "c", "d", "a"]);
  });
});
