import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aboutText, fieldHelp, viewHelp } from "@mbl/domain/help-text";

// The rows of a UIDD §3 table, found by its header: [name, text].
function uiddRows(header: string) {
  const uidd = readFileSync("docs/UIDD.md", "utf-8");
  const lines = uidd.slice(uidd.indexOf(header)).split("\n");
  const end = lines.findIndex((line) => !line.startsWith("|"));
  return lines
    .slice(2, end) // skip the header + divider; stop where the table ends
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length === 2);
}

describe("help-text.ts (UIDD §3, D-020)", () => {
  const rows = uiddRows("| Form | About this form |");

  it("reads the UIDD §3 table", () => {
    expect(rows.map(([form]) => form)).toContain("Setup: Model");
  });

  it.each(rows)("U3.3.1 / U-CR-001.1 %s has its UIDD About text, word for word", (_form, text) => {
    expect(Object.values(aboutText)).toContain(text);
  });

  it("U3.3.1 every UIDD §3 form, incl. Setup and card bill dates, has an About text", () => {
    expect(rows).toHaveLength(Object.keys(aboutText).length);
    expect(rows.map(([form]) => form)).toEqual(
      expect.arrayContaining(["Setup: Person", "Setup: Card", "Card bill dates"]),
    );
  });

  const fields = uiddRows("| Field (Setup) | ⓘ text (D-023) |");

  it.each(fields)("3.2 the %s ⓘ text matches UIDD §3, word for word", (_field, text) => {
    expect(Object.values(fieldHelp)).toContain(text);
  });

  it("3.2 every Setup ⓘ in UIDD §3 has a text", () => {
    expect(fields.map(([f]) => f)).toEqual([
      "Statement day",
      "Due day",
      "Credit limit",
      "Target balance",
      "Profit share %",
    ]);
  });

  const entryFields = uiddRows("| Field (entry forms) | ⓘ text (D-024) |");

  it.each(entryFields)("U-CR-005.1 the %s ⓘ text matches UIDD §3, word for word", (_f, text) => {
    expect(Object.values(fieldHelp)).toContain(text);
  });

  it("U-CR-005.1 every entry-form ⓘ in UIDD §3 has a text, and fieldHelp has no others", () => {
    expect(entryFields).toHaveLength(15); // + Capital out: Paid by (D-060)
    expect(Object.keys(fieldHelp)).toHaveLength(fields.length + entryFields.length);
  });

  it('4.4.1 the Cards "Available ≈" ⓘ text matches UIDD §4.8, word for word', () => {
    expect(readFileSync("docs/UIDD.md", "utf-8")).toContain(`shows "${viewHelp.available}"`);
  });
});
