import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { extractText } from "unpdf";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { GET as xlsxGet } from "@/app/(app)/reports/sales/xlsx/route";
import { GET as pdfGet } from "@/app/pdf/sales/route";
import { dhakaToday, monthOf } from "@mbl/domain/dates";
import { monthProfit } from "@mbl/domain/engine/months";
import { salesPdfHref, salesXlsxHref, withQuery } from "@mbl/domain/href";
import { add, format, toDecimal } from "@mbl/domain/money";
import { receiptLabel } from "@mbl/domain/whatsapp";
import { reverseEntry } from "@/server/actions/reverse";
import { loadBooks } from "@/server/books";
import { loadStatementExtras } from "@/server/account-reports";
import { loadCashBook, loadSales } from "@/server/reports";
import { expectBalanced } from "../engine/invariant";
import { partnerApi } from "./api";
import { localSql } from "./local-db";

// CR-023 (D-043; UIDD §4.17): the Cash book and Sales report loaders on real saves tie out to the
// books, and the Sales PDF / Excel routes (partner-only, no audit row). The session and
// `revalidatePath` are stood in for as in action.test.ts. N-3.2: money entries go through the api
// (the facade), as the same partner. Synthetic data only (D-014).
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
let api: Awaited<ReturnType<typeof partnerApi>>;
const saveSale = (input: unknown) => api.saveSale(input);
const saveReturn = (input: unknown) => api.saveReturn(input);
let userId = "";
const saveMoneyEntry = (input: unknown) => api.saveMoneyEntry(input);

const today = dhakaToday();
const range = { from: `${monthOf(today)}-01`, to: today };
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
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50)`;
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.customer}, 'Jamal', 'Test Telecom')`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, 'Test Supplier')`;
  await sql`insert into models (id, name) values (${ids.model}, 'Model V')`;
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: userId });
  await sql.unsafe(`truncate ${TABLES}, audit_log`);
});

afterAll(async () => {
  await sql.unsafe(`truncate ${TABLES}, audit_log, models, suppliers cascade`);
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
  await api.close();
  await sql.end();
  await db.$client.end();
});

const ok = (r: { status: string }) => expect(r.status).toBe("ok");
const money = (values: Record<string, unknown>) =>
  saveMoneyEntry({ id: randomUUID(), date: today, note: "", ...values } as never);

/** Capital, stock on supplier credit, a sale with Received now, an expense, a payment that is
 * reversed and a customer return: every kind of cash move and both sides of the sales report. */
async function trade() {
  ok(await money({ type: "capital_in", personId: ids.arif, amount: "50,000" }));
  const purchaseId = randomUUID();
  await sql`insert into purchases (id, date, source, supplier_id)
    values (${purchaseId}, ${today}, 'supplier_credit', ${ids.supplier})`;
  await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
    values (${randomUUID()}, ${purchaseId}, ${ids.model}, 5, '10000')`;
  const saleId = randomUUID();
  const paymentId = randomUUID();
  ok(
    await saveSale({
      id: saleId,
      paymentId,
      date: today,
      customerId: ids.customer,
      note: "",
      receivedNow: "4,000",
      lines: [{ modelId: ids.model, qty: "2", unitPrice: "13,000" }],
    }),
  );
  const expenseId = randomUUID();
  ok(
    await money({
      id: expenseId,
      type: "expense",
      amount: "500",
      category: "rent",
      source: "cash",
    }),
  );
  const payId = randomUUID();
  ok(
    await money({ id: payId, type: "customer_payment", customerId: ids.customer, amount: "1,000" }),
  );
  const reversalId = randomUUID();
  ok(await reverseEntry({ id: reversalId, table: "money", reversesId: payId, date: today }));
  const [line] = await sql`select id from sale_lines where sale_id = ${saleId}`;
  ok(
    await saveReturn({
      id: randomUUID(),
      kind: "customer",
      date: today,
      customerId: ids.customer,
      note: "",
      lines: [{ saleLineId: line.id, qty: "1", unitAmount: "12,000" }],
    }),
  );
  const [{ receipt_no: mr }] = await sql`select receipt_no from money_entries where id = ${payId}`;
  return { saleId, paymentId, expenseId, payId, reversalId, mr: Number(mr) };
}

describe("CR-023 report loaders", () => {
  it("I-CR-023.1 the Cash book and the Sales report tie out to the books", async () => {
    const t = await trade();
    const { books, asOf } = await loadBooks();
    expectBalanced(books.posted, asOf);

    const { book, labels } = await loadCashBook(today, today);
    expect(book.closing).toBe(books.cash);
    const rows = book.days.flatMap((d) => d.rows);
    expect(
      add(
        book.opening,
        rows.reduce((s, r) => add(s, r.amount), 0),
      ),
    ).toBe(book.closing);
    // The sale moves no cash; its Received now payment does. Order saved.
    expect(rows.map((r) => r.id)).toEqual([
      expect.any(String),
      t.paymentId,
      t.expenseId,
      t.payId,
      t.reversalId,
    ]);
    expect(rows.map((r) => r.id)).not.toContain(t.saleId);
    expect(rows.find((r) => r.id === t.reversalId)!.amount).toBe(-100_000);
    expect(labels[t.payId]).toEqual({
      title: `Payment in ${receiptLabel(t.mr)}`,
      who: "Test Telecom (Jamal)",
    });
    expect(labels[t.reversalId].title).toBe(`Reversal of Payment in ${receiptLabel(t.mr)}`);

    const { report, names } = await loadSales(range.from, range.to);
    const { components } = monthProfit(books.posted, monthOf(today), asOf);
    expect(report.netProfit).toBe(add(components.sale, components.customer_return));
    expect(report).toMatchObject({
      bills: 1,
      pieces: 2,
      sales: 2_600_000,
      cost: 2_000_000,
      returns: { pieces: 1, amount: 1_200_000, profit: -200_000 },
    });
    expect(report.byModel).toEqual([
      { id: ids.model, pieces: 1, sales: 1_400_000, profit: 400_000, avgPieces: 2, avg: 1_300_000 },
    ]);
    expect(names[ids.model]).toBe("Model V");
    expect(names[ids.customer]).toBe("Test Telecom (Jamal)");
  });
});

