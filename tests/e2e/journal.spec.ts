import { randomUUID } from "node:crypto";
import { type Page, expect, test } from "@playwright/test";
import { localSql } from "../integration/local-db";
import { addMonths, monthOf } from "@mbl/domain/dates";
import { effectValue, goHome } from "./helpers";
import { dmy, fillDate } from "./seed";

// Task 3.8 (UIDD §4.10): the Journal at 360px and 1280px: filters, the detail, Reverse with the
// "Reversed by" link, Edit in the same form (money and sale), History and Delete. Each test seeds
// its own rows. Synthetic data only.
const sql = localSql();
test.afterAll(() => sql.end());

const dhaka = (days = 0) =>
  new Date(Date.now() + 6 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);

async function seedCustomer() {
  const run = randomUUID().slice(0, 8);
  const id = randomUUID();
  const shop = `E2E Journal ${run}`;
  await sql`insert into customers (id, proprietor_name, shop_name) values (${id}, 'Owner', ${shop})`;
  return { id, name: `${shop} (Owner)` };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The filters: a bottom sheet on a phone, inline on desktop (UIDD §4.10). Who is a picker. */
async function filterBy(page: Page, name: string) {
  const phone = (page.viewportSize()?.width ?? 0) < 1024;
  if (phone) await page.getByRole("button", { name: /^Filters/ }).click();
  const scope = phone
    ? page.getByRole("dialog", { name: "Filters" })
    : page.getByRole("region", { name: "Filters" });
  await scope.getByRole("button", { name: "Who", exact: true }).click();
  const who = page.getByRole("dialog", { name: "Who" });
  await who.getByRole("searchbox").fill(name);
  await who.getByRole("option", { name: new RegExp(`^${escapeRe(name)}`) }).click();
  if (phone) await scope.getByRole("button", { name: /^Show 1 entry$/ }).click();
}

test.describe("Journal (task 3.8)", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("3.8.1 filter → detail → Reverse; the Reversed by link; no Edit on the pair", async ({
    page,
  }) => {
    const customer = await seedCustomer();
    const id = randomUUID();
    await sql`insert into money_entries (id, type, date, amount, customer_id)
      values (${id}, 'customer_payment', ${dhaka()}, 1234, ${customer.id})`;

    await page.goto("/journal");
    await filterBy(page, customer.name);
    await expect(page).toHaveURL(new RegExp(`who=${customer.id}`));
    const entries = page.getByRole("list", { name: "Entries" });
    await expect(entries.getByRole("listitem")).toHaveCount(1);
    await entries.getByRole("link", { name: /Payment in/ }).click();

    const detail = page.getByRole("dialog", { name: "Payment in" });
    await expect(detail.getByText(customer.name, { exact: true })).toBeVisible(); // Who
    await expect(detail.getByRole("link", { name: "Edit" })).toBeVisible();
    await detail.getByRole("button", { name: "Reverse" }).click();
    const reverse = page.getByRole("dialog", { name: "Reverse this entry?" });
    await expect(reverse.getByLabel("Date")).toHaveValue(dmy(dhaka()));
    await reverse.getByRole("button", { name: "Reverse" }).click();
    await expect(page.getByRole("status").getByText("Reversed")).toBeVisible();

    await expect(detail.getByRole("link", { name: /Reversed by/ })).toBeVisible();
    await expect(detail.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "Reverse" })).toHaveCount(0);
    const [r] = await sql`select id from money_entries where reverses_id = ${id}`;
    expect(r).toBeTruthy();

    // The reversal: it links back, and its History says how it was added.
    await detail.getByRole("link", { name: /Reversed by/ }).click();
    // The reversal opens over the same filtered list (D-032).
    await page.waitForURL(
      (u) => u.searchParams.get("entry") === r.id && !!u.searchParams.get("who"),
    );
    const reversal = page.getByRole("dialog", { name: "Payment in" });
    await expect(reversal.getByRole("link", { name: /Reverses/ })).toBeVisible();
    await reversal.getByRole("tab", { name: "History" }).click();
    await expect(reversal.getByText(/^Added as a reversal by /)).toBeVisible();
  });

  test("3.8.2 Edit opens the money form with its values; History shows the change; Delete", async ({
    page,
  }) => {
    const id = randomUUID();
    const month = `${dhaka().slice(0, 7)}-01`;
    await sql`insert into money_entries (id, type, date, amount, category, source, for_month, note)
      values (${id}, 'expense', ${dhaka()}, 5000, 'rent', 'cash', ${month}, ${`E2E ${id}`})`;

    await page.goto(`/journal?entry=${id}`);
    const detail = page.getByRole("dialog", { name: "Expense" });
    await detail.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(`/money/${id}/edit`);
    const form = page.getByRole("dialog", { name: "Edit Expense" });
    await expect(form.getByRole("textbox", { name: "Amount" })).toHaveValue("5,000");
    await expect(form.getByRole("radio", { name: "Rent" })).toBeChecked();
    await expect(form.getByRole("combobox", { name: "For month" })).toHaveValue(month.slice(0, 7));
    // The type is fixed (D-008): no type picker or chips.
    await expect(form.getByRole("button", { name: "Type" })).toHaveCount(0);
    await form.getByRole("textbox", { name: "Amount" }).fill("5,500");
    await form.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(`/journal?entry=${id}`);

    const after = page.getByRole("dialog", { name: "Expense" });
    await after.getByRole("tab", { name: "History" }).click();
    await expect(after.getByText(/^Edited by /)).toBeVisible();
    await expect(effectValue(after, "Amount")).toHaveText("৳5,000 → ৳5,500"); // D-061: a row

    await after.getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("dialog", { name: "Delete this entry?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await page.waitForURL("/journal");
    await expect
      .poll(async () => (await sql`select id from money_entries where id = ${id}`).length)
      .toBe(0);
  });

  test("3.8.2 Edit opens the sale page with its lines; the line keeps its lot (D-004)", async ({
    page,
  }) => {
    const customer = await seedCustomer();
    const model = `E2E Journal model ${randomUUID().slice(0, 8)}`;
    const ids = {
      model: randomUUID(),
      purchase: randomUUID(),
      lot: randomUUID(),
      sale: randomUUID(),
    };
    await sql`insert into models (id, name) values (${ids.model}, ${model})`;
    await sql`insert into purchases (id, date, source) values (${ids.purchase}, ${dhaka(-1)}, 'cash')`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
      values (${ids.lot}, ${ids.purchase}, ${ids.model}, 3, 10000)`;
    await sql`insert into sales (id, date, customer_id) values (${ids.sale}, ${dhaka()}, ${customer.id})`;
    await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price)
      values (${ids.sale}, ${ids.lot}, 2, 12000)`;

    await page.goto(`/sales/${ids.sale}/edit`);
    await expect(page.getByRole("heading", { name: "Edit sale" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Customer" })).toHaveText(customer.name);
    await expect(page.getByRole("button", { name: "Model (line 1)" })).toHaveText(
      `${model} · 3 in stock`,
    );
    await expect(page.getByRole("textbox", { name: "Qty" })).toHaveValue("2");
    await expect(page.getByRole("textbox", { name: "Received now" })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Unit price" }).fill("12,500");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(`/journal?entry=${ids.sale}`);

    const lines =
      await sql`select lot_id, qty, unit_price from sale_lines where sale_id = ${ids.sale}`;
    expect(lines.map((l) => [l.lot_id, l.qty, l.unit_price])).toEqual([[ids.lot, 2, "12500.00"]]);
  });

  test("3.8.2 Edit opens the purchase page and the return modal with their values", async ({
    page,
  }) => {
    const customer = await seedCustomer();
    const model = `E2E Journal model ${randomUUID().slice(0, 8)}`;
    const ids = {
      model: randomUUID(),
      purchase: randomUUID(),
      lot: randomUUID(),
      sale: randomUUID(),
      line: randomUUID(),
      ret: randomUUID(),
    };
    await sql`insert into models (id, name) values (${ids.model}, ${model})`;
    await sql`insert into purchases (id, date, source, note)
      values (${ids.purchase}, ${dhaka(-1)}, 'cash', 'E2E bill')`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost, imei_note)
      values (${ids.lot}, ${ids.purchase}, ${ids.model}, 3, 10000.50, 'IMEI 1')`;
    await sql`insert into sales (id, date, customer_id) values (${ids.sale}, ${dhaka()}, ${customer.id})`;
    await sql`insert into sale_lines (id, sale_id, lot_id, qty, unit_price)
      values (${ids.line}, ${ids.sale}, ${ids.lot}, 2, 12000)`;
    await sql`insert into returns (id, kind, date, customer_id)
      values (${ids.ret}, 'customer', ${dhaka()}, ${customer.id})`;
    await sql`insert into return_lines (return_id, sale_line_id, lot_id, qty, unit_amount)
      values (${ids.ret}, ${ids.line}, ${ids.lot}, 2, 11500)`;

    // The purchase: its paid by, line and note (Save is blocked: the lot has sales, so the
    // line can't be removed; here it only opens).
    await page.goto(`/purchases/${ids.purchase}/edit`);
    await expect(page.getByRole("heading", { name: "Edit purchase" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Cash" })).toBeChecked();
    await expect(page.getByRole("button", { name: "Model (line 1)" })).toHaveText(model);
    await expect(page.getByRole("textbox", { name: "Qty" })).toHaveValue("3");
    await expect(page.getByRole("textbox", { name: "Unit cost" })).toHaveValue("10,000.50");
    await expect(page.getByRole("textbox", { name: "IMEI / note" })).toHaveValue("IMEI 1");
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toHaveValue("E2E bill");

    // The return: its customer, bill, line, qty (all 2 units can stay) and refund; edit → saved.
    await page.goto(`/returns/${ids.ret}/edit`);
    const form = page.getByRole("dialog", { name: "Edit customer return" });
    await expect(form.getByRole("radio", { name: "Customer return" })).toHaveCount(0);
    await expect(form.getByRole("button", { name: "Customer" })).toHaveText(customer.name);
    await expect(form.getByRole("button", { name: "Line" })).toContainText(model);
    await expect(form.getByRole("textbox", { name: "Qty" })).toHaveValue("2");
    await expect(form.getByRole("textbox", { name: "Refund per unit" })).toHaveValue("11,500");
    await form.getByRole("textbox", { name: "Refund per unit" }).fill("11,000");
    await form.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(`/journal?entry=${ids.ret}`);
    const [line] =
      await sql`select qty, unit_amount from return_lines where return_id = ${ids.ret}`;
    expect([line.qty, line.unit_amount]).toEqual([2, "11000.00"]);
  });
});

// E-CR-013.6 (UIDD §4.10; D-032): Period, search, the single-type total, filters in the URL, See in
// Journal, Clear. Each test seeds rows that only its own filters can match.
test.describe("Journal filters (CR-013)", () => {
  // Each test walks through several pages; `next dev` can be slow late in a long run.
  test.slow();
  test.beforeEach(async ({ page }) => goHome(page));

  /** The filter controls: the phone's sheet (opened) or the desktop bar. */
  async function filters(page: Page) {
    const phone = (page.viewportSize()?.width ?? 0) < 1024;
    if (phone) await page.getByRole("button", { name: /^Filters/ }).click();
    return phone
      ? page.getByRole("dialog", { name: "Filters" })
      : page.getByRole("region", { name: "Filters" });
  }
  const done = async (page: Page) => {
    const sheet = page.getByRole("dialog", { name: "Filters" });
    if (await sheet.isVisible()) await sheet.getByRole("button", { name: /^Show / }).click();
  };
  const entries = (page: Page) => page.getByRole("list", { name: "Entries" }).getByRole("listitem");

  test("Period: this month, a month with its “for” entries, a custom range; search; total; URL", async ({
    page,
  }) => {
    const customer = await seedCustomer();
    const tag = `E2E-${randomUUID().slice(0, 8)}`;
    const today = dhaka();
    const lastMonthDay = dhaka(-35);
    const lastMonth1st = `${lastMonthDay.slice(0, 7)}-01`;
    const pay = (date: string, amount: number, note: string) =>
      sql`insert into money_entries (id, type, date, amount, customer_id, note)
        values (${randomUUID()}, 'customer_payment', ${date}, ${amount}, ${customer.id}, ${note})`;
    await pay(today, 1000, `${tag} now`);
    await pay(lastMonthDay, 2000, `${tag} before`);
    // An expense dated today but for last month: it shows under last month too.
    await sql`insert into money_entries (id, type, date, amount, category, source, for_month, note)
      values (${randomUUID()}, 'expense', ${today}, 300, 'rent', 'cash', ${lastMonth1st}, ${`${tag} rent`})`;

    // Search narrows to this test's rows (note text).
    await page.goto(`/journal?q=${tag}`);
    await expect(entries(page)).toHaveCount(3);

    let f = await filters(page);
    await f.getByRole("combobox", { name: "Period" }).selectOption("this");
    await done(page);
    await expect(entries(page)).toHaveCount(2); // the payment now and the rent paid now
    await expect(page).toHaveURL(/period=this/);

    // The month before this one is "Last month"; an earlier one is listed by name.
    const thatMonth = lastMonthDay.slice(0, 7);
    const choice = thatMonth === addMonths(monthOf(today), -1) ? "last" : thatMonth;
    f = await filters(page);
    await f.getByRole("combobox", { name: "Period" }).selectOption(choice);
    await done(page);
    await expect(entries(page)).toHaveCount(2); // the payment before and the rent for that month
    await expect(entries(page).filter({ hasText: `${tag} rent` })).toBeVisible();

    // A custom range includes both ends.
    f = await filters(page);
    await f.getByRole("combobox", { name: "Period" }).selectOption("custom");
    await fillDate(f.getByLabel("From", { exact: true }), lastMonthDay);
    await fillDate(f.getByLabel("To", { exact: true }), lastMonthDay);
    await done(page);
    await expect(entries(page)).toHaveCount(1);
    await expect(entries(page)).toContainText(`${tag} before`);

    // One type filtered → the count line shows the total; the URL survives a reload.
    f = await filters(page);
    await f.getByRole("combobox", { name: "Period" }).selectOption("");
    await f.getByRole("combobox", { name: "Type" }).selectOption("customer_payment");
    await done(page);
    await expect(entries(page)).toHaveCount(2);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /entries/ })
        .first(),
    ).toContainText("2 entries · total ৳3,000");
    await page.reload();
    await expect(entries(page)).toHaveCount(2);
    await expect(page).toHaveURL(/type=customer_payment/);

    // Clear resets the list and the URL.
    f = await filters(page);
    await f.getByRole("button", { name: /^Clear/ }).click();
    await done(page);
    await expect(page).toHaveURL(/\/journal$/);
  });

  test("See in Journal from a card page lists that card's entries", async ({ page }) => {
    const run = randomUUID().slice(0, 8);
    const [owner, card] = [randomUUID(), randomUUID()];
    await sql`insert into people (id, name, kind) values (${owner}, ${`E2E J Owner ${run}`}, 'investor')`;
    await sql`insert into cards (id, owner_person_id, name, statement_day, due_day)
      values (${card}, ${owner}, ${`E2E J Visa ${run}`}, 5, 20)`;
    await sql`insert into money_entries (id, type, date, amount, card_id)
      values (${randomUUID()}, 'card_payment', ${dhaka()}, 100, ${card})`;
    await page.goto(`/cards/${card}`);
    // In ⋯ More since CR-018 (D-038).
    await page
      .getByRole("navigation", { name: "Quick actions" })
      .getByRole("button", { name: "More" })
      .click();
    await page
      .getByRole("dialog", { name: "More actions" })
      .getByRole("link", { name: "See in Journal" })
      .click();
    await page.waitForURL(`/journal?who=${card}`);
    await expect(entries(page)).toHaveCount(1);
    await expect(entries(page)).toContainText("Card payment");
  });
});

// E-CR-015.2 (D-035): on desktop the four filter labels stay in one row when Who shows its hint.
test.describe("Journal filter alignment (CR-015)", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("E-CR-015.2 with Who picked, the Type, Who, Period and Search labels line up", async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1024, "the desktop filter row");
    const customer = await seedCustomer();
    await page.goto("/journal");
    await filterBy(page, customer.name);
    const bar = page.getByRole("region", { name: "Filters" });
    await expect(bar.getByText("Customer", { exact: true })).toBeVisible(); // Who's hint
    // Each label is centred in its 44px row, so the rows line up when the centres do.
    const middles = await Promise.all(
      ["Type", "Who", "Period", "Search"].map(async (label) => {
        const box = (await bar.getByText(label, { exact: true }).first().boundingBox())!;
        return box.y + box.height / 2;
      }),
    );
    for (const y of middles) expect(Math.abs(y - middles[0]), `${middles}`).toBeLessThanOrEqual(1);
  });
});
