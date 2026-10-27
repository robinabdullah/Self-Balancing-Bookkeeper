import { randomUUID } from "node:crypto";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { formatMonth, monthDiff, monthOf } from "@mbl/domain/dates";
import { goHome, noSideScroll } from "./helpers";
import { dhaka, phone, seedAccounts, sql } from "./seed";

// CR-041 (D-064; UIDD §4.17): the Charts · Profit tab. A sale and an expense ~80 days back give
// that month a profit of its own; a window from that month to today runs by month. The readout, the table and
// "See breakdown" are read against the Months page and the month page as they stand (the E2E books
// are shared). Synthetic data only; amounts in SQL are taka.

const DAY = dhaka(-80);
const MONTH = monthOf(DAY);
const LABEL = formatMonth(MONTH);

/** Each row of a label · amount list as "label|amount". */
const pairs = (list: Locator) =>
  list.locator(":scope > div").evaluateAll((rows) =>
    rows.map((r) => {
      const [dt, dd] = [r.querySelector("dt"), r.querySelector("dd")];
      return `${dt?.textContent?.trim()}|${dd?.textContent?.trim()}`;
    }),
  );

/** The Months page's profit for MONTH, as shown ("৳1,500"). */
async function monthsRow(page: Page) {
  await page.goto("/months");
  const row = page
    .getByRole("list", { name: "Months" })
    .getByRole("listitem")
    .filter({ hasText: LABEL });
  return (await row.locator("span.tabular-nums").first().textContent())!.trim();
}

/** The middle of the first column (MONTH) of a detail chart drawn over `count` months. */
async function firstColumn(page: Page, count: number) {
  const grid = (await page.locator(".recharts-cartesian-grid").first().boundingBox())!;
  return { x: grid.x + grid.width / count / 2, y: grid.y + grid.height / 2 };
}

test.describe("CR-041 Charts · Profit tab", () => {
  test.beforeEach(async ({ page }) => {
    const s = await seedAccounts();
    const [purchase, lot, sale] = [randomUUID(), randomUUID(), randomUUID()];
    await sql`insert into purchases (id, date, source, supplier_id)
      values (${purchase}, ${DAY}, 'supplier_credit', ${s.ids.supplier})`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
      values (${lot}, ${purchase}, ${s.ids.model}, 5, 10000)`;
    await sql`insert into sales (id, date, customer_id) values (${sale}, ${DAY}, ${s.ids.customer})`;
    await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price) values (${sale}, ${lot}, 2, 12500)`;
    await sql`insert into money_entries (type, date, for_month, amount, source, category)
      values ('expense', ${DAY}, ${`${MONTH}-01`}, 700, 'cash', 'delivery')`;
    await goHome(page);
  });

  test("E-CR-041.1 the readout = the Months row; See breakdown = the month page; desktop: tooltip and table beside", async ({
    page,
  }) => {
    test.slow(); // the Months page, the month page and the chart page
    const profit = await monthsRow(page);
    await page.goto(`/months/${MONTH}`);
    const breakdown = await pairs(page.locator("dl[aria-label='Profit breakdown']"));
    // The month page's last row is the month's total; See breakdown lists the lines only.
    const lines = breakdown.slice(0, -1);

    // The Profit tab from MONTH to today (> 62 days: by month): three cards; Net profit opens its
    // detail page with the window.
    const range = `from=${MONTH}-01&to=${dhaka()}`;
    await page.goto(`/reports/charts?${range}`);
    const cards = page.getByRole("region", { name: "Profit charts" }).getByRole("link");
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText("Net profit");
    await expect(cards.nth(1)).toContainText("Sales & margin");
    await expect(cards.nth(2)).toContainText("Expenses");
    await cards.nth(0).click();
    // The window may start later than asked: never before the opening (the oldest entry).
    await page.waitForURL(/\/reports\/charts\/net-profit\?from=.*&to=/);
    await expect(page.getByRole("heading", { name: "Net profit", level: 1 })).toBeVisible();
    const chart = page.getByRole("img", { name: /^Net profit per month/ });
    await expect(chart).toBeVisible();

    const at = await firstColumn(page, monthDiff(MONTH, monthOf(dhaka())) + 1);
    if (phone(page)) {
      // A tap shows the month in the fixed line above the chart = the Months row.
      await page.mouse.click(at.x, at.y);
      await expect(page.getByText(`${LABEL}: ${profit}`, { exact: true })).toBeVisible();
      await page.getByText("See breakdown").click();
      expect(await pairs(page.locator("dl[aria-label='Breakdown']"))).toEqual(lines);
      // The list's row for the month = the Months row and opens the month page.
      const item = page
        .getByRole("list", { name: "Net profit" })
        .getByRole("link", { name: new RegExp(LABEL) });
      await expect(item).toContainText(profit);
    } else {
      // Hovering shows the tooltip; the table sits beside the chart.
      await page.mouse.move(at.x, at.y);
      const tooltip = page.locator(".recharts-tooltip-wrapper");
      await expect(tooltip).toContainText(LABEL);
      await expect(tooltip).toContainText(profit);
      const table = page.getByRole("table", { name: "Net profit" });
      const [c, t] = [(await chart.boundingBox())!, (await table.boundingBox())!];
      expect(t.x).toBeGreaterThanOrEqual(c.x + c.width);
      const row = table.getByRole("row").filter({ hasText: LABEL });
      await expect(row).toContainText(profit);
      await expect(row.getByRole("link", { name: LABEL })).toHaveAttribute(
        "href",
        `/months/${MONTH}`,
      );
    }

    // No horizontal scroll; 44 px taps on the period row and the back link.
    await noSideScroll(page);
    const taps = [
      page.getByRole("link", { name: "Charts", exact: true }),
      ...(await page.getByRole("navigation", { name: "Period" }).getByRole("link").all()),
    ];
    for (const link of taps) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
