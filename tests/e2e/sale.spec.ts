import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { localSql } from "../integration/local-db";
import { effectValue, goHome, noSideScroll } from "./helpers";

// Task 3.5 (UIDD §4.4): the sale page at 360px and 1280px. Each run seeds its own model with one
// lot of 3, bought yesterday. Synthetic data only.
const sql = localSql();
test.afterAll(() => sql.end());

const yesterday = () => new Date(Date.now() + 6 * 3600_000 - 86_400_000).toISOString().slice(0, 10); // Dhaka

async function seedLot(model: string, unitCost: number) {
  const modelId = randomUUID();
  const purchaseId = randomUUID();
  await sql`insert into models (id, name) values (${modelId}, ${model})`;
  await sql`insert into purchases (id, date, source) values (${purchaseId}, ${yesterday()}, 'cash')`;
  await sql`insert into purchase_lines (purchase_id, model_id, qty, unit_cost)
    values (${purchaseId}, ${modelId}, 3, ${unitCost})`;
}

test.describe("Sale form (task 3.5)", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("E3.5.6 + 3.5 a new customer from the picker, the lot preview, Received now, Undo", async ({
    page,
  }) => {
    const run = randomUUID().slice(0, 8);
    const model = `E2E Sale ${run}`;
    const shop = `E2E Shop ${run}`;
    const cost = 10_000;
    await seedLot(model, cost);
    const inr = (n: number) => `৳${n.toLocaleString("en-IN")}`;

    await page.goto("/sales/new");
    await expect(page.getByRole("heading", { name: "New sale" })).toBeVisible();
    await expect(page.getByText("Cost comes from the oldest stock first")).toBeVisible();

    // E3.5.6: "+ Add new" from the customer picker comes back selected.
    await page.getByRole("button", { name: "Customer" }).click();
    await page
      .getByRole("dialog", { name: "Customer" })
      .getByRole("button", { name: "Add new" })
      .click();
    const add = page.getByRole("dialog", { name: "Add customer" });
    await add.getByLabel("Shop name").fill(shop);
    await add.getByLabel("Proprietor name").fill("Karim");
    await add.getByRole("button", { name: "Save" }).click();
    await expect(add).toBeHidden();
    await expect(page.getByRole("button", { name: "Customer" })).toHaveText(`${shop} (Karim)`);

    // The model picker shows the stock; more than that → "Only 3 left".
    await page.getByRole("button", { name: "Model (line 1)" }).click();
    await page.getByRole("option", { name: `${model} · 3 in stock` }).click();
    await page.getByRole("textbox", { name: "Qty" }).fill("4");
    await expect(page.getByText("Only 3 left")).toBeVisible();

    // 2 @ 12,000 from the one lot: line total and profit, the preview, the footer.
    await page.getByRole("textbox", { name: "Qty" }).fill("2");
    await page.getByRole("textbox", { name: "Unit price" }).fill("12,000");
    await expect(page.getByText(/^2 from lot \d\d \w{3} @৳10,000$/)).toBeVisible();
    await expect(page.getByText(`Line ${inr(24_000)}`)).toBeVisible();
    await expect(effectValue(page, "Stock")).toHaveText(`-${inr(20_000)}`);
    await expect(effectValue(page, `${shop} (Karim) owes`)).toHaveText(`+${inr(24_000)}`);
    await expect(page.getByText(`Total ${inr(24_000)} · profit ${inr(4_000)}`)).toBeVisible();

    // "Choose lot" shows the one lot.
    await page.getByRole("button", { name: "Choose lot" }).click();
    await page.getByRole("button", { name: "Lot (line 1)", exact: true }).click();
    await page.getByRole("option", { name: /@৳10,000/ }).click();
    await expect(page.getByText(/^2 from lot/)).toBeVisible();

    // Received now: a customer payment in the same save.
    await page.getByRole("textbox", { name: "Received now" }).fill("5,000");
    await expect(effectValue(page, "Cash")).toHaveText(`+${inr(5_000)}`);
    // D-061: one row per account, so the customer's due is netted.
    await expect(effectValue(page, `${shop} (Karim) owes`)).toHaveText(`+${inr(19_000)}`);

    await noSideScroll(page, "horizontal scroll");

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");
    const toast = page.getByRole("status");
    await expect(toast.getByText("Saved")).toBeVisible();
    const counts = async () => {
      const [row] = await sql`select
        (select count(*)::int from sales s join customers c on c.id = s.customer_id
          where c.shop_name = ${shop}) as sales,
        (select count(*)::int from money_entries m join customers c on c.id = m.customer_id
          where c.shop_name = ${shop}) as payments`;
      return { ...row };
    };
    expect(await counts()).toEqual({ sales: 1, payments: 1 });

    // Undo removes the bill and its payment (D-006).
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(toast.getByText("Saved")).toBeHidden();
    await expect.poll(counts).toEqual({ sales: 0, payments: 0 });
  });
});
