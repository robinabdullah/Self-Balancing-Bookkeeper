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

/** `unitCost`: the lot's cost; a run's own keeps its return from matching an earlier run's. */
async function seed(unitCost = 10000) {
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
    values (${ids.lot}, ${ids.purchase}, ${ids.model}, 3, ${unitCost})`;
  await sql`insert into sales (id, date, customer_id) values (${ids.sale}, ${yesterday()}, ${ids.customer})`;
  await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price) values (${ids.sale}, ${ids.lot}, 2, 12000)`;
  const returns = async () => {
    const [row] = await sql`select count(*)::int as n from return_lines where lot_id = ${ids.lot}`;
    return row.n as number;
  };
  return { model, shop, returns, ids };
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

// CR-051 (D-074; UIDD §4.5, §4.10): Return in a purchase's or a sale's entry sheet opens the form
// already set to it; Save goes back to the sheet.
test.describe("Return from an entry sheet (CR-051)", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("E-CR-051.1 purchase → Return → filled → Save → back on the sheet; the same for a sale", async ({
    page,
  }) => {
    // A cost of its own: the refund then can't match an earlier run's return as a duplicate.
    const cost = 10_000 + Math.floor(Math.random() * 9_000) + 1;
    const { model, shop, ids } = await seed(cost);

    // The purchase: 3 bought, 2 sold → 1 to send back.
    await page.goto(`/journal?entry=${ids.purchase}`);
    const purchase = page.getByRole("dialog", { name: /^Purchase/ });
    await purchase.getByRole("link", { name: "Return" }).click();
    let form = page.getByRole("dialog", { name: "New return" });
    await expect(form.getByRole("radio", { name: "Purchase return" })).toBeChecked();
    await expect(form.getByRole("radio", { name: "Returned to seller" })).toBeChecked();
    await expect(form.getByRole("button", { name: "Lot" })).toContainText(model);
    await expect(form.getByText("1 left")).toBeVisible();
    await expect(form.getByRole("textbox", { name: "Refund per unit" })).toHaveValue(
      cost.toLocaleString("en-IN"),
    );
    await expect(form.getByRole("radio", { name: "Cash" })).toBeChecked();
    await noSideScroll(page);
    await form.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(`/journal?entry=${ids.purchase}`);
    await expect(purchase).toBeVisible();
    const [lot] = await sql`select l.qty - 2 - coalesce((select sum(rl.qty) from return_lines rl
      join returns r on r.id = rl.return_id where rl.lot_id = l.id and r.kind = 'purchase'), 0)
      as left from purchase_lines l where l.id = ${ids.lot}`;
    expect(Number(lot.left)).toBe(0);
    // Nothing left in its lot → no Return any more (E-CR-051.2).
    await expect(purchase.getByRole("button", { name: "Reverse" })).toBeVisible();
    await expect(purchase.getByRole("link", { name: "Return" })).toHaveCount(0);

    // The sale: its customer, bill and line are set; the refund starts at the sale price.
    await page.goto(`/journal?entry=${ids.sale}`);
    const sale = page.getByRole("dialog", { name: /^Sale/ });
    // CR-051.4: Delete · Reverse (the fixes) apart from Return · Send ▸ · Edit; on a phone the
    // everyday actions are the bottom row.
    const box = async (name: string) =>
      (await sale
        .getByRole(name === "Delete" || name === "Reverse" ? "button" : "link", {
          name,
          exact: true,
        })
        .boundingBox())!;
    const [del, rev, ret, send, edit] = await Promise.all(
      ["Delete", "Reverse", "Return", "Send ▸", "Edit"].map(box),
    );
    expect(del.x).toBeLessThan(rev.x);
    expect(ret.x).toBeLessThan(send.x);
    expect(send.x).toBeLessThan(edit.x);
    if ((page.viewportSize()?.width ?? 0) < 640)
      expect(ret.y).toBeGreaterThan(rev.y + rev.height - 1);
    else expect(rev.x + rev.width).toBeLessThan(ret.x);
    await sale.getByRole("link", { name: "Return" }).click();
    form = page.getByRole("dialog", { name: "New return" });
    await expect(form.getByRole("radio", { name: "Customer return" })).toBeChecked();
    await expect(form.getByRole("button", { name: "Customer" })).toContainText(shop);
    await expect(form.getByRole("button", { name: "Bill" })).toContainText(inr(24_000));
    await expect(form.getByRole("button", { name: "Line" })).toContainText(model);
    await expect(form.getByRole("textbox", { name: "Refund per unit" })).toHaveValue("12,000");
    await form.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(`/journal?entry=${ids.sale}`);
    await expect(sale).toBeVisible();
    // The customer owes the refund less (SRS §5: a customer return lowers their due).
    const back = await sql`select r.customer_id, rl.qty, rl.unit_amount from returns r
      join return_lines rl on rl.return_id = r.id where r.kind = 'customer' and rl.lot_id = ${ids.lot}`;
    expect(back.map((r) => [r.customer_id, r.qty, r.unit_amount])).toEqual([
      [ids.customer, 1, "12000.00"],
    ]);
    await expect(sale.getByRole("link", { name: "Return" })).toBeVisible(); // 1 still on the bill
  });

  test("E-CR-051.2 no Return on a reversed purchase, a reversal, no stock left, opening stock or an inactive customer", async ({
    page,
  }) => {
    const { ids } = await seed();
    const [reversed, reversal, opening, used, oldCustomer, oldSale] = Array.from(
      { length: 6 },
      () => randomUUID(),
    );
    const day = yesterday();
    await sql`insert into purchases (id, date, source) values (${reversed}, ${day}, 'cash'),
      (${used}, ${day}, 'cash')`;
    await sql`insert into purchase_lines (purchase_id, model_id, qty, unit_cost) values
      (${reversed}, ${ids.model}, 1, 10000)`;
    await sql`insert into purchases (id, date, source, reverses_id)
      values (${reversal}, ${day}, 'cash', ${reversed})`;
    // Opening stock, with an opening cash item of −10,000 so the shared books still balance
    // (an opening correction would need partners for its difference). Removed at the end.
    const openingCash = randomUUID();
    await sql`insert into purchases (id, date, source) values (${opening}, ${day}, 'opening')`;
    await sql`insert into purchase_lines (purchase_id, model_id, qty, unit_cost) values
      (${opening}, ${ids.model}, 1, 10000)`;
    await sql`insert into money_entries (id, type, date, amount, opening_kind)
      values (${openingCash}, 'opening', ${day}, -10000, 'cash')`;
    // A purchase whose one phone is sold, to a customer who is now inactive.
    const usedLot = randomUUID();
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost) values
      (${usedLot}, ${used}, ${ids.model}, 1, 10000)`;
    await sql`insert into customers (id, proprietor_name, shop_name, active)
      values (${oldCustomer}, 'Old', ${`E2E Old Shop ${oldCustomer.slice(0, 8)}`}, false)`;
    await sql`insert into sales (id, date, customer_id) values (${oldSale}, ${day}, ${oldCustomer})`;
    await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price) values (${oldSale}, ${usedLot}, 1, 12000)`;

    try {
      for (const [id, name] of [
        [reversed, /^Purchase/],
        [reversal, /^Purchase/],
        [opening, /^Opening|^Purchase/],
        [used, /^Purchase/],
        [oldSale, /^Sale/],
      ] as const) {
        await page.goto(`/journal?entry=${id}`);
        const sheet = page.getByRole("dialog", { name });
        await expect(sheet.getByRole("button", { name: "Delete" })).toBeVisible();
        await expect(sheet.getByRole("link", { name: "Return" }), id).toHaveCount(0);
      }
    } finally {
      await sql`delete from purchase_lines where purchase_id = ${opening}`;
      await sql`delete from purchases where id = ${opening}`;
      await sql`delete from money_entries where id = ${openingCash}`;
    }
    // The control: the seeded purchase with stock has it.
    await page.goto(`/journal?entry=${ids.purchase}`);
    await expect(
      page.getByRole("dialog", { name: /^Purchase/ }).getByRole("link", { name: "Return" }),
    ).toBeVisible();
  });
});
