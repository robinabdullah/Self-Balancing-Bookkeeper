import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { addMonths, dhakaToday, formatMonth, monthOf } from "@mbl/domain/dates";
import { computeBooks } from "@mbl/domain/engine/index";
import type { Result } from "@/server/action";
import { saveMoneyEntry } from "@/server/actions/money";
import { closeMonth, reopenMonth } from "@/server/actions/months";
import { loadBooksData } from "@/server/books";
import { profitSinceClose } from "@/server/months";
import { expectBalanced } from "../engine/invariant";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// Task 5.4 (PRD §4.4, SRS §7 re-open): only the latest closed month re-opens; its allocations and
// `month_closes` row go (kept in the `reopen` audit row) and the month unlocks. The confirm lists
// the profit paid / reinvested entries made since the close. The session and `revalidatePath`
// are stood in for as in action.test.ts. Synthetic data only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
let userId = "";

const today = dhakaToday();
const M1 = addMonths(monthOf(today), -2);
const M2 = addMonths(monthOf(today), -1);
const ids = { arif: randomUUID(), sumon: randomUUID() };

function ok(result: Result) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result;
}

/** Close `m` through the action: partners only (50/50), no investor lines. */
const close = async (m: string) => ok(await closeMonth({ id: randomUUID(), month: m }));

/** The re-open input: the close row's id and the `updatedAt` the page saw. */
async function closeOf(m: string) {
  const [row] = await sql`select id, updated_at from month_closes where month = ${`${m}-01`}`;
  return { id: row.id as string, updatedAt: (row.updated_at as Date).toISOString() };
}

const profitPaid = (date: string, amount: string) => ({
  id: randomUUID(),
  type: "profit_paid",
  date,
  personId: ids.arif,
  amount,
  source: "cash",
  note: "",
});

async function expectBooksBalanced() {
  const data = await loadBooksData();
  expectBalanced(computeBooks(data, today).posted, today, data.allocations, data.closed);
}

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `reopen-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  await sql`insert into profiles (user_id, name, role) values (${userId}, 'Partner A', 'partner')`;
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50)`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql`truncate money_entries, allocations, month_closes, audit_log`;
  await sql`insert into money_entries (type, date, amount, opening_kind, person_id, created_by)
    values ('opening', ${`${M1}-01`}, '500000.00', 'cash', null, ${userId}),
           ('opening', ${`${M1}-01`}, '500000.00', 'capital', ${ids.arif}, ${userId})`;
  await sql`insert into money_entries (type, date, amount, source, created_by)
    values ('cashback', ${`${M1}-10`}, '100000.00', 'cash', ${userId})`;
});

afterAll(async () => {
  await sql`truncate money_entries, allocations, month_closes, audit_log`;
  await sql`delete from people`;
  await sql`delete from profiles where user_id = ${userId}`;
  await admin.auth.admin.deleteUser(userId);
  await sql.end();
  await db.$client.end();
});

describe("5.4 Re-open", () => {
  it("I5.4.1 Re-opening a non-latest month → rejected", async () => {
    await close(M1);
    await close(M2);

    expect(await reopenMonth(await closeOf(M1))).toEqual({
      status: "invalid",
      errors: { form: `Only the latest closed month (${formatMonth(M2)}) can be re-opened` },
    });
    expect(await sql`select month::text from month_closes order by month`).toEqual([
      { month: `${M1}-01` },
      { month: `${M2}-01` },
    ]);
    await expectBooksBalanced();

    // Latest first: M2, then M1 is the latest and re-opens too.
    ok(await reopenMonth(await closeOf(M2)));
    ok(await reopenMonth(await closeOf(M1)));
    expect(await sql`select 1 from month_closes`).toHaveLength(0);
    expect(await sql`select 1 from allocations`).toHaveLength(0);
    await expectBooksBalanced();
  });

  it("I5.4.2 Re-open after a profit-paid entry → the warning lists it; the month is unlocked", async () => {
    // Paid before the close: not "since the close".
    ok(await saveMoneyEntry(profitPaid(`${M2}-02`, "1,000")));
    await close(M1);
    const paid = ok(await saveMoneyEntry(profitPaid(today, "50,000")));

    expect(await profitSinceClose(M1)).toEqual([
      { id: paid.id, type: "profit_paid", date: today, person: "Arif", amount: 5_000_000 },
    ]);

    const { id } = await closeOf(M1);
    const allocated = await sql`select id from allocations where month = ${`${M1}-01`}`;
    expect(allocated).toHaveLength(2);
    ok(await reopenMonth(await closeOf(M1)));

    expect(await sql`select 1 from month_closes`).toHaveLength(0);
    expect(await sql`select 1 from allocations`).toHaveLength(0);
    const [audit] = await sql`select "table", row_id, action, before, after from audit_log
      where action = 'reopen'`;
    expect(audit).toMatchObject({ table: "month_closes", row_id: id, after: null });
    expect(audit.before).toMatchObject({ month: `${M1}-01` });
    expect(audit.before.snapshot).toMatchObject({ month: M1, total: 10_000_000 });
    expect(audit.before.allocations.map((a: { id: string }) => a.id).sort()).toEqual(
      allocated.map((a) => a.id).sort(),
    );

    // Unlocked: an entry dated in M1 saves again; the paid entry stays (only the warning).
    ok(await saveMoneyEntry(profitPaid(`${M1}-20`, "500")));
    expect(await sql`select 1 from money_entries where type = 'profit_paid'`).toHaveLength(3);
    expect(await profitSinceClose(M1)).toEqual([]);
    await expectBooksBalanced();
  });
});
