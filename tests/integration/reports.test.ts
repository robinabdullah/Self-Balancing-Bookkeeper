import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { extractText } from "unpdf";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CARD_FEES } from "@mbl/domain/charts/profit";
import { addMonths, dhakaToday, monthOf } from "@mbl/domain/dates";
import { monthProfit } from "@mbl/domain/engine/months";
import { costEntries, expenseReport } from "@mbl/domain/expense-report";
import {
  expensesPdfHref,
  expensesXlsxHref,
  salesPdfHref,
  salesXlsxHref,
  withQuery,
} from "@mbl/domain/href";
import { add, format, toDecimal } from "@mbl/domain/money";
import { EXPENSES } from "@mbl/domain/validation/fields";
import { receiptLabel } from "@mbl/domain/whatsapp";
import { AccountReportsService } from "../../apps/api/src/account-reports/account-reports.service";
import { BooksService } from "../../apps/api/src/books/books.service";
import { ReportsService } from "../../apps/api/src/reports/reports.service";
import { expectBalanced } from "../engine/invariant";
import { type TestUser, fileAs, partnerApi, signedInUser } from "./api";
import { localSql } from "./local-db";
import { service } from "./services";

// CR-023 (D-043; UIDD §4.17): the Cash book and Sales report loaders (the api's own services, N-6.1) on real saves tie out to the
// books, and the Sales PDF / Excel routes (partner-only, no audit row). N-3.2: money entries go through the api
// (the facade), as the same partner. Synthetic data only (D-014).

const sql = localSql();
let api: Awaited<ReturnType<typeof partnerApi>>;
const loadBooks = () => service(api.app, BooksService).loadBooks();
const reports = () => service(api.app, ReportsService);
const loadCashBook = (from: string, to: string) => reports().loadCashBook(from, to);
const loadSales = (from: string, to: string) => reports().loadSales(from, to);
const loadStatementExtras = (...args: Parameters<AccountReportsService["loadStatementExtras"]>) =>
  service(api.app, AccountReportsService).loadStatementExtras(...args);
