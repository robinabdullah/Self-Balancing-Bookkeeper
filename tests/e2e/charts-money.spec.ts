import { type Page, expect, test } from "@playwright/test";
import { formatDate } from "@/lib/dates";
import { parse } from "@/lib/money";
import { goHome, noSideScroll } from "./helpers";
import { dhaka, phone, seedAccounts, seedMoney, sql } from "./seed";

// CR-042 (D-064, clarified 2026-10-24; UIDD §4.17): the Charts · Money tab. Business value's row
// for today is read against the Books balance sheet as it stands (the E2E books are shared). A
// capital out takes cash below 0 for one day and a capital in brings it back the next, so Cash
// marks that day; both rows are deleted after the test, leaving the books as they were. No
// profit effect, so the books stay balanced. Synthetic data only; amounts in SQL are taka.
// CR-046 (D-064, clarified 2026-10-27): the table's Business assets column.

const LOW = dhaka(-3);
const BACK = dhaka(-2);
const BIG = 900_000_000;
const seeded: string[] = [];

/** What the Books balance sheet shows (label → amount), opened from the top-bar chip. */
async function balanceSheet(page: Page) {
  await page.getByRole("button", { name: "Balanced" }).click();
  const sheet = page.getByRole("dialog", { name: "Books balance" });
  const rows = await sheet
    .locator("section dl > div")
    .evaluateAll((divs) =>
      divs.map((d) => [
        d.querySelector("dt")?.textContent?.trim() ?? "",
        d.querySelector("dd")?.textContent?.trim() ?? "",
      ]),
    );
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  return Object.fromEntries(rows);
}

/** The last row of a chart's values (label → shown text): the phone list or the desktop table. */
async function lastRow(page: Page, name: string): Promise<Record<string, string>> {
  if (phone(page)) {
    const item = page.getByRole("list", { name }).getByRole("listitem").last();
    return Object.fromEntries(
      await item
        .locator("span.flex")
        .evaluateAll((spans) =>
          spans.map((s) => [
            s.children[0]?.textContent?.trim() ?? "",
            s.children[1]?.textContent?.trim() ?? "",
          ]),
        ),
    );
  }
  const table = page.getByRole("table", { name });
  const heads = await table.locator("thead th").allInnerTexts();
  const cells = await table.locator("tbody tr").last().locator("td").allInnerTexts();
  return Object.fromEntries(heads.map((h, i) => [h.trim(), cells[i].trim()]));
}

test.describe("CR-042 Charts · Money tab", () => {
  test.beforeEach(async ({ page }) => {
    const s = await seedAccounts();
    seeded.push(
      await seedMoney({
        type: "capital_out",
        date: LOW,
        amount: BIG,
        person_id: s.ids.person,
        source: "cash",
      }),
      await seedMoney({ type: "capital_in", date: BACK, amount: BIG, person_id: s.ids.person }),
    );
    await goHome(page);
  });

  test.afterEach(async () => {
    await sql`delete from money_entries where id in ${sql(seeded.splice(0))}`;
  });

  test("E-CR-042.1 Business value's today row = the Books balance sheet; a negative cash day is marked", async ({
    page,
  }) => {
    test.slow(); // the balance sheet, the tab and two detail pages
    const sheet = await balanceSheet(page);

    // The Money tab: four cards; Business value opens its detail page with the tab kept.
    await page.goto("/reports/charts?tab=money");
    const cards = page.getByRole("region", { name: "Money charts" }).getByRole("link");
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText("Business value");
    await expect(cards.nth(0)).toContainText(sheet["Net worth"]);
    await expect(cards.nth(1)).toContainText("Cash");
    await expect(cards.nth(2)).toContainText("Card debt");
    await expect(cards.nth(3)).toContainText("Profit shares");
    await cards.nth(0).click();
    await page.waitForURL(/\/reports\/charts\/business-value/);
    await expect(page.getByRole("heading", { name: "Business value", level: 1 })).toBeVisible();
    await expect(
      // By month after the other specs' entries; by day on books that start ≤ 62 days ago.
      page.getByRole("img", { name: /^Business value at each (month|day) end/ }),
    ).toBeVisible();

    // The last row (this month, as on today) = the Books balance sheet.
    const today = await lastRow(page, "Business value");
    for (const label of [
      "Cash",
      "Stock at cost",
      "Customers owe",
      "Card balances",
      "We owe suppliers",
      "Net worth",
    ]) {
      expect(today[label], label).toBe(sheet[label]);
    }
    await expect(page.getByRole("link", { name: "Charts", exact: true })).toHaveAttribute(
      "href",
      "/reports/charts?tab=money",
    );

    // Cash: the day below 0 is listed under Below zero, in red, and opens that day's Cash book.
    await page.goto("/reports/charts/cash");
    await expect(page.getByRole("img", { name: /^Cash at each day end/ })).toBeVisible();
    const below = phone(page)
      ? page.getByRole("list", { name: "Below zero" })
      : page.getByRole("table", { name: "Below zero" });
    const day = below.getByRole(phone(page) ? "link" : "row", {
      name: new RegExp(formatDate(LOW)),
    });
    await expect(day).toBeVisible();
    // The local books may already be below 0; the capital out takes that day ৳BIG lower.
    const shown = await day.locator(".text-destructive").innerText();
    expect(parse(shown.replace("৳", ""))).toBeLessThanOrEqual(-BIG * 100);
    // The chart marks it with a red dot.
    await expect(page.locator("circle[fill='var(--destructive)']").first()).toBeAttached();

    // No horizontal scroll; 44 px taps on the back link and the period row.
    await noSideScroll(page);
    const taps = [
      page.getByRole("link", { name: "Charts", exact: true }),
      ...(await page.getByRole("navigation", { name: "Period" }).getByRole("link").all()),
    ];
    for (const link of taps) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("E-CR-046.1 Business assets after Customers owe in the table and the tooltip, = the Books balance's", async ({
    page,
  }) => {
    const sheet = await balanceSheet(page);
    await page.goto("/reports/charts/business-value");
    const today = await lastRow(page, "Business value");
    // The desktop table's first column is the bucket (Month or Date); the phone list's is not a pair.
    expect(Object.keys(today).slice(phone(page) ? 0 : 1)).toEqual([
      "Cash",
      "Stock at cost",
      "Customers owe",
      "Business assets",
      "Card balances",
      "We owe suppliers",
      "Net worth",
    ]);
    expect(today["Business assets"]).toBe(sheet["Business assets"]);

    // The chart draws nothing new: the readout (phone) and the tooltip (desktop) list it.
    const [assets, net] = [sheet["Business assets"], sheet["Net worth"]];
    if (phone(page)) {
      await expect(page.getByText(`Business assets ${assets} · Net worth ${net}`)).toBeVisible();
    } else {
      const box = (await page.getByRole("img", { name: /^Business value at each/ }).boundingBox())!;
      await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
      const tooltip = page.locator(".recharts-tooltip-wrapper");
      await expect(tooltip).toContainText(assets);
      expect(await tooltip.locator("span.text-muted-foreground").allInnerTexts()).toEqual([
        "Cash",
        "Stock at cost",
        "Customers owe",
        "Business assets",
        "Card balances",
        "We owe suppliers",
        "Net worth",
      ]);
    }
    await noSideScroll(page);
  });
});
