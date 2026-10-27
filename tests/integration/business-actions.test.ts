import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import {
  deleteBankAccount,
  saveBankAccount,
  saveBusinessDetails,
  saveLogo,
  savePdfTerms,
  saveTemplate,
} from "@/server/actions/business";
import { removeRow, saveCustomer, savePerson, saveSupplier } from "@/server/actions/setup";
import { loadBooks } from "@/server/books";
import { bankCounts, getBusiness, getLogo, loadBankAccounts } from "@/server/business";
import { loadSetup } from "@/server/setup";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// CR-019 (D-039; UIDD §4.11, §4.13, §4.14): the business profile, message templates, contacts in
// Setup and the saved bank accounts; CR-029 (D-049): the PDF terms; each saved through the action helper with an audit row. The
// session and `revalidatePath` are stood in for as in action.test.ts. Synthetic data only; none
// of this posts anything, so the books stay balanced. The seeded profile is restored afterwards.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
let userId = "";
let seeded: Record<string, unknown>;

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `business-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  await sql`insert into profiles (user_id, name, role) values (${userId}, 'Partner A', 'partner')`;
  [seeded] = await sql`select * from business_profile`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql`truncate bank_accounts, suppliers, audit_log cascade`;
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
});

afterAll(async () => {
  const s = seeded;
  await sql`update business_profile set name = ${s.name as string},
    short_name = ${s.short_name as string | null}, address = ${s.address as string | null},
    phones = ${s.phones as string | null}, whatsapp = ${s.whatsapp as string | null},
    email = ${s.email as string | null}, trade_licence = ${s.trade_licence as string | null},
    tin = ${s.tin as string | null}, bin = ${s.bin as string | null},
    invoice_terms = ${s.invoice_terms as string | null}, footer = ${s.footer as string | null},
    receipt_terms = ${s.receipt_terms as string | null},
    statement_terms = ${s.statement_terms as string | null},
    logo = ${s.logo as string | null}, templates = ${sql.json(s.templates as Record<string, never>)}`;
  await sql`truncate bank_accounts, suppliers, audit_log cascade`;
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
  await sql`delete from profiles where user_id = ${userId}`;
  await admin.auth.admin.deleteUser(userId);
  await sql.end();
  await db.$client.end();
});

type Audit = { table: string; action: string; before: unknown; after: unknown };
const audits = () => sql<Audit[]>`select "table", action, before, after from audit_log order by at`;

/** The profile's id and current `updatedAt`, as the Settings page sends them. */
const meta = async () => {
  const b = (await getBusiness())!;
  return { id: b.id, updatedAt: b.updatedAt };
};

async function ok(result: { status: string }) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result as { status: "ok"; id: string; updatedAt: string };
}

const details = {
  name: "Test Phones Ltd",
  shortName: "Test Phones",
  address: "Shop 12, Dhaka",
  phones: "01700000001, 01700000002",
  whatsapp: "01700000001",
  email: "shop@test.local",
  tradeLicence: "TL-1",
  tin: "123",
  bin: "456",
};

describe("CR-019 business profile", () => {
  it("I-CR-019.1 details are saved and audited; a stale updatedAt is a conflict", async () => {
    const result = await ok(await saveBusinessDetails({ ...(await meta()), ...details }));
    const b = (await getBusiness())!;
    expect(b).toMatchObject(details);
    expect(b.updatedAt).toBe(result.updatedAt);

    const [audit] = await audits();
    expect(audit).toMatchObject({
      table: "business_profile",
      action: "update",
      before: { name: "Demo Business Shop" },
      after: { name: "Test Phones Ltd", shortName: "Test Phones" },
    });
    // The logo never goes into the audit log.
    expect(JSON.stringify(audit)).not.toContain("base64");
    expect(audit.before).not.toHaveProperty("logo");

    const stale = await saveBusinessDetails({
      id: b.id,
      updatedAt: new Date(0).toISOString(),
      ...details,
      name: "Other",
    });
    expect(stale.status).toBe("conflict");
    expect(
      await saveBusinessDetails({ ...(await meta()), ...details, name: " ", email: "x" }),
    ).toMatchObject({
      status: "invalid",
      errors: { name: "Enter the business name", email: "Enter a valid email" },
    });
    expect((await getBusiness())!.name).toBe("Test Phones Ltd");

    const { books } = await loadBooks();
    expect(books.invariant.difference).toBe(0);
  });

  it("I-CR-019.2 the logo is saved; the audit says changed / removed, never the image", async () => {
    await ok(await saveLogo({ ...(await meta()), logo: PNG }));
    expect(await getLogo()).toBe(PNG);
    const version = (await getBusiness())!.logoVersion;
    expect(version).toMatch(/^[0-9a-f]{8}$/);

    await ok(await saveLogo({ ...(await meta()), logo: "" }));
    expect(await getLogo()).toBeNull();
    expect((await getBusiness())!.logoVersion).toBeNull();

    const rows = await audits();
    expect(rows.map((r) => [r.before, r.after])).toEqual([
      [{ logo: "set" }, { logo: "changed" }],
      [{ logo: "set" }, { logo: "removed" }],
    ]);
    expect(JSON.stringify(rows)).not.toContain("base64");

    expect((await saveLogo({ ...(await meta()), logo: "https://x/logo.png" })).status).toBe(
      "invalid",
    );
  });

  it("I-CR-019.3 a template is merged in; the other types keep theirs", async () => {
    await ok(
      await saveTemplate({
        ...(await meta()),
        type: "reminder",
        greeting: "Dear {name},",
        signOff: "— {shop}",
      }),
    );
    await ok(await saveTemplate({ ...(await meta()), type: "sale", greeting: "", signOff: "Bye" }));
    expect((await getBusiness())!.templates).toEqual({
      reminder: { greeting: "Dear {name},", signOff: "— {shop}" },
      sale: { greeting: "", signOff: "Bye" },
    });
    const rows = await audits();
    expect(rows[1].before).toEqual({
      templates: { reminder: { greeting: "Dear {name},", signOff: "— {shop}" } },
    });
    expect((await saveTemplate({ ...(await meta()), type: "cash_book" })).status).toBe("invalid");
  });
});

describe("CR-029 PDF terms", () => {
  const terms = {
    invoiceTerms: "7-day replacement\nBox and accessories intact",
    receiptTerms: "Cheques are subject to clearance",
    statementTerms: "Report any difference within 7 days",
    footer: "Thank you for your business",
  };

  it("I-CR-029.1 savePdfTerms saves + audits; saving Details keeps the terms", async () => {
    await sql`update business_profile set invoice_terms = 'Old terms', receipt_terms = null,
      statement_terms = null, footer = null`;
    await ok(await savePdfTerms({ ...(await meta()), ...terms }));
    expect(await getBusiness()).toMatchObject(terms);
    const [audit] = await audits();
    expect(audit).toEqual({
      table: "business_profile",
      action: "update",
      before: { invoiceTerms: "Old terms", receiptTerms: null, statementTerms: null, footer: null },
      after: terms,
    });

    // Details no longer carries them: a save (even one sent with the old fields) keeps all four.
    await ok(
      await saveBusinessDetails({ ...(await meta()), ...details, invoiceTerms: "", footer: "" }),
    );
    expect(await getBusiness()).toMatchObject({ ...terms, name: details.name });

    // At most 1,000 characters; blank clears one box.
    expect(
      await savePdfTerms({ ...(await meta()), ...terms, receiptTerms: "x".repeat(1001) }),
    ).toMatchObject({ status: "invalid", errors: { receiptTerms: "At most 1,000 characters" } });
    await ok(await savePdfTerms({ ...(await meta()), ...terms, receiptTerms: " " }));
    expect((await getBusiness())!.receiptTerms).toBeNull();

    const { books } = await loadBooks();
    expect(books.invariant.difference).toBe(0);
  });
});

const account = (over: object = {}) => ({
  id: randomUUID(),
  bankName: "EBL",
  branch: "Gulshan",
  accountName: "Test Phones Ltd",
  accountNumber: "1234567890",
  routingNumber: "095261234",
  note: "",
  ...over,
});

describe("CR-019 contacts and bank accounts", () => {
  it("I-CR-019.6 contacts are saved on people, customers and suppliers", async () => {
    const contact = { phone: "01711111111", whatsapp: "01811111111", email: "a@test.local" };
    await ok(
      await savePerson({ id: randomUUID(), name: "Nadim", kind: "investor", note: "", ...contact }),
    );
    await ok(await saveCustomer({ id: randomUUID(), proprietorName: "Karim", ...contact }));
    await ok(await saveSupplier({ id: randomUUID(), name: "Wholesale", ...contact }));
    const setup = await loadSetup();
    for (const row of [
      setup.people[0],
      setup.customers.find((c) => !c.isSystem)!,
      setup.suppliers[0],
    ])
      expect(row).toMatchObject(contact);
    expect(
      await saveSupplier({ id: randomUUID(), name: "Bad", email: "not-an-email" }),
    ).toMatchObject({ status: "invalid", errors: { email: "Enter a valid email" } });
  });

  it("I-CR-019.4 add, edit and delete for the business and each owner kind, audited", async () => {
    const nadim = randomUUID();
    const karim = randomUUID();
    const supplier = randomUUID();
    await ok(await savePerson({ id: nadim, name: "Nadim", kind: "investor", note: "" }));
    await ok(await saveCustomer({ id: karim, proprietorName: "Karim" }));
    await ok(await saveSupplier({ id: supplier, name: "Wholesale" }));
    await sql`truncate audit_log`;

    const business = account();
    await ok(await saveBankAccount(business));
    await ok(
      await saveBankAccount(account({ ownerKind: "person", ownerId: nadim, bankName: "City" })),
    );
    await ok(
      await saveBankAccount(account({ ownerKind: "customer", ownerId: karim, bankName: "BRAC" })),
    );
    const sup = account({
      ownerKind: "supplier",
      ownerId: supplier,
      bankName: "UCB",
      note: "cash",
    });
    const saved = await ok(await saveBankAccount(sup));

    const all = await loadBankAccounts();
    expect(all.map((a) => [a.owner.kind, a.owner.label, a.bankName])).toEqual([
      ["business", "The business", "EBL"],
      ["person", "Nadim", "City"],
      ["customer", "Karim", "BRAC"],
      ["supplier", "Wholesale", "UCB"],
    ]);
    expect(await bankCounts()).toEqual({ [nadim]: 1, [karim]: 1, [supplier]: 1 });

    // Edit: another number; the owner moves to the business.
    await ok(
      await saveBankAccount({
        ...sup,
        ownerKind: "business",
        ownerId: "",
        accountNumber: "999",
        updatedAt: saved.updatedAt,
      }),
    );
    const edited = (await loadBankAccounts()).find((a) => a.id === sup.id)!;
    expect(edited).toMatchObject({ accountNumber: "999", supplierId: null, note: "cash" });
    expect(edited.owner.kind).toBe("business");

    await ok(
      await deleteBankAccount({
        id: business.id,
        updatedAt: (await loadBankAccounts())[0].updatedAt,
      }),
    );
    expect((await loadBankAccounts()).map((a) => a.id)).not.toContain(business.id);

    const rows = await audits();
    expect(rows.map((r) => [r.table, r.action])).toEqual([
      ["bank_accounts", "insert"],
      ["bank_accounts", "insert"],
      ["bank_accounts", "insert"],
      ["bank_accounts", "insert"],
      ["bank_accounts", "update"],
      ["bank_accounts", "delete"],
    ]);
    expect(rows[4]).toMatchObject({
      before: { accountNumber: "1234567890", supplierId: supplier },
      after: { accountNumber: "999", supplierId: null },
    });

    // Validation: routing 9 digits; an owner kind needs an owner.
    expect(await saveBankAccount(account({ routingNumber: "123" }))).toMatchObject({
      status: "invalid",
      errors: { routingNumber: "A routing number has 9 digits" },
    });
    expect(await saveBankAccount(account({ ownerKind: "customer" }))).toMatchObject({
      status: "invalid",
      errors: { ownerId: "Pick the owner" },
    });
    // A stale edit is a conflict.
    expect((await saveBankAccount({ ...sup, updatedAt: new Date(0).toISOString() })).status).toBe(
      "conflict",
    );

    const { books } = await loadBooks();
    expect(books.invariant.difference).toBe(0);
  });

  it("I-CR-019.5 deleting an owner takes its accounts; they are listed in its audit row", async () => {
    const karim = randomUUID();
    const c = await ok(await saveCustomer({ id: karim, proprietorName: "Karim" }));
    await ok(await saveBankAccount(account({ ownerKind: "customer", ownerId: karim })));
    await ok(
      await saveBankAccount(account({ ownerKind: "customer", ownerId: karim, bankName: "DBBL" })),
    );
    await ok(await saveBankAccount(account({ bankName: "Business bank" })));
    await sql`truncate audit_log`;

    // Not "used": the delete goes through.
    await ok(await removeRow("customer", { id: karim, updatedAt: c.updatedAt }));
    expect((await loadBankAccounts()).map((a) => a.bankName)).toEqual(["Business bank"]);

    const [audit] = await audits();
    expect(audit).toMatchObject({ table: "customers", action: "delete", after: null });
    const before = audit.before as { proprietorName: string; bankAccounts: { bankName: string }[] };
    expect(before.proprietorName).toBe("Karim");
    expect(before.bankAccounts.map((a) => a.bankName).sort()).toEqual(["DBBL", "EBL"]);
  });
});
