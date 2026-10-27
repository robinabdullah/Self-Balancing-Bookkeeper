import { type Locator, type Page, type TestInfo, expect, test } from "@playwright/test";
import { formatMonth } from "@/lib/dates";
import { type Card, billMonthOf } from "@/lib/engine/cards";
import { effectValue, goHome, noSideScroll } from "./helpers";
import { catchShares, excelText, messageText, openStatementSheet, pdfText } from "./report-files";
import { dhaka, phone, pick, picked, seedAccounts, sql } from "./seed";

// CR-035 (D-060; UIDD §4.6, §4.8, §4.17, §5): a Capital out paid by card ("Personal spend"). It
// adds to the card's bill and comes off the person's capital; Save first confirms what it will do;
// the card's lines name the person, the person's lines name the card; the Investor report splits
// Taken out (cash) / (card). At 360px and 1280px, a full-page screenshot of each screen for the
// user. Synthetic data only.

const EBL: Card = { id: "x", statementDay: 5, dueDay: 20 }; // seedAccounts' card days

test.beforeEach(async ({ page, context }) => {
  await catchShares(page, context);
  await goHome(page);
});

const shot = (page: Page, info: TestInfo, name: string) =>
  page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
const moves = (page: Page) => page.getByRole("list", { name: "Charges and credits" });
/** A period statement: a list on a phone, a table on desktop. */
const statement = (page: Page, name: string) =>
  page.getByRole(phone(page) ? "list" : "table", { name });
