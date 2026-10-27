import { type Page, expect, test } from "@playwright/test";
import { goHome } from "./helpers";
import { dhaka, phone, seedAccounts, seedMoney, setTheme } from "./seed";

// E-CR-013.1 (UIDD §2, §6; D-032, D-037): native controls follow the user's theme (dark in Dark
// and Night Owl), a date field's 📅 opens the
// phone's calendar while its text is typed (D-035), the dimmed page behind a sheet is visible, and
// modals are centred on desktop. A native dropdown's popup can't be captured, so its option
// colours are checked instead.

/** The sRGB pixel a CSS colour paints (computed colours may be oklch/oklab), with its alpha. */
async function rgba(page: Page, css: string) {
  return page.evaluate((c) => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  }, css);
}

function contrast([r1, g1, b1]: number[], [r2, g2, b2]: number[]) {
  const lum = (r: number, g: number, b: number) => {
    const [R, G, B] = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };
  const [a, b] = [lum(r1, g1, b1), lum(r2, g2, b2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** The journal's filter controls: the phone's sheet (opened) or the desktop bar. */
async function journalFilters(page: Page) {
  await page.goto("/journal");
  if (phone(page)) {
    await page.getByRole("button", { name: /^Filters/ }).click();
    return page.getByRole("dialog", { name: "Filters" });
  }
  return page.getByRole("region", { name: "Filters" });
}

/** Native controls are dark: color-scheme, and select options with readable contrast. */
async function expectDarkControls(page: Page) {
  const f = await journalFilters(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    "dark",
  );
  for (const name of ["Type", "Period"]) {
    const select = f.getByRole("combobox", { name, exact: true });
    const [bg, fg] = await select
      .locator("option")
      .first()
      .evaluate((o) => {
        const s = getComputedStyle(o);
        return [s.backgroundColor, s.color];
      });
    const [bgPx, fgPx] = [await rgba(page, bg), await rgba(page, fg)];
    expect(
      bgPx.slice(0, 3).every((v) => v < 100),
      `${name} option background ${bg}`,
    ).toBe(true);
    expect(contrast(bgPx, fgPx), `${name} option contrast`).toBeGreaterThanOrEqual(4.5);
    expect(await select.evaluate((e) => getComputedStyle(e).colorScheme)).toBe("dark");
  }
}

test.afterAll(() => setTheme("night_owl"));

test.describe("E-CR-013.1 dark mode", () => {
  // Each test walks through several pages; `next dev` can be slow late in a long run.
  test.slow();
  test.beforeEach(async ({ page }) => {
    await setTheme("dark");
    // Count calls to showPicker (the native picker itself can't be seen by the test).
    await page.addInitScript(() => {
      const w = window as unknown as { pickers: number };
      w.pickers = 0;
      HTMLInputElement.prototype.showPicker = function () {
        w.pickers += 1;
      };
    });
    await goHome(page);
  });

  test("native controls are dark: color-scheme, select options with readable contrast", async ({
    page,
  }) => {
    await expectDarkControls(page);
  });

  test("a date field's 📅 opens its (dark) calendar; its text is typed (D-035)", async ({
    page,
  }) => {
    const pickers = () => page.evaluate(() => (window as unknown as { pickers: number }).pickers);
    const f = await journalFilters(page);
    await f.getByRole("combobox", { name: "Period" }).selectOption("custom");
    await f.getByLabel("From", { exact: true }).click(); // the text box: typing, no calendar
    expect(await pickers()).toBe(0);
    const calendar = f.getByLabel("Open calendar").first();
    expect(await calendar.evaluate((e) => getComputedStyle(e).colorScheme)).toBe("dark");
    await calendar.click();
    expect(await pickers()).toBe(1);

    await page.goto("/money/new?type=card_payment");
    const dialog = page.getByRole("dialog", { name: "Card payment" });
    await dialog.getByLabel("Open calendar").click();
    expect(await pickers()).toBe(1); // a fresh page: counted from 0 again

    // The card bill-dates form (a card with one bill).
    const s = await seedAccounts();
    await seedMoney({
      type: "card_fee",
      amount: "100.00",
      card_id: s.ids.card,
      category: "card fee/interest",
      for_month: `${dhaka().slice(0, 7)}-01`,
    });
    await page.goto(`/cards/${s.ids.card}`);
    await page
      .getByRole("button", { name: /^Set .* bill dates$/ })
      .first()
      .click();
    await page
      .getByRole("dialog", { name: /bill dates$/ })
      .getByLabel("Open calendar")
      .first()
      .click();
    expect(await pickers()).toBe(1);
  });

  test("the page behind a sheet is dimmed; on desktop a modal is centred", async ({ page }) => {
    await page.goto("/money/new?type=card_payment");
    const dialog = page.getByRole("dialog", { name: "Card payment" });
    await expect(dialog).toBeVisible();
    const overlay = page.locator('[data-slot="sheet-overlay"]').first();
    const bg = await overlay.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect((await rgba(page, bg))[3], `overlay ${bg}`).toBeGreaterThanOrEqual(0.4 * 255);
    if (!phone(page)) {
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== "running"),
      );
      const box = (await dialog.boundingBox())!;
      const height = page.viewportSize()!.height;
      expect(box.y, "space above").toBeGreaterThan(8);
      expect(height - (box.y + box.height), "space below").toBeGreaterThan(8);
    }
  });
});

test.describe("E-CR-013.1 Night Owl", () => {
  test.beforeEach(async ({ page }) => {
    await setTheme("night_owl");
    await goHome(page);
  });

  test("native controls are dark in Night Owl too", async ({ page }) => {
    await expectDarkControls(page);
  });
});

test.describe("E-CR-013.1 light mode", () => {
  test.beforeEach(async ({ page }) => {
    await setTheme("light");
    await goHome(page);
  });

  test("native controls are light", async ({ page }) => {
    await page.goto("/journal");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      "light",
    );
  });
});
