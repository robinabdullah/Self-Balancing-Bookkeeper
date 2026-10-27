import { expect, test } from "@playwright/test";
import { goHome, noSideScroll } from "./helpers";

// CR-039 (D-064; UIDD §3): the Books balance sheet. Net worth with ✓ Balanced on top, then What we
// have → Business assets, What we owe → Total we owe → Net worth, Whose it is → Total, and the
// footer. Reads whatever the local books hold; synthetic data only.

test.describe("CR-039 Books balance", () => {
  test("E-CR-039.1 Net worth on top, the three sections in order, and the footer", async ({
    page,
  }) => {
    await goHome(page);
    await page.getByRole("button", { name: "Balanced" }).click();
    const sheet = page.getByRole("dialog", { name: "Books balance" });
    await expect(sheet).toBeVisible();

    const top = sheet.getByRole("region", { name: "Net worth" });
    await expect(top).toContainText("Net worth");
    await expect(top).toContainText("Balanced");
    const headings = sheet.locator("h3");
    await expect(headings).toHaveText(["What we have", "What we owe", "Whose it is"]);
    const [topBox, firstBox] = [await top.boundingBox(), await headings.first().boundingBox()];
    expect(topBox!.y).toBeLessThan(firstBox!.y);

    await expect(sheet.locator("dt")).toHaveText([
      "Cash",
      "Stock at cost",
      "Customers owe",
      "Business assets",
      "Card balances",
      "We owe suppliers",
      "Total we owe",
      "Net worth",
      "Capital",
      "Opening difference",
      "Profit owed",
      "Undistributed profit",
      "Total",
    ]);

    // Net worth on top = the What we owe section's Net worth = Whose it is's Total.
    const amount = (section: string, term: string) =>
      sheet
        .getByRole("region", { name: section })
        .locator("div", { has: page.locator("dt", { hasText: new RegExp(`^${term}$`) }) })
        .locator("dd");
    const netWorth = await top.locator(".tabular-nums").innerText();
    await expect(amount("What we owe", "Net worth")).toHaveText(netWorth);
    await expect(amount("Whose it is", "Total")).toHaveText(netWorth);

    await expect(
      sheet.getByText("✓ Net worth matches “Whose it is”: every taka is accounted for."),
    ).toBeVisible();

    await noSideScroll(page);
  });
});
