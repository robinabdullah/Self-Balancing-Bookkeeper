import { type Page, expect, test } from "@playwright/test";
import { formatDate } from "@/lib/dates";
import { format, parse } from "@/lib/money";
import { goHome, noSideScroll } from "./helpers";
import { dhaka, escapeRe, phone, seedAccounts, seedMoney, sql } from "./seed";

// CR-043 (D-064, clarified 2026-10-24; UIDD §4.8, §4.17): the Charts · Customers tab and a
// customer's Due trend. A new customer is given ৳5,000 cash 10 days ago and pays ৳2,000 3 days
// ago (no profit effect, so the books stay balanced); both rows are deleted after the test. Over
// those 11 days the due is ৳5,000 for 7 days and ৳3,000 for 4: Average ৳4,273, Lowest ৳3,000.
// Synthetic data only; amounts in SQL are taka.

const GIVEN = dhaka(-10);
const PAID = dhaka(-3);
const seeded: string[] = [];
const taka = (s: string) => format(parse(s)!);

const actions = (page: Page) => page.getByRole("navigation", { name: "Quick actions" });
async function openMore(page: Page) {
  await actions(page).getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog", { name: "More actions" });
  await expect(sheet).toBeVisible();
  return sheet;
}
/** The Due trend's figures (label → shown text). */
async function stats(page: Page) {
  await expect(page.locator("dl[aria-label='Due trend']")).toBeVisible(); // streamed in
  const rows = await page
    .locator("dl[aria-label='Due trend'] > div")
    .evaluateAll((divs) =>
      divs.map((d) => [
        d.querySelector("dt")?.textContent?.trim() ?? "",
        d.querySelector("dd")?.textContent?.trim() ?? "",
      ]),
    );
  return Object.fromEntries(rows);
}

test.describe("CR-043 Charts · Customers tab + Due trend", () => {
  let s: Awaited<ReturnType<typeof seedAccounts>>;

  test.beforeEach(async ({ page }) => {
    s = await seedAccounts();
    seeded.push(
      await seedMoney({
        type: "customer_cash_given",
        date: GIVEN,
        amount: 5000,
        customer_id: s.ids.customer,
      }),
      await seedMoney({
        type: "customer_payment",
        date: PAID,
        amount: 2000,
        customer_id: s.ids.customer,
      }),
    );
    await goHome(page);
  });

  test.afterEach(async () => {
    await sql`delete from money_entries where id in ${sql(seeded.splice(0))}`;
  });

  test("E-CR-043.1 customer ⋯ → Due trend shows the stats; a Customers owe row opens it; Walk-in has none", async ({
    page,
  }) => {
    test.slow(); // the tab, two detail pages, the trend twice and Walk-in
    const name = s.names.customer;

    // Home's Customers owe tile → the Customers tab: three cards.
    await page
      .getByRole("region", { name: "Summary" })
      .getByRole("link")
      .filter({ has: page.getByRole("heading", { name: "Customers owe", exact: true }) })
      .click();
    await page.waitForURL("/reports/charts?tab=customers");
    const cards = page.getByRole("region", { name: "Customer charts" }).getByRole("link");
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText("Customers owe");
    await expect(cards.nth(1)).toContainText("Given vs collected");
    await expect(cards.nth(2)).toContainText("Top customers");

    // The customer's ⋯ → Due trend: Now = the page's due; Last paid = the payment.
    await page.goto(`/customers/${s.ids.customer}`);
    await expect(page.getByText(taka("3,000")).first()).toBeVisible();
    await (await openMore(page)).getByRole("link", { name: "Due trend" }).click();
    await page.waitForURL(`/customers/${s.ids.customer}/trend`);
    await expect(
      page.getByRole("heading", { name: `${name} · Due trend`, level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("img", { name: /^Due at each day end/ })).toBeVisible();
    const six = await stats(page);
    expect(six["Now"]).toBe(taka("3,000"));
    // (Lowest and Average depend on where the local books start: checked on a set window below.)
    expect(six["Highest"]).toBe(taka("5,000"));
    expect(six["Last paid"]).toBe(`${formatDate(PAID)} (3 days ago)`);

    // Customers owe over the last 11 days: the customer kept ৳3,000; the row opens their trend.
    await page.goto(`/reports/charts/customers-owe?from=${GIVEN}&to=${dhaka()}`);
    await expect(page.getByRole("img", { name: /^Customers owe at each day end/ })).toBeVisible();
    await page
      .getByRole("region", { name: "Lowest due" })
      .getByRole("link", { name: new RegExp(escapeRe(name)) })
      .click();
    await page.waitForURL(
      (u) =>
        u.pathname === `/customers/${s.ids.customer}/trend` && u.searchParams.get("from") === GIVEN,
    );
    const window = await stats(page);
    expect(window["Now"]).toBe(taka("3,000"));
    expect(window["Average"]).toBe(taka("4,273"));
    expect(window["Lowest (always kept)"]).toBe(taka("3,000"));
    expect(window["Highest"]).toBe(taka("5,000"));
    // The window's statement: the cash given and the payment.
    const statement = page.getByRole(phone(page) ? "list" : "table", { name: "Statement" });
    await expect(statement.getByRole("link")).toHaveCount(2);

    // No horizontal scroll; 44 px taps on the back link and the period row.
    await noSideScroll(page);
    const taps = [
      page.getByRole("link", { name, exact: true }),
      ...(await page.getByRole("navigation", { name: "Period" }).getByRole("link").all()),
    ];
    for (const link of taps) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // Top customers: Sales / Profit.
    await page.goto("/reports/charts/top-customers");
    await page
      .getByRole("navigation", { name: "Rank by" })
      .getByRole("link", { name: "Profit" })
      .click();
    await page.waitForURL((u) => u.searchParams.get("by") === "profit");
    await expect(page.getByRole("link", { name: "Charts", exact: true })).toHaveAttribute(
      "href",
      "/reports/charts?tab=customers",
    );

    // Walk-in: no Due trend in ⋯, and its trend page doesn't exist.
    const [walkIn] = await sql`select id from customers where is_system`;
    await page.goto(`/customers/${walkIn.id}`);
    await expect((await openMore(page)).getByRole("link", { name: "Due trend" })).toHaveCount(0);
    // Not found (the (app) loading.tsx streams the page, so the status is 200, as in month-close).
    await page.goto(`/customers/${walkIn.id}/trend`);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});
