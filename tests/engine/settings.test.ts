import { describe, expect, it } from "vitest";
import { moreLinks } from "@/components/shell/nav";
import { theme } from "@/db/schema";
import { themeLabels, themes } from "@mbl/domain/themes";

// CR-017 (D-037; UIDD §3, §4.13): the More list and the three themes.
describe("CR-017 Settings and themes", () => {
  it("U-CR-017.2 More lists Months · Journal · Reports (D-043) · Saved details (D-039) · Setup · Settings", () => {
    expect(moreLinks).toEqual([
      { label: "Months", href: "/months" },
      { label: "Journal", href: "/journal" },
      { label: "Reports", href: "/reports" },
      { label: "Saved details", href: "/saved" },
      { label: "Setup", href: "/setup" },
      { label: "Settings", href: "/settings" },
    ]);
  });

  it("U-CR-017.3 the themes match the database enum, each with a label", () => {
    expect([...themes]).toEqual(theme.enumValues);
    expect(themes.map((t) => themeLabels[t])).toEqual(["Light", "Dark", "Night Owl"]);
  });
});
