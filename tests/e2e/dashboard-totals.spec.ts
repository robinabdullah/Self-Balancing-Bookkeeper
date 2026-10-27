import { randomUUID } from "node:crypto";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { addDays, dhakaToday, monthOf } from "@mbl/domain/dates";
import { parse } from "@mbl/domain/money";
import { localSql } from "../integration/local-db";
import { goHome } from "./helpers";

// Task 4.6: Phase 4 end to end at 360px (and 1280px). The dashboard shows totals over the whole
// shared DB, so E4.6.1 reads it first and expects each tile to move by exactly its entries (the
// suite runs on one worker). Synthetic data only.
const sql = localSql();
test.afterAll(() => sql.end());

const today = dhakaToday();
const tk = (taka: number) => taka * 100;

/** The first ৳ amount in a text, in poisha ("-৳1,234.50" → -123450). */
function amountIn(text: string): number {
  const m = /(-?)৳([\d,]+(?:\.\d\d)?)/.exec(text);
  if (!m) throw new Error(`No amount in "${text}"`);
  return parse(m[1] + m[2])!;
}

const tile = (page: Page, title: string | RegExp) =>
  page
    .getByRole("region", { name: "Summary" })
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });

/** The Home tiles' numbers (UIDD §4.2), in poisha. */
async function dashboard(page: Page) {
  await page.goto("/");
  const read = async (scope: Locator) => amountIn(await scope.innerText());
  const stock = tile(page, "Stock");
  const dues = tile(page, "Card dues");
  return {
    cash: await read(tile(page, "Cash")),
    stock: await read(stock),
    units: Number(/(\d+) units? at cost/.exec(await stock.innerText())![1]),
    customersOwe: await read(tile(page, "Customers owe")),
    weOweSuppliers: await read(tile(page, "We owe suppliers")),
    overdue: await read(dues.getByText(/^Overdue /)),
    dueIn7Days: await read(dues.getByText(/^Due in 7 days /)),
    profit: await read(tile(page, /^Profit · /)),
  };
}

async function seed() {
  const run = randomUUID().slice(0, 8);
  const ids = {
    model: randomUUID(),
    customer: randomUUID(),
    supplier: randomUUID(),
    owner: randomUUID(),
    card: randomUUID(),
  };
  const s = {
    ids,
    model: `E2E P4 ${run}`,
    customer: `E2E P4 Shop ${run} (Owner)`,
    supplier: `E2E P4 Supplier ${run}`,
    card: `E2E P4 Owner ${run} · E2E P4 Visa ${run}`,
  };
  await sql`insert into models (id, name) values (${ids.model}, ${s.model})`;
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.customer}, 'Owner', ${`E2E P4 Shop ${run}`})`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, ${s.supplier})`;
  await sql`insert into people (id, name, kind) values (${ids.owner}, ${`E2E P4 Owner ${run}`}, 'investor')`;
  await sql`insert into cards (id, owner_person_id, name, statement_day, due_day)
    values (${ids.card}, ${ids.owner}, ${`E2E P4 Visa ${run}`}, 5, 20)`;
  // The bank's dates for this month's bill: out today, due in 3 days → "Due in 7 days".
  await sql`insert into card_bill_dates (card_id, bill_month, actual_statement_date, actual_due_date)
    values (${ids.card}, ${`${monthOf(today)}-01`}, ${today}, ${addDays(today, 3)})`;
  return s;
}

/** A money form (UIDD §4.6): open it by type, run `fill`, Save, back on Home. */
async function money(page: Page, type: string, title: string, fill: (d: Locator) => Promise<void>) {
  await page.goto(`/money/new?type=${type}`);
  const dialog = page.getByRole("dialog", { name: title });
  await fill(dialog);
  await dialog.getByRole("button", { name: "Save" }).click();
  // D-061: a cash-out confirms first.
  if (type === "card_cash_out")
    await page
      .getByRole("dialog", { name: /^Cash-out on / })
      .getByRole("button", { name: "Save" })
      .click();
  await page.waitForURL("/");
}

