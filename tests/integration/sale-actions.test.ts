import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { addDays, dhakaToday } from "@mbl/domain/dates";
import { type Effect, type Entry, type Partner, postEntry } from "@mbl/domain/engine/post";
import { parse } from "@mbl/domain/money";
import { expectBalanced, posted } from "../engine/invariant";
import type { Result } from "@mbl/domain/result";
import { partnerApi } from "./api";
import { localSql } from "./local-db";

// Task 3.5 (PRD §4.2; SRS §4 sales + lot picking, §5, §8; UIDD §4.4; D-004, D-006). The session and
// `revalidatePath` are stood in for as in action.test.ts. N-3.4: through the api (the facade), as
// Partner A. Synthetic data only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
let api: Awaited<ReturnType<typeof partnerApi>>;
const saveSale = (input: unknown) => api.saveSale(input);
const deleteSale = (input: unknown) => api.deleteSale(input);
let userId = "";

const today = dhakaToday();
const ids = {
  arif: randomUUID(),
  sumon: randomUUID(),
  customer: randomUUID(),
  vivo: randomUUID(),
  oppo: randomUUID(),
};
const partners: Partner[] = [
  { id: ids.sumon, pct: 50 },
  { id: ids.arif, pct: 50 },
];

const TABLES = "purchases, purchase_lines, sales, sale_lines, returns, return_lines, money_entries";

beforeAll(async () => {
  api = await partnerApi(sql, "Partner A");
  userId = api.user.userId;
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50)`;
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.customer}, 'Jamal', 'Test Telecom')`;
  await sql`insert into models (id, name) values (${ids.vivo}, 'Model V'), (${ids.oppo}, 'Model O')`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql.unsafe(`truncate ${TABLES}, audit_log, month_closes`);
});

afterAll(async () => {
  await sql.unsafe(`truncate ${TABLES}, audit_log, month_closes, models cascade`);
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
  await api.close();
  await sql.end();
  await db.$client.end();
});

