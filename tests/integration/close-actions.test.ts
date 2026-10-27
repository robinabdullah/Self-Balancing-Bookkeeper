import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { addMonths, dhakaToday, monthOf } from "@mbl/domain/dates";
import { computeBooks } from "@mbl/domain/engine/index";
import { closeMonth } from "@/server/actions/months";
import { loadBooksData } from "@/server/books";
import { expectBalanced } from "../engine/invariant";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// Task 5.2 + CR-009 (SRS §4 month close tables, §7; D-023, D-028): closing a month through the
// action. The session and `revalidatePath` are stood in for as in action.test.ts. Synthetic data
// only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
let userId = "";

const today = dhakaToday();
const M1 = addMonths(monthOf(today), -2); // S8: profit 100,000
const M2 = addMonths(monthOf(today), -1); // S9: loss −10,000
const ids = {
  arif: randomUUID(),
  sumon: randomUUID(),
  kamal: randomUUID(), // an investor with 10,00,000 capital
  nila: randomUUID(), // a new investor with no capital
};

/** The close form's fields, flat as FormData sends them: one line per [person, kind, b, r, a]. */
function closeInput(month: string, lines: [string, "cash" | "card", string, string, string][]) {
  const input: Record<string, string> = { id: randomUUID(), month };
  lines.forEach(([personId, kind, basis, ratePct, amount], i) =>
    Object.assign(input, {
      [`allocations.${i}.personId`]: personId,
      [`allocations.${i}.kind`]: kind,
      [`allocations.${i}.basis`]: basis,
      [`allocations.${i}.ratePct`]: ratePct,
      [`allocations.${i}.amount`]: amount,
    }),
  );
  return input;
}

/** Kamal's cash line at `rate`% of his capital; his card line and Nila's cash line left blank/0. */
const s8Lines = (rate: string, amount: string) =>
  [
    [ids.kamal, "cash", "1000000.00", rate, amount],
    [ids.kamal, "card", "", "", ""],
    [ids.nila, "cash", "0.00", "", ""],
    [ids.nila, "card", "", "", ""],
  ] as [string, "cash" | "card", string, string, string][];

async function ok(result: Awaited<ReturnType<typeof closeMonth>>) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result;
}

const rowsOf = (month: string) => sql`
  select person_id, kind, basis::text, rate_pct::text, amount::text from allocations
  where month = ${`${month}-01`} order by kind, person_id`;

/** The invariant over the stored facts, with the closes and allocations (the shared helper). */
async function expectBooksBalanced() {
  const data = await loadBooksData();
  expectBalanced(computeBooks(data, today).posted, today, data.allocations, data.closed);
}

const cashback = (date: string, amount: string) =>
  sql`insert into money_entries (type, date, amount, source, created_by)
    values ('cashback', ${date}, ${amount}, 'cash', ${userId})`;

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `close-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  await sql`insert into profiles (user_id, name, role) values (${userId}, 'Partner A', 'partner')`;
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50)`;
  await sql`insert into people (id, name, kind) values
    (${ids.kamal}, 'Kamal', 'investor'), (${ids.nila}, 'Nila', 'investor')`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql`truncate money_entries, allocations, month_closes, audit_log`;
  const opening = `${M1}-01`;
  await sql`insert into money_entries (type, date, amount, opening_kind, person_id, created_by)
    values ('opening', ${opening}, '2000000.00', 'cash', null, ${userId}),
           ('opening', ${opening}, '1000000.00', 'capital', ${ids.kamal}, ${userId}),
           ('opening', ${opening}, '500000.00', 'capital', ${ids.arif}, ${userId}),
           ('opening', ${opening}, '500000.00', 'capital', ${ids.sumon}, ${userId})`;
  await cashback(`${M1}-10`, "100000.00"); // S8: Profit(M1) 100,000
  await sql`insert into money_entries (type, date, for_month, amount, source, category, created_by)
    values ('expense', ${`${M2}-05`}, ${`${M2}-01`}, '10000.00', 'cash', 'delivery', ${userId})`;
});

afterAll(async () => {
  await sql`truncate money_entries, allocations, month_closes, audit_log`;
  await sql`delete from people`;
  await sql`delete from profiles where user_id = ${userId}`;
  await admin.auth.admin.deleteUser(userId);
  await sql.end();
  await db.$client.end();
});

