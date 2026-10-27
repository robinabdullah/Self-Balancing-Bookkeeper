import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@mbl/db";
import { accountRows } from "@mbl/domain/accounts";
import { cardRows } from "@mbl/domain/card-view";
import { peopleRows } from "@mbl/domain/people-view";
import { setupNames } from "@mbl/domain/setup";
import { loadBooks } from "@/server/books";
import { loadSetup } from "@/server/setup";
import { stockLots } from "@/server/stock";
import { seedParity } from "../../scripts/parity/seed";
import { type TestUser, deleteUsers, signedInUser, startApi } from "./api";
import { localSql } from "./local-db";

// N-4.4: the five list pages each read one `/views/*`. Each view holds what web's page computed
// from web's own loaders (Ref: the list page.tsx files under src/app/(app)/), after the JSON round
// trip. Fictional book (D-069).
const sql = localSql();
let app: INestApplication;
let partner: TestUser;

beforeAll(async () => {
  await seedParity(sql);
  app = await startApi();
  partner = await signedInUser(sql, "partner");
});

afterAll(async () => {
  await app.close();
  await deleteUsers(sql);
  await sql.end();
  await db.$client.end();
});

const get = (path: string) =>
  request(app.getHttpServer())
    .get(path)
    .set({ Authorization: `Bearer ${partner.token}` });

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("I-N-4.4.1 each list view has what web's page computed", () => {
  it("/views/stock", async () => {
    const [lots, setup] = await Promise.all([stockLots(), loadSetup()]);
    const { body } = await get("/views/stock").expect(200);
    expect(body).toEqual(json({ lots, names: setupNames(setup) }));
    expect(body.lots.length).toBeGreaterThan(0);
  });

  it("/views/cards", async () => {
    const [{ books }, setup] = await Promise.all([loadBooks(), loadSetup()]);
    const { body } = await get("/views/cards").expect(200);
    expect(body).toEqual(json({ rows: cardRows(setup.cards, books.cards) }));
    expect(body.rows.length).toBeGreaterThan(0);
  });

  it("/views/customers", async () => {
    const [{ books }, setup] = await Promise.all([loadBooks(), loadSetup()]);
    const rows = accountRows(
      setup.customers.map((c) => ({
        id: c.id,
        name: c.display,
        terms: [c.shopName, c.proprietorName, c.phone],
        badge: c.active ? undefined : "Inactive",
      })),
      books.customers,
    );
    const { body } = await get("/views/customers").expect(200);
    expect(body).toEqual(json({ rows }));
    expect(body.rows.length).toBeGreaterThan(0);
  });

  it("/views/suppliers", async () => {
    const [{ books }, setup] = await Promise.all([loadBooks(), loadSetup()]);
    const rows = accountRows(
      setup.suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        terms: [s.name, s.phone],
        badge: s.active ? undefined : "Inactive",
      })),
      books.suppliers,
    );
    const { body } = await get("/views/suppliers").expect(200);
    expect(body).toEqual(json({ rows }));
    expect(body.rows.length).toBeGreaterThan(0);
  });

  it("/views/people", async () => {
    const [{ books }, setup] = await Promise.all([loadBooks(), loadSetup()]);
    const { body } = await get("/views/people").expect(200);
    expect(body).toEqual(json({ rows: peopleRows(setup.people, books) }));
    expect(body.rows.length).toBeGreaterThan(0);
    // The books balance.
    expect((await get("/views/shell").expect(200)).body.balance.difference).toBe(0);
  });
});

describe("I-N-4.4.2 the list views need a sign-in", () => {
  it("401 without a token", async () => {
    for (const path of ["stock", "cards", "customers", "suppliers", "people"])
      await request(app.getHttpServer()).get(`/views/${path}`).expect(401);
  });
});
