import { describe, expect, it } from "vitest";
import { PAGE, visibleRows } from "@mbl/domain/show-more";

// U-CR-054.1 (D-077): long lists show 25 rows at a time; "Show {next} more" says what is left.
const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("U-CR-054.1 visibleRows", () => {
  it("pages by 25", () => expect(PAGE).toBe(25));

  it.each([
    [0, 0, 0, 0],
    [25, 25, 0, 0],
    [26, 25, 1, 1],
    [51, 25, 26, 25],
  ])("%i rows → %i shown, %i hidden, next %i", (total, shown, hidden, next) => {
    const v = visibleRows(rows(total), PAGE);
    expect(v.shown).toHaveLength(shown);
    expect(v.hidden).toBe(hidden);
    expect(v.next).toBe(next);
  });

  it("51 rows after one tap: 50 shown, next 1; after two, all and next 0", () => {
    expect(visibleRows(rows(51), 50)).toMatchObject({ hidden: 1, next: 1 });
    const all = visibleRows(rows(51), 75);
    expect(all.shown).toHaveLength(51);
    expect(all).toMatchObject({ hidden: 0, next: 0 });
  });

  it("keeps the order: the first n rows (newest first)", () => {
    expect(visibleRows(rows(30), PAGE).shown).toEqual(rows(25));
  });
});
