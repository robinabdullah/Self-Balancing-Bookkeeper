import { expect, test } from "@playwright/test";
import { SIGNED_OUT, loginAsPartner, signOut } from "./helpers";

test.describe("auth (task 1.5)", () => {
  test.use(SIGNED_OUT); // it signs out, so it starts signed out (D-047)

  test("E1.5.1 anonymous / redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByText(/sign up/i)).toHaveCount(0);
  });

  test("E1.5.2 login goes home; sign out goes to /login", async ({ page }) => {
    await loginAsPartner(page);
    await expect(page).toHaveURL(/\/$/);
    await signOut(page);
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("E1.5.3 the session survives a reload", async ({ page }) => {
    await loginAsPartner(page);
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });
});
