import { randomUUID } from "node:crypto";

import { type Locator, type Page, type TestInfo, expect, test } from "@playwright/test";

import { addMonths, daysInMonth, formatMonth, monthOf } from "@mbl/domain/dates";
import { type Card, billMonthOf } from "@mbl/domain/engine/cards";
import { goHome } from "./helpers";
import { catchShares, excelText, messageText, openStatementSheet, pdfText } from "./report-files";
import { dhaka, fillDate, phone, seedAccounts, seedMoney, sql } from "./seed";

// E-CR-034.2 (D-058; SRS §6.5, §8; UIDD §4.8, §4.17): a reversal everywhere it shows. A reversed
// card entry and its reversal drop out of the bills (the bill it paid is due again; deleting the
// reversal pays it again); every statement, PDF, Excel file, WhatsApp text, the Cash book and the
// card page name it "Reversal of …". Reversals go through the real Reverse button. At 360px and
// 1280px; a full-page screenshot of each screen for the user. Synthetic data only.

type Seeded = Awaited<ReturnType<typeof seedAccounts>>;
const EBL: Card = { id: "x", statementDay: 5, dueDay: 20 };

test.beforeEach(async ({ page, context }) => {
  await catchShares(page, context);
  await goHome(page);
});

const shot = (page: Page, info: TestInfo, name: string) =>
  page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });

const statements = (page: Page) => page.getByRole("list", { name: "Statements" });
const billRow = (page: Page, month: string) =>
  statements(page)
    .getByRole("listitem")
    .filter({ hasText: formatMonth(month) });
const moves = (page: Page) => page.getByRole("list", { name: "Charges and credits" });
/** A customer / supplier / card period statement: a list on a phone, a table on desktop. */
const statement = (page: Page, name = "Statement") =>
  page.getByRole(phone(page) ? "list" : "table", { name });
const rowsOf = (page: Page, scope: Locator) => scope.getByRole(phone(page) ? "listitem" : "row");

/**
 * The entry sheet over `base` → Reverse. The dialog's own date by default (SRS §8: the original's
 * date while its month is open), or `date`.
 */
async function reverse(
  page: Page,
  base: string,
  id: string,
  title: string | RegExp,
  date?: string,
  shotAs?: string,
) {
  await page.goto(`${base}${base.includes("?") ? "&" : "?"}entry=${id}`);
  await page.getByRole("dialog", { name: title }).getByRole("button", { name: "Reverse" }).click();
  const dialog = page.getByRole("dialog", { name: "Reverse this entry?" });
  // E-CR-034.4: when to reverse, on every entry type.
  await expect(dialog).toContainText(
    "Only for an entry that shouldn't count at all: a mistake, or a payment that bounced. " +
      "A phone returned or refunded? Enter a return instead.",
  );
  if (shotAs) await dialog.screenshot({ path: shotAs });
  if (date) await fillDate(dialog.getByLabel("Date"), date);
  await dialog.getByRole("button", { name: "Reverse" }).click();
  await expect(page.getByRole("status").getByText("Reversed")).toBeVisible();
}

/** EBL-style days: statement 5th, due 20th. A ৳2,000 card fee 60 days ago: an overdue bill. */
async function overdueCard() {
  const s = await seedAccounts({ cardName: "EBL Mastercard" });
  const billed = dhaka(-60);
  await seedMoney({
    type: "card_fee",
    date: billed,
    amount: "2000.00",
    card_id: s.ids.card,
    category: "card fee/interest",
    for_month: `${billed.slice(0, 7)}-01`,
  });
  return { s, bill: billMonthOf(EBL, billed) };
}

const cardPayments = async (cardId: string) =>
  (
    await sql`select id, reverses_id from money_entries
      where card_id = ${cardId} and type = 'card_payment' order by created_at`
  ).map((r) => ({ id: r.id as string, reversesId: r.reverses_id as string | null }));

