import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { localSql } from "../integration/local-db";
import { effectValue, goHome, noSideScroll } from "./helpers";

// Task 3.6 (UIDD §4.5): the return modal at 360px and 1280px. Each run seeds its own model, a
// cash lot of 3 @ ৳10,000 and a bill of 2 @ ৳12,000 for its own customer, all yesterday.
// Synthetic data only.
const sql = localSql();
test.afterAll(() => sql.end());

const yesterday = () => new Date(Date.now() + 6 * 3600_000 - 86_400_000).toISOString().slice(0, 10); // Dhaka
const inr = (n: number) => `৳${n.toLocaleString("en-IN")}`;

async function seed() {
  const run = randomUUID().slice(0, 8);
  const ids = {
    model: randomUUID(),
    purchase: randomUUID(),
    lot: randomUUID(),
    customer: randomUUID(),
    sale: randomUUID(),
  };
  const model = `E2E Return ${run}`;
  const shop = `E2E Return Shop ${run}`;
  await sql`insert into models (id, name) values (${ids.model}, ${model})`;
  await sql`insert into customers (id, proprietor_name, shop_name) values (${ids.customer}, 'Karim', ${shop})`;
  await sql`insert into purchases (id, date, source) values (${ids.purchase}, ${yesterday()}, 'cash')`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${ids.lot}, ${ids.purchase}, ${ids.model}, 3, 10000)`;
  await sql`insert into sales (id, date, customer_id) values (${ids.sale}, ${yesterday()}, ${ids.customer})`;
  await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price) values (${ids.sale}, ${ids.lot}, 2, 12000)`;
  const returns = async () => {
    const [row] = await sql`select count(*)::int as n from return_lines where lot_id = ${ids.lot}`;
    return row.n as number;
  };
  return { model, shop, returns };
}

test.describe("Return form (task 3.6)", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("3.6.1 customer return: customer → bill → line; refund starts at the sale price; Undo", async ({
    page,
  }) => {
    const { model, shop, returns } = await seed();
    await page.goto("/returns/new");
    const dialog = page.getByRole("dialog", { name: "New return" });
    await expect(dialog.getByText("Phones a customer gives back")).toBeVisible();

    await dialog.getByRole("button", { name: "Customer" }).click();
    await page.getByRole("option", { name: `${shop} (Karim)` }).click();
    await dialog.getByRole("button", { name: "Bill" }).click();
    await page.getByRole("option", { name: new RegExp(`${inr(24_000)}`) }).click();
    await dialog.getByRole("button", { name: "Line" }).click();
    await page.getByRole("option", { name: new RegExp(`${model} · 2 @`) }).click();
    await expect(dialog.getByText("2 left to return")).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Refund per unit" })).toHaveValue("12,000");

    // S3-style: stock back at cost, the customer owes less, profit −(price − cost).
    await expect(effectValue(dialog, "Stock")).toHaveText(`+${inr(10_000)}`);
    await expect(effectValue(dialog, `${shop} (Karim) owes`)).toHaveText(`-${inr(12_000)}`);
    await expect(effectValue(dialog, "Profit")).toHaveText("-৳2,000");
    await expect(dialog.getByText(`Refund ${inr(12_000)}`)).toBeVisible();

    // More than sold − returned → the server's inline error.
    await dialog.getByRole("textbox", { name: "Qty" }).fill("3");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Only 2 left to return on this line")).toBeVisible();

    await dialog.getByRole("textbox", { name: "Qty" }).fill("1");
    await dialog.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");
    const toast = page.getByRole("status");
    await expect(toast.getByText("Saved")).toBeVisible();
    expect(await returns()).toBe(1);
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect.poll(returns).toBe(0);
  });

  test("3.6.2 purchase return: refund goes to the lot's source; damaged / lost refunds 0", async ({
    page,
  }) => {
    const { model, returns } = await seed();
    await page.goto("/returns/new");
    const dialog = page.getByRole("dialog", { name: "New return" });
    await dialog.getByRole("radio", { name: "Purchase return" }).check();
    await expect(dialog.getByText("Phones sent back to the seller")).toBeVisible();

    await dialog.getByRole("button", { name: "Lot" }).click();
    await page.getByRole("option", { name: new RegExp(model) }).click();
    await expect(dialog.getByText("1 left")).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Refund per unit" })).toHaveValue("10,000");
    await expect(dialog.getByRole("radio", { name: "Cash" })).toBeChecked();
    await expect(effectValue(dialog, "Cash")).toHaveText(`+${inr(10_000)}`);
    await expect(effectValue(dialog, "Stock")).toHaveText(`-${inr(10_000)}`);

    await dialog.getByRole("radio", { name: "Damaged / lost" }).check();
    await expect(dialog.getByRole("textbox", { name: "Refund per unit" })).toBeHidden();
    await expect(effectValue(dialog, "Profit")).toHaveText("-৳10,000");
    await expect(dialog.getByText(`Refund ${inr(0)}`)).toBeVisible();

    await noSideScroll(page, "horizontal scroll");

    await dialog.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("status").getByText("Saved")).toBeVisible();
    expect(await returns()).toBe(1);
  });
});
