import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";
import { PARTNER, SIGNED_OUT, loginAsPartner, noSideScroll } from "./helpers";
import { THEMES, pick, seedAccounts, seedCardDetails, setTheme, sql } from "./seed";

// CR-026 (D-046, D-051, D-052; UIDD §4.8, §4.13, §4.14): card details behind a fingerprint, masked
// to the last 4 digits, never revealed by password. CR-031 (D-054): a card's primary and
// supplementary numbers; one fingerprint reveals any of them for 30 s. CR-045 (D-067): a number is
// saved on one card only; the form groups the number and adds the expiry's "/" as you type. Chromium's virtual authenticator stands in
// for the phone's fingerprint. WebAuthn refuses an IP address as the site, so this spec runs on
// `localhost` (not 127.0.0.1) with a login of its own. At 360px and 1280px. Synthetic test
// numbers only.
const PORT = Number(process.env.E2E_PORT ?? 3001);
const ORIGIN = `http://localhost:${PORT}`;
test.use({ ...SIGNED_OUT, baseURL: ORIGIN });

const NUMBER = "5555555555554444"; // groups that differ, so the last 4 are visibly the last
const GROUPED = "5555 5555 5555 4444";
const AMEX = "378282246310005";

test.beforeEach(async ({ page, context }) => {
  await sql`delete from passkeys`;
  await sql`delete from card_secrets`;
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  await loginAsPartner(page);
});

test.afterAll(async () => {
  await sql`delete from passkeys`;
  await sql`delete from card_secrets`;
});

// Windows' clipboard turns "\n" into "\r\n".
const clipboard = async (page: Page) =>
  (await page.evaluate(() => navigator.clipboard.readText())).replaceAll("\r\n", "\n");