test("E-CR-034.2 card: Pay, Reverse → the bill due again in every view; delete → paid again", async ({
  page,
}, info) => {
  test.setTimeout(240_000); // ~20 steps, a PDF and an Excel file
  const { s, bill } = await overdueCard();
  const base = `/cards/${s.ids.card}`;
  const badge = page.getByText(/^(Overdue|Clear|Upcoming|Card credit)$/).first();

  // 1. Pay the bill with its own Pay button: Clear.
  await page.goto(base);
  await expect(badge).toHaveText("Overdue");
  await billRow(page, bill).getByRole("link", { name: "Pay ৳2,000" }).click();
  await page
    .getByRole("dialog", { name: "Card payment" })
    .getByRole("button", { name: "Save" })
    .click();
  await page.waitForURL(base);
  await expect(badge).toHaveText("Clear");
  await expect(billRow(page, bill)).toHaveCount(0); // paid: behind Show all
  const [pay] = await cardPayments(s.ids.card);

  // 2. Reverse it: the bill is exactly as before the payment, and the pair is greyed.
  await reverse(
    page,
    base,
    pay.id,
    "Card payment",
    undefined,
    info.outputPath("0-reverse-dialog.png"),
  );
  await page.goto(base);
  await expect(badge).toHaveText("Overdue");
  await expect(billRow(page, bill)).toContainText("Remaining ৳2,000");
  await expect(billRow(page, bill).getByRole("link", { name: "Pay ৳2,000" })).toBeVisible();
  await expect(page.getByText("Balance ৳2,000")).toBeVisible();
  const original = moves(page)
    .getByRole("listitem")
    .filter({ hasText: /^Card payment/ });
  const reversal = moves(page)
    .getByRole("listitem")
    .filter({ hasText: "Reversal of Card payment" });
  await expect(original).toContainText("-৳2,000");
  await expect(original).toContainText("Credit");
  await expect(original.getByText("Reversed", { exact: true })).toBeVisible();
  await expect(reversal).toContainText("৳2,000");
  await expect(reversal).toContainText("Cancels the original");
  for (const row of [original, reversal])
    await expect(row.getByRole("link")).toHaveClass(/text-muted-foreground/);
  await expect(moves(page)).toContainText(`Charge · ${formatMonth(bill)} bill`); // the fee
  await shot(page, info, "1-card-page");

  // 3. The statement for this month: Excel, PDF, WhatsApp text, then on screen.
  let sheet = await openStatementSheet(page);
  const xlsx = await excelText(page, sheet);
  expect(xlsx).toContain("Reversal of Card payment");
  expect(xlsx).toMatch(/^Card payment$/m);
  const pdf = await pdfText(page, sheet);
  expect(pdf).toContain("Reversal of Card payment");
  expect(pdf).toContain("Card statement");
  const text = await messageText(page, sheet);
  expect(text).toMatch(/Reversal of Card payment: \+?৳2,000/);
  expect(text).toMatch(/Card payment: -৳2,000/);
  await shot(page, info, "2-card-statement-message");
  await page.goto(base);
  sheet = await openStatementSheet(page);
  await sheet.getByRole("link", { name: "View on screen" }).click();
  await page.waitForURL(/from=.*&to=/);
  const lines = statement(page, "Charges and credits");
  await expect(rowsOf(page, lines).filter({ hasText: "Reversal of Card payment" })).toHaveCount(1);
  // Card payments, net of reversals: the payment and its reversal in the same period → ৳0.
  await expect(page.getByLabel("Period totals")).toContainText("Card payments৳0");
  await shot(page, info, "3-card-statement-period");

  // 4. The Cash book and the Journal name the pair.
  await page.goto("/reports/cash");
  const cash = page.locator("main");
  await expect(
    rowsOf(page, cash)
      .filter({ hasText: s.names.card })
      .filter({ hasText: "Reversal of Card payment" }),
  ).toHaveCount(1);
  await shot(page, info, "4-cash-book");
  await page.goto(`/journal?who=${s.ids.card}`);
  const journal = page.getByRole("list", { name: "Entries" });
  await expect(journal.getByText("Reversal", { exact: true })).toBeVisible();
  await expect(journal.getByText("Reversed", { exact: true })).toBeVisible();
  await shot(page, info, "5-journal");

  // 5. Delete the reversal: the payment pays the bill again.
  const [, rev] = await cardPayments(s.ids.card);
  expect(rev.reversesId).toBe(pay.id);
  await page.goto(`${base}?entry=${rev.id}`);
  await page
    .getByRole("dialog", { name: "Card payment" })
    .getByRole("button", { name: "Delete" })
    .click();
  await page
    .getByRole("dialog", { name: "Delete this entry?" })
    .getByRole("button", { name: "Delete" })
    .click();
  await page.waitForURL(base);
  await expect(badge).toHaveText("Clear");
  await expect(billRow(page, bill)).toHaveCount(0);
  await expect(moves(page).getByText("Reversed", { exact: true })).toHaveCount(0);
  await expect(moves(page).getByText("Credit", { exact: true })).toBeVisible();
  await shot(page, info, "6-card-after-delete");
});

