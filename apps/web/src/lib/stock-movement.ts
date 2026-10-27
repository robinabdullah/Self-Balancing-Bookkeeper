import type { Sheet } from "@/lib/export";
import { monthOf } from "@/lib/dates";
import { add, mul } from "@/lib/money";

// D-045 (UIDD §4.17): the Monthly pack's stock movement by model, from the dated lot lines
// (purchase, sale and return lines with their lot's cost). Opening is always the stock before the
// period, so it is the last month's Closing; the only exception is the opening month, whose
// imported stock (and corrections dated in it) is its Opening. A later opening correction has its
// own column. The closing value is at cost, so it ties out to the books' stock. Pure; poisha.

export type StockMoveKind =
  "bought" | "opening" | "correction" | "sold" | "returned_in" | "back" | "written_off";

export type StockLine = {
  modelId: string;
  date: string;
  qty: number;
  /** The lot's unit cost. */
  unitCost: number;
  kind: StockMoveKind;
  /** A reversal moves the other way. */
  reversal: boolean;
};

export type StockMoveRow = {
  id: string;
  opening: number;
  bought: number;
  sold: number;
  returnedIn: number;
  back: number;
  writtenOff: number;
  corrections: number;
  closing: number;
  /** The closing pieces at cost. */
  value: number;
};

const IN = new Set<StockMoveKind>(["bought", "opening", "correction", "returned_in"]);
const COLUMN = {
  bought: "bought",
  sold: "sold",
  returned_in: "returnedIn",
  back: "back",
  written_off: "writtenOff",
  correction: "corrections",
} as const;

/** Each model's movement from `from` to `to` (both included); models with nothing are left out. */
export function stockMovement(
  lines: StockLine[],
  from: string,
  to: string,
  openingMonth: string | null,
): StockMoveRow[] {
  const rows = new Map<string, StockMoveRow>();
  for (const l of lines) {
    if (l.date > to) continue;
    const r =
      rows.get(l.modelId) ??
      ({
        id: l.modelId,
        opening: 0,
        bought: 0,
        sold: 0,
        returnedIn: 0,
        back: 0,
        writtenOff: 0,
        corrections: 0,
        closing: 0,
        value: 0,
      } satisfies StockMoveRow);
    const moved = (l.reversal ? -1 : 1) * l.qty;
    const pieces = IN.has(l.kind) ? moved : -moved;
    r.closing += pieces;
    r.value = add(r.value, mul(l.unitCost, pieces));
    const imported =
      l.kind === "opening" || (l.kind === "correction" && monthOf(l.date) === openingMonth);
    if (l.date < from || imported) r.opening += pieces;
    else r[COLUMN[l.kind as keyof typeof COLUMN]] += moved;
    rows.set(l.modelId, r);
  }
  return [...rows.values()]
    .filter((r) => r.closing !== 0 || r.value !== 0 || r.opening !== 0 || moves(r))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
}

const moves = (r: StockMoveRow) =>
  [r.bought, r.sold, r.returnedIn, r.back, r.writtenOff, r.corrections].some((n) => n !== 0);

export const STOCK_COLUMNS = [
  ["opening", "Opening"],
  ["bought", "Bought"],
  ["sold", "Sold"],
  ["returnedIn", "Returned in"],
  ["back", "Back to seller"],
  ["writtenOff", "Written off"],
  ["corrections", "Corrections"],
  ["closing", "Closing"],
] as const;

/** The columns shown: Corrections only in a period that has one (D-045). */
export const stockColumns = (rows: StockMoveRow[]) =>
  STOCK_COLUMNS.filter(([k]) => k !== "corrections" || rows.some((r) => r.corrections !== 0));

export function stockTotal(rows: StockMoveRow[]): Omit<StockMoveRow, "id"> {
  const t = { opening: 0, bought: 0, sold: 0, returnedIn: 0, back: 0, writtenOff: 0 };
  const total = { ...t, corrections: 0, closing: 0, value: 0 };
  for (const r of rows) {
    for (const [k] of STOCK_COLUMNS) total[k] += r[k];
    total.value = add(total.value, r.value);
  }
  return total;
}

export function stockSheet(rows: StockMoveRow[], model: (id: string) => string): Sheet {
  const cols = stockColumns(rows);
  const t = stockTotal(rows);
  return {
    name: "Stock movement",
    columns: [
      { header: "Model", kind: "text" },
      ...cols.map(([, header]) => ({ header, kind: "int" as const })),
      { header: "Value", kind: "money" },
    ],
    rows: [
      ...rows.map((r) => [model(r.id), ...cols.map(([k]) => r[k]), r.value]),
      ["Total", ...cols.map(([k]) => t[k]), t.value],
    ],
  };
}
