import { randomUUID } from "node:crypto";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { goHome } from "./helpers";
import { dhaka, seedAccounts, seedMoney, sql } from "./seed";

// E-CR-013.3 (UIDD §3, §4.10; D-032): an entry's detail opens over the page it was tapped on, and
// closing it (✕, Esc, a tap outside, Back) stays there. At 360px and 1280px. Synthetic data only.
test.beforeEach(async ({ page }) => goHome(page));

const month1st = () => `${dhaka().slice(0, 7)}-01`;
const path = (page: Page) => {
  const u = new URL(page.url());
  return u.pathname + u.search;
};

/** Opens `row`, checks the sheet sits over `base`, then closes it the given way. */
async function openThenClose(
  page: Page,
  base: string,
  row: Locator,
  title: string,
  entryId: string,
  how: "x" | "escape" | "outside" | "back",
) {
  // textContent, as toHaveText compares it (a card heading starts with its bank badge).
  const heading = (await page.locator("h1").first().textContent()) ?? "";
  await row.click();
  await page.waitForURL((u) => u.searchParams.get("entry") === entryId);
  expect(new URL(page.url()).pathname).toBe(base.split("?")[0]);
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet).toBeVisible();
  await expect(page.locator("h1").first()).toHaveText(heading); // the page is still underneath

  if (how === "x") await sheet.getByRole("button", { name: "Close" }).click();
  if (how === "escape") await page.keyboard.press("Escape");
  if (how === "outside") await page.mouse.click(5, 70); // the dimmed page, top left
  if (how === "back") await page.goBack();
  await expect(sheet).toBeHidden({ timeout: 1_000 });
  await page.waitForURL((u) => !u.searchParams.has("entry"));
  expect(path(page)).toBe(base);
  await expect(page.locator("h1").first()).toHaveText(heading);
}

