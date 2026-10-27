import { type Page, expect, test } from "@playwright/test";
import { SIGNED_OUT, goHome, loginAsPartner } from "./helpers";
import { phone, setTheme, sql } from "./seed";

// CR-017 (D-037; UIDD §3, §4.13, §6): the Settings page, the More regroup and per-user themes.

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const htmlTheme = (page: Page) => page.locator("html");
const savedTheme = async () =>
  (
    await sql`select p.theme from profiles p join auth.users u on u.id = p.user_id
      where u.email = 'partner@test.local'`
  )[0].theme;
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.beforeEach(() => setTheme("night_owl"));
test.afterAll(() => setTheme("night_owl"));

// It starts on the login page, so it logs in with a session of its own (D-047).
test.describe("E-CR-017.1 signed out", () => {
  test.use(SIGNED_OUT);

  test("E-CR-017.1 the login page is Night Owl; a picked theme applies, saves and survives a reload", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", "night_owl");
    expect(await background(page)).toBe("rgb(1, 22, 39)"); // #011627
    await loginAsPartner(page);

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Night Owl" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Expanded" })).toBeChecked(); // Form help is here

    await page.getByRole("radio", { name: "Light" }).check();
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", "light"); // at once
    await expect.poll(savedTheme).toBe("light");
    await page.reload();
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
    // White: Turbopack's CSS writes oklch(1 0 0) as lab(100 0 0) (D-048).
    expect(await background(page)).toMatch(/^(oklch\(1 0 0\)|lab\(100 0 0\))$/);

    // A second change right away uses the new updatedAt (no "changed by someone else").
    await page.getByRole("radio", { name: "Dark", exact: true }).check();
    await expect.poll(savedTheme).toBe("dark");
    await expect(page.getByRole("group", { name: "Theme" }).getByRole("alert")).toHaveCount(0);

    // Another device follows the profile on its next page load.
    await page.goto("/");
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", "dark");
  });
});

test("E-CR-017.3 a change on another device: Settings shows it; a stale tap is undone", async ({
  page,
}) => {
  await goHome(page);
  await expect(htmlTheme(page)).toHaveAttribute("data-theme", "night_owl");
  // "Phone A" picks Dark; this page reaches Settings without a full load.
  await setTheme("dark");
  if (phone(page)) {
    await nav(page).getByRole("button", { name: "More" }).click();
    await page
      .getByRole("dialog", { name: "More" })
      .getByRole("link", { name: "Settings" })
      .click();
  } else await nav(page).getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  await expect(htmlTheme(page)).toHaveAttribute("data-theme", "dark");

  // "Phone A" changes it again while this Settings page is open: a tap here is undone.
  await sql`update profiles set theme = 'light', updated_at = now()
    where user_id = (select id from auth.users where email = 'partner@test.local')`;
  await page.getByRole("radio", { name: "Night Owl" }).check();
  const theme = page.getByRole("group", { name: "Theme" });
  await expect(theme.getByRole("alert")).toHaveText(
    "Your theme was changed on another device — reload the page",
  );
  await expect(page.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  await expect(htmlTheme(page)).toHaveAttribute("data-theme", "dark");
  expect(await savedTheme()).toBe("light");
  await page.reload();
  await expect(htmlTheme(page)).toHaveAttribute("data-theme", "light");
});

test("E-CR-017.2 More lists Months · Journal · Reports · Saved details · Setup · Settings · Closing; the sidebar matches", async ({
  page,
}) => {
  await goHome(page);
  await page.goto("/settings");
  if (phone(page)) {
    await expect(nav(page).getByRole("button", { name: "More" })).toHaveClass(/text-foreground/);
    await nav(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet.getByRole("link")).toHaveText([
      "Months",
      "Journal",
      "Reports", // D-043
      "Saved details", // D-039
      "Setup",
      "Settings",
      /^Closing: /,
    ]);
    await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(sheet.getByRole("radio")).toHaveCount(0); // Form help moved to Settings
  } else {
    for (const label of ["Months", "Journal", "Reports", "Saved details", "Setup", "Settings"])
      await expect(nav(page).getByRole("link", { name: label })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});
