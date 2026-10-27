import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { addDays, addMonths, clampDay, dhakaToday, monthOf } from "@mbl/domain/dates";
import { breakdown } from "@mbl/domain/dashboard";
import { computeBooks } from "@mbl/domain/engine/index";
import type { MonthProfit } from "@mbl/domain/engine/months";
import { add, mul, parse } from "@mbl/domain/money";
import { closeMonth } from "@/server/actions/months";
import { reverseEntry } from "@/server/actions/reverse";
import { loadBooksData } from "@/server/books";
import { entryKinds } from "@mbl/domain/charts/kinds";
import {
  loadChartPeriod,
  loadCustomerCharts,
  loadMoneyCharts,
  loadProfitCharts,
  loadStockCharts,
} from "@/server/charts";
import { loadSales } from "@/server/reports";
import { stockLots } from "@/server/stock";
import { expectBalanced } from "../engine/invariant";
import { partnerApi } from "./api";
import { localSql } from "./local-db";

// CR-041 … CR-044 (D-064; UIDD §4.17): the Profit tab's loader on real saves ties out to the Sales
// report and to a closed month's stored snapshot; the Money tab's today = the Books balance sheet;
// the Customers tab's total dues = the books and its Given sales (+ Walk-in's) = the Sales report;
// the Stock tab's stock age = the books' stock and the Stock page.
// The session and `revalidatePath` are stood in for as in action.test.ts. Synthetic data only
// (D-014).
// N-3.2: money entries go through the api (the facade), as the same partner.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
let api: Awaited<ReturnType<typeof partnerApi>>;
const savePurchase = (input: unknown) => api.savePurchase(input);
const saveSale = (input: unknown) => api.saveSale(input);
let userId = "";
const saveMoneyEntry = (input: unknown) => api.saveMoneyEntry(input);

const today = dhakaToday();
const M1 = addMonths(monthOf(today), -3); // closed
const M2 = addMonths(monthOf(today), -2); // open
const ids = {
  arif: randomUUID(),
  sumon: randomUUID(),
  customer: randomUUID(),
  supplier: randomUUID(),
  model: randomUUID(),
};
const TABLES =
  "purchases, purchase_lines, sales, sale_lines, returns, return_lines, money_entries, allocations, month_closes";

const ok = (r: { status: string }) => {
  if (r.status !== "ok") throw new Error(JSON.stringify(r));
};
const sale = (
  date: string,
  qty: string,
  unitPrice: string,
  customerId = ids.customer,
  receivedNow = "",
) =>
  saveSale({
    id: randomUUID(),
    paymentId: randomUUID(),
    date,
    customerId,
    note: "",
    receivedNow,
    lines: [{ modelId: ids.model, qty, unitPrice }],
  });
const expense = (date: string, category: string, amount: string) =>
  saveMoneyEntry({
    id: randomUUID(),
    type: "expense",
    date,
    forMonth: monthOf(date),
    category,
    source: "cash",
    amount,
    note: "",
  } as never);

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

