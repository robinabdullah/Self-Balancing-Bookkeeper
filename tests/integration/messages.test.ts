import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { addDays, addMonths, dhakaToday, monthOf } from "@mbl/domain/dates";
import { format } from "@mbl/domain/money";
import { invoiceLabel, receiptLabel } from "@mbl/domain/whatsapp";
import { saveReturn } from "@/server/actions/return";
import { saveSale } from "@/server/actions/sale";
import { loadBooks } from "@/server/books";
import { loadDraft } from "@/server/messages";
import { expectBalanced } from "../engine/invariant";
import { partnerApi } from "./api";
import { localSql } from "./local-db";

// CR-020 (D-040): message drafts from real saves, tied out to the books. The session and
// `revalidatePath` are stood in for as in action.test.ts. N-3.2: money entries go through the api
// (the facade), as the same partner. Synthetic data only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
let api: Awaited<ReturnType<typeof partnerApi>>;
let userId = "";
const saveMoneyEntry = (input: unknown) => api.saveMoneyEntry(input);
let walkIn = "";

const today = dhakaToday();
const lastMonth = addMonths(monthOf(today), -1);
const ids = {
  arif: randomUUID(),
  sumon: randomUUID(),
  customer: randomUUID(),
  supplier: randomUUID(),
  model: randomUUID(),
};
const TABLES = "purchases, purchase_lines, sales, sale_lines, returns, return_lines, money_entries";

beforeAll(async () => {
  api = await partnerApi(sql, "Partner A");
  userId = api.user.userId;
  await sql`insert into people (id, name, kind, profit_share_pct, whatsapp) values
    (${ids.arif}, 'Arif', 'partner', 50, '+8801711000001'),
    (${ids.sumon}, 'Sumon', 'partner', 50, null)`;
  await sql`insert into customers (id, proprietor_name, shop_name, phone, whatsapp)
    values (${ids.customer}, 'Jamal', 'Test Telecom', '01800000000', '01800-000001')`;
  await sql`insert into suppliers (id, name, phone) values (${ids.supplier}, 'Test Supplier', '1234')`;
  await sql`insert into models (id, name) values (${ids.model}, 'Model V')`;
  [{ id: walkIn }] = await sql`select id from customers where is_system`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql.unsafe(`truncate ${TABLES}, audit_log, month_closes`);
});

afterAll(async () => {
  await sql.unsafe(`truncate ${TABLES}, audit_log, month_closes, models, suppliers cascade`);
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
  await api.close();
  await sql.end();
  await db.$client.end();
});

function ok<R extends { status: string }>(result: R) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result as Extract<R, { status: "ok" }>;
}

