import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@mbl/db/client";
import { BooksService } from "../../apps/api/src/books/books.service";
import { SetupDataService } from "../../apps/api/src/setup/setup-data.service";
import { StockService } from "../../apps/api/src/stock/stock.service";
import { EntriesService } from "../../apps/api/src/entries/entries.service";
import { ReturnOptionsService } from "../../apps/api/src/returns/return-options.service";
import { stockLots } from "../../apps/api/src/stock/lots";
import { loadCalendar } from "../../apps/api/src/action/runner";
import { DB } from "../../apps/api/src/db/db.module";
import { type Seeded, seedParity } from "../../scripts/parity/seed";
import { type TestUser, deleteUsers, signedInUser, startApi } from "./api";
import { localSql } from "./local-db";
import { service } from "./services";

// N-4.3: the entry form pages each read one `/views/*`. Each view holds what web's page computed
// from web's own loaders (Ref: src/app/(app)/{sales,purchases,returns,money}/**,
// src/server/returns.ts), after the JSON round trip. Since N-6.1 the expected values come from the
// api's own services. Fictional book (D-069).
const sql = localSql();
let app: INestApplication;
const booksSvc = () => service(app, BooksService);
const setupDataSvc = () => service(app, SetupDataService);
const stockSvc = () => service(app, StockService);
const entriesSvc = () => service(app, EntriesService);
const returnOptionsSvc = () => service(app, ReturnOptionsService);
const db = () => app.get<Db>(DB);
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
});

const get = (path: string) =>
  request(app.getHttpServer())
    .get(path)
    .set({ Authorization: `Bearer ${partner.token}` });

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("I-N-4.3.1 each form view has what web's page computed", () => {
  it("/views/sales/new", async () => {
    const [data, dues, lots, lastCustomerId] = await Promise.all([
      setupDataSvc().loadSetup(),
      booksSvc().customerDues(),
      stockLots(db()),
      stockSvc().lastSaleCustomerId(),
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
    const edit = await entriesSvc().editValues("sale", id);
    const [data, dues, lots] = await Promise.all([
      setupDataSvc().loadSetup(),
      booksSvc().customerDues(),
      stockLots(db(), { exceptSaleId: id }),
    ]);
    const { body } = await get(`/views/sales/${id}/edit`).expect(200);
    expect(body).toEqual(json({ edit, data, dues, lots: lots.filter((l) => l.remaining > 0) }));
    expect(body.edit.id).toBe(id);
  });

  it("/views/purchases/new", async () => {
    const [data, dues, { data: books }] = await Promise.all([
      setupDataSvc().loadSetup(),
      booksSvc().customerDues(),
      booksSvc().loadBooks(),
    ]);
    const { body } = await get("/views/purchases/new").expect(200);
    expect(body).toEqual(json({ data, dues, billDates: books.billDates }));
  });

  it("/views/purchases/:id/edit", async () => {
    const id = seeded.refs.purchase;
    const edit = await entriesSvc().editValues("purchase", id);
    const [data, dues, { data: books }] = await Promise.all([
      setupDataSvc().loadSetup(),
      booksSvc().customerDues(),
      booksSvc().loadBooks(),
    ]);
    const { body } = await get(`/views/purchases/${id}/edit`).expect(200);
    expect(body).toEqual(json({ edit, data, dues, billDates: books.billDates }));
    expect(body.edit.id).toBe(id);
  });

  it("/views/returns/new", async () => {
    const [data, options] = await Promise.all([setupDataSvc().loadSetup(), returnOptionsSvc().returnOptions()]);
    const { body } = await get("/views/returns/new").expect(200);
    expect(body).toEqual(json({ data, ...options }));
    expect(body.lines.length).toBeGreaterThan(0);
  });

  it("/views/returns/:id/edit", async () => {
    const id = seeded.refs.return;
    const edit = await entriesSvc().editValues("return", id);
    const [data, options] = await Promise.all([setupDataSvc().loadSetup(), returnOptionsSvc().returnOptions(id)]);
    const { body } = await get(`/views/returns/${id}/edit`).expect(200);
    expect(body).toEqual(json({ edit, data, ...options }));
    expect(body.edit.id).toBe(id);
  });

  it("/views/money/new", async () => {
    const [data, { dues, owed, billDates }, calendar] = await Promise.all([
      setupDataSvc().loadSetup(),
      booksSvc().moneyFormBalances(),
      loadCalendar(db()),
    ]);
    const { body } = await get("/views/money/new").expect(200);
    expect(body).toEqual(json({ data, dues, owed, billDates, calendar }));
  });

  it("/views/money/:id/edit", async () => {
    for (const id of [seeded.refs.expense, seeded.refs.receipt]) {
      const edit = await entriesSvc().editValues("money", id);
      const [data, { dues, owed, billDates }, calendar] = await Promise.all([
        setupDataSvc().loadSetup(),
        booksSvc().moneyFormBalances(),
        loadCalendar(db()),
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