describe("CR-041 Profit tab loader", () => {
  it("I-CR-041.1 a month's sales and margin = loadSales(month); a closed month's expenses = its snapshot", async () => {
    const opening = `${M1}-01`;
    await sql`insert into money_entries (type, date, amount, opening_kind, person_id, created_by)
      values ('opening', ${opening}, '1000000.00', 'cash', null, ${userId}),
             ('opening', ${opening}, '1000000.00', 'capital', ${ids.arif}, ${userId})`;
    const purchaseId = randomUUID();
    await sql`insert into purchases (id, date, source, supplier_id)
      values (${purchaseId}, ${opening}, 'supplier_credit', ${ids.supplier})`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
      values (${randomUUID()}, ${purchaseId}, ${ids.model}, 20, '10000')`;

    ok(await sale(`${M1}-05`, "2", "12,500"));
    ok(await sale(`${M1}-20`, "1", "11,000"));
    ok(await expense(`${M1}-10`, "salary", "3,000"));
    ok(await expense(`${M1}-11`, "rent", "1,500"));
    ok(await sale(`${M2}-03`, "3", "13,000"));
    ok(await expense(`${M2}-04`, "delivery", "700"));
    ok(await closeMonth({ id: randomUUID(), month: M1 }));

    const base = await loadChartPeriod({ from: opening, to: today });
    expect(base.period.view).toBe("month");
    const { charts, window } = await loadProfitCharts(base);
    expect(window.months.slice(0, 2)).toEqual([M1, M2]);

    // Sales & margin per month = the Sales report for that month.
    for (const m of [M1, M2]) {
      const { report } = await loadSales(`${m}-01`, clampDay(m, 31));
      const point = charts.sales.points.find((p) => p.key === m)!;
      expect([point.sales, point.cost, point.gross, point.margin]).toEqual([
        report.sales,
        report.cost,
        report.grossProfit,
        report.margin,
      ]);
    }
    const whole = (await loadSales(opening, today)).report;
    expect(charts.sales.total.amount).toBe(whole.sales);
    expect(charts.sales.margin).toBe(whole.margin);

    // A closed month's expenses and breakdown = its stored snapshot.
    const [{ snapshot }] = await sql`select snapshot from month_closes where month = ${opening}`;
    const stored = snapshot as MonthProfit;
    const spent = charts.expenses.points.find((p) => p.key === M1)!.amount;
    expect(spent).toBe(0 - add(stored.components.expense, stored.components.fee));
    expect(spent).toBe(parse("4,500"));
    expect(charts.breakdown[M1].reduce((n, l) => add(n, l.amount), 0)).toBe(stored.total);
    // Net profit for the closed month = Σ its allocations (the Months row).
    const [{ sum }] = await sql`select sum(amount)::text as sum from allocations
      where month = ${opening}`;
    expect(charts.profit.points.find((p) => p.key === M1)!.amount).toBe(parse(sum));
    expect(charts.expenses.categories.map((c) => c.label)).toEqual(["Salary", "Rent", "Delivery"]);

    const data = await loadBooksData();
    expectBalanced(computeBooks(data, today).posted, today, data.allocations, data.closed);
  });
});

describe("CR-042 Money tab loader", () => {
  it("I-CR-042.1 today's point = breakdown(books); a closed month's shares = its allocations; the invariant holds", async () => {
    const opening = `${M1}-01`;
    await sql`insert into money_entries (type, date, amount, opening_kind, person_id, created_by)
      values ('opening', ${opening}, '1000000.00', 'cash', null, ${userId}),
             ('opening', ${opening}, '1000000.00', 'capital', ${ids.arif}, ${userId})`;
    const purchaseId = randomUUID();
    await sql`insert into purchases (id, date, source, supplier_id)
      values (${purchaseId}, ${opening}, 'supplier_credit', ${ids.supplier})`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
      values (${randomUUID()}, ${purchaseId}, ${ids.model}, 20, '10000')`;

    ok(await sale(`${M1}-05`, "2", "12,500"));
    ok(await expense(`${M1}-10`, "salary", "3,000"));
    ok(
      await saveMoneyEntry({
        id: randomUUID(),
        type: "capital_in",
        date: `${M2}-02`,
        personId: ids.sumon,
        amount: "50,000",
        note: "",
      } as never),
    );
    ok(await sale(`${M2}-03`, "3", "13,000"));
    ok(await closeMonth({ id: randomUUID(), month: M1 }));

    const base = await loadChartPeriod({ from: opening, to: today });
    const { charts } = await loadMoneyCharts(base);
    const data = await loadBooksData();
    const books = computeBooks(data, today);
    const sheet = breakdown(books);

    // Today's point = the Books balance sheet, line by line.
    const now = charts.positions.at(-1)!;
    expect(now.end).toBe(today);
    expect([now.cash, now.stock, now.customerDues]).toEqual(sheet.haveLines.map((l) => l.amount));
    expect([0 - now.cardBalances, 0 - now.supplierDues]).toEqual(
      sheet.oweLines.map((l) => l.amount),
    );
    expect(now.businessAssets).toBe(sheet.businessAssets);
    expect(now.netWorth).toBe(sheet.netAssets);
    expect(charts.cash.days.at(-1)!.amount).toBe(books.cash);

    // The closed month's shares = its stored allocation rows; the next month is not allocated.
    const [{ sum }] = await sql`select sum(amount)::text as sum from allocations
      where month = ${opening}`;
    const m1 = charts.shares.months.find((m) => m.key === M1)!;
    expect(m1.closed).toBe(true);
    expect(m1.total).toBe(parse(sum));
    expect(charts.shares.months.find((m) => m.key === M2)!.closed).toBe(false);

    expectBalanced(books.posted, today, data.allocations, data.closed);
  });
});