/** A cash purchase of one lot of Model V. */
async function lot(date: string, qty: number, unitCost: string) {
  const purchaseId = randomUUID();
  await sql`insert into purchases (id, date, source) values (${purchaseId}, ${date}, 'cash')`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${randomUUID()}, ${purchaseId}, ${ids.model}, ${qty}, ${unitCost})`;
}

const money = (fields: object) =>
  saveMoneyEntry({ id: randomUUID(), date: today, note: "", ...fields }).then(ok);

async function draft(id: string) {
  const d = await loadDraft({ kind: "entry", id });
  if (!d) throw new Error("no draft");
  return d;
}

const balance = async () => (await loadBooks()).books.customers[ids.customer]?.balance ?? 0;

describe("CR-020 message drafts", () => {
  it("I-CR-020.1 sale + Received now (a pair, split lots merged), payment, return, discount, profit share", async () => {
    await lot(addDays(today, -2), 1, "15000");
    await lot(addDays(today, -1), 5, "16000");
    const saleId = randomUUID();
    ok(
      await saveSale({
        id: saleId,
        paymentId: randomUUID(),
        date: today,
        customerId: ids.customer,
        note: "",
        receivedNow: "10,000",
        lines: [{ modelId: ids.model, qty: "3", unitPrice: "18,000" }],
      }),
    );
    const [{ invoice_no: inv }] = await sql`select invoice_no from sales where id = ${saleId}`;

    const sale = await draft(saleId);
    expect(sale).toMatchObject({
      type: "sale",
      recipient: "Test Telecom (Jamal)",
      number: "8801800000001",
      name: "Jamal",
    });
    // Two lots, one line; the bill and its payment are one pair: 0 + 54,000 − 10,000.
    expect(sale.body).toContain(`*Invoice ${invoiceLabel(inv)}*`);
    expect(sale.body).toContain("1. Model V × 3 @ ৳18,000 = ৳54,000");
    expect(sale.body).not.toContain("2. Model V");
    expect(sale.body).toContain(
      "- Previous due: ৳0\n- This bill: +৳54,000\n- Paid now: -৳10,000\n- *Due now: ৳44,000*",
    );
    expect(await balance()).toBe(4_400_000);

    const pay = await money({
      type: "customer_payment",
      customerId: ids.customer,
      amount: "5,000",
    });
    const [{ receipt_no: mr }] =
      await sql`select receipt_no from money_entries where id = ${pay.id}`;
    const payment = await draft(pay.id);
    expect(payment.body).toContain(`✅ *Payment received — ${receiptLabel(mr)}*`);
    expect(payment.body).toContain("_Taka Five Thousand Only_");
    expect(payment.body).toContain("Previous due: ৳44,000\n*Due now: ৳39,000*");
    // The sale's message now adds today's due (a newer entry moved it).
    expect((await draft(saleId)).body).toContain("- Due today: ৳39,000");

    const [line] = await sql`select id from sale_lines where sale_id = ${saleId} limit 1`;
    const ret = ok(
      await saveReturn({
        id: randomUUID(),
        kind: "customer",
        date: today,
        customerId: ids.customer,
        note: "",
        lines: [{ saleLineId: line.id, qty: "1", unitAmount: "18,000" }],
      }),
    );
    const back = await draft(ret.id);
    expect(back.type).toBe("return");
    expect(back.body).toContain("- Model V × 1 @ ৳18,000\nRefund to your due: -৳18,000");
    expect(back.body).toContain("*Due now: ৳21,000*");

    const disc = await money({
      type: "customer_discount",
      customerId: ids.customer,
      amount: "500",
    });
    expect((await draft(disc.id)).body).toContain("Discount: ৳500\n*Due now: ৳20,500*");

    const share = await money({
      type: "customer_profit_share",
      customerId: ids.customer,
      amount: "2,000",
      forMonth: lastMonth,
      settleMode: "added_to_due",
    });
    const shared = await draft(share.id);
    expect(shared.type).toBe("profit_share");
    expect(shared.body).toContain("Added to your due: ৳2,000\n*Due now: ৳22,500*");

    // Every due above is the books' own: the last message's due is today's balance.
    const { books } = await loadBooks();
    expect(books.customers[ids.customer].balance).toBe(2_250_000);
    expectBalanced(books.posted, today);

    // A purchase or a supplier's entry has no customer message.
    expect(await loadDraft({ kind: "entry", id: randomUUID() })).toBeNull();
  });

  it("I-CR-020.1 Walk-in: no account section, no number (Share); reminder: due + last payment", async () => {
    await lot(addDays(today, -1), 2, "15000");
    const saleId = randomUUID();
    ok(
      await saveSale({
        id: saleId,
        paymentId: randomUUID(),
        date: today,
        customerId: walkIn,
        note: "",
        receivedNow: "18,000",
        lines: [{ modelId: ids.model, qty: "1", unitPrice: "18,000" }],
      }),
    );
    const d = await draft(saleId);
    expect(d).toMatchObject({ number: null, name: null });
    expect(d.body).not.toContain("Your account");
    expect(d.body).toContain("Paid: ৳18,000");
    expect(await loadDraft({ kind: "reminder", customerId: walkIn })).toBeNull();

    ok(
      await saveSale({
        id: randomUUID(),
        paymentId: randomUUID(),
        date: today,
        customerId: ids.customer,
        note: "",
        lines: [{ modelId: ids.model, qty: "1", unitPrice: "20,000" }],
      }),
    );
    await money({ type: "customer_payment", customerId: ids.customer, amount: "3,000" });
    const reminder = await loadDraft({ kind: "reminder", customerId: ids.customer });
    expect(reminder?.body).toContain(`Your due with us is *${format(await balance())}*`);
    expect(reminder?.body).toContain("Last payment: ৳3,000 on");
  });

  it("I-CR-020.2 a statement for a period ties out to the books, for each kind", async () => {
    await lot(addDays(today, -1), 2, "15000");
    const saleId = randomUUID();
    ok(
      await saveSale({
        id: saleId,
        paymentId: randomUUID(),
        date: today,
        customerId: ids.customer,
        note: "",
        lines: [{ modelId: ids.model, qty: "2", unitPrice: "18,000" }],
      }),
    );
    await money({ type: "capital_in", personId: ids.arif, amount: "100,000" });
    const [{ invoice_no: inv }] = await sql`select invoice_no from sales where id = ${saleId}`;
    const from = `${monthOf(today)}-01`;
    const range = { from, to: today };

    const customer = await loadDraft({
      kind: "statement",
      account: "customer",
      id: ids.customer,
      ...range,
    });
    expect(customer?.body).toContain(`Sale ${invoiceLabel(inv)}: +৳36,000`);
    expect(customer?.body).toContain(`*Closing due: ${format(await balance())}*`);

    const person = await loadDraft({
      kind: "statement",
      account: "person",
      id: ids.arif,
      ...range,
    });
    expect(person).toMatchObject({ recipient: "Arif", number: "8801711000001", name: "Arif" });
    expect(person?.body).toContain("*Closing capital: ৳1,00,000*");

    const supplier = await loadDraft({
      kind: "statement",
      account: "supplier",
      id: ids.supplier,
      ...range,
    });
    expect(supplier).toMatchObject({ number: null });
    expect(supplier?.body).toContain("No entries in this period.");

    const { books } = await loadBooks();
    expectBalanced(books.posted, today);
  });
});
