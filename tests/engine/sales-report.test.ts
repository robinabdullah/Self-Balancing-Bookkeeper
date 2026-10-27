import { describe, expect, it } from "vitest";
import { type BooksData, type StoredEntry, computeBooks } from "@/lib/engine/index";
import { monthProfit } from "@/lib/engine/months";
import type { Entry } from "@/lib/engine/post";
import { add } from "@/lib/money";
import { type ReturnedLine, type SoldLine, margin, salesReport } from "@/lib/sales-report";
import { salesText } from "@/lib/whatsapp";
import { expectBalanced, PARTNERS } from "./invariant";

// CR-023 (D-043; UIDD §4.17): the Sales report. Synthetic ids and figures only (D-014). Each
// fixture builds the engine's entry and the report's lines from one description, as the loader
// reads them from the same rows.
const [ARIF] = PARTNERS.map((p) => p.id);
const A = "cust-a";
const B = "cust-b";

let seq = 0;
const stored = (entry: Entry): StoredEntry => {
  seq += 1;
  return { ...entry, id: `e-${seq}`, createdAt: `${entry.date}T10:00:00.${seq}Z` };
};

type Line = { model: string; qty: number; price: number; cost: number };
const sold: SoldLine[] = [];
const returned: ReturnedLine[] = [];
const entries: StoredEntry[] = [
  stored({
    table: "money",
    type: "capital_in",
    date: "2026-08-01",
    amount: 90_000_000,
    personId: ARIF,
  }),
  stored({
    table: "purchase",
    date: "2026-08-02",
    source: "cash",
    lines: [{ qty: 50, unitCost: 1_000_000 }],
  }),
];

function sale(date: string, customerId: string, lines: Line[], reverses?: StoredEntry) {
  const e = stored({
    table: "sale",
    date,
    customerId,
    reversesId: reverses?.id,
    lines: lines.map((l) => ({ qty: l.qty, unitPrice: l.price, unitCost: l.cost })),
  });
  entries.push(e);
  for (const l of lines)
    sold.push({
      saleId: e.id,
      customerId,
      modelId: l.model,
      qty: l.qty,
      unitPrice: l.price,
      unitCost: l.cost,
      reversal: !!reverses,
      reversesId: reverses?.id ?? null,
    });
  return e;
}

function customerReturn(date: string, customerId: string, lines: Line[]) {
  entries.push(
    stored({
      table: "return",
      kind: "customer",
      date,
      customerId,
      lines: lines.map((l) => ({ qty: l.qty, unitAmount: l.price, unitCost: l.cost })),
    }),
  );
  for (const l of lines)
    returned.push({
      customerId,
      modelId: l.model,
      qty: l.qty,
      unitAmount: l.price,
      unitCost: l.cost,
      reversal: false,
    });
}

// September: a sale reversed in October (the reversal counts in October, on its own date).
const sept = sale("2026-09-20", A, [{ model: "m-x", qty: 2, price: 1_300_000, cost: 1_000_000 }]);
// October: two models on one bill, the X line split over two lots (two rows, one model).
sale("2026-10-02", A, [
  { model: "m-x", qty: 1, price: 1_300_000, cost: 1_000_000 },
  { model: "m-x", qty: 1, price: 1_300_000, cost: 1_050_000 },
  { model: "m-y", qty: 3, price: 2_000_000, cost: 1_000_000 },
]);
const oct = sale("2026-10-05", B, [{ model: "m-y", qty: 1, price: 2_100_000, cost: 1_000_000 }]);
sale("2026-10-08", B, [{ model: "m-y", qty: 1, price: 2_100_000, cost: 1_000_000 }], oct); // reversed in October: nets to 0
sale("2026-10-10", A, [{ model: "m-x", qty: 2, price: 1_300_000, cost: 1_000_000 }], sept);
customerReturn("2026-10-12", A, [{ model: "m-y", qty: 1, price: 1_900_000, cost: 1_000_000 }]);

const data: BooksData = {
  entries,
  partners: PARTNERS,
  allocations: [],
  closed: [],
  cards: [],
  billDates: [],
};
const asOf = "2026-10-31";
const books = computeBooks(data, asOf);
const inOctober = (ids: Set<string>) => (l: { saleId?: string }) => !l.saleId || ids.has(l.saleId);
const octIds = new Set(entries.filter((e) => e.date.startsWith("2026-10")).map((e) => e.id));
const report = salesReport(sold.filter(inOctober(octIds)), returned);

