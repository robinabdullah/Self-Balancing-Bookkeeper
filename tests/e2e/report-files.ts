import { readFile } from "node:fs/promises";
import { type BrowserContext, type Locator, type Page, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { extractText } from "unpdf";

// The files and texts a Report sheet gives (D-040, D-045): Share PDF, Download Excel and the
// WhatsApp message, read back for the E2E specs (CR-034, CR-035).

/** wa.me is outside the app; the phone's share sheet keeps the file it was given (pdf.spec). */
export async function catchShares(page: Page, context: BrowserContext) {
  await context.route("https://wa.me/**", (route) => route.fulfill({ body: "WhatsApp" }));
  await page.addInitScript(() => {
    const w = window as unknown as { sharedPdf: { name: string; bytes: number[] } | null };
    w.sharedPdf = null;
    Object.defineProperty(navigator, "canShare", {
      value: (data: { files?: File[] }) => !!data.files?.length,
    });
    Object.defineProperty(navigator, "share", {
      value: async (data: { files?: File[] }) => {
        const file = data.files?.[0];
        if (file)
          w.sharedPdf = { name: file.name, bytes: [...new Uint8Array(await file.arrayBuffer())] };
      },
    });
  });
}

/** A detail page's ⋯ More → Statement: the Report sheet. */
export async function openStatementSheet(page: Page) {
  await page
    .getByRole("navigation", { name: "Quick actions" })
    .getByRole("button", { name: "More" })
    .click();
  await page
    .getByRole("dialog", { name: "More actions" })
    .getByRole("link", { name: "Statement" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Statement" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/**
 * Share PDF → the PDF's text. The app shares it on a touch screen that can share files, else
 * downloads it (share-pdf.tsx), so take whichever comes first.
 */
export async function pdfText(page: Page, sheet: Locator) {
  await page.evaluate(() => ((window as unknown as { sharedPdf: null }).sharedPdf = null));
  const download = page.waitForEvent("download");
  const shared = page.waitForFunction(
    () => (window as unknown as { sharedPdf: unknown }).sharedPdf,
  );
  await sheet.getByRole("button", { name: "Share PDF" }).click();
  const got = await Promise.race([download, shared]);
  download.catch(() => {});
  shared.catch(() => {});
  const bytes =
    "path" in got
      ? new Uint8Array(await readFile(await got.path()))
      : new Uint8Array(((await got.jsonValue()) as { bytes: number[] }).bytes);
  return (await extractText(bytes, { mergePages: true })).text;
}

/** Download Excel: every cell's text, one sheet after the other. */
export async function excelText(page: Page, sheet: Locator) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    sheet.getByRole("link", { name: "Download Excel" }).click(),
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  const cells: string[] = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => cells.push(String(c.text)))));
  return cells.join("\n");
}

/** WhatsApp message: the preview's text. */
export async function messageText(page: Page, sheet: Locator) {
  await sheet.getByRole("link", { name: "WhatsApp message" }).click();
  const preview = page.getByRole("dialog", { name: "Send on WhatsApp" });
  return preview.getByRole("textbox", { name: "Message" }).inputValue();
}
