import { describe, expect, it } from "vitest";
import { type Lot, type LotMove, lotsRemaining, pickLots, planSale } from "@/lib/engine/stock";
import { expectBalanced, posted } from "./invariant";

// Synthetic ids only (D-014).
const VIVO = "model-vivo";
const OPPO = "model-oppo";
const lot = (
  id: string,
  date: string,
  qty: number,
  unitCost: number,
  extra?: Partial<Lot>,
): Lot => ({
  id,
  modelId: VIVO,
  date,
  createdAt: `${date}T10:00:00Z`,
  qty,
  unitCost,
  ...extra,
});
const A = lot("lot-a", "2026-10-01", 2, 1_686_000); // 2 @ ৳16,860
const B = lot("lot-b", "2026-10-03", 10, 1_701_000); // 10 @ ৳17,010
const remainingOf = (lots: Lot[], moves: LotMove[]) =>
  Object.fromEntries(lotsRemaining(lots, moves).map((l) => [l.id, l.remaining]));

describe("U2.4.1 S14: oldest lots first, split across lots", () => {
  it("sell 3 → 2 from A + 1 from B, cost ৳50,730; the sale balances", () => {
    const picks = pickLots(lotsRemaining([B, A], []), VIVO, 3, "2026-10-07");
    expect(picks).toEqual([
      { lotId: "lot-a", qty: 2, unitCost: 1_686_000 },
      { lotId: "lot-b", qty: 1, unitCost: 1_701_000 },
    ]);
    const lines = picks.map((p) => ({ ...p, unitPrice: 1_800_000 }));
    const sale = posted({ table: "sale", date: "2026-10-07", customerId: "cust-1", lines });
    expect(sale.effects).toContainEqual({ account: "stock", amount: -5_073_000 });
    expectBalanced([sale]);
  });

  it("same purchase date → the earlier created_at goes first", () => {
    const early = lot("lot-early", "2026-10-01", 1, 100, { createdAt: "2026-10-01T09:00:00Z" });
    const late = lot("lot-late", "2026-10-01", 1, 200, { createdAt: "2026-10-01T11:00:00Z" });
    const picks = pickLots(lotsRemaining([late, early], []), VIVO, 1, "2026-10-07");
    expect(picks).toEqual([{ lotId: "lot-early", qty: 1, unitCost: 100 }]);
  });

  it("skips other models and empty lots", () => {
    const oppo = lot("lot-oppo", "2026-09-01", 5, 100, { modelId: OPPO });
    const sold: LotMove[] = [{ lotId: "lot-a", qty: 2, kind: "sale" }];
    const picks = pickLots(lotsRemaining([oppo, A, B], sold), VIVO, 1, "2026-10-07");
    expect(picks).toEqual([{ lotId: "lot-b", qty: 1, unitCost: 1_701_000 }]);
  });
});

describe("U2.4.2 lots bought after the sale date", () => {
  it("are skipped", () => {
    const picks = pickLots(lotsRemaining([A, B], []), VIVO, 2, "2026-10-02");
    expect(picks).toEqual([{ lotId: "lot-a", qty: 2, unitCost: 1_686_000 }]);
  });

  it("can't fill the line when only later lots have stock", () => {
    expect(() => pickLots(lotsRemaining([A, B], []), VIVO, 3, "2026-10-02")).toThrow(
      /3 asked, 2 available/,
    );
  });
});

describe("U2.4.3 not enough stock", () => {
  it("asking for 13 when 12 are left → an error naming the shortage", () => {
    expect(() => pickLots(lotsRemaining([A, B], []), VIVO, 13, "2026-10-07")).toThrow(
      "Not enough stock: 13 asked, 12 available (short by 1)",
    );
  });
});

