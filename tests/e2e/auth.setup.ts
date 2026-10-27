import { test as setup } from "@playwright/test";
import { PARTNER_STATE, loginAsPartner } from "./helpers";

// D-047: one login per run; the mobile and desktop projects start every test with this session.
setup("log in as the partner", async ({ page }) => {
  await loginAsPartner(page);
  await page.context().storageState({ path: PARTNER_STATE });
});
