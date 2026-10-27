import { describe, expect, it } from "vitest";
import { computeBooks } from "@/lib/engine/index";
import { add, sub } from "@/lib/money";
import { monthlyPack, packDates, sumOf, topGroups } from "@/lib/monthly-pack";
import { type ReturnedLine, type SoldLine, salesReport } from "@/lib/sales-report";
import { stockColumns, stockTotal } from "@/lib/stock-movement";
import {
  CARD,
  CUST,
  MA,
  MB,
  MC,
  TODAY,
  books,
  data,
  snapshots,
  stock,
  typeOf,
} from "./report-fixture";
import { expectBalanced } from "./invariant";

// CR-025 (D-045; UIDD §4.17): the Monthly pack's sections each tie out to the screen that already
// shows the figure: the Months page (profit), the balance chip (position, ✓), the stored
// allocations, the Sales report, the books' stock, the statements (dues), the cards and the Cash
// book. Opening is always last month's Closing. Synthetic data.

const tk = (n: number) => n * 100;
const OCT_SALES: [SoldLine[], ReturnedLine[]] = [
  [
    {
      saleId: "s",
      customerId: CUST,
      modelId: MB,
      qty: 1,
      unitPrice: tk(2_500),
      unitCost: tk(2_000),
      reversal: false,
    },
  ],
  [
    {
      customerId: CUST,
      modelId: MA,
      qty: 1,
      unitAmount: tk(1_500),
      unitCost: tk(1_000),
      reversal: false,
    },
  ],
];
const pack = (month: string, sales = salesReport([], [])) => {
  const { end, before } = packDates(month, TODAY);
  return {
    p: monthlyPack({
      month,
      today: TODAY,
      firstMonth: "2026-09",
      books,
      atStart: computeBooks(data, before),
      atEnd: computeBooks(data, end),
      snapshots,
      allocations: data.allocations,
      closed: data.closed,
      sales,
      stockLines: stock,
      typeOf,
      typeLabel: (t) => t,
    }),
    atStart: computeBooks(data, before),
    atEnd: computeBooks(data, end),
  };
};
const months = (m: string) => books.months.find((r) => r.month === m)!.profit;

