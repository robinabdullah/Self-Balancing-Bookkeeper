import { type Locator, type Page, expect } from "@playwright/test";

// Synthetic partner seeded into local Supabase Auth by global-setup.ts.
export const PARTNER = { email: "partner@test.local", password: "partner-test-password" };

/** The partner's session, saved once per run by auth.setup.ts; every test starts with it (D-047). */
export const PARTNER_STATE = "tests/e2e/.auth/partner.json";

/**
 * For a test that signs out or must start signed out. Sign out ends the session on the server,
 * and every other test shares the saved one, so such a test logs in with a session of its own.
 */
export const SIGNED_OUT = { storageState: { cookies: [], origins: [] } };

/** The E2E server's test-only key for saved card details (D-046; playwright.config.ts). */
export const E2E_CARD_KEY = Buffer.alloc(32, 7).toString("base64");

// Logs in through /login (UIDD §4.1: email + password) and waits for home.
export async function loginAsPartner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(PARTNER.email);
  await page.getByLabel("Password").fill(PARTNER.password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await page.waitForURL("/");
}

/** UIDD §1: no horizontal scroll (360 px included). */
export async function noSideScroll(page: Page, label = "horizontal scroll") {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, label).toBeLessThanOrEqual(0);
}

/** Opens Home with the saved session (it replaces a login per test). */
export async function goHome(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
}

// Sign out: in More on a phone, in the top bar's user menu on desktop (UIDD §3, D-062).
export async function signOut(page: Page) {
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name: "More" })
      .click();
    await page.getByRole("button", { name: "Sign out" }).click();
  } else {
    await page.getByRole("button", { name: "User menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
  }
}

/**
 * D-061 (UIDD §3, §4.10, §5): the amount of the row labelled exactly `label` in `scope`'s rows
 * ("What this will do", a confirm sheet, the Journal's "What it did").
 */
export function effectValue(scope: Page | Locator, label: string) {
  const page = "goto" in scope ? scope : scope.page();
  const exact = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return scope
    .locator("dl > div")
    .filter({ has: page.locator("dt > span:first-child", { hasText: exact }) })
    .locator("dd");
}
