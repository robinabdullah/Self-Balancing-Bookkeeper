import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { dhakaToday } from "@mbl/domain/dates";
import { computeBooks } from "@mbl/domain/engine/index";
import type { Result } from "@/server/action";
import { deleteMoneyEntry, saveMoneyEntry } from "@/server/actions/money";
import { reverseEntry } from "@/server/actions/reverse";
import { deleteSale, saveSale } from "@/server/actions/sale";
import { loadBooksData } from "@/server/books";
import { expectBalanced } from "../engine/invariant";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// CR-016.2 (D-036): invoice and receipt numbers, given at save to new sales and customer payments
// (including "Received now"), never to a reversal; an edit keeps its number; Undo leaves a gap and
// a number is never reused. The session and `revalidatePath` are stood in for as in
// action.test.ts. Synthetic data only. The sequences carry on across test files, so the numbers
// are checked relative to each other.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
let userId = "";

const today = dhakaToday();
const ids = { arif: randomUUID(), customer: randomUUID(), model: randomUUID() };
const TABLES =
  "purchases, purchase_lines, sales, sale_lines, returns, return_lines, money_entries, audit_log";

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `numbers-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  await sql`insert into profiles (user_id, name, role) values (${userId}, 'Partner A', 'partner')`;
  await sql`insert into people (id, name, kind, profit_share_pct)
    values (${ids.arif}, 'Arif', 'partner', 100)`;
  await sql`insert into customers (id, proprietor_name) values (${ids.customer}, 'Jamal')`;
  await sql`insert into models (id, name) values (${ids.model}, 'Model V')`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql.unsafe(`truncate ${TABLES}`);
  // 20 phones in stock, bought today for cash.
  const purchaseId = randomUUID();
  await sql`insert into purchases (id, date, source) values (${purchaseId}, ${today}, 'cash')`;
  await sql`insert into purchase_lines (purchase_id, model_id, qty, unit_cost)
    values (${purchaseId}, ${ids.model}, 20, 10000)`;
});

afterAll(async () => {
  await sql.unsafe(`truncate ${TABLES}, models cascade`);
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
  await sql`delete from profiles where user_id = ${userId}`;
  await admin.auth.admin.deleteUser(userId);
  await sql.end();
  await db.$client.end();
});

function ok(result: Result) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result;
}

const sale = <T extends object>(over: T = {} as T) => ({
  id: randomUUID(),
  date: today,
  customerId: ids.customer,
  note: "",
  lines: [{ modelId: ids.model, qty: "1", unitPrice: "12,000" }],
  confirmDuplicate: true,
  ...over,
});

const payment = (over: object = {}) => ({
  id: randomUUID(),
  type: "customer_payment",
  date: today,
  amount: "1,000",
  customerId: ids.customer,
  note: "",
  confirmDuplicate: true,
  ...over,
});

const invoiceNo = async (id: string) =>
  (await sql`select invoice_no from sales where id = ${id}`)[0].invoice_no as number | null;
const receiptNo = async (id: string) =>
  (await sql`select receipt_no from money_entries where id = ${id}`)[0].receipt_no as number | null;

async function expectBooksBalanced() {
  const facts = await loadBooksData();
  expectBalanced(computeBooks(facts, today).posted, today, facts.allocations, facts.closed);
}

describe("invoice and receipt numbers (CR-016.2, D-036)", () => {
  it("I-CR-016.2a sales and customer payments (with Received now) are numbered in order", async () => {
    const a = sale();
    const b = sale({ receivedNow: "5,000", paymentId: randomUUID() });
    const p = payment();
    ok(await saveSale(a));
    ok(await saveSale(b));
    ok(await saveMoneyEntry(p));
    const [na, nb] = [await invoiceNo(a.id), await invoiceNo(b.id)];
    expect(na).toBeGreaterThan(0);
    expect(nb).toBe(na! + 1);
    const [rb, rp] = [await receiptNo(b.paymentId), await receiptNo(p.id)];
    expect(rb).toBeGreaterThan(0);
    expect(rp).toBe(rb! + 1);

    // Only customer payments get a receipt number.
    const expense = payment({ type: "expense", customerId: undefined, category: "rent" });
    ok(await saveMoneyEntry({ ...expense, source: "cash" }));
    expect(await receiptNo(expense.id)).toBeNull();

    // An edit keeps its number.
    const [s] = await sql`select updated_at from sales where id = ${a.id}`;
    ok(await saveSale({ ...a, note: "edited", updatedAt: s.updated_at.toISOString() }));
    expect(await invoiceNo(a.id)).toBe(na);
    const [m] = await sql`select updated_at from money_entries where id = ${p.id}`;
    ok(await saveMoneyEntry({ ...p, amount: "1,500", updatedAt: m.updated_at.toISOString() }));
    expect(await receiptNo(p.id)).toBe(rp);
    await expectBooksBalanced();
  });

  it("I-CR-016.2b numbers stay unique and consecutive when saved at the same time", async () => {
    const sales = Array.from({ length: 4 }, () => sale());
    const payments = Array.from({ length: 6 }, () => payment());
    const results = await Promise.all([
      ...sales.map((s) => saveSale(s)),
      ...payments.map((p) => saveMoneyEntry(p)),
    ]);
    results.forEach(ok);
    const consecutive = (ns: number[]) => {
      const sorted = [...ns].sort((x, y) => x - y);
      expect(new Set(sorted).size).toBe(ns.length);
      expect(sorted.at(-1)! - sorted[0]).toBe(ns.length - 1);
    };
    consecutive((await sql`select invoice_no from sales`).map((r) => r.invoice_no));
    consecutive((await sql`select receipt_no from money_entries`).map((r) => r.receipt_no));
    await expectBooksBalanced();
  });

  it("I-CR-016.2c a reversal gets no number; the original keeps its own", async () => {
    const s = sale();
    const p = payment();
    ok(await saveSale(s));
    ok(await saveMoneyEntry(p));
    const [ns, np] = [await invoiceNo(s.id), await receiptNo(p.id)];
    const [rs, rp] = [randomUUID(), randomUUID()];
    ok(await reverseEntry({ id: rs, table: "sale", reversesId: s.id, date: today }));
    ok(await reverseEntry({ id: rp, table: "money", reversesId: p.id, date: today }));
    expect(await invoiceNo(rs)).toBeNull();
    expect(await receiptNo(rp)).toBeNull();
    expect([await invoiceNo(s.id), await receiptNo(p.id)]).toEqual([ns, np]);
    await expectBooksBalanced();
  });

  it("I-CR-016.2d Undo leaves a gap: a number is never reused", async () => {
    const a = sale({ receivedNow: "2,000", paymentId: randomUUID() });
    const r = ok(await saveSale(a));
    const [na, ra] = [await invoiceNo(a.id), await receiptNo(a.paymentId)];
    ok(await deleteSale({ id: a.id, paymentId: a.paymentId, updatedAt: r.updatedAt }));
    const p = payment();
    const rp = ok(await saveMoneyEntry(p));
    const pNo = await receiptNo(p.id);
    ok(await deleteMoneyEntry({ id: p.id, updatedAt: rp.updatedAt }));

    const b = sale();
    const q = payment();
    ok(await saveSale(b));
    ok(await saveMoneyEntry(q));
    expect(await invoiceNo(b.id)).toBe(na! + 1);
    expect(pNo).toBe(ra! + 1);
    expect(await receiptNo(q.id)).toBe(pNo! + 1);
    await expectBooksBalanced();
  });
});
