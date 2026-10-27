import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { type Page, expect, test } from "@playwright/test";
import { billMonthOf } from "@/lib/engine/cards";
import { SIGNED_OUT, goHome } from "./helpers";
import { THEMES, dhaka, seedAccounts, seedCardDetails, seedMoney, setTheme, sql } from "./seed";

// E-CR-013.2 (UIDD §6; D-032, D-037): axe finds no serious or critical WCAG 2 A/AA problem on the
// main pages, in Light, Dark and Night Owl, at 360px and 1280px. Synthetic data only.

async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  return scan(page, path);
}

/** The page as it is now (an open form too). */
async function scan(page: Page, label: string) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running"),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${label} · ${v.id} (${v.impact}): ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(" | ")}`,
    );
}

test.afterAll(() => setTheme("night_owl"));

// D-037: the login page is always Night Owl (no user yet), including its error.
test.describe("E-CR-013.2 signed out", () => {
  test.use(SIGNED_OUT);

  test("E-CR-013.2 the login page and its error have no axe violations (Night Owl)", async ({
    page,
  }) => {
    const found = await audit(page, "/login");
    await page.getByLabel("Email").fill("nobody@test.local");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    await expect(page.locator("form").getByRole("alert")).toBeVisible();
    found.push(...(await scan(page, "/login error")));
    expect(found).toEqual([]);
  });
});