test.describe("E-CR-013.3 entry details open in place", () => {
  // Each test walks through several pages; `next dev` can be slow late in a long run.
  test.slow();
  test("card page: a charge opens over the card; ✕, Esc, outside and Back all stay", async ({
    page,
  }) => {
    const s = await seedAccounts();
    const fee = await seedMoney({
      type: "card_fee",
      amount: "1234.00",
      card_id: s.ids.card,
      category: "card fee/interest",
      for_month: month1st(),
    });
    const base = `/cards/${s.ids.card}`;
    await page.goto(base);
    const row = page.getByRole("list", { name: "Charges and credits" }).getByRole("link").first();
    for (const how of ["x", "escape", "outside", "back"] as const) {
      await openThenClose(page, base, row, "Card fee", fee, how);
    }
    // Re-opening the same row straight after closing works.
    await row.click();
    await expect(page.getByRole("dialog", { name: "Card fee" })).toBeVisible();
  });

  test("customer statement and Bills tab, supplier, person and Home rows open in place", async ({
    page,
  }) => {
    const s = await seedAccounts();
    const payment = await seedMoney({
      type: "customer_payment",
      amount: "500.00",
      customer_id: s.ids.customer,
    });
    const lot = randomUUID();
    const [purchase, sale] = [randomUUID(), randomUUID()];
    await sql`insert into purchases (id, date, source) values (${purchase}, ${dhaka(-1)}, 'cash')`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
      values (${lot}, ${purchase}, ${s.ids.model}, 2, 1000)`;
    await sql`insert into sales (id, date, customer_id) values (${sale}, ${dhaka()}, ${s.ids.customer})`;
    await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price)
      values (${sale}, ${lot}, 1, 1500)`;
    const supplierPay = await seedMoney({
      type: "supplier_payment",
      amount: "700.00",
      supplier_id: s.ids.supplier,
      source: "cash",
    });
    const capital = await seedMoney({
      type: "capital_in",
      amount: "900.00",
      person_id: s.ids.investor,
    });

    const customer = `/customers/${s.ids.customer}`;
    await page.goto(customer);
    const statement = page
      .getByRole(page.viewportSize()!.width < 1024 ? "list" : "table", { name: "Statement" })
      .getByRole("link", { name: "Payment in" });
    await openThenClose(page, customer, statement, "Payment in", payment, "x");

    const bills = `${customer}?tab=bills`;
    await page.goto(bills);
    const bill = page.getByRole("list", { name: "Bills" }).getByRole("link").first();
    await openThenClose(page, bills, bill, "Sale", sale, "escape");

    const supplier = `/suppliers/${s.ids.supplier}`;
    await page.goto(supplier);
    const supplierRow = page
      .getByRole(page.viewportSize()!.width < 1024 ? "list" : "table", { name: "Statement" })
      .getByRole("link", { name: "Supplier payment" });
    await openThenClose(page, supplier, supplierRow, "Supplier payment", supplierPay, "outside");

    const person = `/people/${s.ids.investor}`;
    await page.goto(person);
    const capitalRow = page
      .getByRole(page.viewportSize()!.width < 1024 ? "list" : "table", { name: "Capital history" })
      .getByRole("link", { name: "Capital in" });
    await openThenClose(page, person, capitalRow, "Capital in", capital, "back");

    await page.goto("/");
    const recent = page
      .getByRole("region", { name: "Recent entries" })
      .locator(`a[href="/?entry=${capital}"]`);
    await openThenClose(page, "/", recent, "Capital in", capital, "x");
  });

  test("Reversed by stays on the page; Edit returns to it; Delete returns and removes the row", async ({
    page,
  }) => {
    const s = await seedAccounts();
    const fee = await seedMoney({
      type: "card_fee",
      amount: "1000.00",
      card_id: s.ids.card,
      category: "card fee/interest",
      for_month: month1st(),
    });
    const reversal = await seedMoney({
      type: "card_fee",
      amount: "1000.00",
      card_id: s.ids.card,
      category: "card fee/interest",
      for_month: month1st(),
      reverses_id: fee,
    });
    const base = `/cards/${s.ids.card}`;
    await page.goto(`${base}?entry=${fee}`);
    await page
      .getByRole("dialog", { name: "Card fee" })
      .getByRole("link", { name: /Reversed by/ })
      .click();
    await page.waitForURL((u) => u.searchParams.get("entry") === reversal);
    expect(new URL(page.url()).pathname).toBe(base);

    // Edit from the card page comes back to it with the entry open.
    const other = await seedMoney({
      type: "card_fee",
      amount: "300.00",
      card_id: s.ids.card,
      category: "card fee/interest",
      for_month: month1st(),
    });
    await page.goto(`${base}?entry=${other}`);
    const sheet = page.getByRole("dialog", { name: "Card fee" });
    const edit = sheet.getByRole("link", { name: "Edit" });
    const del = sheet.getByRole("button", { name: "Delete" });
    // Edit is the main button; Delete is red, so the sheet reads as details, not a delete prompt.
    await expect(edit).toHaveClass(/bg-primary/);
    await expect(del).toHaveClass(/text-red-700/);
    await edit.click();
    await page.waitForURL((u) => u.pathname === `/money/${other}/edit`);
    expect(new URL(page.url()).searchParams.get("from")).toBe(`${base}?entry=${other}`);
    const form = page.getByRole("dialog", { name: "Edit Card fee" });
    await form.getByRole("textbox", { name: "Amount" }).fill("350");
    await form.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(`${base}?entry=${other}`);
    await expect(page.getByRole("dialog", { name: "Card fee" })).toContainText("৳350");

    // Delete from the supplier page lands back on the supplier, without the row.
    const pay = await seedMoney({
      type: "supplier_payment",
      amount: "450.00",
      supplier_id: s.ids.supplier,
      source: "cash",
    });
    const supplier = `/suppliers/${s.ids.supplier}`;
    await page.goto(`${supplier}?entry=${pay}`);
    await page
      .getByRole("dialog", { name: "Supplier payment" })
      .getByRole("button", { name: "Delete" })
      .click();
    await page
      .getByRole("dialog", { name: "Delete this entry?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await page.waitForURL(supplier);
    await expect(page.getByRole("status").getByText("Deleted")).toBeVisible();
    await expect(page.getByText("No entries yet.")).toBeVisible();
    expect((await sql`select id from money_entries where id = ${pay}`).length).toBe(0);
  });

  test("an unknown entry on a card page says so, and the page still shows", async ({ page }) => {
    const s = await seedAccounts();
    await page.goto(`/cards/${s.ids.card}?entry=${randomUUID()}`);
    await expect(page.getByText("That entry no longer exists.")).toBeVisible();
    await expect(page.locator("h1")).toContainText(s.names.card);
  });
});