describe("CR-043 Customers tab loader", () => {
  it("I-CR-043.1 total dues = books.customerDues; Given's sales + Walk-in's = the Sales report's sales", async () => {
    const opening = `${M1}-01`;
    await sql`insert into money_entries (type, date, amount, opening_kind, person_id, created_by)
      values ('opening', ${opening}, '1000000.00', 'cash', null, ${userId}),
             ('opening', ${opening}, '1000000.00', 'capital', ${ids.arif}, ${userId})`;
    const purchaseId = randomUUID();
    await sql`insert into purchases (id, date, source, supplier_id)
      values (${purchaseId}, ${opening}, 'supplier_credit', ${ids.supplier})`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
      values (${randomUUID()}, ${purchaseId}, ${ids.model}, 20, '10000')`;
    const [{ id: walkIn }] = await sql`select id from customers where is_system`;

    ok(await sale(`${M1}-05`, "2", "12,500"));
    ok(await sale(`${M1}-06`, "1", "13,000", walkIn, "13,000"));
    ok(
      await saveMoneyEntry({
        id: randomUUID(),
        type: "customer_payment",
        date: `${M2}-02`,
        customerId: ids.customer,
        amount: "10,000",
        note: "",
      } as never),
    );
    ok(await sale(`${M2}-03`, "3", "13,000"));

    const base = await loadChartPeriod({ from: opening, to: today });
    const { charts, names } = await loadCustomerCharts(base);
    const data = await loadBooksData();
    const books = computeBooks(data, today);

    expect(charts.dues.at(-1)!.amount).toBe(books.customerDues);
    expect(charts.flows.total.amount).toBe(books.customerDues);
    const kinds = entryKinds(data.entries);
    const walkInSales = books.posted
      .filter((p) => kinds.get(p.id) === "sale")
      .flatMap((p) => p.effects)
      .filter((e) => e.account === "customer_due" && e.id === walkIn)
      .reduce((n, e) => add(n, e.amount), 0);
    expect(walkInSales).toBe(parse("13,000"));
    const given = charts.flows.buckets.reduce((n, b) => add(n, b.given), 0);
    const { report } = await loadSales(opening, today);
    expect(add(given, walkInSales)).toBe(report.sales);
    expect(charts.flows.buckets.reduce((n, b) => add(n, b.collected), 0)).toBe(parse("10,000"));

    // Top customers = the Sales report's By customer, Walk-in included.
    expect(charts.top.map((g) => g.id)).toEqual(report.byCustomer.map((g) => g.id));
    expect(names[walkIn]).toBe("Walk-in");
    // Jamal owed nothing before his first sale, so no one kept a due all through the window.
    expect(charts.lowest).toEqual([]);

    expectBalanced(books.posted, today, data.allocations, data.closed);
  });
});

describe("CR-044 Stock tab loader", () => {
  const buy = (date: string, qty: string, unitCost: string) =>
    savePurchase({
      id: randomUUID(),
      date,
      source: "supplier_credit",
      supplierId: ids.supplier,
      note: "",
      lines: [{ id: randomUUID(), modelId: ids.model, qty, unitCost, imeiNote: "" }],
    });

  it("I-CR-044.1 Σ stock age value = books.stock = the Stock page; top models = the Sales report by model", async () => {
    // The opening: cash ৳10,00,000 and 2 units at ৳9,000, so the capital is ৳10,18,000.
    const opening = addDays(today, -120);
    await sql`insert into money_entries (type, date, amount, opening_kind, person_id, created_by)
      values ('opening', ${opening}, '1000000.00', 'cash', null, ${userId}),
             ('opening', ${opening}, '1018000.00', 'capital', ${ids.arif}, ${userId})`;
    const openingStock = randomUUID();
    await sql`insert into purchases (id, date, source) values (${openingStock}, ${opening}, 'opening')`;
    await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost)
      values (${randomUUID()}, ${openingStock}, ${ids.model}, 2, '9000')`;

    ok(await buy(addDays(today, -100), "5", "10,000"));
    ok(await buy(addDays(today, -45), "4", "11,000"));
    ok(await buy(addDays(today, -5), "3", "12,000"));
    ok(await sale(addDays(today, -2), "3", "13,000")); // the 2 opening units, then 1 of the oldest
    const [{ id: purchaseId }] = await sql`select purchase_id as id from purchase_lines
      where unit_cost = '12000'`;
    ok(
      await reverseEntry({
        id: randomUUID(),
        table: "purchase",
        reversesId: purchaseId,
        date: today,
      }),
    );

    const base = await loadChartPeriod({ from: opening, to: today });
    const { charts, names } = await loadStockCharts(base);
    const data = await loadBooksData();
    const books = computeBooks(data, today);
    const lots = await stockLots();
    const stockPage = lots.reduce((n, l) => add(n, mul(l.unitCost, l.remaining)), 0);

    expect(charts.total).toBe(books.stock);
    expect(charts.total).toBe(stockPage);
    expect(charts.ages.map((a) => a.units)).toEqual([0, 4, 0, 4]);
    expect(charts.ages[3].models.map((m) => names[m.modelId])).toEqual(["Model V"]);
    // The opening's units are all sold, so no opening note.
    expect(charts.opening).toBe(false);

    const { report } = await loadSales(opening, today);
    expect(charts.top.map((g) => [g.id, g.pieces])).toEqual(
      report.byModel.map((g) => [g.id, g.pieces]),
    );
    expect(charts.top[0].pieces).toBe(3);

    expectBalanced(books.posted, today, data.allocations, data.closed);
  });
});
