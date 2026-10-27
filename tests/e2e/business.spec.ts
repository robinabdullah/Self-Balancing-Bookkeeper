import { randomUUID } from "node:crypto";
import { type Page, expect, test } from "@playwright/test";
import { goHome, noSideScroll } from "./helpers";
import { phone, pick, seedAccounts, sql } from "./seed";

// CR-019 (D-039; UIDD §3, §4.1, §4.8, §4.11, §4.13, §4.14): the business profile, its logo and
// message templates, contacts in Setup and the saved bank accounts (copy a field, Copy all,
// Share). At 360px and 1280px. Synthetic data only; the seeded profile is restored afterwards.

// A 1×1 PNG: the browser "resizes" it (it is already under 256 px) and sends a PNG data URL.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

let seeded: Record<string, unknown>;

test.beforeAll(async () => {
  [seeded] = await sql`select name, short_name, logo, templates from business_profile`;
});

const restore = () =>
  sql`update business_profile set name = ${seeded.name as string},
    short_name = ${seeded.short_name as string | null}, logo = ${seeded.logo as string | null},
    templates = ${sql.json(seeded.templates as Record<string, never>)}`;

test.afterEach(async () => {
  await restore();
  await sql`delete from bank_accounts where account_name like 'E2E%'`;
});

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // Share goes through the phone's share sheet: record what it was given.
  await page.addInitScript(() => {
    const w = window as unknown as { shared: string[] };
    w.shared = [];
    Object.defineProperty(navigator, "share", {
      value: async (data: { text: string }) => void w.shared.push(data.text),
    });
  });
  await goHome(page);
});

// Windows' clipboard turns "\n" into "\r\n".
const clipboard = async (page: Page) =>
  (await page.evaluate(() => navigator.clipboard.readText())).replaceAll("\r\n", "\n");
const banner = (page: Page) => page.getByRole("banner");

test("E-CR-019.1 Details rename the app; a new logo shows in the top bar and on the login page", async ({
  page,
  context,
}) => {
  test.slow();
  await page.goto("/settings");
  await page.getByRole("button", { name: /^Details/ }).click();
  const details = page.getByRole("dialog", { name: "Business details" });
  await expect(details.getByLabel("Name", { exact: true })).toHaveValue("Demo Business Shop");
  await details.getByLabel("Name", { exact: true }).fill("E2E Phones Ltd");
  await details.getByLabel("Short name").fill("E2E Phones");
  await details.getByRole("button", { name: "Save" }).click();
  await expect(details).toBeHidden();
  await expect(banner(page).getByRole("link", { name: "E2E Phones" })).toBeVisible();
  await expect(page).toHaveTitle("E2E Phones Ltd");

  // Logo: choose → preview → Save; the top bar shows it from the cached /logo route.
  await page.getByRole("button", { name: /^Logo/ }).click();
  const logo = page.getByRole("dialog", { name: "Logo" });
  await logo.getByLabel("Logo image").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(logo.locator("img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await logo.getByRole("button", { name: "Save" }).click();
  await expect(logo).toBeHidden();
  const img = banner(page).locator("img");
  await expect(img).toHaveAttribute("src", /^\/logo\?v=[0-9a-f]{8}$/);
  const res = await page.request.get((await img.getAttribute("src"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(res.headers()["cache-control"]).toContain("immutable");
  // The audit row says "changed", never the image.
  const [audit] = await sql`select after from audit_log
    where "table" = 'business_profile' order by at desc limit 1`;
  expect(audit.after).toEqual({ logo: "changed" });

  // Signed out, the login page shows the logo and name (the /logo route is public).
  await context.clearCookies();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "E2E Phones Ltd" })).toBeVisible();
  await expect(page.locator("main img")).toHaveAttribute("src", /^\/logo\?v=/);
  await expect(page).toHaveTitle("Log in · E2E Phones Ltd");
  expect((await page.request.get("/logo")).status()).toBe(200);
});

test("E-CR-019.2 a message's greeting and sign-off are saved", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /^Messages/ }).click();
  const messages = page.getByRole("dialog", { name: "Messages" });
  await messages.getByRole("button", { name: /^Due reminder/ }).click();
  const form = page.getByRole("dialog", { name: "Due reminder message" });
  await expect(form.getByLabel("Greeting")).toHaveValue("Assalamu alaikum {name} bhai,");
  await expect(form.getByLabel("Sign-off")).toHaveValue("— {shop}");
  await form.getByLabel("Greeting").fill("Dear {name},");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  await expect(messages.getByRole("button", { name: /^Due reminder/ })).toContainText(
    "Dear {name},",
  );
  const [row] = await sql`select templates from business_profile`;
  expect(row.templates.reminder).toEqual({ greeting: "Dear {name},", signOff: "— {shop}" });
  // Back closes the sheet (D-035).
  await page.goBack();
  await expect(messages).toBeHidden();
  await expect(page).toHaveURL(/\/settings$/);
});

