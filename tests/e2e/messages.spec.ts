import { randomUUID } from "node:crypto";
import { type Page, expect, test } from "@playwright/test";
import { goHome, noSideScroll } from "./helpers";
import { dhaka, phone, seedAccounts, seedMoney, sql } from "./seed";

// CR-020 (D-040; UIDD §4.8, §4.10, §4.15, §5): statements for a period through the Report sheet,
// and the WhatsApp send preview from the Saved toast, the entry sheet, the Bills tab and ⋯ →
// Remind. At 360px and 1280px. Synthetic data only; the seeded templates are restored afterwards.

let templates: Record<string, never>;

test.beforeAll(async () => {
  [{ templates }] = await sql`select templates from business_profile`;
});

test.afterEach(async () => {
  await sql`update business_profile set templates = ${sql.json(templates)}`;
  await sql`delete from bank_accounts where account_name like 'E2E%'`;
});

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // wa.me is outside the app: answer it locally.
  await context.route("https://wa.me/**", (route) => route.fulfill({ body: "WhatsApp" }));
  // No number → the phone's share sheet: record what it was given.
  await page.addInitScript(() => {
    const w = window as unknown as { shared: string[] };
    w.shared = [];
    Object.defineProperty(navigator, "share", {
      value: async (data: { text: string }) => void w.shared.push(data.text),
    });
  });
  await goHome(page);
});

const actions = (page: Page) => page.getByRole("navigation", { name: "Quick actions" });
async function openMore(page: Page) {
  await actions(page).getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog", { name: "More actions" });
  await expect(sheet).toBeVisible();
  return sheet;
}
const preview = (page: Page) => page.getByRole("dialog", { name: "Send on WhatsApp" });
const message = (page: Page) => preview(page).getByRole("textbox", { name: "Message" });
const statement = (page: Page) =>
  page.getByRole(phone(page) ? "list" : "table", { name: "Statement" });
// Windows' clipboard turns "\n" into "\r\n".
const clipboard = async (page: Page) =>
  (await page.evaluate(() => navigator.clipboard.readText())).replaceAll("\r\n", "\n");

/** A lot of 5 of the seeded model, bought yesterday; and a sale of 1 to the customer from it. */
async function seedSale(s: Awaited<ReturnType<typeof seedAccounts>>, price = "12000") {
  const [purchaseId, lotId, saleId] = [randomUUID(), randomUUID(), randomUUID()];
  await sql`insert into purchases (id, date, source) values (${purchaseId}, ${dhaka(-1)}, 'cash')`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${lotId}, ${purchaseId}, ${s.ids.model}, 5, 10000)`;
  await sql`insert into sales (id, date, customer_id) values (${saleId}, ${dhaka()}, ${s.ids.customer})`;
  await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price)
    values (${saleId}, ${lotId}, 1, ${price})`;
  return saleId;
}

