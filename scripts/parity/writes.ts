// N-1.1: the scripted write sequence. A partner's day through the UI (the same flows as the E2E
// specs): every server action N-3 rewrites leaves its audit row, and the export downloads.
// Fixed values only; the rows' ids come from the browser and are aliased in the audit dump.
import { type Page, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { localSql } from "../../tests/integration/local-db";
import { ids } from "./seed";

/** Save, then the form's confirm ("… on 20 Oct?") when it asks, then the "Saved" toast. */
async function save(page: Page, scope = page.getByRole("dialog").first()) {
  await scope.getByRole("button", { name: "Save", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: / on \d/ });
  const toast = page.getByRole("status").getByText(/^Saved/);
  await expect(confirm.or(toast).first()).toBeVisible();
  if (await confirm.isVisible()) await confirm.getByRole("button", { name: "Save" }).click();
  await expect(toast).toBeVisible();
}

/** The newest row's id in `table` (the one the step just saved). */
async function newest(table: "money_entries" | "sales" | "purchases") {
  const sql = localSql();
  const [row] = await sql`select id from ${sql(table)} order by created_at desc limit 1`;
  await sql.end();
  return row.id as string;
}

export async function writeSequence(page: Page): Promise<string> {
  const step = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (e) {
      throw new Error(`parity write "${name}" failed at ${page.url()}: ${e}`);
    }
  };

  await step("add a customer", async () => {
    await page.goto("/setup?tab=customer");
    await page.getByRole("button", { name: "Add customer" }).click();
    const form = page.getByRole("dialog", { name: "Add customer" });
    await form.getByLabel("Shop name").fill("Moon Electronics");
    await form.getByLabel("Proprietor name").fill("Jahid");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form).toBeHidden();
  });

  await step("an expense", async () => {
    await page.goto("/money/new?type=expense");
    const form = page.getByRole("dialog", { name: "Expense" });
    await form.getByRole("radio", { name: "Rent" }).check();
    await form.getByRole("textbox", { name: "Amount" }).fill("3,000");
    await save(page, form);
  });
  const expense = await newest("money_entries");

  await step("edit the expense", async () => {
    await page.goto(`/money/${expense}/edit`);
    const form = page.getByRole("dialog", { name: "Edit Expense" });
    await form.getByRole("textbox", { name: "Amount" }).fill("3,500");
    await form.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(`/journal?entry=${expense}`);
  });

  await step("delete the expense", async () => {
    await page.getByRole("dialog", { name: "Expense" }).getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("dialog", { name: "Delete this entry?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await page.waitForURL("/journal");
  });

  await step("a customer payment", async () => {
    await page.goto(`/money/new?type=customer_payment&customerId=${ids.star}`);
    const form = page.getByRole("dialog", { name: "Payment in" });
    await form.getByRole("textbox", { name: "Amount" }).fill("12,000");
    await save(page, form);
  });
  const payment = await newest("money_entries");

  await step("reverse the payment", async () => {
    await page.goto(`/customers/${ids.star}?entry=${payment}`);
    await page
      .getByRole("dialog", { name: /^Payment in/ })
      .getByRole("button", { name: "Reverse" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Reverse this entry?" });
    await dialog.getByRole("button", { name: "Reverse" }).click();
    await expect(page.getByRole("status").getByText("Reversed")).toBeVisible();
  });

  await step("a sale", async () => {
    await page.goto(`/sales/new?customerId=${ids.rahman}`);
    await page.getByRole("button", { name: "Model (line 1)" }).click();
    await page.getByRole("option", { name: /^Galaxy A15 · \d+ in stock/ }).click();
    await page.getByRole("textbox", { name: "Qty" }).fill("1");
    await page.getByRole("textbox", { name: "Unit price" }).fill("22,000");
    await save(page, page.locator("main"));
  });

  await step("a card purchase", async () => {
    await page.goto("/purchases/new");
    await page.getByRole("radio", { name: "Card" }).check();
    await page.getByRole("button", { name: "Card", exact: true }).click();
    await page.getByRole("option", { name: "Arif · EBL Visa" }).click();
    await page.getByRole("button", { name: "Model (line 1)" }).click();
    await page.getByRole("option", { name: /^iPhone 13/ }).click();
    await page.getByRole("textbox", { name: "Qty" }).fill("1");
    await page.getByRole("textbox", { name: "Unit cost" }).fill("70,000");
    await save(page, page.locator("main"));
  });

  await step("close September", async () => {
    await page.goto("/months/2026-09");
    await page.getByRole("button", { name: "Close month" }).click();
    const confirm = page.getByRole("dialog", { name: /^Close .*\?$/ });
    await confirm.getByRole("button", { name: "Close month" }).click();
    await expect(page.getByRole("status").getByText(/closed$/)).toBeVisible();
  });

  await step("re-open September", async () => {
    await page.getByRole("button", { name: "Re-open" }).click();
    await page.getByRole("dialog", { name: /^Re-open/ }).getByRole("button", { name: "Re-open" }).click();
    await expect(page.getByRole("status").getByText(/re-opened$/)).toBeVisible();
  });

  await step("business details", async () => {
    await page.goto("/settings");
    await page.getByRole("button", { name: /^Details/ }).click();
    const details = page.getByRole("dialog", { name: "Business details" });
    await details.getByLabel("Short name").fill("Demo Phones");
    await details.getByRole("button", { name: "Save" }).click();
    await expect(details).toBeHidden();
  });

  let exported = "";
  await step("export", async () => {
    await page.goto("/export");
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download all data (.xlsx)" }).click();
    const download = await downloading;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(await download.path());
    const cells = [download.suggestedFilename()];
    wb.eachSheet((ws) => {
      cells.push(`# ${ws.name}`);
      ws.eachRow((row) => row.eachCell((c) => cells.push(`${c.address}\t${c.text}`)));
    });
    exported = cells.join("\n");
  });
  return exported;
}
