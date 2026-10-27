import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@mbl/db";
import { loadCalendar } from "@/server/action";
import { customerDues, loadBooks, moneyFormBalances } from "@/server/books";
import { editValues } from "@/server/entries";
import { returnOptions } from "@/server/returns";
import { loadSetup } from "@/server/setup";
import { lastSaleCustomerId, stockLots } from "@/server/stock";
import { type Seeded, seedParity } from "../../scripts/parity/seed";
import { type TestUser, deleteUsers, signedInUser, startApi } from "./api";
import { localSql } from "./local-db";

// N-4.3: the entry form pages each read one `/views/*`. Each view holds what web's page computed
// from web's own loaders (Ref: src/app/(app)/{sales,purchases,returns,money}/**,
// src/server/returns.ts), after the JSON round trip. Fictional book (D-069).
const sql = localSql();
let app: INestApplication;
let partner: TestUser;
let seeded: Seeded;

beforeAll(async () => {
  seeded = await seedParity(sql);
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

describe("I-N-4.3.1 each form view has what web's page computed", () => {
  it("/views/sales/new", async () => {
    const [data, dues, lots, lastCustomerId] = await Promise.all([
      loadSetup(),
      customerDues(),
      stockLots(),
      lastSaleCustomerId(),
    ]);
    const { body } = await get("/views/sales/new").expect(200);
    expect(body).toEqual(
      json({ data, dues, lots: lots.filter((l) => l.remaining > 0), lastCustomerId }),
    );
    expect(body.lots.length).toBeGreaterThan(0);
    expect(body.lastCustomerId).not.toBeNull();
    const shell = (await get("/views/shell").expect(200)).body;
    expect(shell.balance.difference).toBe(0); // the books balance
  });

  it("/views/sales/:id/edit", async () => {
    const id = seeded.refs.sale;
    const edit = await editValues("sale", id);
    const [data, dues, lots] = await Promise.all([
      loadSetup(),
      customerDues(),
      stockLots(db, { exceptSaleId: id }),
    ]);
    const { body } = await get(`/views/sales/${id}/edit`).expect(200);
    expect(body).toEqual(json({ edit, data, dues, lots: lots.filter((l) => l.remaining > 0) }));
    expect(body.edit.id).toBe(id);
  });

  it("/views/purchases/new", async () => {
    const [data, dues, { data: books }] = await Promise.all([
      loadSetup(),
      customerDues(),
      loadBooks(),
    ]);
    const { body } = await get("/views/purchases/new").expect(200);
    expect(body).toEqual(json({ data, dues, billDates: books.billDates }));
  });

  it("/views/purchases/:id/edit", async () => {
    const id = seeded.refs.purchase;
    const edit = await editValues("purchase", id);
    const [data, dues, { data: books }] = await Promise.all([
      loadSetup(),
      customerDues(),
      loadBooks(),
    ]);
    const { body } = await get(`/views/purchases/${id}/edit`).expect(200);
    expect(body).toEqual(json({ edit, data, dues, billDates: books.billDates }));
    expect(body.edit.id).toBe(id);
  });

  it("/views/returns/new", async () => {
    const [data, options] = await Promise.all([loadSetup(), returnOptions()]);
    const { body } = await get("/views/returns/new").expect(200);
    expect(body).toEqual(json({ data, ...options }));
    expect(body.lines.length).toBeGreaterThan(0);
  });

  it("/views/returns/:id/edit", async () => {
    const id = seeded.refs.return;
    const edit = await editValues("return", id);
    const [data, options] = await Promise.all([loadSetup(), returnOptions(id)]);
    const { body } = await get(`/views/returns/${id}/edit`).expect(200);
    expect(body).toEqual(json({ edit, data, ...options }));
    expect(body.edit.id).toBe(id);
  });

  it("/views/money/new", async () => {
    const [data, { dues, owed, billDates }, calendar] = await Promise.all([
      loadSetup(),
      moneyFormBalances(),
      loadCalendar(),
    ]);
    const { body } = await get("/views/money/new").expect(200);
    expect(body).toEqual(json({ data, dues, owed, billDates, calendar }));
  });

  it("/views/money/:id/edit", async () => {
    for (const id of [seeded.refs.expense, seeded.refs.receipt]) {
      const edit = await editValues("money", id);
      const [data, { dues, owed, billDates }, calendar] = await Promise.all([
        loadSetup(),
        moneyFormBalances(),
        loadCalendar(),
      ]);
      const { body } = await get(`/views/money/${id}/edit`).expect(200);
      expect(body).toEqual(json({ edit, data, dues, owed, billDates, calendar }));
      expect(body.edit.id).toBe(id);
    }
  });
});

const EDITS = ["sales", "purchases", "returns", "money"];

describe("I-N-4.3.2 a missing or malformed id is a 404", () => {
  it("an unknown uuid and `not-a-uuid` on each edit route", async () => {
    for (const route of EDITS)
      for (const id of [randomUUID(), "not-a-uuid"])
        await get(`/views/${route}/${id}/edit`).expect(404);
  });
});

describe("I-N-4.3.3 the form views need a sign-in", () => {
  it("401 without a token", async () => {
    const id = seeded.refs.sale;
    const paths = [
      ...EDITS.map((r) => `/views/${r}/new`),
      ...EDITS.map((r) => `/views/${r}/${id}/edit`),
    ];
    for (const path of paths) await request(app.getHttpServer()).get(path).expect(401);
  });
});