async function pick(page: Page, scope: Page | Locator, field: string, option: string | RegExp) {
  await scope.getByRole("button", { name: field, exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

test.describe("Phase 4 E2E (task 4.6)", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("E4.6.1 after purchase → sale → return → payment in, a card payment, a cash-out and an expense: ✓ and the expected cash / stock / dues", async ({
    page,
  }) => {
    test.slow(); // seven forms
    const s = await seed();
    const before = await dashboard(page);

    // Purchase: 3 @ 10,000 on supplier credit.
    await page.goto("/purchases/new");
    await page.getByRole("radio", { name: "Supplier credit" }).check();
    await pick(page, page, "Supplier", s.supplier);
    await pick(page, page, "Model (line 1)", s.model);
    await page.getByRole("textbox", { name: "Qty" }).fill("3");
    await page.getByRole("textbox", { name: "Unit cost" }).fill("10,000");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");

    // Sale: 2 @ 12,000 (auto lot).
    await page.goto("/sales/new");
    await pick(page, page, "Customer", s.customer);
    await pick(page, page, "Model (line 1)", `${s.model} · 3 in stock`);
    await page.getByRole("textbox", { name: "Qty" }).fill("2");
    await page.getByRole("textbox", { name: "Unit price" }).fill("12,000");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");

    // Customer return: 1 unit back at the sale price.
    await page.goto("/returns/new");
    const ret = page.getByRole("dialog", { name: "New return" });
    await pick(page, ret, "Customer", s.customer);
    await pick(page, ret, "Bill", /৳24,000/);
    await pick(page, ret, "Line", new RegExp(`${s.model} · 2 @`));
    await ret.getByRole("textbox", { name: "Qty" }).fill("1");
    await ret.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");

    // Payment in: 7,000 of the 12,000 still owed.
    await money(page, "customer_payment", "Payment in", async (d) => {
      await pick(page, d, "Customer", s.customer);
      await d.getByRole("textbox", { name: "Amount" }).fill("7,000");
    });
    // Cash-out: 20,000 charged to the card, 19,600 in cash (a 400 fee).
    await money(page, "card_cash_out", "Cash-out", async (d) => {
      await pick(page, d, "Card", s.card);
      await d.getByRole("textbox", { name: "Charged to card" }).fill("20,000");
      await d.getByRole("textbox", { name: "Cash received" }).fill("19,600");
    });
    // Card payment: 15,000 of that bill.
    await money(page, "card_payment", "Card payment", async (d) => {
      await pick(page, d, "Card", s.card);
      await d.getByRole("textbox", { name: "Amount" }).fill("15,000");
    });
    // Expense: 500 delivery paid by this run's card (the card keeps it from matching an earlier
    // run's expense as a "Possible duplicate"), this month.
    await money(page, "expense", "Expense", async (d) => {
      await d.getByRole("radio", { name: "Delivery" }).check();
      await d.getByRole("textbox", { name: "Amount" }).fill("500");
      await d.getByRole("radio", { name: "Card", exact: true }).check();
      await pick(page, d, "Card", s.card);
    });

    const after = await dashboard(page);
    await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();
    expect(after).toEqual({
      cash: before.cash + tk(7_000 + 19_600 - 15_000), // 11,600
      stock: before.stock + tk(30_000 - 20_000 + 10_000), // 2 units at 10,000
      units: before.units + 2,
      customersOwe: before.customersOwe + tk(24_000 - 12_000 - 7_000), // owes 5,000
      weOweSuppliers: before.weOweSuppliers + tk(30_000),
      overdue: before.overdue,
      dueIn7Days: before.dueIn7Days + tk(20_000 + 500 - 15_000), // the bill due in 3 days
      profit: before.profit + tk(4_000 - 2_000 - 400 - 500), // 1,100
    });
  });

  test("E4.6.2 the card list shows each status badge; stacked cards at 360px, a full table at 1280px", async ({
    page,
  }) => {
    const run = randomUUID().slice(0, 8);
    const owner = randomUUID();
    const ownerName = `E2E P4 Holder ${run}`;
    await sql`insert into people (id, name, kind) values (${owner}, ${ownerName}, 'investor')`;
    const ago = (n: number) => addDays(today, -n);
    // Each card: an optional charge (a card fee) or credit (a card payment), and its bank dates.
    const cards: {
      status: string;
      charge?: string;
      credit?: true;
      bill?: [statement: string, due: string];
    }[] = [
      { status: "Clear" },
      { status: "Overdue", charge: ago(30), bill: [ago(30), ago(20)] },
      { status: "Due today", charge: ago(5), bill: [ago(5), today] },
      { status: "Due within 7 days", charge: today, bill: [today, addDays(today, 3)] },
      { status: "Upcoming", charge: today, bill: [today, addDays(today, 20)] },
      { status: "Card credit", credit: true },
      { status: "Check dates", bill: [today, today] }, // due must come after the statement
    ];
    for (const c of cards) {
      const id = randomUUID();
      await sql`insert into cards (id, owner_person_id, name, statement_day, due_day)
        values (${id}, ${owner}, ${`${c.status} ${run}`}, 5, 20)`;
      if (c.charge)
        await sql`insert into money_entries (type, date, amount, card_id)
          values ('card_fee', ${c.charge}, 5000, ${id})`;
      if (c.credit)
        await sql`insert into money_entries (type, date, amount, card_id)
          values ('card_payment', ${today}, 1000, ${id})`;
      if (c.bill)
        await sql`insert into card_bill_dates (card_id, bill_month, actual_statement_date, actual_due_date)
          values (${id}, ${`${monthOf(c.bill[0])}-01`}, ${c.bill[0]}, ${c.bill[1]})`;
    }

    await page.goto("/cards");
    // D-056: the cards sit under their owner (a list per owner on a phone).
    const list = page.getByRole("list", { name: `${ownerName}'s cards` });
    const table = page.getByRole("table", { name: "Cards" });
    const mobile = test.info().project.name === "mobile";
    await expect(mobile ? list : table).toBeVisible();
    await expect(mobile ? table : list).toBeHidden();
    if (!mobile) {
      const columns = ["Card", "Stmt day", "Due day", "Balance", "Available ≈"];
      columns.push("Next due", "Amount", "Overdue", "Status");
      await expect(table.getByRole("columnheader")).toHaveText(columns);
    }
    const rows = mobile ? list.getByRole("listitem") : table.getByRole("row");
    for (const c of cards) {
      const row = rows.filter({ hasText: `${c.status} ${run}` });
      await expect(row).toHaveCount(1);
      await expect(row.getByText(c.status, { exact: true })).toBeVisible();
    }
    if (mobile)
      await expect(
        page.getByRole("region", { name: ownerName }).getByRole("heading"),
      ).toContainText(`${ownerName} · ${cards.length} cards`);
  });
});
