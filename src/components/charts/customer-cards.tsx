import type { ReactNode } from "react";
import type { CustomerCharts, FlowPoint } from "@/lib/charts/customers";
import type { ChartPeriod } from "@/lib/charts/period";
import type { SalesGroup } from "@/lib/sales-report";
import { OTHERS } from "@/lib/monthly-pack";
import { format } from "@/lib/money";
import { ChartCard } from "./chart-card";
import { Bars, HBars, LineSeries, type Series } from "./charts";
import { POSITION_SERIES, since } from "./money-cards";
import { deltaOf, isEmpty, prevNote, rowsOf } from "./profit-cards";

// D-064 (UIDD §4.17; clarified 2026-10-24): the Customers tab's three cards: Customers owe (a
// position: "since 01 May"), Given vs collected (a flow: "vs prev 6M") and Top customers (the
// window's Sales report by customer, Walk-in included). The detail pages share the series below.

export const CUSTOMER_CHARTS = ["customers-owe", "given-collected", "top-customers"] as const;
export type CustomerChart = (typeof CUSTOMER_CHARTS)[number];

export const CUSTOMER_TITLE: Record<CustomerChart, string> = {
  "customers-owe": "Customers owe",
  "given-collected": "Given vs collected",
  "top-customers": "Top customers",
};

// Given is a due (Customers owe's colour), Collected is cash in (Cash's).
export const FLOW_SERIES = {
  given: { key: "given", label: "Given", color: POSITION_SERIES.dues.color },
  collected: { key: "collected", label: "Collected", color: POSITION_SERIES.cash.color },
} satisfies Record<string, Series>;

export const TOP_SERIES = {
  sales: { key: "sales", label: "Sales", color: "var(--chart-2)" },
  profit: { key: "profit", label: "Profit", color: "var(--chart-1)" },
} satisfies Record<string, Series>;

export const flowRows = (buckets: FlowPoint[]) =>
  buckets.map((b) => ({ label: b.label, given: b.given, collected: b.collected }));

/** The ranked customers as bars (the "Other customers" row is in the table only). */
export const topRows = (top: SalesGroup[], names: Record<string, string>) =>
  top
    .filter((g) => g.id !== OTHERS)
    .map((g) => ({ label: names[g.id] ?? "Customer", sales: g.sales, profit: g.profit }));

export function CustomerCards({
  charts,
  period,
  names,
  href,
}: {
  charts: CustomerCharts;
  period: ChartPeriod;
  names: Record<string, string>;
  /** A detail page's link, with the window. */
  href: (chart: CustomerChart) => string;
}) {
  const { dues, start, flows, top } = charts;
  const now = dues.at(-1)?.amount ?? 0;
  const first = top.find((g) => g.id !== OTHERS);
  const mini = (empty: boolean, chart: ReactNode) =>
    empty ? <span className="text-muted-foreground text-sm">Nothing in this period</span> : chart;

  return (
    <section aria-label="Customer charts" className="mt-4 grid gap-3 lg:grid-cols-3">
      <ChartCard
        href={href("customers-owe")}
        title={CUSTOMER_TITLE["customers-owe"]}
        headline={format(now)}
        delta={since(now, start, period)}
      >
        {mini(
          isEmpty(dues.map((p) => p.amount)),
          <LineSeries mini rows={rowsOf(dues, "dues")} series={[POSITION_SERIES.dues]} />,
        )}
      </ChartCard>
      <ChartCard
        href={href("given-collected")}
        title={CUSTOMER_TITLE["given-collected"]}
        headline={format(flows.total.amount)}
        delta={deltaOf(flows.total, prevNote(period.buckets.length, period.view))}
      >
        {mini(
          flows.buckets.every((b) => b.given === 0 && b.collected === 0),
          <Bars
            mini
            rows={flowRows(flows.buckets)}
            series={[FLOW_SERIES.given, FLOW_SERIES.collected]}
          />,
        )}
      </ChartCard>
      <ChartCard
        href={href("top-customers")}
        title={CUSTOMER_TITLE["top-customers"]}
        headline={first ? `${names[first.id] ?? "Customer"} · ${format(first.sales)}` : "—"}
      >
        {mini(!first, <HBars mini rows={topRows(top, names)} series={[TOP_SERIES.sales]} />)}
      </ChartCard>
    </section>
  );
}
