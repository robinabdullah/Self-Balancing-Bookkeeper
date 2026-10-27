import { randomUUID } from "node:crypto";
import { type Page, expect, test } from "@playwright/test";
import { addMonths, dhakaToday, formatDate, formatMonth, monthOf } from "@mbl/domain/dates";
import { localSql, truncateAll } from "../integration/local-db";
import { linkPartner } from "./global-setup";
import { goHome } from "./helpers";

// Task 5.6: Phase 5 end to end at 360px (and 1280px). Which month can be closed depends on every
// entry in the DB (the first open month with entries), so each run starts from empty tables, as
// test:int does on the same local DB, and closes October 2025 (S8–S10's October). Synthetic data
// only. Amounts in SQL are taka (numeric), as the DB stores them.
const sql = localSql();
test.afterAll(() => sql.end());

const OCT = "2025-10";
const october = formatMonth(OCT);
const today = dhakaToday();

/** Arif and Sumon 50/50; Arif's 5,000 opening capital in cash; a 1,000 cashback in October
 * (Profit(Oct) = 1,000 → 500 profit owed to each partner). */
async function seed() {
  await truncateAll(sql);
  await linkPartner(sql);
  const arif = randomUUID();
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${arif}, 'Arif', 'partner', 50), (${randomUUID()}, 'Sumon', 'partner', 50)`;
  await sql`insert into money_entries (type, date, amount, opening_kind, person_id) values
    ('opening', ${`${OCT}-01`}, 5000, 'cash', null),
    ('opening', ${`${OCT}-01`}, 5000, 'capital', ${arif})`;
  await sql`insert into money_entries (type, date, amount, source)
    values ('cashback', ${`${OCT}-10`}, 1000, 'cash')`;
}

const monthRow = (page: Page) =>
  page.getByRole("list", { name: "Months" }).getByRole("listitem").filter({ hasText: october });

test.describe("Phase 5 E2E (task 5.6)", () => {
  test.beforeEach(async ({ page }) => {
    await seed();
    await goHome(page);
  });

  test("E5.6.1 close October → its entries show 🔒 in the Journal → profit paid to Arif → re-open shows the warning", async ({
    page,
  }) => {
    test.slow(); // four screens and three modals

    // Close October: the next month to close, partners only (no investors).
    await page.goto("/months");
    await expect(monthRow(page)).toContainText("Open");
    await monthRow(page)
      .getByRole("link", { name: /Close month/ })
      .click();
    await page.waitForURL(`/months/${OCT}`); // a long run's `next dev` may recompile this page
    await expect(page.getByRole("heading", { name: `Close ${october}` })).toBeVisible();
    const split = page.getByRole("list", { name: "Partner split" });
    await expect(split.getByRole("listitem").filter({ hasText: "Arif" })).toContainText("৳500");
    await page.getByRole("button", { name: "Close month" }).click();
    const confirm = page.getByRole("dialog", { name: `Close ${october}?` });
    await expect(confirm).toContainText("will be locked");
    await confirm.getByRole("button", { name: "Close month" }).click();
    await expect(page.getByRole("status").getByText(`${october} closed`)).toBeVisible();
    await expect(page.getByText(`Closed on ${formatDate(today)}`)).toBeVisible();

    // The Journal: October's three entries are locked.
    await page.goto("/journal");
    const entries = page.getByRole("list", { name: "Entries" }).getByRole("listitem");
    await expect(entries).toHaveCount(3);
    for (const row of await entries.all()) await expect(row).toContainText("Locked");
    // E-CR-013.3 (D-032): a locked entry's sheet has no Edit or Delete, only Reverse.
    await entries.first().getByRole("link").first().click();
    const locked = page.getByRole("dialog").filter({ hasText: "In a closed month" });
    await expect(locked.getByRole("button", { name: "Reverse" })).toBeVisible();
    await expect(locked.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(locked.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await locked.getByRole("button", { name: "Close" }).click();
    await expect(locked).toBeHidden();

    // Profit paid to Arif, today: the picker shows his profit owed; 500 doesn't warn.
    await page.goto("/money/new?type=profit_paid");
    const form = page.getByRole("dialog", { name: "Profit paid" });
    await form.getByRole("button", { name: "Person", exact: true }).click();
    await page.getByRole("option", { name: /Arif.*Profit owed ৳500/ }).click();
    await form.getByRole("textbox", { name: "Amount" }).fill("500");
    await expect(form.getByText(/more than the profit owed/)).toHaveCount(0);
    await form.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();

    await page.goto("/journal");
    const paid = entries.filter({ hasText: "Profit paid" });
    await expect(paid).toHaveCount(1);
    await expect(paid).not.toContainText("Locked");

    // Re-open October: the confirm lists the profit paid since the close; then it's open again.
    await page.goto("/months");
    await expect(monthRow(page)).toContainText(`Closed on ${formatDate(today).slice(0, 6)}`);
    await monthRow(page).getByRole("link", { name: /View/ }).click();
    await page.getByRole("button", { name: "Re-open" }).click();
    const reopen = page.getByRole("dialog", { name: `Re-open ${october}?` });
    const since = reopen.getByRole("list", { name: "Profit paid or reinvested since the close" });
    await expect(since.getByRole("listitem")).toHaveCount(1);
    await expect(since).toContainText(`${formatDate(today)} · Profit paid · Arif`);
    await expect(since).toContainText("৳500");
    await reopen.getByRole("button", { name: "Re-open" }).click();
    await expect(page.getByRole("status").getByText(`${october} re-opened`)).toBeVisible();
    await expect(page.getByRole("heading", { name: `Close ${october}` })).toBeVisible();

    await page.goto("/journal");
    await expect(entries).toHaveCount(4);
    await expect(entries.filter({ hasText: "Locked" })).toHaveCount(0);
  });

  // E-CR-024.1 (D-044): October is the next to close; November (no entries) is listed as ৳0 · Open
  // and opens a read-only view; a month after this month is still not found.
  test("E-CR-024.1 a later open month shows its profit so far; a future month is 404", async ({
    page,
  }) => {
    const NOV = addMonths(OCT, 1);
    await page.goto("/months");
    const nov = page
      .getByRole("list", { name: "Months" })
      .getByRole("listitem")
      .filter({ hasText: formatMonth(NOV) });
    await expect(nov).toContainText("Open");
    await expect(nov).toContainText("৳0");
    await nov.getByRole("link", { name: /View/ }).click();
    await page.waitForURL(`/months/${NOV}`);
    await expect(page.getByRole("heading", { name: formatMonth(NOV), level: 1 })).toBeVisible();
    await expect(page.getByText(`Open · close ${october} first`)).toBeVisible();
    const breakdown = page
      .getByRole("definition")
      .locator("..")
      .filter({ hasText: "Month profit" });
    await expect(breakdown).toContainText("৳0");
    await expect(page.getByRole("button", { name: "Close month" })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Partner split" })).toHaveCount(0);

    // This month is linked too; next month is not found (the (app) loading.tsx streams the page,
    // so Next answers 200 with its not-found UI).
    const thisMonth = monthOf(today);
    await page.goto(`/months/${thisMonth}`);
    await expect(
      page.getByRole("heading", { name: formatMonth(thisMonth), level: 1 }),
    ).toBeVisible();
    await page.goto(`/months/${addMonths(thisMonth, 1)}`);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.getByText(/^Open · close /)).toHaveCount(0);
  });
});
