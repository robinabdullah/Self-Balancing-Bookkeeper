import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, clampDay, dhakaToday, monthOf } from "@mbl/domain/dates";
import { parseRange, periodRange } from "@mbl/domain/journal-filter";
import { defaultPackMonth } from "@mbl/domain/monthly-pack";
import { peopleRows } from "@mbl/domain/people-view";
import { BooksService } from "../../apps/api/src/books/books.service";
import { SetupDataService } from "../../apps/api/src/setup/setup-data.service";
import { JournalService } from "../../apps/api/src/journal/journal.service";
import { AccountReportsService } from "../../apps/api/src/account-reports/account-reports.service";
import { ReportsService } from "../../apps/api/src/reports/reports.service";
import { PackService } from "../../apps/api/src/reports/pack.service";
import { ids, seedParity } from "../../scripts/parity/seed";
import { type TestUser, deleteUsers, signedInUser, startApi } from "./api";
import { localSql } from "./local-db";
import { service } from "./services";

// N-4.7: the Reports pages (Cash book, Sales, Investor, Monthly pack) each read one `/views/*`.
// Each view holds what web's page computed from web's own loaders, after the JSON round trip.
// Fictional book (D-069). Since N-6.1 the expected values come from the api's own services.
const sql = localSql();
let app: INestApplication;
const booksSvc = () => service(app, BooksService);
const setupDataSvc = () => service(app, SetupDataService);
const journalSvc = () => service(app, JournalService);
const accountReportsSvc = () => service(app, AccountReportsService);
const reportsSvc = () => service(app, ReportsService);
const packSvc = () => service(app, PackService);
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
});

const get = (path: string) =>
  request(app.getHttpServer())
    .get(path)
    .set({ Authorization: `Bearer ${partner.token}` });

const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const ALL = { from: "2026-08-01", to: "2026-10-20" };
const q = (r: { from: string; to: string }) => `from=${r.from}&to=${r.to}`;

describe("I-N-4.7.1 each report view has what web's page computed", () => {
  it("/views/reports/cash: a single day and a range", async () => {
    const today = dhakaToday();
    for (const r of [{ from: today, to: today }, { from: "2026-10-15", to: "2026-10-15" }, ALL]) {
      const { body } = await get(`/views/reports/cash?${q(r)}`).expect(200);
      expect(body, q(r)).toEqual(json(await reportsSvc().loadCashBook(r.from, r.to)));
    }
  });

  it("/views/reports/sales: this month and a period, with the oldest date", async () => {
    const first = (await journalSvc().loadJournal()).at(-1)?.date ?? null;
    for (const r of [periodRange("this", dhakaToday())!, ALL]) {
      const { body } = await get(`/views/reports/sales?${q(r)}`).expect(200);
      expect(body, q(r)).toEqual(json({ ...(await reportsSvc().loadSales(r.from, r.to)), first }));
    }
  });

  it("/views/reports/investor: the list, then a person over whole months", async () => {
    const [{ books }, setup, journal] = await Promise.all([
      booksSvc().loadBooks(),
      setupDataSvc().loadSetup(),
      journalSvc().loadJournal(),
    ]);
    const rows = peopleRows(setup.people, books).filter(
      (p) => p.active || p.capital !== 0 || p.profitOwed !== 0 || p.openingDifference != null,
    );
    const list = await get("/views/reports/investor").expect(200);
    expect(list.body).toEqual(json({ kind: "list", rows }));
    expect(rows.length).toBeGreaterThan(0);

    const asked = parseRange(ALL)!;
    const whole = { from: `${monthOf(asked.from)}-01`, to: clampDay(monthOf(asked.to), 31) };
    const thisMonth = periodRange("this", dhakaToday())!;
    for (const person of [ids.kamal, ids.arif])
      for (const r of [whole, thisMonth]) {
        const report = await accountReportsSvc().loadInvestorReport(person, r.from, r.to);
        const { body } = await get(`/views/reports/investor?person=${person}&${q(r)}`).expect(200);
        expect(body).toEqual(json({ kind: "report", report, first: journal.at(-1)?.date ?? null }));
        expect(report).not.toBeNull();
      }
  });

  it("/views/reports/pack: the default month and a closed month", async () => {
    const { first, last, closed } = await packSvc().packMonths();
    const dflt = defaultPackMonth(closed, first, last);
    const first1 = first as string;
    const withDefault = await get("/views/reports/pack").expect(200);
    expect(withDefault.body).toEqual(
      json({ empty: false, first: first1, month: dflt, ...(await packSvc().loadPack(dflt)) }),
    );
    for (const month of ["2026-08", "2026-09"]) {
      expect(await packSvc().packMonth(month)).toBe(month);
      const { body } = await get(`/views/reports/pack?month=${month}`).expect(200);
      expect(body).toEqual(
        json({ empty: false, first: first1, month, ...(await packSvc().loadPack(month)) }),
      );
    }
  });
});

describe("I-N-4.7.2 a bad person, period or month is a 404", () => {
  it("investor", async () => {
    const r = q(ALL);
    await get(`/views/reports/investor?person=not-an-id&${r}`).expect(404);
    await get(`/views/reports/investor?person=00000000-0000-4000-8000-000000000000&${r}`).expect(
      404,
    );
    await get(`/views/reports/investor?person=${ids.kamal}`).expect(404);
  });

  it("pack, cash and sales", async () => {
    const next = `${monthOf(addDays(dhakaToday(), 40))}`;
    for (const m of ["2026-13", "abc", "2020-01", next])
      await get(`/views/reports/pack?month=${m}`).expect(404);
    await get("/views/reports/cash").expect(404);
    await get("/views/reports/cash?from=2026-10-02&to=2026-10-01").expect(404);
    await get("/views/reports/sales?from=x&to=y").expect(404);
  });
});

describe("I-N-4.7.3 the report views need a sign-in", () => {
  it("401 without a token", async () => {
    for (const path of [
      `reports/cash?${q(ALL)}`,
      `reports/sales?${q(ALL)}`,
      "reports/investor",
      `reports/investor?person=${ids.kamal}&${q(ALL)}`,
      "reports/pack",
    ])
      await request(app.getHttpServer()).get(`/views/${path}`).expect(401);
  });

  it("the books balance", async () => {
    expect((await get("/views/shell").expect(200)).body.balance.difference).toBe(0);
  });
});
