import { expect, test } from "@playwright/test";
import { appName } from "@mbl/domain/business";
import { goHome } from "./helpers";
import { sql } from "./seed";

test("the app serves the home page to a signed-in partner", async ({ page }) => {
  // D-039: the top bar shows the business's short name, else its name (seeded by migration 0004).
  // Read from the DB: a local DB may have a short name set (D-065).
  const [profile] = await sql`select name, short_name from business_profile`;
  await goHome(page);
  await expect(
    page.getByRole("link", {
      name: appName({ name: profile.name, shortName: profile.short_name }),
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
});