test("E-CR-034.2 a reversed EMI purchase: no EMI label, no plan, Remaining EMI ৳0", async ({
  page,
}, info) => {
  const s = await seedAccounts({ cardName: "City Visa" });
  const [purchase, lot] = [randomUUID(), randomUUID()];
  await sql`insert into purchases (id, date, source, card_id, emi_months)
    values (${purchase}, ${dhaka()}, 'card', ${s.ids.card}, 3)`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${lot}, ${purchase}, ${s.ids.model}, 1, 9000)`;
  const base = `/cards/${s.ids.card}`;
  await page.goto(base);
  await expect(moves(page)).toContainText("EMI 3 × ৳3,000");
  await expect(page.getByRole("list", { name: "EMI plans" })).toBeVisible();

  await reverse(page, base, purchase, /^Purchase/);
  await page.goto(base);
  await expect(moves(page)).not.toContainText("EMI 3 ×");
  await expect(moves(page).getByText("Reversal of Purchase · Card")).toBeVisible();
  const original = moves(page)
    .getByRole("listitem")
    .filter({ hasText: /^Purchase · Card/ });
  await expect(original).toContainText("Charge");
  await expect(original.getByText("Reversed", { exact: true })).toBeVisible();
  await expect(page.getByText("No EMI plans.")).toBeVisible();
  await expect(page.getByText("No bills yet.")).toBeVisible();
  await expect(page.getByText("Clear", { exact: true }).first()).toBeVisible();
  const facts = page.locator("dl").first();
  await expect(facts).toContainText("Remaining EMI৳0");
  await shot(page, info, "emi-reversed");
});

test("E-CR-034.2 a later-month reversal: last month read as on its end still shows the payment", async ({
  page,
}, info) => {
  const s = await seedAccounts({ cardName: "EBL Visa" });
  const last = addMonths(monthOf(dhaka()), -1);
  // A ৳1,500 fee on the 1st of last month (its bill: statement 5th, due 20th) paid on the 10th.
  await seedMoney({
    type: "card_fee",
    date: `${last}-01`,
    amount: "1500.00",
    card_id: s.ids.card,
    category: "card fee/interest",
    for_month: `${last}-01`,
  });
  const pay = await seedMoney({
    type: "card_payment",
    date: `${last}-10`,
    amount: "1500.00",
    card_id: s.ids.card,
  });
  const base = `/cards/${s.ids.card}`;
  // Last month is open, so the dialog offers the payment's own date; pick today (this month).
  await reverse(page, base, pay, "Card payment", dhaka());
  const [{ date }] = await sql`select date::text from money_entries where reverses_id = ${pay}`;
  expect(date).toBe(dhaka());

  // Today: the pair is gone, the bill is overdue again.
  await page.goto(base);
  await expect(billRow(page, last)).toContainText("Remaining ৳1,500");
  await expect(page.getByText("Overdue", { exact: true }).first()).toBeVisible();
  await shot(page, info, "later-month-now");

  // Last month, as on its last day: the reversal hadn't happened, so the bill read paid.
  const end = `${last}-${String(daysInMonth(last)).padStart(2, "0")}`;
  await page.goto(`${base}?from=${last}-01&to=${end}`);
  await expect(billRow(page, last)).toContainText("Remaining ৳0");
  await expect(billRow(page, last)).toContainText("Paid ৳1,500");
  const lines = statement(page, "Charges and credits");
  await expect(rowsOf(page, lines).filter({ hasText: "Card payment" })).toHaveCount(1);
  await expect(lines).not.toContainText("Reversal of");
  await expect(page.getByLabel("Period totals")).toContainText("Card payments৳1,500");
  await shot(page, info, "later-month-last-month");
});

test("E-CR-034.2 customer, supplier and person statements, PDF, Excel, text and the Cash book", async ({
  page,
}, info) => {
  test.slow();
  const s: Seeded = await seedAccounts();
  // A sale (with its invoice number) to the customer, from a lot bought yesterday.
  const [purchase, lot, sale] = [randomUUID(), randomUUID(), randomUUID()];
  await sql`insert into purchases (id, date, source) values (${purchase}, ${dhaka(-1)}, 'cash')`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${lot}, ${purchase}, ${s.ids.model}, 5, 10000)`;
  await sql`insert into sales (id, date, customer_id, invoice_no)
    values (${sale}, ${dhaka()}, ${s.ids.customer}, nextval('sales_invoice_no_seq'))`;
  await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price)
    values (${sale}, ${lot}, 1, 12000)`;
  const [{ invoice_no: inv }] = await sql`select invoice_no from sales where id = ${sale}`;
  const invoice = `INV-${String(inv).padStart(4, "0")}`;
  const supplierPay = await seedMoney({
    type: "supplier_payment",
    amount: "700.00",
    supplier_id: s.ids.supplier,
    source: "cash",
  });
  const capital = await seedMoney({
    type: "capital_in",
    amount: "900.00",
    person_id: s.ids.person,
  });

  // Customer: Reverse the sale; the statement, PDF, Excel and message name it.
  const customer = `/customers/${s.ids.customer}`;
  await reverse(page, customer, sale, /^Sale/);
  await page.goto(customer);
  await expect(rowsOf(page, statement(page)).filter({ hasText: "Reversal of Sale" })).toHaveCount(
    1,
  );
  await shot(page, info, "customer-statement");
  let sheet = await openStatementSheet(page);
  expect(await excelText(page, sheet)).toContain(`Reversal of Sale ${invoice}`);
  expect(await pdfText(page, sheet)).toContain(`Reversal of Sale ${invoice}`);
  const customerText = await messageText(page, sheet);
  expect(customerText).toContain(`Reversal of Sale ${invoice}`);
  await shot(page, info, "customer-message");
  await page.goto(`${customer}?from=${dhaka().slice(0, 8)}01&to=${dhaka()}`);
  await expect(rowsOf(page, statement(page)).filter({ hasText: "Reversal of Sale" })).toHaveCount(
    1,
  );
  await shot(page, info, "customer-statement-period");

  // Supplier: Reverse the payment.
  const supplier = `/suppliers/${s.ids.supplier}`;
  await reverse(page, supplier, supplierPay, "Supplier payment");
  await page.goto(supplier);
  await expect(
    rowsOf(page, statement(page)).filter({ hasText: "Reversal of Supplier payment" }),
  ).toHaveCount(1);
  await shot(page, info, "supplier-statement");
  sheet = await openStatementSheet(page);
  expect(await excelText(page, sheet)).toContain("Reversal of Supplier payment");
  expect(await pdfText(page, sheet)).toContain("Reversal of Supplier payment");

  // Person: Reverse the capital in; the capital history and the message name it.
  const person = `/people/${s.ids.person}`;
  await reverse(page, person, capital, "Capital in");
  await page.goto(person);
  await expect(
    rowsOf(page, statement(page, "Capital history")).filter({ hasText: "Reversal of Capital in" }),
  ).toHaveCount(1);
  await shot(page, info, "person-statement");
  sheet = await openStatementSheet(page);
  expect(await messageText(page, sheet)).toContain("Reversal of Capital in");
  await shot(page, info, "person-message");

  // The Cash book: each reversal by name, with who.
  await page.goto("/reports/cash");
  const cash = page.locator("main");
  for (const [who, title] of [
    [s.names.supplier, "Reversal of Supplier payment"],
    [s.names.person, "Reversal of Capital in"],
  ])
    await expect(
      rowsOf(page, cash).filter({ hasText: who }).filter({ hasText: title }),
    ).toHaveCount(1);
  await shot(page, info, "cash-book");
});
