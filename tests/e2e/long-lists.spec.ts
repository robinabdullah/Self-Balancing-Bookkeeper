import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { TYPE_LABEL } from "@mbl/domain/journal/labels";
import { format } from "@mbl/domain/money";
import { dhaka, phone, seedAccounts, seedMoney } from "./seed";

// CR-054 (D-077, UIDD §1, §4.8, §4.10): long lists show the newest 25 rows, then "Showing 25 of N"
// and Show 25 more (the last batch says what is left). Balances, counts and totals use every row;
// a statement for a period is whole. Synthetic data only.

const more = (page: Page) => page.getByRole("button", { name: /^Show \d+ more$/ });

async function noSeriousAxe(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => v.id)).toEqual([]);
}

test.describe("Long lists (CR-054)", () => {
  test("E-CR-054.1 Journal: 25 of 30, Show 5 more; an entry keeps them; a filter → 25", async ({
    page,
  }) => {
    const tag = `e2e-long-${randomUUID().slice(0, 8)}`;
    // 30 expenses, one a day back from today, so the order is fixed (newest first).
    for (let i = 0; i < 30; i++)
      await seedMoney({
        type: "expense",
        date: dhaka(-i),
        amount: "10",
        category: "rent",
        source: "cash",
        note: `${tag} ${i}`,
      });

    await page.goto(`/journal?q=${tag}`);
    const rows = page.getByRole("list", { name: "Entries" }).getByRole("listitem");
    await expect(rows).toHaveCount(25);
    await expect(page.getByText("Showing 25 of 30")).toBeVisible();
    const count = page.getByRole("status").filter({ hasText: "entries" }).filter({ visible: true });
    await expect(count).toHaveText("30 entries");

    await more(page).click();
    await expect(rows).toHaveCount(30);
    await expect(more(page)).toHaveCount(0);
    await expect(page.getByText("Showing 30 of 30")).toBeVisible();
    await expect(rows.nth(25).getByRole("link").first()).toBeFocused(); // the first new row

    // Opening and closing an entry keeps what was shown.
    await rows.nth(27).getByRole("link").first().click();
    await page.waitForURL((u) => u.searchParams.has("entry"));
    await page.keyboard.press("Escape");
    await page.waitForURL((u) => !u.searchParams.has("entry"));
    await expect(rows).toHaveCount(30);

    // A filter change shows the first 25 again; the count line still counts every match.
    if (phone(page)) await page.getByRole("button", { name: /^Filters/ }).click();
    const scope = phone(page)
      ? page.getByRole("dialog", { name: "Filters" })
      : page.getByRole("region", { name: "Filters" });
    await scope.getByRole("combobox").first().selectOption({ label: TYPE_LABEL.expense });
    if (phone(page)) await scope.getByRole("button", { name: "Show 30 entries" }).click();
    await expect(rows).toHaveCount(25);
    await expect(count).toContainText("30 entries · total");
    await expect(more(page)).toHaveText("Show 5 more");
  });

  test("E-CR-054.2 Capital history: 25 of 30 with full balances; a period is whole; axe", async ({
    page,
  }) => {
    const s = await seedAccounts();
    // Row i is dated i days back with ৳(i+1)×100: the newest ৳100, the oldest ৳3,000.
    for (let i = 0; i < 30; i++)
      await seedMoney({
        type: "capital_in",
        date: dhaka(-i),
        amount: String((i + 1) * 100),
        person_id: s.ids.person,
      });
    const capital = format(100 * 100 * ((30 * 31) / 2)); // ৳46,500

    await page.goto(`/people/${s.ids.person}`);
    await expect(page.getByText(`Capital ${capital}`, { exact: true })).toBeVisible();
    const history = page.getByRole(phone(page) ? "list" : "table", { name: "Capital history" });
    const rows: Locator = phone(page) ? history.getByRole("listitem") : history.locator("tbody tr");
    const balance = (row: Locator) =>
      phone(page) ? row.getByText(/^Balance/) : row.locator("td").last();

    await expect(rows).toHaveCount(25);
    await expect(balance(rows.first())).toHaveText(phone(page) ? `Balance ${capital}` : capital);
    await expect(page.getByText("Showing 25 of 30")).toBeVisible();
    await noSeriousAxe(page);

    await more(page).click();
    await expect(rows).toHaveCount(30);
    await expect(more(page)).toHaveCount(0);
    const oldest = format(3000 * 100);
    await expect(balance(rows.last())).toHaveText(phone(page) ? `Balance ${oldest}` : oldest);
    await expect(rows.nth(25).getByRole("link").first()).toBeFocused();

    // With a period the statement is whole: its Opening, every line, Totals and Closing.
    await page.goto(`/people/${s.ids.person}?from=${dhaka(-29)}&to=${dhaka()}`);
    await expect(history.getByRole("link")).toHaveCount(30);
    await expect(history.getByText("Opening balance")).toBeVisible();
    await expect(history.getByText("Closing balance")).toBeVisible();
    await expect(more(page)).toHaveCount(0);
    await expect(page.getByText(/^Showing \d+ of/)).toHaveCount(0);
  });
});
