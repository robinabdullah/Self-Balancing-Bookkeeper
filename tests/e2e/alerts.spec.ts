import { type Page, expect, test } from "@playwright/test";
import { addDays, addMonths, formatDate } from "@mbl/domain/dates";
import { monthProfit } from "@mbl/domain/engine/months";
import { truncateAll } from "../integration/local-db";
import { linkPartner } from "./global-setup";
import { PARTNER, goHome } from "./helpers";
import { dhaka, phone, seedAccounts, seedCardDetails, seedMoney, sql } from "./seed";

// E-CR-056.1 (SRS §15, UIDD §3, §4.8; D-079, D-081): the 🔔 in the top bar, its badge and the
// Alerts sheet, and the card page's fee chip, at 360px and 1280px. The badge counts every alert in
// the books, so each test starts from empty tables (as month-close.spec.ts does), with last month
// closed (so no Close alert). Synthetic data only; amounts in SQL are taka.

async function fresh() {
  await truncateAll(sql);
  await linkPartner(sql);
  const [user] = await sql`select id from auth.users where email = ${PARTNER.email}`;
  // Nothing posted in it: its snapshot is an empty month's Profit(M), as the close stores it (the
  // charts read it).
  const last = addMonths(dhaka().slice(0, 7), -1);
  const snapshot = sql.json(monthProfit([], last, dhaka()));
  await sql`insert into month_closes (month, close_date, snapshot, closed_by)
    values (${`${last}-01`}, ${dhaka()}, ${snapshot}, ${user.id})`;
}

/**
 * A card whose statement is 10 days ahead in its expiry month (D-081: Soon), with last year's
 * Annual fee of ৳5,000 on that month's bill (paid, so no bill alert) and a ৳`limit` limit.
 */
async function feeCard(limit: number) {
  const statement = dhaka(10);
  const s = await seedAccounts({ cardName: "SCB Visa", statementDay: Number(statement.slice(8)) });
  await sql`update cards set credit_limit = ${limit} where id = ${s.ids.card}`;
  await seedCardDetails(s.ids.card, {
    number: "4111 1111 1111 1111",
    expiry: `${statement.slice(5, 7)}/29`,
  });
  const lastYear = `${Number(statement.slice(0, 4)) - 1}${statement.slice(4, 7)}-01`;
  const card = { card_id: s.ids.card };
  await seedMoney({
    type: "card_fee",
    date: lastYear,
    amount: "5000",
    category: "annual",
    ...card,
  });
  await seedMoney({ type: "card_payment", date: addDays(lastYear, 1), amount: "5000", ...card });
  return { ...s, day: formatDate(statement).slice(0, 6) };
}

const bell = (page: Page) => page.getByRole("banner").getByRole("button", { name: /^Alerts,/ });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Alerts" });
/** Back closes the sheet (D-035); unlike Escape it leaves no deferred history step to race a goto. */
async function closeSheet(page: Page) {
  await page.goBack();
  await expect(sheet(page)).toBeHidden();
}

test.describe("CR-056 Alerts bell", () => {
  test.beforeEach(async () => fresh());
  // Later specs post into last month (charts, months): leave it open again.
  test.afterEach(async () => {
    await sql`delete from month_closes where month = ${`${addMonths(dhaka().slice(0, 7), -1)}-01`}`;
  });

  test("E-CR-056.1 a fee with too little room: an amber 1, under Soon; its row opens the card; the chip", async ({
    page,
  }) => {
    const s = await feeCard(3000); // Available ≈ ৳3,000 < the ৳5,000 fee
    await goHome(page);
    await expect(bell(page)).toHaveAccessibleName("Alerts, 1 needs attention");
    const badge = bell(page).getByTestId("alerts-badge");
    await expect(badge).toHaveText("1");
    await expect(badge).toHaveClass(/amber/);

    // Back closes the sheet (D-035) and stays on Home.
    await bell(page).click();
    await expect(sheet(page)).toBeVisible();
    await page.goBack();
    await expect(sheet(page)).toBeHidden();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

    await bell(page).click();
    await expect(sheet(page).getByRole("heading", { name: "Soon · 1" })).toBeVisible();
    const row = sheet(page).getByRole("link", { name: new RegExp(`${s.names.card}.*annual fee`) });
    await expect(row).toContainText(
      `Annual fee ≈ ৳5,000 on ${s.day}. Available ≈ ৳3,000, so pay at least ৳2,000 before then.`,
    );
    await row.click();
    await page.waitForURL(`**/cards/${s.ids.card}`);
    await expect(sheet(page)).toBeHidden();

    // The card page: the amber chip beside the status badge; a tap shows the alert's line.
    const chip = page.getByRole("button", { name: `Soon: Annual fee ${s.day}` });
    await expect(chip).toBeVisible();
    await expect(chip.locator("span").first()).toHaveClass(/amber/);
    await chip.click();
    await expect(page.getByRole("note")).toContainText("so pay at least ৳2,000 before then.");
  });

  test("E-CR-056.1 with enough room the fee still counts: an amber 1, 'covers it'", async ({
    page,
  }) => {
    const s = await feeCard(100000);
    await goHome(page);
    await expect(bell(page).getByTestId("alerts-badge")).toHaveText("1");
    await bell(page).click();
    await expect(sheet(page).getByRole("heading", { name: "Soon · 1" })).toBeVisible();
    await expect(sheet(page).getByRole("link", { name: /annual fee/ })).toContainText(
      `Annual fee ≈ ৳5,000 on ${s.day}. Available ≈ ৳1,00,000 covers it.`,
    );
  });

  test("E-CR-056.1 nothing due: no badge, All clear; a card with no expiry → the muted line, no chip", async ({
    page,
  }) => {
    await goHome(page);
    await expect(bell(page)).toHaveAccessibleName("Alerts, all clear");
    await expect(bell(page).getByTestId("alerts-badge")).toHaveCount(0);
    await bell(page).click();
    await expect(sheet(page)).toContainText("All clear: nothing needs attention.");
    await expect(sheet(page).getByRole("link")).toHaveCount(0);
    await closeSheet(page);

    const s = await seedAccounts();
    await page.reload();
    await bell(page).click();
    const line = sheet(page).getByRole("link", {
      name: "1 card has no expiry saved, so no fee alerts for it.",
    });
    await expect(line).toHaveAttribute("href", "/saved");
    await expect(sheet(page)).toContainText("All clear: nothing needs attention.");
    await closeSheet(page);

    await page.goto(`/cards/${s.ids.card}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Annual fee/ })).toHaveCount(0);
    // The bell is on every page, at both sizes (UIDD §3).
    await expect(bell(page)).toBeVisible();
    if (phone(page)) await expect(page.getByRole("button", { name: "User menu" })).toBeHidden();
  });
});
