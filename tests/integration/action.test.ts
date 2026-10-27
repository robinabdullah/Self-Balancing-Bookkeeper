import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { type AnyColumn, and, eq, sql as q } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { moneyEntries } from "@/db/schema";
import { addDays, addMonths, dhakaToday, formatMonth, monthOf } from "@/lib/dates";
import { toDecimal } from "@/lib/money";
import { type MoneyEntryValues, moneyEntrySchema } from "@/lib/validation/money-entry";
import { CONFLICT, byId, runAction } from "@/server/action";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// Task 3.1 (SRS §2.3, §3; D-010). The session comes from Next cookies, so the test stands in for
// the Supabase Auth lookup and for `revalidatePath` (it needs a Next request); everything else
// runs against local Supabase. Synthetic data only.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const userIds: string[] = [];

async function user(name: string, role: "partner" | "investor") {
  const { data, error } = await admin.auth.admin.createUser({
    email: `action-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);
  await sql`insert into profiles (user_id, name, role) values (${data.user.id}, ${name}, ${role})`;
  return data.user;
}

// A money entry spec, as the money form's actions will use it (task 3.7).
const month1st = (m: string | null | undefined) => (m ? `${m}-01` : null);
const row = (v: MoneyEntryValues) => {
  type Optional = Partial<{ forMonth: string | null; cardCharged: number; cashReceived: number }>;
  const e: Optional & { id: string } = v;
  const decimal = (p: number | undefined) => (p === undefined ? null : toDecimal(p));
  return {
    ...v,
    amount: toDecimal(v.amount),
    forMonth: month1st(e.forMonth),
    cardCharged: decimal(e.cardCharged),
    cashReceived: decimal(e.cashReceived),
  };
};
const same = (col: AnyColumn, value: string | null) => q`${col} is not distinct from ${value}`;
const similar = (v: MoneyEntryValues) =>
  and(
    eq(moneyEntries.type, v.type),
    eq(moneyEntries.date, v.date),
    eq(moneyEntries.amount, toDecimal(v.amount)),
    same(moneyEntries.customerId, "customerId" in v ? v.customerId : null),
    same(moneyEntries.supplierId, "supplierId" in v ? v.supplierId : null),
    same(moneyEntries.cardId, "cardId" in v ? v.cardId : null),
    same(moneyEntries.personId, "personId" in v ? v.personId : null),
  );

const create = (input: object) =>
  runAction(
    {
      op: "insert",
      table: moneyEntries,
      schema: moneyEntrySchema,
      duplicate: similar,
      write: async (tx, v, { userId }) => {
        const [r] = await tx
          .insert(moneyEntries)
          .values({ ...row(v), createdBy: userId })
          .onConflictDoNothing({ target: moneyEntries.id })
          .returning();
        return r ?? null;
      },
    },
    input,
  );

const edit = (input: object) =>
  runAction(
    {
      op: "update",
      table: moneyEntries,
      schema: moneyEntrySchema,
      write: async (tx, v) => {
        const [r] = await tx
          .update(moneyEntries)
          .set(row(v))
          .where(eq(moneyEntries.id, v.id))
          .returning();
        return r;
      },
    },
    input,
  );

const remove = (input: object) =>
  runAction({ op: "delete", table: moneyEntries, schema: byId }, input);

const today = dhakaToday();
const expense = (over: object = {}) => ({
  id: randomUUID(),
  type: "expense",
  date: today,
  amount: "1,250.50",
  category: "rent",
  source: "cash",
  ...over,
});

async function counts() {
  const [m] = await sql<{ n: number }[]>`select count(*)::int as n from money_entries`;
  const [a] = await sql<{ n: number }[]>`select count(*)::int as n from audit_log`;
  return { entries: m.n, audits: a.n };
}

let partner: { id: string };
let investor: { id: string };
beforeAll(async () => {
  partner = await user("Partner A", "partner");
  investor = await user("Investor B", "investor");
});

beforeEach(async () => {
  getUser.mockResolvedValue(partner);
  await sql`truncate money_entries, audit_log, month_closes`;
});

afterAll(async () => {
  await sql`truncate money_entries, audit_log, month_closes`;
  await sql`delete from profiles where user_id = any(${userIds})`;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await sql.end();
  await db.$client.end();
});

describe("server-action helper (task 3.1)", () => {
  it("I3.1.1 the same id submitted twice → 1 row and 1 audit row", async () => {
    const input = expense();
    const first = await create(input);
    const second = await create(input);
    expect(first).toMatchObject({ status: "ok", id: input.id });
    expect(second).toEqual(first);
    expect(await counts()).toEqual({ entries: 1, audits: 1 });

    const [audit] = await sql`select * from audit_log`;
    expect(audit).toMatchObject({
      table: "money_entries",
      row_id: input.id,
      action: "insert",
      before: null,
      user_id: partner.id,
    });
    expect(audit.after).toMatchObject({ id: input.id, amount: "1250.50", category: "rent" });
  });

  it("I3.1.2 a stale updated_at on edit, delete and undo → conflict", async () => {
    const input = expense();
    const saved = await create(input);
    if (saved.status !== "ok") throw new Error(saved.status);

    const edited = await edit({ ...input, amount: "2,000", updatedAt: saved.updatedAt });
    if (edited.status !== "ok") throw new Error(edited.status);
    expect(edited.updatedAt).not.toBe(saved.updatedAt);

    // Edit and delete with the updated_at seen before the edit.
    const stale = { ...input, amount: "3,000", updatedAt: saved.updatedAt };
    expect(await edit(stale)).toEqual({ status: "conflict", message: CONFLICT });
    expect(await remove(stale)).toEqual({ status: "conflict", message: CONFLICT });
    expect(await edit({ ...input })).toMatchObject({ status: "conflict" }); // none sent

    // Undo (= delete with the save's updated_at) after someone else edited it.
    const other = expense({ amount: "500" });
    const undo = await create(other);
    if (undo.status !== "ok") throw new Error(undo.status);
    await edit({ ...other, amount: "600", updatedAt: undo.updatedAt });
    expect(await remove({ id: other.id, updatedAt: undo.updatedAt })).toMatchObject({
      status: "conflict",
    });

    const [entry] = await sql`select amount from money_entries where id = ${input.id}`;
    expect(entry.amount).toBe("2000.00");
    expect(await counts()).toEqual({ entries: 2, audits: 4 }); // 2 inserts, 2 updates

    // The fresh updated_at works; a deleted row is a conflict too.
    const fresh = { id: input.id, updatedAt: edited.updatedAt };
    expect(await remove(fresh)).toEqual({ status: "ok", id: input.id, updatedAt: null });
    expect(await remove(fresh)).toMatchObject({ status: "conflict" });
    const audits = await sql`select action, before, after from audit_log order by at, created_at`;
    expect(audits.map((a) => a.action)).toEqual(["insert", "update", "insert", "update", "delete"]);
    expect(audits[1].before).toMatchObject({ amount: "1250.50" });
    expect(audits[1].after).toMatchObject({ amount: "2000.00" });
    expect(audits[4]).toMatchObject({ before: { amount: "2000.00" }, after: null });
  });

  it("I3.1.3 a similar entry → a duplicate warning; confirmDuplicate saves it", async () => {
    const first = expense();
    await create(first);
    const [stored] = await sql`select created_at from money_entries`;

    const again = expense({ amount: "1250.5" }); // same type, amount, date; a new id
    expect(await create(again)).toEqual({
      status: "duplicate",
      id: first.id,
      by: "Partner A",
      at: stored.created_at.toISOString(),
    });
    expect(await counts()).toEqual({ entries: 1, audits: 1 });

    expect(await create({ ...again, confirmDuplicate: true })).toMatchObject({ status: "ok" });
    // Another amount (or a card instead of cash) is not similar.
    expect(await create(expense({ amount: "99" }))).toMatchObject({ status: "ok" });
    expect(await counts()).toEqual({ entries: 3, audits: 3 });
  });

  it("I3.1.4 a future date, a closed month, a for_month after the date's month → invalid", async () => {
    const thisMonth = monthOf(today);
    const lastMonth = addMonths(thisMonth, -1);
    await sql`
      insert into month_closes (month, close_date, snapshot, closed_by)
      values (${`${lastMonth}-01`}, ${today}, '{}', ${partner.id})`;

    expect(await create(expense({ date: addDays(today, 1) }))).toEqual({
      status: "invalid",
      errors: { date: "Date can't be in the future" },
    });
    expect(await create(expense({ date: `${lastMonth}-15` }))).toEqual({
      status: "invalid",
      errors: {
        date: `Date is in a closed month (${formatMonth(lastMonth)})`,
        forMonth: `Month is closed (${formatMonth(lastMonth)})`,
      },
    });
    expect(await create(expense({ forMonth: addMonths(thisMonth, 1) }))).toEqual({
      status: "invalid",
      errors: { forMonth: `Month can't be after the date's month (${formatMonth(thisMonth)})` },
    });
    // Zod errors come back the same way.
    expect(await create(expense({ amount: "" }))).toEqual({
      status: "invalid",
      errors: { amount: "Enter an amount" },
    });
    expect(await counts()).toEqual({ entries: 0, audits: 0 });
  });

  it("I3.1.5 no session or a non-partner → rejected, nothing written", async () => {
    getUser.mockResolvedValueOnce(null);
    await expect(create(expense())).rejects.toThrow("Not signed in");
    getUser.mockResolvedValueOnce(investor);
    await expect(create(expense())).rejects.toThrow("Only partners can do this");
    expect(await counts()).toEqual({ entries: 0, audits: 0 });
  });
});