test("E-CR-020.1 ⋯ → Statement → This month → View: opening, entries, closing; ✕ clears; Back closes", async ({
  page,
}) => {
  test.slow();
  const s = await seedAccounts();
  // Before this month: the opening. This month: +৳5,000 and −৳2,000.
  await seedMoney({
    type: "customer_cash_given",
    amount: "10000",
    customer_id: s.ids.customer,
    date: dhaka(-40),
  });
  await seedMoney({ type: "customer_cash_given", amount: "5000", customer_id: s.ids.customer });
  await seedMoney({ type: "customer_payment", amount: "2000", customer_id: s.ids.customer });
  const base = `/customers/${s.ids.customer}`;
  await page.goto(base);

  await (await openMore(page)).getByRole("link", { name: "Statement" }).click();
  const sheet = page.getByRole("dialog", { name: "Statement" });
  await expect(sheet.getByRole("button", { name: "This month" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await noSideScroll(page);
  await sheet.getByRole("link", { name: "View on screen" }).click();
  await page.waitForURL((u) => u.searchParams.has("from") && !u.searchParams.has("report"));
  await expect(sheet).toBeHidden();

  const chip = page.getByRole("link", { name: "Clear the period" });
  await expect(chip).toBeVisible();
  await expect(page.getByText(/^01 \w{3} – \d\d \w{3} \d{4}$/)).toBeVisible();
  const list = statement(page);
  await expect(list.getByText("Opening balance")).toBeVisible();
  await expect(list.getByText("Closing balance")).toBeVisible();
  await expect(list).toContainText("৳10,000");
  await expect(list).toContainText("৳13,000");
  await noSideScroll(page);

  await chip.click();
  await page.waitForURL((u) => !u.searchParams.has("from"));
  await expect(statement(page).getByText("Opening balance")).toHaveCount(0);

  // Back closes the Report sheet and stays on the page.
  await (await openMore(page)).getByRole("link", { name: "Statement" }).click();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  expect(new URL(page.url()).pathname).toBe(base);
});

test("E-CR-020.2 a sale's toast Send ▸ → the preview: greeting, wa.me link, Copy, Save greeting", async ({
  page,
  context,
}) => {
  test.slow();
  const s = await seedAccounts();
  await sql`update customers set whatsapp = '01800-000001' where id = ${s.ids.customer}`;
  await sql`update business_profile set templates = '{}'`; // the defaults in code (D-039)
  await seedSale(s); // the lot to sell from (and an earlier bill)
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

  await page.getByRole("status").getByRole("link", { name: "Send ▸" }).click();
  await expect(preview(page)).toBeVisible();
  await expect(preview(page).locator("p", { hasText: "To:" })).toContainText(
    `${s.names.customer} · 01800-000001`,
  );
  const greeting = preview(page).getByRole("textbox", { name: "Greeting" });
  await expect(greeting).toHaveValue("Assalamu alaikum Owner bhai,");
  await expect(message(page)).toHaveValue(/📱 \*Items\*\n1\. .+ × 2 @ ৳15,000 = ৳30,000/);
  // The earlier bill (৳12,000) + this bill − Paid now = ৳37,000.
  await expect(message(page)).toHaveValue(
    /- Previous due: ৳12,000\n- This bill: \+৳30,000\n- Paid now: -৳5,000\n- \*Due now: ৳37,000\*/,
  );
  await expect(preview(page).getByRole("switch", { name: "Add How to pay" })).toHaveCount(0);
  await noSideScroll(page);

  await greeting.fill("Salam Owner bhai,");
  await preview(page).getByRole("checkbox", { name: "Save greeting as default" }).check();
  const send = preview(page).getByRole("link", { name: "Send on WhatsApp" });
  const href = new URL((await send.getAttribute("href"))!);
  expect(href.origin + href.pathname).toBe("https://wa.me/8801800000001");
  const text = href.searchParams.get("text")!;
  expect(text.startsWith("Salam Owner bhai,\n\n🧾 *")).toBe(true);
  expect(text).toContain("*Invoice");
  expect(text).toContain("Thank you!");

  const popup = context.waitForEvent("page");
  await send.click();
  await (await popup).close();
  await expect
    .poll(
      async () =>
        (await sql`select templates->'sale'->>'greeting' as g from business_profile`)[0].g,
    )
    .toBe("Salam {name} bhai,");

  await preview(page).getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("status").getByText("Copied")).toBeVisible();
  await expect.poll(() => clipboard(page)).toBe(text);

  await preview(page).getByRole("button", { name: "Close" }).click();
  await page.waitForURL(base);
});

test("E-CR-020.3 the entry sheet, the Bills tab and ⋯ → Remind open the preview; no number → Share", async ({
  page,
}) => {
  test.slow();
  const s = await seedAccounts();
  const saleId = await seedSale(s);
  const pay = await seedMoney({
    type: "customer_payment",
    amount: "2000",
    customer_id: s.ids.customer,
  });
  const base = `/customers/${s.ids.customer}`;

  // The entry sheet: Send ▸.
  await page.goto(`${base}?entry=${pay}`);
  await page.getByRole("link", { name: "Send ▸" }).click();
  await page.waitForURL((u) => u.searchParams.get("send") === pay);
  await expect(preview(page)).toBeVisible();
  await expect(message(page)).toHaveValue(/✅ \*Payment received/);
  await expect(message(page)).toHaveValue(/_Taka Two Thousand Only_/);
  await expect(preview(page).getByText(/No WhatsApp number/)).toBeVisible();
  await preview(page).getByRole("button", { name: "Share", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { shared: string[] }).shared[0] ?? ""))
    .toContain("Payment received");

  // The Bills tab: Send ▸ on the bill.
  await page.goto(`${base}?tab=bills`);
  await page.getByRole("link", { name: /^Send the .+ bill on WhatsApp$/ }).click();
  await page.waitForURL((u) => u.searchParams.get("send") === saleId);
  await expect(message(page)).toHaveValue(/📱 \*Items\*/);
  await preview(page).getByRole("button", { name: "Close" }).click();
  await page.waitForURL(
    (u) => u.searchParams.get("tab") === "bills" && !u.searchParams.has("send"),
  );

  // ⋯ → Remind on WhatsApp (the customer owes ৳10,000).
  await page.goto(base);
  await (await openMore(page)).getByRole("link", { name: "Remind on WhatsApp" }).click();
  await expect(message(page)).toHaveValue(
    /🔔 \*Payment reminder\*\nYour due with us is \*৳10,000\*/,
  );
  await expect(message(page)).toHaveValue(/Last payment: ৳2,000 on/);
});

test("E-CR-020.4 How to pay is off; on, the only business account is picked and added", async ({
  page,
}) => {
  const s = await seedAccounts();
  await seedSale(s);
  await sql`insert into bank_accounts (bank_name, branch, account_name, account_number)
    values ('EBL', 'Gulshan', 'E2E Pay Account', '1234567890')`;
  await page.goto(`/customers/${s.ids.customer}?send=reminder`);
  const how = preview(page).getByRole("switch", { name: "Add How to pay" });
  await expect(how).not.toBeChecked();
  await expect(message(page)).not.toHaveValue(/How to pay/);
  await how.check();
  await expect(preview(page).getByRole("button", { name: "EBL · 1234567890" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(message(page)).toHaveValue(
    /🏦 \*How to pay\*\n- EBL · Gulshan\n {2}A\/C name: E2E Pay Account\n {2}A\/C no: 1234567890/,
  );
  await noSideScroll(page);
});
