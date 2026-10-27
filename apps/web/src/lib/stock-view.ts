import type { StockLot } from "@/lib/engine/stock";
import { add, avgUnit, mul } from "@/lib/money";

// UIDD §4.7 (task 4.2): the Stock view's lots grouped by model. Pure. A reversed purchase's lots
// are left out (D-027); "in stock" keeps lots with units left (≠ 0, so an error below 0 shows).
// D-063: each model's avg cost of the units left, and of everything bought, over the lots shown.

type ViewLot = StockLot & { imeiNote: string | null };

export type ModelStock<L extends ViewLot> = {
  modelId: string;
  name: string;
  /** Units left and their value at cost, over the lots shown. */
  units: number;
  value: number;
  /** D-063: the avg cost of the units left (whole taka; null: none left). */
  avg: number | null;
  /** D-063: the units bought in the lots shown, and their avg cost (sold or not). */
  bought: number;
  boughtAvg: number | null;
  /** Oldest first: purchase date, then created_at. */
  lots: L[];
};

export function stockByModel<L extends ViewLot>(
  lots: L[],
  modelNames: Record<string, string>,
  { all, search }: { all: boolean; search: string },
): ModelStock<L>[] {
  const q = search.trim().toLowerCase();
  const nameOf = (l: L) => modelNames[l.modelId] ?? "Model";
  const shown = lots.filter(
    (l) =>
      !l.reversed &&
      (all || l.remaining !== 0) &&
      (!q || nameOf(l).toLowerCase().includes(q) || (l.imeiNote ?? "").toLowerCase().includes(q)),
  );

  const groups = new Map<string, ModelStock<L> & { boughtValue: number }>();
  for (const l of shown) {
    const g = groups.get(l.modelId) ?? {
      modelId: l.modelId,
      name: nameOf(l),
      units: 0,
      value: 0,
      avg: null,
      bought: 0,
      boughtAvg: null,
      boughtValue: 0,
      lots: [],
    };
    g.units += l.remaining;
    g.value = add(g.value, mul(l.unitCost, l.remaining));
    g.bought += l.qty;
    g.boughtValue = add(g.boughtValue, mul(l.unitCost, l.qty));
    g.lots.push(l);
    groups.set(l.modelId, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ boughtValue, ...g }) => {
      g.lots.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
      return { ...g, avg: avgUnit(g.value, g.units), boughtAvg: avgUnit(boughtValue, g.bought) };
    });
}
