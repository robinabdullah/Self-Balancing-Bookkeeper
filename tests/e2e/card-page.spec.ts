import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { addMonths, formatMonth } from "@mbl/domain/dates";
import { type Card, billDates, billMonthOf } from "@mbl/domain/engine/cards";
import { goHome } from "./helpers";
import { THEMES, dhaka, fillDate, seedAccounts, seedMoney, setTheme, sql } from "./seed";

// E-CR-013.5 (UIDD §4.8; D-032): the card page: bank badge, bill days, statements collapsed to
// what needs paying, Pay ৳remaining (split payments), Set dates, the EMI label. The expected bill
// months come from the engine's own rule (SRS §6), so the test holds on any day. Synthetic data.
test.beforeEach(async ({ page }) => goHome(page));

const EBL: Card = { id: "x", statementDay: 5, dueDay: 20 };
const statements = (page: Page) => page.getByRole("list", { name: "Statements" });
const billRow = (page: Page, month: string) =>
  statements(page)
    .getByRole("listitem")
    .filter({ hasText: formatMonth(month) });

test("E-CR-013.5 statements, Pay ৳remaining as a split payment, Set dates, EMI label", async ({
  page,
}) => {
  test.slow();
  const s = await seedAccounts({ cardName: "EBL Visa" });
  const today = dhaka();
  const [oldDate, curDate] = [dhaka(-75), dhaka(-40)];
  const [mOld, mCur, mEmi] = [oldDate, curDate, today].map((d) => billMonthOf(EBL, d));
  const fee = (date: string, amount: string) =>
    seedMoney({
      type: "card_fee",
      date,
      amount,
      card_id: s.ids.card,
      category: "card fee/interest",
      for_month: `${date.slice(0, 7)}-01`,
    });
  await fee(oldDate, "1500.00"); // paid below
  await seedMoney({ type: "card_payment", date: oldDate, amount: "1500.00", card_id: s.ids.card });
  await fee(curDate, "2000.00"); // billed, unpaid
  const [purchase, lot] = [randomUUID(), randomUUID()];
  await sql`insert into purchases (id, date, source, card_id, emi_months)
    values (${purchase}, ${today}, 'card', ${s.ids.card}, 5)`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${lot}, ${purchase}, ${s.ids.model}, 1, 5000)`;

  const base = `/cards/${s.ids.card}`;
  await page.goto(base);

  // Header: the bank badge (no Type chip, D-053), the name with its Type, the bill days.
  await expect(page.locator("h1")).toContainText("EBL");
  await expect(page.locator("h1")).toContainText("Visa");
  await expect(page.getByText("Statement 5th · Due 20th")).toBeVisible();

  // Statements: the unpaid billed bill and what's next; the paid one and later EMI bills wait.
  const emiOut = billDates(EBL, mEmi).statementDate <= today; // the EMI's first bill is already out
  const expected = [mCur, mEmi, ...(emiOut ? [addMonths(mEmi, 1)] : [])];
  await expect(statements(page).getByRole("listitem")).toHaveCount(expected.length);
  for (const m of expected) await expect(billRow(page, m)).toBeVisible();
  await expect(billRow(page, mOld)).toHaveCount(0);
  const toggle = page.getByRole("button", { name: "Show all 7 bills" });
  await toggle.click();
  await expect(statements(page).getByRole("listitem")).toHaveCount(7);
  await page.getByRole("button", { name: "Show fewer bills" }).click();

  // The EMI charge names its installments.
  await expect(
    page
      .getByRole("list", { name: "Charges and credits" })
      .getByText(`EMI 5 × ৳1,000 · from ${formatMonth(mEmi)}`),
  ).toBeVisible();

  // Pay ৳remaining sits on the oldest unpaid bill only; pay it in two parts.
  await expect(statements(page).getByRole("link", { name: /^Pay / })).toHaveCount(1);
  await billRow(page, mCur).getByRole("link", { name: "Pay ৳2,000" }).click();
  const form = page.getByRole("dialog", { name: "Card payment" });
  await expect(form.getByRole("textbox", { name: "Amount" })).toHaveValue("2,000");
  await form.getByRole("textbox", { name: "Amount" }).fill("1,200"); // a split payment
  await form.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(base);
  await expect(billRow(page, mCur)).toContainText("Remaining ৳800");
  await billRow(page, mCur).getByRole("link", { name: "Pay ৳800" }).click();
  await page
    .getByRole("dialog", { name: "Card payment" })
    .getByRole("button", { name: "Save" })
    .click();
  await page.waitForURL(base);
  // Paid: it moves behind Show all, and Pay moves to the next bill.
  await expect(billRow(page, mCur)).toHaveCount(0);
  await expect(billRow(page, mEmi).getByRole("link", { name: "Pay ৳1,000" })).toBeVisible();

  // Set dates on a later EMI bill: the bank's statement date shows as actual.
  const later = addMonths(mEmi, 2);
  await page.getByRole("button", { name: /^Show all/ }).click();
  await page.getByRole("button", { name: `Set ${formatMonth(later)} bill dates` }).click();
  const dates = page.getByRole("dialog", { name: `${formatMonth(later)} bill dates` });
  await fillDate(dates.getByRole("textbox", { name: "Actual statement date" }), `${later}-06`);
  await dates.getByRole("button", { name: "Save" }).click();
  await expect(billRow(page, later)).toContainText("(actual)");
});

async function clickSpot(page: Page, target: Locator) {
  // Centred: clear of the sticky top bar and of the bottom edge.
  await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// E-CR-014.1 (D-033): on a desktop table a click anywhere on a row opens it, not only the name.
test("E-CR-014.1 desktop tables: the whole row opens it", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "the tables show at ≥ 1024px");
  const s = await seedAccounts({ cardName: "City Visa" });
  // A bill, so the status badge says Upcoming.
  await seedMoney({
    type: "card_fee",
    amount: "250.00",
    card_id: s.ids.card,
    category: "card fee/interest",
    for_month: `${dhaka().slice(0, 7)}-01`,
  });
  await page.goto("/cards");
  const row = page
    .getByRole("table", { name: "Cards" })
    .getByRole("row")
    .filter({ hasText: s.names.card });
  await expect(row.getByText("City", { exact: true })).toBeVisible(); // the bank badge
  await expect(
    row.getByText(/^(Clear|Upcoming|Card credit|Due within 7 days|Overdue|Due today)$/),
  ).toHaveCSS("white-space", "nowrap");
  // Click where the Due day cell is, as a person would: the row's link covers it (Playwright's own
  // click refuses an element something else covers, so use the mouse at its spot).
  await clickSpot(page, row.getByRole("cell").nth(2)); // D-056: no Owner column
  await page.waitForURL(`/cards/${s.ids.card}`);

  // A statement row: the amount cell opens the entry over the page.
  await sql`insert into money_entries (type, date, amount, person_id) values ('capital_in', ${dhaka()}, 300, ${s.ids.investor})`;
  await page.goto(`/people/${s.ids.investor}`);
  await clickSpot(
    page,
    page
      .getByRole("table", { name: "Capital history" })
      .getByRole("row")
      .filter({ hasText: "Capital in" })
      .getByRole("cell")
      .last(),
  );
  await page.waitForURL(
    (u) => u.pathname === `/people/${s.ids.investor}` && u.searchParams.has("entry"),
  );
  await expect(page.getByRole("dialog", { name: "Capital in" })).toBeVisible();
});

// E-CR-034.1 (D-058; UIDD §4.8): a reversed card payment and its reversal stay in Charges and
// credits, greyed, and drop out of the bills: the bill it paid is due again, with Pay. Axe in the
// three themes. Synthetic data; the bill month comes from the engine's own rule (any day).
for (const theme of THEMES) {
  test(`E-CR-034.1 a reversed card payment: the greyed pair, its bill due again (${theme})`, async ({
    page,
  }, info) => {
    const s = await seedAccounts({ cardName: "EBL Mastercard" });
    const billed = dhaka(-40);
    const month = billMonthOf(EBL, billed);
    await seedMoney({
      type: "card_fee",
      date: billed,
      amount: "2000.00",
      card_id: s.ids.card,
      category: "card fee/interest",
      for_month: `${billed.slice(0, 7)}-01`,
    });
    const pay = await seedMoney({
      type: "card_payment",
      date: dhaka(-3),
      amount: "2000.00",
      card_id: s.ids.card,
    });
    await seedMoney({
      type: "card_payment",
      amount: "2000.00",
      card_id: s.ids.card,
      reverses_id: pay,
    });
    await setTheme(theme);
    try {
      await page.goto(`/cards/${s.ids.card}`);
      // The bill reads as if the payment had never been entered.
      await expect(billRow(page, month)).toContainText("Remaining ৳2,000");
      await expect(billRow(page, month).getByRole("link", { name: "Pay ৳2,000" })).toBeVisible();

      const moves = page.getByRole("list", { name: "Charges and credits" });
      const original = moves.getByRole("listitem").filter({ hasText: /^Card payment/ });
      const reversal = moves.getByRole("listitem").filter({ hasText: "Reversal of Card payment" });
      await expect(original).toContainText("Credit");
      await expect(original.getByText("Reversed", { exact: true })).toBeVisible();
      await expect(reversal).toContainText("Cancels the original");
      for (const row of [original, reversal])
        await expect(row.getByRole("link")).toHaveClass(/text-muted-foreground/);
      // The fee is still a plain charge on its bill.
      await expect(moves).toContainText(`Charge · ${formatMonth(month)} bill`);

      await moves.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`reversal-${theme}.png`), fullPage: true });
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== "running"),
      );
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
      ).toEqual([]);
    } finally {
      await setTheme("night_owl");
    }
  });
}
