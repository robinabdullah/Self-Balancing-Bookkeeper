import { describe, expect, it } from "vitest";
import {
  accountRows,
  billProfit,
  searchRows,
  statementLines,
  supplierDueText,
} from "@/lib/accounts";
import { dueStatements } from "@/lib/engine/customers";
import type { MoneyEntry } from "@/lib/engine/post";
import { expectBalanced, posted } from "./invariant";

// Task 4.3 (UIDD §4.8): the Customers / Suppliers lists and statements. Synthetic ids (D-014).
const MILON = "cust-milon";
const MITU = "cust-mitu";
const SUPP = "supp-1";
const money = (m: Omit<MoneyEntry, "table">): MoneyEntry => ({ table: "money", ...m });

// 2 Vivo on supplier credit; one sold to Milon (profit ৳1,300); he pays part; returns nothing;
// we pay the supplier part. Mitu has no entries.
const buy = posted({
  table: "purchase",
  date: "2026-10-01",
  source: "supplier_credit",
  supplierId: SUPP,
  lines: [{ qty: 2, unitCost: 1_770_000 }],
});
const sale = posted({
  table: "sale",
  date: "2026-10-02",
  customerId: MILON,
  lines: [{ qty: 1, unitPrice: 1_900_000, unitCost: 1_770_000 }],
});
const payIn = posted(
  money({ type: "customer_payment", date: "2026-10-03", customerId: MILON, amount: 500_000 }),
);
const discount = posted(
  money({ type: "customer_discount", date: "2026-10-04", customerId: MILON, amount: 20_050 }),
);
const payOut = posted(
  money({
    type: "supplier_payment",
    date: "2026-10-05",
    supplierId: SUPP,
    amount: 3_000_000,
    source: "cash",
  }),
);
const entries = [buy, sale, payIn, discount, payOut];
const customers = dueStatements(entries, "customer_due", "2026-10-31");
const suppliers = dueStatements(entries, "supplier_due", "2026-10-31");

describe("4.3 accountRows / searchRows", () => {
  const rows = accountRows(
    [
      {
        id: MILON,
        name: "Milon Telecom (Milon)",
        terms: ["Milon Telecom", "Milon", "01711-000001"],
      },
      {
        id: MITU,
        name: "Mitu Mobile (Mitu)",
        terms: ["Mitu Mobile", "Mitu", null],
        badge: "Inactive",
      },
    ],
    customers,
  );

  it("U4.3.1 each row's balance and last activity come from its statement; by name", () => {
    expectBalanced(entries);
    expect(rows.map((r) => [r.id, r.balance, r.lastActivity, r.badge])).toEqual([
      [MILON, 1_379_950, "2026-10-04", undefined],
      [MITU, 0, null, "Inactive"],
    ]);
  });

  it("U4.3.2 search matches shop name, proprietor or phone, any case", () => {
    expect(searchRows(rows, "  milon TEL").map((r) => r.id)).toEqual([MILON]);
    expect(searchRows(rows, "mitu").map((r) => r.id)).toEqual([MITU]);
    expect(searchRows(rows, "000001").map((r) => r.id)).toEqual([MILON]);
    expect(searchRows(rows, "")).toHaveLength(2);
    expect(searchRows(rows, "nobody")).toEqual([]);
  });
});

describe("4.3 statementLines", () => {
  it("U4.3.3 newest first, up = the due goes up, down = it goes down, running balance kept", () => {
    expectBalanced(entries);
    expect(
      statementLines(customers[MILON]).map((l) => [l.entryId, l.up, l.down, l.balance]),
    ).toEqual([
      [discount.id, null, 20_050, 1_379_950],
      [payIn.id, null, 500_000, 1_400_000],
      [sale.id, 1_900_000, null, 1_900_000],
    ]);
    expect(statementLines(undefined)).toEqual([]);
  });

  it("U4.3.4 a supplier's statement: we owe ৳5,400 after the payment", () => {
    expect(statementLines(suppliers[SUPP]).map((l) => [l.up, l.down, l.balance])).toEqual([
      [null, 3_000_000, 540_000],
      [3_540_000, null, 3_540_000],
    ]);
    expect(supplierDueText(suppliers[SUPP].balance)).toBe("We owe ৳5,400");
    expect(supplierDueText(-20_000)).toBe("Credit ৳200");
    expect(supplierDueText(0)).toBe("No due");
  });
});

describe("4.3 billProfit", () => {
  it("U4.3.5 a bill's profit is its postEntry profit; a reversal's is negated", () => {
    expect(billProfit(sale)).toBe(130_000);
    const reversal = posted({
      table: "sale",
      date: "2026-10-06",
      customerId: MILON,
      reversesId: sale.id,
      lines: [{ qty: 1, unitPrice: 1_900_000, unitCost: 1_770_000 }],
    });
    expect(billProfit(reversal)).toBe(-130_000);
    expectBalanced([...entries, reversal]);
    expect(billProfit(undefined)).toBe(0);
  });
});