describe("U-CR-025.4 monthly pack: every section ties out", () => {
  it("the books balance on each month end (books-balance invariant)", () => {
    for (const day of ["2026-09-30", "2026-10-31", TODAY])
      expectBalanced(books.posted, day, data.allocations, data.closed);
  });

  it("§1 profit: a closed month's snapshot, an open month's so far; = the Months list", () => {
    const sep = pack("2026-09").p;
    expect(sep.closed).toBe(true);
    expect(sep.profit.total).toBe(snapshots["2026-09"].total);
    expect(sep.profit.total).toBe(months("2026-09"));
    expect(sep.profit.last).toBeNull(); // before the opening
    const oct = pack("2026-10", salesReport(...OCT_SALES)).p;
    expect(oct.closed).toBe(false);
    expect(oct.profit.total).toBe(months("2026-10"));
    expect(oct.profit.last).toBe(months("2026-09"));
    expect(sumOf(oct.profit.rows, (r) => r.amount)).toBe(oct.profit.total);
    expect(sumOf(oct.profit.rows, (r) => r.last ?? 0)).toBe(oct.profit.last);
    // §4's net sales profit = §1's sale + customer-return lines (the Sales report's tie-out).
    const line = (l: string) => oct.profit.rows.find((r) => r.label === l)!.amount;
    expect(add(line("Sale profit"), line("Customer returns"))).toBe(oct.sales.netProfit);
  });

  it("§2 the position: the balance chip's two sides with ✓ on the month end", () => {
    const { p, atEnd } = pack("2026-10");
    expect(p.end).toBe("2026-10-31");
    expect(p.position.difference).toBe(0);
    expect(p.position.netAssets).toBe(atEnd.invariant.netAssets);
    // U-CR-039.2 (D-064): Business assets + Total we owe = Net worth, on the month end.
    expect(add(p.position.businessAssets, p.position.oweTotal)).toBe(p.position.netAssets);
    expect(pack("2026-11").p.end).toBe(TODAY); // this month: as on today
  });

  it("§3 allocations: the stored rows (Σ = the month profit) and profit owed at the end", () => {
    const { p, atEnd } = pack("2026-09");
    expect(sumOf(p.allocations.rows!, (a) => a.amount)).toBe(p.profit.total);
    for (const o of p.allocations.owed) expect(o.amount).toBe(atEnd.profitOwed[o.id]);
    expect(pack("2026-10").p.allocations.rows).toBeNull();
  });

  it("§4 top customers + Other customers total the net sales", () => {
    const groups = Array.from({ length: 7 }, (_, i) => ({
      id: `c${i}`,
      pieces: 1,
      sales: tk(100 - i),
      profit: tk(10),
      avgPieces: 1,
      avg: null,
    }));
    const top = topGroups(groups);
    expect(top).toHaveLength(6);
    expect(top[5]).toEqual({
      id: "others",
      pieces: 2,
      sales: tk(95 + 94),
      profit: tk(20),
      avgPieces: 0,
      avg: null,
    });
    expect(sumOf(top, (g) => g.sales)).toBe(sumOf(groups, (g) => g.sales));
  });

  it("§5 stock: value = the books' stock; Opening = last month's Closing; the opening month", () => {
    const sep = pack("2026-09");
    const oct = pack("2026-10");
    expect(stockTotal(sep.p.stock).value).toBe(sep.atEnd.stock);
    expect(stockTotal(oct.p.stock).value).toBe(oct.atEnd.stock);
    expect(stockTotal(pack("2026-11").p.stock).value).toBe(books.stock);
    const row = (p: typeof sep.p, id: string) => p.stock.find((r) => r.id === id)!;
    // The opening month: the imported 10 are Opening, not Bought; the write-off has its column.
    expect(row(sep.p, MA)).toMatchObject({
      opening: 10,
      bought: 2,
      sold: 2,
      back: 1,
      writtenOff: 1,
      closing: 8,
    });
    for (const id of [MA, MB]) expect(row(oct.p, id).opening).toBe(row(sep.p, id).closing);
    // October's missed lot is a Correction, so Opening still = September's Closing.
    expect(row(oct.p, MC)).toMatchObject({
      opening: 0,
      corrections: 1,
      bought: 1,
      back: 1,
      closing: 1,
    });
    expect(stockColumns(sep.p.stock).map(([k]) => k)).not.toContain("corrections");
    expect(stockColumns(oct.p.stock).map(([k]) => k)).toContain("corrections");
    expect(row(oct.p, MA)).toMatchObject({ returnedIn: 1, closing: 9 });
  });

  it("§6 dues: start and end totals = the books' dues; each row = the statement's balance", () => {
    const { p, atStart, atEnd } = pack("2026-10");
    expect(sumOf(p.dues.customers, (r) => r.start)).toBe(atStart.customerDues);
    expect(sumOf(p.dues.customers, (r) => r.end)).toBe(atEnd.customerDues);
    expect(sumOf(p.dues.suppliers, (r) => r.end)).toBe(atEnd.supplierDues);
    const cust = p.dues.customers.find((r) => r.id === CUST)!;
    expect(cust.end).toBe(atEnd.customers[CUST].balance);
    expect(cust.change).toBe(sub(cust.end, cust.start));
  });

  it("§7 card bills: next month's and the overdue ones, as on the end; remaining EMI", () => {
    const { p, atEnd } = pack("2026-10");
    expect(p.cards.bills.map((b) => [b.month, b.dueDate, b.remaining, b.overdue])).toEqual([
      ["2026-10", "2026-10-20", tk(1_900), true],
      ["2026-11", "2026-11-20", tk(2_000), false],
    ]);
    expect(p.cards.emi).toEqual([{ cardId: CARD, remaining: atEnd.cards[CARD].remainingEmi }]);
  });

  it("§8 cash flow: opening + in − out = closing = the books' cash; a reversal on the other side", () => {
    const { p, atEnd, atStart } = pack("2026-10");
    const net = p.cash.rows.reduce((n, r) => sub(add(n, r.in), r.out), 0);
    expect(add(p.cash.opening, net)).toBe(p.cash.closing);
    expect(p.cash.closing).toBe(atEnd.cash);
    expect(p.cash.opening).toBe(atStart.cash);
    expect(p.cash.rows.find((r) => r.type === "capital_in")).toMatchObject({
      in: tk(5_000),
      out: tk(5_000),
    });
  });
});
