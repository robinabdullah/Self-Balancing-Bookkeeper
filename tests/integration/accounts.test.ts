import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { billProfit } from "@mbl/domain/accounts";
import { dhakaToday } from "@mbl/domain/dates";
import { customerBills } from "@/server/accounts";
import { loadBooks } from "@/server/books";
import { localSql } from "./local-db";

// Task 4.3.1 (UIDD §4.8): a customer's Bills tab from the DB. Synthetic data (D-014).

const sql = localSql();
const today = dhakaToday();
const ids = {
  jamal: randomUUID(),
  other: randomUUID(),
  model: randomUUID(),
  model2: randomUUID(),
  purchase: randomUUID(),
  lot: randomUUID(),
  lot2: randomUUID(),
  bill: randomUUID(),
  reversed: randomUUID(),
  reversal: randomUUID(),
  otherBill: randomUUID(),
};
let seq = 0;
const at = () => `${today}T00:00:${String(++seq).padStart(2, "0")}.000Z`;

async function sale(id: string, customerId: string, reversesId: string | null, lines: string[][]) {
  await sql`insert into sales (id, date, customer_id, reverses_id, created_at)
    values (${id}, ${today}, ${customerId}, ${reversesId}, ${at()})`;
  for (const [lotId, qty, price] of lines)
    await sql`insert into sale_lines (sale_id, lot_id, qty, unit_price, created_at)
      values (${id}, ${lotId}, ${qty}, ${price}, ${at()})`;
}

beforeAll(async () => {
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.jamal}, 'Jamal', 'Test Telecom'), (${ids.other}, 'Karim', null)`;
  await sql`insert into models (id, name) values (${ids.model}, 'Model V'), (${ids.model2}, 'Model O')`;
  await sql`insert into purchases (id, date, source, created_at)
    values (${ids.purchase}, ${today}, 'cash', ${at()})`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost, created_at)
    values (${ids.lot}, ${ids.purchase}, ${ids.model}, 10, 17700.00, ${at()}),
      (${ids.lot2}, ${ids.purchase}, ${ids.model2}, 5, 15000.50, ${at()})`;
  await sale(ids.bill, ids.jamal, null, [
    [ids.lot, "2", "19000.00"],
    [ids.lot2, "1", "15500.00"],
  ]);
  await sale(ids.reversed, ids.jamal, null, [[ids.lot, "1", "18000.00"]]);
  await sale(ids.reversal, ids.jamal, ids.reversed, [[ids.lot, "1", "18000.00"]]);
  await sale(ids.otherBill, ids.other, null, [[ids.lot, "1", "18500.00"]]);
});

afterAll(() => sql.end());

describe("4.3 customerBills", () => {
  it("I4.3.1 a customer's bills, newest first, with lines; a reversal is not a bill", async () => {
    const bills = await customerBills(ids.jamal);
    expect(bills.map((b) => [b.id, b.reversedBy])).toEqual([
      [ids.reversed, ids.reversal],
      [ids.bill, null],
    ]);
    expect(bills[1].lines).toEqual([
      { modelId: ids.model, qty: 2, unitPrice: 1_900_000, unitCost: 1_770_000 },
      { modelId: ids.model2, qty: 1, unitPrice: 1_550_000, unitCost: 1_500_050 },
    ]);
  });

  it("I4.3.2 each bill's profit is read off the books; the books balance", async () => {
    const { books } = await loadBooks();
    expect(books.invariant.difference).toBe(0);
    const profitOf = (id: string) => billProfit(books.posted.find((p) => p.id === id));
    expect(profitOf(ids.bill)).toBe(2 * 130_000 + 49_950);
    expect(profitOf(ids.reversed)).toBe(30_000);
    expect(profitOf(ids.reversal)).toBe(-30_000);
    expect(books.customers[ids.jamal].balance).toBe(2 * 1_900_000 + 1_550_000);
  });
});
