import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { localSql } from "../integration/local-db";
import { effectValue, goHome, noSideScroll } from "./helpers";
import { fillDate, phone, pick, seedAccounts } from "./seed";

// Task 3.7 (UIDD §4.6): the money entry modal at 360px and 1280px. Each run seeds its own
// person, card and supplier. Synthetic data only.
const sql = localSql();
test.afterAll(() => sql.end());

const inr = (n: number) => `৳${n.toLocaleString("en-IN")}`;

async function seed() {
  const run = randomUUID().slice(0, 8);
  const ids = { person: randomUUID(), card: randomUUID(), supplier: randomUUID() };
  const owner = `E2E Owner ${run}`;
  const card = `E2E Visa ${run}`;
  const supplier = `E2E Supplier ${run}`;
  await sql`insert into people (id, name, kind) values (${ids.person}, ${owner}, 'investor')`;
  await sql`insert into cards (id, owner_person_id, name, statement_day, due_day)
    values (${ids.card}, ${ids.person}, ${card}, 5, 20)`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, ${supplier})`;
  const entries = async (type: string) => {
    const [row] = await sql`select count(*)::int as n from money_entries
      where type = ${type} and (card_id = ${ids.card} or supplier_id = ${ids.supplier}
        or person_id = ${ids.person})`;
    return row.n as number;
  };
  return { ids, owner, card: `${owner} · ${card}`, supplier, entries };
}

test.describe("Money entry form (task 3.7)", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("3.7.1 cash-out: the live fee, the inline error, Save and Undo", async ({ page }) => {
    const { card, entries } = await seed();
    await page.goto("/money/new?type=card_cash_out");
    const dialog = page.getByRole("dialog", { name: "Cash-out" });
    await expect(dialog.getByText("Cash taken out through a card")).toBeVisible();

    await dialog.getByRole("button", { name: "Card", exact: true }).click();
    await page.getByRole("option", { name: card }).click();
    await dialog.getByRole("textbox", { name: "Charged to card" }).fill("10,201");
    await dialog.getByRole("textbox", { name: "Cash received" }).fill("10,000");
    await expect(dialog.getByText(`Fee (business expense): ${inr(201)}`)).toBeVisible();
    await expect(effectValue(dialog, "Cash")).toHaveText(`+${inr(10_000)}`);
    await expect(effectValue(dialog, card)).toHaveText(`+${inr(10_201)}`);
    await expect(effectValue(dialog, "Profit")).toHaveText("-৳201");

    await dialog.getByRole("textbox", { name: "Cash received" }).fill("10,202");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Cash received can't exceed amount charged")).toBeVisible();

    await dialog.getByRole("textbox", { name: "Cash received" }).fill("10,000");
    await dialog.getByRole("button", { name: "Save" }).click();
    // D-061: Save confirms a cash-out first.
    await page
      .getByRole("dialog", { name: /^Cash-out on / })
      .getByRole("button", { name: "Save" })
      .click();
    await page.waitForURL("/");
    const toast = page.getByRole("status");
    await expect(toast.getByText("Saved")).toBeVisible();
    expect(await entries("card_cash_out")).toBe(1);
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => entries("card_cash_out")).toBe(0);
  });

  test("3.7.1 expense: category chips, paid by card; for month follows the date", async ({
    page,
  }) => {
    const { card, entries } = await seed();
    await page.goto("/money/new?type=expense");
    const dialog = page.getByRole("dialog", { name: "Expense" });
    const forMonth = dialog.getByRole("combobox", { name: "For month" });
    const shown = await dialog.getByLabel("Date").inputValue(); // dd/mm/yyyy (D-035)
    const today = `${shown.slice(6)}-${shown.slice(3, 5)}-${shown.slice(0, 2)}`;
    await expect(forMonth).toHaveValue(today.slice(0, 7));

    // A date last month moves the for month with it, until the user sets it.
    const [y, m] = today.split("-").map(Number);
    const last = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    await fillDate(dialog.getByLabel("Date"), `${last}-15`);
    await expect(forMonth).toHaveValue(last);

    await dialog.getByRole("radio", { name: "Rent" }).check();
    await dialog.getByRole("textbox", { name: "Amount" }).fill("5,000");
    await dialog.getByRole("radio", { name: "Card" }).check();
    await dialog.getByRole("button", { name: "Card", exact: true }).click();
    await page.getByRole("option", { name: card }).click();
    await expect(effectValue(dialog, card)).toHaveText(`+${inr(5_000)}`);
    await expect(effectValue(dialog, "Profit")).toHaveText("-৳5,000");
    await fillDate(dialog.getByLabel("Date"), today); // last month may be closed in this database
    await expect(forMonth).toHaveValue(today.slice(0, 7));

    await noSideScroll(page, "horizontal scroll");

    await dialog.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");
    expect(await entries("expense")).toBe(1);
  });

  test("3.7.1 supplier payment from the purchase tip starts with that supplier", async ({
    page,
  }) => {
    const { ids, supplier } = await seed();
    await page.goto(`/money/new?type=supplier_payment&supplierId=${ids.supplier}`);
    const dialog = page.getByRole("dialog", { name: "Supplier payment" });
    await expect(dialog.getByRole("button", { name: "Supplier" })).toContainText(supplier);
    await dialog.getByRole("textbox", { name: "Amount" }).fill("20,000");
    await expect(effectValue(dialog, `We owe ${supplier}`)).toHaveText(`-${inr(20_000)}`);
    await expect(effectValue(dialog, "Cash")).toHaveText(`-${inr(20_000)}`);
  });

  test("3.7.1 capital in / out switch with chips; no type → the type picker", async ({ page }) => {
    const { owner, entries } = await seed();
    await page.goto("/money/new?type=capital_in");
    const dialog = page.getByRole("dialog", { name: "Capital in / out" });
    await dialog.getByRole("button", { name: "Person" }).click();
    await page.getByRole("option", { name: owner }).click();
    await dialog.getByRole("textbox", { name: "Amount" }).fill("1,00,000");
    await expect(effectValue(dialog, `${owner}'s capital`)).toHaveText(`+${inr(100_000)}`);
    await dialog.getByRole("radio", { name: "Capital out" }).check();
    await expect(effectValue(dialog, "Cash")).toHaveText(`-${inr(100_000)}`);
    await dialog.getByRole("button", { name: "Save" }).click();
    await page.waitForURL("/");
    expect(await entries("capital_out")).toBe(1);

    await page.goto("/money/new");
    const picker = page.getByRole("dialog", { name: "New entry" });
    await picker.getByRole("button", { name: "Type" }).click();
    await page.getByRole("option", { name: "Card payment" }).click();
    const picked = page.getByRole("dialog", { name: "Card payment" });
    await expect(picked.getByText("Business cash paid into a card bill.")).toBeVisible();
    await expect(picked.getByRole("button", { name: "Card", exact: true })).toBeVisible();
  });
});