/** A cash purchase of one lot; returns the lot id. */
async function lot(date: string, qty: number, unitCost: string, modelId = ids.vivo) {
  const purchaseId = randomUUID();
  const lotId = randomUUID();
  await sql`insert into purchases (id, date, source) values (${purchaseId}, ${date}, 'cash')`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${lotId}, ${purchaseId}, ${modelId}, ${qty}, ${unitCost})`;
  return lotId;
}

/** S14: lot A (2 @ ৳16,860) and the newer lot B (10 @ ৳17,010). */
async function s14() {
  return {
    a: await lot(addDays(today, -2), 2, "16860"),
    b: await lot(addDays(today, -1), 10, "17010"),
  };
}

type Line = { id?: string; modelId: string; qty: string; unitPrice: string; lotId?: string };

/** The form's values (text, as FormData sends them). */
const sale = (lines: Line[], over: object = {}) => ({
  id: randomUUID(),
  date: today,
  customerId: ids.customer,
  note: "",
  lines,
  ...over,
});

async function saved(result: Result) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result;
}

const saleLinesOf = (saleId: string) =>
  sql`select id, lot_id, qty, unit_price from sale_lines where sale_id = ${saleId}
    order by created_at, qty desc`;

/** Everything stored, as engine entries (the mapping the 4.1 loader will do). */
async function stored(): Promise<(Entry & { id: string })[]> {
  const purchases = await sql`select p.id, p.date::text, p.source, l.qty, l.unit_cost
    from purchases p join purchase_lines l on l.purchase_id = p.id`;
  const sales = await sql`select id, date::text, customer_id, reverses_id from sales`;
  const lines = await sql`select sl.sale_id, sl.qty, sl.unit_price, l.unit_cost
    from sale_lines sl join purchase_lines l on l.id = sl.lot_id`;
  const money = await sql`select id, type, date::text, amount, customer_id from money_entries`;
  return [
    ...purchases.map((p) => ({
      table: "purchase" as const,
      id: p.id,
      date: p.date,
      source: p.source,
      lines: [{ qty: p.qty, unitCost: parse(p.unit_cost)! }],
    })),
    ...sales.map((s) => ({
      table: "sale" as const,
      id: s.id,
      date: s.date,
      customerId: s.customer_id,
      reversesId: s.reverses_id,
      lines: lines
        .filter((l) => l.sale_id === s.id)
        .map((l) => ({
          qty: l.qty,
          unitPrice: parse(l.unit_price)!,
          unitCost: parse(l.unit_cost)!,
        })),
    })),
    ...money.map((m) => ({
      table: "money" as const,
      id: m.id,
      type: m.type,
      date: m.date,
      amount: parse(m.amount)!,
      customerId: m.customer_id,
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

describe("Sale actions (task 3.5)", () => {
  it("I3.5.1 S14 through the action → 2 sale_lines (A×2, B×1); posts as in SRS §5", async () => {
    const { a, b } = await s14();
    const bill = sale([{ modelId: ids.vivo, qty: "3", unitPrice: "18,000" }]);
    await saved(await saveSale(bill));

    const rows = await saleLinesOf(bill.id);
    expect(rows.map((r) => [r.lot_id, r.qty, r.unit_price])).toEqual([
      [a, 2, "18000.00"],
      [b, 1, "18000.00"],
    ]);
    // P = 54,000, C = 2 × 16,860 + 17,010 = 50,730 (S14).
    expect(await effectsOf(bill.id)).toEqual([
      { account: "stock", amount: -parse("50,730")! },
      { account: "customer_due", amount: parse("54,000")!, id: ids.customer },
      { account: "profit", amount: parse("3,270")!, month: today.slice(0, 7), component: "sale" },
    ]);
    // The audit row has the header and its lines.
    const [audit] = await sql`select after from audit_log where row_id = ${bill.id}`;
    expect(audit.after.lines).toHaveLength(2);

    // Duplicate (same customer, bill total, date) → a warning; Save anyway saves.
    const again = sale([{ modelId: ids.vivo, qty: "3", unitPrice: "18,000" }]);
    expect(await saveSale(again)).toMatchObject({ status: "duplicate", id: bill.id });
    await saved(await saveSale({ ...again, confirmDuplicate: true }));

    // More than is left: "Only 6 left"; the form's flat field names come back.
    expect(
      await saveSale({
        id: randomUUID(),
        date: today,
        customerId: ids.customer,
        "lines.0.modelId": ids.vivo,
        "lines.0.qty": "7",
        "lines.0.unitPrice": "18,000",
      }),
    ).toEqual({ status: "invalid", errors: { "lines.0.qty": "Only 6 left" } });
  });

  it("I3.5.2 two concurrent sales of the last unit → exactly one succeeds", async () => {
    await lot(addDays(today, -1), 1, "17010");
    // Different prices, so neither is a "possible duplicate" of the other.
    const results = await Promise.all(
      ["18,000", "18,100"].map((price) =>
        saveSale(sale([{ modelId: ids.vivo, qty: "1", unitPrice: price }])),
      ),
    );
    expect(results.filter((r) => r.status === "ok")).toHaveLength(1);
    expect(results.find((r) => r.status !== "ok")).toEqual({
      status: "invalid",
      errors: { "lines.0.qty": "Only 0 left" },
    });
    expect(await sql`select id from sale_lines`).toHaveLength(1);
    await effectsOf(results.find((r) => r.status === "ok")!.id as string);
  });

  it("I3.5.3 editing the price keeps the same lot_ids; adding a line auto-picks", async () => {
    const { a, b } = await s14();
    const bill = sale([{ modelId: ids.vivo, qty: "3", unitPrice: "18,000" }]);
    const { updatedAt } = await saved(await saveSale(bill));
    const before = await saleLinesOf(bill.id);

    // A newer, cheaper lot C appears; an edit must not move the bill onto it (D-004).
    const c = await lot(today, 5, "15000");
    const lines: Line[] = before.map((r) => ({
      id: r.id,
      modelId: ids.vivo,
      qty: String(r.qty),
      unitPrice: "18,500",
      lotId: r.lot_id,
    }));
    // The new line comes first in the bill: chosen-lot lines are still filled first.
    const edit = {
      ...bill,
      updatedAt,
      lines: [{ modelId: ids.vivo, qty: "2", unitPrice: "18,500" }, ...lines],
    };
    await saved(await saveSale(edit));

    const after = await saleLinesOf(bill.id);
    expect(after.slice(0, 2).map((r) => [r.id, r.lot_id, r.unit_price])).toEqual([
      [before[0].id, a, "18500.00"],
      [before[1].id, b, "18500.00"],
    ]);
    // The new line: B (9 left) is older than C, so 2 from B.
    expect(after.slice(2).map((r) => [r.lot_id, r.qty])).toEqual([[b, 2]]);
    expect(c).toBeTruthy();
    await effectsOf(bill.id);

    // A line with returns can't be removed, change lot or go below what was returned.
    const [saved2] = await sql`select updated_at from sales where id = ${bill.id}`;
    const returnId = randomUUID();
    await sql`insert into returns (id, kind, date, customer_id) values
      (${returnId}, 'customer', ${today}, ${ids.customer})`;
    await sql`insert into return_lines (return_id, sale_line_id, lot_id, qty, unit_amount)
      values (${returnId}, ${before[0].id}, ${a}, 2, '18500')`;
    const stamp = saved2.updated_at.toISOString();
    expect(await saveSale({ ...bill, updatedAt: stamp, lines: lines.slice(1) })).toEqual({
      status: "invalid",
      errors: { form: "A removed line's phones were returned — keep that line" },
    });
    expect(
      await saveSale({
        ...bill,
        updatedAt: stamp,
        lines: [{ ...lines[0], qty: "1", lotId: c }, lines[1]],
      }),
    ).toEqual({
      status: "invalid",
      errors: {
        "lines.0.lotId": "Phones from this line were returned — its lot can't change",
        "lines.0.qty": "Can't be less than 2 — already returned",
      },
    });
    // Received now belongs to a new bill only.
    expect(
      await saveSale({
        ...bill,
        updatedAt: stamp,
        lines,
        receivedNow: "1,000",
        paymentId: randomUUID(),
      }),
    ).toEqual({
      status: "invalid",
      errors: { receivedNow: "Received now is only for a new bill — add a payment instead" },
    });
  });

  it("I3.5.4 Undo of a sale with Received now → both rows deleted, 2 audit rows", async () => {
    await s14();
    const paymentId = randomUUID();
    const bill = sale([{ modelId: ids.vivo, qty: "1", unitPrice: "18,000" }], {
      receivedNow: "10,000",
      paymentId,
    });
    const { updatedAt } = await saved(await saveSale(bill));

    // The payment: a customer payment on the same date, for the bill's customer.
    expect(await effectsOf(paymentId)).toEqual([
      { account: "cash", amount: parse("10,000")! },
      { account: "customer_due", amount: -parse("10,000")!, id: ids.customer },
    ]);
    expect(
      (await sql`select action from audit_log where row_id in (${bill.id}, ${paymentId})`).length,
    ).toBe(2);

    // A stale updatedAt → conflict, nothing deleted.
    expect(
      await deleteSale({ id: bill.id, updatedAt: "2000-01-01T00:00:00.000Z", paymentId }),
    ).toMatchObject({ status: "conflict" });

    expect(await deleteSale({ id: bill.id, updatedAt: updatedAt!, paymentId })).toMatchObject({
      status: "ok",
    });
    expect(await sql`select id from sales`).toHaveLength(0);
    expect(await sql`select id from sale_lines`).toHaveLength(0);
    expect(await sql`select id from money_entries`).toHaveLength(0);
    const deletes = await sql`select "table" from audit_log where action = 'delete' order by 1`;
    expect(deletes.map((d) => d.table)).toEqual(["money_entries", "sales"]);
    expectBalanced((await stored()).map((e) => posted(e, partners)));

    // Without Received now, Undo removes the bill alone.
    const plain = sale([{ modelId: ids.vivo, qty: "1", unitPrice: "18,000" }]);
    const ok = await saved(await saveSale(plain));
    expect(
      await deleteSale({ id: plain.id, updatedAt: ok.updatedAt!, paymentId: randomUUID() }),
    ).toMatchObject({ status: "ok" });
    expect(await sql`select id from sales`).toHaveLength(0);
  });

  it("I3.5.5 selling a lot dated after the sale date → rejected", async () => {
    const { b } = await s14();
    const date = addDays(today, -2); // lot A's date; lot B is a day later
    expect(
      await saveSale(
        sale([{ modelId: ids.vivo, qty: "1", unitPrice: "18,000", lotId: b }], { date }),
      ),
    ).toEqual({
      status: "invalid",
      errors: { "lines.0.lotId": "This lot was bought after the sale date" },
    });
    // Oldest first only counts lots bought by the sale date: A has 2.
    expect(
      await saveSale(sale([{ modelId: ids.vivo, qty: "3", unitPrice: "18,000" }], { date })),
    ).toEqual({ status: "invalid", errors: { "lines.0.qty": "Only 2 left" } });
    expect(await sql`select id from sales`).toHaveLength(0);
  });
});
