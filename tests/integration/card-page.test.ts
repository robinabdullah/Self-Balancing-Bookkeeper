import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { billToPay, cardDetail, visibleBills } from "@mbl/domain/card-view";
import { cardAlerts } from "@mbl/domain/dashboard";
import { addMonths } from "@mbl/domain/dates";
import { parse } from "@mbl/domain/money";
import { cleanPrefill } from "@mbl/domain/prefill";
import { emiPreview } from "@mbl/domain/preview";
import { savePurchase } from "@/server/actions/purchase";
import { loadBooks } from "@/server/books";
import { loadSetup } from "@/server/setup";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// I-CR-013.4 / I-CR-013.5 (D-032): pre-fill against real Setup rows, and an EMI card purchase
// saved through the action as the card page and Home read it. The session and `revalidatePath` are
// stood in for as in action.test.ts. Synthetic data only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
let userId = "";
const ids = {
  person: randomUUID(),
  card: randomUUID(),
  oldCard: randomUUID(),
  customer: randomUUID(),
  oldCustomer: randomUUID(),
  model: randomUUID(),
};

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `card-page-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  await sql`insert into profiles (user_id, name, role) values (${userId}, 'Partner A', 'partner')`;
  await sql`insert into people (id, name, kind, profit_share_pct)
    values (${ids.person}, 'Partner A', 'partner', 100)`;
  await sql`insert into cards (id, name, owner_person_id, statement_day, due_day, active) values
    (${ids.card}, 'EBL Visa', ${ids.person}, 5, 20, true),
    (${ids.oldCard}, 'Old Visa', ${ids.person}, 10, 25, false)`;
  await sql`insert into customers (id, proprietor_name, shop_name, active) values
    (${ids.customer}, 'Owner', 'Test Telecom', true),
    (${ids.oldCustomer}, 'Owner', 'Closed Shop', false)`;
  await sql`insert into models (id, name) values (${ids.model}, 'Model E')`;
});

beforeEach(() => {
  getUser.mockResolvedValue({ id: userId });
});

afterAll(async () => {
  await sql`truncate purchases, purchase_lines, money_entries, audit_log cascade`;
  await sql`delete from cards`;
  await sql`delete from customers where id in (${ids.customer}, ${ids.oldCustomer})`;
  await sql`delete from models`;
  await sql`delete from people`;
  await sql`delete from profiles where user_id = ${userId}`;
  await admin.auth.admin.deleteUser(userId);
  await sql.end();
  await db.$client.end();
});

describe("I-CR-013.4 pre-fill against the real Setup rows", () => {
  it("keeps active rows; drops inactive, unknown and Walk-in where not allowed", async () => {
    const setup = await loadSetup();
    const walkIn = setup.customers.find((c) => c.isSystem)!.id;
    const keep = (form: string, params: Record<string, string>) =>
      cleanPrefill(form, params, setup).prefill;

    expect(keep("card_payment", { cardId: ids.card })).toEqual({ cardId: ids.card });
    expect(keep("card_payment", { cardId: ids.oldCard })).toEqual({});
    expect(keep("card_payment", { cardId: randomUUID() })).toEqual({});
    expect(keep("customer_payment", { customerId: ids.customer })).toEqual({
      customerId: ids.customer,
    });
    expect(keep("customer_payment", { customerId: ids.oldCustomer })).toEqual({});
    expect(keep("customer_profit_share", { customerId: walkIn })).toEqual({});
    expect(keep("sale", { customerId: walkIn })).toEqual({ customerId: walkIn });
    expect(keep("purchase", { cardId: ids.card })).toEqual({ cardId: ids.card, source: "card" });
  });
});

describe("I-CR-013.5 an EMI card purchase on the card page and Home", () => {
  it("bills, the default statements, Pay, one alert per card and the preview all agree", async () => {
    const before = await loadBooks();
    const date = before.asOf;
    const total = parse("21,736.65")!;
    const result = await savePurchase({
      id: randomUUID(),
      date,
      source: "card",
      cardId: ids.card,
      emiMonths: "5",
      note: "",
      lines: [{ id: randomUUID(), modelId: ids.model, qty: "1", unitCost: "21,736.65" }],
    });
    expect(result.status).toBe("ok");

    const { books, asOf } = await loadBooks();
    expect(books.invariant.difference).toBe(0);
    const summary = books.cards[ids.card];
    expect(summary.balance).toBe(total); // the full amount at once (SRS §6.4)
    expect(summary.bills).toHaveLength(5);

    // The form's preview names the same first bill and parts the engine billed.
    const card = (await loadSetup()).cards.find((c) => c.id === ids.card)!;
    const preview = emiPreview(card, date, total, 5, null, [])!;
    expect(summary.bills.map((b) => [b.month, b.amount])).toEqual(
      preview.parts.map((part, k) => [addMonths(preview.firstBill, k), part]),
    );

    // The card page: only the bill(s) to deal with now; the later installments wait.
    const { bills } = cardDetail(summary);
    const { shown, hiddenCount } = visibleBills(bills, asOf);
    expect(shown.length).toBeLessThanOrEqual(2);
    expect(shown.length + hiddenCount).toBe(5);
    expect(billToPay(bills)).toBe(preview.firstBill);

    // Home: the EMI card is one alert, for its first installment.
    const alerts = cardAlerts(books.cards, asOf).filter((a) => a.cardId === ids.card);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].amount).toBe(preview.parts[0]);
  });
});