for (const theme of THEMES) {
  test.describe(`E-CR-013.2 accessibility (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await setTheme(theme);
      await goHome(page);
    });

    test(`no serious or critical axe violations (${theme})`, async ({ page }) => {
      test.slow(); // ~16 pages
      const s = await seedAccounts();
      const entry = await seedMoney({
        type: "card_payment",
        amount: "100.00",
        card_id: s.ids.card,
      });
      const paths = [
        "/",
        "/journal",
        `/journal?entry=${entry}`,
        "/cards",
        `/cards/${s.ids.card}`,
        `/customers/${s.ids.customer}`,
        `/customers/${s.ids.customer}?tab=bills`,
        `/suppliers/${s.ids.supplier}`,
        `/people/${s.ids.person}`,
        "/stock",
        "/months",
        "/setup",
        "/export",
        "/reports", // D-043
        "/reports/cash",
        "/reports/sales",
        "/settings",
        "/money/new?type=card_payment",
        "/sales/new",
        "/purchases/new",
      ];
      const found: string[] = [];
      for (const path of paths) found.push(...(await audit(page, path)));
      expect(found).toEqual([]);
    });

    // E-CR-040.1, E-CR-041.1 (D-064): the Charts page, its Report sheet, and the Profit tab's
    // detail pages. A task's new pages get a test of their own, named with its id, so the task's
    // local run picks them with `--grep` (D-065).
    test(`E-CR-041 the Charts pages have no axe violations (${theme})`, async ({ page }) => {
      const found: string[] = [];
      for (const path of [
        "/reports/charts",
        "/reports/charts?report=1",
        "/reports/charts/net-profit?period=12m",
        "/reports/charts/expenses?period=12m",
      ])
        found.push(...(await audit(page, path)));
      expect(found).toEqual([]);
    });

    // E-CR-042.1 (D-064): the Money tab and its four detail pages.
    test(`E-CR-042 the Money charts have no axe violations (${theme})`, async ({ page }) => {
      const found: string[] = [];
      for (const path of [
        "/reports/charts?tab=money",
        "/reports/charts/business-value?period=12m",
        "/reports/charts/cash?period=12m",
        "/reports/charts/card-debt?period=12m",
        "/reports/charts/profit-shares?period=12m",
      ])
        found.push(...(await audit(page, path)));
      expect(found).toEqual([]);
    });

    // E-CR-043.1 (D-064): the Customers tab, its three detail pages and a customer's Due trend.
    test(`E-CR-043 the Customer charts have no axe violations (${theme})`, async ({ page }) => {
      const s = await seedAccounts();
      const id = await seedMoney({
        type: "customer_cash_given",
        date: dhaka(-5),
        amount: "500",
        customer_id: s.ids.customer,
      });
      const found: string[] = [];
      for (const path of [
        "/reports/charts?tab=customers",
        "/reports/charts/customers-owe?period=12m",
        "/reports/charts/given-collected?period=12m",
        "/reports/charts/top-customers?by=profit",
        `/customers/${s.ids.customer}/trend`,
      ])
        found.push(...(await audit(page, path)));
      await sql`delete from money_entries where id = ${id}`;
      expect(found).toEqual([]);
    });

    // E-CR-044.1 (D-064): the Stock tab, Stock age (with an age's models) and Top models sold.
    test(`E-CR-044 the Stock charts have no axe violations (${theme})`, async ({ page }) => {
      const s = await seedAccounts();
      const [purchase, lot] = [randomUUID(), randomUUID()];
      await sql`insert into purchases (id, date, source, supplier_id)
        values (${purchase}, ${dhaka(-100)}, 'supplier_credit', ${s.ids.supplier})`;
      await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
        values (${lot}, ${purchase}, ${s.ids.model}, 2, 10000)`;
      const found: string[] = [];
      for (const path of [
        "/reports/charts?tab=stock",
        "/reports/charts/stock-age",
        "/reports/charts/stock-age?age=91",
        "/reports/charts/top-models?period=12m&by=profit",
      ])
        found.push(...(await audit(page, path)));
      await sql`delete from purchase_lines where id = ${lot}`;
      await sql`delete from purchases where id = ${purchase}`;
      expect(found).toEqual([]);
    });

    // E-CR-023.4 (D-043): the Cash book (a range, the Report sheet with its day chip, Count cash,
    // the day book message) and the Sales report's Report sheet and message.
    test(`the Cash book and Sales report sheets have no axe violations (${theme})`, async ({
      page,
    }) => {
      test.slow();
      const s = await seedAccounts();
      await seedMoney({ type: "customer_payment", amount: "321", customer_id: s.ids.customer });
      const month = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 7);
      const found = await audit(page, `/reports/cash?from=${month}-01&to=${month}-28`);
      found.push(...(await audit(page, "/reports/cash?report=1")));
      await page.goto("/reports/cash");
      await page.getByRole("button", { name: "Count cash" }).click();
      await page.getByLabel("Counted cash").fill("1");
      found.push(...(await scan(page, "cash count")));
      found.push(...(await audit(page, "/reports/cash?send=cash")));
      found.push(...(await audit(page, "/reports/sales?report=1")));
      found.push(...(await audit(page, "/reports/sales?send=sales")));
      expect(found).toEqual([]);
    });

    // E-CR-024.2 (D-044): a later open month's read-only view. A cashback two months back makes
    // the next month to close earlier than this month (only month-close.spec closes, and it re-opens).
    test(`a later open month's page has no axe violations (${theme})`, async ({ page }) => {
      await seedMoney({ type: "cashback", date: dhaka(-62), amount: "100", source: "cash" });
      const path = `/months/${dhaka().slice(0, 7)}`;
      const found = await audit(page, path);
      await expect(page.getByText(/^Open · close .+ first$/)).toBeVisible();
      expect(found).toEqual([]);
    });

    // E-CR-025.4 (D-045): the Investor report's list, a report and its Report sheet (whole
    // months), the Monthly pack and its sheet (from Months too), and a customer's By model.
    test(`the Investor report and Monthly pack have no axe violations (${theme})`, async ({
      page,
    }) => {
      test.slow();
      const s = await seedAccounts();
      await seedMoney({ type: "capital_in", amount: "500", person_id: s.ids.person });
      const month = dhaka().slice(0, 7);
      const person = `/reports/investor?person=${s.ids.person}`;
      const found = await audit(page, "/reports/investor");
      found.push(...(await audit(page, person)));
      found.push(...(await audit(page, `${person}&report=1`)));
      await page.getByRole("button", { name: "Custom" }).click();
      found.push(...(await scan(page, "investor sheet, months")));
      found.push(...(await audit(page, `/reports/pack?month=${month}`)));
      found.push(...(await audit(page, `/reports/pack?month=${month}&report=1`)));
      found.push(...(await audit(page, "/months?report=1")));
      found.push(
        ...(await audit(page, `/customers/${s.ids.customer}?from=${month}-01&to=${dhaka()}`)),
      );
      expect(found).toEqual([]);
    });

    // E-CR-039.1 (D-064): the Books balance sheet, opened from the top bar's chip.
    test(`the Books balance sheet has no axe violations (${theme})`, async ({ page }) => {
      await page.getByRole("button", { name: "Balanced" }).click();
      await expect(page.getByRole("dialog", { name: "Books balance" })).toBeVisible();
      expect(await scan(page, "books balance sheet")).toEqual([]);
    });

    // E-CR-016.5 (D-036): the card form with its Type chips and the amber name note.
    test(`the card form with its Type note has no axe violations (${theme})`, async ({ page }) => {
      await page.goto("/setup?tab=card");
      await page.getByRole("button", { name: "Add card" }).click();
      const form = page.getByRole("dialog", { name: "Add card" });
      await form.getByLabel("Card name").fill("EBL Visa");
      await form.getByRole("radio", { name: "Visa" }).check();
      await expect(form.getByText(/from the name/)).toBeVisible();
      expect(await scan(page, "card form")).toEqual([]);
    });

    // E-CR-035.1 (D-060): the Capital out by card confirm, opened from the card's Personal spend.
    test(`the Capital out by card confirm has no axe violations (${theme})`, async ({ page }) => {
      const s = await seedAccounts();
      await page.goto(`/money/new?type=capital_out&cardId=${s.ids.card}`);
      const form = page.getByRole("dialog", { name: "Capital out" });
      await form.getByRole("button", { name: "Person", exact: true }).click();
      await page.getByRole("option", { name: s.names.investor }).click();
      await form.getByRole("textbox", { name: "Amount" }).fill("2,206.90");
      await form.getByRole("button", { name: "Save" }).click();
      await expect(
        page.getByRole("dialog", { name: `${s.names.investor}'s personal spend` }),
      ).toBeVisible();
      expect(await scan(page, "capital out by card confirm")).toEqual([]);
    });

    // E-CR-036.2 (D-061): the cash-out confirm, and the Journal entry with its "What it did" rows.
    test(`the cash-out confirm and an entry's What it did have no axe violations (${theme})`, async ({
      page,
    }) => {
      const s = await seedAccounts();
      await page.goto("/money/new?type=card_cash_out");
      const form = page.getByRole("dialog", { name: "Cash-out" });
      await form.getByRole("button", { name: "Card", exact: true }).click();
      await page.getByRole("option", { name: s.cardDisplay }).click();
      await form.getByRole("textbox", { name: "Charged to card" }).fill("10,201");
      await form.getByRole("textbox", { name: "Cash received" }).fill("10,000");
      await form.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog", { name: /^Cash-out on / })).toBeVisible();
      expect(await scan(page, "cash-out confirm")).toEqual([]);
      const id = await seedMoney({
        type: "card_fee",
        amount: "150.00",
        card_id: s.ids.card,
        category: "card fee/interest",
      });
      await page.goto(`/journal?entry=${id}`);
      await expect(page.getByRole("heading", { name: "What it did" })).toBeVisible();
      expect(await scan(page, "entry What it did")).toEqual([]);
    });

    // E-CR-018.1 (D-038): a detail page's open ⋯ More sheet.
    test(`the open ⋯ More sheet has no axe violations (${theme})`, async ({ page }) => {
      const s = await seedAccounts();
      await page.goto(`/cards/${s.ids.card}`);
      await page
        .getByRole("navigation", { name: "Quick actions" })
        .getByRole("button", { name: "More" })
        .click();
      await expect(page.getByRole("dialog", { name: "More actions" })).toBeVisible();
      expect(await scan(page, "⋯ More")).toEqual([]);
    });

    // CR-020 (D-040): the Report sheet, a period statement and the send preview (How to pay on).
    test(`the Report sheet and the send preview have no axe violations (${theme})`, async ({
      page,
    }) => {
      test.slow();
      const s = await seedAccounts();
      await seedMoney({
        type: "customer_cash_given",
        amount: "500.00",
        customer_id: s.ids.customer,
      });
      await sql`insert into bank_accounts (bank_name, account_name, account_number)
        values ('EBL', 'E2E a11y pay', '1234567890')`;
      const base = `/customers/${s.ids.customer}`;
      const found = await audit(page, `${base}?report=1`);
      await page.getByRole("button", { name: "Custom" }).click();
      found.push(...(await scan(page, "report sheet")));
      const month = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 7);
      const range = `from=${month}-01&to=${month}-28`;
      found.push(...(await audit(page, `${base}?${range}`)));
      await page.goto(`${base}?send=reminder`);
      await page.getByRole("switch", { name: "Add How to pay" }).check();
      found.push(...(await scan(page, "send preview")));
      await sql`delete from bank_accounts where account_name = 'E2E a11y pay'`;
      expect(found).toEqual([]);
    });

    // CR-019 (D-039): Settings → Business, its Details, Messages and PDF terms sheets, and Saved
    // details.
    test(`Settings → Business and Saved details have no axe violations (${theme})`, async ({
      page,
    }) => {
      test.slow();
      await sql`insert into bank_accounts (bank_name, account_name, account_number, routing_number)
        values ('EBL', 'E2E a11y account', '1234567890', '095261234')`;
      const found = await audit(page, "/settings");
      await page.getByRole("button", { name: /^Details/ }).click();
      await expect(page.getByRole("dialog", { name: "Business details" })).toBeVisible();
      found.push(...(await scan(page, "business details")));
      await page.getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("button", { name: /^Messages/ }).click();
      await expect(page.getByRole("dialog", { name: "Messages" })).toBeVisible();
      found.push(...(await scan(page, "messages")));
      // CR-029 (D-049): the PDF terms sheet.
      await page.goto("/settings");
      await page.getByRole("button", { name: /^PDF terms/ }).click();
      await expect(page.getByRole("dialog", { name: "PDF terms" })).toBeVisible();
      found.push(...(await scan(page, "pdf terms")));
      found.push(...(await audit(page, "/saved")));
      await page.getByRole("button", { name: "Add bank account" }).click();
      await expect(page.getByRole("dialog", { name: "Add bank account" })).toBeVisible();
      found.push(...(await scan(page, "add bank account")));
      await sql`delete from bank_accounts where account_name = 'E2E a11y account'`;
      expect(found).toEqual([]);
    });

    // CR-026 (D-046, D-052): Saved details → Cards (masked, the "set up fingerprint" notice, Add),
    // the card's ⋯ → Card details sheet, and Settings → Fingerprint unlock. The revealed view
    // needs a fingerprint, so card-secrets.spec scans it (on localhost) in every theme.
    test(`card details have no axe violations (${theme})`, async ({ page }) => {
      test.slow();
      const s = await seedAccounts({ cardName: "EBL" });
      await seedCardDetails(s.ids.card, {
        number: "4242424242424242",
        expiry: "09/27",
        cvv: "123",
      });
      const found = await audit(page, "/saved?tab=cards");
      const item = page.getByRole("listitem", { name: s.cardDisplay });
      await item.getByRole("button", { name: "Reveal" }).click();
      await expect(item.getByRole("link", { name: "Settings → Fingerprint unlock" })).toBeVisible();
      found.push(...(await scan(page, "card notice")));
      await page.getByRole("button", { name: "Add card details" }).click();
      await expect(page.getByRole("dialog", { name: "Add card details" })).toBeVisible();
      found.push(...(await scan(page, "add card details")));
      found.push(...(await audit(page, `/cards/${s.ids.card}?secret=1`)));
      found.push(...(await audit(page, "/settings")));
      await sql`delete from card_secrets where card_id = ${s.ids.card}`;
      expect(found).toEqual([]);
    });

    // E-CR-034.3 (D-058, D-059): every card status badge (Overdue included), and every screen that
    // shows a reversal (the greyed pair, the Reversed and Reversal tags, "Reversal of …").
    test(`every card status and the reversal screens have no axe violations (${theme})`, async ({
      page,
    }) => {
      test.setTimeout(240_000); // ~14 pages
      const s = await seedAccounts({ cardName: "EBL Visa" });
      const billed = dhaka(-60); // its bill (statement 5th, due 20th) is long overdue
      const month = billMonthOf({ id: "x", statementDay: 5, dueDay: 20 }, billed);
      const card = async (status: string) => {
        const id = randomUUID();
        await sql`insert into cards (id, owner_person_id, name, statement_day, due_day)
          values (${id}, ${s.ids.person}, ${`E2E ${status} ${id.slice(0, 6)}`}, 5, 20)`;
        return id;
      };
      const fee = (cardId: string, date = billed) =>
        seedMoney({
          type: "card_fee",
          date,
          amount: "2000.00",
          card_id: cardId,
          category: "card fee/interest",
          for_month: `${date.slice(0, 7)}-01`,
        });
      const pay = (cardId: string, date = dhaka()) =>
        seedMoney({ type: "card_payment", date, amount: "2000.00", card_id: cardId });
      const dueOn = (cardId: string, due: string) =>
        sql`insert into card_bill_dates (card_id, bill_month, actual_due_date)
          values (${cardId}, ${`${month}-01`}, ${due})`;

      // One card in each status, each checked on its own page.
      const cards: [string, string][] = [];
      await fee(s.ids.card); // Overdue, with a reversed payment (below)
      cards.push(["Overdue", s.ids.card]);
      for (const [status, setUp] of [
        ["Due today", async (id: string) => (await fee(id), await dueOn(id, dhaka()))],
        ["Due within 7 days", async (id: string) => (await fee(id), await dueOn(id, dhaka(3)))],
        ["Upcoming", (id: string) => fee(id, dhaka())],
        ["Clear", async (id: string) => (await fee(id), await pay(id))],
        ["Card credit", (id: string) => pay(id)],
        ["Check dates", async (id: string) => (await fee(id), await dueOn(id, `${month}-05`))],
      ] as const) {
        const id = await card(status);
        await setUp(id);
        cards.push([status, id]);
      }

      // Reversals: a card payment, a customer payment, a supplier payment, a capital in.
      const reversed = async (values: Record<string, unknown>) =>
        seedMoney({ ...values, reverses_id: await seedMoney(values) });
      await reversed({ type: "card_payment", amount: "500.00", card_id: s.ids.card });
      await reversed({ type: "customer_payment", amount: "300.00", customer_id: s.ids.customer });
      await reversed({
        type: "supplier_payment",
        amount: "400.00",
        supplier_id: s.ids.supplier,
        source: "cash",
      });
      await reversed({ type: "capital_in", amount: "600.00", person_id: s.ids.person });

      const found = await audit(page, "/cards");
      for (const [status, id] of cards) {
        found.push(...(await audit(page, `/cards/${id}`)));
        // The badge under the name (not the Overdue / Due within 7 days facts).
        await expect(page.locator("main p", { hasText: new RegExp(`^${status}$`) })).toBeVisible();
      }
      await page.goto(`/cards/${s.ids.card}`);
      await expect(page.getByText("Reversal of Card payment")).toBeVisible();
      // E-CR-034.4: the open Reverse dialog with its "when to reverse" line.
      const toReverse = await seedMoney({
        type: "card_fee",
        amount: "100.00",
        card_id: s.ids.card,
        category: "card fee/interest",
        for_month: `${dhaka().slice(0, 7)}-01`,
      });
      await page.goto(`/cards/${s.ids.card}?entry=${toReverse}`);
      await page
        .getByRole("dialog", { name: "Card fee" })
        .getByRole("button", { name: "Reverse" })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Reverse this entry?" }).getByText(/^Only for an entry/),
      ).toBeVisible();
      found.push(...(await scan(page, "reverse dialog")));
      const today = dhaka();
      for (const path of [
        `/cards/${s.ids.card}?from=${today.slice(0, 8)}01&to=${today}`,
        `/customers/${s.ids.customer}`,
        `/suppliers/${s.ids.supplier}`,
        `/people/${s.ids.person}`,
        `/journal?who=${s.ids.card}`,
        "/reports/cash",
      ])
        found.push(...(await audit(page, path)));
      expect(found).toEqual([]);
    });
  });
}
