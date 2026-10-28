import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@mbl/db";
import { logoSrc } from "@mbl/domain/business";
import { profitsFor } from "@mbl/domain/charts/profit";
import { dhakaToday, formatDate, monthOf } from "@mbl/domain/dates";
import { nextToClose } from "@mbl/domain/engine/months";
import { breakdownLines, closeScreen, monthList } from "@mbl/domain/months-view";
import { partnerWarning } from "@mbl/domain/setup";
import { loadBooks } from "@/server/books";
import { bankCounts, getBusiness, loadBankAccounts } from "@/server/business";
import { loadCardSecrets } from "@/server/card-secrets";
import { lastExport } from "@/server/export";
import { loadClose, loadCloses, profitSinceClose } from "@/server/months";
import { loadPasskeys } from "@/server/passkeys";
import { loadSetup } from "@/server/setup";
import { seedParity } from "../../scripts/parity/seed";
import { type TestUser, deleteUsers, signedInUser, startApi } from "./api";
import { localSql } from "./local-db";

// N-4.6: the admin pages (Months and a month, Setup, Saved details, Settings, Export) each read one
// `/views/*`. Each view holds what web's page computed from web's own loaders (Ref: the six pages),
// after the JSON round trip. Fictional book (D-069).
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

/** The month page as web computed it (a closed month, an open one, or the close screen). */
async function monthPage(month: string) {
  const [{ data, books, asOf }, setup] = await Promise.all([loadBooks(), loadSetup()]);
  const nameOf = new Map(setup.people.map((p) => [p.id, p.name]));
  const profitOf = (snapshots = {}) => profitsFor([month], snapshots, books.posted, asOf)[month];
  if (data.closed.some((c) => monthOf(c) === month)) {
    const close = (await loadClose(month))!;
    const latest = data.closed.map(monthOf).sort().at(-1) === month;
    const profit = profitOf({ [month]: close.snapshot });
    return {
      kind: "closed",
      closeDate: close.closeDate,
      by: close.by,
      lines: breakdownLines(profit),
      total: profit.total,
      allocations: data.allocations.filter((a) => monthOf(a.month) === month),
      names: Object.fromEntries(nameOf),
      latest,
      close: { id: close.id, updatedAt: close.updatedAt },
      paid: latest ? await profitSinceClose(month) : [],
    };
  }
  const next = nextToClose(data.closed, data.entries[0]?.date ?? null, asOf);
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month > next && month <= monthOf(asOf)) {
    const profit = profitOf();
    return { kind: "open", next, lines: breakdownLines(profit), total: profit.total };
  }
  const screen = closeScreen(data, books, setup.people, month, asOf);
  const customerOf = new Map(setup.customers.map((c) => [c.id, c.display]));
  return {
    kind: "close",
    lines: screen.lines,
    total: screen.profit.total,
    warning: partnerWarning(setup.people),
    investors: screen.investors,
    partners: data.partners.map((p) => ({ ...p, name: nameOf.get(p.id) ?? "Partner" })),
    reminders: screen.reminders.map((id) => ({ id, name: customerOf.get(id) ?? "Customer" })),
  };
}

