import { randomBytes, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, dhakaToday } from "@mbl/domain/dates";
import { AlertsService } from "../../apps/api/src/alerts/alerts.service";
import { encryptField } from "../../apps/api/src/card-secrets/card-crypto";
import { CardSecretsDataService } from "../../apps/api/src/card-secrets/card-secrets-data.service";
import { type TestUser, deleteUsers, signedInUser, startApi } from "./api";
import { localSql } from "./local-db";
import { service } from "./services";

// CR-056 (SRS §11, §15; D-079, D-081): the alerts read only the month of each card's primary saved
// expiry, never throw (every page's shell reads them) and leak no card secret. They reach web in
// `/views/shell` (the bell) and `/views/cards/:id` (the fee chip), computed once per render.
// Synthetic data only (D-069).
const sql = localSql();
const NUMBER = "4111111111111111";
const HOLDER = "TEST HOLDER";
const CVV = "321";
let app: INestApplication;
let partner: TestUser;
let cardA: string;
let cardB: string;

beforeAll(async () => {
  process.env.CARD_SECRET_KEY = randomBytes(32).toString("base64");
  app = await startApi();
  partner = await signedInUser(sql, "partner");
});

beforeEach(async () => {
  await sql`truncate card_secrets, cards, money_entries cascade`;
  await sql`delete from people`;
  const [p] = await sql`insert into people (name, kind, profit_share_pct)
    values ('Arif', 'partner', 100) returning id`;
  [{ id: cardA }, { id: cardB }] = await sql`insert into cards
    (name, network, owner_person_id, statement_day, due_day, credit_limit) values
    ('EBL', 'visa', ${p.id}, 10, 25, 50000), ('City', 'amex', ${p.id}, 12, 27, null) returning id`;
});

afterAll(async () => {
  await sql`truncate card_secrets, cards, money_entries cascade`;
  await sql`delete from people`;
  await app.close();
  await deleteUsers(sql);
  await sql.end();
});

const expiryMonths = () => service(app, CardSecretsDataService).expiryMonths();
const loadAlerts = () => service(app, AlertsService).loadAlerts();
const get = (path: string, renderId?: string) =>
  request(app.getHttpServer())
    .get(path)
    .set({
      Authorization: `Bearer ${partner.token}`,
      ...(renderId ? { "X-Render-Id": renderId } : {}),
    });

/** A saved number as the action seals it (each field encrypted with the card id). */
async function save(cardId: string, expiry: string, supplementary = false) {
  const seal = (v: string) => encryptField(v, cardId);
  await sql`insert into card_secrets (card_id, supplementary, number, holder, expiry, cvv, last4)
    values (${cardId}, ${supplementary}, ${seal(NUMBER)}, ${seal(HOLDER)}, ${seal(expiry)},
      ${seal(CVV)}, '1111')`;
}

/** EBL's statement 10 days ahead, in its expiry month: a Soon fee alert. */
async function feeSoon() {
  const statement = addDays(dhakaToday(), 10);
  await sql`update cards set statement_day = ${Number(statement.slice(8))} where id = ${cardA}`;
  await save(cardA, `${statement.slice(5, 7)}/29`);
  return statement;
}

describe("CR-056 alerts in the api", () => {
  it("I-CR-056.1 expiryMonths: the primary's month only; no key → {}; a bad row is skipped", async () => {
    await save(cardA, "01/29");
    await save(cardA, "07/30", true); // a supplementary number isn't read
    expect(await expiryMonths()).toEqual({ [cardA]: 1 });

    // The result holds the month and nothing else of the card (no number, holder, year or CVV).
    expect(Object.values(await expiryMonths())).toEqual([1]);

    // Sealed with another card's id (or another key): unreadable, skipped, no throw.
    await sql`insert into card_secrets (card_id, number, expiry, last4)
      values (${cardB}, ${encryptField(NUMBER, cardA)}, ${encryptField("03/28", cardA)}, '1111')`;
    expect(await expiryMonths()).toEqual({ [cardA]: 1 });

    const key = process.env.CARD_SECRET_KEY;
    delete process.env.CARD_SECRET_KEY;
    try {
      expect(await expiryMonths()).toEqual({});
    } finally {
      process.env.CARD_SECRET_KEY = key;
    }
  });

  it("I-CR-056.1 loadAlerts: the fee alert from the saved expiry; no secret in the result", async () => {
    const statement = await feeSoon();
    const { alerts, noExpiryCards } = await loadAlerts();
    const fee = alerts.find((a) => a.kind === "card_fee");
    expect(fee).toMatchObject({ cardId: cardA, level: "soon", date: statement });
    expect(noExpiryCards).toBe(1); // City has none
    const json = JSON.stringify(alerts);
    for (const secret of [NUMBER, HOLDER, CVV, "1111"]) expect(json).not.toContain(secret);
  });

  it("I-CR-056.2 /views/shell carries the alerts, /views/cards/:id the card's fee; one load per render", async () => {
    const statement = await feeSoon();
    const expected = JSON.parse(JSON.stringify(await loadAlerts()));

    const build = vi.spyOn(app.get(CardSecretsDataService), "expiryMonths");
    const render = randomUUID();
    const shell = await get("/views/shell", render).expect(200);
    expect(shell.body.alerts).toEqual(expected);
    const card = await get(`/views/cards/${cardA}`, render).expect(200);
    expect(card.body.fee).toMatchObject({ kind: "card_fee", cardId: cardA, date: statement });
    expect((await get(`/views/cards/${cardB}`, render).expect(200)).body.fee).toBeNull();
    expect(build).toHaveBeenCalledTimes(1); // the layout's and the pages' calls share one load
    build.mockRestore();

    // The key never leaves the api: no secret in what web gets.
    for (const secret of [NUMBER, HOLDER, CVV])
      expect(JSON.stringify([shell.body, card.body])).not.toContain(secret);
  });
});
