import { randomUUID } from "node:crypto";
import { type Locator, type Page, type TestInfo, expect, test } from "@playwright/test";
import { formatMonth } from "@/lib/dates";
import { type Card, billMonthOf } from "@/lib/engine/cards";
import { effectValue, goHome, noSideScroll } from "./helpers";
import { dhaka, fillDate, pick, seedAccounts, seedMoney, sql } from "./seed";

// CR-036 (D-061; UIDD §3, §4.10, §5): one row style for what an entry does. The forms' "What this
// will do" rows (a card charge names its bill), the cash-out / opening-correction / profit-above-
// owed confirms (Back keeps the form), and the Journal entry's "What it did", Delete and Reverse
// rows and History rows. At 360px and 1280px, a full-page screenshot of each for the user.
// Synthetic data only. (A sale with Received now netting its customer row: sale.spec.)

const EBL: Card = { id: "x", statementDay: 5, dueDay: 20 }; // seedAccounts' card days

test.beforeEach(async ({ page }) => goHome(page));

/** A screenshot once the sheets have finished opening or closing. */
async function shot(page: Page, info: TestInfo, name: string, fullPage = true) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running"),
  );
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage });
}
/** A whole row (label, sub-line, amount) by its label. */
const rowOf = (scope: Page | Locator, label: string) => effectValue(scope, label).locator("..");

