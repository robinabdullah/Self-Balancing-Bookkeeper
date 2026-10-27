import { type Locator, type Page, expect, test } from "@playwright/test";
import { seedAccounts, seedMoney } from "./seed";

// E-CR-028.1 (D-048): on the production build a link that only changes the query on the same
// path opens with one tap, every time. Next 15.5 lost ~20–40% of these taps (a router race);
// Next 16 doesn't. Each try starts from a fresh load, where the race showed.
const TRIES = 20;

async function tapEveryTime(
  page: Page,
  url: string,
  link: (page: Page) => Locator,
  opened: (u: URL) => boolean,
  shown: (page: Page) => Locator,
) {
  for (let i = 0; i < TRIES; i++) {
    await page.goto(url);
    await link(page).click();
    await page.waitForURL(opened, { timeout: 5_000 });
    await expect(shown(page), `try ${i + 1} of ${TRIES}`).toBeVisible();
  }
}

test.describe("E-CR-028.1 same-page taps open first time", () => {
  test.slow();

  test("E-CR-028.1 a statement row, the Bills tab and a Home recent row: 20/20 each", async ({
    page,
  }) => {
    const s = await seedAccounts();
    const pay = await seedMoney({
      type: "supplier_payment",
      amount: "700.00",
      supplier_id: s.ids.supplier,
      source: "cash",
    });
    const capital = await seedMoney({
      type: "capital_in",
      amount: "900.00",
      person_id: s.ids.investor,
    });
    const dialog = (name: string) => (p: Page) => p.getByRole("dialog", { name });

    // A statement row: `?entry=` opens the entry over the supplier's page.
    await tapEveryTime(
      page,
      `/suppliers/${s.ids.supplier}`,
      (p) => p.locator(`main a[href*='entry=${pay}']`).filter({ visible: true }).first(),
      (u) => u.searchParams.get("entry") === pay,
      dialog("Supplier payment"),
    );

    // The Bills tab: `?tab=bills` on the customer's page.
    await tapEveryTime(
      page,
      `/customers/${s.ids.customer}`,
      (p) => p.getByRole("navigation", { name: "Customer" }).getByRole("link", { name: "Bills" }),
      (u) => u.searchParams.get("tab") === "bills",
      (p) =>
        p
          .getByRole("navigation", { name: "Customer" })
          .locator('a[aria-current="page"]', { hasText: "Bills" }),
    );

    // A Home recent row: `/?entry=` opens the entry over Home.
    await tapEveryTime(
      page,
      "/",
      (p) =>
        p.getByRole("region", { name: "Recent entries" }).locator(`a[href="/?entry=${capital}"]`),
      (u) => u.searchParams.get("entry") === capital,
      dialog("Capital in"),
    );
  });
});
