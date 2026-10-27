import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { POST } from "@/app/(app)/cards/[id]/reveal/route";
import { rowId } from "@mbl/domain/validation/fields";
import {
  DUPLICATE_NUMBER,
  NO_KEY,
  ONE_PRIMARY,
  REVEAL_FIRST,
  USE_FINGERPRINT,
} from "@mbl/domain/card-secrets";
import { removeCardDetails, saveCardDetails } from "@/server/actions/card-secrets";
import {
  fingerprintSetupOptions,
  registerFingerprint,
  removeFingerprint,
  revealOptions,
} from "@/server/actions/passkeys";
import { loadBooks } from "@/server/books";
import { signRevealWindow } from "@/server/card-crypto";
import { loadCardSecrets } from "@/server/card-secrets";
import { LOCKED, WRONG_PASSWORD, resetPasswordTries } from "@/server/password-check";
import { localSupabase } from "../e2e/local-supabase";
import { type TestUser, as, startApi } from "./api";
import { localSql } from "./local-db";

// CR-026 (D-046, D-052; SRS §11; UIDD §4.13, §4.14): card details are stored encrypted and leave
// the server only through the `no-store` reveal route, after a fresh one-time fingerprint
// challenge of your own; never for a password. The password (checked against local Supabase Auth)
// gates only fingerprint set-up. No audit row holds a value. The session, `revalidatePath`, the
// request headers and the WebAuthn signature checks are stood in for; the challenge handling
// around them is real. N-3.1: deleting a card goes through the api (the facade), signed in as the
// same partner. Synthetic test numbers only.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ host: "localhost:3000", "user-agent": "Mozilla/5.0 (Linux; Android 14)" }),
}));
vi.mock("@simplewebauthn/server", async (original) => ({
  ...(await original<typeof import("@simplewebauthn/server")>()),
  verifyAuthenticationResponse: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
}));

const sql = localSql();
const { url, anonKey, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const PASSWORD = randomUUID();
const NUMBER = "4242424242424242";
const CVV = "987";
const HOLDER = "Test Holder";
let user = { id: "", email: "" };
let other = "";
let cardA = "";
let cardB = "";
let app: INestApplication;
let signedIn: TestUser;
const removeRow: ReturnType<typeof as>["removeRow"] = (kind, input) =>
  as(app, signedIn).removeRow(kind, input);

async function newUser(name: string, password = randomUUID()) {
  const email = `cards-${randomUUID()}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  await sql`insert into profiles (user_id, name, role) values (${data.user.id}, ${name}, 'partner')`;
  return { id: data.user.id, email };
}

beforeAll(async () => {
  process.env.CARD_SECRET_KEY = randomBytes(32).toString("base64");
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
  user = await newUser("Partner A", PASSWORD);
  other = (await newUser("Partner B")).id;
  app = await startApi();
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({
    email: user.email,
    password: PASSWORD,
  });
  if (error) throw error;
  signedIn = {
    userId: user.id,
    profileId: null,
    email: user.email,
    token: data.session.access_token,
  };
});

beforeEach(async () => {
  getUser.mockResolvedValue(user);
  resetPasswordTries();
  vi.mocked(verifyAuthenticationResponse).mockReset();
  vi.mocked(verifyRegistrationResponse).mockReset();
  await sql`truncate card_secrets, passkeys, passkey_challenges, cards, audit_log cascade`;
  await sql`delete from people`;
  const [p] = await sql`insert into people (name, kind, profit_share_pct)
    values ('Arif', 'partner', 100) returning id`;
  [{ id: cardA }, { id: cardB }] = await sql`insert into cards
    (name, network, owner_person_id, statement_day, due_day) values
    ('EBL', 'visa', ${p.id}, 10, 25), ('City', 'amex', ${p.id}, 12, 27) returning id`;
});

afterAll(async () => {
  await app.close();
  for (const id of [user.id, other]) await admin.auth.admin.deleteUser(id);
  await sql.end();
  await db.$client.end();
});

const ok = (r: { status: string }) => expect(r).toMatchObject({ status: "ok" });

async function add(cardId = cardA, extra: Record<string, string> = {}) {
  const id = randomUUID();
  ok(
    await saveCardDetails({
      id,
      cardId,
      number: "4242 4242 4242 4242",
      holder: HOLDER,
      expiry: "09/27",
      cvv: CVV,
      ...extra,
    }),
  );
  const [row] = await sql`select * from card_secrets where id = ${id}`;
  return row;
}

/** Reveals one saved number; without a `secretId`, the card's primary (CR-026 had one per card). */
async function reveal(cardId: string, body: unknown, cookie?: string) {
  if (
    body &&
    typeof body === "object" &&
    !("secretId" in body) &&
    rowId.safeParse(cardId).success
  ) {
    const [primary] = await sql`select id from card_secrets
      where card_id = ${cardId} and not supplementary`;
    body = { ...body, secretId: primary?.id };
  }
  const res = await POST(
    new Request(`http://localhost:3000/cards/${cardId}/reveal`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: cookie ? { cookie } : {},
    }),
    { params: Promise.resolve({ id: cardId }) },
  );
  return {
    status: res.status,
    cache: res.headers.get("cache-control"),
    setCookie: res.headers.get("set-cookie"),
    body: await res.json(),
  };
}

