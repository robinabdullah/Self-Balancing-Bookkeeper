import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { localSql } from "../integration/local-db";
import { goHome } from "./helpers";

// Task 6.4 (UIDD §4.12, D-017): the download on a phone (and 1280px) and the "Last export" line.
// Earlier export rows are removed first, so the line starts at "never".
const sql = localSql();
test.afterAll(() => sql.end());

test.describe("Export (task 6.4)", () => {
  test.beforeEach(async ({ page }) => {
    await sql`delete from audit_log where action = 'export'`;
    await goHome(page);
  });

  test("E6.4.1 download works on mobile; the last export updates", async ({ page }) => {
    await page.goto("/export");
    await expect(page.getByRole("heading", { name: "Export" })).toBeVisible();
    await expect(page.getByTestId("last-export")).toHaveText("never");
    await expect(page.getByText(/every week/)).toBeVisible();

    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download all data (.xlsx)" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(
      /^demo-business-shop-\d{4}-\d{2}-\d{2}\.xlsx$/, // D-039: named after the business
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(await download.path());
    expect(wb.worksheets.map((w) => w.name)).toEqual(
      expect.arrayContaining(["Cash", "Stock", "Months", "money_entries (raw)"]),
    );

    await expect(page.getByTestId("last-export")).toHaveText(/^\d{2}:\d{2} by Test Partner$/);
  });
});
