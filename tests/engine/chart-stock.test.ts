import { describe, expect, it } from "vitest";
import { AGES, stockAge, stockCharts } from "@/lib/charts/stock";
import { addDays } from "@/lib/dates";
import { type Lot, type LotMove, lotsRemaining } from "@/lib/engine/stock";
import { OTHERS, topGroups } from "@/lib/monthly-pack";
import { add, mul } from "@/lib/money";
import type { SalesGroup } from "@/lib/sales-report";

// CR-044 (D-064; UIDD §4.17, clarified 2026-10-24): the Stock tab's stock age and top models.
// Synthetic ids and amounts (D-014).
const TODAY = "2026-10-24";
const NAMES = { "m-a": "Model A", "m-b": "Model B" };
const lot = (id: string, modelId: string, age: number, qty: number, unitCost: number) =>
  ({
    id,
    modelId,
    date: addDays(TODAY, -age),
    createdAt: `${addDays(TODAY, -age)}T10:00:00Z`,
    qty,
    unitCost,
    imeiNote: null as string | null,
    source: "cash",
  }) satisfies Lot & { imeiNote: string | null; source: string };

// One lot on each side of every edge, plus today's, a sold-out lot and a reversed purchase whose
// sale still stands (1 below 0: the books' stock counts it too).
const lots = lotsRemaining(
  [
    lot("d0", "m-a", 0, 1, 100_000),
    lot("d30", "m-a", 30, 2, 100_000),
    lot("d31", "m-b", 31, 3, 200_000),
    lot("d60", "m-a", 60, 4, 100_000),
    lot("d61", "m-b", 61, 5, 200_000),
    lot("d90", "m-a", 90, 6, 100_000),
    lot("d91", "m-b", 91, 7, 200_000),
    lot("sold", "m-a", 10, 2, 100_000),
    { ...lot("gone", "m-b", 120, 3, 300_000), reversed: true },
  ],
  [
    { lotId: "sold", qty: 2, kind: "sale" },
    { lotId: "gone", qty: 1, kind: "sale" },
  ] satisfies LotMove[],
);

const group = (id: string, pieces: number, sales: number, profit: number): SalesGroup => ({
  id,
  pieces,
  sales,
  profit,
  avgPieces: pieces,
  avg: null,
});

describe("CR-044 stockAge", () => {
  it("U-CR-044.1 the 30/31, 60/61 and 90/91 day edges; Σ value = Σ lot values, a reversed lot included", () => {
    const ages = stockAge(lots, NAMES, TODAY);
    expect(ages.map((a) => [a.label, a.units])).toEqual([
      ["0–30 days", 1 + 2],
      ["31–60 days", 3 + 4],
      ["61–90 days", 5 + 6],
      ["90+ days", 7 - 1],
    ]);
    const lotValues = lots.reduce((s, l) => add(s, mul(l.unitCost, l.remaining)), 0);
    expect(ages.reduce((s, a) => add(s, a.value), 0)).toBe(lotValues);
    expect(ages[3].value).toBe(7 * 200_000 - 300_000);

    // An age lists its models (Stock page groups); a sold-out lot is in none.
    expect(ages[0].models.map((m) => [m.name, m.units, m.value])).toEqual([
      ["Model A", 3, 300_000],
    ]);
    expect(ages[1].models.map((m) => m.name)).toEqual(["Model A", "Model B"]);
    for (const a of ages.slice(0, 3))
      expect(a.models.reduce((s, m) => add(s, m.value), 0)).toBe(a.value);
    expect(ages.flatMap((a) => a.models.flatMap((m) => m.lots.map((l) => l.id)))).not.toContain(
      "sold",
    );
    expect(ages.map((a) => a.key)).toEqual(AGES.map((a) => a.key));
  });

  it("stockCharts: the total, the opening note and the top models by pieces", () => {
    const opening = { ...lot("o", "m-a", 200, 2, 100_000), source: "opening" };
    const byModel = [group("m-a", 3, 300_000, 30_000), group("m-b", 5, 200_000, 50_000)];
    const charts = stockCharts({
      lots: lotsRemaining([opening, ...lots], []),
      names: NAMES,
      today: TODAY,
      byModel,
      by: "pieces",
    });
    expect(charts.opening).toBe(true);
    expect(charts.total).toBe(charts.ages.reduce((s, a) => add(s, a.value), 0));
    expect(charts.top.map((g) => g.id)).toEqual(["m-b", "m-a"]);
    const sold = lotsRemaining([opening], [{ lotId: "o", qty: 2, kind: "sale" }]);
    expect(stockCharts({ lots: sold, names: NAMES, today: TODAY, byModel, by: "pieces" }).opening).toBe(
      false,
    );
  });

  it("topGroups by pieces: the most pieces first, the rest as Other", () => {
    const top = topGroups(
      [group("a", 1, 900, 9), group("b", 4, 100, 1), group("c", 2, 500, 5)],
      2,
      "pieces",
    );
    expect(top.map((g) => [g.id, g.pieces])).toEqual([
      ["b", 4],
      ["c", 2],
      [OTHERS, 1],
    ]);
  });
});
