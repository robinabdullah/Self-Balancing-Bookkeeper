import { describe, expect, it } from "vitest";
import { effectRows } from "@mbl/domain/effect-rows";
import { previewEntry } from "@mbl/domain/preview";
import { cardName, customerName } from "@mbl/domain/setup";
import { moneyEntrySchema } from "@mbl/domain/validation/money-entry";

// Task 3.3.3 (UIDD §3 "What this will do"; D-024): the preview rows come from postEntry
// (label · amount rows since D-061).
// Synthetic ids and names only (D-014).
const ID = "00000000-0000-4000-8000-000000000001";
const CARD = "00000000-0000-4000-8000-0000000000c1";
const CUST = "00000000-0000-4000-8000-0000000000a1";
const ARIF = "00000000-0000-4000-8000-0000000000b1";
const SUMON = "00000000-0000-4000-8000-0000000000b2";
const names = {
  [CARD]: cardName("City Visa", "Arif"),
  [CUST]: customerName({ shopName: "Test Telecom", proprietorName: "Jamal" }),
  [ARIF]: "Arif",
  [SUMON]: "Sumon",
};

/** The form's text values → the Zod schema → postEntry, as a money-entry form will do it. */
function preview(fields: Record<string, string>) {
  const parsed = moneyEntrySchema.safeParse({ id: ID, date: "2026-10-07", ...fields });
  return previewEntry(parsed.success ? { ...parsed.data, table: "money" } : null, { names }, [
    { id: ARIF, pct: 50 },
    { id: SUMON, pct: 50 },
  ]);
}

describe("What this will do (task 3.3.3)", () => {
  it('U3.3.2 a card payment previews "Cash −…, <card> −…, Profit: no change" (D-024)', () => {
    expect(preview({ type: "card_payment", cardId: CARD, amount: "33,720" })).toEqual([
      { label: "Cash", value: "-৳33,720" },
      { label: "Arif · City Visa", value: "-৳33,720" },
      { label: "Profit", value: "no change" },
    ]);
  });

  it("3.3.3 profit lands in its month; a customer due reads as owes", () => {
    expect(preview({ type: "customer_discount", customerId: CUST, amount: "1,250.50" })).toEqual([
      { label: "Test Telecom (Jamal) owes", value: "-৳1,250.50" },
      { label: "Profit", sub: "Oct 2026", value: "-৳1,250.50" },
      { label: "Cash", value: "no change" },
    ]);
  });

  it("3.3.3 an opening correction shows the opening difference per partner", () => {
    expect(
      preview({
        type: "opening_correction",
        openingKind: "customer_due",
        customerId: CUST,
        amount: "20,000",
      }),
    ).toEqual([
      { label: "Test Telecom (Jamal) owes", value: "+৳20,000" },
      { label: "Arif's opening difference", value: "+৳10,000" },
      { label: "Sumon's opening difference", value: "+৳10,000" },
      { label: "Cash and profit", value: "no change" },
    ]);
  });

  it("3.3.3 an incomplete form has no preview yet", () => {
    expect(preview({ type: "card_payment", amount: "33,720" })).toBeNull();
    expect(
      previewEntry(
        { table: "money", type: "card_payment", date: "2026-10-07", amount: 1 },
        { names },
      ),
    ).toBeNull();
  });

  it("3.3.3 an unknown id falls back to a plain word", () => {
    expect(effectRows([{ account: "supplier_due", amount: 500, id: "x" }], { names: {} })).toEqual([
      { label: "We owe Supplier", value: "+৳5" },
      { label: "Cash and profit", value: "no change" },
    ]);
  });
});