const reverseEntry = (input: unknown) => api.reverseEntry(input);
const saveSale = (input: unknown) => api.saveSale(input);
const saveReturn = (input: unknown) => api.saveReturn(input);
let investor: TestUser;
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
  investor = await signedInUser(sql, "investor");
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.arif}, 'Arif', 'partner', 50), (${ids.sumon}, 'Sumon', 'partner', 50)`;
  await sql`insert into customers (id, proprietor_name, shop_name)
    values (${ids.customer}, 'Jamal', 'Test Telecom')`;
  await sql`insert into suppliers (id, name) values (${ids.supplier}, 'Test Supplier')`;
  await sql`insert into models (id, name) values (${ids.model}, 'Model V')`;
});

beforeEach(async () => {
  await sql.unsafe(`truncate ${TABLES}, audit_log`);
});

afterAll(async () => {
  await sql.unsafe(`truncate ${TABLES}, audit_log, models, suppliers cascade`);
  await sql`delete from people`;
  await sql`delete from customers where not is_system`;
  await api.close();
  await sql.end();
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

// N-5: the api's `/files/*`, as web's file routes forward it.
const get = (href: string, user: TestUser | null = api.user) => fileAs(api.app, user, href);

describe("CR-023 Sales report PDF and Excel", () => {
  it("I-CR-023.2 partner-only, 400 on a bad range, figures tie out, no audit row", async () => {
    await trade();
    const [{ n: before }] = await sql`select count(*)::int as n from audit_log`;
    const pdf = withQuery(salesPdfHref, range);
    const xlsx = withQuery(salesXlsxHref, range);

    expect((await get(pdf, null)).status).toBe(401);
    expect((await get(xlsx, null)).status).toBe(401);
    expect((await get(pdf, investor)).status).toBe(403);
    const refused = await get(xlsx, investor);
    expect([refused.status, await refused.text()]).toEqual([
      403,
      "Only partners can download reports",
    ]);
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

describe("CR-052 Expense statement", () => {
  const card = randomUUID();
  beforeAll(async () => {
    await sql`insert into cards (id, name, owner_person_id, statement_day, due_day)
      values (${card}, 'Test Visa', ${ids.arif}, 5, 20)`;
  });
  afterAll(async () => {
    await sql.unsafe(`truncate ${TABLES}`);
    await sql`delete from cards where id = ${card}`;
  });

  /** Rent in cash (then reversed), a salary for last month, a card-paid delivery, a Card fee and
   * a cash-out with a ৳200 fee. */
  async function costs() {
    ok(await money({ type: "capital_in", personId: ids.arif, amount: "50,000" }));
    const rentId = randomUUID();
    ok(
      await money({
        id: rentId,
        type: "expense",
        amount: "2,000",
        category: "rent",
        source: "cash",
        note: "Shop rent",
      }),
    );
    ok(
      await reverseEntry({
        id: randomUUID(),
        table: "money",
        reversesId: rentId,
        date: today,
        forMonth: monthOf(today),
      }),
    );
    ok(
      await money({
        type: "expense",
        amount: "3,000",
        category: "salary",
        source: "cash",
        forMonth: addMonths(monthOf(today), -1),
      }),
    );
    ok(
      await money({
        type: "expense",
        amount: "400",
        category: "delivery",
        source: "card",
        cardId: card,
      }),
    );
    ok(await money({ type: "card_fee", amount: "1,150", cardId: card }));
    ok(
      await money({
        type: "card_cash_out",
        cardId: card,
        cardCharged: "10,000",
        cashReceived: "9,800",
      }),
    );
  }

  it("I-CR-052.1 the statement equals the books; the PDF and Excel follow the filter", async () => {
    await costs();
    const { books, data } = await loadBooks();
    expectBalanced(books.posted, today);
    const view = await reports().loadExpenses(range.from, range.to);
    // The page's one read is the service's answer.
    expect(await api.read(withQuery("/views/reports/expenses", range))).toEqual(
      JSON.parse(JSON.stringify(view)),
    );
    expect(view.report).toEqual(
      expenseReport(costEntries(books.posted, data.entries), range.from, range.to),
    );
    const r = view.report;
    expect(r.rows).toHaveLength(6);
    expect(r.total).toBe(300_000 + 40_000 + 115_000 + 20_000); // the rent nets to 0
    expect([r.cash, r.cards]).toEqual([300_000, 175_000]);
    expect(r.tagged).toBe(true);
    expect(Object.values(view.notes)).toContain("Shop rent");
    // A month whose rows are all untagged ties out to the profit breakdown.
    const p = monthProfit(books.posted, monthOf(today), today);
    expect(0 - p.components.fee).toBe(r.byCategory.find((c) => c.key === CARD_FEES)?.amount);
    expect(0 - p.expenses.delivery).toBe(r.byCategory.find((c) => c.key === "delivery")?.amount);
    // D-080: Expenses only leaves the card fees out (the salary for last month stays: by date).
    const noFees = (await reports().loadExpenses(range.from, range.to, EXPENSES)).report;
    expect([noFees.total, noFees.rows.length]).toEqual([300_000 + 40_000, 4]); // rent + its reversal, salary, delivery

    const [{ n: before }] = await sql`select count(*)::int as n from audit_log`;
    const pdf = withQuery(expensesPdfHref, range);
    const xlsx = withQuery(expensesXlsxHref, range);
    expect((await get(pdf, null)).status).toBe(401);
    expect((await get(pdf, investor)).status).toBe(403);
    expect((await get(xlsx, investor)).status).toBe(403);
    const bad = { from: range.to, to: "2000-01-01" };
    expect((await get(withQuery(expensesPdfHref, bad))).status).toBe(400);
    expect((await get(withQuery(expensesXlsxHref, bad))).status).toBe(400);

    const res = await get(pdf);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(
      new RegExp(`expenses-${range.from}-to-${range.to}\\.pdf"$`),
    );
    const { text } = await extractText(new Uint8Array(await res.arrayBuffer()), {
      mergePages: true,
    });
    expect(text).toContain("Expense statement");
    expect(text).toContain("Test Visa");
    expect(text).toContain(format(r.total));
    expect(text).toContain("Salary");

    const rentOnly = await get(withQuery(expensesPdfHref, { ...range, cat: "delivery" }));
    const only = await extractText(new Uint8Array(await rentOnly.arrayBuffer()), {
      mergePages: true,
    });
    expect(only.text).toContain("Expense statement · Delivery");
    expect(only.text).not.toContain("Salary");

    const book = await get(withQuery(expensesXlsxHref, { ...range, cat: CARD_FEES }));
    expect(book.status).toBe(200);
    expect(book.headers.get("Content-Disposition")).toMatch(/expenses-card-fees-.*\.xlsx"$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await book.arrayBuffer());
    expect(wb.worksheets.map((s) => s.name)).toEqual(["By category", "Entries"]);
    const byCat = wb.getWorksheet("By category")!;
    expect(byCat.getRow(2).getCell(1).value).toBe("Card fees");
    expect(byCat.getRow(3).getCell(2).value).toBe(1_350);
    expect(wb.getWorksheet("Entries")!.rowCount).toBe(4); // header, the fee, the cash-out, Total

    const [{ n: after }] = await sql`select count(*)::int as n from audit_log`;
    expect(after).toBe(before);
  });
});
