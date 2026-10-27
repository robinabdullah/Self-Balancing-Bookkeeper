import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Locator, type Page, expect, request, test } from "@playwright/test";
import { extractText } from "unpdf";
import { goHome, noSideScroll } from "./helpers";
import { dhaka, phone, seedAccounts, seedMoney, sql } from "./seed";

// CR-021 (D-041; UIDD §4.8, §4.15, §4.16): Share PDF of a customer's or supplier's due statement
// from the Report sheet and the send preview; CR-022 (D-042): the invoice and the money receipt
// from a sale's send preview, the cancelled invoice from a reversed sale's entry sheet. On a phone
// (360px, touch) it goes to the share sheet, recorded here; on a computer (1280px) it downloads.
// Synthetic data only.

test.afterEach(async () => {
  await sql`delete from bank_accounts where account_name like 'E2E%'`;
});

test.beforeEach(async ({ page }) => {
  // The phone's share sheet: keep the file it was given.
  await page.addInitScript(() => {
    const w = window as unknown as { sharedPdf: { name: string; bytes: number[] } | null };
    w.sharedPdf = null;
    Object.defineProperty(navigator, "canShare", {
      value: (data: { files?: File[] }) => !!data.files?.length,
    });
    Object.defineProperty(navigator, "share", {
      value: async (data: { files: File[] }) => {
        const file = data.files[0];
        w.sharedPdf = { name: file.name, bytes: [...new Uint8Array(await file.arrayBuffer())] };
      },
    });
  });
  await goHome(page);
});