const rowsOf = (page: Page, scope: Locator) => scope.getByRole(phone(page) ? "listitem" : "row");
/** The confirm before saving a Capital out by card: "{person}'s personal spend". */
const confirmSheet = (page: Page) => page.getByRole("dialog", { name: /'s personal spend$/ });

test("E-CR-035.1 card page ⋯ Personal spend: prefilled, confirm (Back · Save), the card's lines", async ({
  page,
}, info) => {
  test.slow();
  const s = await seedAccounts({ cardName: "City Amex" });
  const base = `/cards/${s.ids.card}`;
  const bill = formatMonth(billMonthOf(EBL, dhaka()));
  await page.goto(base);

  // ⋯ More → New entry → Personal spend: Capital out with this card, Paid by Card.
  await page
    .getByRole("navigation", { name: "Quick actions" })
    .getByRole("button", { name: "More" })
    .click();
  await page
    .getByRole("dialog", { name: "More actions" })
    .getByRole("link", { name: "Personal spend" })
    .click();
  const form = page.getByRole("dialog", { name: "Capital out" });
  await expect(form.getByRole("radio", { name: "Capital out" })).toBeChecked();
  await expect(form.getByRole("radio", { name: "Card" })).toBeChecked();
  await expect(picked(form, "Card")).toHaveText(s.cardDisplay);
  await expect(picked(form, "Person")).toHaveText(/Pick a person/);

  // The card owner's spending on someone else's behalf: an investor here.
  await pick(page, form, "Person", s.names.investor);
  await form.getByRole("textbox", { name: "Amount" }).fill("2,206.90");
  await expect(effectValue(form, s.cardDisplay)).toHaveText("+৳2,206.90");
  await expect(effectValue(form, `${s.names.investor}'s capital`)).toHaveText("-৳2,206.90");
  await noSideScroll(page);
  await shot(page, info, "1-personal-spend-form");

  // Save → the confirm; Back keeps the form as typed and saves nothing.
  await form.getByRole("button", { name: "Save" }).click();
  const confirm = confirmSheet(page);
  const who = s.names.investor;
  await expect(confirm.getByRole("heading")).toHaveText(`${who}'s personal spend`);
  await expect(confirm).toContainText(
    `The business pays this with ${s.cardDisplay}'s bill. It comes off ${who}'s capital; it isn't a business cost.`,
  );
  const figures = confirm.getByRole("definition");
  await expect(confirm.getByRole("term")).toHaveText([
    `${s.cardDisplay}${bill} bill`,
    `${who}'s capital`,
    "Cash and profit",
  ]);
  await expect(figures).toHaveText(["+৳2,206.90", "-৳2,206.90", "no change"]);
  await expect(confirm).toContainText(
    `Shows on ${s.names.person}'s card statement as "Capital out · ${who}".`,
  );
  await expect(confirm).toContainText(`It lowers ${who}'s cash basis at the month's close.`);
  await noSideScroll(page);
  await shot(page, info, "2-confirm");
  await confirm.getByRole("button", { name: "Back" }).click();
  await expect(confirm).toBeHidden();
  await expect(form.getByRole("textbox", { name: "Amount" })).toHaveValue("2,206.90");
  expect(await sql`select id from money_entries where card_id = ${s.ids.card}`).toHaveLength(0);

  // Save → Save: saved, the toast with Undo, back on the card.
  await form.getByRole("button", { name: "Save" }).click();
  await confirmSheet(page).getByRole("button", { name: "Save" }).click();
  await page.waitForURL(base);
  await expect(page.getByRole("status").getByRole("button", { name: "Undo" })).toBeVisible();
  const [row] = await sql`select type, source, card_id, person_id, amount from money_entries
    where card_id = ${s.ids.card}`;
  expect(row).toEqual({
    type: "capital_out",
    source: "card",
    card_id: s.ids.card,
    person_id: s.ids.investor,
    amount: "2206.90",
  });

  // The card: the balance and the charge on its bill, named for the person.
  await expect(page.getByText("Balance ৳2,206.90").first()).toBeVisible();
  const charge = moves(page).getByRole("listitem").filter({ hasText: s.names.investor });
  await expect(charge).toContainText(`Capital out · ${s.names.investor}`);
  await expect(charge).toContainText(`Charge · ${bill} bill`);
  await noSideScroll(page);
  await shot(page, info, "3-card-page");

  // The card's statement for this month: the message, Excel and PDF name the person too.
  let sheet = await openStatementSheet(page);
  expect(await excelText(page, sheet)).toContain(`Capital out · ${s.names.investor}`);
  expect(await pdfText(page, sheet)).toContain(`Capital out · ${s.names.investor}`);
  expect(await messageText(page, sheet)).toContain(`Capital out · ${s.names.investor}: +৳2,206.90`);
  await page.goto(base);
  sheet = await openStatementSheet(page);
  await sheet.getByRole("link", { name: "View on screen" }).click();
  await page.waitForURL(/from=.*&to=/);
  await expect(
    rowsOf(page, statement(page, "Charges and credits")).filter({
      hasText: `Capital out · ${s.names.investor}`,
    }),
  ).toHaveCount(1);
  await shot(page, info, "4-card-statement-period");

  // The Journal names the kind: "Capital out · Card".
  await page.goto(`/journal?who=${s.ids.card}`);
  await expect(page.getByRole("list", { name: "Entries" })).toContainText("Capital out · Card");
});

test("E-CR-035.2 Capital in / out → Out → Card; the person page and the Investor report; cash has no confirm", async ({
  page,
}, info) => {
  test.slow();
  const s = await seedAccounts({ cardName: "City Amex" });

  // From New → More… → Capital in / out: Out, Paid by Card, the card.
  await page.goto("/money/new?type=capital_in");
  const form = page.getByRole("dialog", { name: "Capital in / out" });
  await expect(form.getByRole("radio", { name: "Card" })).toHaveCount(0); // Capital in: no Paid by
  await form.getByRole("radio", { name: "Capital out" }).check();
  await pick(page, form, "Person", s.names.investor);
  await form.getByRole("textbox", { name: "Amount" }).fill("1,500");
  await expect(effectValue(form, "Cash")).toHaveText("-৳1,500"); // Cash by default
  await form.getByRole("radio", { name: "Card" }).check();
  await pick(page, form, "Card", s.cardDisplay);
  await expect(effectValue(form, s.cardDisplay)).toHaveText("+৳1,500");
  await form.getByRole("button", { name: "Save" }).click();
  await confirmSheet(page).getByRole("button", { name: "Save" }).click();
  await page.waitForURL("/");

  // A cash Capital out saves with no confirm, as before.
  await page.goto("/money/new?type=capital_in");
  const cash = page.getByRole("dialog", { name: "Capital in / out" });
  await cash.getByRole("radio", { name: "Capital out" }).check();
  await pick(page, cash, "Person", s.names.investor);
  await cash.getByRole("textbox", { name: "Amount" }).fill("400");
  await cash.getByRole("button", { name: "Save" }).click();
  await page.waitForURL("/");
  await expect(confirmSheet(page)).toHaveCount(0);
  const rows = await sql`select source, card_id, amount from money_entries
    where person_id = ${s.ids.investor} order by amount`;
  expect(rows).toEqual([
    { source: "cash", card_id: null, amount: "400.00" },
    { source: "card", card_id: s.ids.card, amount: "1500.00" },
  ]);

  // The person page: the capital history names the card.
  await page.goto(`/people/${s.ids.investor}`);
  const history = page.getByRole(phone(page) ? "list" : "table", { name: "Capital history" });
  await expect(history).toContainText(`Capital out · ${s.cardDisplay}`);
  await expect(history).toContainText("Capital out");
  await noSideScroll(page);
  await shot(page, info, "5-person-page");

  // The Investor report: Taken out (cash) and Taken out (card), on screen, in the PDF and Excel.
  await page.goto(`/reports/investor?person=${s.ids.investor}`);
  const capital = page.getByRole("region", { name: "Capital" });
  await expect(capital).toContainText("Taken out (cash)");
  await expect(capital).toContainText("-৳400");
  await expect(capital).toContainText("Taken out (card)");
  await expect(capital).toContainText("-৳1,500");
  await noSideScroll(page);
  await shot(page, info, "6-investor-report");
  await page.getByRole("link", { name: "Share" }).click();
  const sheet = page.getByRole("dialog", { name: "Investor report" });
  expect(await pdfText(page, sheet)).toContain("Taken out (card)");
  expect(await excelText(page, sheet)).toContain("Taken out (card)");
});
