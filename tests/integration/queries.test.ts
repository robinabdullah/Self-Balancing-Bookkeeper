import { randomUUID } from "node:crypto";
import { Controller, Get, type INestApplication, Inject, Param } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@mbl/db/client";
import { dhakaToday } from "@mbl/domain/dates";
import { loadCalendar } from "../../apps/api/src/action/runner";
import { BooksService } from "../../apps/api/src/books/books.service";
import { DB } from "../../apps/api/src/db/db.module";
import { JournalService } from "../../apps/api/src/journal/journal.service";
import { SetupDataService } from "../../apps/api/src/setup/setup-data.service";
import { type TestUser, deleteUsers, signedInUser, startApi } from "./api";
import { localSql } from "./local-db";

// I-CR-013.1 / I-CR-013.2 (D-032): the speed guard. Every query is a round trip to the database
// (Singapore → Mumbai in production), so each loader's query count is pinned: a change that adds
// a round of queries fails here. Counted with postgres-js's `debug` hook on the api's own pool.
// N-4.1: the api's read services, through a test-only controller, so the memo has its request
// context. Synthetic data only (D-014).
const sql = localSql();
const sent: string[] = [];
const entryId = randomUUID();
let app: INestApplication;
let partner: TestUser;
let apiDb: Db;

@Controller("test-loaders")
class LoadersTestController {
  constructor(
    @Inject(BooksService) private readonly books: BooksService,
    @Inject(SetupDataService) private readonly setup: SetupDataService,
    @Inject(JournalService) private readonly journal: JournalService,
  ) {}

  @Get("books-data")
  async booksData() {
    await this.books.loadBooksData();
  }

  @Get("setup")
  async loadSetup() {
    await this.setup.loadSetup();
  }

  @Get("journal")
  async loadJournal() {
    await this.journal.loadJournal();
  }

  @Get("entry/:id")
  loadEntry(@Param("id") id: string) {
    return this.journal.loadEntry(id);
  }

  /** I-N-4.1.1: what a render's layout, page and entry sheet ask for, twice in one request. */
  @Get("twice/:id")
  async twice(@Param("id") id: string) {
    await Promise.all([this.setup.loadSetup(), this.journal.loadEntry(id)]);
    await Promise.all([this.setup.loadSetup(), this.journal.loadEntry(id)]);
  }
}

const get = (path: string) =>
  request(app.getHttpServer())
    .get(path)
    .set({ Authorization: `Bearer ${partner.token}` });

beforeAll(async () => {
  app = await startApi(
    {},
    [LoadersTestController],
    [BooksService, SetupDataService, JournalService],
  );
  partner = await signedInUser(sql, "partner");
  apiDb = app.get<Db>(DB);
  (apiDb.$client as unknown as { options: { debug?: unknown } }).options.debug = (
    _connection: number,
    query: string,
  ) => sent.push(query);
  const [person] = await sql`insert into people (name, kind) values ('Investor Q', 'investor')
    returning id`;
  await sql`insert into money_entries (id, type, date, amount, person_id)
    values (${entryId}, 'capital_in', ${dhakaToday()}, 1500, ${person.id})`;
});
beforeEach(() => {
  sent.length = 0;
});
afterAll(async () => {
  await app.close();
  await deleteUsers(sql);
  await sql.end();
});

const calendarQueries = () => sent.filter((q) => q.includes("month_closes")).length;

describe("I-CR-013.1 query counts per loader", () => {
  it("loadBooksData: one query per fact table (12)", async () => {
    await get("/test-loaders/books-data").expect(200);
    expect(sent).toHaveLength(12);
  });

  it("loadSetup: 5", async () => {
    await get("/test-loaders/setup").expect(200);
    expect(sent).toHaveLength(5);
  });

  it("loadJournal: the entries + the calendar (1 + 3)", async () => {
    await get("/test-loaders/journal").expect(200);
    expect(sent).toHaveLength(4);
    expect(calendarQueries()).toBe(1);
  });

  it("loadEntry: the entry, its lines and history, and the calendar once (1 + 2 + 3)", async () => {
    const { body } = await get(`/test-loaders/entry/${entryId}`).expect(200);
    expect(body.row.id).toBe(entryId);
    expect(sent).toHaveLength(6);
    expect(calendarQueries()).toBe(1);
  });

  it("loadEntry of an unknown or malformed id: nothing extra", async () => {
    expect((await get("/test-loaders/entry/not-a-uuid").expect(200)).text).toBe("");
    expect(sent).toHaveLength(0);
    expect((await get(`/test-loaders/entry/${randomUUID()}`).expect(200)).text).toBe("");
    expect(sent).toHaveLength(6);
  });

  it("loadCalendar sends its 3 queries together, not one after another", async () => {
    // Hold the first table loadCalendar reads: one after another, only that query would be sent
    // until the lock goes; side by side, all three are sent at once.
    const locker = localSql();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const tx = locker.begin(async (t) => {
      await t`lock table money_entries in access exclusive mode`;
      await held;
    });
    await new Promise((r) => setTimeout(r, 100)); // the lock is taken
    sent.length = 0;
    const calendar = loadCalendar(apiDb);
    try {
      await new Promise((r) => setTimeout(r, 300));
      expect(sent).toHaveLength(3);
    } finally {
      release();
      await Promise.all([tx, calendar]);
      await locker.end();
    }
  });
});

describe("I-CR-013.2 the entry's calendar", () => {
  it("is the same as loadCalendar()", async () => {
    const { body } = await get(`/test-loaders/entry/${entryId}`).expect(200);
    expect(body.calendar).toEqual(await loadCalendar(apiDb));
  });
});

describe("I-N-4.1.1 the memo replaces React cache", () => {
  it("loadSetup and loadEntry asked twice in one request load once (5 + 6)", async () => {
    await get(`/test-loaders/twice/${entryId}`).expect(200);
    expect(sent).toHaveLength(11);
  });
});
