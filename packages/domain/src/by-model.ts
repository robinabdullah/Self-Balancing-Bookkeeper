import type { Sheet } from "./export";
import { add, avgUnit, format, mul, sub } from "./money";
import type { SalesReport } from "./sales-report";

// D-045 (UIDD §4.8): the By model tables under a customer's or supplier's statement for a period:
// pieces and amount, no profit (a customer document never shows it). A customer's sales come from
// the Sales report's own figures (one source); what we bought from a supplier, or from a customer,
// counts at the price paid less the phones sent back at the refund amount (as the statement shows
// the refund). Damaged / lost never counts as sent back. D-056: each row's Avg unit price is the
// average of what was sold / bought in the period that still stands. Pure; integer poisha.

export type ModelRow = {
  id: string;
  pieces: number;
  amount: number;
  /** D-056: the pieces the average is over, and the average price (whole taka; null: none). */
  avgPieces: number;
  avg: number | null;
};

/** A purchase line from them (a reversal counts negative). */
export type BoughtLine = {
  modelId: string;
  qty: number;
  unitCost: number;
  reversal: boolean;
  /** D-056: its purchase, and a reversal's original (left out of the average). */
  purchaseId?: string;
  reversesId?: string | null;
};
/** A purchase-return line of one of their lots, refunded at `unitAmount`. */
export type SentBackLine = { modelId: string; qty: number; unitAmount: number; reversal: boolean };

const sign = (l: { reversal: boolean }) => (l.reversal ? -1 : 1);

type Sum = Omit<ModelRow, "avg"> & { avgAmount: number };

const sorted = (m: Map<string, Sum>): ModelRow[] =>
  [...m.values()]
    .filter((r) => r.pieces !== 0 || r.amount !== 0)
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))
    .map(({ avgAmount, ...r }) => ({ ...r, avg: avgUnit(avgAmount, r.avgPieces) }));

/** A customer's sales by model, net of returns: the Sales report's By model for that customer. */
export const salesByModel = (r: SalesReport): ModelRow[] =>
  r.byModel.map((g) => ({
    id: g.id,
    pieces: g.pieces,
    amount: g.sales,
    avgPieces: g.avgPieces,
    avg: g.avg,
  }));

/** Bought less sent back, by model: pieces, and amount at the price paid less the refunds. */
export function purchasesByModel(bought: BoughtLine[], sentBack: SentBackLine[]): ModelRow[] {
  const m = new Map<string, Sum>();
  const into = (id: string, pieces: number, amount: number, avgPieces = 0, avgAmount = 0) => {
    const r = m.get(id) ?? { id, pieces: 0, amount: 0, avgPieces: 0, avgAmount: 0 };
    m.set(id, {
      id,
      pieces: r.pieces + pieces,
      amount: add(r.amount, amount),
      avgPieces: r.avgPieces + avgPieces,
      avgAmount: add(r.avgAmount, avgAmount),
    });
  };
  const reversed = new Set(bought.map((l) => l.reversesId).filter((id) => id != null));
  for (const l of bought) {
    const amount = sign(l) * mul(l.unitCost, l.qty);
    const stands = !l.reversal && !(l.purchaseId && reversed.has(l.purchaseId));
    into(l.modelId, sign(l) * l.qty, amount, stands ? l.qty : 0, stands ? amount : 0);
  }
  for (const l of sentBack)
    into(l.modelId, -sign(l) * l.qty, sub(0, sign(l) * mul(l.unitAmount, l.qty)));
  return sorted(m);
}

export const pcs = (n: number) => `${n} ${n === 1 ? "pc" : "pcs"}`;

/** D-056: a row's pieces with its average price, for phones and messages: "30 pcs × ৳15,700";
 * "29 pcs · avg ৳15,700" when returns or reversals changed the pieces; "29 pcs" with no average. */
export function piecesAt(r: { pieces: number; avgPieces: number; avg: number | null }) {
  if (r.avg == null) return pcs(r.pieces);
  return `${pcs(r.pieces)} ${r.avgPieces === r.pieces ? "×" : "· avg"} ${format(r.avg)}`;
}

export const modelTotal = (rows: ModelRow[]) => ({
  pieces: rows.reduce((n, r) => n + r.pieces, 0),
  amount: rows.reduce((n, r) => add(n, r.amount), 0),
});

/** D-056: the By model column's header, everywhere. */
export const AVG = "Avg unit price";

/** The Excel sheet of a By model table, with its Total row (no average). */
export function modelSheet(name: string, rows: ModelRow[], model: (id: string) => string): Sheet {
  const t = modelTotal(rows);
  return {
    name,
    columns: [
      { header: "Model", kind: "text" },
      { header: "Pieces", kind: "int" },
      { header: AVG, kind: "money" },
      { header: "Amount", kind: "money" },
    ],
    rows: [
      ...rows.map((r) => [model(r.id), r.pieces, r.avg, r.amount]),
      ["Total", t.pieces, null, t.amount],
    ],
  };
}
