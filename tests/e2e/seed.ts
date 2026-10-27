import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import postgres from "postgres";
import { type Theme, themes } from "@/lib/themes";
import { LOCAL_DB_URL } from "../integration/local-db";
import { E2E_CARD_KEY, PARTNER } from "./helpers";

// CR-013 E2E (D-032): synthetic rows each spec seeds for itself (D-014), and small page helpers.

// One connection for every spec file in the worker (Playwright caches this module), so no file
// ends it; it closes itself when idle.
export const sql = postgres(LOCAL_DB_URL, { max: 1, idle_timeout: 5, onnotice: () => {} });

/** D-065: the themes the per-theme tests run in: all three (CI, before a deploy), or the comma list
 * in E2E_THEMES (a task's local run: `E2E_THEMES=night_owl`). */
export const THEMES: readonly Theme[] = process.env.E2E_THEMES
  ? themes.filter((t) => process.env.E2E_THEMES!.split(",").includes(t))
  : themes;
if (THEMES.length === 0) throw new Error(`E2E_THEMES names no theme (${themes.join(", ")})`);

/** D-037: the test partner's theme (the root layout reads it on each full page load). */
export async function setTheme(theme: Theme) {
  await sql`update profiles set theme = ${theme}
    where user_id = (select id from auth.users where email = ${PARTNER.email})`;
}

/** Today and nearby days in Dhaka, as the app sees them. */
export const dhaka = (days = 0) =>
  new Date(Date.now() + 6 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);

export const phone = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A person who owns a card, another person, a customer, a supplier and a model, all with
 * unique names. */
export async function seedAccounts(
  opts: { cardName?: string; statementDay?: number; dueDay?: number } = {},
) {
  const run = randomUUID().slice(0, 8);
  const ids = {
    person: randomUUID(),
    investor: randomUUID(),
    card: randomUUID(),
    customer: randomUUID(),
    supplier: randomUUID(),
    model: randomUUID(),
  };
  const names = {
    person: `E2E Owner ${run}`,
    investor: `E2E Investor ${run}`,
    card: `${opts.cardName ?? "EBL Visa"} ${run}`,
    customer: `E2E Shop ${run} (Owner)`,
    supplier: `E2E Supplier ${run}`,
    model: `E2E Model ${run}`,
  };
  // Investors, not partners: the partners' shares (and so every close in other specs) stay as
  // they are.
  await sql`insert into people (id, name, kind) values
    (${ids.person}, ${names.person}, 'investor'),
    (${ids.investor}, ${names.investor}, 'investor')`;
  await sql`insert into cards (id, owner_person_id, name, statement_day, due_day)
    values (${ids.card}, ${ids.person}, ${names.card}, ${opts.statementDay ?? 5}, ${opts.dueDay ?? 20})`;
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.customer}, 'Owner', ${`E2E Shop ${run}`})`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, ${names.supplier})`;
  await sql`insert into models (id, name) values (${ids.model}, ${names.model})`;
  return { ids, names, cardDisplay: `${names.person} · ${names.card}` };
}

/** A money entry dated `date` (default today), returning its id. */
export async function seedMoney(values: Record<string, unknown>) {
  const id = randomUUID();
  const row = { id, date: dhaka(), ...values };
  await sql`insert into money_entries ${sql(row as Record<string, string>)}`;
  return id;
}

/** "2026-10-05" → "05/10/2026", as a date box shows it (D-035). */
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Type a date into a dd/mm/yyyy box (D-035); `date` is ISO ("2026-10-05") or dd/mm/yyyy. */
export async function fillDate(field: Locator, date: string) {
  await field.fill(/^\d{4}-/.test(date) ? dmy(date) : date);
}

/** Pick `option` in the picker labelled `field` (UIDD §1.2). */
export async function pick(
  page: Page,
  scope: Page | Locator,
  field: string,
  option: string | RegExp,
) {
  await scope.getByRole("button", { name: field, exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

/** The value a picker shows (its button text). */
export const picked = (scope: Page | Locator, field: string) =>
  scope.getByRole("button", { name: field, exact: true });

/**
 * A card's saved details (D-046), sealed as the app seals them (AES-256-GCM, the card id as extra
 * data) with the E2E server's test key. Synthetic test numbers only.
 */
export async function seedCardDetails(
  cardId: string,
  d: { number: string; holder?: string; expiry?: string; cvv?: string; supplementary?: boolean },
) {
  const seal = (text?: string) => {
    if (text === undefined) return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(E2E_CARD_KEY, "base64"), iv);
    cipher.setAAD(Buffer.from(cardId));
    const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return ["v1", iv, cipher.getAuthTag(), data].map((p) => p.toString("base64url")).join(".");
  };
  await sql`insert into card_secrets (card_id, number, holder, expiry, cvv, last4, supplementary)
    values (${cardId}, ${seal(d.number)}, ${seal(d.holder)}, ${seal(d.expiry)}, ${seal(d.cvv)},
      ${d.number.slice(-4)}, ${d.supplementary ?? false})`;
}
