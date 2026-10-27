import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { addDays, dhakaToday, formatDate } from "@mbl/domain/dates";
import { type Effect, type Entry, type Partner, postEntry } from "@mbl/domain/engine/post";
import { parse } from "@mbl/domain/money";
import { deleteReturn, saveReturn } from "@/server/actions/return";
import { expectBalanced, posted } from "../engine/invariant";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// Task 3.6 (PRD §4.2; SRS §4 returns, §5, §8; UIDD §4.5; D-011). The session and
// `revalidatePath` are stood in for as in action.test.ts. Synthetic data only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
let userId = "";

const today = dhakaToday();
const month = today.slice(0, 7);
const ids = {
  arif: randomUUID(),
  sumon: randomUUID(),
  customer: randomUUID(),
  other: randomUUID(),
  supplier: randomUUID(),
  vivo: randomUUID(),
};
const partners: Partner[] = [
  { id: ids.sumon, pct: 50 },
  { id: ids.arif, pct: 50 },
];

const TABLES = "purchases, purchase_lines, sales, sale_lines, returns, return_lines, money_entries";

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `return-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  await sql`insert into profiles (user_id, name, role) values (${userId}, 'Partner A', 'partner')`;
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50)`;
  await sql`insert into customers (id, proprietor_name, shop_name) values
    (${ids.customer}, 'Milon', 'Test Telecom'), (${ids.other}, 'Selim', 'Other Telecom')`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, 'Test Supplier')`;
  await sql`insert into models (id, name) values (${ids.vivo}, 'Model V')`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql.unsafe(`truncate ${TABLES}, audit_log, month_closes`);
});

afterAll(async () => {
  await sql.unsafe(`truncate ${TABLES}, audit_log, month_closes, models cascade`);
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
  await sql`delete from suppliers`;
  await sql`delete from profiles where user_id = ${userId}`;
  await admin.auth.admin.deleteUser(userId);
  await sql.end();
  await db.$client.end();
});

/** A purchase of one lot; returns the lot id. */
async function lot(date: string, qty: number, unitCost: string, source = "cash") {
  const purchaseId = randomUUID();
  const lotId = randomUUID();
  const supplierId = source === "supplier_credit" ? ids.supplier : null;
  await sql`insert into purchases (id, date, source, supplier_id)
    values (${purchaseId}, ${date}, ${source}, ${supplierId})`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${lotId}, ${purchaseId}, ${ids.vivo}, ${qty}, ${unitCost})`;
  return lotId;
}

/** A sale of `qty` from `lotId`; returns the sale line id. */
async function sold(
  lotId: string,
  date: string,
  qty: number,
  unitPrice: string,
  customerId = ids.customer,
) {
  const saleId = randomUUID();
  const lineId = randomUUID();
  await sql`insert into sales (id, date, customer_id) values (${saleId}, ${date}, ${customerId})`;
  await sql`insert into sale_lines (id, sale_id, lot_id, qty, unit_price)
    values (${lineId}, ${saleId}, ${lotId}, ${qty}, ${unitPrice})`;
  return lineId;
}

/** S1/S2: 10 @ ৳17,700 on supplier credit two days ago; 3 sold to Milon @ ৳18,000 yesterday. */
async function s2() {
  const lotId = await lot(addDays(today, -2), 10, "17700", "supplier_credit");
  return { lotId, lineId: await sold(lotId, addDays(today, -1), 3, "18000") };
}

/** The form's values (text, as FormData sends them). */
const customerReturn = (saleLineId: string, qty = "1", over: object = {}) => ({
  id: randomUUID(),
  kind: "customer",
  date: today,
  customerId: ids.customer,
  note: "",
  lines: [{ saleLineId, qty, unitAmount: "18,000" }],
  ...over,
});

