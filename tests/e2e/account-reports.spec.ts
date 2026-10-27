import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { extractText } from "unpdf";
import { goHome, noSideScroll } from "./helpers";
import { dhaka, phone, seedAccounts, seedMoney, sql } from "./seed";

// CR-025 (D-045; UIDD §4.8, §4.9, §4.17): the Investor report (the list, a person's report, the
// Report sheet in whole months, the message to the person, PDF, Excel; ⋯ on the person's page),
// the card and customer statements' additions, and the Monthly pack (Reports, Months ⤴, PDF,
// Excel). At 360px and 1280px. Synthetic data only.

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
/** "2026-10" → "Oct 2026", as the app writes a month. */
const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const thisMonth = dhaka().slice(0, 7);

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

/** Share PDF in a sheet: the phone's share sheet, else a download; the PDF's text. */
async function sharedPdf(page: Page, sheet: Locator, name: RegExp) {
  const share = sheet.getByRole("button", { name: "Share PDF" });
  let bytes: Uint8Array;
  if (phone(page)) {
    await share.click();
    const handle = await page.waitForFunction(
      () => (window as unknown as { sharedPdf: unknown }).sharedPdf,
    );
    const shared = (await handle.jsonValue()) as { name: string; bytes: number[] };
    expect(shared.name).toMatch(name);
    bytes = new Uint8Array(shared.bytes);
  } else {
    const [download] = await Promise.all([page.waitForEvent("download"), share.click()]);
    expect(download.suggestedFilename()).toMatch(name);
    bytes = new Uint8Array(await readFile(await download.path()));
  }
  return (await extractText(bytes, { mergePages: true })).text;
}

