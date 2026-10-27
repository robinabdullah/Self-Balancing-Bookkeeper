import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { goHome, noSideScroll } from "./helpers";
import { dhaka, phone, seedAccounts, sql } from "./seed";

// CR-038 (D-063; UIDD §4.7): the Stock page's avg cost per model. In stock: of the units left;
// All lots: of everything bought, with "left of bought". Synthetic data only.

test.describe("CR-038 Stock avg cost", () => {
  let model = "";

  test.beforeEach(async ({ page }) => {
    const s = await seedAccounts();
    model = s.names.model;
    const [purchase, sold, sale] = [randomUUID(), randomUUID(), randomUUID()];
    // 30 at ৳15,000 (all sold) + 6 at ৳16,000 + 4 at ৳16,500 (left).
    await sql`insert into purchases (id, date, source, supplier_id)
      values (${purchase}, ${dhaka()}, 'supplier_credit', ${s.ids.supplier})`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost) values
      (${sold}, ${purchase}, ${s.ids.model}, 30, 15000),
      (${randomUUID()}, ${purchase}, ${s.ids.model}, 6, 16000),
      (${randomUUID()}, ${purchase}, ${s.ids.model}, 4, 16500)`;
    await sql`insert into sales (id, date, customer_id) values (${sale}, ${dhaka()}, ${s.ids.customer})`;
    await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price)
      values (${sale}, ${sold}, 30, 17000)`;
    await goHome(page);
    await page.goto("/stock");
    await page.getByRole("searchbox", { name: "Search model or IMEI/note" }).fill(model);
  });

  // In stock: ৳1,62,000 ÷ 10 = ৳16,200. All lots: (৳4,50,000 + ৳1,62,000) ÷ 40 = ৳15,300.
  test("E-CR-038.1 phone: the line under the model name; no horizontal scroll", async ({
    page,
  }) => {
    test.skip(!phone(page), "the phone layout");
    const row = page.getByRole("list", { name: "Models" }).getByRole("listitem").first();
    const summary = row.locator("summary");
    await expect(summary).toContainText(model);
    await expect(summary).toContainText("10 units · avg ৳16,200");
    await expect(summary).toContainText("৳1,62,000");

    await page.getByRole("button", { name: "All lots" }).click();
    await expect(summary).toContainText("10 left of 40 · avg ৳15,300");
    await expect(summary).toContainText("৳1,62,000");

    await noSideScroll(page);
  });

  test("E-CR-038.2 desktop: Model · Left · Avg cost · Value columns", async ({ page }) => {
    test.skip(phone(page), "the desktop layout");
    const header = page.getByTestId("stock-columns");
    await expect(header).toBeVisible();
    await expect(header.locator("span")).toHaveText(["Model", "Left", "Avg cost", "Value", ""]);
    const summary = page
      .getByRole("list", { name: "Models" })
      .getByRole("listitem")
      .first()
      .locator("summary");
    const cells = summary.locator(":scope > span");
    await expect(cells.nth(1)).toHaveText("Left 10");
    await expect(cells.nth(2)).toHaveText("Avg cost ৳16,200");
    await expect(cells.nth(3)).toHaveText("৳1,62,000");
    await expect(summary.getByText("10 units · avg ৳16,200")).toBeHidden();

    await page.getByRole("button", { name: "All lots" }).click();
    await expect(cells.nth(1)).toHaveText("Left 10 of 40");
    await expect(cells.nth(2)).toHaveText("Avg cost ৳15,300");
    await expect(cells.nth(3)).toHaveText("৳1,62,000");
  });
});
