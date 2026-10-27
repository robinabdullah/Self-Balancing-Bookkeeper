import { randomUUID } from "node:crypto";
import { type Page, expect, test } from "@playwright/test";
import { goHome, noSideScroll } from "./helpers";
import { pick, picked, seedAccounts, sql } from "./seed";

// E-CR-013.4 (UIDD §4.8; D-032): a detail page's quick actions open the form with that row picked
// and come back after Save or Cancel; tampered links are ignored. E-CR-018.1 (D-038): 2 main
// buttons + ⋯ More. At 360px and 1280px. Synthetic data only.
test.beforeEach(async ({ page }) => goHome(page));

const actions = (page: Page) => page.getByRole("navigation", { name: "Quick actions" });
const moreSheet = (page: Page) => page.getByRole("dialog", { name: "More actions" });
/** Opens ⋯ More and returns the sheet. */
async function openMore(page: Page) {
  await actions(page).getByRole("button", { name: "More" }).click();
  await expect(moreSheet(page)).toBeVisible();
  return moreSheet(page);
}
const pathOf = (page: Page) => {
  const u = new URL(page.url());
  return u.pathname + u.search;
};

test.describe("E-CR-013.4 quick actions", () => {
  // Each test walks through several pages; `next dev` can be slow late in a long run.
  test.slow();
  test("card: Pay card picks the card, saves and comes back with the balance lower", async ({
    page,
  }) => {
    const s = await seedAccounts();
    const base = `/cards/${s.ids.card}`;
    await page.goto(base);
    await actions(page).getByRole("link", { name: "Pay card" }).click();
    const form = page.getByRole("dialog", { name: "Card payment" });
    await expect(picked(form, "Card")).toHaveText(s.cardDisplay);
    await expect(form.getByRole("textbox", { name: "Amount" })).toHaveValue("");
    await form.getByRole("textbox", { name: "Amount" }).fill("2,500");
    await form.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(base);
    // No charges yet, so the payment leaves the card in credit (SRS §6.6).
    await expect(page.getByText("Card credit ৳2,500")).toBeVisible();

    // The other card forms pick it too.
    await page.goto(base);
    await actions(page).getByRole("link", { name: "Cash-out", exact: true }).click();
    await expect(picked(page.getByRole("dialog", { name: "Cash-out" }), "Card")).toHaveText(
      s.cardDisplay,
    );
    await page.goto(base);
    await (await openMore(page)).getByRole("link", { name: "Card fee" }).click();
    await expect(picked(page.getByRole("dialog", { name: "Card fee" }), "Card")).toHaveText(
      s.cardDisplay,
    );
    // Purchase on this card (in ⋯): paid by Card, the card picked; Cancel comes back.
    await page.goto(base);
    await (await openMore(page)).getByRole("link", { name: "Purchase" }).click();
    await expect(page.getByRole("radio", { name: "Card" })).toBeChecked();
    await expect(picked(page, "Card")).toHaveText(s.cardDisplay);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForURL(base);
  });

  test("customer, supplier and person actions pick their row", async ({ page }) => {
    const s = await seedAccounts();
    const customer = `/customers/${s.ids.customer}`;
    for (const [label, title, inMore] of [
      ["Payment in", "Payment in", false],
      ["Profit share", "Profit share", true],
      ["Discount", "Customer discount", true],
    ] as const) {
      await page.goto(customer);
      const from = inMore ? await openMore(page) : actions(page);
      await from.getByRole("link", { name: label, exact: true }).click();
      await expect(picked(page.getByRole("dialog", { name: title }), "Customer")).toHaveText(
        s.names.customer,
      );
    }
    // New sale: this customer, not the last sale's.
    await page.goto(customer);
    await actions(page).getByRole("link", { name: "Sale", exact: true }).click();
    await expect(page.getByRole("heading", { name: "New sale" })).toBeVisible();
    await expect(picked(page, "Customer")).toHaveText(s.names.customer);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForURL(customer);

    const supplier = `/suppliers/${s.ids.supplier}`;
    await page.goto(supplier);
    await actions(page).getByRole("link", { name: "Supplier payment" }).click();
    const pay = page.getByRole("dialog", { name: "Supplier payment" });
    await expect(picked(pay, "Supplier")).toHaveText(s.names.supplier);
    await pay.getByRole("button", { name: "Close" }).click();
    await page.waitForURL(supplier);
    await actions(page).getByRole("link", { name: "Purchase" }).click();
    await expect(picked(page, "Supplier")).toHaveText(s.names.supplier);

    const person = `/people/${s.ids.investor}`;
    await page.goto(person);
    await actions(page).getByRole("link", { name: "Capital in / out" }).click();
    const capital = page.getByRole("dialog", { name: "Capital in / out" });
    await expect(picked(capital, "Person")).toHaveText(s.names.investor);
    await capital.getByRole("textbox", { name: "Amount" }).fill("1,000");
    await capital.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(person);
    await expect(page.getByText("Capital ৳1,000")).toBeVisible();
    await expect(
      actions(page).getByRole("link", { name: "Profit paid / reinvested" }),
    ).toBeVisible();
  });

  test("Walk-in and inactive rows; Edit opens the row in Setup and comes back", async ({
    page,
  }) => {
    const s = await seedAccounts();
    const [walkIn] = await sql`select id from customers where is_system`;
    await page.goto(`/customers/${walkIn.id}`);
    await expect(actions(page).getByRole("link")).toHaveText(["Sale"]);
    await expect((await openMore(page)).getByRole("link")).toHaveText(["See in Journal"]);

    await sql`update cards set active = false where id = ${s.ids.card}`;
    await page.goto(`/cards/${s.ids.card}`);
    await expect(actions(page).getByRole("link")).toHaveCount(0);
    await expect((await openMore(page)).getByRole("link")).toHaveText([
      "Statement",
      "See in Journal",
      "Edit",
      "Card details",
    ]);
    await sql`update cards set active = true where id = ${s.ids.card}`;

    const base = `/suppliers/${s.ids.supplier}`;
    await page.goto(base);
    await (await openMore(page)).getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(
      (u) => u.pathname === "/setup" && u.searchParams.get("edit") === s.ids.supplier,
    );
    const form = page.getByRole("dialog", { name: /supplier/i });
    await expect(form.getByRole("textbox", { name: "Name" })).toHaveValue(s.names.supplier);
    await form.getByRole("button", { name: "Close" }).click();
    await page.waitForURL(base);

    await (await openMore(page)).getByRole("link", { name: "See in Journal" }).click();
    await page.waitForURL(
      (u) => u.pathname === "/journal" && u.searchParams.get("who") === s.ids.supplier,
    );
  });

  test("tampered links: an outside `from`, unknown or inactive ids and a bad amount are ignored", async ({
    page,
  }) => {
    const s = await seedAccounts();
    await page.goto(
      `/money/new?type=card_payment&from=//evil.example&cardId=${randomUUID()}&amount=-5`,
    );
    const form = page.getByRole("dialog", { name: "Card payment" });
    await expect(picked(form, "Card")).toHaveText("Pick a card");
    await expect(form.getByRole("textbox", { name: "Amount" })).toHaveValue("");
    await form.getByRole("button", { name: "Close" }).click();
    await page.waitForURL("/");
    expect(pathOf(page)).toBe("/");

    await sql`update cards set active = false where id = ${s.ids.card}`;
    await page.goto(`/money/new?type=card_payment&cardId=${s.ids.card}&amount=abc`);
    await expect(picked(page.getByRole("dialog", { name: "Card payment" }), "Card")).toHaveText(
      "Pick a card",
    );
    await sql`update cards set active = true where id = ${s.ids.card}`;
    // A picked row can still be changed: pre-fill is only a start.
    await page.goto(`/money/new?type=card_payment&cardId=${s.ids.card}&amount=100`);
    const again = page.getByRole("dialog", { name: "Card payment" });
    await expect(again.getByRole("textbox", { name: "Amount" })).toHaveValue("100");
    await pick(page, again, "Card", s.cardDisplay);
    await expect(picked(again, "Card")).toHaveText(s.cardDisplay);
  });
});