async function excel(page: Page, sheet: Locator, name: RegExp) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    sheet.getByRole("link", { name: "Download Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(name);
}

test("E-CR-025.1 Investor report: the list, a person's report, the sheet, message, PDF, Excel", async ({
  page,
}) => {
  test.slow();
  const s = await seedAccounts();
  await seedMoney({ type: "capital_in", amount: "12345", person_id: s.ids.person });
  await seedMoney({ type: "card_payment", amount: "321", card_id: s.ids.card });

  await page.goto("/reports");
  await page.getByRole("link", { name: /^Investor report/ }).click();
  await page.waitForURL("/reports/investor");
  await page
    .getByRole(phone(page) ? "list" : "table", { name: "Investors and partners" })
    .getByRole("link", { name: new RegExp(s.names.person) })
    .click();
  await page.waitForURL(new RegExp(`/reports/investor\\?person=${s.ids.person}`));
  await expect(
    page.getByRole("heading", { name: `Investor report — ${s.names.person}`, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(`This month · ${monthName(thisMonth)}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Capital" })).toContainText("৳12,345");
  const cards = page.getByRole("region", { name: "Card investment" });
  await expect(cards).toContainText(s.names.card);
  await expect(cards).toContainText(`Card payments made in ${monthName(thisMonth)}৳321`);
  await expect(page.getByRole("region", { name: "Allocations" })).toContainText(
    "not allocated yet",
  );
  await expect(page.getByRole("region", { name: "Profit owed" })).toContainText("Profit owed now");

  // ⤴ Share: whole months only (Custom = From month / To month).
  await page.getByRole("link", { name: "Share" }).click();
  const sheet = page.getByRole("dialog", { name: "Investor report" });
  await expect(sheet.getByRole("button", { name: "This month" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await sheet.getByRole("button", { name: "Custom" }).click();
  await expect(sheet.getByLabel("From month")).toHaveValue(thisMonth);
  await expect(sheet.getByLabel("To month")).toHaveValue(thisMonth);
  await sheet.getByRole("button", { name: "This month" }).click();

  const pdf = await sharedPdf(page, sheet, /-investor-report-.*\.pdf$/);
  expect(pdf).toContain("Investor report");
  expect(pdf).toContain(s.names.person);
  expect(pdf).toContain("৳12,345");
  await excel(page, sheet, /-investor-report-\d{4}-\d\d-01-to-\d{4}-\d\d-\d\d\.xlsx$/);

  // The message goes to the person (To, Greeting) through the send preview.
  await sheet.getByRole("link", { name: "WhatsApp message" }).click();
  const send = page.getByRole("dialog", { name: "Send on WhatsApp" });
  await expect(send.getByText("To:")).toBeVisible();
  await expect(send).toContainText(s.names.person);
  await expect(send.getByLabel("Message")).toHaveValue(
    new RegExp(`\\*Investor report — ${s.names.person}\\*`),
  );
  await noSideScroll(page);

  // The person's page: ⋯ → Reports & share → Investor report.
  await page.goto(`/people/${s.ids.person}`);
  await page
    .getByRole("navigation", { name: "Quick actions" })
    .getByRole("button", { name: "More" })
    .click();
  await page
    .getByRole("dialog", { name: "More actions" })
    .getByRole("link", { name: "Investor report" })
    .click();
  await page.waitForURL(`/reports/investor?person=${s.ids.person}`);
  await expect(
    page.getByRole("heading", { name: `Investor report — ${s.names.person}`, level: 1 }),
  ).toBeVisible();
});

test("E-CR-025.2 card statement: the period's bills and split, PDF, Excel; a customer's By model", async ({
  page,
}) => {
  test.slow();
  const s = await seedAccounts();
  await seedMoney({ type: "card_payment", amount: "2000", card_id: s.ids.card });

  await page.goto(`/cards/${s.ids.card}`);
  await page
    .getByRole("navigation", { name: "Quick actions" })
    .getByRole("button", { name: "More" })
    .click();
  await page
    .getByRole("dialog", { name: "More actions" })
    .getByRole("link", { name: "Statement" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Statement" });
  await expect(sheet.getByRole("button", { name: "Share PDF" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Download Excel" })).toBeVisible();
  await excel(page, sheet, /-statement-\d{4}-\d\d-01-to-\d{4}-\d\d-\d\d\.xlsx$/);
  const pdf = await sharedPdf(page, sheet, /-card-statement-.*\.pdf$/);
  expect(pdf).toContain("Card statement");
  expect(pdf).toContain("Refunds & cashback");
  expect(pdf).toContain("৳2,000");

  await sheet.getByRole("link", { name: "View on screen" }).click();
  await page.waitForURL(/from=.*&to=/);
  await expect(page.getByText(/^Bills in the period, as on /)).toBeVisible();
  await expect(page.getByLabel("Period totals")).toContainText("Card payments৳2,000");
  await noSideScroll(page);

  // A customer's statement for a period: Sales by model (no profit).
  const [purchase, lot, sale] = [randomUUID(), randomUUID(), randomUUID()];
  await sql`insert into purchases (id, date, source, supplier_id)
    values (${purchase}, ${dhaka()}, 'supplier_credit', ${s.ids.supplier})`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${lot}, ${purchase}, ${s.ids.model}, 5, 10000)`;
  await sql`insert into sales (id, date, customer_id) values (${sale}, ${dhaka()}, ${s.ids.customer})`;
  await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price) values (${sale}, ${lot}, 2, 15432)`;
  await page.goto(`/customers/${s.ids.customer}?from=${thisMonth}-01&to=${dhaka()}`);
  const byModel = page.getByRole("table", { name: "Sales by model" });
  const row = byModel.getByRole("row").filter({ hasText: s.names.model });
  await expect(row).toContainText("৳30,864");
  await expect(byModel).not.toContainText("Profit");
  await page.goto(`/suppliers/${s.ids.supplier}?from=${thisMonth}-01&to=${dhaka()}`);
  await expect(
    page
      .getByRole("table", { name: "Purchases by model" })
      .getByRole("row", { name: new RegExp(s.names.model) }),
  ).toContainText("৳50,000");
  await noSideScroll(page);
});

test("E-CR-025.3 Monthly pack: Reports and Months ⤴, its 8 sections, PDF, Excel", async ({
  page,
}) => {
  test.slow();
  await seedMoney({ type: "cashback", amount: "111", source: "cash" });
  await page.goto("/reports");
  await page.getByRole("link", { name: /^Monthly pack/ }).click();
  await page.waitForURL("/reports/pack");
  await expect(page.getByRole("heading", { name: /^Monthly pack — /, level: 1 })).toBeVisible();

  // Months ⤴ Share → this month → View on screen opens the pack.
  await page.goto("/months");
  await page.getByRole("link", { name: "Share" }).click();
  const sheet = page.getByRole("dialog", { name: "Monthly pack" });
  await expect(sheet.getByRole("button", { name: "Custom" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "This month" }).click();
  await sheet.getByRole("link", { name: "View on screen" }).click();
  await page.waitForURL(`/reports/pack?month=${thisMonth}`);
  await expect(
    page.getByRole("heading", { name: `Monthly pack — ${monthName(thisMonth)}`, level: 1 }),
  ).toBeVisible();
  for (const title of [
    "1. Profit & loss",
    "2. Position on",
    "3. Allocations",
    "4. Sales",
    "5. Stock movement",
    "6. Dues and their change",
    "7. Card bills",
    "8. Cash flow by entry type",
  ])
    await expect(
      page.getByRole("heading", { name: new RegExp(`^${title.replace(".", "\\.")}`), level: 2 }),
    ).toBeVisible();
  await expect(page.getByText("✓ The books balance")).toBeVisible();
  await expect(page.getByText("Open month — figures can still change")).toBeVisible();
  await noSideScroll(page);

  await page.getByRole("link", { name: "Share" }).click();
  const share = page.getByRole("dialog", { name: "Monthly pack" });
  const pdf = await sharedPdf(page, share, new RegExp(`-monthly-pack-${thisMonth}\\.pdf$`));
  expect(pdf).toContain("Monthly pack");
  expect(pdf).toContain("8. Cash flow by entry type");
  await excel(page, share, new RegExp(`-monthly-pack-${thisMonth}\\.xlsx$`));
  await share.getByRole("link", { name: "WhatsApp message" }).click();
  const send = page.getByRole("dialog", { name: "Send on WhatsApp" });
  await expect(send.getByLabel("Message")).toHaveValue(
    new RegExp(`^📊 \\*Monthly pack — ${monthName(thisMonth)}\\*`),
  );
  await expect(send.getByText("To:")).toHaveCount(0);
});