const actions = (page: Page) => page.getByRole("navigation", { name: "Quick actions" });
async function openStatement(page: Page) {
  await actions(page).getByRole("button", { name: "More" }).click();
  await page
    .getByRole("dialog", { name: "More actions" })
    .getByRole("link", { name: "Statement" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Statement" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Taps Share PDF and returns the PDF's file name and text: shared on a phone, downloaded on a
 * computer. */
async function sharePdf(page: Page, button: Locator) {
  let name: string;
  let bytes: Uint8Array;
  if (phone(page)) {
    await page.evaluate(() => ((window as unknown as { sharedPdf: null }).sharedPdf = null));
    await button.click();
    const handle = await page.waitForFunction(
      () => (window as unknown as { sharedPdf: unknown }).sharedPdf,
    );
    const shared = (await handle.jsonValue()) as { name: string; bytes: number[] };
    [name, bytes] = [shared.name, new Uint8Array(shared.bytes)];
  } else {
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    [name, bytes] = [
      download.suggestedFilename(),
      new Uint8Array(await readFile(await download.path())),
    ];
  }
  await expect(button).toHaveText("Share PDF");
  return { name, text: (await extractText(bytes, { mergePages: true })).text };
}

test("E-CR-021.1 Report sheet → Share PDF: the customer's due statement with the right totals; How to pay", async ({
  page,
}) => {
  test.slow();
  const s = await seedAccounts();
  await sql`insert into bank_accounts (bank_name, account_name, account_number, note)
    values ('E2E Bank', 'E2E Pay', '5566778899', 'E2E partners only')`;
  // Before this month: the opening ৳10,000. This month: +৳5,000 and −৳2,000 → ৳13,000.
  await seedMoney({
    type: "customer_cash_given",
    amount: "10000",
    customer_id: s.ids.customer,
    date: dhaka(-40),
  });
  await seedMoney({ type: "customer_cash_given", amount: "5000", customer_id: s.ids.customer });
  await seedMoney({ type: "customer_payment", amount: "2000", customer_id: s.ids.customer });
  await page.goto(`/customers/${s.ids.customer}`);

  const sheet = await openStatement(page);
  const share = sheet.getByRole("button", { name: "Share PDF" });
  const pdf = await sharePdf(page, share);
  expect(pdf.name).toMatch(/-statement-e2e-shop-.+-owner-\d{4}-\d\d-01-to-\d{4}-\d\d-\d\d\.pdf$/);
  expect(pdf.text).toContain("Statement of account");
  expect(pdf.text).toContain(s.names.customer);
  expect(pdf.text).toContain("Opening balance");
  expect(pdf.text).toContain("৳10,000");
  expect(pdf.text).toContain("Please pay ৳13,000");
  expect(pdf.text).not.toContain("How to pay");

  // How to pay: off by default; on, the account is picked (or tapped) and printed, without its note.
  const howToPay = sheet.getByRole("switch", { name: "Add How to pay" });
  await expect(howToPay).not.toBeChecked();
  await howToPay.check();
  const chip = sheet.getByRole("button", { name: "E2E Bank · 5566778899" });
  if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
  const paid = await sharePdf(page, share);
  expect(paid.text).toContain("How to pay");
  expect(paid.text).toContain("5566778899");
  expect(paid.text).not.toContain("E2E partners only");
  await noSideScroll(page);
});

test("E-CR-021.2 the statement's send preview → Share PDF; a supplier's PDF; a card's own; partner-only", async ({
  page,
  baseURL,
}) => {
  test.slow();
  const s = await seedAccounts();
  await seedMoney({ type: "customer_cash_given", amount: "7000", customer_id: s.ids.customer });
  await page.goto(`/customers/${s.ids.customer}`);
  await (await openStatement(page)).getByRole("link", { name: "WhatsApp message" }).click();
  const preview = page.getByRole("dialog", { name: "Send on WhatsApp" });
  const fromPreview = await sharePdf(page, preview.getByRole("button", { name: "Share PDF" }));
  expect(fromPreview.text).toContain("Please pay ৳7,000");

  // A supplier: what we owe them, and no How to pay.
  const purchaseId = randomUUID();
  await sql`insert into purchases (id, date, source, supplier_id)
    values (${purchaseId}, ${dhaka()}, 'supplier_credit', ${s.ids.supplier})`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${randomUUID()}, ${purchaseId}, ${s.ids.model}, 2, 7000)`;
  await page.goto(`/suppliers/${s.ids.supplier}`);
  const supplierSheet = await openStatement(page);
  await expect(supplierSheet.getByRole("switch", { name: "Add How to pay" })).toHaveCount(0);
  const supplier = await sharePdf(page, supplierSheet.getByRole("button", { name: "Share PDF" }));
  expect(supplier.text).toContain("Balance due to you: ৳14,000");

  // A card's Report sheet has no due statement or How to pay; D-045 gives it its own card
  // statement PDF (one Share PDF, E-CR-025.2).
  await page.goto(`/cards/${s.ids.card}`);
  const cardSheet = await openStatement(page);
  await expect(cardSheet.getByRole("link", { name: "View on screen" })).toBeVisible();
  await expect(cardSheet.getByRole("button", { name: "Share PDF" })).toHaveCount(1);
  await expect(cardSheet.getByRole("switch", { name: "Add How to pay" })).toHaveCount(0);

  // Signed out, the PDF route sends you to the login page.
  const anon = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const res = await anon.get(
    `/pdf/statement?kind=customer&id=${s.ids.customer}&from=${dhaka(-1)}&to=${dhaka()}`,
    { maxRedirects: 0 },
  );
  expect(res.status()).toBe(307);
  expect(res.headers().location).toMatch(/\/login$/);
  await anon.dispose();
});

/** A lot of 5 at ৳10,000 cost, bought yesterday. */
async function seedLot(model: string) {
  const [purchaseId, lotId] = [randomUUID(), randomUUID()];
  await sql`insert into purchases (id, date, source) values (${purchaseId}, ${dhaka(-1)}, 'cash')`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${lotId}, ${purchaseId}, ${model}, 5, 10000)`;
  return lotId;
}
const label = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, "0")}`;

test("E-CR-022.1 a sale's toast Send ▸ → Share PDF: the invoice, its Received now receipt; the numbers shown", async ({
  page,
}) => {
  test.slow();
  const s = await seedAccounts();
  await seedLot(s.ids.model);
  const base = `/customers/${s.ids.customer}`;
  await page.goto(base);
  await actions(page).getByRole("link", { name: "Sale" }).click();
  await page.getByRole("button", { name: "Model (line 1)" }).click();
  await page
    .getByRole("option", { name: new RegExp(`^${s.names.model} · \\d+ in stock$`) })
    .click();
  await page.getByRole("textbox", { name: "Qty" }).fill("2");
  await page.getByRole("textbox", { name: "Unit price" }).fill("15,000");
  await page.getByRole("textbox", { name: "Received now" }).fill("5,000");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(base);
  const [sale] = await sql`select id, invoice_no from sales where customer_id = ${s.ids.customer}`;
  const [pay] = await sql`select id, receipt_no from money_entries
    where customer_id = ${s.ids.customer} and type = 'customer_payment'`;
  const [inv, mr] = [label("INV", sale.invoice_no), label("MR", pay.receipt_no)];

  // The toast's Send ▸ → the preview → Share PDF: the invoice.
  await page.getByRole("status").getByRole("link", { name: "Send ▸" }).click();
  const preview = page.getByRole("dialog", { name: "Send on WhatsApp" });
  const invoice = await sharePdf(page, preview.getByRole("button", { name: "Share PDF" }));
  expect(invoice.name).toMatch(new RegExp(`-invoice-${inv.toLowerCase()}\\.pdf$`));
  expect(invoice.text).toContain(`Invoice ${inv}`);
  expect(invoice.text).toContain(s.names.customer);
  expect(invoice.text).toContain("৳30,000");
  expect(invoice.text).toContain("Paid now");
  expect(invoice.text).toContain("Taka Thirty Thousand Only");
  expect(invoice.text).toContain("PARTLY PAID");
  expect(invoice.text).toMatch(/Current due\s*৳25,000/);
  // The cost (৳10,000 each, ৳20,000) and the profit (৳10,000) never appear.
  expect(invoice.text).not.toContain("৳10,000");
  expect(invoice.text).not.toContain("৳20,000");

  // The Received now payment's money receipt.
  await page.goto(`${base}?send=${pay.id}`);
  const receipt = await sharePdf(page, preview.getByRole("button", { name: "Share PDF" }));
  expect(receipt.name).toMatch(new RegExp(`-receipt-${mr.toLowerCase()}\\.pdf$`));
  expect(receipt.text).toContain(`Money receipt ${mr}`);
  expect(receipt.text).toContain("Received with thanks from");
  expect(receipt.text).toContain("Taka Five Thousand Only");
  // Its ruled sum shows the bill, so it adds up: ৳0 + ৳30,000 − ৳5,000 = ৳25,000.
  expect(receipt.text).toMatch(new RegExp(`Bill ${inv}\\s*\\+৳30,000`));
  expect(receipt.text).toMatch(/Due now\s*৳25,000/);
  expect(receipt.text).toContain("Cleared 16% of the due");

  // The numbers: the Bills tab, the Journal row and the entry sheet's title.
  await page.goto(`${base}?tab=bills`);
  await expect(page.getByRole("list", { name: "Bills" })).toContainText(inv);
  await page.goto("/journal");
  await expect(page.getByRole("link", { name: new RegExp(`Sale ${inv}`) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`Payment in ${mr}`) })).toBeVisible();
  await page.goto(`/journal?entry=${sale.id}`);
  await expect(page.getByRole("heading", { name: `Sale ${inv}` })).toBeVisible();
  await noSideScroll(page);
});

test("E-CR-022.2 a reversed sale: no Send ▸, Share PDF in its entry sheet prints CANCELLED", async ({
  page,
}) => {
  test.slow();
  const s = await seedAccounts();
  const lotId = await seedLot(s.ids.model);
  const [saleId, reversalId] = [randomUUID(), randomUUID()];
  const [{ n }] = await sql`select nextval('sales_invoice_no_seq')::int as n`;
  await sql`insert into sales (id, date, customer_id, invoice_no)
    values (${saleId}, ${dhaka()}, ${s.ids.customer}, ${n})`;
  await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price) values (${saleId}, ${lotId}, 1, 12000)`;
  await sql`insert into sales (id, date, customer_id, reverses_id)
    values (${reversalId}, ${dhaka()}, ${s.ids.customer}, ${saleId})`;
  await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price)
    values (${reversalId}, ${lotId}, 1, 12000)`;

  await page.goto(`/customers/${s.ids.customer}?entry=${saleId}`);
  const sheet = page.getByRole("dialog", { name: `Sale ${label("INV", n)}` });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Send ▸" })).toHaveCount(0);
  const pdf = await sharePdf(page, sheet.getByRole("button", { name: "Share PDF" }));
  expect(pdf.text).toContain(`Invoice ${label("INV", n)}`);
  expect(pdf.text).toContain("CANCELLED");
  expect(pdf.text).toContain("Reversed on");
  expect(pdf.text).toContain("৳12,000");
  expect(pdf.text).not.toContain("Current due");

  // The reversal itself has neither.
  await page.goto(`/customers/${s.ids.customer}?entry=${reversalId}`);
  await expect(page.getByRole("dialog", { name: "Sale" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share PDF" })).toHaveCount(0);
});

// CR-029 (D-049; UIDD §4.13, §4.16): each document prints only its own terms, then the footer line.
test("E-CR-029.1 Settings → Business → PDF terms: each PDF shows its own terms", async ({
  page,
}) => {
  test.slow();
  const [seeded] = await sql`select invoice_terms, receipt_terms, statement_terms, footer
    from business_profile`;
  try {
    await page.goto("/settings");
    await page.getByRole("button", { name: /^PDF terms/ }).click();
    const sheet = page.getByRole("dialog", { name: "PDF terms" });
    const typed = {
      "Invoice terms": "E2E 7-day replacement\nE2E box intact",
      "Receipt terms": "E2E cheques clear later",
      "Statement terms": "E2E report differences in 7 days",
      "Footer line": "E2E thank you",
    };
    for (const [label, value] of Object.entries(typed)) await sheet.getByLabel(label).fill(value);
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(sheet).toBeHidden();
    // Reopened, the sheet shows what was saved (the lines kept).
    await page.getByRole("button", { name: /^PDF terms/ }).click();
    await expect(sheet.getByLabel("Invoice terms")).toHaveValue(typed["Invoice terms"]);
    await expect(sheet.getByLabel("Footer line")).toHaveValue(typed["Footer line"]);
    await sheet.getByRole("button", { name: "Cancel" }).click();
    // Details no longer has them.
    await page.getByRole("button", { name: /^Details/ }).click();
    const details = page.getByRole("dialog", { name: "Business details" });
    await expect(details.getByLabel("Name", { exact: true })).toBeVisible();
    await expect(details.getByLabel("Invoice terms")).toHaveCount(0);
    await details.getByRole("button", { name: "Cancel" }).click();

    // A sale and a payment of a fresh customer; each PDF read as the partner.
    const s = await seedAccounts();
    const lotId = await seedLot(s.ids.model);
    const saleId = randomUUID();
    await sql`insert into sales (id, date, customer_id, invoice_no)
      values (${saleId}, ${dhaka()}, ${s.ids.customer}, nextval('sales_invoice_no_seq'))`;
    await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price)
      values (${saleId}, ${lotId}, 1, 12000)`;
    const pay = await seedMoney({
      type: "customer_payment",
      amount: "2000",
      customer_id: s.ids.customer,
    });
    await sql`update money_entries set receipt_no = nextval('money_entries_receipt_no_seq')
      where id = ${pay}`;
    const read = async (href: string) => {
      const res = await page.request.get(href);
      expect(res.status(), href).toBe(200);
      return (await extractText(new Uint8Array(await res.body()), { mergePages: true })).text;
    };
    const range = `from=${dhaka(-1)}&to=${dhaka()}`;
    const pdfs = {
      invoice: await read(`/pdf/invoice?id=${saleId}`),
      receipt: await read(`/pdf/receipt?id=${pay}`),
      statement: await read(`/pdf/statement?kind=customer&id=${s.ids.customer}&${range}`),
      supplier: await read(`/pdf/statement?kind=supplier&id=${s.ids.supplier}&${range}`),
    };
    const own = {
      invoice: ["E2E 7-day replacement", "E2E box intact"],
      receipt: ["E2E cheques clear later"],
      statement: ["E2E report differences in 7 days"],
      supplier: ["E2E report differences in 7 days"],
    };
    const every = Object.values(own).flat();
    for (const [doc, text] of Object.entries(pdfs)) {
      const mine = own[doc as keyof typeof own];
      for (const line of every)
        if (mine.includes(line)) expect(text, doc).toContain(line);
        else expect(text, doc).not.toContain(line);
      expect(text, doc).toContain("E2E thank you");
    }
    // D-050: under "Terms & conditions", numbered, then the footer line apart.
    expect(pdfs.invoice).toMatch(
      /Terms & conditions\s*1\.\s*E2E 7-day replacement\s*2\.\s*E2E box intact\s*E2E thank you/,
    );
    expect(pdfs.receipt).toMatch(/Terms & conditions\s*1\.\s*E2E cheques clear later/);
  } finally {
    await sql`update business_profile set invoice_terms = ${seeded.invoice_terms},
      receipt_terms = ${seeded.receipt_terms}, statement_terms = ${seeded.statement_terms},
      footer = ${seeded.footer}`;
  }
});

// CR-030 (D-053): a toast from inside a sheet is drawn above it.
/** True when the topmost element at the middle of `box` is inside it (nothing drawn over it). */
const onTop = (box: Locator) =>
  box.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });

test("E-CR-030.2 a failed Share PDF shows its toast above the Report sheet", async ({ page }) => {
  const s = await seedAccounts();
  await page.route("**/pdf/**", (route) => route.fulfill({ status: 500, body: "" }));
  await page.goto(`/cards/${s.ids.card}`);
  const sheet = await openStatement(page);
  await sheet.getByRole("button", { name: "Share PDF" }).click();
  const toast = page.getByRole("status").filter({ hasText: "Couldn't make the PDF" });
  await expect(toast).toBeVisible();
  expect(await onTop(toast.getByText("Couldn't make the PDF"))).toBe(true);
  await expect(sheet).toBeVisible(); // the sheet stays open under it
});
