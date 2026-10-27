import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { extractText } from "unpdf";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { GET as investorXlsx } from "@/app/(app)/reports/investor/xlsx/route";
import { GET as packXlsx } from "@/app/(app)/reports/pack/xlsx/route";
import { GET as statementXlsx } from "@/app/(app)/reports/statement/xlsx/route";
import { GET as cardPdfGet } from "@/app/pdf/card/route";
import { GET as investorPdfGet } from "@/app/pdf/investor/route";
import { GET as packPdfGet } from "@/app/pdf/pack/route";
import { GET as statementPdfGet } from "@/app/pdf/statement/route";
import { modelTotal } from "@mbl/domain/by-model";
import { clampDay, dhakaToday, monthOf } from "@mbl/domain/dates";
import { owedBySum } from "@mbl/domain/investor-report";
import { add, format, mul, toDecimal } from "@mbl/domain/money";
import { stockTotal } from "@mbl/domain/stock-movement";
import { saveMoneyEntry } from "@/server/actions/money";
import { saveReturn } from "@/server/actions/return";
import { saveSale } from "@/server/actions/sale";
import { loadInvestorReport, loadStatementExtras } from "@/server/account-reports";
import { loadBooks } from "@/server/books";
import { loadPack } from "@/server/pack";
import { loadCashBook, loadSales } from "@/server/reports";
import { stockLots } from "@/server/stock";
import { expectBalanced } from "../engine/invariant";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// CR-025 (D-045): the per-account reports and the Monthly pack on real saves tie out to the books
// and to the screens that already show each figure (Cash book, Sales report, Stock), and their
// PDF / Excel routes are partner-only with no audit row. The session and `revalidatePath` are
// stood in for as in action.test.ts. Synthetic data only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
let userId = "";

const today = dhakaToday();
const month = monthOf(today);
const range = { from: `${month}-01`, to: clampDay(month, 31) };
const ids = {
  arif: randomUUID(),
  sumon: randomUUID(),
  nadim: randomUUID(),
  customer: randomUUID(),
  supplier: randomUUID(),
  card: randomUUID(),
  v: randomUUID(),
  w: randomUUID(),
};
const TABLES = "purchases, purchase_lines, sales, sale_lines, returns, return_lines, money_entries";

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `cr025-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  await sql`insert into profiles (user_id, name, role) values (${userId}, 'Partner A', 'partner')`;
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50),
    (${ids.nadim}, 'Nadim', 'investor', null)`;
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.customer}, 'Jamal', 'Test Telecom')`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, 'Test Supplier')`;
  await sql`insert into models (id, name) values (${ids.v}, 'Model V'), (${ids.w}, 'Model W')`;
  await sql`insert into cards (id, name, owner_person_id, statement_day, due_day)
    values (${ids.card}, 'Test Bank', ${ids.nadim}, 5, 20)`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql.unsafe(`truncate ${TABLES}, audit_log`);
});

afterAll(async () => {
  await sql.unsafe(`truncate ${TABLES}, audit_log, cards, models, suppliers cascade`);
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
  await sql`delete from profiles where user_id = ${userId}`;
  await admin.auth.admin.deleteUser(userId);
  await sql.end();
  await db.$client.end();
});

const ok = (r: { status: string }) => expect(r.status, JSON.stringify(r)).toBe("ok");
const money = (values: Record<string, unknown>) =>
  saveMoneyEntry({ id: randomUUID(), date: today, note: "", ...values } as never);

