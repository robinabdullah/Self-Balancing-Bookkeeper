import type { ReactNode } from "react";
import Link from "next/link";
import { Amount } from "@/components/amount";
import { BankBadge } from "@/components/cards/bank-badge";
import type { ChartPeriod } from "@/lib/charts/period";
import type { MoneyCharts } from "@/lib/charts/position";
import type { MonthsWindow } from "@/lib/charts/profit";
import { daysLeft } from "@/lib/dashboard";
import { formatDate, formatRange } from "@/lib/dates";
import { format } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ChartTable } from "./chart-table";
import { Bars, LineSeries, SignedStack } from "./charts";
import {
  MONEY_TITLE,
  type MoneyChart,
  POSITION_SERIES,
  STACK,
  cardRows,
  positionRow,
  shareRows,
  shareSeries,
} from "./money-cards";
import { Beside, Notes, nothing } from "./profit-detail";
import { isEmpty, rowsOf } from "./profit-cards";

// D-064 (UIDD §4.17; clarified 2026-10-24): the Money tab's detail pages: the chart with its
// one-line label and phone readout, then the exact values (a list on a phone, a table on
// desktop). Positions are as on each bucket's last day; Cash runs by day; Profit shares count
// whole months; Bills due next are as of today.

const NET_WORTH =
  "Net worth's change isn't the profit: capital in or out and profit paid move it too";
const CARD_DUES = "Card balances include bills not due yet, so they differ from Home's Card dues";
const SHARES_BY_MONTH = "Profit shares are counted by month";
const WHOLE_MONTHS = "Net profit and profit shares count whole months";

