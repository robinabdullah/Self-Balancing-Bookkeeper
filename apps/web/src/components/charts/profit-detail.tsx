import type { ReactNode } from "react";
import Link from "next/link";
import { Amount } from "@/components/amount";
import type { ChartPeriod } from "@mbl/domain/charts/period";
import { categoryLabel, type MonthsWindow, type ProfitCharts } from "@mbl/domain/charts/profit";
import { formatRange } from "@mbl/domain/dates";
import { withQuery } from "@mbl/domain/href";
import { format } from "@mbl/domain/money";
import { ChartTable } from "./chart-table";
import { Bars, LineSeries } from "./charts";
import { type ProfitChart, SERIES, isEmpty, profitTitle, rowsOf } from "./profit-cards";

// D-064 (UIDD §4.17; clarified 2026-10-24): the Profit tab's detail pages: the chart with its
// one-line label and phone readout, then the exact values (a list on a phone, a table on desktop:
// beside a narrow chart, below a wide one). Net profit and Expenses count whole months; the day
// view's profit is sales profit.

const EXPENSES_BY_MONTH = "Expenses are counted by month";
const WHOLE_MONTHS = "Net profit and expenses count whole months";

export const nothing = (
  <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
    Nothing in this period
  </p>
);

export function Notes({ notes }: { notes: (string | false)[] }) {
  const shown = notes.filter((n): n is string => Boolean(n));
  return shown.map((n) => (
    <p key={n} className="text-muted-foreground mb-3 text-sm">
      {n}
    </p>
  ));
}

/** The chart, with a narrow table beside it on desktop. */
export const Beside = ({ chart, table }: { chart: ReactNode; table: ReactNode }) => (
  <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
    <div className="min-w-0">{chart}</div>
    <div className="min-w-0">{table}</div>
  </div>
);

const span = (period: ChartPeriod) => formatRange(period.from, period.to);
const money = (n: number) => <Amount poisha={n} />;

export function ProfitDetail({
  chart,
  charts,
  period,
  window,
  query,
  category,
}: {
  chart: ProfitChart;
  charts: ProfitCharts;
  period: ChartPeriod;
  window: MonthsWindow;
  /** The window's URL params, for the category links. */
  query: Record<string, string | null>;
  category?: string;
}) {
  const byDay = period.view === "day";

  if (chart === "net-profit") {
    const { points } = charts.profit;
    if (isEmpty(points.map((p) => p.amount))) return nothing;
    const rows = byDay ? points.filter((p) => p.amount !== 0) : points;
    return (
      <>
        <Notes notes={[byDay && EXPENSES_BY_MONTH, !byDay && window.partial && WHOLE_MONTHS]} />
        <Beside
          chart={
            <Bars
              rows={rowsOf(points, "profit")}
              series={[byDay ? SERIES.salesProfit : SERIES.profit]}
              label={`${profitTitle(period)} per ${byDay ? "day" : "month"}, ${span(period)}`}
              readout={points.map((p) => `${p.label}: ${format(p.amount)}`)}
              details={byDay ? undefined : points.map((p) => charts.breakdown[p.key] ?? [])}
            />
          }
          table={
            <ChartTable
              caption={profitTitle(period)}
              columns={[
                { key: "label", label: byDay ? "Date" : "Month" },
                { key: "amount", label: profitTitle(period), numeric: true },
              ]}
              rows={rows.map((p) => ({
                key: p.key,
                href: byDay ? undefined : `/months/${p.key}`,
                cells: { label: p.label, amount: money(p.amount) },
              }))}
            />
          }
        />
      </>
    );
  }

  if (chart === "sales") {
    const { points } = charts.sales;
    if (isEmpty(points.map((p) => p.sales))) return nothing;
    const per = byDay ? "day" : "month";
    return (
      <div className="flex flex-col gap-4">
        <Bars
          rows={points.map((p) => ({ label: p.label, sales: p.sales }))}
          series={[SERIES.sales]}
          label={`Sales per ${per}, ${span(period)}`}
          readout={points.map(
            (p) =>
              `${p.label}: Sales ${format(p.sales)}${p.margin == null ? "" : ` · Margin ${p.margin}%`}`,
          )}
        />
        <LineSeries
          rows={points.map((p) => ({ label: p.label, margin: p.margin }))}
          series={[SERIES.margin]}
          axis="percent"
          dots
          height={140}
          label={`Margin % per ${per}, ${span(period)}`}
        />
        <ChartTable
          caption="Sales & margin"
          columns={[
            { key: "label", label: byDay ? "Date" : "Month" },
            { key: "sales", label: "Sales", numeric: true },
            { key: "cost", label: "Cost", numeric: true },
            { key: "gross", label: "Gross profit", numeric: true },
            { key: "margin", label: "Margin", numeric: true },
          ]}
          rows={points
            .filter((p) => !byDay || p.sales !== 0 || p.cost !== 0)
            .map((p) => ({
              key: p.key,
              cells: {
                label: p.label,
                sales: money(p.sales),
                cost: money(p.cost),
                gross: money(p.gross),
                margin: p.margin == null ? "—" : `${p.margin}%`,
              },
            }))}
        />
      </div>
    );
  }

  const { points, categories } = charts.expenses;
  const filterHref = (key: string | null) =>
    withQuery("/reports/charts/expenses", { ...query, cat: key });
  const label = category ? categoryLabel(category) : "Expenses";
  return (
    <>
      <Notes notes={[byDay && EXPENSES_BY_MONTH, !byDay && window.partial && WHOLE_MONTHS]} />
      {category && (
        <p className="mb-3 flex flex-wrap items-center gap-x-3 text-sm">
          <span>{label} only</span>
          <Link
            href={filterHref(null)}
            scroll={false}
            className="text-primary flex min-h-11 items-center"
          >
            All categories
          </Link>
        </p>
      )}
      {isEmpty(points.map((p) => p.amount)) ? (
        nothing
      ) : (
        <Beside
          chart={
            <Bars
              rows={rowsOf(points, "spent")}
              series={[{ ...SERIES.spent, label }]}
              label={`${label} per month, ${span(period)}`}
              readout={points.map((p) => `${p.label}: ${format(p.amount)}`)}
            />
          }
          table={
            <ChartTable
              caption={`${label} per month`}
              columns={[
                { key: "label", label: "Month" },
                { key: "amount", label, numeric: true },
              ]}
              rows={points.map((p) => ({
                key: p.key,
                cells: { label: p.label, amount: money(p.amount) },
              }))}
            />
          }
        />
      )}
      {categories.length > 0 && (
        <section aria-labelledby="categories" className="mt-6">
          <h2 id="categories" className="mb-2 font-semibold">
            Categories
          </h2>
          <ChartTable
            caption="Categories"
            columns={[
              { key: "label", label: "Category" },
              { key: "amount", label: "Amount", numeric: true },
              { key: "share", label: "Share", numeric: true },
              {
                key: "change",
                label: window.prev ? `vs prev ${window.months.length}M` : "Change",
                numeric: true,
              },
            ]}
            rows={categories.map((c) => ({
              key: c.key,
              href: filterHref(c.key),
              cells: {
                label: c.label,
                amount: money(c.amount),
                share: c.share == null ? "—" : `${c.share}%`,
                // A change is muted text, never red or green (D-064).
                change: c.change == null ? "—" : `${c.change > 0 ? "+" : ""}${format(c.change)}`,
              },
            }))}
          />
        </section>
      )}
    </>
  );
}