/** What a browser sends back for a challenge (the signature check itself is mocked). */
const answer = (challenge: string, id = "cred-1") => ({
  id,
  rawId: id,
  type: "public-key",
  clientExtensionResults: {},
  response: {
    clientDataJSON: Buffer.from(
      JSON.stringify({ type: "webauthn.get", challenge, origin: "http://localhost:3000" }),
    ).toString("base64url"),
    authenticatorData: "",
    signature: "",
  },
});

async function addPasskey(userId = user.id, credentialId = "cred-1") {
  await sql`insert into passkeys (user_id, credential_id, public_key, counter, device_name)
    values (${userId}, ${credentialId}, 'AQID', 1, 'Android phone')`;
}

/** A reveal with the fingerprint (the signature check mocked; the challenge is real). */
async function byFingerprint(cardId: string, secretId?: string) {
  if (!(await sql`select id from passkeys where user_id = ${user.id}`).length) await addPasskey();
  vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 2 },
  } as never);
  const options = (await revealOptions())!;
  const passkey = answer(options.challenge);
  return reveal(cardId, secretId ? { passkey, secretId } : { passkey });
}

/** No audit row may hold a value (D-046). */
async function auditHasNoValues() {
  const rows = await sql`select before, after from audit_log`;
  // Ids are dropped first: a random UUID can hold the CVV's digits.
  const text = JSON.stringify(rows).replace(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/g, "");
  for (const secret of [NUMBER, CVV, HOLDER, "4242 4242", "v1."])
    expect(text).not.toContain(secret);
}