test("E-CR-036.1 the rows on a form; the cash-out, opening-correction and profit confirms", async ({
  page,
}, info) => {
  test.slow();
  const s = await seedAccounts({ cardName: "City Amex" });
  const bill = formatMonth(billMonthOf(EBL, dhaka()));
  const month = formatMonth(dhaka().slice(0, 7));

  // A card purchase: the card row names the bill the charge lands in.
  await page.goto("/purchases/new");
  await page.getByRole("radio", { name: "Card", exact: true }).check();
  await pick(page, page, "Card", s.cardDisplay);
  await pick(page, page, "Model (line 1)", s.names.model);
  await page.getByRole("textbox", { name: "Qty" }).fill("1");
  await page.getByRole("textbox", { name: "Unit cost" }).fill("10,000");
  await expect(rowOf(page, s.cardDisplay)).toHaveText(`${s.cardDisplay}${bill} bill+৳10,000`);
  await expect(effectValue(page, "Stock")).toHaveText("+৳10,000");
  await expect(effectValue(page, "Cash and profit")).toHaveText("no change");
  await noSideScroll(page);
  await shot(page, info, "1-purchase-rows");

  // Cash-out: Save confirms the charge, the cash and the fee; Back keeps the form.
  await page.goto("/money/new?type=card_cash_out");
  const cashOut = page.getByRole("dialog", { name: "Cash-out" });
  await pick(page, cashOut, "Card", s.cardDisplay);
  await cashOut.getByRole("textbox", { name: "Charged to card" }).fill("10,201");
  await cashOut.getByRole("textbox", { name: "Cash received" }).fill("10,000");
  await expect(effectValue(cashOut, "Profit")).toHaveText("-৳201");
  await shot(page, info, "2-cash-out-form");
  await cashOut.getByRole("button", { name: "Save" }).click();
  const cashConfirm = page.getByRole("dialog", { name: `Cash-out on ${s.cardDisplay}` });
  await expect(cashConfirm).toContainText(
    "৳10,201 goes on the card and ৳10,000 comes in as cash. The ৳201 difference is a fee, a business expense.",
  );
  await expect(cashConfirm.getByRole("term")).toHaveText([
    "Cash",
    `${s.cardDisplay}${bill} bill`,
    `Profit${month} · fee 1.97%`,
  ]);
  await expect(cashConfirm.getByRole("definition")).toHaveText(["+৳10,000", "+৳10,201", "-৳201"]);
  await noSideScroll(page);
  await shot(page, info, "3-cash-out-confirm");
  await cashConfirm.getByRole("button", { name: "Back" }).click();
  await expect(cashConfirm).toBeHidden();
  await expect(cashOut.getByRole("textbox", { name: "Cash received" })).toHaveValue("10,000");
  expect(await sql`select id from money_entries where card_id = ${s.ids.card}`).toHaveLength(0);
  await cashOut.getByRole("button", { name: "Save" }).click();
  await cashConfirm.getByRole("button", { name: "Save" }).click();
  await page.waitForURL("/");
  expect(
    await sql`select id from money_entries where card_id = ${s.ids.card} and type = 'card_cash_out'`,
  ).toHaveLength(1);

  // Opening correction: what was wrong, and each partner's opening difference. Never saved: the
  // shared books would need partners to split it for every later spec. A fresh run has none until
  // month-close.spec seeds them, so two stand in while the form is open.
  const [{ n }] = await sql`select count(*)::int as n from people
    where kind = 'partner' and active`;
  const stand = n === 0 ? [randomUUID(), randomUUID()] : [];
  for (const [i, id] of stand.entries())
    await sql`insert into people (id, name, kind, profit_share_pct)
      values (${id}, ${`E2E Partner ${i + 1} ${s.ids.person.slice(0, 8)}`}, 'partner', 50)`;
  try {
    await page.goto("/money/new?type=opening_correction");
    const fix = page.getByRole("dialog", { name: "Opening correction" });
    await fix.getByRole("radio", { name: "Customer due" }).check();
    await pick(page, fix, "Customer", s.names.customer);
    await fix.getByRole("textbox", { name: "Change (+ or −)" }).fill("500");
    await fix.getByRole("button", { name: "Save" }).click();
    const fixConfirm = page.getByRole("dialog", { name: "Correct the opening" });
    await expect(fixConfirm).toContainText(
      `${s.names.customer}'s due at opening was wrong. The fix goes to the partners' opening difference, not this month's profit.`,
    );
    await expect(effectValue(fixConfirm, `${s.names.customer} owes`)).toHaveText("+৳500");
    await expect(
      fixConfirm.getByRole("term").filter({ hasText: "opening difference" }),
    ).not.toHaveCount(0);
    await expect(effectValue(fixConfirm, "Cash and profit")).toHaveText("no change");
    await shot(page, info, "4-opening-correction-confirm");
    await fixConfirm.getByRole("button", { name: "Back" }).click();
    await expect(fixConfirm).toBeHidden();
    await expect(fix.getByRole("textbox", { name: "Change (+ or −)" })).toHaveValue("500");
    await fix.getByRole("button", { name: "Cancel" }).click();
    await page.waitForURL("/");
  } finally {
    if (stand.length) await sql`delete from people where id in ${sql(stand)}`;
  }
  expect(
    await sql`select id from money_entries where customer_id = ${s.ids.customer}`,
  ).toHaveLength(0);

  // Profit paid above the profit owed (a new investor is owed ৳0): the confirm says how much more.
  // At or below it there is no confirm (month-close.spec saves one; U-CR-036.2).
  await page.goto("/money/new?type=profit_paid");
  const paid = page.getByRole("dialog", { name: "Profit paid" });
  await pick(page, paid, "Person", new RegExp(`^${s.names.investor}`));
  await paid.getByRole("textbox", { name: "Amount" }).fill("600");
  await paid.getByRole("button", { name: "Save" }).click();
  const profitConfirm = page.getByRole("dialog", { name: `Pay ${s.names.investor}'s profit` });
  await expect(profitConfirm).toContainText(
    `This is ৳600 more than ${s.names.investor}'s profit owed (৳0).`,
  );
  await expect(effectValue(profitConfirm, `Profit owed to ${s.names.investor}`)).toHaveText(
    "-৳600",
  );
  await shot(page, info, "5-profit-above-owed-confirm");
  await profitConfirm.getByRole("button", { name: "Back" }).click();
  await expect(paid.getByRole("textbox", { name: "Amount" })).toHaveValue("600");
  expect(await sql`select id from money_entries where person_id = ${s.ids.investor}`).toHaveLength(
    0,
  );
});

