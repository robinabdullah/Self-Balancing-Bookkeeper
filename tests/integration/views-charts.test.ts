import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@mbl/db";
import {
  loadChartPeriod,
  loadCustomerCharts,
  loadMoneyCharts,
  loadProfitCharts,
  loadStockCharts,
} from "@/server/charts";
import { seedParity } from "../../scripts/parity/seed";
import { type TestUser, deleteUsers, signedInUser, startApi } from "./api";
import { localSql } from "./local-db";

// N-4.8: the Charts pages read one `/views/charts/<tab>` each. Each view holds what web's own
// loaders return for the same window, after the JSON round trip. Fictional book (D-069).
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

const WINDOWS = ["", "?from=2026-09-01&to=2026-09-30", "?period=12m", "?period=year"];
const join = (w: string, extra: string) =>
  w ? (extra ? `${w}&${extra}` : w) : extra ? `?${extra}` : "";
const params = (w: string) => Object.fromEntries(new URLSearchParams(w.slice(1)));

describe("I-N-4.8.1 each tab view has what web's loaders return", () => {
  it("/views/charts/profit: each window, and an expense category", async () => {
    for (const w of WINDOWS) {
      const base = await loadChartPeriod(params(w));
      const res = await get(`/views/charts/profit${w}`).expect(200);
      expect(res.body).toEqual(json(await loadProfitCharts(base)));
    }
    const base = await loadChartPeriod({});
    for (const cat of ["salary", "delivery", "card-fees", "bogus"]) {
      const res = await get(`/views/charts/profit?cat=${cat}`).expect(200);
      const want = await loadProfitCharts(base, cat === "bogus" ? undefined : cat);
      expect(res.body).toEqual(json(want));
    }
  });

  it("/views/charts/money: each window", async () => {
    for (const w of WINDOWS) {
      const base = await loadChartPeriod(params(w));
      const res = await get(`/views/charts/money${w}`).expect(200);
      expect(res.body).toEqual(json(await loadMoneyCharts(base)));
    }
  });

  it("/views/charts/customers: each window and each `by`", async () => {
    for (const w of WINDOWS) {
      const base = await loadChartPeriod(params(w));
      for (const by of ["sales", "profit"] as const) {
        const res = await get(`/views/charts/customers${join(w, `by=${by}`)}`).expect(200);
        expect(res.body).toEqual(json(await loadCustomerCharts(base, by)));
      }
    }
    const base = await loadChartPeriod({});
    const res = await get("/views/charts/customers?by=bogus").expect(200);
    expect(res.body).toEqual(json(await loadCustomerCharts(base, "sales")));
  });

  it("/views/charts/stock: each window and each `by`", async () => {
    for (const w of WINDOWS) {
      const base = await loadChartPeriod(params(w));
      for (const by of ["pieces", "profit"] as const) {
        const res = await get(`/views/charts/stock${join(w, `by=${by}`)}`).expect(200);
        expect(res.body).toEqual(json(await loadStockCharts(base, by)));
      }
    }
    const base = await loadChartPeriod({});
    const res = await get("/views/charts/stock?by=bogus").expect(200);
    expect(res.body).toEqual(json(await loadStockCharts(base, "pieces")));
  });
});

describe("I-N-4.8.2 an unknown tab", () => {
  it("is a 404", async () => {
    await get("/views/charts/nope").expect(404);
  });
});

describe("I-N-4.8.3 sign-in", () => {
  it("401 without a token", async () => {
    for (const tab of ["profit", "money", "customers", "stock"]) {
      await request(app.getHttpServer()).get(`/views/charts/${tab}`).expect(401);
    }
  });
});

describe("the books balance", () => {
  it("once", async () => {
    expect((await get("/views/shell").expect(200)).body.balance.difference).toBe(0);
  });
});