test("E-CR-019.3 Saved details: add for the business and a supplier; copy a field, Copy all, Share", async ({
  page,
}) => {
  test.slow();
  const s = await seedAccounts();
  // Reached from More (a phone) or the sidebar (desktop).
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  if (phone(page)) {
    await nav.getByRole("button", { name: "More" }).click();
    await page
      .getByRole("dialog", { name: "More" })
      .getByRole("link", { name: "Saved details" })
      .click();
  } else await nav.getByRole("link", { name: "Saved details" }).click();
  await expect(page.getByRole("heading", { name: "Saved details" })).toBeVisible();

  await page.getByRole("button", { name: "Add bank account" }).click();
  let form = page.getByRole("dialog", { name: "Add bank account" });
  await expect(form.getByRole("radio", { name: "The business" })).toBeChecked();
  await form.getByLabel("Bank", { exact: true }).fill("EBL");
  await form.getByLabel("Branch").fill("Gulshan");
  await form.getByLabel("Account name").fill("E2E Business Account");
  await form.getByLabel("Account number").fill("1234567890");
  await form.getByLabel("Routing number").fill("12345");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("A routing number has 9 digits")).toBeVisible();
  await form.getByLabel("Routing number").fill("095261234");
  await form.getByLabel("Note").fill("main account");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();

  const business = page.getByRole("region", { name: "The business" });
  await expect(business.getByText("E2E Business Account")).toBeVisible();
  await business.getByRole("button", { name: "Copy account number" }).click();
  await expect(page.getByRole("status").getByText("Copied")).toBeVisible();
  expect(await clipboard(page)).toBe("1234567890");
  const all = [
    "Bank: EBL",
    "Branch: Gulshan",
    "Account name: E2E Business Account",
    "Account number: 1234567890",
    "Routing number: 095261234",
  ].join("\n");
  await business.getByRole("button", { name: "Copy all" }).click();
  await expect.poll(() => clipboard(page)).toBe(all); // the note stays out
  await business.getByRole("button", { name: "Share" }).click();
  expect(await page.evaluate(() => (window as unknown as { shared: string[] }).shared)).toEqual([
    all,
  ]);

  // A supplier's account: the owner is picked (pick, don't type).
  await page.getByRole("button", { name: "Add bank account" }).click();
  form = page.getByRole("dialog", { name: "Add bank account" });
  await form.getByRole("radio", { name: "Supplier" }).check();
  await pick(page, form, "Supplier", s.names.supplier);
  await form.getByLabel("Bank", { exact: true }).fill("City");
  await form.getByLabel("Account name").fill("E2E Supplier Account");
  await form.getByLabel("Account number").fill("555");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  await expect(
    page.getByRole("region", { name: s.names.supplier }).getByText("E2E Supplier Account"),
  ).toBeVisible();

  // Search by owner, bank or number.
  await page.getByRole("searchbox", { name: "Search saved details" }).fill(s.names.supplier);
  await expect(page.getByText("E2E Business Account")).toBeHidden();
  await expect(page.getByText("E2E Supplier Account")).toBeVisible();

  // No horizontal scroll at 360px.
  await noSideScroll(page);
});

test("E-CR-019.4 a customer's ⋯ → Bank accounts: add one in the sheet; Back closes it", async ({
  page,
}) => {
  const s = await seedAccounts();
  const base = `/customers/${s.ids.customer}`;
  await page.goto(base);
  await page
    .getByRole("navigation", { name: "Quick actions" })
    .getByRole("button", { name: "More" })
    .click();
  await page
    .getByRole("dialog", { name: "More actions" })
    .getByRole("link", { name: "Bank accounts" })
    .click();
  await expect(page).toHaveURL(`${base}?bank=1`);
  const sheet = page.getByRole("dialog", { name: "Bank accounts" });
  await expect(sheet.getByText("No saved bank accounts yet.")).toBeVisible();

  await sheet.getByRole("button", { name: "Add bank account" }).click();
  const form = page.getByRole("dialog", { name: "Add bank account" });
  await expect(form.getByRole("radio", { name: "The business" })).toHaveCount(0); // owner fixed
  await form.getByLabel("Bank", { exact: true }).fill("BRAC");
  await form.getByLabel("Account name").fill("E2E Customer Account");
  await form.getByLabel("Account number").fill("777");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  await expect(sheet.getByText("E2E Customer Account")).toBeVisible();
  const [row] = await sql`select customer_id from bank_accounts
    where account_name = 'E2E Customer Account'`;
  expect(row.customer_id).toBe(s.ids.customer);

  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(base);
});

test("E-CR-019.5 Setup: contacts on a person; deleting a supplier names its saved accounts", async ({
  page,
}) => {
  test.slow();
  const run = randomUUID().slice(0, 8);
  await page.goto("/setup?tab=person");
  await page.getByRole("button", { name: "Add person" }).click();
  const form = page.getByRole("dialog", { name: "Add person" });
  await form.getByLabel("Name").fill(`E2E Contact ${run}`);
  await form.getByRole("radio", { name: "Investor" }).check();
  await form.getByLabel("Phone").fill("01711111111");
  await form.getByLabel("WhatsApp").fill("01811111111");
  await form.getByLabel("Email").fill("contact@test.local");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("button", { name: new RegExp(`^E2E Contact ${run}`) })).toContainText(
    "01711111111 · WhatsApp 01811111111 · contact@test.local",
  );

  const supplier = randomUUID();
  const name = `E2E Supplier ${run}`;
  await sql`insert into suppliers (id, name) values (${supplier}, ${name})`;
  await sql`insert into bank_accounts (supplier_id, bank_name, account_name, account_number) values
    (${supplier}, 'EBL', 'E2E one', '1'), (${supplier}, 'City', 'E2E two', '2')`;
  await page.goto("/setup?tab=supplier");
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: `Delete ${name}?` });
  await expect(confirm.getByText("Also deletes 2 saved bank accounts")).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("button", { name: `Actions for ${name}` })).toHaveCount(0);
  expect(await sql`select 1 from bank_accounts where supplier_id = ${supplier}`).toHaveLength(0);
});
