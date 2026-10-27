import { describe, expect, it } from "vitest";
import { auditChanges } from "@mbl/domain/audit";

// Task 3.8.2 (UIDD §4.10): the History tab shows which fields an edit changed, old → new.
describe("auditChanges (task 3.8)", () => {
  const names = { "cust-1": "Test Telecom (Jamal)", "model-v": "Model V" };

  it("lists only the changed fields, with money, months, dates and names shown", () => {
    const before = {
      id: "e1",
      updatedAt: "2026-10-01T10:00:00.000Z",
      date: "2026-10-05",
      amount: "5000.00",
      forMonth: "2026-10-01",
      customerId: null,
      note: "",
    };
    const after = {
      ...before,
      updatedAt: "2026-10-02T10:00:00.000Z",
      amount: "5500.50",
      forMonth: "2026-09-01",
      customerId: "cust-1",
    };
    expect(auditChanges(before, after, names)).toEqual([
      { field: "Amount", from: "৳5,000", to: "৳5,500.50" },
      { field: "For month", from: "Oct 2026", to: "Sep 2026" },
      { field: "Customer", from: "—", to: "Test Telecom (Jamal)" },
    ]);
  });

  it("summarises lines; an add or a delete has no field changes", () => {
    const line = { id: "l1", modelId: "model-v", qty: 2, unitPrice: "18000.00" };
    expect(auditChanges({ lines: [line] }, { lines: [{ ...line, qty: 3 }] }, names)).toEqual([
      { field: "Lines", from: "2 × Model V @ ৳18,000", to: "3 × Model V @ ৳18,000" },
    ]);
    expect(auditChanges(null, { amount: "1.00" })).toEqual([]);
    expect(auditChanges({ amount: "1.00" }, null)).toEqual([]);
  });
});
