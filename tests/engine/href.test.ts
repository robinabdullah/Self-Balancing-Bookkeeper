import { describe, expect, it } from "vitest";
import { entryHref, safeFrom, withQuery } from "@mbl/domain/href";

// CR-013 (D-032): entry details open over the page; forms return to `from`.
describe("U-CR-013.1 in-app links", () => {
  it("withQuery adds, replaces and removes params and keeps the others", () => {
    expect(withQuery("/journal", { who: "a" })).toBe("/journal?who=a");
    expect(withQuery("/customers/x?tab=bills", { entry: "e" })).toBe(
      "/customers/x?tab=bills&entry=e",
    );
    expect(withQuery("/journal?entry=old&who=a", { entry: "new" })).toBe(
      "/journal?entry=new&who=a",
    );
    expect(withQuery("/journal?entry=e&who=a", { entry: null, who: "" })).toBe("/journal");
    expect(withQuery("/money/new?type=card_payment", { from: "/cards/c?entry=e" })).toBe(
      "/money/new?type=card_payment&from=%2Fcards%2Fc%3Fentry%3De",
    );
  });

  it("entryHref opens the entry over the page it was tapped on", () => {
    expect(entryHref("/cards/c", "e")).toBe("/cards/c?entry=e");
    expect(entryHref("/customers/x?tab=bills", "e")).toBe("/customers/x?tab=bills&entry=e");
  });

  it("safeFrom accepts only paths in this app", () => {
    expect(safeFrom("/cards/x?entry=y")).toBe("/cards/x?entry=y");
    expect(safeFrom("/")).toBe("/");
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "cards",
      "",
      ["/a"],
      undefined,
      null,
      42,
      `/${"a".repeat(600)}`,
    ]) {
      expect(safeFrom(bad), String(bad)).toBeUndefined();
    }
  });
});