/** A platform authenticator with a fingerprint that always matches. */
async function fingerprint(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

async function setUpFingerprint(page: Page, wrongFirst = false) {
  await page.goto("/settings");
  const section = page.getByRole("group", { name: "Fingerprint unlock" });
  await expect(section.getByText("Not set up on any device yet.")).toBeVisible();
  await section.getByRole("button", { name: "Set up on this device" }).click();
  const form = page.getByRole("dialog", { name: "Set up fingerprint unlock" });
  if (wrongFirst) {
    await form.getByLabel("Your login password").fill("not-the-password");
    await form.getByRole("button", { name: "Continue" }).click();
    await expect(form.getByText("Wrong password")).toBeVisible();
  }
  await form.getByLabel("Your login password").fill(PARTNER.password);
  await form.getByRole("button", { name: "Continue" }).click();
  await expect(form).toBeHidden();
  await expect(
    section.getByText(/(Android phone|Windows computer|Linux computer|Mac) · added/),
  ).toBeVisible();
  return section;
}

test("E-CR-026.1 Settings → Fingerprint unlock: set up (password first), then remove", async ({
  page,
}) => {
  await fingerprint(page);
  const section = await setUpFingerprint(page, true);
  const [key] = await sql`select device_name, public_key from passkeys`;
  expect(key.device_name).toMatch(/Android phone|Windows computer|Linux computer|Mac/);
  expect(
    await sql`select after from audit_log where "table" = 'passkeys' and action = 'insert'
    order by at desc limit 1`,
  ).toEqual([{ after: { device: key.device_name } }]);

  await section.getByRole("button", { name: `Remove ${key.device_name}` }).click();
  const confirm = page.getByRole("dialog", { name: "Remove this device?" });
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(confirm).toBeHidden();
  await expect(section.getByText("Not set up on any device yet.")).toBeVisible();
  expect(await sql`select id from passkeys`).toHaveLength(0);
});

test("E-CR-026.2 the card's ⋯ → Card details: add, reveal with the fingerprint, copy, hides after 30 s", async ({
  page,
}) => {
  test.slow();
  await page.clock.install();
  await fingerprint(page);
  await setUpFingerprint(page);
  const s = await seedAccounts({ cardName: "EBL" });

  await page.goto(`/cards/${s.ids.card}`);
  await page
    .getByRole("navigation", { name: "Quick actions" })
    .getByRole("button", { name: "More" })
    .click();
  await page
    .getByRole("dialog", { name: "More actions" })
    .getByRole("link", { name: "Card details" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Card details" });
  await expect(sheet.getByText("No saved details for this card yet.")).toBeVisible();

  await sheet.getByRole("button", { name: "Add card details" }).click();
  const form = page.getByRole("dialog", { name: "Add card details" });
  await form.getByLabel("Cardholder name").fill("E2E Holder");
  await form.getByLabel("Card number").fill("5555 5555 5555 4443");
  await form.getByLabel("Expiry").fill("0927");
  await form.getByLabel("CVV").fill("123");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("This number doesn't look right — check the digits")).toBeVisible();
  await form.getByLabel("Card number").fill(GROUPED);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();

  const item = sheet.getByRole("listitem", { name: s.cardDisplay });
  await expect(item.getByText("•••• •••• •••• 4444", { exact: true })).toBeVisible();
  await expect(item.getByText(GROUPED)).toBeHidden();
  const [row] = await sql`select number, cvv from card_secrets where card_id = ${s.ids.card}`;
  expect(row.number).toMatch(/^v1\./);
  expect(`${row.number}${row.cvv}`).not.toContain(NUMBER);

  // The fingerprint reveals it: each field copies; the number without spaces.
  await item.getByRole("button", { name: "Reveal" }).click();
  await expect(item.getByText(GROUPED)).toBeVisible();
  await expect(item.getByText("09/27")).toBeVisible();
  await expect(item.getByText("Hides in 30 s")).toBeVisible();
  await item.getByRole("button", { name: "Copy card number" }).click();
  await expect.poll(() => clipboard(page)).toBe(NUMBER);
  await item.getByRole("button", { name: "Copy all" }).click();
  await expect
    .poll(() => clipboard(page))
    .toBe(`Cardholder: E2E Holder\nCard number: ${NUMBER}\nExpiry: 09/27\nCVV: 123`);
  await expect(item.getByRole("button", { name: /share/i })).toHaveCount(0); // no WhatsApp share
  expect(
    await sql`select after from audit_log where action = 'reveal' order by at desc limit 1`,
  ).toEqual([{ after: { card: s.ids.card, via: "fingerprint" } }]);

  // After 30 s it masks again.
  await page.clock.fastForward("00:31");
  await expect(item.getByText(GROUPED)).toBeHidden();
  await expect(item.getByRole("button", { name: "Reveal" })).toBeVisible();

  // Back closes the sheet.
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/cards/${s.ids.card}$`));
});

test("E-CR-026.3 Saved details → Cards: no fingerprint → Settings; then reveal one card at a time, edit, add, remove", async ({
  page,
}) => {
  test.slow();
  await fingerprint(page);
  const a = await seedAccounts({ cardName: "EBL" });
  const b = await seedAccounts({ cardName: "City" });
  const c = await seedAccounts({ cardName: "Brac" });
  await seedCardDetails(a.ids.card, { number: NUMBER, expiry: "09/27", cvv: "123" });
  await seedCardDetails(b.ids.card, { number: AMEX, holder: "E2E Amex", cvv: "1234" });

  await page.goto("/saved");
  const tabs = page.getByRole("navigation", { name: "Saved details" });
  await expect(tabs.getByRole("link", { name: "Bank accounts" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await tabs.getByRole("link", { name: "Cards" }).click();
  await expect(page).toHaveURL(/\/saved\?tab=cards$/);
  const first = page.getByRole("listitem", { name: a.cardDisplay });
  const second = page.getByRole("listitem", { name: b.cardDisplay });
  // D-051: only the last 4 digits, no expiry or CVV placeholders.
  await expect(first.getByText("•••• •••• •••• 4444", { exact: true })).toBeVisible();
  await expect(second.getByText("•••• •••• •••• 0005", { exact: true })).toBeVisible();

  // D-052: no fingerprint set up → no password box; a link to Settings instead.
  await first.getByRole("button", { name: "Reveal" }).click();
  await expect(first.getByRole("status")).toContainText(
    "Set up fingerprint unlock to see card details",
  );
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await first.getByRole("link", { name: "Settings → Fingerprint unlock" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await setUpFingerprint(page);

  // With the fingerprint: revealing another card masks the first.
  await page.goto("/saved?tab=cards");
  await first.getByRole("button", { name: "Reveal" }).click();
  await expect(first.getByText(GROUPED)).toBeVisible();
  await second.getByRole("button", { name: "Reveal" }).click();
  await expect(second.getByText("3782 8224 6310 005")).toBeVisible();
  await expect(first.getByText(GROUPED)).toBeHidden();

  // Edit while revealed: the form starts from the details.
  await second.getByRole("button", { name: `Edit ${b.cardDisplay} details` }).click();
  const form = page.getByRole("dialog", { name: "Edit card details" });
  await expect(form.getByLabel("Card number")).toHaveValue("3782 8224 6310 005"); // CR-045
  await expect(form.getByLabel("Cardholder name")).toHaveValue("E2E Amex");
  await form.getByLabel("Expiry").fill("10/28");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  await expect(second.getByText("•••• •••• •••• 0005", { exact: true })).toBeVisible();

  // Add picks one of the cards without details.
  await page.getByRole("button", { name: "Add card details" }).click();
  const add = page.getByRole("dialog", { name: "Add card details" });
  await pick(page, add, "Card", c.cardDisplay);
  await add.getByLabel("Card number").fill("4242 4242 4242 4242");
  await add.getByRole("button", { name: "Save" }).click();
  await expect(add).toBeHidden();
  await expect(
    page.getByRole("listitem", { name: c.cardDisplay }).getByText("•••• •••• •••• 4242"),
  ).toBeVisible();

  // Search by the last 4 digits.
  await page.getByRole("searchbox", { name: "Search saved cards" }).fill("0005");
  await expect(first).toBeHidden();
  await expect(second).toBeVisible();

  // Remove while revealed.
  await second.getByRole("button", { name: "Reveal" }).click();
  await expect(second.getByText("10/28")).toBeVisible();
  await second.getByRole("button", { name: `Remove ${b.cardDisplay} details` }).click();
  const confirm = page.getByRole("dialog", { name: "Remove card details?" });
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(confirm).toBeHidden();
  await expect(second).toBeHidden();
  expect(await sql`select id from card_secrets where card_id = ${b.ids.card}`).toHaveLength(0);

  // No audit row holds a value.
  const audit = JSON.stringify(
    await sql`select before, after from audit_log
    where "table" = 'card_secrets'`,
  );
  for (const secret of [NUMBER, AMEX, "E2E Amex", "v1."]) expect(audit).not.toContain(secret);

  // No horizontal scroll at 360px.
  await noSideScroll(page);
});

// E-CR-013.2 for CR-026: the revealed view needs a fingerprint (so localhost), in every theme.
for (const theme of THEMES) {
  test(`E-CR-013.2 the revealed card details have no axe violations (${theme})`, async ({
    page,
  }) => {
    await fingerprint(page);
    await setUpFingerprint(page);
    const s = await seedAccounts({ cardName: "EBL" });
    await seedCardDetails(s.ids.card, { number: NUMBER, holder: "E2E Holder", expiry: "09/27" });
    await seedCardDetails(s.ids.card, { number: AMEX, supplementary: true }); // CR-031
    await setTheme(theme);
    try {
      await page.goto(`/cards/${s.ids.card}?secret=1`);
      const sheet = page.getByRole("dialog", { name: "Card details" });
      await sheet
        .getByRole("listitem", { name: "Primary 4444" })
        .getByRole("button", { name: "Reveal" })
        .click();
      await expect(sheet.getByText(GROUPED)).toBeVisible();
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== "running"),
      );
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
      ).toEqual([]);
    } finally {
      await setTheme("night_owl");
    }
  });
}

/** How each reveal of these cards was unlocked, oldest first. */
const reveals = async (...cards: string[]) =>
  (
    await sql`select after from audit_log where action = 'reveal'
      and after->>'card' in ${sql(cards)} order by at`
  ).map((r) => r.after.via);

test("E-CR-031.1 a card holds its primary and supplementary numbers", async ({ page }) => {
  test.slow();
  const s = await seedAccounts({ cardName: "EBL" });
  await seedCardDetails(s.ids.card, { number: NUMBER });

  await page.goto(`/cards/${s.ids.card}?secret=1`);
  const sheet = page.getByRole("dialog", { name: "Card details" });
  // The card has a primary, so Add starts on Supplementary.
  await sheet.getByRole("button", { name: "Add card details" }).click();
  const form = page.getByRole("dialog", { name: "Add card details" });
  await expect(form.getByRole("radio", { name: "Supplementary" })).toBeChecked();
  await form.getByLabel("Cardholder name").fill("E2E Supp");
  await form.getByLabel("Card number").fill("4242 4242 4242 4242");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();

  // A second primary is refused.
  await sheet.getByRole("button", { name: "Add card details" }).click();
  await form.getByRole("radio", { name: "Primary" }).check();
  await form.getByLabel("Card number").fill("5105 1051 0510 5100");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(
    form.getByText("This card already has a primary — mark this one Supplementary"),
  ).toBeVisible();
  await form.getByRole("radio", { name: "Supplementary" }).check();
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();

  // One card, its numbers under it: the primary first.
  const card = sheet.getByRole("listitem", { name: s.cardDisplay });
  await expect(card.getByRole("listitem")).toHaveText([
    /Primary.*4444/,
    /Supplementary.*4242/,
    /Supplementary.*5100/,
  ]);
  expect(
    await sql`select last4, supplementary from card_secrets where card_id = ${s.ids.card}
      order by supplementary, last4`,
  ).toEqual([
    { last4: "4444", supplementary: false },
    { last4: "4242", supplementary: true },
    { last4: "5100", supplementary: true },
  ]);

  // Saved details → Cards lists the card once; Add still offers it.
  await page.goto("/saved?tab=cards");
  await expect(page.getByRole("listitem", { name: s.cardDisplay })).toHaveCount(1);
  await page.getByRole("button", { name: "Add card details" }).click();
  const add = page.getByRole("dialog", { name: "Add card details" });
  await pick(page, add, "Card", s.cardDisplay);
  await expect(add.getByRole("radio", { name: "Supplementary" })).toBeChecked();

  await noSideScroll(page);
});

test("E-CR-031.2 one fingerprint reveals any number for 30 s, one at a time", async ({ page }) => {
  test.slow();
  await page.clock.install();
  await fingerprint(page);
  await setUpFingerprint(page);
  const a = await seedAccounts({ cardName: "EBL" });
  const b = await seedAccounts({ cardName: "City" });
  await seedCardDetails(a.ids.card, { number: NUMBER });
  await seedCardDetails(a.ids.card, { number: "4242424242424242", supplementary: true });
  await seedCardDetails(b.ids.card, { number: AMEX });

  await page.goto("/saved?tab=cards");
  const primary = page
    .getByRole("listitem", { name: a.cardDisplay })
    .getByRole("listitem", { name: "Primary 4444" });
  const supp = page.getByRole("listitem", { name: "Supplementary 4242" });
  const other = page
    .getByRole("listitem", { name: b.cardDisplay })
    .getByRole("listitem", { name: "Primary 0005" });

  await primary.getByRole("button", { name: "Reveal" }).click();
  await expect(primary.getByText(GROUPED)).toBeVisible();
  expect(await reveals(a.ids.card, b.ids.card)).toEqual(["fingerprint"]);

  // 10 s later another card reveals with no fingerprint; the first masks; the countdown goes on.
  await page.clock.fastForward("00:10");
  await expect(primary.getByText("Hides in 20 s")).toBeVisible();
  await other.getByRole("button", { name: "Reveal" }).click();
  await expect(other.getByText("3782 8224 6310 005")).toBeVisible();
  await expect(primary.getByText(GROUPED)).toBeHidden();
  await expect(other.getByText(/Hides in (19|20) s/)).toBeVisible();
  await supp.getByRole("button", { name: "Reveal" }).click();
  await expect(supp.getByText("4242 4242 4242 4242")).toBeVisible();
  await expect(other.getByText("3782 8224 6310 005")).toBeHidden();
  expect(await reveals(a.ids.card, b.ids.card)).toEqual(["fingerprint", "window", "window"]);

  // The window ends 30 s after the fingerprint: masked, and the next Reveal asks again.
  await page.clock.fastForward("00:21");
  await expect(supp.getByText("4242 4242 4242 4242")).toBeHidden();
  await other.getByRole("button", { name: "Reveal" }).click();
  await expect(other.getByText("3782 8224 6310 005")).toBeVisible();
  expect(await reveals(a.ids.card, b.ids.card)).toEqual([
    "fingerprint",
    "window",
    "window",
    "fingerprint",
  ]);

  // Losing focus (the app switcher) masks it and ends the window.
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(other.getByText("3782 8224 6310 005")).toBeHidden();
  await primary.getByRole("button", { name: "Reveal" }).click();
  await expect(primary.getByText(GROUPED)).toBeVisible();
  // Hide ends it too.
  await primary.getByRole("button", { name: "Hide" }).click();
  await supp.getByRole("button", { name: "Reveal" }).click();
  await expect(supp.getByText("4242 4242 4242 4242")).toBeVisible();
  expect(await reveals(a.ids.card, b.ids.card)).toEqual([
    "fingerprint",
    "window",
    "window",
    "fingerprint",
    "fingerprint",
    "fingerprint",
  ]);
});

test("E-CR-045.1 the form formats as you type; a number saved on another card is refused", async ({
  page,
}) => {
  const a = await seedAccounts({ cardName: "EBL" });
  const b = await seedAccounts({ cardName: "City" });
  await seedCardDetails(a.ids.card, { number: NUMBER });

  await page.goto(`/cards/${b.ids.card}?secret=1`);
  const sheet = page.getByRole("dialog", { name: "Card details" });
  await sheet.getByRole("button", { name: "Add card details" }).click();
  const form = page.getByRole("dialog", { name: "Add card details" });
  const number = form.getByLabel("Card number");
  const expiry = form.getByLabel("Expiry");
  await number.pressSequentially(NUMBER);
  await expect(number).toHaveValue(GROUPED);
  // The "/" comes by itself, and Backspace takes it away again.
  await expiry.pressSequentially("01");
  await expect(expiry).toHaveValue("01/");
  await expiry.press("Backspace");
  await expect(expiry).toHaveValue("01");
  await expiry.pressSequentially("20");
  await expect(expiry).toHaveValue("01/20");
  // A past expiry warns but doesn't block.
  await expect(
    form
      .getByRole("status")
      .filter({ hasText: "This card expired in Jan 2020. It can still be saved." }),
  ).toBeVisible();

  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText(`This number is already saved on ${a.cardDisplay}`)).toBeVisible();
  await number.fill("");
  await number.pressSequentially("4242424242424242");
  await expect(number).toHaveValue("4242 4242 4242 4242");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  expect(await sql`select last4 from card_secrets where card_id = ${b.ids.card}`).toEqual([
    { last4: "4242" },
  ]);

  await noSideScroll(page);
});
