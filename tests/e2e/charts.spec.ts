import { expect, type Page, test } from "@playwright/test";
import { goHome, noSideScroll } from "./helpers";

// CR-040 (D-064; UIDD §4.17): the Charts page shell. Reports' first row opens it; the tabs
// (`?tab=`) and the period chips (`?period=`) live in the URL; Custom opens the Report sheet
// with View on screen only, which brings back a range and its chip. Reads whatever the local
// books hold; synthetic data only.

const params = (page: Page) => new URL(page.url()).searchParams;

test.describe("CR-040 Charts page", () => {
  test("E-CR-040.1 Reports → Charts; tabs and chips change the URL; Custom → the Report sheet", async ({
    page,
  }) => {
    await goHome(page);
    await page.goto("/reports");
    const reports = page.getByRole("list", { name: "Reports" }).getByRole("link");
    await expect(reports.first()).toHaveText(/^Charts\s*Profit, expenses, dues and more over time/);
    await reports.first().click();
    await page.waitForURL("/reports/charts");
    await expect(page.getByRole("heading", { name: "Charts", level: 1 })).toBeVisible();
    // On screen only: no ⤴ Share.
    await expect(page.getByRole("link", { name: /share/i })).toHaveCount(0);

    const tabs = page.getByRole("navigation", { name: "Charts" });
    const chips = page.getByRole("navigation", { name: "Period" });
    const current = (nav: typeof tabs, name: string) =>
      expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(tabs.getByRole("link")).toHaveText(["Profit", "Money", "Customers", "Stock"]);
    await expect(chips.getByRole("link")).toHaveText(["6M", "12M", "This year", "Custom"]);
    await current(tabs, "Profit");
    await current(chips, "6M");
    await expect(page.locator("[aria-current=page]", { hasText: "12M" })).toHaveCount(0);

    // 44 px taps and no horizontal scroll.
    for (const link of [
      ...(await tabs.getByRole("link").all()),
      ...(await chips.getByRole("link").all()),
    ]) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await noSideScroll(page);

    // A chip sets the period; a tab keeps it; 6M (the default) drops it.
    await chips.getByRole("link", { name: "12M" }).click();
    await expect.poll(() => params(page).get("period")).toBe("12m");
    await current(chips, "12M");
    await tabs.getByRole("link", { name: "Stock" }).click();
    await expect.poll(() => params(page).get("tab")).toBe("stock");
    expect(params(page).get("period")).toBe("12m");
    await current(tabs, "Stock");
    await current(chips, "12M");
    // The Stock tab's two cards (CR-044).
    await expect(page.getByRole("region", { name: "Stock charts" }).getByRole("link")).toHaveCount(2);
    await chips.getByRole("link", { name: "This year" }).click();
    await expect.poll(() => params(page).get("period")).toBe("year");
    expect(params(page).get("tab")).toBe("stock");
    await chips.getByRole("link", { name: "6M" }).click();
    await expect.poll(() => params(page).has("period")).toBe(false);
    expect(params(page).get("tab")).toBe("stock");

    // Custom → the Report sheet, View on screen only → the range and its chip.
    await chips.getByRole("link", { name: "Custom" }).click();
    const sheet = page.getByRole("dialog", { name: "Charts" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link")).toHaveText(["View on screen"]);
    await sheet.getByRole("link", { name: "View on screen" }).click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => params(page).has("from") && params(page).has("to")).toBe(true);
    expect(params(page).get("tab")).toBe("stock");
    expect(params(page).has("report")).toBe(false);
    await current(chips, "Custom");
    await current(tabs, "Stock");

    // The range chip's ✕ goes back to 6M on the same tab.
    await page.getByRole("link", { name: "Clear the period" }).click();
    await expect.poll(() => params(page).has("from")).toBe(false);
    expect(params(page).get("tab")).toBe("stock");
    await current(chips, "6M");
  });
});
