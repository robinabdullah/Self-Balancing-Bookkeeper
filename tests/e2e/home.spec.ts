import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { goHome } from "./helpers";
import { dhaka, seedAccounts, sql } from "./seed";

// E-CR-013.7 (UIDD §4.2; D-032): Card alerts are one row per card and open that card; the tiles
// open their pages. The DB is shared with other specs, so the alert checks hold for any data.
// Synthetic data only.
test.beforeEach(async ({ page }) => goHome(page));
// Each test walks through several pages; `next dev` can be slow late in a long run.
test.slow();

test("E-CR-013.7 card alerts: one row per card, each opens its card", async ({ page }) => {
  // An EMI card: 5 unpaid installment bills, which used to fill several alert rows.
  const s = await seedAccounts();
  const [purchase, lot] = [randomUUID(), randomUUID()];
  await sql`insert into purchases (id, date, source, card_id, emi_months)
    values (${purchase}, ${dhaka()}, 'card', ${s.ids.card}, 5)`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${lot}, ${purchase}, ${s.ids.model}, 1, 5000)`;

  await page.goto("/");
  const alerts = page.getByRole("region", { name: "Card alerts" }).getByRole("listitem");
  await expect(alerts.first()).toBeVisible();
  const hrefs = await alerts
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  expect(hrefs.length).toBeLessThanOrEqual(5);
  for (const href of hrefs) expect(href).toMatch(/^\/cards\/[0-9a-f-]{36}$/);
  expect(new Set(hrefs).size).toBe(hrefs.length); // one row per card
  expect(hrefs.filter((h) => h === `/cards/${s.ids.card}`).length).toBeLessThanOrEqual(1);

  const first = alerts.first();
  const name = (await first.innerText()).split("\n").find((l) => l.includes("·"))!;
  await first.getByRole("link").click();
  await page.waitForURL(hrefs[0]!);
  await expect(page.locator("h1")).toContainText(name.split("·").pop()!.trim());
});

test("E-CR-013.7 each tile opens its page", async ({ page }) => {
  for (const [title, path] of [
    ["Cash", "/reports/cash"], // D-043
    ["Stock", "/stock"],
    ["Customers owe", "/reports/charts?tab=customers"], // D-064
    ["We owe suppliers", "/suppliers"],
    ["Card dues", "/cards"],
  ]) {
    await page.goto("/");
    await page
      .getByRole("region", { name: "Summary" })
      .getByRole("link")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      .click();
    await page.waitForURL(path);
  }
  await page.goto("/");
  await page
    .getByRole("region", { name: "Summary" })
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: /^Profit · / }) })
    .click();
  await page.waitForURL("/reports/charts?tab=profit"); // D-064: the Charts page's Profit tab
});