const purchaseReturn = (lotId: string, over: object = {}) => ({
  id: randomUUID(),
  kind: "purchase",
  date: today,
  reason: "returned",
  refundTo: "cash",
  note: "",
  lines: [{ lotId, qty: "1", unitAmount: "17,700" }],
  ...over,
});

async function saved(result: Awaited<ReturnType<typeof saveReturn>>) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result;
}

/** What a lot has left: qty − sold + customer-returned − purchase-returned (SRS §4). */
async function remaining(lotId: string) {
  const [r] = await sql`select l.qty
    - coalesce((select sum(qty) from sale_lines where lot_id = l.id), 0)
    + coalesce((select sum(rl.qty * case when r.kind = 'customer' then 1 else -1 end)
        from return_lines rl join returns r on r.id = rl.return_id where rl.lot_id = l.id), 0)
    as left from purchase_lines l where l.id = ${lotId}`;
  return Number(r.left);
}

/** Everything stored, as engine entries (the mapping the 4.1 loader will do). */
async function stored(): Promise<(Entry & { id: string })[]> {
  const purchases = await sql`select p.id, p.date::text, p.source, p.supplier_id, l.qty,
    l.unit_cost from purchases p join purchase_lines l on l.purchase_id = p.id`;
  const sales = await sql`select s.id, s.date::text, s.customer_id, sl.qty, sl.unit_price,
    l.unit_cost from sales s join sale_lines sl on sl.sale_id = s.id
    join purchase_lines l on l.id = sl.lot_id`;
  const returns = await sql`select id, kind, date::text, customer_id, card_id, supplier_id,
    refund_to, reason from returns`;
  const lines = await sql`select rl.return_id, rl.qty, rl.unit_amount, l.unit_cost
    from return_lines rl join purchase_lines l on l.id = rl.lot_id`;
  return [
    ...purchases.map((p) => ({
      table: "purchase" as const,
      id: p.id,
      date: p.date,
      source: p.source,
      supplierId: p.supplier_id,
      lines: [{ qty: p.qty, unitCost: parse(p.unit_cost)! }],
    })),
    ...sales.map((s) => ({
      table: "sale" as const,
      id: s.id,
      date: s.date,
      customerId: s.customer_id,
      lines: [{ qty: s.qty, unitPrice: parse(s.unit_price)!, unitCost: parse(s.unit_cost)! }],
    })),
    ...returns.map((r) => ({
      table: "return" as const,
      id: r.id,
      kind: r.kind,
      date: r.date,
      customerId: r.customer_id,
      cardId: r.card_id,
      supplierId: r.supplier_id,
      refundTo: r.refund_to,
      reason: r.reason,
      lines: lines
        .filter((l) => l.return_id === r.id)
        .map((l) => ({
          qty: l.qty,
          unitAmount: parse(l.unit_amount)!,
          unitCost: parse(l.unit_cost)!,
        })),
    })),
  ];
}

/** The effects of the stored entry `id`, and the invariant over everything stored. */
async function effectsOf(id: string): Promise<Effect[]> {
  const entries = await stored();
  expectBalanced(entries.map((e) => posted(e, partners)));
  return postEntry(
    entries.find((e) => e.id === id)!,
    partners,
  );
}