/** A purchase of one lot (stored directly, as reports.test does): its lot id. */
async function purchase(source: string, model: string, qty: number, unitCost: string, more = {}) {
  const id = randomUUID();
  const lot = randomUUID();
  const m = { supplier_id: null, card_id: null, ...more };
  await sql`insert into purchases (id, date, source, supplier_id, card_id)
    values (${id}, ${today}, ${source}, ${m.supplier_id}, ${m.card_id})`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${lot}, ${id}, ${model}, ${qty}, ${unitCost})`;
  return lot;
}

/**
 * Nadim's capital; three purchases naming the supplier (credit, cash, on Nadim's card); a sale
 * with Received now; one of the cash lot sent back for a cash refund; a damaged / lost write-off
 * of a credit-lot phone; a card payment.
 */
async function trade() {
  ok(await money({ type: "capital_in", personId: ids.nadim, amount: "50,000" }));
  const credit = await purchase("supplier_credit", ids.v, 5, "10000", {
    supplier_id: ids.supplier,
  });
  const cash = await purchase("cash", ids.w, 2, "5000", { supplier_id: ids.supplier });
  await purchase("card", ids.w, 1, "5000", { supplier_id: ids.supplier, card_id: ids.card });
  ok(
    await saveSale({
      id: randomUUID(),
      paymentId: randomUUID(),
      date: today,
      customerId: ids.customer,
      note: "",
      receivedNow: "4,000",
      lines: [{ modelId: ids.v, qty: "2", unitPrice: "13,000", lotId: credit }],
    } as never),
  );
  const back = { id: randomUUID(), kind: "purchase", date: today, note: "" };
  ok(
    await saveReturn({
      ...back,
      reason: "returned",
      refundTo: "cash",
      lines: [{ lotId: cash, qty: "1", unitAmount: "4,500" }],
    } as never),
  );
  ok(
    await saveReturn({
      ...back,
      id: randomUUID(),
      reason: "damaged_lost",
      lines: [{ lotId: credit, qty: "1", unitAmount: "0" }],
    } as never),
  );
  ok(await money({ type: "card_payment", cardId: ids.card, amount: "2,000" }));
}

describe("CR-025 report loaders", () => {
  it("I-CR-025.1 each report ties out to the books and to the other screens", async () => {
    await trade();
    const { books, asOf } = await loadBooks();
    expectBalanced(books.posted, asOf);

    // Investor report: capital closing, the roll-forward and the card payments.
    const r = (await loadInvestorReport(ids.nadim, range.from, range.to))!;
    expect(r.capital.closing).toBe(books.capital[ids.nadim]);
    expect(owedBySum(r.profit)).toBe(books.profitOwed[ids.nadim] ?? 0);
    expect(r.months).toEqual([{ month, rows: null, basisNote: false }]);
    expect(r.cards.map((c) => c.id)).toEqual([ids.card]);
    expect(r.cardPayments).toBe(200_000);

    // Supplier By model: every purchase naming them, less the cash-refunded one at its refund;
    // the write-off is not "sent back".
    const supplier = await loadStatementExtras("supplier", ids.supplier, range.from, range.to);
    expect(supplier?.kind === "supplier" && supplier.byModel).toEqual([
      { id: ids.v, pieces: 5, amount: 5_000_000, avgPieces: 5, avg: 1_000_000 },
      // D-056: the average stays at the price paid (3 bought; one sent back, one written off)
      { id: ids.w, pieces: 2, amount: add(mul(500_000, 3), -450_000), avgPieces: 3, avg: 500_000 },
    ]);
    // Customer By model = the Sales report's figures for them.
    const customer = await loadStatementExtras("customer", ids.customer, range.from, range.to);
    const { report: sales } = await loadSales(range.from, range.to);
    const row = sales.byCustomer.find((g) => g.id === ids.customer)!;
    expect(customer?.kind === "customer" && modelTotal(customer.byModel)).toEqual({
      pieces: row.pieces,
      amount: row.sales,
    });
    // Card: the period's split, read as on its last day (today).
    const card = await loadStatementExtras("card", ids.card, range.from, range.to);
    expect(card?.kind === "card" && card.split).toEqual({
      charges: 500_000,
      payments: 200_000,
      refunds: 0,
    });

    // The pack for this month = the Stock page, the Cash book, the balance chip, the Sales report.
    const { pack } = await loadPack(month);
    const lots = await stockLots();
    const stockPage = lots.reduce((n, l) => add(n, mul(l.unitCost, l.remaining)), 0);
    expect(stockTotal(pack.stock).value).toBe(books.stock);
    expect(stockTotal(pack.stock).value).toBe(stockPage);
    expect(stockTotal(pack.stock)).toMatchObject({ bought: 8, sold: 2, back: 1, writtenOff: 1 });
    expect(pack.cash.closing).toBe((await loadCashBook(today, today)).book.closing);
    expect(pack.cash.closing).toBe(books.cash);
    expect(pack.position.difference).toBe(0);
    expect(pack.sales.netProfit).toBe(sales.netProfit);
    expect(pack.dues.customers.reduce((n, d) => add(n, d.end), 0)).toBe(books.customerDues);
    expect(pack.dues.suppliers.reduce((n, d) => add(n, d.end), 0)).toBe(books.supplierDues);
    expect(pack.allocations.rows).toBeNull();
  });
});

const ROUTES = {
  "/pdf/investor": investorPdfGet,
  "/pdf/card": cardPdfGet,
  "/pdf/pack": packPdfGet,
  "/pdf/statement": statementPdfGet,
  "/reports/investor/xlsx": investorXlsx,
  "/reports/statement/xlsx": statementXlsx,
  "/reports/pack/xlsx": packXlsx,
};
const get = (href: string) => {
  const req = new NextRequest(new URL(href, "http://localhost"));
  return ROUTES[req.nextUrl.pathname as keyof typeof ROUTES](req);
};
const q = (path: string, params: Record<string, string>) =>
  `${path}?${new URLSearchParams(params).toString()}`;
const pdfText = async (res: Response) =>
  (await extractText(new Uint8Array(await res.arrayBuffer()), { mergePages: true })).text;
const workbook = async (res: Response) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());
  return wb;
};

describe("CR-025 report PDFs and Excel", () => {
  it("I-CR-025.2 partner-only, 400 on bad parameters, figures tie out, no audit row", async () => {
    await trade();
    const [{ n: before }] = await sql`select count(*)::int as n from audit_log`;
    const investor = { person: ids.nadim, ...range };
    const hrefs = [
      q("/pdf/investor", investor),
      q("/pdf/card", { id: ids.card, ...range }),
      q("/pdf/pack", { month }),
      q("/reports/investor/xlsx", investor),
      q("/reports/statement/xlsx", { kind: "supplier", id: ids.supplier, ...range }),
      q("/reports/pack/xlsx", { month }),
    ];

    getUser.mockResolvedValue(null);
    for (const h of hrefs) expect((await get(h)).status, h).toBe(403);
    getUser.mockResolvedValue({ id: userId });
    for (const h of [
      q("/pdf/investor", { person: "x", ...range }),
      q("/pdf/card", { id: ids.card, from: range.to, to: "2000-01-01" }),
      q("/pdf/pack", { month: "2000-01" }),
      q("/reports/investor/xlsx", { person: ids.nadim }),
      q("/reports/statement/xlsx", { kind: "person", id: ids.nadim, ...range }),
      q("/reports/pack/xlsx", { month: "13" }),
    ])
      expect((await get(h)).status, h).toBe(400);

    const { books } = await loadBooks();
    const inv = await get(hrefs[0]);
    expect(inv.status).toBe(200);
    expect(inv.headers.get("Content-Disposition")).toMatch(/investor-report-nadim-.*\.pdf"$/);
    const invText = await pdfText(inv);
    expect(invText).toContain("Investor report");
    expect(invText).toContain(format(books.capital[ids.nadim]));
    expect(invText).not.toContain("How to pay");

    const cardText = await pdfText(await get(hrefs[1]));
    expect(cardText).toContain("Card statement");
    expect(cardText).toContain("Refunds & cashback");

    const { pack } = await loadPack(month);
    const packText = await pdfText(await get(hrefs[2]));
    expect(packText).toContain("Monthly pack");
    expect(packText).toContain(format(stockTotal(pack.stock).value));
    expect(packText).toContain(format(pack.cash.closing));

    // The supplier's due statement PDF carries the By model table.
    const st = await pdfText(
      await get(q("/pdf/statement", { kind: "supplier", id: ids.supplier, ...range })),
    );
    expect(st).toContain("Purchases by model");
    expect(st).toContain("Model W");

    const invBook = await workbook(await get(hrefs[3]));
    expect(invBook.worksheets.map((s) => s.name)).toEqual([
      "Capital",
      "Cards",
      "Allocations",
      "Profit owed",
    ]);
    const supBook = await workbook(await get(hrefs[4]));
    expect(supBook.worksheets.map((s) => s.name)).toEqual(["Statement", "Purchases by model"]);
    const packBook = await workbook(await get(hrefs[5]));
    const cash = packBook.getWorksheet("Cash flow")!;
    expect(cash.getRow(cash.rowCount).getCell(2).value).toBe(Number(toDecimal(pack.cash.closing)));

    const [{ n: after }] = await sql`select count(*)::int as n from audit_log`;
    expect(after).toBe(before);
  });
});
