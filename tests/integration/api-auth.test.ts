import { generateKeyPairSync, randomUUID } from "node:crypto";
import { Controller, Get, Post } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { SignJWT, decodeProtectedHeader } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthService } from "../../apps/api/src/auth/auth.service";
import { context } from "../../apps/api/src/auth/context";
import { memo } from "../../apps/api/src/auth/memo";
import { Public } from "../../apps/api/src/auth/public";
import { localSupabase } from "../e2e/local-supabase";
import { type TestUser, deleteUsers, signedInUser, startApi } from "./api";
import { LOCAL_SUPABASE_URL, localSql } from "./local-db";

// N-2.3 (D-068): reads need a verified sign-in, writes need a partner, @Public needs neither;
// the render memo loads a value once per X-Render-Id. Tokens are real ones from local Supabase
// Auth (ES256, checked against its JWKS), plus hand-made ones for the failure cases.
let loads = 0;

@Controller("t")
class AuthTestController {
  constructor(private readonly auth: AuthService) {}

  @Get("read")
  read() {
    const { userId, email } = context();
    return { userId, email };
  }

  @Post("write")
  async write() {
    const profile = await this.auth.requirePartner();
    return { profileId: profile.id };
  }

  @Public()
  @Get("public")
  open() {
    return { userId: context().userId };
  }

  @Get("memo")
  async memoGet() {
    return { n: await memo("n", async () => ++loads) };
  }

  @Post("memo")
  async memoPost() {
    return { n: await memo("n", async () => ++loads) };
  }
}

const sql = localSql();
const ISSUER = `${LOCAL_SUPABASE_URL}/auth/v1`;
let app: INestApplication;
let partner: TestUser;
let investor: TestUser;
let noProfile: TestUser;

beforeAll(async () => {
  app = await startApi({ SUPABASE_JWT_SECRET: localSupabase().jwtSecret }, [AuthTestController]);
  partner = await signedInUser(sql, "partner");
  investor = await signedInUser(sql, "investor");
  noProfile = await signedInUser(sql, null);
});

afterAll(async () => {
  await app.close();
  await deleteUsers(sql);
  await sql.end();
});

const http = () => request(app.getHttpServer());
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** An HS256 token as a legacy-secret project issues it; `claims` override the defaults. */
const hs256 = (secret: string, claims: Record<string, unknown> = {}) =>
  new SignJWT({
    aud: "authenticated",
    iss: ISSUER,
    sub: partner.userId,
    email: "x@test.local",
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(secret));

describe("JWT guard (N-2.3)", () => {
  it("I-N-2.3.1 a real Supabase token passes; missing, garbage, expired or forged ones get 401", async () => {
    expect(decodeProtectedHeader(partner.token).alg).toBe("ES256");
    await http()
      .get("/t/read")
      .set(bearer(partner.token))
      .expect(200, { userId: partner.userId, email: partner.email });

    const secret = localSupabase().jwtSecret;
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const forged = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: decodeProtectedHeader(partner.token).kid })
      .setSubject(partner.userId)
      .setAudience("authenticated")
      .setIssuer(ISSUER)
      .setExpirationTime("1h")
      .sign(privateKey);
    const unauthorized = [
      undefined,
      "garbage",
      "a.b.c",
      forged,
      await hs256(secret, { exp: Math.floor(Date.now() / 1000) - 60 }), // expired
      await hs256(`${secret}-wrong`), // another secret
      await hs256(secret, { aud: "anon" }), // not a user's token
      await hs256(secret, { iss: "https://elsewhere.example/auth/v1" }), // another project
      await hs256(secret, { sub: undefined }), // no user
      localSupabase().anonKey, // the public anon key is a JWT too
    ];
    for (const token of unauthorized) {
      const res = await http()
        .get("/t/read")
        .set(token ? bearer(token) : {});
      expect(res.status, String(token).slice(0, 20)).toBe(401);
      expect(res.body.message).toBe("Not signed in");
    }
    await http().get("/t/read").set("Authorization", partner.token).expect(401); // no "Bearer"
  });

  it("I-N-2.3.1 a legacy HS256 token passes only when the secret is configured", async () => {
    const token = await hs256(localSupabase().jwtSecret);
    await http().get("/t/read").set(bearer(token)).expect(200);
    const noSecret = await startApi({ SUPABASE_JWT_SECRET: undefined }, [AuthTestController]);
    try {
      await request(noSecret.getHttpServer()).get("/t/read").set(bearer(token)).expect(401);
    } finally {
      await noSecret.close();
    }
  });

  it("I-N-2.3.2 anyone signed in reads; only a partner writes", async () => {
    for (const u of [partner, investor, noProfile]) {
      await http().get("/t/read").set(bearer(u.token)).expect(200);
    }
    await http()
      .post("/t/write")
      .set(bearer(partner.token))
      .expect(201, { profileId: partner.profileId });
    for (const u of [investor, noProfile]) {
      const res = await http().post("/t/write").set(bearer(u.token)).expect(403);
      expect(res.body.message).toBe("Only partners can do this");
    }
    await http().post("/t/write").expect(401);
  });

  it("I-N-2.3.4 a @Public route needs no token", async () => {
    await http().get("/t/public").expect(200, { userId: null });
    await http().get("/health").expect(200);
  });
});

describe("render memo (N-2.3)", () => {
  const get = (renderId?: string, token = partner.token) =>
    http()
      .get("/t/memo")
      .set({ ...bearer(token), ...(renderId ? { "X-Render-Id": renderId } : {}) })
      .then((r) => r.body.n as number);

  it("I-N-2.3.3 one load per render id and user; none shared without an id or on a write", async () => {
    const render = randomUUID();
    const first = await get(render);
    expect(await get(render)).toBe(first); // the same render: shared
    expect(await get(randomUUID())).toBe(first + 1); // another render
    expect(await get(render, investor.token)).toBe(first + 2); // another user, same id
    expect(await get()).toBe(first + 3); // no render id
    expect(await get()).toBe(first + 4);
    expect(await get("not-a-uuid")).toBe(first + 5);
    const post = () =>
      http()
        .post("/t/memo")
        .set({ ...bearer(partner.token), "X-Render-Id": render })
        .then((r) => r.body.n as number);
    expect(await post()).toBe(first + 6); // a write never reads the render's value
    expect(await post()).toBe(first + 7);
  });
});
