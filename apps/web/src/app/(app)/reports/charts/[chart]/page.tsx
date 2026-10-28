import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import {
  CUSTOMER_CHARTS,
  CUSTOMER_TITLE,
  type CustomerChart,
} from "@/components/charts/customer-cards";
import { CustomerDetail } from "@/components/charts/customer-detail";
import { MONEY_CHARTS, MONEY_TITLE, type MoneyChart } from "@/components/charts/money-cards";
import { MoneyDetail } from "@/components/charts/money-detail";
import { PeriodChips } from "@/components/charts/period-chips";
import { PROFIT_CHARTS, type ProfitChart, profitTitle } from "@/components/charts/profit-cards";
import { ProfitDetail } from "@/components/charts/profit-detail";
import { STOCK_CHARTS, STOCK_TITLE, type StockChart } from "@/components/charts/stock-cards";
import { StockDetail } from "@/components/charts/stock-detail";
import { ReportSheet } from "@/components/report/report-sheet";
import { periodQuery } from "@mbl/domain/charts/period";
import { CARD_FEES } from "@mbl/domain/charts/profit";
import { AGES } from "@mbl/domain/charts/stock";
import { monthOf } from "@mbl/domain/dates";
import { withQuery } from "@mbl/domain/href";
import { EXPENSE_CATEGORIES } from "@mbl/domain/validation/fields";
import type {
  CustomerChartsView,
  MoneyChartsView,
  ProfitChartsView,
  StockChartsView,
} from "@mbl/api/views/charts.controller";
import { api } from "@/api/client";

// D-064 (UIDD §4.17): a chart's detail page (`/reports/charts/<chart>`): ‹ Charts (the same tab
// and window), the period row, a bigger chart, then its exact values. On screen only. Expenses
// takes `?cat=` (a category, or Card fees) to filter its bars; Top customers and Top models
// `?by=profit`; Stock age `?age=` (an age's first day) to list that age's models.
// N-4.8: one `/views/charts/<tab>` read (the chart's tab; Profit's and Money's take no `by`).

const TITLE = { sales: "Sales & margin", expenses: "Expenses" } as const;
const CATEGORIES: string[] = [...EXPENSE_CATEGORIES, CARD_FEES];

type Chart = ProfitChart | MoneyChart | CustomerChart | StockChart;

const isMoney = (chart: Chart): chart is MoneyChart =>
  (MONEY_CHARTS as readonly string[]).includes(chart);
const isCustomer = (chart: Chart): chart is CustomerChart =>
  (CUSTOMER_CHARTS as readonly string[]).includes(chart);
const isStock = (chart: Chart): chart is StockChart =>
  (STOCK_CHARTS as readonly string[]).includes(chart);
/** The Charts tab a chart sits on (Profit drops the param). */
const tabOf = (chart: Chart) =>
  isMoney(chart) ? "money" : isCustomer(chart) ? "customers" : isStock(chart) ? "stock" : null;

export default async function ChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ chart: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ chart: asked }, sp] = await Promise.all([params, searchParams]);
  const chart = [...PROFIT_CHARTS, ...MONEY_CHARTS, ...CUSTOMER_CHARTS, ...STOCK_CHARTS].find(
    (c) => c === asked,
  );
  if (!chart) notFound();

  const category =
    chart === "expenses" && sp.cat && CATEGORIES.includes(sp.cat) ? sp.cat : undefined;
  const ranked = chart === "top-customers" || chart === "top-models";
  const byProfit = ranked && sp.by === "profit";
  const age = chart === "stock-age" ? AGES.find((a) => a.key === sp.age)?.key : undefined;
  const query = { period: sp.period, from: sp.from, to: sp.to };

  // The tab's one read; its base (today, the opening date, the window) comes with it.
  const by = byProfit ? "profit" : null;
  const stockView = isStock(chart)
    ? await api<StockChartsView>(withQuery("/views/charts/stock", { ...query, by }))
    : null;
  const customerView = isCustomer(chart)
    ? await api<CustomerChartsView>(withQuery("/views/charts/customers", { ...query, by }))
    : null;
  const moneyView = isMoney(chart)
    ? await api<MoneyChartsView>(withQuery("/views/charts/money", query))
    : null;
  const profitView =
    stockView || customerView || moneyView
      ? null
      : await api<ProfitChartsView>(withQuery("/views/charts/profit", { ...query, cat: category }));
  const { today, firstDate, period } = (stockView ?? customerView ?? moneyView ?? profitView)!;

  const range = periodQuery(period);
  const path = withQuery(`/reports/charts/${chart}`, {
    cat: category,
    by: byProfit ? "profit" : null,
    age,
  });
  const current = withQuery(path, range);
  const title = isMoney(chart)
    ? MONEY_TITLE[chart]
    : isCustomer(chart)
      ? CUSTOMER_TITLE[chart]
      : isStock(chart)
        ? STOCK_TITLE[chart]
        : chart === "net-profit"
          ? profitTitle(period)
          : TITLE[chart];

  let body;
  if (isStock(chart)) {
    const view = stockView!;
    body = (
      <StockDetail
        chart={chart}
        charts={view.charts}
        period={period}
        names={view.names}
        firstDate={firstDate}
        age={age}
        by={byProfit ? "profit" : "pieces"}
      />
    );
  } else if (isCustomer(chart)) {
    const view = customerView!;
    body = (
      <CustomerDetail
        chart={chart}
        charts={view.charts}
        period={period}
        names={view.names}
        by={byProfit ? "profit" : "sales"}
      />
    );
  } else if (isMoney(chart)) {
    const money = moneyView!;
    body = (
      <MoneyDetail
        chart={chart}
        charts={money.charts}
        period={period}
        window={money.window}
        people={money.people}
        names={money.names}
        cardNames={money.cardNames}
      />
    );
  } else {
    const { charts, window } = profitView!;
    body = (
      <ProfitDetail
        chart={chart}
        charts={charts}
        period={period}
        window={window}
        query={range}
        category={category}
      />
    );
  }

  return (
    <>
      <Link
        href={withQuery("/reports/charts", { tab: tabOf(chart), ...range })}
        className="text-primary -ml-1 flex min-h-11 w-fit items-center gap-1 text-sm"
      >
        <ChevronLeftIcon aria-hidden className="size-4" /> Charts
      </Link>
      <h1 className="text-xl font-semibold">{title}</h1>
      <PeriodChips path={path} current={current} period={period} />
      <div className="mt-4">{body}</div>

      {sp.report && (
        <ReportSheet
          base={current}
          target={path}
          first={monthOf(firstDate)}
          today={today}
          title={title}
          send={null}
        />
      )}
    </>
  );
}
