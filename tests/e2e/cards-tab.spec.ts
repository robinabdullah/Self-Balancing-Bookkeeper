import { randomUUID } from "node:crypto";
import { type Locator, expect, test } from "@playwright/test";
import { goHome, noSideScroll } from "./helpers";
import { dhaka, phone, seedAccounts, seedMoney, sql } from "./seed";

// The Cards tab (UIDD §4.8): the Type is said once beside the bank badge (CR-030, D-053); the
// search and the owner groups with their balance (CR-033, D-056). Other specs share the DB, so
// each test finds its own rows by their unique names. Synthetic data only.

test.beforeEach(async ({ page }) => {
  await goHome(page);
});

const visaCount = async (row: Locator) => ((await row.innerText()).match(/Visa/g) ?? []).length;

test("E-CR-030.1 Cards: the Type is said once beside the bank badge", async ({ page }) => {
  const s = await seedAccounts({ cardName: "EBL Visa" });
  await page.goto("/cards");
  // D-056: on a phone the card sits under its owner's heading, so the row names only the card.
  const row = phone(page)
    ? page
        .getByRole("list", { name: `${s.names.person}'s cards` })
        .getByRole("listitem")
        .filter({ hasText: s.names.card })
    : page.getByRole("table", { name: "Cards" }).getByRole("row").filter({ hasText: s.names.card });
  await expect(row).toBeVisible();
  await expect(row.locator("[data-bank]")).toHaveText("EBL");
  expect(await visaCount(row)).toBe(1);
});

test("E-CR-033.2 Cards: search, owner groups with their balance, phone rows without the owner", async ({
  page,
}) => {
  const s = await seedAccounts({ cardName: "City Amex" });
  const second = randomUUID();
  const ebl = `EBL Visa ${s.names.card.split(" ").at(-1)}`;
  await sql`insert into cards (id, owner_person_id, name, statement_day, due_day)
    values (${second}, ${s.ids.person}, ${ebl}, 5, 20)`;
  await seedMoney({
    type: "card_fee",
    amount: "5000",
    card_id: s.ids.card,
    category: "card fee/interest",
    for_month: `${dhaka().slice(0, 7)}-01`,
  });
  await seedMoney({ type: "card_payment", amount: "1000", card_id: second });

  await page.goto("/cards");
  const search = page.getByRole("searchbox", { name: "Search owner or card" });
  await search.fill(s.names.person);
  // The owner's heading: a heading over the list on a phone, a row of the table on desktop.
  const heading = phone(page)
    ? page.getByRole("region", { name: s.names.person }).getByRole("heading")
    : page
        .getByRole("table", { name: "Cards" })
        .getByRole("row")
        .filter({ hasText: `${s.names.person} · ` });
  await expect(heading).toHaveCount(1);
  await expect(heading).toContainText(`${s.names.person} · 2 cards`);
  // ৳5,000 owed on one card, ৳1,000 credit on the other: the heading nets them.
  await expect(heading).toContainText("৳4,000");

  await search.fill(`city amex ${s.names.card.split(" ").at(-1)}`);
  await expect(heading).toContainText(`${s.names.person} · 1 of 2 cards`);
  await expect(heading).toContainText("৳5,000");

  if (phone(page)) {
    const item = page
      .getByRole("list", { name: `${s.names.person}'s cards` })
      .getByRole("listitem");
    await expect(item).toHaveCount(1);
    await expect(item).toContainText(s.names.card);
    await expect(item).not.toContainText(s.names.person); // the owner is the heading
  } else {
    await expect(page.getByRole("table", { name: "Cards" }).getByRole("columnheader")).toHaveText([
      "Card",
      "Stmt day",
      "Due day",
      "Balance",
      "Available ≈",
      "Next due",
      "Amount",
      "Overdue",
      "Status",
    ]);
  }
  await search.fill(`nobody ${randomUUID()}`);
  await expect(page.getByText("No card matches this search.")).toBeVisible();
  await noSideScroll(page);
});