describe("CR-026 card details", () => {
  it("I-CR-026.1 stores ciphertext only; edit and remove need your own recent reveal", async () => {
    const row = await add();
    for (const c of ["number", "holder", "expiry", "cvv"]) {
      expect(row[c]).toMatch(/^v1\./);
      expect(row[c]).not.toContain(NUMBER);
    }
    expect(row.last4).toBe("4242");
    expect(await loadCardSecrets()).toMatchObject([
      { cardId: cardA, last4: "4242", display: "Arif · EBL Visa" },
    ]);
    expect(await sql`select action, before, after from audit_log`).toEqual([
      { action: "insert", before: null, after: { card: cardA, details: "added" } },
    ]);

    // D-054: one primary per card (a second number is a supplementary card).
    expect(
      await saveCardDetails({ id: randomUUID(), cardId: cardA, number: NUMBER }),
    ).toMatchObject({ status: "invalid", errors: { tag: ONE_PRIMARY } });

    // Edit and Remove are refused until you reveal it …
    const edit = {
      id: row.id,
      updatedAt: row.updated_at.toISOString(),
      cardId: cardA,
      number: "378282246310005",
      holder: "",
      expiry: "",
      cvv: "1234",
    };
    expect(await saveCardDetails(edit)).toEqual({
      status: "invalid",
      errors: { form: REVEAL_FIRST },
    });
    const del = { id: row.id, updatedAt: row.updated_at.toISOString() };
    expect(await removeCardDetails(del)).toEqual({
      status: "invalid",
      errors: { form: REVEAL_FIRST },
    });

    // … and so is someone else's reveal.
    getUser.mockResolvedValue({ id: other, email: "" });
    await sql`insert into audit_log ("table", row_id, action, after, user_id)
      values ('card_secrets', ${row.id}, 'reveal', ${sql.json({ card: cardA })}, ${other})`;
    getUser.mockResolvedValue(user);
    expect(await saveCardDetails(edit)).toMatchObject({ errors: { form: REVEAL_FIRST } });

    // An old reveal (over 10 minutes) doesn't count either.
    expect((await byFingerprint(cardA)).status).toBe(200);
    await sql`update audit_log set at = now() - interval '11 minutes' where user_id = ${user.id}`;
    expect(await saveCardDetails(edit)).toMatchObject({ errors: { form: REVEAL_FIRST } });

    expect((await byFingerprint(cardA)).status).toBe(200);
    const saved = await saveCardDetails(edit);
    ok(saved);
    const [after] = await sql`select last4, holder, expiry from card_secrets`;
    expect(after).toEqual({ last4: "0005", holder: null, expiry: null });
    expect((await byFingerprint(cardA)).body).toEqual({
      holder: null,
      number: "378282246310005",
      expiry: null,
      cvv: "1234",
    });
    expect(await sql`select before, after from audit_log where action = 'update'`).toEqual([
      { before: { card: cardA }, after: { card: cardA, details: "changed" } },
    ]);

    ok(
      await removeCardDetails({
        id: row.id,
        updatedAt: (saved as { updatedAt: string }).updatedAt,
      }),
    );
    expect(await sql`select id from card_secrets`).toHaveLength(0);
    expect(await sql`select before, after from audit_log where action = 'delete'`).toEqual([
      { before: { card: cardA }, after: null },
    ]);
    await auditHasNoValues();

    const { books } = await loadBooks();
    expect(books.invariant.difference).toBe(0);
  });

  it("I-CR-026.1 refuses to save without the server key", async () => {
    const key = process.env.CARD_SECRET_KEY;
    delete process.env.CARD_SECRET_KEY;
    try {
      expect(await saveCardDetails({ id: randomUUID(), cardId: cardA, number: NUMBER })).toEqual({
        status: "invalid",
        errors: { form: NO_KEY },
      });
      expect(await reveal(cardA, { passkey: answer("any") })).toMatchObject({
        status: 503,
        body: { error: NO_KEY },
      });
    } finally {
      process.env.CARD_SECRET_KEY = key;
    }
  });

  it("I-CR-026.2 a password never reveals (D-052); the fingerprint shows one card, no-store", async () => {
    await add(cardA);
    await add(cardB, { number: "378282246310005", cvv: "1234" });

    // Even the right password is refused: a saved password could be autofilled.
    const byPassword = await reveal(cardA, { password: PASSWORD });
    expect(byPassword).toEqual({
      status: 400,
      cache: "no-store",
      setCookie: null,
      body: { error: USE_FINGERPRINT },
    });
    expect(await sql`select id from audit_log where action = 'reveal'`).toHaveLength(0);

    const r = await byFingerprint(cardA);
    expect(r).toMatchObject({
      status: 200,
      cache: "no-store",
      body: { holder: HOLDER, number: NUMBER, expiry: "09/27", cvv: CVV },
    });
    expect(await sql`select row_id, after, user_id from audit_log where action = 'reveal'`).toEqual(
      [
        {
          row_id: expect.any(String),
          after: { card: cardA, via: "fingerprint" },
          user_id: user.id,
        },
      ],
    );

    // No unlock, a bad card, or someone signed out: refused, and never cached.
    for (const [cardId, body, status] of [
      [cardA, {}, 400],
      [cardA, null, 400],
      [randomUUID(), { passkey: answer("x") }, 404],
      ["not-a-card", { passkey: answer("x") }, 404],
    ] as const) {
      const res = await reveal(cardId, body);
      expect(res).toMatchObject({ status, cache: "no-store" });
      expect(JSON.stringify(res.body)).not.toContain(NUMBER);
    }
    getUser.mockResolvedValue(null);
    expect(await reveal(cardA, { passkey: answer("x") })).toMatchObject({ status: 403 });
    getUser.mockResolvedValue(user);
    expect(await sql`select id from audit_log where action = 'reveal'`).toHaveLength(1);
    await auditHasNoValues();
  });

  it("I-CR-026.2 a fingerprint needs a fresh, unused challenge of your own", async () => {
    await add();
    await addPasskey();
    const verify = vi.mocked(verifyAuthenticationResponse);
    verify.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 7 } } as never);

    // No challenge issued: refused.
    expect((await reveal(cardA, { passkey: answer("made-up") })).status).toBe(401);

    const options = (await revealOptions())!;
    expect(options.rpId).toBe("localhost");
    expect(options.allowCredentials).toMatchObject([{ id: "cred-1" }]);
    // An unknown credential uses up the challenge.
    expect((await reveal(cardA, { passkey: answer(options.challenge, "cred-x") })).status).toBe(
      401,
    );
    expect(await sql`select id from passkey_challenges`).toHaveLength(0);

    const fresh = (await revealOptions())!;
    const r = await reveal(cardA, { passkey: answer(fresh.challenge) });
    expect(r).toMatchObject({ status: 200, cache: "no-store", body: { number: NUMBER } });
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: fresh.challenge,
        expectedOrigin: "http://localhost:3000",
        expectedRPID: "localhost",
        requireUserVerification: true,
      }),
    );
    expect((await sql`select counter from passkeys`)[0].counter).toBe(7);
    // The same answer again: the challenge is gone.
    expect((await reveal(cardA, { passkey: answer(fresh.challenge) })).status).toBe(401);

    // An expired challenge.
    const late = (await revealOptions())!;
    await sql`update passkey_challenges set expires_at = now() - interval '1 second'`;
    expect((await reveal(cardA, { passkey: answer(late.challenge) })).status).toBe(401);

    // Another user's challenge.
    await sql`insert into passkey_challenges (user_id, challenge, expires_at)
      values (${other}, 'theirs', now() + interval '2 minutes')`;
    expect((await reveal(cardA, { passkey: answer("theirs") })).status).toBe(401);

    // A signature that doesn't check out.
    verify.mockResolvedValue({ verified: false } as never);
    const bad = (await revealOptions())!;
    expect((await reveal(cardA, { passkey: answer(bad.challenge) })).status).toBe(401);

    expect(await sql`select id from audit_log where action = 'reveal'`).toHaveLength(1);
    await auditHasNoValues();
  });

  it("I-CR-026.3 fingerprint set-up needs the password; devices are audited by name", async () => {
    expect(await revealOptions()).toBeNull(); // nothing set up yet
    expect(await fingerprintSetupOptions({ password: "wrong" })).toEqual({
      status: "invalid",
      errors: { password: WRONG_PASSWORD },
    });
    expect(await sql`select id from passkey_challenges`).toHaveLength(0);

    const setup = await fingerprintSetupOptions({ password: PASSWORD });
    if (setup.status !== "ok") throw new Error("no options");
    expect(setup.options.rp.id).toBe("localhost");
    expect(setup.options.authenticatorSelection).toMatchObject({ userVerification: "required" });

    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: "cred-new",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ["internal"],
        },
      },
    } as never);
    const response = answer(setup.options.challenge);
    const saved = await registerFingerprint(response);
    ok(saved);
    expect(
      await sql`select user_id, credential_id, public_key, device_name, transports from passkeys`,
    ).toEqual([
      {
        user_id: user.id,
        credential_id: "cred-new",
        public_key: "AQID",
        device_name: "Android phone",
        transports: ["internal"],
      },
    ]);
    // The same answer again: the challenge is gone.
    expect(await registerFingerprint(response)).toMatchObject({ status: "invalid" });

    // Only your own devices can be removed.
    await addPasskey(other, "cred-other");
    const [theirs] = await sql`select id, updated_at from passkeys where user_id = ${other}`;
    expect(
      await removeFingerprint({ id: theirs.id, updatedAt: theirs.updated_at.toISOString() }),
    ).toMatchObject({ status: "invalid" });
    const [mine] = await sql`select id, updated_at from passkeys where user_id = ${user.id}`;
    ok(await removeFingerprint({ id: mine.id, updatedAt: mine.updated_at.toISOString() }));
    expect(await sql`select "table", action, before, after from audit_log order by at`).toEqual([
      { table: "passkeys", action: "insert", before: null, after: { device: "Android phone" } },
      { table: "passkeys", action: "delete", before: { device: "Android phone" }, after: null },
    ]);
    expect(JSON.stringify(await sql`select before, after from audit_log`)).not.toContain("AQID");
  });

  it("I-CR-026.3 set-up: 5 wrong passwords lock it for 15 minutes, even for the right one", async () => {
    for (let i = 0; i < 5; i++)
      expect(await fingerprintSetupOptions({ password: "wrong" })).toEqual({
        status: "invalid",
        errors: { password: WRONG_PASSWORD },
      });
    expect(await fingerprintSetupOptions({ password: PASSWORD })).toEqual({
      status: "invalid",
      errors: { password: LOCKED },
    });
    expect(await sql`select id from passkey_challenges`).toHaveLength(0);
  });

  it("I-CR-026.4 deleting a card removes its details; its audit row holds no value", async () => {
    await add();
    const [card] = await sql`select updated_at from cards where id = ${cardA}`;
    ok(await removeRow("card", { id: cardA, updatedAt: card.updated_at.toISOString() }));
    expect(await sql`select id from card_secrets`).toHaveLength(0);
    const [audit] = await sql`select before from audit_log where action = 'delete'`;
    expect(audit.before).toMatchObject({ id: cardA, cardDetails: true });
    await auditHasNoValues();
  });
});