describe("U2.4.4 manual lot", () => {
  it("uses the chosen lot even when an older one has stock", () => {
    const picks = pickLots(lotsRemaining([A, B], []), VIVO, 3, "2026-10-07", "lot-b");
    expect(picks).toEqual([{ lotId: "lot-b", qty: 3, unitCost: 1_701_000 }]);
  });

  it("a manual lot dated after the sale → an error", () => {
    expect(() => pickLots(lotsRemaining([A, B], []), VIVO, 1, "2026-10-02", "lot-b")).toThrow(
      /after the sale date/,
    );
  });

  it("a manual lot without enough left, of another model, or unknown → an error", () => {
    const lots = lotsRemaining([A, B], []);
    expect(() => pickLots(lots, VIVO, 3, "2026-10-07", "lot-a")).toThrow(
      "Not enough stock: 3 asked, 2 available (short by 1)",
    );
    expect(() => pickLots(lots, OPPO, 1, "2026-10-07", "lot-a")).toThrow(/another model/);
    expect(() => pickLots(lots, VIVO, 1, "2026-10-07", "lot-x")).toThrow(/Unknown lot/);
  });

  it("qty must be a positive whole number", () => {
    const lots = lotsRemaining([A, B], []);
    expect(() => pickLots(lots, VIVO, 0, "2026-10-07")).toThrow(/qty/);
    expect(() => pickLots(lots, VIVO, 1.5, "2026-10-07")).toThrow(/qty/);
  });
});

describe("U2.4.5 lot remaining = qty − sold + customer-returned − purchase-returned", () => {
  it("after a sale, a return and a reversal of a sale", () => {
    const moves: LotMove[] = [];
    const at = () => remainingOf([B], moves)["lot-b"];
    expect(at()).toBe(10);
    moves.push({ lotId: "lot-b", qty: 3, kind: "sale" });
    expect(at()).toBe(7);
    moves.push({ lotId: "lot-b", qty: 1, kind: "customer_return" });
    expect(at()).toBe(8);
    moves.push({ lotId: "lot-b", qty: 2, kind: "purchase_return" });
    expect(at()).toBe(6);
    moves.push({ lotId: "lot-b", qty: 4, kind: "sale" });
    expect(at()).toBe(2);
    moves.push({ lotId: "lot-b", qty: 4, kind: "sale", reversal: true });
    expect(at()).toBe(6);
  });

  it("reversed returns count with the opposite sign", () => {
    const moves: LotMove[] = [
      { lotId: "lot-b", qty: 3, kind: "sale" },
      { lotId: "lot-b", qty: 1, kind: "customer_return" },
      { lotId: "lot-b", qty: 1, kind: "customer_return", reversal: true },
      { lotId: "lot-b", qty: 2, kind: "purchase_return" },
      { lotId: "lot-b", qty: 2, kind: "purchase_return", reversal: true },
    ];
    expect(remainingOf([B], moves)["lot-b"]).toBe(7);
  });

  it("a reversed purchase removes its lots", () => {
    const reversed = { ...A, reversed: true };
    expect(remainingOf([reversed, B], [])).toEqual({ "lot-a": 0, "lot-b": 10 });
    const picks = pickLots(lotsRemaining([reversed, B], []), VIVO, 1, "2026-10-07");
    expect(picks).toEqual([{ lotId: "lot-b", qty: 1, unitCost: 1_701_000 }]);
    // Its sale, reversed, nets 0; without that reversal (deleted) the lot shows −2 (D-026).
    const sold: LotMove[] = [
      { lotId: "lot-a", qty: 2, kind: "sale" },
      { lotId: "lot-a", qty: 2, kind: "sale", reversal: true },
    ];
    expect(remainingOf([reversed], sold)["lot-a"]).toBe(0);
    expect(remainingOf([reversed], sold.slice(0, 1))["lot-a"]).toBe(-2);
  });
});