test.describe("E-CR-018.1 two main buttons + ⋯ More", () => {
  test.slow(); // several detail pages
  test("each page: 2 buttons + ⋯; every old action is in ⋯ with the same link; no side scroll", async ({
    page,
  }) => {
    const s = await seedAccounts();
    const pages: [string, string[], string[]][] = [
      [
        `/cards/${s.ids.card}`,
        ["Pay card", "Cash-out"],
        [
          "Card fee",
          "Purchase",
          "Personal spend",
          "Statement",
          "See in Journal",
          "Edit",
          "Card details",
        ],
      ],
      [
        `/customers/${s.ids.customer}`,
        ["Payment in", "Sale"],
        [
          "Profit share",
          "Discount",
          "Statement",
          "Due trend",
          "See in Journal",
          "Edit",
          "Bank accounts",
        ],
      ],
      [
        `/suppliers/${s.ids.supplier}`,
        ["Supplier payment", "Purchase"],
        ["Statement", "See in Journal", "Edit", "Bank accounts"],
      ],
      [
        `/people/${s.ids.investor}`,
        ["Capital in / out", "Profit paid / reinvested"],
        ["Investor report", "Statement", "See in Journal", "Edit", "Bank accounts"],
      ],
    ];
    for (const [path, main, more] of pages) {
      await page.goto(path);
      await expect(actions(page).getByRole("link")).toHaveText(main);
      await expect(actions(page).getByRole("button")).toHaveText(["More"]);
      const sheet = await openMore(page);
      await expect(sheet.getByRole("link")).toHaveText(more);
      // The same links as before (D-032): the row, the way back, the Journal filter.
      for (const link of await sheet.getByRole("link").all()) {
        const href = new URL((await link.getAttribute("href"))!, "http://x");
        const id = path.split("/")[2];
        if (href.pathname === "/journal") expect(href.searchParams.get("who")).toBe(id);
        // D-045: the Investor report page, with this person picked.
        else if (href.pathname === "/reports/investor")
          expect(href.searchParams.get("person")).toBe(id);
        // D-064: a customer's Due trend (its back link returns to the customer).
        else if (href.pathname.endsWith("/trend")) expect(href.pathname).toBe(`${path}/trend`);
        // D-039, D-040, D-046: the saved bank accounts, the Report sheet and the card details
        // open over this same page.
        else if (["bank", "report", "secret"].some((k) => href.searchParams.has(k)))
          expect(href.pathname).toBe(path);
        else expect(href.searchParams.get("from")).toBe(path);
      }
      await expect(sheet.getByRole("heading", { name: "Reports & share" })).toBeVisible();
      await noSideScroll(page);
    }
  });

  test("Back closes ⋯ and stays; Back from a form opened in ⋯ returns to the page", async ({
    page,
  }) => {
    const s = await seedAccounts();
    const base = `/cards/${s.ids.card}`;
    await page.goto(base);
    await openMore(page);
    await page.goBack();
    await expect(moreSheet(page)).toBeHidden();
    expect(pathOf(page)).toBe(base);
    await expect(actions(page)).toBeVisible();

    await (await openMore(page)).getByRole("link", { name: "Card fee" }).click();
    await expect(page.getByRole("dialog", { name: "Card fee" })).toBeVisible();
    await page.goBack();
    await page.waitForURL(base);
    await expect(moreSheet(page)).toBeHidden();
    await expect(actions(page)).toBeVisible();
  });
});
