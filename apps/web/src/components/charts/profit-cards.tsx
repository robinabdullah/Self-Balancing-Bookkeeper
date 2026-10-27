import type { ReactNode } from "react";
import type { ChartPeriod } from "@/lib/charts/period";
import type { MonthsWindow, Point, ProfitCharts, Total } from "@/lib/charts/profit";
import { format, sub } from "@/lib/money";
import { ChartCard, type Delta } from "./chart-card";
import { Bars, type Series } from "./charts";

// D-064 (UIDD §4.17): the Profit tab's three cards: Net profit (Sales profit in the day view),
// Sales & margin and Expenses. Each is one link to its detail page; flows compare with the window
// before ("vs prev 6M"). The detail pages share the series and the labels below.

export const PROFIT_CHARTS = ["net-profit", "sales", "expenses"] as const;
export type ProfitChart = (typeof PROFIT_CHARTS)[number];

export const SERIES = {
  profit: { key: "profit", label: "Net profit", color: "var(--chart-1)" },
  salesProfit: { key: "profit", label: "Sales profit", color: "var(--chart-1)" },
  sales: { key: "sales", label: "Sales", color: "var(--chart-2)" },
  margin: { key: "margin", label: "Margin %", color: "var(--chart-3)" },
  spent: { key: "spent", label: "Expenses", color: "var(--chart-5)" },
} satisfies Record<string, Series>;

export const profitTitle = (period: ChartPeriod) =>
  period.view === "day" ? "Sales profit" : "Net profit";

/** "vs prev 6M" over whole months, "vs prev 24 days" over days. */
export const prevNote = (count: number, view: "day" | "month") =>
  view === "day" ? `vs prev ${count} ${count === 1 ? "day" : "days"}` : `vs prev ${count}M`;

export function deltaOf(total: Total, note: string): Delta {
  return total.prev == null ? null : { amount: sub(total.amount, total.prev), note };
}

export const isEmpty = (amounts: number[]) => amounts.every((a) => a === 0);

/** A point list as chart rows under `key`. */
export const rowsOf = (points: Point[], key: string) =>
  points.map((p) => ({ label: p.label, [key]: p.amount }));

/** The headline after the total: "৳4,50,000 · 12.5%". */
export const withMargin = (amount: number, margin: number | null) =>
  margin == null ? format(amount) : `${format(amount)} · ${margin}%`;

export function ProfitCards({
  charts,
  period,
  window,
  href,
}: {
  charts: ProfitCharts;
  period: ChartPeriod;
  window: MonthsWindow;
  /** A detail page's link, with the window. */
  href: (chart: ProfitChart) => string;
}) {
  const { profit, sales, expenses } = charts;
  const flow = prevNote(period.buckets.length, period.view);
  const monthly = prevNote(window.months.length, "month");
  // The largest category, Card fees included (it is listed last, not left out).
  const top = expenses.categories.reduce<(typeof expenses.categories)[number] | undefined>(
    (max, c) => (!max || c.amount > max.amount ? c : max),
    undefined,
  );
  const mini = (empty: boolean, chart: ReactNode) =>
    empty ? <span className="text-muted-foreground text-sm">Nothing in this period</span> : chart;
  const profitSeries = period.view === "day" ? SERIES.salesProfit : SERIES.profit;

  return (
    <section aria-label="Profit charts" className="mt-4 grid gap-3 lg:grid-cols-3">
      <ChartCard
        href={href("net-profit")}
        title={profitTitle(period)}
        headline={format(profit.total.amount)}
        delta={deltaOf(profit.total, period.view === "day" ? flow : monthly)}
      >
        {mini(
          isEmpty(profit.points.map((p) => p.amount)),
          <Bars mini rows={rowsOf(profit.points, "profit")} series={[profitSeries]} />,
        )}
      </ChartCard>
      <ChartCard
        href={href("sales")}
        title="Sales & margin"
        headline={withMargin(sales.total.amount, sales.margin)}
        delta={deltaOf(sales.total, flow)}
      >
        {mini(
          isEmpty(sales.points.map((p) => p.sales)),
          <Bars
            mini
            rows={sales.points.map((p) => ({ label: p.label, sales: p.sales }))}
            series={[SERIES.sales]}
          />,
        )}
      </ChartCard>
      <ChartCard
        href={href("expenses")}
        title="Expenses"
        headline={
          top && top.share != null && expenses.total.amount !== 0
            ? `${format(expenses.total.amount)} · ${top.label} ${top.share}%`
            : format(expenses.total.amount)
        }
        delta={deltaOf(expenses.total, monthly)}
      >
        {mini(
          isEmpty(expenses.points.map((p) => p.amount)),
          <Bars mini rows={rowsOf(expenses.points, "spent")} series={[SERIES.spent]} />,
        )}
      </ChartCard>
    </section>
  );
}
