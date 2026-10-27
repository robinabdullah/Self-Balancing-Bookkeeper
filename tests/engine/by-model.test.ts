import { describe, expect, it } from "vitest";
import { statementRange } from "@/lib/accounts";
import { modelTotal, piecesAt, purchasesByModel, salesByModel } from "@/lib/by-model";
import { add, sub } from "@/lib/money";
import { type ReturnedLine, type SoldLine, salesReport } from "@/lib/sales-report";
import { CUST, MA, MB, MC, SUPP, books, bought, entries, sentBack, typeOf } from "./report-fixture";

// CR-025 (D-045; UIDD §4.8): the By model tables under a statement. A customer's are the Sales
// report's own figures for that customer; a supplier's count every purchase naming them at the
// price paid, less their lots sent back at the refund amount (however refunded). Synthetic data.

const tk = (n: number) => n * 100;
const OTHER = "cust-2";
const sold: SoldLine[] = [
  {
    saleId: "s1",
    customerId: CUST,
    modelId: MA,
    qty: 2,
    unitPrice: tk(1_500),
    unitCost: tk(1_000),
    reversal: false,
  },
  {
    saleId: "s2",
    customerId: CUST,
    modelId: MB,
    qty: 1,
    unitPrice: tk(2_500),
    unitCost: tk(2_000),
    reversal: false,
  },
  {
    saleId: "s3",
    customerId: OTHER,
    modelId: MA,
    qty: 4,
    unitPrice: tk(1_400),
    unitCost: tk(1_000),
    reversal: false,
  },
];
const returned: ReturnedLine[] = [
  {
    customerId: CUST,
    modelId: MA,
    qty: 1,
    unitAmount: tk(1_500),
    unitCost: tk(1_000),
    reversal: false,
  },
];
const only = <T extends { customerId: string }>(rows: T[]) =>
  rows.filter((r) => r.customerId === CUST);

describe("U-CR-025.3 By model: customer sales, supplier purchases, bought from a customer", () => {
  it("a customer's By model = the Sales report's row for that customer", () => {
    const all = salesReport(sold, returned);
    const row = all.byCustomer.find((g) => g.id === CUST)!;
    const mine = salesByModel(salesReport(only(sold), only(returned)));
    expect(modelTotal(mine)).toEqual({ pieces: row.pieces, amount: row.sales });
    expect(mine).toEqual([
      { id: MB, pieces: 1, amount: tk(2_500), avgPieces: 1, avg: tk(2_500) },
      { id: MA, pieces: 1, amount: tk(1_500), avgPieces: 2, avg: tk(1_500) }, // 1 of 2 returned
    ]);
  });

  it("a customer's total = the statement's sale debits − return credits for the period", () => {
    const range = statementRange(books.customers[CUST].rows, "2026-09-01", "2026-10-31");
    const salesAndReturns = range.lines
      .filter((l) => ["sale", "customer_return"].includes(typeOf(l.entryId) ?? ""))
      .reduce((n, l) => add(n, l.amount), 0);
    const mine = salesByModel(salesReport(only(sold).slice(0, 2), only(returned)));
    expect(modelTotal(mine).amount).toBe(salesAndReturns);
  });

  it("a supplier: every purchase naming them, less their lots sent back at the refund", () => {
    const rows = purchasesByModel(bought[SUPP], sentBack[SUPP]);
    expect(rows).toEqual([
      // EMI on a card + credit: both name them
      { id: MB, pieces: 4, amount: tk(8_000), avgPieces: 4, avg: tk(2_000) },
      // a cash purchase of 2, one sent back for ৳900: the average stays at the price paid
      { id: MA, pieces: 1, amount: tk(1_100), avgPieces: 2, avg: tk(1_000) },
    ]);
    // Ties out to the books: their purchases' stock, less the refund (stock − profit of the return).
    const effects = (pred: (e: (typeof entries)[number]) => boolean, account: string) =>
      books.posted
        .filter((p) => pred(entries.find((e) => e.id === p.id)!))
        .flatMap((p) => p.effects)
        .filter((e) => e.account === account)
        .reduce((n, e) => add(n, e.amount), 0);
    const theirs = effects((e) => e.table === "purchase" && e.supplierId === SUPP, "stock");
    const back = (e: (typeof entries)[number]) =>
      e.table === "return" && e.kind === "purchase" && e.date === "2026-09-20";
    const refund = sub(effects(back, "profit"), effects(back, "stock"));
    expect(modelTotal(rows).amount).toBe(sub(theirs, refund));
  });

  it("bought from a customer, and sent back to them, nets to nothing", () => {
    expect(bought[CUST]).toHaveLength(1);
    expect(purchasesByModel(bought[CUST], sentBack[CUST])).toEqual([]);
    expect(purchasesByModel(bought[CUST], [])).toEqual([
      { id: MC, pieces: 1, amount: tk(400), avgPieces: 1, avg: tk(400) },
    ]);
  });

  it("a reversal counts the other way", () => {
    const line = { modelId: MA, qty: 2, unitCost: tk(1_000) };
    expect(
      purchasesByModel(
        [
          { ...line, reversal: false },
          { ...line, reversal: true },
        ],
        [],
      ),
    ).toEqual([]);
    const back = { modelId: MA, qty: 1, unitAmount: tk(900) };
    expect(
      purchasesByModel(
        [{ ...line, reversal: false }],
        [
          { ...back, reversal: false },
          { ...back, reversal: true },
        ],
      ),
    ).toEqual([{ id: MA, pieces: 2, amount: tk(2_000), avgPieces: 2, avg: tk(1_000) }]);
  });
});

describe("U-CR-033.5 By model: the average and its phrase (D-056)", () => {
  const line = { modelId: MA, unitCost: tk(1_000), reversal: false };

  it("purchases: reversal lines and purchases reversed in the period are left out", () => {
    const rows = purchasesByModel(
      [
        { ...line, qty: 2, purchaseId: "p1" },
        { ...line, qty: 1, unitCost: tk(5_000), purchaseId: "p2" },
        {
          ...line,
          qty: 1,
          unitCost: tk(5_000),
          purchaseId: "r2",
          reversal: true,
          reversesId: "p2",
        },
        // a reversal of an earlier period's purchase: ignored by the average
        { ...line, qty: 3, unitCost: tk(700), purchaseId: "r0", reversal: true, reversesId: "p0" },
      ],
      [{ modelId: MA, qty: 1, unitAmount: tk(900), reversal: false }],
    );
    expect(rows).toEqual([
      { id: MA, pieces: -2, amount: sub(tk(2_000 - 2_100), tk(900)), avgPieces: 2, avg: tk(1_000) },
    ]);
  });

  it("piecesAt: × when the pieces are the ones averaged; · avg after returns; none → pieces", () => {
    expect(piecesAt({ pieces: 30, avgPieces: 30, avg: tk(15_700) })).toBe("30 pcs × ৳15,700");
    expect(piecesAt({ pieces: 1, avgPieces: 1, avg: tk(15_700) })).toBe("1 pc × ৳15,700");
    expect(piecesAt({ pieces: 29, avgPieces: 30, avg: tk(15_700) })).toBe("29 pcs · avg ৳15,700");
    expect(piecesAt({ pieces: -1, avgPieces: 0, avg: null })).toBe("-1 pcs");
  });
});
