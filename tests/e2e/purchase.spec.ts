import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { formatMonth } from "@/lib/dates";
import { billMonthOf } from "@/lib/engine/cards";
import { effectValue, goHome, noSideScroll } from "./helpers";
import { dhaka, pick, seedAccounts } from "./seed";

// Task 3.4 (UIDD §4.3): the purchase page at 360px and 1280px. Synthetic data only.

test.describe("Purchase form (task 3.4)", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("3.4 lines with a new model, the preview and total, inline errors, save", async ({
    page,
  }) => {
    const model = `E2E Phone ${randomUUID().slice(0, 8)}`;
    // A unit cost of its own each run, so an earlier run's purchase isn't a "possible duplicate".
    const cost = 10_000 + Math.floor(Math.random() * 9_000);
    const total = (2 * cost).toLocaleString("en-IN");
    await page.goto("/purchases/new");
    await expect(page.getByRole("heading", { name: "New purchase" })).toBeVisible();
    await expect(page.getByText("Each line becomes a stock lot at its unit cost.")).toBeVisible();

    // Supplier credit needs a supplier; the line needs a model and a unit cost.
    await page.getByRole("radio", { name: "Supplier credit" }).check();
    await expect(page.getByText("Paid something now?")).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Pick a supplier", { exact: true })).toBeVisible();
    await expect(page.getByText("Pick a model", { exact: true })).toBeVisible();
    await page.getByRole("radio", { name: "Cash" }).check();

    // "+ Add new" model from the line's picker comes back selected.
    await page.getByRole("button", { name: "Model (line 1)" }).click();
    await page
      .getByRole("dialog", { name: "Model (line 1)" })
      .getByRole("button", { name: "Add new" })
      .click();
    const add = page.getByRole("dialog", { name: "Add model" });
    await add.getByLabel("Model name").fill(model);
    await add.getByRole("button", { name: "Save" }).click();
    await expect(add).toBeHidden();
    await expect(page.getByRole("button", { name: "Model (line 1)" })).toHaveText(model);

    await page.getByRole("textbox", { name: "Qty" }).fill("2");
    await page.getByRole("textbox", { name: "Unit cost" }).fill(cost.toLocaleString("en-IN"));
    await expect(page.getByText(`Total ৳${total}`)).toBeVisible();
    await expect(effectValue(page, "Stock")).toHaveText(`+৳${total}`);
    await expect(effectValue(page, "Cash")).toHaveText(`-৳${total}`);

    // A second line, then removed again.
    await page.getByRole("button", { name: "Add line" }).click();
    await expect(page.getByRole("button", { name: "Model (line 2)" })).toBeVisible();
    await page.getByRole("button", { name: "Remove line 2" }).click();
    await expect(page.getByRole("button", { name: "Model (line 2)" })).toBeHidden();

    await noSideScroll(page, "horizontal scroll");

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("status").getByText("Saved")).toBeVisible();
  });

  // E-CR-013.8 (UIDD §4.3; D-032): the EMI preview names the same installments and first bill
  // the card page shows after saving; Bill month sits by the Card picker, not under Advanced.
  test("E-CR-013.8 the EMI preview matches the saved card bills", async ({ page }) => {
    const s = await seedAccounts({ cardName: "City Visa", statementDay: 28, dueDay: 12 });
    const first = formatMonth(billMonthOf({ id: "x", statementDay: 28, dueDay: 12 }, dhaka()));
    const cost = 5_000 + Math.floor(Math.random() * 900) * 5; // unique per run, splits evenly by 5
    const each = (cost / 5).toLocaleString("en-IN");

    await page.goto("/purchases/new");
    await page.getByRole("radio", { name: "Card" }).check();
    await pick(page, page, "Card", s.cardDisplay);
    await expect(page.getByRole("combobox", { name: "Bill month" })).toBeVisible();
    await page.getByRole("checkbox", { name: "EMI" }).check();
    await page.getByRole("textbox", { name: "EMI months" }).fill("5");
    await pick(page, page, "Model (line 1)", s.names.model);
    await page.getByRole("textbox", { name: "Qty" }).fill("1");
    await page.getByRole("textbox", { name: "Unit cost" }).fill(cost.toLocaleString("en-IN"));
    await expect(page.getByRole("status", { name: "EMI preview" })).toHaveText(
      `5 × ৳${each} · first in ${first} bill`,
    );
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");

    await page.goto(`/cards/${s.ids.card}`);
    await expect(
      page
        .getByRole("list", { name: "Charges and credits" })
        .getByText(`EMI 5 × ৳${each} · from ${first}`),
    ).toBeVisible();
    await page.getByRole("button", { name: "Show all 5 bills" }).click();
    const bills = page.getByRole("list", { name: "Statements" }).getByRole("listitem");
    await expect(bills).toHaveCount(5);
    await expect(bills.last()).toContainText(first); // newest first: the first installment last
  });
});
