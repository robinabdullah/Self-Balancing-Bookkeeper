import { describe, expect, it } from "vitest";
import { type BillDates, type Card, cardSummaries } from "@mbl/domain/engine/cards";
import type { PurchaseEntry } from "@mbl/domain/engine/post";
import { addMonths } from "@mbl/domain/dates";
import { emiPreview } from "@mbl/domain/preview";
import { posted } from "./invariant";

// U-CR-013.6 (D-032): the purchase form's EMI preview equals the bills the engine makes for the
// same purchase once saved (SRS §6.3–4). Synthetic ids and amounts (poisha).
const EBL: Card = { id: "card-ebl", statementDay: 5, dueDay: 20 };
const SOUTHEAST: Card = { id: "card-southeast", statementDay: 19, dueDay: 4 };
const MONTH_END: Card = { id: "card-31", statementDay: 31, dueDay: 15 };

const buy = (card: Card, date: string, total: number, emiMonths: number, override?: string) =>
  ({
    table: "purchase",
    source: "card",
    cardId: card.id,
    date,
    emiMonths,
    billMonthOverride: override ?? null,
    lines: [{ qty: 1, unitCost: total }],
  }) as PurchaseEntry;

/** The engine's bills for one saved EMI purchase, as [month, amount]. */
function engineBills(card: Card, entry: PurchaseEntry, overrides: BillDates[] = []) {
  const s = cardSummaries([posted(entry)], [card], overrides, "2030-01-01")[card.id];
  return s.bills.map((b) => [b.month, b.amount]);
}

function previewBills(card: Card, entry: PurchaseEntry, overrides: BillDates[] = []) {
  const p = emiPreview(
    card,
    entry.date,
    entry.lines[0].unitCost,
    entry.emiMonths!,
    entry.billMonthOverride ?? null,
    overrides,
  );
  return p!.parts.map((part, k) => [addMonths(p!.firstBill, k), part]);
}

describe("U-CR-013.6 EMI preview = the engine's bills", () => {
  it.each([
    ["the day before the statement", EBL, "2026-10-04"],
    ["on the statement day (in that bill)", EBL, "2026-10-05"],
    ["the day after the statement", EBL, "2026-10-06"],
    ["a 19th statement, due next month", SOUTHEAST, "2026-10-20"],
    ["a 31st statement in February", MONTH_END, "2027-02-28"],
  ])("%s", (_, card, date) => {
    const entry = buy(card, date, 2_173_665, 5);
    expect(previewBills(card, entry)).toEqual(engineBills(card, entry));
  });

  it("a bill-month override", () => {
    const entry = buy(EBL, "2026-10-06", 5_636_298, 3, "2026-12");
    expect(previewBills(EBL, entry)).toEqual(engineBills(EBL, entry));
    expect(previewBills(EBL, entry)[0][0]).toBe("2026-12");
  });

  it("an actual statement date moved by the bank", () => {
    const moved: BillDates[] = [
      { cardId: EBL.id, billMonth: "2026-10-01", actualStatementDate: "2026-10-08" },
    ];
    const entry = buy(EBL, "2026-10-07", 531_834, 2);
    expect(previewBills(EBL, entry, moved)).toEqual(engineBills(EBL, entry, moved));
    expect(previewBills(EBL, entry, moved)[0][0]).toBe("2026-10"); // not Nov: the bank moved it
    // Another card's override doesn't count.
    const other = [{ ...moved[0], cardId: "card-other" }];
    expect(previewBills(EBL, entry, other)[0][0]).toBe("2026-11");
  });

  it("an uneven split puts the remainder last, as the engine does", () => {
    const entry = buy(EBL, "2026-10-06", 10_001, 3);
    expect(previewBills(EBL, entry)).toEqual(engineBills(EBL, entry));
    expect(emiPreview(EBL, "2026-10-06", 10_001, 3, null, [])?.text).toBe(
      "3 × ৳33.33 (last ৳33.35) · first in Nov 2026 bill",
    );
  });

  it("the preview text; nothing while the form is incomplete", () => {
    expect(emiPreview(EBL, "2026-10-06", 2_173_665, 5, null, [])?.text).toBe(
      "5 × ৳4,347.33 · first in Nov 2026 bill",
    );
    expect(emiPreview(undefined, "2026-10-06", 100, 2, null, [])).toBeNull();
    expect(emiPreview(EBL, "", 100, 2, null, [])).toBeNull();
    expect(emiPreview(EBL, "2026-10-06", 0, 2, null, [])).toBeNull();
    expect(emiPreview(EBL, "2026-10-06", 100, 1, null, [])).toBeNull();
    expect(emiPreview(EBL, "2026-10-06", 100, Number.NaN, null, [])).toBeNull();
  });
});