// CR-031 (D-054; SRS §4, §11): a card holds its primary and supplementary numbers (one bill, at
// most one primary), and one fingerprint opens a 30 s window (a signed httpOnly cookie) in which
// any number reveals without a new fingerprint.
describe("CR-031 supplementary numbers and the reveal window", () => {
  const SUPP = "5555555555554444";
  const SUPP2 = "5105105105105100";
  const supp = (number: string) => ({ number, tag: "supplementary", holder: "Supp Holder" });
  const windowCookie = (setCookie: string | null) => setCookie!.split(";")[0];

  it("I-CR-031.1 a primary + 2 supplementaries on one card; one primary; gates per number", async () => {
    const primary = await add();
    const s1 = await add(cardA, supp(SUPP));
    const s2 = await add(cardA, supp(SUPP2));
    expect(
      (await loadCardSecrets()).map((r) => [r.cardId, r.supplementary, r.last4, r.display]),
    ).toEqual([
      [cardA, false, "4242", "Arif · EBL Visa"],
      [cardA, true, "4444", "Arif · EBL Visa"],
      [cardA, true, "5100", "Arif · EBL Visa"],
    ]);
    expect(s1.supplementary).toBe(true);
    expect(await sql`select after from audit_log where action = 'insert'`).toHaveLength(3);

    // A second primary is refused; another card can have its own.
    expect(
      await saveCardDetails({ id: randomUUID(), cardId: cardA, number: SUPP, tag: "primary" }),
    ).toMatchObject({ status: "invalid", errors: { tag: ONE_PRIMARY } });
    await add(cardB, { number: "378282246310005", cvv: "1234" });

    // Edit and Remove need a reveal of that number: the primary's doesn't open a supplementary.
    expect((await byFingerprint(cardA, primary.id)).status).toBe(200);
    const edit = (row: Record<string, unknown>, extra: object) => ({
      id: row.id,
      updatedAt: (row.updated_at as Date).toISOString(),
      cardId: cardA,
      number: SUPP,
      tag: "supplementary",
      ...extra,
    });
    expect(await saveCardDetails(edit(s1, {}))).toMatchObject({
      errors: { form: REVEAL_FIRST },
    });
    expect((await byFingerprint(cardA, s1.id)).status).toBe(200);
    // Not to primary while the card has one …
    expect(await saveCardDetails(edit(s1, { tag: "primary" }))).toMatchObject({
      errors: { tag: ONE_PRIMARY },
    });
    // … but the primary can become supplementary, and then s1 the primary.
    const [p] = await sql`select updated_at from card_secrets where id = ${primary.id}`;
    ok(
      await saveCardDetails({
        ...edit({ ...primary, updated_at: p.updated_at }, { number: NUMBER }),
      }),
    );
    ok(await saveCardDetails(edit(s1, { tag: "primary" })));
    expect(
      await sql`select last4, supplementary from card_secrets where card_id = ${cardA}
        order by supplementary, last4`,
    ).toEqual([
      { last4: "4444", supplementary: false },
      { last4: "4242", supplementary: true },
      { last4: "5100", supplementary: true },
    ]);

    // Remove takes that number only.
    expect((await byFingerprint(cardA, s2.id)).status).toBe(200);
    ok(await removeCardDetails({ id: s2.id, updatedAt: s2.updated_at.toISOString() }));
    expect(await sql`select id from card_secrets where card_id = ${cardA}`).toHaveLength(2);

    // Deleting the card takes all its numbers.
    const [card] = await sql`select updated_at from cards where id = ${cardA}`;
    ok(await removeRow("card", { id: cardA, updatedAt: card.updated_at.toISOString() }));
    expect(await sql`select id from card_secrets where card_id = ${cardA}`).toHaveLength(0);
    expect(await sql`select id from card_secrets where card_id = ${cardB}`).toHaveLength(1);
    await auditHasNoValues();
    const { books } = await loadBooks();
    expect(books.invariant.difference).toBe(0);
  });

  it("I-CR-031.2 one fingerprint opens a 30 s window for any number; nothing else does", async () => {
    const a1 = await add();
    const a2 = await add(cardA, supp(SUPP));
    const b1 = await add(cardB, { number: "378282246310005", cvv: "1234" });

    // No window yet: refused, and nothing audited.
    expect(await reveal(cardB, { secretId: b1.id, window: true })).toMatchObject({
      status: 401,
      cache: "no-store",
      body: { error: USE_FINGERPRINT },
    });
    expect(await sql`select id from audit_log where action = 'reveal'`).toHaveLength(0);

    // The fingerprint reveals one number and sets the window's cookie.
    const first = await byFingerprint(cardA, a1.id);
    expect(first).toMatchObject({ status: 200, body: { number: NUMBER } });
    expect(first.setCookie).toMatch(
      /^card_reveal=[^;]+; Max-Age=30; Path=\/cards; HttpOnly; SameSite=Strict$/,
    );
    expect(first.setCookie).not.toContain(NUMBER);
    const cookie = windowCookie(first.setCookie);

    // Within it: any number, any card, with no fingerprint, and the window never moves.
    const b = await reveal(cardB, { secretId: b1.id, window: true }, `theme=x; ${cookie}`);
    expect(b).toMatchObject({ status: 200, setCookie: null, body: { number: "378282246310005" } });
    const s = await reveal(cardA, { secretId: a2.id, window: true }, cookie);
    expect(s).toMatchObject({ status: 200, body: { number: SUPP, holder: "Supp Holder" } });
    expect(
      await sql`select row_id, after from audit_log where action = 'reveal' order by at`,
    ).toEqual([
      { row_id: a1.id, after: { card: cardA, via: "fingerprint" } },
      { row_id: b1.id, after: { card: cardB, via: "window" } },
      { row_id: a2.id, after: { card: cardA, via: "window" } },
    ]);
    // A window reveal counts for Edit like any reveal of that number.
    ok(
      await saveCardDetails({
        id: a2.id,
        updatedAt: a2.updated_at.toISOString(),
        cardId: cardA,
        number: SUPP,
        tag: "supplementary",
        expiry: "11/29",
      }),
    );

    // Refused: a tampered or moved end, another user's window, an ended one, a number of
    // another card.
    const [name, value] = cookie.split("=");
    const [uid, until, mac] = value.split(".");
    for (const bad of [
      `${name}=${uid}.${Number(until) + 60_000}.${mac}`,
      `${name}=${uid}.${until}.${mac.slice(1)}x`,
      `${name}=${signRevealWindow(other, Date.now() + 30_000)}`,
      `${name}=${signRevealWindow(user.id, Date.now() - 1)}`,
    ])
      expect(await reveal(cardB, { secretId: b1.id, window: true }, bad)).toMatchObject({
        status: 401,
        body: { error: USE_FINGERPRINT },
      });
    expect(await reveal(cardA, { secretId: b1.id, window: true }, cookie)).toMatchObject({
      status: 404,
    });
    // Another partner can't use this one's window.
    getUser.mockResolvedValue({ id: other, email: "" });
    expect((await reveal(cardB, { secretId: b1.id, window: true }, cookie)).status).toBe(401);
    getUser.mockResolvedValue(user);
    expect(await sql`select id from audit_log where action = 'reveal'`).toHaveLength(3);
    await auditHasNoValues();
  });
});

