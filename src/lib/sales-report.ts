import { AVG } from "@/lib/by-model";
import type { Sheet } from "@/lib/export";
import { add, avgUnit, mul, sub } from "@/lib/money";

// D-043 (UIDD §4.17): the Sales report for a period, from the sale and customer-return lines
// (one row per lot, as stored). A reversal counts on its own date with every figure negated, as in
// the month's profit; one reversed inside the period nets to 0. By model and by customer are net
// of returns, so each table totals the net sales profit. D-056: each row's average price is over
// the period's sales that still stand (no returns, no reversal, nothing reversed in the period).
// Pure; integer poisha.

export type SoldLine = {
  saleId: string;
  customerId: string;
  modelId: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  reversal: boolean;
  /** A reversal's original sale (D-056: that sale is left out of the average). */
  reversesId?: string | null;
};

export type ReturnedLine = {
  customerId: string;
  modelId: string;
  qty: number;
  /** The refund per unit. */
  unitAmount: number;
  unitCost: number;
  reversal: boolean;
};

export type SalesGroup = {
  id: string;
  pieces: number;
  sales: number;
  profit: number;
  /** D-056: the pieces the average is over, and the average price (whole taka; null: none). */
  avgPieces: number;
  avg: number | null;
};

type Sum = Omit<SalesGroup, "avg"> & { avgAmount: number };

export type SalesReport = {
  bills: number;
  pieces: number;
  sales: number;
  cost: number;
  grossProfit: number;
  /** Gross profit ÷ sales, in % to 1 decimal (display only); null without sales. */
  margin: number | null;
  returns: { pieces: number; amount: number; profit: number };
  netProfit: number;
  byModel: SalesGroup[];
  byCustomer: SalesGroup[];
};

const signOf = (l: { reversal: boolean }) => (l.reversal ? -1 : 1);

/** A margin to 1 decimal, rounded half away from zero (display only, not money). */
export function margin(profit: number, sales: number): number | null {
  if (sales === 0) return null;
  const tenths = Math.round(Math.abs(profit * 1000) / Math.abs(sales));
  return (Math.sign(profit) * Math.sign(sales) * tenths) / 10;
}

export function salesReport(sold: SoldLine[], returned: ReturnedLine[]): SalesReport {
  const groups = { model: new Map<string, Sum>(), customer: new Map<string, Sum>() };
  const into = (
    l: SoldLine | ReturnedLine,
    pieces: number,
    sales: number,
    profit: number,
    avg = { pieces: 0, amount: 0 },
  ) => {
    for (const [map, id] of [
      [groups.model, l.modelId],
      [groups.customer, l.customerId],
    ] as const) {
      const g = map.get(id) ?? { id, pieces: 0, sales: 0, profit: 0, avgPieces: 0, avgAmount: 0 };
      map.set(id, {
        id,
        pieces: g.pieces + pieces,
        sales: add(g.sales, sales),
        profit: add(g.profit, profit),
        avgPieces: g.avgPieces + avg.pieces,
        avgAmount: add(g.avgAmount, avg.amount),
      });
    }
  };
  const reversed = new Set(sold.map((l) => l.reversesId).filter((id) => id != null));
  const stands = (l: SoldLine) => !l.reversal && !reversed.has(l.saleId);

  const bills = new Map<string, number>();
  let pieces = 0;
  let sales = 0;
  let cost = 0;
  for (const l of sold) {
    const s = signOf(l);
    const amount = s * mul(l.unitPrice, l.qty);
    const lineCost = s * mul(l.unitCost, l.qty);
    bills.set(l.saleId, s);
    pieces += s * l.qty;
    sales = add(sales, amount);
    cost = add(cost, lineCost);
    const avg = stands(l) ? { pieces: l.qty, amount } : undefined;
    into(l, s * l.qty, amount, sub(amount, lineCost), avg);
  }

  const returns = { pieces: 0, amount: 0, profit: 0 };
  for (const l of returned) {
    const s = signOf(l);
    const refund = s * mul(l.unitAmount, l.qty);
    const profit = sub(s * mul(l.unitCost, l.qty), refund);
    returns.pieces += s * l.qty;
    returns.amount = add(returns.amount, refund);
    returns.profit = add(returns.profit, profit);
    into(l, -s * l.qty, 0 - refund, profit);
  }

  const grossProfit = sub(sales, cost);
  const sorted = (m: Map<string, Sum>): SalesGroup[] =>
    [...m.values()]
      .sort((a, b) => b.sales - a.sales || a.id.localeCompare(b.id))
      .map(({ avgAmount, ...g }) => ({ ...g, avg: avgUnit(avgAmount, g.avgPieces) }));
  return {
    bills: [...bills.values()].reduce((a, b) => a + b, 0),
    pieces,
    sales,
    cost,
    grossProfit,
    margin: margin(grossProfit, sales),
    returns,
    netProfit: add(grossProfit, returns.profit),
    byModel: sorted(groups.model),
    byCustomer: sorted(groups.customer),
  };
}

/** D-043: the Sales report's Excel: Totals · By model · By customer (each with a Total row).
 * D-056: By model has the Avg unit price (blank on the Total row). */
export function salesSheets(r: SalesReport, name: (id: string) => string): Sheet[] {
  const groups = (sheet: string, head: string, list: SalesGroup[], avg = false): Sheet => {
    const only = <T>(cells: T[]) => cells.filter((_, i) => avg || i !== 2);
    return {
      name: sheet,
      columns: only([
        { header: head, kind: "text" },
        { header: "Pieces", kind: "int" },
        { header: AVG, kind: "money" },
        { header: "Sales", kind: "money" },
        { header: "Profit", kind: "money" },
      ]),
      rows: [
        ...list.map((g) => only([name(g.id), g.pieces, g.avg, g.sales, g.profit])),
        only([
          "Total",
          list.reduce((s, g) => s + g.pieces, 0),
          null,
          list.reduce((s, g) => add(s, g.sales), 0),
          list.reduce((s, g) => add(s, g.profit), 0),
        ]),
      ],
    };
  };
  const totals: [string, "int" | "money", number][] = [
    ["Bills", "int", r.bills],
    ["Pieces", "int", r.pieces],
    ["Sales", "money", r.sales],
    ["Cost", "money", r.cost],
    ["Gross profit", "money", r.grossProfit],
    ["Returns (pieces)", "int", r.returns.pieces],
    ["Returns (amount)", "money", r.returns.amount],
    ["Returns profit", "money", r.returns.profit],
    ["Net sales profit", "money", r.netProfit],
  ];
  return [
    {
      // One column per figure, so each keeps its own number format.
      name: "Totals",
      columns: [
        ...totals.map(([header, kind]) => ({ header, kind })),
        { header: "Margin %", kind: "pct" },
      ],
      rows: [[...totals.map(([, , v]) => v), r.margin]],
    },
    groups("By model", "Model", r.byModel, true),
    groups("By customer", "Customer", r.byCustomer),
  ];
}
