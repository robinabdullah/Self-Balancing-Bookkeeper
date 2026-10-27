// Stock lots (SRS §4): what each lot has left, and which lots a sale line takes its units from.
// Pure: plain arrays in, plain objects out. Money is integer poisha.

/**
 * A purchase line. `reversed` = its purchase has been reversed, so its qty is gone (SRS §8); what
 * is left is only its live moves, normally 0 (a reversal needs its dependents reversed first).
 */
export type Lot = {
  id: string;
  modelId: string;
  date: string; // the purchase date, "YYYY-MM-DD"
  createdAt: string; // ISO timestamp; breaks ties between lots bought the same day
  qty: number;
  unitCost: number;
  reversed?: boolean;
};

/** A sale or return line on a lot. `reversal` = its entry is a reversal, so it counts negated. */
export type LotMove = {
  lotId: string;
  qty: number;
  kind: "sale" | "customer_return" | "purchase_return";
  reversal?: boolean;
};

/** A lot's net moves (reversals negated, D-027) and what it has left. */
export type LotCounts = { sold: number; returned: number; toSeller: number; remaining: number };

export type StockLot = Lot & LotCounts;

/** Units taken from one lot, at that lot's cost. */
export type Pick = { lotId: string; qty: number; unitCost: number };

const COUNT = { sale: "sold", customer_return: "returned", purchase_return: "toSeller" } as const;

/**
 * Lot remaining = qty − Σ sold + Σ customer-returned − Σ purchase-returned (SRS §4); each count is
 * net of its reversals. A reversed lot has no qty, so a move that comes back to life on it (a
 * deleted reversal) shows below 0. Extra fields on the lots are kept.
 */
export function lotsRemaining<L extends Lot>(lots: L[], moves: LotMove[]): (L & LotCounts)[] {
  const counts = new Map(lots.map((l) => [l.id, { sold: 0, returned: 0, toSeller: 0 }]));
  for (const m of moves) {
    const c = counts.get(m.lotId);
    if (c) c[COUNT[m.kind]] += m.reversal ? -m.qty : m.qty;
  }
  return lots.map((l) => {
    const c = counts.get(l.id) ?? { sold: 0, returned: 0, toSeller: 0 };
    const remaining = (l.reversed ? 0 : l.qty) - c.sold + c.returned - c.toSeller;
    return { ...l, ...c, remaining };
  });
}

function shortage(qty: number, available: number): Error {
  return new Error(
    `Not enough stock: ${qty} asked, ${available} available (short by ${qty - available})`,
  );
}

/**
 * The lots a sale line of `qty` units of `modelId` takes (SRS §4, lot picking). With `lotId`, that
 * lot only (a manual choice). Otherwise lots with stock bought on or before the sale date, oldest
 * first (purchase date, then created_at), split across lots as needed. Throws when it can't.
 */
export function pickLots(
  lots: StockLot[],
  modelId: string,
  qty: number,
  saleDate: string,
  lotId?: string | null,
): Pick[] {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error(`Invalid qty: ${qty}`);

  if (lotId) {
    const lot = lots.find((l) => l.id === lotId);
    if (!lot) throw new Error(`Unknown lot: ${lotId}`);
    if (lot.modelId !== modelId) throw new Error("The chosen lot is of another model");
    if (lot.date > saleDate) throw new Error("The chosen lot was bought after the sale date");
    if (lot.remaining < qty) throw shortage(qty, lot.remaining);
    return [{ lotId: lot.id, qty, unitCost: lot.unitCost }];
  }

  const usable = lots
    .filter((l) => l.modelId === modelId && l.date <= saleDate && l.remaining > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const available = usable.reduce((n, l) => n + l.remaining, 0);
  if (available < qty) throw shortage(qty, available);

  const picks: Pick[] = [];
  let left = qty;
  for (const lot of usable) {
    if (left === 0) break;
    const take = Math.min(left, lot.remaining);
    picks.push({ lotId: lot.id, qty: take, unitCost: lot.unitCost });
    left -= take;
  }
  return picks;
}

/** A sale bill line as the form sends it: no `lotId` = oldest first (SRS §4). */
export type SaleLinePlan = { modelId: string; qty: number; lotId?: string | null };

/** The lots one line takes, or why it can't (UIDD §5 wording) and on which field. */
export type Planned = { picks: Pick[] } | { field: "qty" | "lotId"; error: string };

/** Why a line can't be filled from `lots` (already less what the bill's earlier lines took). */
function lineError(lots: StockLot[], line: SaleLinePlan, saleDate: string): Planned | null {
  if (line.lotId) {
    const lot = lots.find((l) => l.id === line.lotId);
    if (!lot || lot.modelId !== line.modelId)
      return { field: "lotId", error: "Pick a lot of this model" };
    if (lot.date > saleDate)
      return { field: "lotId", error: "This lot was bought after the sale date" };
    if (lot.remaining < line.qty)
      return { field: "qty", error: `Only ${lot.remaining} left in this lot` };
    return null;
  }
  const available = lots
    .filter((l) => l.modelId === line.modelId && l.date <= saleDate)
    .reduce((n, l) => n + l.remaining, 0);
  return available < line.qty ? { field: "qty", error: `Only ${available} left` } : null;
}

/**
 * The lots each line of a sale bill takes (SRS §4, lot picking). Lines with a chosen lot go first
 * (an edited line keeps its lot, D-004), then the rest oldest first, each from what the earlier
 * lines left. The action runs it on the locked lots; the form, as a preview.
 */
export function planSale(lots: StockLot[], lines: SaleLinePlan[], saleDate: string): Planned[] {
  const left = new Map(lots.map((l) => [l.id, l.remaining]));
  const planned: Planned[] = [];
  const order = lines.map((_, i) => i).sort((a, b) => +!lines[a].lotId - +!lines[b].lotId);
  for (const i of order) {
    const now = lots.map((l) => ({ ...l, remaining: left.get(l.id) ?? 0 }));
    const error = lineError(now, lines[i], saleDate);
    if (error) {
      planned[i] = error;
      continue;
    }
    const picks = pickLots(now, lines[i].modelId, lines[i].qty, saleDate, lines[i].lotId);
    for (const p of picks) left.set(p.lotId, (left.get(p.lotId) ?? 0) - p.qty);
    planned[i] = { picks };
  }
  return planned;
}
