import "server-only";
import { type CustomerCharts, customerCharts } from "@mbl/domain/charts/customers";
import { entryKinds } from "@mbl/domain/charts/kinds";
import { type ChartPeriod, chartPeriod } from "@mbl/domain/charts/period";
import { type MoneyCharts, moneyCharts } from "@mbl/domain/charts/position";
import { type StockCharts, stockCharts } from "@mbl/domain/charts/stock";
import {
  type ProfitCharts,
  type MonthsWindow,
  profitCharts,
  salesIn,
  wholeMonths,
} from "@mbl/domain/charts/profit";
import { monthOf } from "@mbl/domain/dates";
import { nextToClose } from "@mbl/domain/engine/months";
import { OTHERS } from "@mbl/domain/monthly-pack";
import { monthList } from "@mbl/domain/months-view";
import { setupNames } from "@mbl/domain/setup";
import { loadBooks } from "@/server/books";
import { loadCloses, loadSnapshots } from "@/server/months";
import { loadSalesLines } from "@/server/reports";
import { loadSetup } from "@/server/setup";
import { stockLots } from "@/server/stock";

// D-064 (UIDD §4.17): what the Charts pages read. The window comes off the URL (`chartPeriod`),
// from the opening to today; each tab loads only what its charts need.

export type ChartsBase = { today: string; firstDate: string; period: ChartPeriod };

/** Today, the opening date and the window the URL asks for. */
export async function loadChartPeriod(
  params: Parameters<typeof chartPeriod>[0],
): Promise<ChartsBase> {
  const { data, asOf } = await loadBooks();
  const firstDate = data.entries[0]?.date ?? asOf;
  return { today: asOf, firstDate, period: chartPeriod(params, asOf, firstDate) };
}

export type ProfitView = ChartsBase & { window: MonthsWindow; charts: ProfitCharts };

/** The Profit tab: the Months list's rows, the closed months' snapshots and the sale lines from
 * the previous window's start; `category` filters the Expenses bars. */
export async function loadProfitCharts(base: ChartsBase, category?: string): Promise<ProfitView> {
  const { today, firstDate, period } = base;
  const window = wholeMonths(period, firstDate, today);
  const [{ data, books }, closes] = await Promise.all([loadBooks(), loadCloses()]);
  const closed = new Set(data.closed.map(monthOf));
  const months = [...(window.prev ?? []), ...window.months].filter((m) => closed.has(m));
  const [snapshots, lines] = await Promise.all([
    loadSnapshots(months),
    loadSalesLines(period.prev?.from ?? period.from, period.to),
  ]);
  const next = nextToClose(data.closed, data.entries[0]?.date ?? null, today);
  const charts = profitCharts({
    period,
    window,
    rows: monthList(books.months, closes, next, monthOf(today)),
    posted: books.posted,
    snapshots,
    lines,
    today,
    category,
  });
  return { ...base, window, charts };
}

export type MoneyView = ChartsBase & {
  window: MonthsWindow;
  charts: MoneyCharts;
  /** Everyone in Setup order (Profit shares' colours). */
  people: { id: string; name: string }[];
  /** id → display name (people, cards). */
  names: Record<string, string>;
  /** card id → its bank name (the Bills due next badge). */
  cardNames: Record<string, string>;
};

/** The Money tab: positions at each bucket end, daily cash, the closed months' allocations and
 * today's bills due next. */
export async function loadMoneyCharts(base: ChartsBase): Promise<MoneyView> {
  const { today, firstDate, period } = base;
  const window = wholeMonths(period, firstDate, today);
  const [{ data, books }, setup] = await Promise.all([loadBooks(), loadSetup()]);
  const charts = moneyCharts({
    period,
    window,
    posted: books.posted,
    allocations: data.allocations,
    closed: data.closed,
    cards: books.cards,
    today,
  });
  return {
    ...base,
    window,
    charts,
    people: setup.people.map((p) => ({ id: p.id, name: p.name })),
    names: setupNames(setup),
    cardNames: Object.fromEntries(setup.cards.map((c) => [c.id, c.name])),
  };
}

export type CustomerView = ChartsBase & {
  charts: CustomerCharts;
  /** id → display name (customers; Walk-in; "Other customers"). */
  names: Record<string, string>;
};

/** The Customers tab: total dues at each bucket end, Given vs collected, the lowest dues in the
 * window and the top customers (the window's Sales report, Walk-in included) by `by`. */
export async function loadCustomerCharts(
  base: ChartsBase,
  by: "sales" | "profit" = "sales",
): Promise<CustomerView> {
  const { today, period } = base;
  const [{ data, books }, setup, lines] = await Promise.all([
    loadBooks(),
    loadSetup(),
    loadSalesLines(period.from, period.to),
  ]);
  const charts = customerCharts({
    period,
    posted: books.posted,
    kinds: entryKinds(data.entries),
    customers: books.customers,
    walkIn: setup.customers.find((c) => c.isSystem)?.id ?? null,
    byCustomer: salesIn(lines, period.from, period.to).byCustomer,
    by,
    today,
  });
  return { ...base, charts, names: { ...setupNames(setup), [OTHERS]: "Other customers" } };
}

export type StockView = ChartsBase & {
  charts: StockCharts;
  /** id → display name (models; "Other models"). */
  names: Record<string, string>;
};

/** The Stock tab: today's lots by age (the window doesn't change them) and the window's top
 * models sold (the Sales report by model) by `by`. */
export async function loadStockCharts(
  base: ChartsBase,
  by: "pieces" | "profit" = "pieces",
): Promise<StockView> {
  const { today, period } = base;
  const [lots, setup, lines] = await Promise.all([
    stockLots(),
    loadSetup(),
    loadSalesLines(period.from, period.to),
  ]);
  const names = setupNames(setup);
  const charts = stockCharts({
    lots,
    names,
    today,
    byModel: salesIn(lines, period.from, period.to).byModel,
    by,
  });
  return { ...base, charts, names: { ...names, [OTHERS]: "Other models" } };
}
