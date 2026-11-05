import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { extractText } from "unpdf";
import { goHome, noSideScroll } from "./helpers";
import { excelText, pdfText } from "./report-files";
import { dhaka, phone, seedAccounts, seedMoney, sql } from "./seed";

// CR-023 (D-043; UIDD §3, §4.2, §4.17): Reports in More / the sidebar, the Cash book (Home's
// Cash tile, the day stepper, the entry sheet in place, Count cash, the day book message) and the
// Sales report (totals, by model / customer, Share PDF, Download Excel). Other specs save cash
// moves today too, so each test finds its own rows by their unique names. Synthetic data only.

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
/** "11 Oct 2026", as the app writes a date. */
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
/** The Cash book day's list (phone) or table (desktop). */
const day = (page: Page, iso: string) =>
  page.getByRole(phone(page) ? "list" : "table", { name: `Cash book ${longDate(iso)}` });
const rowOf = (page: Page, scope: Locator, text: string) =>
  scope.getByRole(phone(page) ? "listitem" : "row").filter({ hasText: text });

test.beforeEach(async ({ page }) => {
  // The phone's share sheet: keep the file it was given (as pdf.spec does).
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

test("E-CR-023.1 More / the sidebar → Reports: Charts · Cash book · Sales · Expenses · Monthly pack · Investor · Backup", async ({
  page,
}) => {
  if (phone(page)) {
    await nav(page).getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Reports" }).click();
  } else {
    await nav(page).getByRole("link", { name: "Reports" }).click();
  }
  await page.waitForURL("/reports");
  const list = page.getByRole("list", { name: "Reports" });
  await expect(list.getByRole("link")).toHaveText([
    /^Charts/, // D-064
    /^Cash book/,
    /^Sales report/,
    /^Expense statement/, // D-075
    /^Monthly pack/,
    /^Investor report/,
    /^Backup all data \(\.xlsx\)/,
  ]);
  await list.getByRole("link", { name: /^Backup all data/ }).click();
  await page.waitForURL("/export");
  await expect(page.getByRole("button", { name: "Download all data (.xlsx)" })).toBeVisible();
  // Export lives under Reports: More (phone) / Reports (sidebar) stays highlighted.
  if (phone(page))
    await expect(nav(page).getByRole("button", { name: "More" })).toHaveClass(/text-foreground/);
  else
    await expect(nav(page).getByRole("link", { name: "Reports" })).toHaveAttribute(
      "aria-current",
      "page",
    );
});

test("E-CR-023.2 Cash tile → Cash book: today, the stepper, the entry in place, Count cash, the day book", async ({
  page,
}) => {
  test.slow();
  const s = await seedAccounts();
  await seedMoney({ type: "customer_payment", amount: "1234", customer_id: s.ids.customer });
  await seedMoney({
    type: "customer_payment",
    amount: "777",
    customer_id: s.ids.customer,
    date: dhaka(-1),
  });
  await page.goto("/");
  await page
    .getByRole("region", { name: "Summary" })
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: "Cash", exact: true }) })
    .click();
  await page.waitForURL("/reports/cash");
  await expect(page.getByRole("heading", { name: "Cash book", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: `Today · ${longDate(dhaka())}` })).toBeVisible();

  // Today's row (In ৳1,234, who = the customer) opens the entry sheet in place.
  const today = day(page, dhaka());
  const row = rowOf(page, today, s.names.customer);
  await expect(row).toContainText("৳1,234");
  await row.getByRole("link").click();
  const entry = page.getByRole("dialog", { name: "Payment in" });
  await expect(entry).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(entry).toBeHidden();
  await expect(page).toHaveURL(/\/reports\/cash$/);

  // Count cash: the closing amount matches; ৳100 less is short by ৳100.
  const closing = (await rowOf(page, today, "Closing").textContent())!.replace(/^Closing/, "");
  await page.getByRole("button", { name: "Count cash" }).click();
  const count = page.getByRole("region", { name: "Cash count" });
  const counted = count.getByLabel("Counted cash");
  await counted.fill(closing.replace("৳", ""));
  await expect(count).toContainText("Matches ✓");
  const taka = Number(closing.replace(/[৳,]/g, ""));
  await counted.fill(String(taka - 100));
  await expect(count).toContainText("Short by ৳100");
  await counted.fill(String(taka + 50));
  await expect(count).toContainText("Over by ৳50");

  // The stepper: yesterday has the ৳777 payment and no Count cash; › comes back to today.
  await page.getByRole("link", { name: "Previous day" }).click();
  await expect(page.getByRole("heading", { name: longDate(dhaka(-1)), exact: true })).toBeVisible();
  await expect(rowOf(page, day(page, dhaka(-1)), s.names.customer)).toContainText("৳777");
  await expect(page.getByRole("button", { name: "Count cash" })).toHaveCount(0);
  await page.getByRole("link", { name: "Next day" }).click();
  await expect(page.getByRole("heading", { name: `Today · ${longDate(dhaka())}` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next day" })).toHaveCount(0);

  // ⤴ Share → the day on screen (picked) → WhatsApp message: the day book, Copy · Share only.
  await page.getByRole("link", { name: "Share" }).click();
  const sheet = page.getByRole("dialog", { name: "Cash book" });
  await expect(sheet.getByRole("button", { name: longDate(dhaka()) })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await sheet.getByRole("link", { name: "WhatsApp message" }).click();
  const send = page.getByRole("dialog", { name: "Send on WhatsApp" });
  const message = send.getByLabel("Message");
  await expect(message).toHaveValue(new RegExp(`^💵 \\*Cash book — ${longDate(dhaka())}\\*`));
  await expect(message).toHaveValue(
    new RegExp(`- In: Payment in ${s.names.customer.replace(/[()]/g, "\\$&")} ৳1,234`),
  );
  await expect(send.getByLabel("Greeting")).toHaveCount(0);
  await expect(send.getByText("To:")).toHaveCount(0);
  await expect(send.getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(send.getByRole("button", { name: "Share", exact: true })).toBeVisible();

  await noSideScroll(page);
});

test("E-CR-023.3 Sales report: by model and by customer; Share PDF; Download Excel", async ({
  page,
}) => {
  test.slow();
  const s = await seedAccounts();
  const [purchase, lot, sale] = [randomUUID(), randomUUID(), randomUUID()];
  await sql`insert into purchases (id, date, source, supplier_id)
    values (${purchase}, ${dhaka()}, 'supplier_credit', ${s.ids.supplier})`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${lot}, ${purchase}, ${s.ids.model}, 5, 10000)`;
  await sql`insert into sales (id, date, customer_id) values (${sale}, ${dhaka()}, ${s.ids.customer})`;
  await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price) values (${sale}, ${lot}, 2, 15432)`;

  await page.goto("/reports");
  await page.getByRole("link", { name: /^Sales report/ }).click();
  await page.waitForURL("/reports/sales");
  await expect(page.getByText(/^This month · /)).toBeVisible();
  const scope = (title: string) =>
    page.getByRole("region", { name: title }).getByRole(phone(page) ? "list" : "table");
  // 2 pcs at ৳15,432 on a ৳10,000 cost: sales ৳30,864, profit ৳10,864.
  for (const [title, name] of [
    ["By model", s.names.model],
    ["By customer", s.names.customer],
  ]) {
    const row = rowOf(page, scope(title), name);
    await expect(row).toContainText("৳30,864");
    await expect(row).toContainText("৳10,864");
  }

  await page.getByRole("link", { name: "Share" }).click();
  const sheet = page.getByRole("dialog", { name: "Sales report" });
  await expect(sheet.getByRole("button", { name: "This month" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Share PDF: the phone's share sheet, else a download.
  const share = sheet.getByRole("button", { name: "Share PDF" });
  let bytes: Uint8Array;
  if (phone(page)) {
    await share.click();
    const handle = await page.waitForFunction(
      () => (window as unknown as { sharedPdf: unknown }).sharedPdf,
    );
    bytes = new Uint8Array(((await handle.jsonValue()) as { bytes: number[] }).bytes);
  } else {
    const [download] = await Promise.all([page.waitForEvent("download"), share.click()]);
    expect(download.suggestedFilename()).toMatch(/-sales-\d{4}-\d\d-01-to-\d{4}-\d\d-\d\d\.pdf$/);
    bytes = new Uint8Array(await readFile(await download.path()));
  }
  const pdf = (await extractText(bytes, { mergePages: true })).text;
  expect(pdf).toContain("Sales report");
  expect(pdf).toContain(s.names.model);
  expect(pdf).toContain("৳30,864");

  const [excel] = await Promise.all([
    page.waitForEvent("download"),
    sheet.getByRole("link", { name: "Download Excel" }).click(),
  ]);
  expect(excel.suggestedFilename()).toMatch(/-sales-\d{4}-\d\d-01-to-\d{4}-\d\d-\d\d\.xlsx$/);

  await noSideScroll(page);
});

// CR-033 (D-056): the Avg unit price in By model (Sales report, a customer's statement, the PDF).
test("E-CR-033.3 Avg unit price: Sales report and a customer's By model; the PDF", async ({
  page,
}) => {
  test.slow();
  const s = await seedAccounts();
  const [purchase, lot, sale, line, ret] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  const [other, otherLot, otherModel] = [randomUUID(), randomUUID(), `${s.names.model} B`];
  await sql`insert into models (id, name) values (${other}, ${otherModel})`;
  await sql`insert into purchases (id, date, source, supplier_id)
    values (${purchase}, ${dhaka()}, 'supplier_credit', ${s.ids.supplier})`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost) values
    (${lot}, ${purchase}, ${s.ids.model}, 5, 10000), (${otherLot}, ${purchase}, ${other}, 5, 10000)`;
  await sql`insert into sales (id, date, customer_id) values (${sale}, ${dhaka()}, ${s.ids.customer})`;
  await sql`insert into sale_lines (id, sale_id, lot_id, qty, unit_price) values
    (${line}, ${sale}, ${lot}, 3, 15700), (${randomUUID()}, ${sale}, ${otherLot}, 2, 15432)`;
  // One of the first model comes back at a lower refund: the average stays at the price sold.
  await sql`insert into returns (id, kind, date, customer_id)
    values (${ret}, 'customer', ${dhaka()}, ${s.ids.customer})`;
  await sql`insert into return_lines (return_id, sale_line_id, lot_id, qty, unit_amount)
    values (${ret}, ${line}, ${lot}, 1, 15000)`;

  await page.goto("/reports/sales");
  const byModel = page.getByRole("region", { name: "By model" });
  if (phone(page)) {
    const rows = byModel.getByRole("list").getByRole("listitem");
    await expect(rows.filter({ hasText: s.names.model }).first()).toContainText(
      "2 pcs · avg ৳15,700",
    );
    await expect(rows.filter({ hasText: otherModel })).toContainText("2 pcs × ৳15,432");
  } else {
    const table = byModel.getByRole("table");
    await expect(table.getByRole("columnheader")).toHaveText([
      "Model",
      "Pieces",
      "Avg unit price",
      "Sales",
      "Profit",
    ]);
    const row = table.getByRole("row").filter({ hasText: otherModel });
    await expect(row.getByRole("cell")).toHaveText([
      otherModel,
      "2",
      "৳15,432",
      "৳30,864",
      "৳10,864",
    ]);
    await expect(
      page.getByRole("region", { name: "By customer" }).getByRole("columnheader"),
    ).toHaveText(["Customer", "Pieces", "Sales", "Profit"]);
  }
  await noSideScroll(page);

  // The PDF has the column (a download, or the phone's share sheet: read it from the route).
  const res = await page.request.get(`/pdf/sales?from=${dhaka().slice(0, 7)}-01&to=${dhaka()}`);
  expect(res.status()).toBe(200);
  const pdf = (await extractText(new Uint8Array(await res.body()), { mergePages: true })).text;
  expect(pdf).toContain("Avg unit price");
  expect(pdf).toContain("৳15,432");

  // A customer's statement By model: the column on desktop, the phrase under the model on a phone.
  await page.goto(`/customers/${s.ids.customer}?from=${dhaka().slice(0, 7)}-01&to=${dhaka()}`);
  const table = page.getByRole("table", { name: "Sales by model" });
  const row = table.getByRole("row").filter({ hasText: s.names.model }).first();
  if (phone(page)) await expect(row).toContainText("2 pcs · avg ৳15,700");
  else {
    await expect(table.getByRole("columnheader")).toHaveText([
      "Model",
      "Pieces",
      "Avg unit price",
      "Amount",
    ]);
    await expect(row).toContainText("৳15,700");
  }
  await noSideScroll(page);
});

// CR-052 (D-075, D-080): the Expense statement. Its own old months (Jun 2023 and May 2023, which no
// other spec uses), cleared before and after, so each run's figures are its own. Amounts in SQL are taka.
const JUN = { from: "2023-06-01", to: "2023-06-30" };
/** Removes those months' rows (they would make May 2023 the next month to close for later specs). */
async function clearCosts() {
  const within = sql`date between '2023-05-01' and '2023-06-30'`;
  await sql`delete from money_entries where ${within} and reverses_id is not null`;
  await sql`delete from money_entries where ${within}`;
}
async function seedCosts() {
  const s = await seedAccounts();
  await clearCosts();
  const rent = await seedMoney({
    type: "expense",
    date: "2023-06-05",
    amount: "20000",
    category: "rent",
    source: "cash",
    note: "Shop rent",
  });
  await seedMoney({
    type: "expense",
    date: "2023-06-02",
    amount: "30000",
    category: "salary",
    source: "cash",
    for_month: "2023-05-01",
  });
  await seedMoney({
    type: "card_fee",
    date: "2023-06-12",
    amount: "1500",
    category: "card fee/interest",
    card_id: s.ids.card,
  });
  await seedMoney({
    type: "expense",
    date: "2023-05-20",
    amount: "500",
    category: "delivery",
    source: "cash",
  });
  return { ...s, rent };
}

test("E-CR-052.1 Expense statement: total, categories, the filter and its outputs, the stepper", async ({
  page,
}) => {
  test.slow();
  await seedCosts();
  await page.goto("/reports");
  await page.getByRole("link", { name: /^Expense statement/ }).click();
  await page.waitForURL("/reports/expenses");
  await expect(page.getByRole("heading", { name: /^This month · / })).toBeVisible();

  await page.goto(`/reports/expenses?from=${JUN.from}&to=${JUN.to}`);
  await expect(page.getByRole("heading", { name: "Jun 2023", exact: true })).toBeVisible();
  const total = page.getByRole("region", { name: "Total spent" });
  await expect(total).toContainText("৳51,500");
  await expect(total).toContainText("3 entries · Cash ৳50,000 · Cards ৳1,500");
  const categories = page.getByRole("list", { name: "By category" }).getByRole("link");
  await expect(categories).toHaveText([
    /^Salary৳30,000.*58\.3%$/,
    /^Rent৳20,000.*38\.8%$/,
    /^Card fees৳1,500.*2\.9%$/,
  ]);
  const entries = page.getByRole(phone(page) ? "list" : "table", { name: "Entries" });
  await expect(entries).toContainText("for May 2023");
  await expect(page.getByText(/^Profit counts an expense in its For month/)).toBeVisible();

  // A row opens the entry sheet in place.
  await rowOf(page, entries, "Shop rent").getByRole("link").click();
  const entry = page.getByRole("dialog", { name: "Expense" });
  await expect(entry).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(entry).toBeHidden();

  // Rent only: its total and entries, a chip that clears it.
  await categories.filter({ hasText: "Rent" }).click();
  await page.waitForURL(/cat=rent/);
  await expect(total).toContainText("৳20,000");
  await expect(total).toContainText("1 entry · Cash ৳20,000");
  await expect(categories).toHaveText([/^Rent৳20,000.*100%$/]);
  await expect(entries).not.toContainText("Salary");
  await expect(page.getByText(/^Profit counts an expense/)).toHaveCount(0);

  // ⤴ Share: the month on screen is picked; the PDF and the Excel hold Rent only.
  await page.getByRole("link", { name: "Share" }).click();
  const sheet = page.getByRole("dialog", { name: "Expense statement · Rent" });
  await expect(sheet.getByRole("button", { name: "Jun 2023" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const pdf = await pdfText(page, sheet);
  expect(pdf).toContain("Expense statement · Rent");
  expect(pdf).toContain("৳20,000");
  expect(pdf).not.toContain("Salary");
  const excel = await excelText(page, sheet);
  expect(excel).toContain("Rent");
  expect(excel).toContain("Shop rent");
  expect(excel).not.toContain("Salary");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole("link", { name: "Show every category" }).click();
  await expect(total).toContainText("৳51,500");

  // ‹ steps to May 2023: the delivery.
  await page.getByRole("link", { name: "Previous month" }).click();
  await expect(page.getByRole("heading", { name: "May 2023", exact: true })).toBeVisible();
  await expect(total).toContainText("৳500");
  await expect(entries).toContainText("Delivery");
  // D-080: May's profit also counts June's salary (for May): the note names it and opens it.
  await expect(total).toContainText(
    "May 2023's profit also counts ৳30,000 dated in another month:",
  );
  await page
    .getByRole("list", { name: "Dated in another month" })
    .getByRole("link", { name: /^Salary · 02 Jun 2023/ })
    .click();
  await expect(page.getByRole("dialog", { name: "Expense" })).toBeVisible();
  await page.keyboard.press("Escape");

  await noSideScroll(page);
  await clearCosts();
});