test("E-CR-036.2 Journal: What it did, the Delete and Reverse rows, History rows", async ({
  page,
}, info) => {
  test.slow();
  const s = await seedAccounts({ cardName: "City Amex" });
  const today = dhaka();
  const bill = formatMonth(billMonthOf(EBL, today));
  const month = formatMonth(today.slice(0, 7));
  const id = await seedMoney({
    type: "expense",
    amount: "1200.00",
    source: "card",
    card_id: s.ids.card,
    category: "rent",
    for_month: `${today.slice(0, 7)}-01`,
  });

  // Edit it once from the form, so History has a change to show.
  await page.goto(`/money/${id}/edit`);
  const edit = page.getByRole("dialog", { name: "Edit Expense" });
  await edit.getByRole("textbox", { name: "Amount" }).fill("1,500");
  await edit.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(`/journal?entry=${id}`);
  await page.goto(`/journal?entry=${id}`); // fresh, without the save's toast over the sheet

  // What it did: the card charge on its bill, the month's profit.
  const sheet = page.getByRole("dialog", { name: /^Expense/ });
  const did = sheet.getByRole("definition").first();
  await expect(did).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "What it did" })).toBeVisible();
  await expect(rowOf(sheet, s.cardDisplay)).toHaveText(`${s.cardDisplay}${bill} bill+৳1,500`);
  await expect(rowOf(sheet, "Profit")).toHaveText(`Profit${month}-৳1,500`);
  await expect(effectValue(sheet, "Cash")).toHaveText("no change");
  await noSideScroll(page);
  await shot(page, info, "6-journal-what-it-did", false);

  // History: the edit as a row, field · old → new.
  await sheet.getByRole("tab", { name: "History" }).click();
  await expect(effectValue(sheet, "Amount")).toHaveText("৳1,200 → ৳1,500");
  await shot(page, info, "7-journal-history", false);
  await sheet.getByRole("tab", { name: "Details" }).click();

  // Delete: what deleting takes back, the same rows negated. Cancelled.
  await sheet.getByRole("button", { name: "Delete" }).click();
  const del = page.getByRole("dialog", { name: "Delete this entry?" });
  await expect(rowOf(del, s.cardDisplay)).toHaveText(
    `${s.cardDisplay}drops out of the ${bill} bill-৳1,500`,
  );
  await expect(effectValue(del, "Profit")).toHaveText("+৳1,500");
  await shot(page, info, "8-delete-rows", false);
  await del.getByRole("button", { name: "Cancel" }).click();
  await expect(del).toBeHidden();

  // Reverse: the reversal's rows follow its Date (none while it is incomplete).
  await sheet.getByRole("button", { name: "Reverse" }).click();
  const rev = page.getByRole("dialog", { name: "Reverse this entry?" });
  await expect(rowOf(rev, s.cardDisplay)).toHaveText(
    `${s.cardDisplay}drops out of the ${bill} bill-৳1,500`,
  );
  await expect(rowOf(rev, "Profit")).toHaveText(`Profit${month}+৳1,500`);
  const date = rev.getByRole("textbox", { name: "Date" });
  await date.fill("1");
  await expect(rev.getByText("Fill in the form to see the changes.")).toBeVisible();
  await fillDate(date, today);
  await expect(effectValue(rev, "Profit")).toHaveText("+৳1,500");
  await noSideScroll(page);
  await shot(page, info, "9-reverse-rows", false);
  // Reverse it: the original's card row now says it was on that bill, reversed (D-058).
  await rev.getByRole("button", { name: "Reverse" }).click();
  await expect(rev).toBeHidden();
  expect(await sql`select id from money_entries where reverses_id = ${id}`).toHaveLength(1);
  await page.goto(`/journal?entry=${id}`);
  await expect(rowOf(page.getByRole("dialog", { name: /^Expense/ }), s.cardDisplay)).toHaveText(
    `${s.cardDisplay}was on the ${bill} bill · reversed+৳1,500`,
  );
});
