import { describe, expect, it } from "vitest";
import { type Lot, type LotMove, lotsRemaining } from "@mbl/domain/engine/stock";
import { stockByModel } from "@mbl/domain/stock-view";

// Task 4.2 (UIDD §4.7, D-027): the Stock view's groups. Synthetic ids (D-014).
const NAMES = { "m-vivo": "Vivo Y05 4/64", "m-oppo": "Oppo A3" };
const lot = (id: string, modelId: string, date: string, qty: number, unitCost: number) =>
  ({
    id,
    modelId,
    date,
    createdAt: `${date}T10:00:00Z`,
    qty,
    unitCost,
    imeiNote: null as string | null,
  }) satisfies Lot & { imeiNote: string | null };

const v2 = lot("v2", "m-vivo", "2026-10-03", 10, 1_701_000);
const v1 = { ...lot("v1", "m-vivo", "2026-10-01", 2, 1_686_000), imeiNote: "IMEI 3567-01" };
const o1 = lot("o1", "m-oppo", "2026-10-02", 5, 1_500_000);
const gone = { ...lot("r1", "m-oppo", "2026-10-02", 3, 1_500_000), reversed: true };
const moves: LotMove[] = [
  { lotId: "v1", qty: 2, kind: "sale" },
  { lotId: "v2", qty: 3, kind: "sale" },
];
const lots = lotsRemaining([v2, gone, o1, v1], moves);

describe("4.2 stockByModel", () => {
  it("in stock: models by name with units and value at cost; lots oldest first", () => {
    const groups = stockByModel(lots, NAMES, { all: false, search: "" });
    expect(groups.map((g) => [g.name, g.units, g.value, g.lots.map((l) => l.id)])).toEqual([
      ["Oppo A3", 5, 7_500_000, ["o1"]],
      ["Vivo Y05 4/64", 7, 11_907_000, ["v2"]],
    ]);
  });

  it("all: sold-out lots too, never a reversed purchase's lots", () => {
    const groups = stockByModel(lots, NAMES, { all: true, search: "" });
    expect(groups.map((g) => g.lots.map((l) => l.id))).toEqual([["o1"], ["v1", "v2"]]);
  });

  it("search by model name (any case) or by IMEI/note", () => {
    const byModel = stockByModel(lots, NAMES, { all: true, search: "  vivo " });
    expect(byModel.map((g) => g.lots.map((l) => l.id))).toEqual([["v1", "v2"]]);
    const byNote = stockByModel(lots, NAMES, { all: true, search: "3567" });
    expect(byNote.map((g) => [g.name, g.lots.map((l) => l.id)])).toEqual([
      ["Vivo Y05 4/64", ["v1"]],
    ]);
    expect(stockByModel(lots, NAMES, { all: false, search: "3567" })).toEqual([]);
  });
});

// CR-038 (D-063): each model's avg cost: of the units left, and of everything bought.
describe("CR-038 stockByModel averages", () => {
  const pick = (all: boolean, search = "") =>
    stockByModel(lots, NAMES, { all, search }).map((g) => [
      g.name,
      g.units,
      g.avg,
      g.bought,
      g.boughtAvg,
    ]);

  it("U-CR-038.1 in stock: the avg cost of the units left = value ÷ units, half-up to taka", () => {
    expect(pick(false)).toEqual([
      ["Oppo A3", 5, 1_500_000, 5, 1_500_000],
      ["Vivo Y05 4/64", 7, 1_701_000, 10, 1_701_000], // v1 is sold out, so not shown
    ]);
    // ৳100 + ৳101 → ৳100.50 → ৳101 (half-up); avg × units stays within ৳1 a unit of the value.
    const tie = lotsRemaining(
      [lot("t1", "m-x", "2026-10-01", 1, 10_000), lot("t2", "m-x", "2026-10-02", 1, 10_100)],
      [],
    );
    const [g] = stockByModel(tie, { "m-x": "X" }, { all: false, search: "" });
    expect([g.value, g.avg]).toEqual([20_100, 10_100]);
  });

  it("U-CR-038.2 all lots: bought and its avg count sold-out lots; sales and returns don't move it", () => {
    // Vivo: 10 × ৳17,010 + 2 × ৳16,860 = ৳2,03,820 over 12 → ৳16,985.
    expect(pick(true)).toEqual([
      ["Oppo A3", 5, 1_500_000, 5, 1_500_000],
      ["Vivo Y05 4/64", 7, 1_701_000, 12, 1_698_500],
    ]);
    const moved = lotsRemaining(
      [v2, gone, o1, v1],
      [
        ...moves,
        { lotId: "v2", qty: 1, kind: "customer_return" },
        { lotId: "v2", qty: 2, kind: "purchase_return" },
        { lotId: "o1", qty: 4, kind: "sale" },
      ],
    );
    const groups = stockByModel(moved, NAMES, { all: true, search: "" });
    expect(groups.map((g) => [g.name, g.units, g.bought, g.boughtAvg])).toEqual([
      ["Oppo A3", 1, 5, 1_500_000],
      ["Vivo Y05 4/64", 6, 12, 1_698_500],
    ]);
  });

  it("U-CR-038.3 no units left (or below 0): no avg cost of the units left", () => {
    const over = lotsRemaining([v1], [{ lotId: "v1", qty: 3, kind: "sale" }]); // an error lot: −1
    const [neg] = stockByModel(over, NAMES, { all: false, search: "" });
    expect([neg.units, neg.avg, neg.bought, neg.boughtAvg]).toEqual([-1, null, 2, 1_686_000]);
    const [none] = stockByModel(lots, NAMES, { all: true, search: "3567" }); // v1 alone, sold out
    expect([none.units, none.avg, none.bought, none.boughtAvg]).toEqual([0, null, 2, 1_686_000]);
  });

  it("U-CR-038.4 a search narrows both averages to the lots shown", () => {
    expect(pick(true, "3567")).toEqual([["Vivo Y05 4/64", 0, null, 2, 1_686_000]]);
    expect(pick(true, "vivo")).toEqual([["Vivo Y05 4/64", 7, 1_701_000, 12, 1_698_500]]);
  });
});
