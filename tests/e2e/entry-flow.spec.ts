import { randomUUID } from "node:crypto";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { formatMonth } from "@/lib/dates";
import type { EffectRow } from "@/lib/effect-rows";
import { type Entry, SIDE, postEntry } from "@/lib/engine/post";
import { parse } from "@/lib/money";
import { previewEntry } from "@/lib/preview";
import { localSql } from "../integration/local-db";
import { goHome } from "./helpers";
import { fillDate } from "./seed";

// Task 3.9: Phase 3 end to end at 360px (and 1280px). Each test seeds its own model, customer,
// supplier and card. Synthetic data only.
const sql = localSql();
test.afterAll(() => sql.end());

const dhaka = (days = 0) =>
  new Date(Date.now() + 6 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
const inr = (n: number) => `৳${n.toLocaleString("en-IN")}`;
const money = (v: string) => parse(v)!;

async function seed() {
  const run = randomUUID().slice(0, 8);
  const ids = { model: randomUUID(), customer: randomUUID(), supplier: randomUUID() };
  const model = `E2E P3 ${run}`;
  const shop = `E2E P3 Shop ${run}`;
  const supplier = `E2E P3 Supplier ${run}`;
  await sql`insert into models (id, name) values (${ids.model}, ${model})`;
  await sql`insert into customers (id, proprietor_name, shop_name) values (${ids.customer}, 'Owner', ${shop})`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, ${supplier})`;
  const names = { [ids.customer]: `${shop} (Owner)`, [ids.supplier]: supplier };
  return { ids, model, customer: names[ids.customer], supplier, names };
}

/** The "What this will do" rows the form shows (UIDD §3, D-061). */
const previewOf = (scope: Page | Locator) =>
  scope.locator("section").filter({ hasText: "What this will do" }).locator("dl > div");
/** A row as the page reads it: label, sub-line, amount. */
const text = (rows: EffectRow[]) => rows.map((r) => `${r.label}${r.sub ?? ""}${r.value}`);

/** A stored entry as the engine's input: the facts the books are built from (SRS §5). */
async function stored(table: Entry["table"], id: string): Promise<Entry> {
  if (table === "purchase") {
    const [p] = await sql`select *, date::text as date from purchases where id = ${id}`;
    const lines = await sql`select qty, unit_cost from purchase_lines where purchase_id = ${id}`;
    return {
      table,
      date: p.date,
      source: p.source,
      supplierId: p.supplier_id,
      cardId: p.card_id,
      customerId: p.customer_id,
      lines: lines.map((l) => ({ qty: l.qty, unitCost: money(l.unit_cost) })),
    };
  }
  if (table === "sale") {
    const [s] = await sql`select *, date::text as date from sales where id = ${id}`;
    const lines = await sql`select sl.qty, sl.unit_price, pl.unit_cost from sale_lines sl
      join purchase_lines pl on pl.id = sl.lot_id where sl.sale_id = ${id}`;
    return {
      table,
      date: s.date,
      customerId: s.customer_id,
      lines: lines.map((l) => ({
        qty: l.qty,
        unitPrice: money(l.unit_price),
        unitCost: money(l.unit_cost),
      })),
    };
  }
  if (table === "return") {
    const [r] = await sql`select *, date::text as date from returns where id = ${id}`;
    const lines = await sql`select rl.qty, rl.unit_amount, pl.unit_cost from return_lines rl
      join purchase_lines pl on pl.id = rl.lot_id where rl.return_id = ${id}`;
    return {
      table,
      date: r.date,
      kind: r.kind,
      customerId: r.customer_id,
      lines: lines.map((l) => ({
        qty: l.qty,
        unitAmount: money(l.unit_amount),
        unitCost: money(l.unit_cost),
      })),
    };
  }
  const [m] = await sql`select *, date::text as date from money_entries where id = ${id}`;
  return { table, type: m.type, date: m.date, amount: money(m.amount), customerId: m.customer_id };
}

const saved: Entry[] = [];

/** The preview the saved entry gives: what the books now hold for it. */
async function savedPreview(table: Entry["table"], id: string, names: Record<string, string>) {
  const entry = await stored(table, id);
  saved.push(entry);
  return previewEntry(entry, { names });
}

/** Assets − liabilities − equity moved by these entries: 0 when the books balance (SRS §5). */
const imbalance = (entries: Entry[]) =>
  entries
    .flatMap((e) => postEntry(e))
    .reduce((sum, e) => sum + (SIDE[e.account] === "asset" ? e.amount : 0 - e.amount), 0);

test.describe("Phase 3 E2E (task 3.9)", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("E3.9.1 purchase on supplier credit → sale (auto lot) → customer return → payment in", async ({
    page,
  }) => {
    const s = await seed();
    const month = formatMonth(dhaka().slice(0, 7));

    // Purchase: 3 @ 10,000 on supplier credit → one lot of 3.
    await page.goto("/purchases/new");
    await page.getByRole("radio", { name: "Supplier credit" }).check();
    await page.getByRole("button", { name: "Supplier" }).click();
    await page.getByRole("option", { name: s.supplier }).click();
    await page.getByRole("button", { name: "Model (line 1)" }).click();
    await page.getByRole("option", { name: s.model }).click();
    await page.getByRole("textbox", { name: "Qty" }).fill("3");
    await page.getByRole("textbox", { name: "Unit cost" }).fill("10,000");
    const purchase: EffectRow[] = [
      { label: "Stock", value: `+${inr(30_000)}` },
      { label: `We owe ${s.supplier}`, value: `+${inr(30_000)}` },
      { label: "Cash and profit", value: "no change" },
    ];
    await expect(previewOf(page)).toHaveText(text(purchase));
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");
    const [p] = await sql`select id from purchases where supplier_id = ${s.ids.supplier}`;
    expect(await savedPreview("purchase", p.id, s.names)).toEqual(purchase);

    // Sale: 2 @ 12,000; the lot is picked oldest first and shown.
    await page.goto("/sales/new");
    await page.getByRole("button", { name: "Customer" }).click();
    await page.getByRole("option", { name: s.customer }).click();
    await page.getByRole("button", { name: "Model (line 1)" }).click();
    await page.getByRole("option", { name: `${s.model} · 3 in stock` }).click();
    await page.getByRole("textbox", { name: "Qty" }).fill("2");
    await page.getByRole("textbox", { name: "Unit price" }).fill("12,000");
    await expect(page.getByText(/^2 from lot \d\d \w{3} @৳10,000$/)).toBeVisible();
    const sale: EffectRow[] = [
      { label: "Stock", value: `-${inr(20_000)}` },
      { label: `${s.customer} owes`, value: `+${inr(24_000)}` },
      { label: "Profit", sub: month, value: `+${inr(4_000)}` },
      { label: "Cash", value: "no change" },
    ];
    await expect(previewOf(page)).toHaveText(text(sale));
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");
    const [b] = await sql`select id from sales where customer_id = ${s.ids.customer}`;
    expect(await savedPreview("sale", b.id, s.names)).toEqual(sale);
    const [lot] =
      await sql`select sl.qty from sale_lines sl join purchase_lines pl on pl.id = sl.lot_id
      where sl.sale_id = ${b.id} and pl.purchase_id = ${p.id}`;
    expect(lot.qty).toBe(2);

    // Customer return: 1 unit back at the sale price.
    await page.goto("/returns/new");
    const ret = page.getByRole("dialog", { name: "New return" });
    await ret.getByRole("button", { name: "Customer" }).click();
    await page.getByRole("option", { name: s.customer }).click();
    await ret.getByRole("button", { name: "Bill" }).click();
    await page.getByRole("option", { name: new RegExp(inr(24_000)) }).click();
    await ret.getByRole("button", { name: "Line" }).click();
    await page.getByRole("option", { name: new RegExp(`${s.model} · 2 @`) }).click();
    await ret.getByRole("textbox", { name: "Qty" }).fill("1");
    const returned: EffectRow[] = [
      { label: "Stock", value: `+${inr(10_000)}` },
      { label: `${s.customer} owes`, value: `-${inr(12_000)}` },
      { label: "Profit", sub: month, value: `-${inr(2_000)}` },
      { label: "Cash", value: "no change" },
    ];
    await expect(previewOf(ret)).toHaveText(text(returned));
    await ret.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");
    const [r] = await sql`select id from returns where customer_id = ${s.ids.customer}`;
    expect(await savedPreview("return", r.id, s.names)).toEqual(returned);

    // Payment in: the rest of the bill.
    await page.goto("/money/new?type=customer_payment");
    const pay = page.getByRole("dialog", { name: "Payment in" });
    await pay.getByRole("button", { name: "Customer" }).click();
    await page.getByRole("option", { name: s.customer }).click();
    await pay.getByRole("textbox", { name: "Amount" }).fill("12,000");
    const paid: EffectRow[] = [
      { label: "Cash", value: `+${inr(12_000)}` },
      { label: `${s.customer} owes`, value: `-${inr(12_000)}` },
      { label: "Profit", value: "no change" },
    ];
    await expect(previewOf(pay)).toHaveText(text(paid));
    await pay.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");
    const [m] = await sql`select id from money_entries where customer_id = ${s.ids.customer}`;
    expect(await savedPreview("money", m.id, s.names)).toEqual(paid);
    // The four entries balance the books, and the customer owes nothing now.
    expect(saved).toHaveLength(4);
    expect(imbalance(saved)).toBe(0);
    const due = saved
      .flatMap((e) => postEntry(e))
      .filter((e) => e.account === "customer_due")
      .reduce((sum, e) => sum + e.amount, 0);
    expect(due).toBe(0);
  });

  test("E3.9.2 Save → Undo removes the entry", async ({ page }) => {
    const s = await seed();
    const purchases = async () =>
      (await sql`select id from purchases where supplier_id = ${s.ids.supplier}`).length;
    await page.goto("/purchases/new");
    await page.getByRole("radio", { name: "Supplier credit" }).check();
    await page.getByRole("button", { name: "Supplier" }).click();
    await page.getByRole("option", { name: s.supplier }).click();
    await page.getByRole("button", { name: "Model (line 1)" }).click();
    await page.getByRole("option", { name: s.model }).click();
    await page.getByRole("textbox", { name: "Unit cost" }).fill("10,000");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");
    const toast = page.getByRole("status");
    await expect(toast.getByText("Saved")).toBeVisible();
    expect(await purchases()).toBe(1);
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect.poll(purchases).toBe(0);
  });

  test("E3.9.3 the duplicate dialog appears; Save anyway saves", async ({ page }) => {
    const s = await seed();
    const payments = async () =>
      (await sql`select id from money_entries where customer_id = ${s.ids.customer}`).length;
    const pay = async () => {
      await page.goto("/money/new?type=customer_payment");
      const dialog = page.getByRole("dialog", { name: "Payment in" });
      await dialog.getByRole("button", { name: "Customer" }).click();
      await page.getByRole("option", { name: s.customer }).click();
      await dialog.getByRole("textbox", { name: "Amount" }).fill("5,000");
      await dialog.getByRole("button", { name: "Save" }).click();
    };
    await pay();
    await page.waitForURL("/");
    expect(await payments()).toBe(1);

    // Same type, customer, amount and date → the dialog; it never blocks (UIDD §5).
    await pay();
    const dup = page.getByRole("dialog", { name: "Possible duplicate" });
    await expect(dup.getByText(/^A similar entry exists \(by .+\) — save anyway\?$/)).toBeVisible();
    await expect(dup.getByRole("link", { name: "View it" })).toBeVisible();
    await dup.getByRole("button", { name: "Save anyway" }).click();
    await page.waitForURL("/");
    expect(await payments()).toBe(2);
  });

  test("E3.9.4 inline errors: a lot's qty, a future date, cash received over charged", async ({
    page,
  }) => {
    const s = await seed();
    const purchase = randomUUID();
    const person = randomUUID();
    const run = randomUUID().slice(0, 8);
    const [owner, card] = [`E2E P3 Owner ${run}`, `E2E P3 Visa ${run}`];
    await sql`insert into purchases (id, date, source) values (${purchase}, ${dhaka(-1)}, 'cash')`;
    await sql`insert into purchase_lines (purchase_id, model_id, qty, unit_cost)
      values (${purchase}, ${s.ids.model}, 12, 10000)`;
    await sql`insert into people (id, name, kind) values (${person}, ${owner}, 'investor')`;
    await sql`insert into cards (owner_person_id, name, statement_day, due_day)
      values (${person}, ${card}, 5, 20)`;

    // More than the chosen lot holds.
    await page.goto("/sales/new");
    await page.getByRole("button", { name: "Customer" }).click();
    await page.getByRole("option", { name: s.customer }).click();
    await page.getByRole("button", { name: "Model (line 1)" }).click();
    await page.getByRole("option", { name: `${s.model} · 12 in stock` }).click();
    await page.getByRole("textbox", { name: "Unit price" }).fill("12,000");
    await page.getByRole("button", { name: "Choose lot" }).click();
    await page.getByRole("button", { name: "Lot (line 1)", exact: true }).click();
    await page.getByRole("option", { name: /@৳10,000/ }).click();
    await page.getByRole("textbox", { name: "Qty" }).fill("13");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Only 12 left in this lot")).toBeVisible();

    // A future date.
    await page.goto("/money/new?type=customer_payment");
    const payment = page.getByRole("dialog", { name: "Payment in" });
    await fillDate(payment.getByLabel("Date"), dhaka(1));
    await payment.getByRole("button", { name: "Customer" }).click();
    await page.getByRole("option", { name: s.customer }).click();
    await payment.getByRole("textbox", { name: "Amount" }).fill("1,000");
    await payment.getByRole("button", { name: "Save" }).click();
    await expect(payment.getByText("Date can't be in the future")).toBeVisible();

    // Cash-out: more cash than the card was charged.
    await page.goto("/money/new?type=card_cash_out");
    const cashOut = page.getByRole("dialog", { name: "Cash-out" });
    await cashOut.getByRole("button", { name: "Card", exact: true }).click();
    await page.getByRole("option", { name: `${owner} · ${card}` }).click();
    await cashOut.getByRole("textbox", { name: "Charged to card" }).fill("10,000");
    await cashOut.getByRole("textbox", { name: "Cash received" }).fill("10,001");
    await cashOut.getByRole("button", { name: "Save" }).click();
    await expect(cashOut.getByText("Cash received can't exceed amount charged")).toBeVisible();
    expect(
      (await sql`select id from money_entries where customer_id = ${s.ids.customer}`).length,
    ).toBe(0);
  });
});
