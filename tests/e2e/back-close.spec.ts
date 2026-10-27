import { type Page, expect, test } from "@playwright/test";
import { addMonths, formatMonth, monthOf } from "@mbl/domain/dates";
import { billMonthOf } from "@mbl/domain/engine/cards";
import { goHome } from "./helpers";
import { dhaka, dmy, fillDate, phone, pick, seedAccounts, seedMoney, sql } from "./seed";

// CR-015 (D-035; UIDD §1, §2): Back closes the top sheet on a phone, dd/mm/yyyy date boxes and
// the month dropdowns. Synthetic data only.

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test.describe("E-CR-015.1 Back closes the top sheet (phone)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!phone(page), "the phone's Back button");
    await goHome(page);
  });

  test("New → Back closes it; New → Sale → Back returns, with no phantom entry", async ({
    page,
  }) => {
    await page.goto("/stock");
    const heading = page.getByRole("heading", { name: "Stock", exact: true });
    await nav(page).getByRole("button", { name: "New" }).click();
    const sheet = page.getByRole("dialog", { name: "New" });
    await expect(sheet).toBeVisible();
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/stock$/);
    await expect(heading).toBeVisible();

    await nav(page).getByRole("button", { name: "New" }).click();
    await sheet.getByRole("link", { name: "Sale" }).click();
    await page.waitForURL(/\/sales\/new$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/stock$/);
    await expect(heading).toBeVisible();
    await expect(sheet).toBeHidden();
    await page.goBack(); // the page before Stock: no leftover sheet entry in between
    await expect(page).toHaveURL(/\/$/);
  });

  test("More → Back closes it and stays on the page", async ({ page }) => {
    await page.goto("/stock");
    await nav(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet).toBeVisible();
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/stock$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test("a picker in the sale form → Back keeps the form and what was typed", async ({ page }) => {
    await page.goto("/sales/new");
    const price = page.getByRole("textbox", { name: "Unit price" });
    await price.fill("12,000");
    await page.getByRole("button", { name: "Customer", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Customer" });
    await expect(picker).toBeVisible();
    await page.goBack();
    await expect(picker).toBeHidden();
    await expect(page).toHaveURL(/\/sales\/new$/);
    await expect(price).toHaveValue("12,000");
  });

  test("Setup form; picker → + Add new: one Back closes only the top sheet", async ({ page }) => {
    await page.goto("/setup?tab=card");
    await page.getByRole("button", { name: "Add card" }).click();
    const form = page.getByRole("dialog", { name: "Add card" });
    await form.getByLabel("Card name").fill("E2E Back");
    await form.getByRole("button", { name: "Owner" }).click();
    await page
      .getByRole("dialog", { name: "Owner" })
      .getByRole("button", { name: "Add new" })
      .click();
    const add = page.getByRole("dialog", { name: "Add person" });
    await expect(add).toBeVisible();

    await page.goBack();
    await expect(add).toBeHidden();
    await expect(form).toBeVisible();
    await expect(form.getByLabel("Card name")).toHaveValue("E2E Back");
    await page.goBack();
    await expect(form).toBeHidden();
    await expect(page).toHaveURL(/\/setup\?tab=card$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test("Journal filters → Back closes them and the URL keeps the new filter", async ({ page }) => {
    await page.goto("/journal");
    await page.getByRole("button", { name: /^Filters/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet.getByRole("combobox", { name: "Type" }).selectOption("sale");
    await expect(page).toHaveURL(/type=sale/);
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/journal\?type=sale$/);
    await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test("entry → Reverse → Back closes only the dialog", async ({ page }) => {
    const s = await seedAccounts();
    const id = await seedMoney({
      type: "customer_payment",
      amount: "123.00",
      customer_id: s.ids.customer,
    });
    await page.goto(`/journal?entry=${id}`);
    const detail = page.getByRole("dialog", { name: "Payment in" });
    await detail.getByRole("button", { name: "Reverse" }).click();
    const reverse = page.getByRole("dialog", { name: "Reverse this entry?" });
    await expect(reverse).toBeVisible();
    await page.goBack();
    await expect(reverse).toBeHidden();
    await expect(detail).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`entry=${id}`));
  });
});

test.describe("E-CR-015.4 dd/mm/yyyy date boxes", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("typed as dd/mm/yyyy, sent as ISO; a bad date says so; 📅 fills the box", async ({
    page,
  }) => {
    await page.goto("/money/new?type=card_payment");
    const dialog = page.getByRole("dialog", { name: "Card payment" });
    const date = dialog.getByLabel("Date");
    const sent = dialog.locator('input[type="hidden"][name="date"]');
    await expect(date).toHaveValue(dmy(dhaka()));
    await expect(sent).toHaveValue(dhaka());

    await fillDate(date, "5/1/2026"); // single digits are fine
    await expect(sent).toHaveValue("2026-01-05");

    await date.fill("");
    await date.pressSequentially("05012026"); // the slashes come by themselves
    await expect(date).toHaveValue("05/01/2026");
    await expect(sent).toHaveValue("2026-01-05");

    await fillDate(date, "31/02/2026");
    await date.blur();
    await expect(dialog.getByText("Enter the date as dd/mm/yyyy")).toBeVisible();
    await expect(sent).toHaveValue("");

    await dialog.getByLabel("Open calendar").fill("2026-01-07"); // what the phone's calendar sets
    await expect(date).toHaveValue("07/01/2026");
    await expect(sent).toHaveValue("2026-01-07");
    await expect(dialog.getByText("Enter the date as dd/mm/yyyy")).toBeHidden();
  });

  test("a date change refreshes the EMI preview", async ({ page }) => {
    const card = { id: "x", statementDay: 28, dueDay: 12 };
    const s = await seedAccounts({ cardName: "City Visa", statementDay: 28, dueDay: 12 });
    await page.goto("/purchases/new");
    await page.getByRole("radio", { name: "Card" }).check();
    await pick(page, page, "Card", s.cardDisplay);
    await page.getByRole("checkbox", { name: "EMI" }).check();
    await page.getByRole("textbox", { name: "EMI months" }).fill("5");
    await pick(page, page, "Model (line 1)", s.names.model);
    await page.getByRole("textbox", { name: "Qty" }).fill("1");
    await page.getByRole("textbox", { name: "Unit cost" }).fill("5,000");
    const preview = page.getByRole("status", { name: "EMI preview" });
    const first = (date: string) => `first in ${formatMonth(billMonthOf(card, date))} bill`;
    await expect(preview).toContainText(first(dhaka()));
    await fillDate(page.getByLabel("Date", { exact: true }), dhaka(-40));
    await expect(preview).toContainText(first(dhaka(-40)));
  });
});

test.describe("E-CR-015.5 month dropdowns", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("For month: the allowed months, newest first; closed ones greyed", async ({ page }) => {
    await page.goto("/money/new?type=expense");
    const forMonth = page
      .getByRole("dialog", { name: "Expense" })
      .getByRole("combobox", { name: "For month" });
    const month = monthOf(dhaka());
    await expect(forMonth).toHaveValue(month);
    const options = forMonth.locator("option");
    await expect(options.first()).toHaveText(formatMonth(month));
    const [close] = await sql`select max(month)::text as month from month_closes`;
    if (close.month) {
      const closed = forMonth.locator("option", {
        hasText: `${formatMonth(close.month)} (closed)`,
      });
      await expect(closed).toBeDisabled();
    }
  });

  test("Bill month: Auto, the month before → 4 months after; the month before warns", async ({
    page,
  }) => {
    const s = await seedAccounts();
    await page.goto("/purchases/new");
    await page.getByRole("radio", { name: "Card" }).check();
    await pick(page, page, "Card", s.cardDisplay);
    const bill = page.getByRole("combobox", { name: "Bill month" });
    const month = monthOf(dhaka());
    await expect(bill.locator("option")).toHaveText([
      "Auto",
      ...[-1, 0, 1, 2, 3, 4].map((n) => formatMonth(addMonths(month, n))),
    ]);
    const warning = page.getByText("Earlier than the purchase month");
    await bill.selectOption(addMonths(month, -1));
    await expect(warning).toBeVisible();
    await bill.selectOption(month);
    await expect(warning).toBeHidden();
  });
});