// CR-030 (D-053): a phone's picker opens with its list in view, not the keyboard. CR-033 (D-056):
// the Cash-out's Fee % fills Cash received (never saved).
test.describe("Money entry form: pickers and Fee %", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("E-CR-030.3 Payment in → Customer: a phone shows the list, not the keyboard", async ({
    page,
  }) => {
    const s = await seedAccounts();
    await page.goto("/money/new?type=customer_payment");
    await page.getByRole("button", { name: "Customer", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Customer" });
    await expect(picker).toBeVisible();
    const search = picker.getByRole("searchbox", { name: "Search Customer" });
    if (phone(page)) {
      // Touch (Pixel 5): the sheet has focus, so no keyboard; the list is in view.
      await expect(picker).toBeFocused();
      await expect(search).not.toBeFocused();
      await expect(picker.getByRole("option").first()).toBeInViewport();
      // Tapping Search is what brings up the keyboard.
      await search.click();
      await expect(search).toBeFocused();
    } else {
      // A computer: typing filters at once.
      await expect(search).toBeFocused();
    }
    await search.fill(s.names.customer);
    await expect(picker.getByRole("option")).toHaveCount(1);
  });

  test("E-CR-033.1 Cash-out: Fee % fills Cash received; typing clears it; Save and Edit", async ({
    page,
  }) => {
    const s = await seedAccounts();
    await page.goto("/money/new?type=card_cash_out");
    const dialog = page.getByRole("dialog", { name: "Cash-out" });
    await pick(page, dialog, "Card", s.cardDisplay);
    const charged = dialog.getByRole("textbox", { name: "Charged to card" });
    const rate = dialog.getByRole("textbox", { name: "Fee % (optional)" });
    const received = dialog.getByRole("textbox", { name: "Cash received" });
    await expect(
      dialog.getByText("Type the agent's fee % and Cash received fills in."),
    ).toBeVisible();

    await charged.fill("280000");
    await rate.fill("1.3");
    await expect(received).toHaveValue("2,76,360");
    await expect(
      dialog.getByText("Fee (business expense): ৳3,640 · 1.3% of ৳2,80,000"),
    ).toBeVisible();
    await expect(effectValue(dialog, "Cash")).toHaveText("+৳2,76,360"); // the preview follows
    // A new charge refills it; exact to the paisa.
    await charged.fill("123457");
    await rate.fill("1.15");
    await expect(received).toHaveValue("1,22,037.24");
    await expect(
      dialog.getByText("Fee (business expense): ৳1,419.76 · 1.15% of ৳1,23,457"),
    ).toBeVisible();
    await rate.fill("abc");
    await expect(dialog.getByText("Enter a % like 1.3")).toBeVisible();

    // Typing in Cash received clears the %.
    await charged.fill("280000");
    await rate.fill("1.5");
    await expect(received).toHaveValue("2,75,800");
    await received.fill("276000");
    await expect(rate).toHaveValue("");
    await expect(
      dialog.getByText("Fee (business expense): ৳4,000 · 1.43% of ৳2,80,000"),
    ).toBeVisible();
    await noSideScroll(page);

    await dialog.getByRole("button", { name: "Save" }).click();
    // D-061: Save confirms a cash-out first.
    await page
      .getByRole("dialog", { name: /^Cash-out on / })
      .getByRole("button", { name: "Save" })
      .click();
    await page.waitForURL("/");
    const [row] = await sql`select id, card_charged, cash_received from money_entries
      where card_id = ${s.ids.card} and type = 'card_cash_out'`;
    expect([row.card_charged, row.cash_received]).toEqual(["280000.00", "276000.00"]);

    await page.goto(`/money/${row.id}/edit`);
    const edit = page.getByRole("dialog", { name: "Edit Cash-out" });
    await expect(edit.getByRole("textbox", { name: "Cash received" })).toHaveValue("2,76,000");
    await expect(edit.getByRole("textbox", { name: "Fee % (optional)" })).toHaveValue("");
    await expect(
      edit.getByText("Fee (business expense): ৳4,000 · 1.43% of ৳2,80,000"),
    ).toBeVisible();
  });
});
