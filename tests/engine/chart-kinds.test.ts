import { describe, expect, it } from "vitest";
import { entryKinds, standing } from "@mbl/domain/charts/kinds";
import { computeBooks, type StoredEntry } from "@mbl/domain/engine/index";
import type { Entry } from "@mbl/domain/engine/post";
import { expectBalanced, PARTNERS } from "./invariant";

// CR-040.5 (D-064). Synthetic ids and figures only (D-014).
const [ARIF] = PARTNERS.map((p) => p.id);
const CUST = "cust-1";
const SUPP = "supp-1";

let seq = 0;
const stored = (entry: Entry): StoredEntry => {
  seq += 1;
  return { ...entry, id: `k-${seq}`, createdAt: `${entry.date}T10:00:00.${seq}Z` };
};

const capital = stored({
  table: "money",
  type: "capital_in",
  date: "2026-10-01",
  amount: 10_000_000,
  personId: ARIF,
});
const purchase = stored({
  table: "purchase",
  date: "2026-10-02",
  source: "supplier_credit",
  supplierId: SUPP,
  lines: [{ qty: 3, unitCost: 1_000_000 }],
});
const sale = stored({
  table: "sale",
  date: "2026-10-03",
  customerId: CUST,
  lines: [{ qty: 2, unitPrice: 1_200_000, unitCost: 1_000_000 }],
});
const customerReturn = stored({
  table: "return",
  kind: "customer",
  date: "2026-10-04",
  customerId: CUST,
  lines: [{ qty: 1, unitAmount: 1_200_000, unitCost: 1_000_000 }],
});
const purchaseReturn = stored({
  table: "return",
  kind: "purchase",
  date: "2026-10-04",
  supplierId: SUPP,
  refundTo: "supplier",
  lines: [{ qty: 1, unitAmount: 1_000_000, unitCost: 1_000_000 }],
});
const payment = stored({
  table: "money",
  type: "customer_payment",
  date: "2026-10-05",
  amount: 500_000,
  customerId: CUST,
});
const reversedPayment = stored({
  table: "money",
  type: "customer_payment",
  date: "2026-10-06",
  amount: 300_000,
  customerId: CUST,
});
const reversal = stored({
  table: "money",
  type: "customer_payment",
  date: "2026-10-07",
  amount: 300_000,
  customerId: CUST,
  reversesId: reversedPayment.id,
});

const entries = [
  capital,
  purchase,
  sale,
  customerReturn,
  purchaseReturn,
  payment,
  reversedPayment,
  reversal,
];

describe("entryKinds / standing (D-064)", () => {
  it("U-CR-040.4 each entry's kind; a reversal has its original's kind", () => {
    const kinds = entryKinds(entries);
    expect(kinds.get(capital.id)).toBe("capital_in");
    expect(kinds.get(purchase.id)).toBe("purchase");
    expect(kinds.get(sale.id)).toBe("sale");
    expect(kinds.get(customerReturn.id)).toBe("customer_return");
    expect(kinds.get(purchaseReturn.id)).toBe("purchase_return");
    expect(kinds.get(payment.id)).toBe("customer_payment");
    expect(kinds.get(reversal.id)).toBe(kinds.get(reversedPayment.id));
    expect(kinds.size).toBe(entries.length);
  });

  it("U-CR-040.4 standing leaves out a reversal and the entry it reversed", () => {
    expect(standing(entries, "customer_payment").map((e) => e.id)).toEqual([payment.id]);
    expect(standing(entries, "sale")).toEqual([sale]);
    expect(standing(entries, "expense")).toEqual([]);

    const books = computeBooks(
      { entries, partners: PARTNERS, allocations: [], closed: [], cards: [], billDates: [] },
      "2026-10-07",
    );
    expect(books.posted.map((p) => p.id)).toEqual(entries.map((e) => e.id));
    expectBalanced(books.posted, "2026-10-07");
  });
});
