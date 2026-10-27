import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import type { Db } from "@mbl/db/client";
import { cardAlerts, cardDues, topDues } from "@mbl/domain/dashboard";
import { monthOf } from "@mbl/domain/dates";
import { parse } from "@mbl/domain/money";
import { setupNames } from "@mbl/domain/setup";
import { loadBooks } from "@/server/books";
import { loadEntry, loadJournal } from "@/server/journal";
import { loadSetup } from "@/server/setup";
import { stockLots } from "@/server/stock";
import { BooksService } from "../../apps/api/src/books/books.service";
import { DB } from "../../apps/api/src/db/db.module";
import { type Seeded, seedParity } from "../../scripts/parity/seed";
import { type TestUser, deleteUsers, signedInUser, startApi } from "./api";
import { localSql } from "./local-db";

// N-4.2: Home, the Journal and the entry sheet each read one `/views/*`. Each view holds what
// web's page computed from web's own loaders (Ref: src/app/(app)/page.tsx, journal/page.tsx,
// components/journal/entry-overlay.tsx), after the JSON round trip; the books load once per page
// render. Fictional book (D-069).
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

const get = (path: string, renderId?: string) =>
  request(app.getHttpServer())
    .get(path)
    .set({
      Authorization: `Bearer ${partner.token}`,
      ...(renderId ? { "X-Render-Id": renderId } : {}),
    });

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("I-N-4.2.1 each view has what web's page computed", () => {
  it("/views/home", async () => {
    const [{ books, asOf }, setup, lots, journal] = await Promise.all([
      loadBooks(),
      loadSetup(),
      stockLots(),
      loadJournal(),
    ]);
    const month = monthOf(asOf);
    const targets = Object.fromEntries(
      setup.customers.map((c) => [c.id, c.targetBalance == null ? null : parse(c.targetBalance)]),
    );
    const { body } = await get("/views/home").expect(200);
    expect(body).toEqual(
      json({
        asOf,
        books: {
          cash: books.cash,
          firstNegativeCash: books.firstNegativeCash,
          stock: books.stock,
          customerDues: books.customerDues,
          supplierDues: books.supplierDues,
          openingDifference: {
            resolved: books.openingDifference.resolved,
            total: books.openingDifference.total,
          },
        },
        units: lots.reduce((n, l) => n + l.remaining, 0),
        dues: cardDues(books.cards),
        profit: books.months.find((m) => m.month === month)?.profit ?? 0,
        alerts: cardAlerts(books.cards, asOf),
        cards: setup.cards.map((c) => ({ id: c.id, name: c.name })),
        topDues: topDues(books.customers, targets),
        recent: journal.slice(0, 10),
        names: setupNames(setup),
      }),
    );
    expect(body.recent).toHaveLength(10);
    expect(body.topDues.length).toBeGreaterThan(0);
    const shell = (await get("/views/shell").expect(200)).body;
    expect(shell.balance.difference).toBe(0); // the books balance
  });

  it("/views/journal", async () => {
    const [rows, data] = await Promise.all([loadJournal(), loadSetup()]);
    const oldest = rows.at(-1)?.date;
    const { body } = await get("/views/journal").expect(200);
    expect(body).toEqual(
      json({
        rows,
        names: setupNames(data),
        people: [
          ...data.customers.map((c) => ({ id: c.id, label: c.display, hint: "Customer" })),
          ...data.suppliers.map((s) => ({ id: s.id, label: s.name, hint: "Supplier" })),
          ...data.cards.map((c) => ({ id: c.id, label: c.display, hint: "Card" })),
          ...data.people.map((p) => ({ id: p.id, label: p.name, hint: "Person" })),
        ],
        firstMonth: oldest ? monthOf(oldest) : null,
      }),
    );
    expect(body.rows.length).toBe(seeded.entries.length);
  });

  it("/views/entry/:id: a reversal with its original; null when it doesn't exist", async () => {
    const id = seeded.refs.reversal;
    const [entry, setup, { data }] = await Promise.all([loadEntry(id), loadSetup(), loadBooks()]);
    const stored = data.entries.find((e) => e.id === id)!;
    const original = data.entries.find((e) => e.id === stored.reversesId)!;
    const { body } = await get(`/views/entry/${id}`).expect(200);
    expect(body).toEqual(
      json({
        entry,
        names: setupNames(setup),
        posting: {
          entry: stored,
          original,
          reversed: !!entry!.row.reversedBy,
          partners: data.partners,
        },
        cards: data.cards,
        billDates: data.billDates,
      }),
    );
    expect(body.posting.original.id).toBe(stored.reversesId);
    expect((await get(`/views/entry/${randomUUID()}`).expect(200)).text).toBe("");
    expect((await get("/views/entry/not-a-uuid").expect(200)).text).toBe("");
  });
});

describe("I-N-4.2.2 one Home render loads the books and the Setup lists once", () => {
  it("/views/shell + /views/home + /views/entry/:id with one render id", async () => {
    const loads = vi.spyOn(app.get(BooksService), "loadBooksData");
    const client = (app.get<Db>(DB).$client as unknown as { options: { debug?: unknown } }).options;
    const sent: string[] = [];
    client.debug = (_c: number, query: string) => sent.push(query);
    const render = randomUUID();
    try {
      await Promise.all([
        get("/views/shell", render).expect(200),
        get("/views/home", render).expect(200),
        get(`/views/entry/${seeded.refs.invoice}`, render).expect(200),
      ]);
      expect(loads).toHaveBeenCalledTimes(1);
      expect(sent.filter((q) => q.includes('from "models"'))).toHaveLength(1); // loadSetup's
    } finally {
      client.debug = undefined;
      loads.mockRestore();
    }
  });
});

describe("I-N-4.2.3 the views need a sign-in", () => {
  it("401 without a token", async () => {
    for (const path of ["/views/home", "/views/journal", `/views/entry/${seeded.refs.invoice}`])
      await request(app.getHttpServer()).get(path).expect(401);
  });
});