describe("3.5 planSale: a bill's lines share the stock, with UIDD §5 errors", () => {
  const lots = lotsRemaining([A, B], []);

  it("each line takes what the earlier lines left", () => {
    expect(
      planSale(
        lots,
        [
          { modelId: VIVO, qty: 1 },
          { modelId: VIVO, qty: 2 },
        ],
        "2026-10-07",
      ),
    ).toEqual([
      { picks: [{ lotId: "lot-a", qty: 1, unitCost: 1_686_000 }] },
      {
        picks: [
          { lotId: "lot-a", qty: 1, unitCost: 1_686_000 },
          { lotId: "lot-b", qty: 1, unitCost: 1_701_000 },
        ],
      },
    ]);
  });

  it("lines with a chosen lot are filled first, wherever they are in the bill", () => {
    const planned = planSale(
      lots,
      [
        { modelId: VIVO, qty: 1 },
        { modelId: VIVO, qty: 2, lotId: "lot-a" },
      ],
      "2026-10-07",
    );
    expect(planned).toEqual([
      { picks: [{ lotId: "lot-b", qty: 1, unitCost: 1_701_000 }] },
      { picks: [{ lotId: "lot-a", qty: 2, unitCost: 1_686_000 }] },
    ]);
  });

  it('too many → "Only N left" (by the sale date), or "Only N left in this lot"', () => {
    const [first, second] = planSale(
      lots,
      [
        { modelId: VIVO, qty: 11 },
        { modelId: VIVO, qty: 2 },
      ],
      "2026-10-07",
    );
    expect(first).toHaveProperty("picks");
    expect(second).toEqual({ field: "qty", error: "Only 1 left" });
    expect(planSale(lots, [{ modelId: VIVO, qty: 3 }], "2026-10-02")).toEqual([
      { field: "qty", error: "Only 2 left" },
    ]);
    expect(planSale(lots, [{ modelId: VIVO, qty: 3, lotId: "lot-a" }], "2026-10-07")).toEqual([
      { field: "qty", error: "Only 2 left in this lot" },
    ]);
  });

  it("a chosen lot bought after the sale date, or of another model → a lot error", () => {
    expect(planSale(lots, [{ modelId: VIVO, qty: 1, lotId: "lot-b" }], "2026-10-02")).toEqual([
      { field: "lotId", error: "This lot was bought after the sale date" },
    ]);
    expect(planSale(lots, [{ modelId: OPPO, qty: 1, lotId: "lot-a" }], "2026-10-07")).toEqual([
      { field: "lotId", error: "Pick a lot of this model" },
    ]);
  });
});

describe("U-CR-008.1 lot counts: sold, returned, to seller (D-027)", () => {
  it("each count is net of its reversals and in − sold + returned − toSeller = left", () => {
    const moves: LotMove[] = [
      { lotId: "lot-b", qty: 4, kind: "sale" },
      { lotId: "lot-b", qty: 1, kind: "sale" },
      { lotId: "lot-b", qty: 1, kind: "sale", reversal: true },
      { lotId: "lot-b", qty: 2, kind: "customer_return" },
      { lotId: "lot-b", qty: 3, kind: "purchase_return" },
    ];
    const [b] = lotsRemaining([B], moves);
    expect(b).toMatchObject({ qty: 10, sold: 4, returned: 2, toSeller: 3, remaining: 5 });
    expect(b.qty - b.sold + b.returned - b.toSeller).toBe(b.remaining);

    // The same story posted: the lot's value at cost equals the stock the books hold.
    const cost = B.unitCost;
    const line = <E extends object>(qty: number, extra: E) => ({ qty, unitCost: cost, ...extra });
    const sale = { table: "sale", customerId: "cust-1" } as const;
    const story = [
      posted({ table: "purchase", date: B.date, source: "cash", lines: [line(10, {})] }),
      posted({ ...sale, date: "2026-10-04", lines: [line(4, { unitPrice: 1_800_000 })] }),
      posted({ ...sale, date: "2026-10-04", lines: [line(1, { unitPrice: 1_800_000 })] }),
      posted({
        ...sale,
        date: "2026-10-05",
        reversesId: "x",
        lines: [line(1, { unitPrice: 1_800_000 })],
      }),
      posted({
        table: "return",
        kind: "customer",
        date: "2026-10-06",
        customerId: "cust-1",
        lines: [line(2, { unitAmount: 1_800_000 })],
      }),
      posted({
        table: "return",
        kind: "purchase",
        date: "2026-10-06",
        refundTo: "cash",
        reason: "returned",
        lines: [line(3, { unitAmount: cost })],
      }),
    ];
    const stock = story
      .flatMap((p) => p.effects)
      .filter((e) => e.account === "stock")
      .reduce((n, e) => n + e.amount, 0);
    expect(b.remaining * cost).toBe(stock);
    expectBalanced(story);
  });

  it("a reversed lot keeps its counts; its qty is gone", () => {
    const [a] = lotsRemaining([{ ...A, reversed: true }], []);
    expect(a).toMatchObject({ sold: 0, returned: 0, toSeller: 0, remaining: 0 });
  });
});