describe("I-N-4.6.1 each admin view has what web's page computed", () => {
  it("/views/months", async () => {
    const [{ data, books, asOf }, closes] = await Promise.all([loadBooks(), loadCloses()]);
    const first = data.entries[0]?.date ?? null;
    const next = nextToClose(data.closed, first, asOf);
    const { body } = await get("/views/months").expect(200);
    expect(body).toEqual(
      json({ rows: monthList(books.months, closes, next, monthOf(asOf)), first }),
    );
    expect(body.rows.length).toBeGreaterThan(0);
  });

  it("/views/months/:month: closed, the close screen and an open month", async () => {
    const kinds: string[] = [];
    for (const month of ["2026-08", "2026-09", "2026-10"]) {
      const { body } = await get(`/views/months/${month}`).expect(200);
      expect(body, month).toEqual(json(await monthPage(month)));
      kinds.push(body.kind);
    }
    expect(kinds).toEqual(["closed", "close", "open"]);
  });

  it("/views/setup", async () => {
    const { body } = await get("/views/setup").expect(200);
    const [data, banks, secrets] = await Promise.all([
      loadSetup(),
      bankCounts(),
      loadCardSecrets(),
    ]);
    expect(body).toEqual(json({ data, banks, cardDetails: secrets.map((s) => s.cardId) }));
  });

  it("/views/saved, the bank tab and the cards tab", async () => {
    const [accounts, setup, items] = await Promise.all([
      loadBankAccounts(),
      loadSetup(),
      loadCardSecrets(),
    ]);
    const has = new Set(accounts.map((a) => a.owner.id));
    const pickable = (r: { id: string; active: boolean }) => r.active || has.has(r.id);
    const owners = {
      person: setup.people.filter(pickable).map((p) => ({ id: p.id, label: p.name })),
      customer: setup.customers
        .filter((c) => !c.isSystem && pickable(c))
        .map((c) => ({ id: c.id, label: c.display })),
      supplier: setup.suppliers.filter(pickable).map((s) => ({ id: s.id, label: s.name })),
    };
    const bank = await get("/views/saved").expect(200);
    expect(bank.body).toEqual(json({ tab: "bank", accounts, owners }));
    const addable = setup.cards
      .filter((c) => c.active)
      .map((c) => ({ id: c.id, label: c.display }));
    const cards = await get("/views/saved?tab=cards").expect(200);
    expect(cards.body).toEqual(json({ tab: "cards", items, addable, hasPasskey: false }));
    expect(cards.body.items.length).toBeGreaterThan(0);
  });

  it("/views/settings, with no passkey and with one (its dates arrive as text)", async () => {
    const business = await getBusiness();
    const [row] = await sql`
      select id, theme, updated_at from profiles where user_id = ${partner.userId}`;
    const profile = { id: row.id, theme: row.theme, updatedAt: row.updated_at.toISOString() };
    const expected = (devices: unknown[]) =>
      json({ profile, business, logo: logoSrc(business), devices });
    const none = await get("/views/settings").expect(200);
    expect(none.body).toEqual(expected([]));

    await sql`
      insert into passkeys (user_id, credential_id, public_key, device_name, created_at, updated_at)
      values (${partner.userId}, 'cred-n46', 'key', 'Test phone',
        '2026-10-27T20:30:00Z', '2026-10-27T21:00:00Z')`;
    try {
      const keys = await loadPasskeys(partner.userId);
      const devices = keys.map((k) => ({
        id: k.id,
        name: k.deviceName ?? "This device",
        added: formatDate(dhakaToday(k.createdAt)),
        updatedAt: k.updatedAt.toISOString(),
      }));
      const { body } = await get("/views/settings").expect(200);
      expect(body).toEqual(expected(devices));
      expect(body.devices).toHaveLength(1);
      expect(typeof body.devices[0].updatedAt).toBe("string");
      expect(body.devices[0].added).toBe(formatDate("2026-10-28")); // 02:30 in Dhaka, next day
      const cards = await get("/views/saved?tab=cards").expect(200);
      expect(cards.body.hasPasskey).toBe(true);
    } finally {
      await sql`delete from passkeys where credential_id = 'cred-n46'`;
    }
  });

  it("/views/export", async () => {
    const { body } = await get("/views/export").expect(200);
    expect(body).toEqual(json({ last: await lastExport() }));
    // The books balance.
    expect((await get("/views/shell").expect(200)).body.balance.difference).toBe(0);
  });
});

describe("I-N-4.6.2 a future, unknown or malformed month", () => {
  it("is a 404", async () => {
    for (const month of ["2027-01", "2026-13", "2026-1", "not-a-month", "2026-11", "2026-07"])
      await get(`/views/months/${month}`).expect(404);
  });
});

describe("I-N-4.6.3 the admin views need a sign-in", () => {
  it("401 without a token", async () => {
    for (const path of [
      "months",
      "months/2026-09",
      "setup",
      "saved",
      "saved?tab=cards",
      "settings",
      "export",
    ])
      await request(app.getHttpServer()).get(`/views/${path}`).expect(401);
  });
});
