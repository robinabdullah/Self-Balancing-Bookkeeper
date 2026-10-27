import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { extractText } from "unpdf";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { GET as invoiceGet } from "@/app/pdf/invoice/route";
import { GET as receiptGet } from "@/app/pdf/receipt/route";
import { GET as salesGet } from "@/app/pdf/sales/route";
import { GET } from "@/app/pdf/statement/route";
import { docLabel } from "@mbl/domain/journal/labels";
import { addDays, dhakaToday, monthOf } from "@mbl/domain/dates";
import {
  invoicePdfHref,
  receiptPdfHref,
  salesPdfHref,
  statementPdfHref,
  withQuery,
} from "@mbl/domain/href";
import { format } from "@mbl/domain/money";
import { invoiceLabel, receiptLabel } from "@mbl/domain/whatsapp";
import { customerBills } from "@/server/accounts";
import { saveMoneyEntry } from "@/server/actions/money";
import { reverseEntry } from "@/server/actions/reverse";
import { saveSale } from "@/server/actions/sale";
import { loadBooks } from "@/server/books";
import { loadJournal } from "@/server/journal";
import { loadDraft } from "@/server/messages";
import { expectBalanced } from "../engine/invariant";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// CR-021 (D-041; UIDD §4.16), CR-022 (D-042) and CR-029 (D-049, per-document terms): the due
// statement, invoice and receipt PDF routes on real saves: partner-only, its figures tie out to
// the books, How to pay only on customers, never cost or profit, each with its own terms. The
// session and `revalidatePath` are stood in for as in action.test.ts. Synthetic data only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
let userId = "";
let walkIn = "";

const today = dhakaToday();
const range = { from: `${monthOf(today)}-01`, to: today };
const ids = {
  arif: randomUUID(),
  sumon: randomUUID(),
  customer: randomUUID(),
  supplier: randomUUID(),
  model: randomUUID(),
  bank: randomUUID(),
};
const TABLES = "purchases, purchase_lines, sales, sale_lines, returns, return_lines, money_entries";

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `pdf-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  await sql`insert into profiles (user_id, name, role) values (${userId}, 'Partner A', 'partner')`;
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50)`;
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.customer}, 'Jamal', 'Test Telecom')`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, 'Test Supplier')`;
  await sql`insert into models (id, name) values (${ids.model}, 'Model V')`;
  await sql`insert into bank_accounts (id, bank_name, account_name, account_number, note)
    values (${ids.bank}, 'Test Bank', 'Test Shop', '9988776655', 'partners only')`;
  [{ id: walkIn }] = await sql`select id from customers where is_system`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql.unsafe(`truncate ${TABLES}, audit_log`);
});

afterAll(async () => {
  await sql.unsafe(`truncate ${TABLES}, audit_log, bank_accounts, models, suppliers cascade`);
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
  await sql`delete from profiles where user_id = ${userId}`;
  await admin.auth.admin.deleteUser(userId);
  await sql.end();
  await db.$client.end();
});

const ROUTES = {
  "/pdf/invoice": invoiceGet,
  "/pdf/receipt": receiptGet,
  "/pdf/statement": GET,
  "/pdf/sales": salesGet,
};
const get = (href: string) => {
  const req = new NextRequest(new URL(href, "http://localhost"));
  return ROUTES[req.nextUrl.pathname as keyof typeof ROUTES](req);
};
async function text(res: Response) {
  expect(res.status).toBe(200);
  return (await extractText(new Uint8Array(await res.arrayBuffer()), { mergePages: true })).text;
}