describe("CR-045 a card number is saved on one card only (D-067)", () => {
  const SAME_LAST4 = "4111111111174242"; // another valid number ending 4242

  it("I-CR-045.1 the same number on any other row is refused, naming its card", async () => {
    const primary = await add();
    const taken = {
      status: "invalid",
      errors: { number: `${DUPLICATE_NUMBER} Arif · EBL Visa` },
    };
    // On another card, typed with spaces or not; and as this card's supplementary.
    expect(
      await saveCardDetails({ id: randomUUID(), cardId: cardB, number: NUMBER }),
    ).toMatchObject(taken);
    expect(
      await saveCardDetails({
        id: randomUUID(),
        cardId: cardA,
        number: "4242 4242 4242 4242",
        tag: "supplementary",
      }),
    ).toMatchObject(taken);

    // An edit that keeps its own number is fine.
    expect((await byFingerprint(cardA, primary.id)).status).toBe(200);
    ok(
      await saveCardDetails({
        id: primary.id,
        updatedAt: primary.updated_at.toISOString(),
        cardId: cardA,
        number: NUMBER,
        expiry: "10/28",
      }),
    );

    // The same last 4 but another number is fine; a supplementary may come first, with no
    // holder (D-067: no order rule, holder optional).
    await add(cardB, { number: SAME_LAST4, tag: "supplementary", holder: "" });
    expect(
      await sql`select card_id, supplementary, last4 from card_secrets order by card_id = ${cardA} desc`,
    ).toEqual([
      { card_id: cardA, supplementary: false, last4: "4242" },
      { card_id: cardB, supplementary: true, last4: "4242" },
    ]);
    // … and that number is now taken too, named by its own card.
    expect(
      await saveCardDetails({
        id: randomUUID(),
        cardId: cardA,
        number: SAME_LAST4,
        tag: "supplementary",
      }),
    ).toMatchObject({ errors: { number: `${DUPLICATE_NUMBER} Arif · City Amex` } });

    await auditHasNoValues();
    const { books } = await loadBooks();
    expect(books.invariant.difference).toBe(0);
  });
});
