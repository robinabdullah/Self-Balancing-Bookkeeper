import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { addMonths, dhakaToday, monthOf } from "@mbl/domain/dates";
import { computeBooks } from "@mbl/domain/engine/index";
import type { Result } from "@mbl/domain/result";
import { loadBooksData, moneyFormBalances } from "@/server/books";
import { expectBalanced } from "../engine/invariant";
import { partnerApi } from "./api";
import { localSql } from "./local-db";

// Task 5.5 (PRD §4.2, SRS §5, §7): profit paid / reinvested moves a person's profit owed, which the
// money form shows; an amount above it is only a warning, so the action saves it. The session and
// `revalidatePath` are stood in for as in action.test.ts. N-3.2: money entries go through the api
// (the facade), as the same partner. Synthetic data only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
let api: Awaited<ReturnType<typeof partnerApi>>;
const closeMonth = (input: unknown) => api.closeMonth(input);
let userId = "";
const saveMoneyEntry = (input: unknown) => api.saveMoneyEntry(input);

const today = dhakaToday();
const M1 = addMonths(monthOf(today), -1);
const ids = { arif: randomUUID(), sumon: randomUUID() };

function ok(result: Result) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result;
}

const profit = (type: "profit_paid" | "profit_reinvested", amount: string) => ({
  id: randomUUID(),
  type,
  date: today,
  personId: ids.arif,
  amount,
  note: "",
});

async function books() {
  const data = await loadBooksData();
  const books = computeBooks(data, today);
  expectBalanced(books.posted, today, data.allocations, data.closed);
  return books;
}

beforeAll(async () => {
  api = await partnerApi(sql, "Partner A");
  userId = api.user.userId;
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50)`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql`truncate money_entries, allocations, month_closes, audit_log`;
  // M1: opening cash 500,000 = Arif's capital; a cashback of 100,000 is M1's profit.
  await sql`insert into money_entries (type, date, amount, opening_kind, person_id, created_by)
    values ('opening', ${`${M1}-01`}, '500000.00', 'cash', null, ${userId}),
           ('opening', ${`${M1}-01`}, '500000.00', 'capital', ${ids.arif}, ${userId})`;
  await sql`insert into money_entries (type, date, amount, source, created_by)
    values ('cashback', ${`${M1}-10`}, '100000.00', 'cash', ${userId})`;
  // Closing M1 (partners only, 50/50) leaves Arif 50,000 of profit owed.
  ok(await closeMonth({ id: randomUUID(), month: M1 }));
});

afterAll(async () => {
  await sql`truncate money_entries, allocations, month_closes, audit_log`;
  await sql`delete from people`;
  await api.close();
  await sql.end();
  await db.$client.end();
});

describe("5.5 Profit paid / reinvested", () => {
  it("I5.5.1 S10: a partner reinvests 30,000 of profit owed → owed −30,000, capital +30,000, cash unchanged", async () => {
    const before = await books();
    expect(before.profitOwed[ids.arif]).toBe(5_000_000);
    expect((await moneyFormBalances()).owed[ids.arif]).toBe(5_000_000);

    ok(await saveMoneyEntry(profit("profit_reinvested", "30,000")));

    const after = await books();
    expect(after.profitOwed[ids.arif]).toBe(2_000_000);
    expect(after.capital[ids.arif]).toBe(before.capital[ids.arif] + 3_000_000);
    expect(after.cash).toBe(before.cash);
    // The form shows the new profit owed.
    expect((await moneyFormBalances()).owed[ids.arif]).toBe(2_000_000);
  });

  it("I5.5.1 More than the profit owed is a warning, not a block: the action saves it", async () => {
    const before = await books();
    ok(await saveMoneyEntry(profit("profit_paid", "60,000")));

    const after = await books();
    expect(after.profitOwed[ids.arif]).toBe(-1_000_000);
    expect(after.cash).toBe(before.cash - 6_000_000);
  });
});
