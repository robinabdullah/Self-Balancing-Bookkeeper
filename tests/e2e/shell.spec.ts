import { expect, type Page, test } from "@playwright/test";
import { SIGNED_OUT, goHome, loginAsPartner, noSideScroll } from "./helpers";
import { phone, sql } from "./seed";

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const moreScreens = ["Months", "Journal", "Reports", "Saved details", "Setup", "Settings"];

// UIDD §1: no horizontal page scroll; tap targets ≥ 44px. Checks what is on screen now.
async function expectMobileFriendly(page: Page) {
  // Measure after sheets finish sliding in; sizes are rounded to whole pixels.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running"),
  );
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const small = [...document.querySelectorAll("a[href], button, label")]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => Math.round(box.width) < 44 || Math.round(box.height) < 44)
      .map(
        ({ el, box }) =>
          `${el.textContent?.trim() || el.getAttribute("aria-label")} ${box.width}×${box.height}`,
      );
    return { overflow: root.scrollWidth - root.clientWidth, small };
  });
  expect(result.overflow, "horizontal scroll").toBeLessThanOrEqual(0);
  expect(result.small, "tap targets under 44px").toEqual([]);
}

test.describe("app shell (task 1.6)", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("E1.6.1 at 360px: no horizontal scroll and tap targets ≥ 44px", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "360px check runs on the mobile project");
    for (const path of [
      "/money/new?type=card_payment",
      "/",
      "/stock",
      "/customers",
      "/people",
      "/settings",
    ]) {
      await page.goto(path);
      await expectMobileFriendly(page);
    }
    await nav(page).getByRole("button", { name: "New" }).click();
    await page.getByRole("button", { name: "More…" }).click();
    await expect(page.getByRole("link", { name: "Opening correction" })).toBeVisible();
    await expectMobileFriendly(page);
    await page.getByRole("button", { name: "Close" }).click();
    await nav(page).getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expectMobileFriendly(page);
  });

  // D-037: Form help moved from the More sheet to Settings.
  test("E1.6.2 the Form help setting persists across a reload", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("radio", { name: "Expanded" })).toBeChecked();
    await page.getByRole("radio", { name: "Collapsed" }).check();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Collapsed" })).toBeChecked();
    await page.getByRole("radio", { name: "Off" }).check();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Off" })).toBeChecked();
  });

  // Each click waits for its URL first: in a long run `next dev` recompiles a page it has unloaded,
  // which can take longer than one 5 s assertion (CR-013).
  test("1.6 acceptance: navigation works", async ({ page }) => {
    test.slow(); // ~8 pages in one test
    await nav(page).getByRole("link", { name: "Stock" }).click();
    await page.waitForURL("/stock");
    await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible();

    await nav(page).getByRole("link", { name: "Accounts" }).click();
    await page.waitForURL("/customers");
    await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeAttached();
    await page
      .getByRole("navigation", { name: "Accounts" })
      .getByRole("link", { name: "Cards" })
      .click();
    await page.waitForURL("/cards");
    await expect(page.getByRole("heading", { name: "Cards", exact: true })).toBeAttached();
    await page
      .getByRole("navigation", { name: "Accounts" })
      .getByRole("link", { name: "People" })
      .click();
    await page.waitForURL("/people");
    await expect(page.getByRole("heading", { name: "People", exact: true })).toBeAttached();

    // New → a type opens its form with the type already set (UIDD §3).
    await nav(page).getByRole("button", { name: "New" }).click();
    const sheet = page.getByRole("dialog", { name: "New" });
    await expect(sheet.getByRole("link")).toHaveText([
      "Sale",
      "Payment in",
      "Purchase",
      "Card payment",
      "Expense",
      "Cash-out",
      "Return",
    ]);
    await sheet.getByRole("link", { name: "Card payment" }).click();
    await expect(page).toHaveURL(/\/money\/new\?type=card_payment$/);
    await expect(page.getByRole("heading", { name: "Card payment" })).toBeVisible();
    await page.keyboard.press("Escape"); // the money form is a modal (task 3.7); closing goes home
    await page.waitForURL("/");

    // D-062: More on a phone; the sidebar lists Journal directly on desktop.
    if (phone(page)) {
      await nav(page).getByRole("button", { name: "More" }).click();
      await page
        .getByRole("dialog", { name: "More" })
        .getByRole("link", { name: "Journal" })
        .click();
    } else {
      await nav(page).getByRole("link", { name: "Journal" }).click();
    }
    await page.waitForURL("/journal");
    await expect(page.getByRole("heading", { name: "Journal" })).toBeVisible();

    await nav(page).getByRole("link", { name: "Home" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });

  // E-CR-013.9 (UIDD §3; D-032).
  test("E-CR-013.9 desktop sidebar lists More's screens; the phone's More is active on them; Closing → month", async ({
    page,
  }) => {
    const desktop = test.info().project.name === "desktop";
    await page.goto("/journal");
    if (desktop) {
      for (const label of ["Months", "Journal", "Reports", "Saved details", "Setup", "Settings"])
        await expect(nav(page).getByRole("link", { name: label })).toBeVisible();
      await expect(nav(page).getByRole("link", { name: "Journal" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      const closing = page.getByRole("banner").getByRole("link", { name: /^Closing: / });
      await expect(closing).toHaveAttribute("href", /^\/months\/\d{4}-\d{2}$/);
    } else {
      await expect(nav(page).getByRole("button", { name: "More" })).toHaveClass(/text-foreground/);
      await nav(page).getByRole("button", { name: "More" }).click();
      await expect(page.getByRole("link", { name: /^Closing: / })).toHaveAttribute(
        "href",
        /^\/months\/\d{4}-\d{2}$/,
      );
    }
  });

  // D-062: every sidebar link has an icon; desktop has no More (its items are all on screen).
  test("E-CR-037.1 desktop sidebar: an icon on every link, no More; Closing + user menu in the top bar", async ({
    page,
  }) => {
    test.skip(phone(page), "the desktop sidebar");
    await page.goto("/journal");
    const labels = ["Home", "Stock", "Accounts", ...moreScreens];
    for (const label of labels)
      await expect(nav(page).getByRole("link", { name: label }).locator("svg")).toBeVisible();
    await expect(nav(page).getByRole("button", { name: "New" }).locator("svg")).toBeVisible();
    await expect(nav(page).getByRole("link")).toHaveCount(labels.length);
    await expect(nav(page).getByRole("button", { name: "More" })).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link", { name: /^Closing: / })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("button", { name: "User menu" })).toBeVisible();
  });

  // D-062: the phone is unchanged: Home · New · Stock · Accounts · More, and the same More sheet.
  test("E-CR-037.2 phone: bottom bar keeps More; More's screens stay in its sheet", async ({
    page,
  }) => {
    test.skip(!phone(page), "the phone's bottom bar");
    for (const label of moreScreens)
      await expect(nav(page).getByRole("link", { name: label })).toBeHidden();
    await nav(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet.getByRole("link")).toHaveText([...moreScreens, /^Closing: /]);
    await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("E-CR-013.9 at 360px: no horizontal scroll on the CR-013 pages", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "360px check runs on the mobile project");
    const [card] = await sql`select id from cards limit 1`;
    const [customer] = await sql`select id from customers limit 1`;
    const paths = ["/journal", "/cards", `/customers/${customer.id}`];
    if (card) paths.push(`/cards/${card.id}`);
    for (const path of paths) {
      await page.goto(path);
      await noSideScroll(page, `${path}: horizontal scroll`);
    }
    await page.goto("/journal");
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page
      .getByRole("dialog", { name: "Filters" })
      .getByRole("combobox", { name: "Period" })
      .selectOption("custom");
    await noSideScroll(page, "journal filters: horizontal scroll");
  });
});

// Signs out, so it logs in with a session of its own (D-047).
test.describe("app shell: sign out", () => {
  test.use(SIGNED_OUT);

  test("desktop: Closing label and Sign out in the user menu", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "the user menu is desktop-only");
    await loginAsPartner(page);
    await expect(page.getByText(/^Closing: [A-Z][a-z]{2} \d{4}$/).first()).toBeVisible();
    await page.getByRole("button", { name: "User menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