describe("U-CR-023.2 salesReport: totals, by model, by customer", () => {
  it("the books balance", () => {
    expect(books.invariant.difference).toBe(0);
    expectBalanced(books.posted, asOf);
  });

  it("a month's net sales profit = the month's sale + customer_return profit", () => {
    const { components } = monthProfit(books.posted, "2026-10", asOf);
    expect(report.netProfit).toBe(add(components.sale, components.customer_return));
    expect(report.grossProfit).toBe(components.sale);
    expect(report.returns.profit).toBe(components.customer_return);
  });

  it("totals: reversals count on their own date, negated", () => {
    // Bills: +1 (02 Oct) +1 (05 Oct) −1 (its reversal) −1 (September's reversal) = 0.
    expect(report.bills).toBe(0);
    expect(report.pieces).toBe(5 + 1 - 1 - 2);
    expect(report.sales).toBe(2_600_000 + 6_000_000 - 2_600_000);
    expect(report.cost).toBe(2_050_000 + 3_000_000 - 2_000_000);
    expect(report.returns).toEqual({ pieces: 1, amount: 1_900_000, profit: -900_000 });
  });

  it("each table totals the net figures (net of returns)", () => {
    for (const table of [report.byModel, report.byCustomer]) {
      const sum = (k: "pieces" | "sales" | "profit") => table.reduce((s, g) => add(s, g[k]), 0);
      expect(sum("profit")).toBe(report.netProfit);
      expect(sum("sales")).toBe(report.sales - report.returns.amount);
      expect(sum("pieces")).toBe(report.pieces - report.returns.pieces);
    }
  });

  it("a line split over lots is one model row; largest sales first", () => {
    expect(report.byModel.map((g) => g.id)).toEqual(["m-y", "m-x"]);
    const x = report.byModel.find((g) => g.id === "m-x")!;
    expect(x).toMatchObject({ id: "m-x", pieces: 0, sales: 0, profit: 550_000 - 600_000 });
    const y = report.byModel.find((g) => g.id === "m-y")!;
    expect(y).toMatchObject({
      id: "m-y",
      pieces: 2,
      sales: 4_100_000,
      profit: 3_000_000 - 900_000,
    });
    expect(report.byCustomer.find((g) => g.id === B)).toMatchObject({
      id: B,
      pieces: 0,
      sales: 0,
      profit: 0,
    });
  });

  it("margin: gross profit ÷ sales to 1 decimal; none without sales", () => {
    expect(report.margin).toBe(margin(report.grossProfit, report.sales));
    expect(margin(1_000, 3_000)).toBe(33.3);
    expect(margin(2_000, 3_000)).toBe(66.7);
    expect(margin(-1_000, 3_000)).toBe(-33.3);
    expect(margin(0, 0)).toBeNull();
    expect(salesReport([], []).margin).toBeNull();
  });
});

describe("U-CR-033.4 By model: the average of what was sold (D-056)", () => {
  it("returns, reversal lines and sales reversed in the period are left out", () => {
    // m-x: the 2 sold on 02 Oct stand (৳13,000); September's reversal is ignored.
    const x = report.byModel.find((g) => g.id === "m-x")!;
    expect(x).toMatchObject({ avgPieces: 2, avg: 1_300_000 });
    // m-y: 3 at ৳20,000 stand; the 05 Oct sale was reversed in October, the return doesn't count.
    const y = report.byModel.find((g) => g.id === "m-y")!;
    expect(y).toMatchObject({ pieces: 2, avgPieces: 3, avg: 2_000_000 });
  });

  it("returns of earlier sales leave the average at the price sold (not Sales ÷ Pieces)", () => {
    const line = { customerId: A, modelId: "m-v", unitCost: 1_400_000, reversal: false };
    const r = salesReport(
      [{ ...line, saleId: "s-1", qty: 10, unitPrice: 2_000_000 }],
      [{ ...line, qty: 9, unitAmount: 1_500_000 }],
    );
    expect(r.byModel[0]).toMatchObject({ pieces: 1, sales: 6_500_000, avgPieces: 10 });
    expect(r.byModel[0].avg).toBe(2_000_000); // ৳20,000, not ৳65,000
  });

  it("rounds half-up to whole taka; nothing that stands → no average", () => {
    const line = { customerId: A, modelId: "m-v", unitCost: 1_000_000, reversal: false };
    const r = salesReport(
      [
        { ...line, saleId: "s-1", qty: 1, unitPrice: 1_500_000 },
        { ...line, saleId: "s-2", qty: 1, unitPrice: 1_500_100 }, // avg ৳15,000.50 → ৳15,001
        { ...line, saleId: "s-3", qty: 1, unitPrice: 9_900_000 },
        { ...line, saleId: "s-4", qty: 1, unitPrice: 9_900_000, reversal: true, reversesId: "s-3" },
      ],
      [],
    );
    expect(r.byModel[0]).toMatchObject({ pieces: 2, avgPieces: 2, avg: 1_500_100 });
    const only = salesReport(
      [{ ...line, saleId: "s-9", qty: 1, unitPrice: 5, reversal: true }],
      [],
    );
    expect(only.byModel[0]).toMatchObject({ avgPieces: 0, avg: null });
  });

  it("customers get the same fields; every other figure is unchanged", () => {
    const a = report.byCustomer.find((g) => g.id === A)!;
    expect(a.avgPieces).toBe(5); // 02 Oct: 2 + 3
    const sum = report.byModel.reduce((s, g) => add(s, g.sales), 0);
    expect(sum).toBe(report.sales - report.returns.amount);
  });
});

describe("U-CR-023.3 salesText: the sales message", () => {
  it("totals, then the models", () => {
    const text = salesText({
      report,
      from: "2026-10-01",
      to: "2026-10-31",
      name: (id) => id.toUpperCase(),
    });
    expect(text).toBe(
      [
        "📊 *Sales — 01 Oct – 31 Oct 2026*",
        "Bills: 0 · 3 pcs",
        "Sales: ৳60,000",
        "Gross profit: ৳29,500 (49.2%)",
        "Returns: 1 pc · ৳19,000 (profit -৳9,000)",
        "*Net sales profit: ৳20,500*",
        "",
        "📱 *By model*",
        "- M-Y: 2 pcs · avg ৳20,000 · ৳41,000 · profit ৳21,000",
        "- M-X: 0 pcs · avg ৳13,000 · ৳0 · profit -৳500",
      ].join("\n"),
    );
  });
});
