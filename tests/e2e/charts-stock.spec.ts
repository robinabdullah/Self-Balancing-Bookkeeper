import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { format, parse } from "@/lib/money";
import { goHome, noSideScroll } from "./helpers";
import { dhaka, escapeRe, phone, seedAccounts, sql } from "./seed";

// CR-044 (D-064, clarified 2026-10-24; UIDD §4.17): the Charts · Stock tab. A new model gets a lot
// of 3 bought 100 days ago and a lot of 2 bought 10 days ago, one of which is sold today; all of it
// is deleted after the test. Stock age is today's stock, so the model's 3 old units sit in 90+ and
// its 1 newer unit in 0–30. Synthetic data only; amounts in SQL are taka.

const ids = {
  model: randomUUID(),
  old: randomUUID(),
  oldLot: randomUUID(),
  recent: randomUUID(),
  recentLot: randomUUID(),
  sale: randomUUID(),
};
const MODEL = `E2E Aged ${ids.model.slice(0, 4)}`;
const taka = (s: string) => format(parse(s)!);

test.describe("CR-044 Charts · Stock tab", () => {
  test.beforeEach(async ({ page }) => {
    const s = await seedAccounts();
    await sql`insert into models (id, name) values (${ids.model}, ${MODEL})`;
    await sql`insert into purchases (id, date, source, supplier_id) values
      (${ids.old}, ${dhaka(-100)}, 'supplier_credit', ${s.ids.supplier}),
      (${ids.recent}, ${dhaka(-10)}, 'supplier_credit', ${s.ids.supplier})`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost) values
      (${ids.oldLot}, ${ids.old}, ${ids.model}, 3, 10000),
      (${ids.recentLot}, ${ids.recent}, ${ids.model}, 2, 11000)`;
    await sql`insert into sales (id, date, customer_id) values (${ids.sale}, ${dhaka()}, ${s.ids.customer})`;
    await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price)
      values (${ids.sale}, ${ids.recentLot}, 1, 14000)`;
    await goHome(page);
  });

  test.afterEach(async () => {
    await sql`delete from sale_lines where sale_id = ${ids.sale}`;
    await sql`delete from sales where id = ${ids.sale}`;
    await sql`delete from purchase_lines where purchase_id in ${sql([ids.old, ids.recent])}`;
    await sql`delete from purchases where id in ${sql([ids.old, ids.recent])}`;
    await sql`delete from models where id = ${ids.model}`;
  });

  test("E-CR-044.1 tapping an age lists its models; All ages clears it; Top models Pieces / Profit", async ({
    page,
  }) => {
    test.slow(); // the tab, two detail pages and the toggle
    // The Stock tab: two cards; Stock age is "as of today".
    await page.goto("/reports/charts?tab=stock");
    const cards = page.getByRole("region", { name: "Stock charts" }).getByRole("link");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText("Stock age");
    await expect(cards.nth(0)).toContainText("as of today");
    await expect(cards.nth(1)).toContainText("Top models sold");
    await cards.nth(0).click();
    await page.waitForURL("/reports/charts/stock-age");
    await expect(page.getByRole("heading", { name: "Stock age", level: 1 })).toBeVisible();
    await expect(page.getByRole("img", { name: /^Stock by age/ })).toBeVisible();

    // Tap 90+ → its models, with the old lot's 3 units at ৳10,000.
    const ages = page.getByRole(phone(page) ? "list" : "table", { name: "Stock age" });
    await ages.getByRole("link", { name: /^90\+ days/ }).click();
    await page.waitForURL((u) => u.searchParams.get("age") === "91");
    const models = page.getByRole("region", { name: "Models · 90+ days" });
    const row = models
      .getByRole(phone(page) ? "listitem" : "row")
      .filter({ hasText: new RegExp(escapeRe(MODEL)) });
    await expect(row).toContainText("3");
    await expect(row).toContainText(taka("30,000"));
    // 0–30 has the newer lot's one unit left, not the old ones.
    await ages.getByRole("link", { name: /^0–30 days/ }).click();
    await page.waitForURL((u) => u.searchParams.get("age") === "0");
    await expect(
      page
        .getByRole("region", { name: "Models · 0–30 days" })
        .getByRole(phone(page) ? "listitem" : "row")
        .filter({ hasText: new RegExp(escapeRe(MODEL)) }),
    ).toContainText(taka("11,000"));

    // No horizontal scroll; 44 px taps on All ages and the period row.
    await noSideScroll(page);
    const allAges = page.getByRole("link", { name: "All ages" });
    const taps = [allAges, ...(await page.getByRole("navigation", { name: "Period" }).getByRole("link").all())];
    for (const link of taps) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await allAges.click();
    await page.waitForURL((u) => !u.searchParams.has("age"));
    await expect(page.getByRole("region", { name: /^Models ·/ })).toHaveCount(0);

    // Top models sold today: the model's 1 piece; Profit; ‹ Charts goes back to the Stock tab.
    await page.goto(`/reports/charts/top-models?from=${dhaka()}&to=${dhaka()}`);
    await expect(
      page
        .getByRole(phone(page) ? "list" : "table", { name: "Top models sold" })
        .getByRole(phone(page) ? "listitem" : "row")
        .filter({ hasText: new RegExp(escapeRe(MODEL)) }),
    ).toContainText(taka("14,000"));
    await page
      .getByRole("navigation", { name: "Rank by" })
      .getByRole("link", { name: "Profit" })
      .click();
    await page.waitForURL((u) => u.searchParams.get("by") === "profit");
    await expect(page.getByRole("img", { name: /^Top models sold by profit/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Charts", exact: true })).toHaveAttribute(
      "href",
      `/reports/charts?tab=stock&from=${dhaka()}&to=${dhaka()}`,
    );
  });
});