describe("CR-021 due statement PDF route", () => {
  it("I-CR-021.1 partner-only; bad, Walk-in and unknown requests are refused", async () => {
    getUser.mockResolvedValue(null);
    expect(
      (await get(statementPdfHref("customer", ids.customer, range.from, range.to))).status,
    ).toBe(403);
    getUser.mockResolvedValue({ id: userId });
    expect(
      (await get(`/pdf/statement?kind=card&id=${ids.customer}&from=${range.from}&to=${range.to}`))
        .status,
    ).toBe(400);
    expect(
      (await get(statementPdfHref("customer", ids.customer, range.to, "2000-01-01"))).status,
    ).toBe(400);
    expect((await get(statementPdfHref("customer", walkIn, range.from, range.to))).status).toBe(
      404,
    );
    expect(
      (await get(statementPdfHref("supplier", randomUUID(), range.from, range.to))).status,
    ).toBe(404);
  });

  it("I-CR-021.2 the customer PDF ties out to the books, with How to pay; no cost or profit", async () => {
    const purchaseId = randomUUID();
    await sql`insert into purchases (id, date, source, supplier_id)
      values (${purchaseId}, ${addDays(today, -1)}, 'supplier_credit', ${ids.supplier})`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
      values (${randomUUID()}, ${purchaseId}, ${ids.model}, 5, '13579')`;
    const saleId = randomUUID();
    const sale = await saveSale({
      id: saleId,
      paymentId: randomUUID(),
      date: today,
      customerId: ids.customer,
      note: "",
      receivedNow: "4,000",
      lines: [{ modelId: ids.model, qty: "2", unitPrice: "18,000" }],
    });
    expect(sale.status).toBe("ok");
    const [{ invoice_no: inv }] = await sql`select invoice_no from sales where id = ${saleId}`;
    const { books, asOf } = await loadBooks();
    expectBalanced(books.posted, asOf);
    const due = books.customers[ids.customer].balance;
    expect(due).toBe(3_200_000);

    const res = await get(
      statementPdfHref("customer", ids.customer, range.from, range.to, [ids.bank]),
    );
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(
      new RegExp(`statement-test-telecom-jamal-${range.from}-to-${range.to}\\.pdf"$`),
    );
    const t = await text(res);
    expect(t).toContain("Test Telecom (Jamal)");
    expect(t).toContain(`Sale ${invoiceLabel(inv)}`);
    expect(t).toContain(`Please pay ${format(due)}`);
    expect(t).toContain("How to pay");
    expect(t).toContain("9988776655");
    expect(t).not.toContain("partners only");
    // Cost 2 × ৳13,579 and profit 2 × ৳4,421 never appear.
    for (const s of ["৳27,158", "৳13,579", "৳8,842", "৳4,421"]) expect(t).not.toContain(s);

    const plain = await text(
      await get(statementPdfHref("customer", ids.customer, range.from, range.to)),
    );
    expect(plain).not.toContain("How to pay");
  });

  it("I-CR-021.3 the supplier PDF: balance due to them, never How to pay", async () => {
    const purchaseId = randomUUID();
    await sql`insert into purchases (id, date, source, supplier_id)
      values (${purchaseId}, ${today}, 'supplier_credit', ${ids.supplier})`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
      values (${randomUUID()}, ${purchaseId}, ${ids.model}, 3, '10000')`;
    const { books } = await loadBooks();
    const owed = books.suppliers[ids.supplier].balance;
    expect(owed).toBe(3_000_000);
    const t = await text(
      await get(statementPdfHref("supplier", ids.supplier, range.from, range.to, [ids.bank])),
    );
    expect(t).toContain(`Balance due to you: ${format(owed)}`);
    expect(t).not.toContain("How to pay");
  });
});

/** 5 phones at ৳13,579 cost (yesterday), then a sale of 2 @ ৳18,000 with ৳4,000 received now. */
async function sell() {
  const purchaseId = randomUUID();
  await sql`insert into purchases (id, date, source, supplier_id)
    values (${purchaseId}, ${addDays(today, -1)}, 'supplier_credit', ${ids.supplier})`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${randomUUID()}, ${purchaseId}, ${ids.model}, 5, '13579')`;
  const [saleId, paymentId] = [randomUUID(), randomUUID()];
  const saved = await saveSale({
    id: saleId,
    paymentId,
    date: today,
    customerId: ids.customer,
    note: "",
    receivedNow: "4,000",
    lines: [{ modelId: ids.model, qty: "2", unitPrice: "18,000" }],
  });
  expect(saved.status).toBe("ok");
  const [{ invoice_no: inv }] = await sql`select invoice_no from sales where id = ${saleId}`;
  const [{ receipt_no: mr }] =
    await sql`select receipt_no from money_entries where id = ${paymentId}`;
  return { saleId, paymentId, inv: invoiceLabel(inv), mr: receiptLabel(mr) };
}

describe("CR-022 invoice and money receipt PDF routes", () => {
  it("I-CR-022.1 partner-only; bad ids, other kinds and reversals are refused", async () => {
    const { saleId, paymentId } = await sell();
    getUser.mockResolvedValue(null);
    expect((await get(invoicePdfHref(saleId))).status).toBe(403);
    expect((await get(receiptPdfHref(paymentId))).status).toBe(403);
    getUser.mockResolvedValue({ id: userId });
    expect((await get("/pdf/invoice?id=nope")).status).toBe(400);
    expect((await get(invoicePdfHref(randomUUID()))).status).toBe(404);
    // A payment has no invoice, a sale no receipt.
    expect((await get(invoicePdfHref(paymentId))).status).toBe(404);
    expect((await get(receiptPdfHref(saleId))).status).toBe(404);
    // A reversal has no document.
    const reversal = randomUUID();
    const r = await reverseEntry({ id: reversal, table: "sale", reversesId: saleId, date: today });
    expect(r.status).toBe("ok");
    expect((await get(invoicePdfHref(reversal))).status).toBe(404);
  });

  it("I-CR-022.2 the invoice and its Received now receipt tie out to the books; no cost or profit", async () => {
    const { saleId, paymentId, inv, mr } = await sell();
    const { books, asOf } = await loadBooks();
    expectBalanced(books.posted, asOf);
    const due = books.customers[ids.customer].balance;
    expect(due).toBe(3_200_000);

    await sql`update customers set phone = '01711000000', address = 'Gulshan, Dhaka'
      where id = ${ids.customer}`;
    const res = await get(invoicePdfHref(saleId, [ids.bank]));
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(
      new RegExp(`invoice-${inv.toLowerCase()}\\.pdf"$`),
    );
    const t = await text(res);
    expect(t).toContain(`Invoice ${inv}`);
    expect(t).toContain("Test Telecom (Jamal)");
    expect(t).toContain("Model V");
    expect(t).toContain(format(3_600_000));
    expect(t).toContain("Bill to");
    expect(t).toContain("01711000000 · Gulshan, Dhaka");
    expect(t).toContain("Taka Thirty Six Thousand Only");
    expect(t).toContain("PARTLY PAID");
    expect(t).toContain("Paid now");
    expect(t).toContain("Current due");
    expect(t).toContain(format(due));
    expect(t).toContain("How to pay");
    expect(t).toContain("9988776655");
    expect(t).not.toContain("partners only");
    // Cost 2 × ৳13,579 and profit 2 × ৳4,421 never appear.
    for (const s of ["৳27,158", "৳13,579", "৳8,842", "৳4,421"]) expect(t).not.toContain(s);
    expect(await text(await get(invoicePdfHref(saleId)))).not.toContain("How to pay");

    // The Received now receipt reads like a receipt book; its sum shows the bill so it adds up:
    // ৳0 + ৳36,000 − ৳4,000 = ৳32,000 (11% of the due cleared).
    const r = await text(await get(receiptPdfHref(paymentId)));
    expect(r).toContain(`Money receipt ${mr}`);
    expect(r).toContain("Received with thanks from");
    expect(r).toContain("01711000000 · Gulshan, Dhaka");
    expect(r).toContain(format(400_000));
    expect(r).toContain("Taka Four Thousand Only");
    expect(r).toContain(`Bill ${inv}`);
    expect(r).toContain(`+${format(3_600_000)}`);
    expect(r).toContain(format(due));
    expect(r).toContain("Cleared 11% of the due");
    expect(r).toContain("Computer-generated, no signature required");

    // The send preview offers the same PDFs.
    expect((await loadDraft({ kind: "entry", id: saleId }))?.pdf).toBe(invoicePdfHref(saleId));
    expect((await loadDraft({ kind: "entry", id: paymentId }))?.pdf).toBe(
      receiptPdfHref(paymentId),
    );
  });

  it("I-CR-022.3 a reversed sale or payment prints CANCELLED; the numbers reach the Journal and Bills", async () => {
    const { saleId, inv } = await sell();
    const pay = randomUUID();
    const paid = await saveMoneyEntry({
      id: pay,
      date: today,
      note: "",
      type: "customer_payment",
      customerId: ids.customer,
      amount: "1,000",
    });
    expect(paid.status).toBe("ok");
    const [{ receipt_no: mr }] = await sql`select receipt_no from money_entries where id = ${pay}`;

    const journal = await loadJournal();
    const label = (id: string) => docLabel(journal.find((j) => j.id === id)!);
    expect(label(saleId)).toBe(inv);
    expect(label(pay)).toBe(receiptLabel(mr));
    const [bill] = await customerBills(ids.customer);
    expect(invoiceLabel(bill.invoiceNo!)).toBe(inv);

    for (const [table, id] of [
      ["sale", saleId],
      ["money", pay],
    ])
      expect(
        (await reverseEntry({ id: randomUUID(), table, reversesId: id, date: today })).status,
      ).toBe("ok");
    const { books, asOf } = await loadBooks();
    expectBalanced(books.posted, asOf);

    const t = await text(await get(invoicePdfHref(saleId)));
    expect(t).toContain(`Invoice ${inv}`);
    expect(t).toContain("CANCELLED");
    expect(t).toContain("Reversed on");
    expect(t).not.toContain("Current due");
    expect(t).not.toMatch(/PARTLY PAID|DUE/);
    const r = await text(await get(receiptPdfHref(pay)));
    expect(r).toContain("CANCELLED");
    expect(r).not.toContain("Due now");
    expect(r).not.toMatch(/PAID IN FULL|ADVANCE|Cleared/);
    // A reversed entry has no message: its Share PDF sits in the entry sheet instead.
    expect(await loadDraft({ kind: "entry", id: saleId })).toBeNull();
  });
});

describe("CR-029 per-document PDF terms", () => {
  it("I-CR-029.2 the invoice, receipt and statements each print only their own terms", async () => {
    const { saleId, paymentId } = await sell();
    const { books, asOf } = await loadBooks();
    expectBalanced(books.posted, asOf);
    const [seeded] = await sql`select invoice_terms, receipt_terms, statement_terms, footer
      from business_profile`;
    await sql`update business_profile set
      invoice_terms = ${"7-day replacement\n\n  Box and accessories intact"},
      receipt_terms = 'Cheques are subject to clearance',
      statement_terms = 'Report any difference within 7 days',
      footer = 'Thank you for your business'`;
    try {
      const own = {
        invoice: await text(await get(invoicePdfHref(saleId))),
        receipt: await text(await get(receiptPdfHref(paymentId))),
        customer: await text(
          await get(statementPdfHref("customer", ids.customer, range.from, range.to)),
        ),
        supplier: await text(
          await get(statementPdfHref("supplier", ids.supplier, range.from, range.to)),
        ),
      };
      const terms = {
        invoice: "Box and accessories intact",
        receipt: "Cheques are subject to clearance",
        statement: "Report any difference within 7 days",
      };
      const expected = {
        invoice: "invoice",
        receipt: "receipt",
        customer: "statement",
        supplier: "statement",
      } as const;
      for (const [doc, t] of Object.entries(own)) {
        const kind = expected[doc as keyof typeof expected];
        for (const [k, line] of Object.entries(terms))
          if (k === kind) expect(t, doc).toContain(line);
          else expect(t, doc).not.toContain(line);
        expect(t, doc).toContain("Thank you for your business");
      }
      // D-050: under "Terms & conditions", numbered (the blank line dropped), then the footer line.
      expect(own.invoice).toMatch(
        /Terms & conditions\s*1\.\s*7-day replacement\s*2\.\s*Box and accessories intact\s*Thank you for your business/,
      );
      expect(own.receipt).toMatch(
        /Terms & conditions\s*1\.\s*Cheques are subject to clearance\s*Thank you/,
      );
      for (const t of [own.customer, own.supplier])
        expect(t).toMatch(/Terms & conditions\s*1\.\s*Report any difference within 7 days\s*Thank/);

      // The Sales report is internal: no terms and no footer line.
      const sales = await text(await get(withQuery(salesPdfHref, range)));
      for (const line of [...Object.values(terms), "7-day replacement", "Terms &", "Thank you"])
        expect(sales).not.toContain(line);

      // Empty terms: no box or heading; the footer line still prints. Neither: nothing.
      await sql`update business_profile set receipt_terms = ${" \n "}`;
      const footerOnly = await text(await get(receiptPdfHref(paymentId)));
      expect(footerOnly).not.toContain("Terms & conditions");
      expect(footerOnly).toContain("Thank you for your business");
      await sql`update business_profile set footer = null`;
      const bare = await text(await get(receiptPdfHref(paymentId)));
      for (const line of [...Object.values(terms), "Terms &", "Thank you"])
        expect(bare).not.toContain(line);
    } finally {
      await sql`update business_profile set invoice_terms = ${seeded.invoice_terms},
        receipt_terms = ${seeded.receipt_terms}, statement_terms = ${seeded.statement_terms},
        footer = ${seeded.footer}`;
    }
  });
});