describe("5.2 Close action", () => {
  it("I5.2.1 S8 and S9 through the action → stored rows; Σ allocations = Profit(M)", async () => {
    // S8: profit 100,000; Kamal 2% of 10,00,000 = 20,000 → each partner 40,000.
    const s8 = await ok(await closeMonth(closeInput(M1, s8Lines("2", "20000.00"))));
    expect(await rowsOf(M1)).toEqual([
      {
        person_id: ids.kamal,
        kind: "cash",
        basis: "1000000.00",
        rate_pct: "2.000",
        amount: "20000.00",
      },
      ...[ids.arif, ids.sumon].sort().map((id) => ({
        person_id: id,
        kind: "partner",
        basis: null,
        rate_pct: null,
        amount: "40000.00",
      })),
    ]);
    const [close] = await sql`select month::text, close_date::text, closed_by, snapshot
      from month_closes where id = ${s8.id}`;
    expect(close).toMatchObject({ month: `${M1}-01`, close_date: today, closed_by: userId });
    expect(close.snapshot).toMatchObject({ month: M1, total: 10_000_000 });
    const [audit] = await sql`select "table", row_id, action, after from audit_log`;
    expect(audit).toMatchObject({ table: "month_closes", row_id: s8.id, action: "close" });
    expect(audit.after.allocations).toHaveLength(3);

    // S9: loss −10,000; Kamal 0.2% = 2,000 → each partner −6,000.
    await ok(await closeMonth(closeInput(M2, s8Lines("0.2", "2000.00"))));
    const s9 = await rowsOf(M2);
    expect(s9.map((r) => r.amount)).toEqual(["2000.00", "-6000.00", "-6000.00"]);

    const data = await loadBooksData();
    const months = computeBooks(data, today).months;
    expect(months.find((m) => m.month === M1)).toMatchObject({ profit: 10_000_000, closed: true });
    expect(months.find((m) => m.month === M2)).toMatchObject({ profit: -1_000_000, closed: true });
    await expectBooksBalanced();
  });

  it("I5.2.2 Closing out of order → rejected; closing twice → rejected", async () => {
    expect(await closeMonth(closeInput(M2, []))).toMatchObject({
      status: "invalid",
      errors: { form: expect.stringMatching(/^Close .+ first$/) },
    });
    await ok(await closeMonth(closeInput(M1, s8Lines("2", "20000.00"))));
    expect(await closeMonth(closeInput(M1, s8Lines("2", "20000.00")))).toMatchObject({
      status: "invalid",
      errors: { form: expect.stringMatching(/is already closed$/) },
    });
    // Partners must total 100 (D-023).
    await sql`update people set profit_share_pct = 40 where id = ${ids.sumon}`;
    try {
      expect(await closeMonth(closeInput(M2, []))).toMatchObject({
        status: "invalid",
        errors: { form: "Partners total 90% — must be 100 before closing" },
      });
    } finally {
      await sql`update people set profit_share_pct = 50 where id = ${ids.sumon}`;
    }
    expect(await sql`select 1 from month_closes`).toHaveLength(1);
    expect(await rowsOf(M2)).toHaveLength(0);
    await expectBooksBalanced();
  });

  it("I5.2.3 The snapshot and allocations are unchanged after later entries in open months", async () => {
    const closed = await ok(await closeMonth(closeInput(M1, s8Lines("2", "20000.00"))));
    const before = await rowsOf(M1);
    const [{ snapshot }] = await sql`select snapshot from month_closes where id = ${closed.id}`;

    await cashback(`${M2}-20`, "7000.00");
    await cashback(today, "3000.00");

    expect(await rowsOf(M1)).toEqual(before);
    const [after] = await sql`select snapshot from month_closes where id = ${closed.id}`;
    expect(after.snapshot).toEqual(snapshot);
    const months = computeBooks(await loadBooksData(), today).months;
    expect(months.find((m) => m.month === M1)?.profit).toBe(10_000_000);
    expect(months.find((m) => m.month === M2)?.profit).toBe(-1_000_000 + 700_000);
    await expectBooksBalanced();
  });
});

describe("CR-009 Blank investor lines; months that haven't started", () => {
  it("I-CR-009.1 A blank card line and a 0-capital cash line → no rows; Σ = Profit(M)", async () => {
    await ok(await closeMonth(closeInput(M1, s8Lines("2", "20000.00"))));
    const rows = await rowsOf(M1);
    expect(rows.filter((r) => r.kind !== "partner")).toEqual([
      expect.objectContaining({ person_id: ids.kamal, kind: "cash" }),
    ]);
    const total = rows.reduce((sum, r) => sum + Number(r.amount.replace(".", "")), 0);
    expect(total).toBe(10_000_000);
    await expectBooksBalanced();
  });

  it("I-CR-009.2 An amount with no basis/rate → invalid; next month (not started) → invalid", async () => {
    const lines = s8Lines("2", "20000.00");
    lines[1] = [ids.kamal, "card", "", "", "5000.00"];
    expect(await closeMonth(closeInput(M1, lines))).toMatchObject({
      status: "invalid",
      errors: { "allocations.1.amount": "Amount: enter a basis (more than 0) and a rate for it" },
    });

    await ok(await closeMonth(closeInput(M1, s8Lines("2", "20000.00"))));
    await ok(await closeMonth(closeInput(M2, s8Lines("0.2", "2000.00"))));
    await ok(await closeMonth(closeInput(monthOf(today), [])));
    expect(await closeMonth(closeInput(addMonths(monthOf(today), 1), []))).toMatchObject({
      status: "invalid",
      errors: { form: expect.stringMatching(/hasn't started$/) },
    });
    expect(await sql`select 1 from month_closes`).toHaveLength(3);
    await expectBooksBalanced();
  });
});