describe("Return actions (task 3.6)", () => {
  it("I3.6.1 S3 through the action: Milon due −18,000; stock +17,700; profit −300", async () => {
    const { lotId, lineId } = await s2();
    const ret = customerReturn(lineId);
    const { updatedAt } = await saved(await saveReturn(ret));

    // The return line goes back to the sale line's lot.
    const rows = await sql`select sale_line_id, lot_id, qty, unit_amount from return_lines
      where return_id = ${ret.id}`;
    expect(rows.map((r) => [r.sale_line_id, r.lot_id, r.qty, r.unit_amount])).toEqual([
      [lineId, lotId, 1, "18000.00"],
    ]);
    expect(await remaining(lotId)).toBe(8);
    expect(await effectsOf(ret.id)).toEqual([
      { account: "stock", amount: parse("17,700")! },
      { account: "customer_due", amount: -parse("18,000")!, id: ids.customer },
      { account: "profit", amount: -parse("300")!, month, component: "customer_return" },
    ]);
    const [audit] = await sql`select after from audit_log where row_id = ${ret.id}`;
    expect(audit.after.lines).toHaveLength(1);

    // Duplicate (same kind, customer, total and date) → a warning; Save anyway saves.
    const again = customerReturn(lineId);
    expect(await saveReturn(again)).toMatchObject({ status: "duplicate", id: ret.id });
    await saved(await saveReturn({ ...again, confirmDuplicate: true }));
    expect(await remaining(lotId)).toBe(9);

    // Undo removes the return; the lot goes back.
    expect(await deleteReturn({ id: ret.id, updatedAt })).toMatchObject({ status: "ok" });
    expect(await remaining(lotId)).toBe(8);
    expect(await sql`select id from return_lines where return_id = ${ret.id}`).toHaveLength(0);

    // Another customer's bill line → rejected; the flat field names come back.
    expect(
      await saveReturn({
        id: randomUUID(),
        kind: "customer",
        date: today,
        customerId: ids.other,
        "lines.0.saleLineId": lineId,
        "lines.0.qty": "1",
        "lines.0.unitAmount": "18,000",
      }),
    ).toEqual({
      status: "invalid",
      errors: { "lines.0.saleLineId": "This line is from another customer's bill" },
    });
  });

  it("I3.6.2 returning more than sold − returned → rejected", async () => {
    const { lineId } = await s2();
    expect(await saveReturn(customerReturn(lineId, "4"))).toEqual({
      status: "invalid",
      errors: { "lines.0.qty": "Only 3 left to return on this line" },
    });
    const first = customerReturn(lineId, "2");
    const { updatedAt } = await saved(await saveReturn(first));
    // Different refund, so it isn't a possible duplicate.
    const second = customerReturn(lineId, "2", {
      lines: [{ saleLineId: lineId, qty: "2", unitAmount: "17,000" }],
    });
    expect(await saveReturn(second)).toEqual({
      status: "invalid",
      errors: { "lines.0.qty": "Only 1 left to return on this line" },
    });

    // An edit counts the other returns, not its own: 2 → 3 is fine, 4 is not.
    const edit = {
      ...first,
      updatedAt,
      lines: [{ saleLineId: lineId, qty: "4", unitAmount: "18,000" }],
    };
    expect(await saveReturn(edit)).toEqual({
      status: "invalid",
      errors: { "lines.0.qty": "Only 3 left to return on this line" },
    });
    const ok = await saved(await saveReturn({ ...edit, lines: [{ ...edit.lines[0], qty: "3" }] }));
    await effectsOf(first.id);

    // Phones from this return were sold again: it can't go below that, and Undo is blocked.
    const [{ lot_id }] = await sql`select lot_id from sale_lines where id = ${lineId}`;
    await sold(lot_id, today, 10, "18000", ids.other); // 10 left after the return of 3 → 0
    expect(
      await saveReturn({
        ...edit,
        updatedAt: ok.updatedAt,
        lines: [{ ...edit.lines[0], qty: "1" }],
      }),
    ).toEqual({
      status: "invalid",
      errors: { "lines.0.qty": "Can't be less than 3 — phones from this return were sold again" },
    });
    expect(await deleteReturn({ id: first.id, updatedAt: ok.updatedAt })).toEqual({
      status: "invalid",
      errors: { form: "Other entries depend on this one — delete or reverse them first" },
    });
  });

  it("I3.6.3 a purchase return of an opening lot with no target → rejected", async () => {
    // An opening lot, and an opening-correction lot (D-011), have no source to default to.
    const opening = await lot(addDays(today, -3), 5, "17000", "opening");
    const correction = await lot(addDays(today, -3), 5, "17000", "opening_correction");
    for (const lotId of [opening, correction])
      expect(await saveReturn(purchaseReturn(lotId, { refundTo: "" }))).toEqual({
        status: "invalid",
        errors: { refundTo: "Choose where the refund goes" },
      });
    // An opening lot's other side is the opening difference (SRS §9), which isn't seeded here.
    await sql`delete from purchase_lines where id = ${opening}`;
    await sql`delete from purchases where source = 'opening'`;

    // With a target it saves: we owe the supplier less; profit = refund − cost.
    const ret = purchaseReturn(correction, {
      refundTo: "supplier",
      supplierId: ids.supplier,
      lines: [{ lotId: correction, qty: "2", unitAmount: "17,500" }],
    });
    await saved(await saveReturn(ret));
    expect(await remaining(correction)).toBe(3);
    expect(await effectsOf(ret.id)).toEqual([
      { account: "stock", amount: -parse("34,000")! },
      { account: "profit", amount: parse("1,000")!, month, component: "purchase_return" },
      { account: "supplier_due", amount: -parse("35,000")!, id: ids.supplier },
    ]);

    // One return covers one purchase; more than the lot has left → "Only N left in this lot".
    const other = await lot(addDays(today, -1), 2, "17000");
    expect(
      await saveReturn(
        purchaseReturn(correction, {
          lines: [
            { lotId: correction, qty: "4", unitAmount: "17,000" },
            { lotId: other, qty: "1", unitAmount: "17,000" },
          ],
        }),
      ),
    ).toEqual({
      status: "invalid",
      errors: {
        form: "One return covers one purchase — save a return for each",
        "lines.0.qty": "Only 3 left in this lot",
      },
    });
  });

  it("I3.6.4 damaged/lost → stock −cost, profit −cost, refund 0", async () => {
    const lotId = await lot(addDays(today, -1), 5, "17700");
    // A refund typed in, or a target, is dropped for a write-off.
    const ret = purchaseReturn(lotId, { reason: "damaged_lost", refundTo: "cash" });
    await saved(await saveReturn(ret));
    const [row] = await sql`select refund_to, reason from returns where id = ${ret.id}`;
    expect(row).toEqual({ refund_to: null, reason: "damaged_lost" });
    const [line] = await sql`select unit_amount from return_lines where return_id = ${ret.id}`;
    expect(line.unit_amount).toBe("0.00");
    expect(await remaining(lotId)).toBe(4);
    expect(await effectsOf(ret.id)).toEqual([
      { account: "stock", amount: -parse("17,700")! },
      { account: "profit", amount: -parse("17,700")!, month, component: "purchase_return" },
    ]);

    // A write-off always refunds 0: a possible duplicate is the same lot and qty that day.
    const again = purchaseReturn(lotId, { reason: "damaged_lost" });
    expect(await saveReturn(again)).toMatchObject({ status: "duplicate", id: ret.id });
    const lines = [{ lotId, qty: "2", unitAmount: "0" }];
    await saved(await saveReturn({ ...again, lines }));
    expect(await remaining(lotId)).toBe(2);
  });

  it("I3.6.5 a return dated before its sale/purchase → rejected", async () => {
    const { lotId, lineId } = await s2();
    const twoDaysAgo = addDays(today, -2);
    expect(await saveReturn(customerReturn(lineId, "1", { date: twoDaysAgo }))).toEqual({
      status: "invalid",
      errors: {
        date: `The sale was on ${formatDate(addDays(today, -1))} — the return can't be before it`,
      },
    });
    expect(await saveReturn(purchaseReturn(lotId, { date: addDays(today, -3) }))).toEqual({
      status: "invalid",
      errors: {
        date: `The purchase was on ${formatDate(twoDaysAgo)} — the return can't be before it`,
      },
    });
    // On the purchase date itself it saves.
    await saved(await saveReturn(purchaseReturn(lotId, { date: twoDaysAgo })));
    expect(await sql`select id from returns`).toHaveLength(1);
  });
});