describe("CR-033 Avg unit price (D-056)", () => {
  it("I-CR-033.2 the loaders average what still stands; the Excel By model has the column", async () => {
    await trade(); // 2 sold at ৳13,000, 1 returned at ৳12,000
    // A sale at ৳20,000 reversed in the period, and a purchase reversed in the period.
    const saleId = randomUUID();
    ok(
      await saveSale({
        id: saleId,
        paymentId: randomUUID(),
        date: today,
        customerId: ids.customer,
        note: "",
        receivedNow: "",
        lines: [{ modelId: ids.model, qty: "1", unitPrice: "20,000" }],
      }),
    );
    ok(await reverseEntry({ id: randomUUID(), table: "sale", reversesId: saleId, date: today }));
    const [p2, p2r] = [randomUUID(), randomUUID()];
    await sql`insert into purchases (id, date, source, supplier_id) values
      (${p2}, ${today}, 'supplier_credit', ${ids.supplier})`;
    await sql`insert into purchases (id, date, source, supplier_id, reverses_id) values
      (${p2r}, ${today}, 'supplier_credit', ${ids.supplier}, ${p2})`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost) values
      (${randomUUID()}, ${p2}, ${ids.model}, 1, '50000'),
      (${randomUUID()}, ${p2r}, ${ids.model}, 1, '50000')`;
    const { books, asOf } = await loadBooks();
    expectBalanced(books.posted, asOf);

    const { report } = await loadSales(range.from, range.to);
    expect(report.byModel).toEqual([
      { id: ids.model, pieces: 1, sales: 1_400_000, profit: 400_000, avgPieces: 2, avg: 1_300_000 },
    ]);
    const supplier = await loadStatementExtras("supplier", ids.supplier, range.from, range.to);
    expect(supplier?.kind === "supplier" && supplier.byModel).toEqual([
      { id: ids.model, pieces: 5, amount: 5_000_000, avgPieces: 5, avg: 1_000_000 },
    ]);

    const book = await get(withQuery(salesXlsxHref, range));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await book.arrayBuffer());
    const byModel = wb.getWorksheet("By model")!;
    expect(byModel.getRow(1).values).toEqual([
      undefined,
      "Model",
      "Pieces",
      "Avg unit price",
      "Sales",
      "Profit",
    ]);
    expect(byModel.getRow(2).getCell(3).value).toBe(13_000);
    expect(byModel.getRow(3).getCell(3).value).toBeNull();
  });
});

const ROUTES = { "/pdf/sales": pdfGet, "/reports/sales/xlsx": xlsxGet };
const get = (href: string) => {
  const req = new NextRequest(new URL(href, "http://localhost"));
  return ROUTES[req.nextUrl.pathname as keyof typeof ROUTES](req);
};

describe("CR-023 Sales report PDF and Excel", () => {
  it("I-CR-023.2 partner-only, 400 on a bad range, figures tie out, no audit row", async () => {
    await trade();
    const [{ n: before }] = await sql`select count(*)::int as n from audit_log`;
    const pdf = withQuery(salesPdfHref, range);
    const xlsx = withQuery(salesXlsxHref, range);

    getUser.mockResolvedValue(null);
    expect((await get(pdf)).status).toBe(403);
    expect((await get(xlsx)).status).toBe(403);
    getUser.mockResolvedValue({ id: userId });
    const bad = { from: range.to, to: "2000-01-01" };
    expect((await get(withQuery(salesPdfHref, bad))).status).toBe(400);
    expect((await get(withQuery(salesXlsxHref, bad))).status).toBe(400);

    const { report } = await loadSales(range.from, range.to);
    const res = await get(pdf);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(
      new RegExp(`sales-${range.from}-to-${range.to}\\.pdf"$`),
    );
    const { text } = await extractText(new Uint8Array(await res.arrayBuffer()), {
      mergePages: true,
    });
    expect(text).toContain("Sales report");
    expect(text).toContain("Model V");
    expect(text).toContain("Test Telecom (Jamal)");
    expect(text).toContain(format(report.netProfit));
    expect(text).not.toContain("How to pay");

    const book = await get(xlsx);
    expect(book.status).toBe(200);
    expect(book.headers.get("Content-Disposition")).toMatch(/sales-.*\.xlsx"$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await book.arrayBuffer());
    expect(wb.worksheets.map((s) => s.name)).toEqual(["Totals", "By model", "By customer"]);
    const totals = wb.getWorksheet("Totals")!;
    const header = totals.getRow(1).values as unknown[];
    const net = header.indexOf("Net sales profit");
    expect(totals.getRow(2).getCell(net).value).toBe(Number(toDecimal(report.netProfit)));
    const byModel = wb.getWorksheet("By model")!;
    expect(byModel.getRow(2).getCell(1).value).toBe("Model V");

    const [{ n: after }] = await sql`select count(*)::int as n from audit_log`;
    expect(after).toBe(before);
  });
});
