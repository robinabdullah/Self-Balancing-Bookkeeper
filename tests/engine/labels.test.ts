import { describe, expect, it } from "vitest";
import { entryLabels, entryTitle, reversalLabel } from "@mbl/domain/journal/labels";
import type { JournalRow } from "../../apps/api/src/journal/journal.service";

// CR-034 (D-043, D-058): one naming rule for a reversal on the Cash book and every statement.
const row = (id: string, more: Partial<JournalRow>): JournalRow =>
  ({
    id,
    table: "money",
    type: "card_payment",
    detail: null,
    docNo: null,
    reversesId: null,
    ...more,
  }) as JournalRow;

describe("U-CR-034.8 reversalLabel: a reversal reads 'Reversal of {original}'", () => {
  const pay = row("pay", {});
  const undo = row("undo", { reversesId: "pay" });
  const sale = row("sale", { table: "sale", type: "sale", docNo: 42 });
  const unsale = row("unsale", { table: "sale", type: "sale", reversesId: "sale" });
  const journal = [pay, undo, sale, unsale];

  it("names the original with the given labeller; any other row keeps its own name", () => {
    const rows = new Map(journal.map((r) => [r.id, r]));
    expect(reversalLabel(undo, rows, entryTitle)).toBe("Reversal of Card payment");
    expect(reversalLabel(pay, rows, entryTitle)).toBe("Card payment");
    expect(reversalLabel(unsale, rows, entryTitle)).toBe("Reversal of Sale INV-0042");
  });

  it("entryLabels: every row by id (entryLabel by default, no document number)", () => {
    expect(Object.fromEntries(entryLabels(journal))).toEqual({
      pay: "Card payment",
      undo: "Reversal of Card payment",
      sale: "Sale",
      unsale: "Reversal of Sale",
    });
    expect(entryLabels(journal, entryTitle).get("unsale")).toBe("Reversal of Sale INV-0042");
  });

  it("an original missing from the rows: the reversal keeps its own name", () => {
    expect(reversalLabel(undo, new Map(), entryTitle)).toBe("Card payment");
  });
});