const money = (n: number) => <Amount poisha={n} />;

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = title.toLowerCase().replaceAll(" ", "-");
  return (
    <section aria-labelledby={id} className="mt-6">
      <h2 id={id} className="mb-2 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function MoneyDetail({
  chart,
  charts,
  period,
  window,
  people,
  names,
  cardNames,
}: {
  chart: MoneyChart;
  charts: MoneyCharts;
  period: ChartPeriod;
  window: MonthsWindow;
  people: { id: string; name: string }[];
  names: Record<string, string>;
  cardNames: Record<string, string>;
}) {
  const byDay = period.view === "day";
  const bucket = byDay ? "Date" : "Month";
  const per = `${byDay ? "day" : "month"} end, ${formatRange(period.from, period.to)}`;
  const { positions } = charts;

  if (chart === "business-value") {
    if (positions.every((p) => p.businessAssets === 0 && p.netWorth === 0)) return nothing;
    return (
      <div className="flex flex-col gap-4">
        <Notes notes={[NET_WORTH]} />
        <SignedStack
          rows={positions.map(positionRow)}
          series={STACK}
          line={POSITION_SERIES.net}
          total={{ series: POSITION_SERIES.assets, after: POSITION_SERIES.dues.key }}
          label={`Business value at each ${per}`}
          readout={positions.map(
            (p) =>
              `${p.label}: Business assets ${format(p.businessAssets)} · Net worth ${format(p.netWorth)}`,
          )}
        />
        <ChartTable
          caption="Business value"
          columns={[
            { key: "label", label: bucket },
            // CR-046: Business assets after Customers owe, as the Books balance.
            ...[
              ...STACK.slice(0, 3),
              POSITION_SERIES.assets,
              ...STACK.slice(3),
              POSITION_SERIES.net,
            ].map((s) => ({
              key: s.key,
              label: s.label,
              numeric: true,
            })),
          ]}
          rows={positions.map((p) => {
            const row = positionRow(p);
            return {
              key: p.key,
              cells: Object.fromEntries(
                Object.entries(row).map(([k, v]) => [k, k === "label" ? v : money(Number(v))]),
              ),
            };
          })}
        />
      </div>
    );
  }

  if (chart === "cash") {
    const { days, below } = charts.cash;
    if (isEmpty(days.map((p) => p.amount))) return nothing;
    return (
      <>
        <Beside
          chart={
            <LineSeries
              rows={rowsOf(days, "cash")}
              series={[POSITION_SERIES.cash]}
              label={`Cash at each day end, ${formatRange(period.from, period.to)}`}
              readout={days.map((p) => `${p.label}: ${format(p.amount)}`)}
            />
          }
          table={
            <ChartTable
              caption="Cash"
              columns={[
                { key: "label", label: bucket },
                { key: "cash", label: "Cash", numeric: true },
              ]}
              rows={positions.map((p) => ({
                key: p.key,
                cells: { label: p.label, cash: money(p.cash) },
              }))}
            />
          }
        />
        {below.length > 0 && (
          <Section title="Below zero">
            <ChartTable
              caption="Below zero"
              columns={[
                { key: "label", label: "Date" },
                { key: "cash", label: "Cash", numeric: true },
              ]}
              rows={below.map((p) => ({
                key: p.key,
                href: `/reports/cash?from=${p.key}&to=${p.key}`,
                cells: { label: p.label, cash: money(p.amount) },
              }))}
            />
          </Section>
        )}
      </>
    );
  }

  if (chart === "card-debt") {
    return (
      <>
        {isEmpty(positions.map((p) => p.cardBalances)) ? (
          nothing
        ) : (
          <>
            <Notes notes={[CARD_DUES]} />
            <Beside
              chart={
                <Bars
                  rows={cardRows(charts)}
                  series={[POSITION_SERIES.card]}
                  label={`Card balances at each ${per}`}
                  readout={positions.map((p) => `${p.label}: ${format(p.cardBalances)}`)}
                />
              }
              table={
                <ChartTable
                  caption={MONEY_TITLE["card-debt"]}
                  columns={[
                    { key: "label", label: bucket },
                    { key: "card", label: "Card balances", numeric: true },
                  ]}
                  rows={positions.map((p) => ({
                    key: p.key,
                    cells: { label: p.label, card: money(p.cardBalances) },
                  }))}
                />
              }
            />
          </>
        )}
        <Section title="Bills due next">
          <p className="text-muted-foreground mb-2 text-sm">As of today</p>
          {charts.bills.length === 0 ? (
            <p className="text-muted-foreground text-sm">No card bills to pay.</p>
          ) : (
            <ul aria-label="Bills due next" className="divide-y rounded-lg border">
              {charts.bills.map((a) => (
                <li key={a.cardId} className="px-3">
                  <Link
                    href={`/cards/${a.cardId}`}
                    className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <BankBadge name={cardNames[a.cardId] ?? ""} />
                      {names[a.cardId] ?? "Card"}
                    </span>
                    <Amount poisha={a.amount} className="text-right font-medium" />
                    <span
                      className={cn(
                        "text-sm",
                        a.daysLeft < 0 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      Due {formatDate(a.dueDate)} · {daysLeft(a.daysLeft)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </>
    );
  }

  const { months } = charts.shares;
  const series = shareSeries(people, months);
  const notes = [byDay && SHARES_BY_MONTH, !byDay && window.partial && WHOLE_MONTHS];
  if (series.length === 0)
    return (
      <>
        <Notes notes={notes} />
        {nothing}
      </>
    );
  const shareText = (m: (typeof months)[number]) =>
    m.closed
      ? series.map((s) => `${s.label} ${format(m.byPerson[s.id] ?? 0)}`).join(" · ")
      : "not allocated yet";
  return (
    <div className="flex flex-col gap-4">
      <Notes notes={notes} />
      <Bars
        stacked
        rows={shareRows(months, series)}
        series={series}
        label={`Profit shares per month by person, ${formatRange(period.from, period.to)}`}
        readout={months.map((m) => `${m.label}: ${shareText(m)}`)}
      />
      <ChartTable
        caption={MONEY_TITLE["profit-shares"]}
        columns={[
          { key: "label", label: "Month" },
          ...series.map((s) => ({ key: s.key, label: s.label, numeric: true })),
          { key: "total", label: "Total", numeric: true },
        ]}
        rows={months.map((m) => ({
          key: m.key,
          href: `/months/${m.key}`,
          cells: Object.fromEntries([
            ["label", m.label],
            ...series.map((s) => [s.key, m.closed ? money(m.byPerson[s.id] ?? 0) : "—"]),
            [
              "total",
              m.closed ? (
                money(m.total)
              ) : (
                <span className="text-muted-foreground">not allocated yet</span>
              ),
            ],
          ]),
        }))}
      />
    </div>
  );
}
