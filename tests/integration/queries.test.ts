import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { dhakaToday } from "@/lib/dates";
import { loadCalendar } from "@/server/action";
import { loadBooksData } from "@/server/books";
import { loadEntry, loadJournal } from "@/server/journal";
import { loadSetup } from "@/server/setup";
import { localSql } from "./local-db";

// I-CR-013.1 / I-CR-013.2 (D-032): the speed guard. Every query is a round trip to the database
// (Singapore → Mumbai in production), so each loader's query count is pinned: a change that adds
// a round of queries fails here. Counted with postgres-js's `debug` hook on the app's own client.
// Synthetic data only (D-014).
const sql = localSql();
const sent: string[] = [];
const options = (db.$client as unknown as { options: { debug?: unknown } }).options;
const entryId = randomUUID();

beforeAll(async () => {
  options.debug = (_connection: number, query: string) => sent.push(query);
  const [person] = await sql`insert into people (name, kind) values ('Investor Q', 'investor')
    returning id`;
  await sql`insert into money_entries (id, type, date, amount, person_id)
    values (${entryId}, 'capital_in', ${dhakaToday()}, 1500, ${person.id})`;
});
beforeEach(() => {
  sent.length = 0;
});
afterAll(async () => {
  options.debug = undefined;
  await sql.end();
});

const calendarQueries = () => sent.filter((q) => q.includes("month_closes")).length;

describe("I-CR-013.1 query counts per loader", () => {
  it("loadBooksData: one query per fact table (12)", async () => {
    await loadBooksData();
    expect(sent).toHaveLength(12);
  });

  it("loadSetup: 5", async () => {
    await loadSetup();
    expect(sent).toHaveLength(5);
  });

  it("loadJournal: the entries + the calendar (1 + 3)", async () => {
    await loadJournal();
    expect(sent).toHaveLength(4);
    expect(calendarQueries()).toBe(1);
  });

  it("loadEntry: the entry, its lines and history, and the calendar once (1 + 2 + 3)", async () => {
    const entry = await loadEntry(entryId);
    expect(entry?.row.id).toBe(entryId);
    expect(sent).toHaveLength(6);
    expect(calendarQueries()).toBe(1);
  });

  it("loadEntry of an unknown or malformed id: nothing extra", async () => {
    expect(await loadEntry("not-a-uuid")).toBeNull();
    expect(sent).toHaveLength(0);
    expect(await loadEntry(randomUUID())).toBeNull();
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
    const calendar = loadCalendar();
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
    const entry = await loadEntry(entryId);
    expect(entry?.calendar).toEqual(await loadCalendar());
  });
});
