import type { ReactNode } from "react";
import type { ChartPeriod } from "@mbl/domain/charts/period";
import type { MoneyCharts, Position, ShareMonth } from "@mbl/domain/charts/position";
import type { MonthsWindow } from "@mbl/domain/charts/profit";
import { formatDate } from "@mbl/domain/dates";
import { format, sub } from "@mbl/domain/money";
import { ChartCard, type Delta } from "./chart-card";
import { Bars, type ChartRow, LineSeries, type Series, SignedStack } from "./charts";
import { deltaOf, isEmpty, prevNote, rowsOf } from "./profit-cards";

// D-064 (UIDD §4.17; clarified 2026-10-24): the Money tab's four cards: Business value, Cash,
// Card debt and Profit shares. Positions compare with the window's first day ("since 01 May");
// Profit shares, a flow over whole months, with the months before ("vs prev 6M"). The detail
// pages share the series and rows below.

export const MONEY_CHARTS = ["business-value", "cash", "card-debt", "profit-shares"] as const;
export type MoneyChart = (typeof MONEY_CHARTS)[number];

export const MONEY_TITLE: Record<MoneyChart, string> = {
  "business-value": "Business value",
  cash: "Cash",
  "card-debt": "Card debt",
  "profit-shares": "Profit shares",
};

// The colour follows the account (D-064): Cash 1, Stock 2, Customers owe 3, Card 4, Suppliers 5;
// the labels are the Books balance sheet's. Business assets is never drawn (CR-046: the tooltip
// and the table list it), so it has no colour of its own.
export const POSITION_SERIES = {
  cash: { key: "cash", label: "Cash", color: "var(--chart-1)" },
  stock: { key: "stock", label: "Stock at cost", color: "var(--chart-2)" },
  dues: { key: "dues", label: "Customers owe", color: "var(--chart-3)" },
  assets: { key: "assets", label: "Business assets", color: "var(--foreground)" },
  card: { key: "card", label: "Card balances", color: "var(--chart-4)" },
  suppliers: { key: "suppliers", label: "We owe suppliers", color: "var(--chart-5)" },
  net: { key: "net", label: "Net worth", color: "var(--chart-6)" },
} satisfies Record<string, Series>;

export const STACK = [
  POSITION_SERIES.cash,
  POSITION_SERIES.stock,
  POSITION_SERIES.dues,
  POSITION_SERIES.card,
  POSITION_SERIES.suppliers,
];

/** A bucket's position as chart rows: what we have above 0 (Business assets, their top), what we
 * owe below. */
export const positionRow = (p: Position & { label: string }): ChartRow => ({
  label: p.label,
  cash: p.cash,
  stock: p.stock,
  dues: p.customerDues,
  assets: p.businessAssets,
  card: 0 - p.cardBalances,
  suppliers: 0 - p.supplierDues,
  net: p.netWorth,
});

export const cardRows = (charts: MoneyCharts) =>
  charts.positions.map((p) => ({ label: p.label, card: p.cardBalances }));

/** The people with a share in these months, in Setup order, coloured 1–6 in turn. */
export function shareSeries(
  people: { id: string; name: string }[],
  months: ShareMonth[],
): (Series & { id: string })[] {
  const shared = new Set(months.flatMap((m) => Object.keys(m.byPerson)));
  return people
    .filter((p) => shared.has(p.id))
    .map((p, i) => ({
      id: p.id,
      key: `p${i}`,
      label: p.name,
      color: `var(--chart-${(i % 6) + 1})`,
    }));
}

/** A month's shares as a chart row; an open month has none (not allocated yet). */
export const shareRows = (months: ShareMonth[], series: (Series & { id: string })[]) =>
  months.map((m) => ({
    label: m.label,
    ...Object.fromEntries(series.map((s) => [s.key, m.closed ? (m.byPerson[s.id] ?? 0) : null])),
  }));

/** "since 01 May": a position now against the window's first day. */
export function since(now: number, start: number, period: ChartPeriod): Delta {
  return { amount: sub(now, start), note: `since ${formatDate(period.from).slice(0, 6)}` };
}

export function MoneyCards({
  charts,
  period,
  window,
  people,
  href,
}: {
  charts: MoneyCharts;
  period: ChartPeriod;
  window: MonthsWindow;
  people: { id: string; name: string }[];
  /** A detail page's link, with the window. */
  href: (chart: MoneyChart) => string;
}) {
  const { positions, start, cash, shares } = charts;
  const now = positions.at(-1)!;
  const mini = (empty: boolean, chart: ReactNode) =>
    empty ? <span className="text-muted-foreground text-sm">Nothing in this period</span> : chart;
  const sharers = shareSeries(people, shares.months);

  return (
    <section aria-label="Money charts" className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
      <ChartCard
        href={href("business-value")}
        title={MONEY_TITLE["business-value"]}
        headline={format(now.netWorth)}
        delta={since(now.netWorth, start.netWorth, period)}
      >
        {mini(
          positions.every((p) => p.businessAssets === 0 && p.netWorth === 0),
          <SignedStack
            mini
            rows={positions.map(positionRow)}
            series={STACK}
            line={POSITION_SERIES.net}
          />,
        )}
      </ChartCard>
      <ChartCard
        href={href("cash")}
        title={MONEY_TITLE.cash}
        headline={format(now.cash)}
        delta={since(now.cash, start.cash, period)}
      >
        {mini(
          isEmpty(cash.days.map((p) => p.amount)),
          <LineSeries mini rows={rowsOf(cash.days, "cash")} series={[POSITION_SERIES.cash]} />,
        )}
      </ChartCard>
      <ChartCard
        href={href("card-debt")}
        title={MONEY_TITLE["card-debt"]}
        headline={format(now.cardBalances)}
        delta={since(now.cardBalances, start.cardBalances, period)}
      >
        {mini(
          isEmpty(positions.map((p) => p.cardBalances)),
          <Bars mini rows={cardRows(charts)} series={[POSITION_SERIES.card]} />,
        )}
      </ChartCard>
      <ChartCard
        href={href("profit-shares")}
        title={MONEY_TITLE["profit-shares"]}
        headline={format(shares.total.amount)}
        delta={deltaOf(shares.total, prevNote(window.months.length, "month"))}
      >
        {mini(
          sharers.length === 0,
          <Bars mini stacked rows={shareRows(shares.months, sharers)} series={sharers} />,
        )}
      </ChartCard>
    </section>
  );
}
