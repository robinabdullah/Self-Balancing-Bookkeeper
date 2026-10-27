import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { dhakaToday } from "@mbl/domain/dates";
import { BUILT_IN, USED } from "@mbl/domain/setup";
import {
  removeRow,
  saveCard,
  saveCustomer,
  savePerson,
  saveSupplier,
  setActive,
} from "@/server/actions/setup";
import { loadSetup } from "@/server/setup";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// Task 3.2 + CR-004 (PRD §4.1; SRS §4 Setup; UIDD §4.11; D-023). The session and
// `revalidatePath` are stood in for as in action.test.ts. Synthetic data only. Setup rows post
// nothing, so the books stay as they were (empty and balanced).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
let userId = "";

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `setup-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  await sql`insert into profiles (user_id, name, role) values (${userId}, 'Partner A', 'partner')`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql`truncate money_entries, cards, suppliers, models, bank_accounts, audit_log cascade`;
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
});

afterAll(async () => {
  await sql`truncate money_entries, cards, suppliers, models, bank_accounts, audit_log cascade`;
  await sql`delete from people`;
  await sql`delete from profiles where user_id = ${userId}`;
  await admin.auth.admin.deleteUser(userId);
  await sql.end();
  await db.$client.end();
});

const person = (over: object = {}) => ({
  id: randomUUID(),
  name: "Arif",
  kind: "partner",
  profitSharePct: "50",
  note: "",
  ...over,
});

async function saved(result: Awaited<ReturnType<typeof savePerson>>) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result;
}

describe("Setup actions (task 3.2, CR-004, CR-016)", () => {
  it("I3.2.1 partner % ≠ 100 → the save is allowed and the warning total is reported", async () => {
    const arif = person();
    await saved(await savePerson(arif));
    expect((await loadSetup()).partnerWarning).toBe(
      "Partners total 50% — must be 100 before closing",
    );

    const sumon = person({ name: "Sumon", profitSharePct: "60" });
    const r = await saved(await savePerson(sumon));
    expect((await loadSetup()).partnerWarning).toBe(
      "Partners total 110% — must be 100 before closing",
    );

    // An investor has no share; an inactive partner doesn't count.
    await saved(await savePerson(person({ name: "Investor", kind: "investor" })));
    await saved(await savePerson({ ...sumon, profitSharePct: "50", updatedAt: r.updatedAt }));
    const setup = await loadSetup();
    expect(setup.partnerWarning).toBeNull();
    expect(setup.people.find((p) => p.name === "Investor")?.profitSharePct).toBeNull();

    const third = await saved(await savePerson(person({ name: "Third", profitSharePct: "0.5" })));
    expect((await loadSetup()).partnerWarning).toBe(
      "Partners total 100.5% — must be 100 before closing",
    );
    await saved(await setActive("person", { ...third, active: false }));
    expect((await loadSetup()).partnerWarning).toBeNull();

    // Names are unique; the error lands on the field.
    expect(await savePerson(person())).toEqual({
      status: "invalid",
      errors: { name: "This name is already used" },
    });
  });

  it("I3.2.2 deleting a used card → rejected (deactivate offered)", async () => {
    const owner = person();
    await saved(await savePerson(owner));
    const card = {
      id: randomUUID(),
      name: "Brac Visa",
      ownerPersonId: owner.id,
      statementDay: "5",
      dueDay: "20",
      creditLimit: "1,50,000",
    };
    const c = await saved(await saveCard(card));
    const [row] = await sql`select credit_limit from cards where id = ${card.id}`;
    expect(row.credit_limit).toBe("150000.00");
    expect((await loadSetup()).cards[0].display).toBe("Arif · Brac Visa");

    await sql`
      insert into money_entries (type, date, amount, card_id, created_by)
      values ('card_payment', ${dhakaToday()}, 1000, ${card.id}, ${userId})`;
    expect(await removeRow("card", { id: card.id, updatedAt: c.updatedAt })).toEqual({
      status: "invalid",
      errors: { form: USED },
    });
    // The owner is used by the card.
    const [o] = await sql`select updated_at from people where id = ${owner.id}`;
    expect(
      await removeRow("person", { id: owner.id, updatedAt: o.updated_at.toISOString() }),
    ).toMatchObject({ status: "invalid", errors: { form: USED } });

    const off = await saved(
      await setActive("card", { id: card.id, active: false, updatedAt: c.updatedAt }),
    );
    expect((await loadSetup()).cards[0].active).toBe(false);
    await saved(await setActive("card", { id: card.id, active: true, updatedAt: off.updatedAt }));

    // An unused row can be deleted; every change has an audit row.
    const supplier = { id: randomUUID(), name: "Sharif Telecom", phone: "" };
    const s = await saved(await saveSupplier(supplier));
    expect(await removeRow("supplier", { id: supplier.id, updatedAt: s.updatedAt })).toEqual({
      status: "ok",
      id: supplier.id,
      updatedAt: null,
    });
    const audits = await sql`select "table", action from audit_log order by at, created_at`;
    expect(audits.map((a) => `${a.table}:${a.action}`)).toEqual([
      "people:insert",
      "cards:insert",
      "cards:update",
      "cards:update",
      "suppliers:insert",
      "suppliers:delete",
    ]);
  });

  it("I3.2.3 deleting, editing or deactivating Walk-in → rejected", async () => {
    const [walkIn] = await sql`select * from customers where is_system`;
    const seen = { id: walkIn.id, updatedAt: walkIn.updated_at.toISOString() };
    const rejected = { status: "invalid", errors: { form: BUILT_IN } };

    expect(await saveCustomer({ ...seen, proprietorName: "Walk-in", shopName: "Counter" })).toEqual(
      rejected,
    );
    expect(await setActive("customer", { ...seen, active: false })).toEqual(rejected);
    expect(await removeRow("customer", seen)).toEqual(rejected);

    const [after] = await sql`select * from customers where is_system`;
    expect(after).toEqual(walkIn);
    expect(await sql`select * from audit_log`).toHaveLength(0);

    const list = (await loadSetup()).customers;
    expect(list[0]).toMatchObject({ display: "Walk-in", isSystem: true, shopNameMissing: false });

    // A normal customer: shown "Shop (Proprietor)", flagged while the shop name is missing.
    const milon = { id: randomUUID(), proprietorName: "Milon", targetBalance: "60,00,000" };
    const r = await saved(await saveCustomer(milon));
    expect((await loadSetup()).customers[1]).toMatchObject({
      display: "Milon",
      shopNameMissing: true,
    });
    await saved(
      await saveCustomer({ ...milon, shopName: "Milon Telecom", updatedAt: r.updatedAt }),
    );
    expect((await loadSetup()).customers[1]).toMatchObject({
      display: "Milon Telecom (Milon)",
      shopNameMissing: false,
    });
    expect(
      await saveCustomer({ id: randomUUID(), proprietorName: "Selim", shopName: "Milon Telecom" }),
    ).toEqual({ status: "invalid", errors: { shopName: "This shop name is already used" } });
  });

  it("I-CR-016.5 a card's Type is saved; the same name may have another Type, not the same", async () => {
    const owner = person();
    await saved(await savePerson(owner));
    const card = (network: string) => ({
      id: randomUUID(),
      name: "EBL",
      network,
      ownerPersonId: owner.id,
      statementDay: "5",
      dueDay: "20",
    });
    await saved(await saveCard(card("visa")));
    await saved(await saveCard(card("mastercard")));
    expect(await saveCard(card("visa"))).toEqual({
      status: "invalid",
      errors: { name: "This owner already has a card with this name and type" },
    });
    expect((await loadSetup()).cards.map((c) => [c.display, c.network])).toEqual([
      ["Arif · EBL Visa", "visa"],
      ["Arif · EBL Mastercard", "mastercard"],
    ]);
  });

  it("I-CR-016.4 saved bank accounts and card details don't make a row used; they go with it", async () => {
    const owner = person();
    const o = await saved(await savePerson(owner));
    const card = {
      id: randomUUID(),
      name: "EBL",
      ownerPersonId: owner.id,
      statementDay: "5",
      dueDay: "20",
    };
    const c = await saved(await saveCard(card));
    const supplier = { id: randomUUID(), name: "Sharif Telecom", phone: "" };
    const s = await saved(await saveSupplier(supplier));
    // Synthetic saved details: the business's own account stays; the owners' go with them.
    await sql`insert into bank_accounts (person_id, bank_name, account_name, account_number)
      values (${owner.id}, 'Bank B', 'Arif', '111')`;
    await sql`insert into bank_accounts (supplier_id, bank_name, account_name, account_number)
      values (${supplier.id}, 'Bank B', 'Sharif', '222')`;
    await sql`insert into bank_accounts (bank_name, account_name, account_number)
      values ('Bank B', 'The business', '333')`;
    await sql`insert into card_secrets (card_id, number, last4) values (${card.id}, 'x', '4242')`;

    for (const [kind, id, updatedAt] of [
      ["card", card.id, c.updatedAt],
      ["supplier", supplier.id, s.updatedAt],
    ] as const)
      expect(await removeRow(kind, { id, updatedAt })).toMatchObject({ status: "ok" });
    // The card went first, so its owner is unused now.
    const [p] = await sql`select updated_at from people where id = ${o.id}`;
    expect(
      await removeRow("person", { id: owner.id, updatedAt: p.updated_at.toISOString() }),
    ).toMatchObject({ status: "ok" });
    expect(await sql`select account_number from bank_accounts`).toEqual([
      { account_number: "333" },
    ]);
    expect(await sql`select id from card_secrets`).toHaveLength(0);
    await sql`delete from bank_accounts`;
  });
});
