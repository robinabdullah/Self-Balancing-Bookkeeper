import { Amount } from "@/components/amount";
import { TYPE_LABEL } from "@mbl/domain/journal/labels";
import { SegmentedNav } from "@/components/shell/segmented-nav";
import type { CustomerCharts } from "@mbl/domain/charts/customers";
import { type ChartPeriod, periodQuery } from "@mbl/domain/charts/period";
import { formatRange } from "@mbl/domain/dates";
import { withQuery } from "@mbl/domain/href";
import { OTHERS } from "@mbl/domain/monthly-pack";
import { format } from "@mbl/domain/money";
import { ChartTable } from "./chart-table";
import { Bars, HBars, LineSeries } from "./charts";
import { FLOW_SERIES, TOP_SERIES, type CustomerChart, flowRows, topRows } from "./customer-cards";
import { POSITION_SERIES } from "./money-cards";
import { Section } from "./money-detail";
import { Beside, nothing } from "./profit-detail";
import { isEmpty, rowsOf } from "./profit-cards";

// D-064 (UIDD §4.17; clarified 2026-10-24): the Customers tab's detail pages: the chart with its
// one-line label and phone readout, then the exact values. Customers owe adds the customers who
// kept a due all through the window (a row opens their Due trend); Given vs collected lists Other
// by kind; Top customers switches Sales / Profit (`?by=profit`) and totals the Sales report.

const money = (n: number) => <Amount poisha={n} />;
const kindLabel = (kind: string) => (kind === "walk_in" ? "Walk-in" : (TYPE_LABEL[kind] ?? kind));

export function CustomerDetail({
  chart,
  charts,
  period,
  names,
  by,
}: {
  chart: CustomerChart;
  charts: CustomerCharts;
  period: ChartPeriod;
  names: Record<string, string>;
  by: "sales" | "profit";
}) {
  const byDay = period.view === "day";
  const bucket = byDay ? "Date" : "Month";
  const range = formatRange(period.from, period.to);
  const query = periodQuery(period);

  if (chart === "customers-owe") {
    const { dues, lowest } = charts;
    return (
      <>
        {isEmpty(dues.map((p) => p.amount)) ? (
          nothing
        ) : (
          <Beside
            chart={
              <LineSeries
                rows={rowsOf(dues, "dues")}
                series={[POSITION_SERIES.dues]}
                label={`Customers owe at each ${byDay ? "day" : "month"} end, ${range}`}
                readout={dues.map((p) => `${p.label}: ${format(p.amount)}`)}
              />
            }
            table={
              <ChartTable
                caption="Customers owe"
                columns={[
                  { key: "label", label: bucket },
                  { key: "dues", label: "Customers owe", numeric: true },
                ]}
                rows={dues.map((p) => ({
                  key: p.key,
                  cells: { label: p.label, dues: money(p.amount) },
                }))}
              />
            }
          />
        )}
        <Section title="Lowest due">
          <p className="text-muted-foreground mb-2 text-sm">
            The due each customer kept all through the period
          </p>
          {lowest.length === 0 ? (
            <p className="text-muted-foreground text-sm">No customer kept a due all through it.</p>
          ) : (
            <ChartTable
              caption="Lowest due"
              columns={[
                { key: "name", label: "Customer" },
                { key: "lowest", label: "Lowest", numeric: true },
                { key: "now", label: "Now", numeric: true },
              ]}
              rows={lowest.map((c) => ({
                key: c.id,
                href: withQuery(`/customers/${c.id}/trend`, query),
                cells: {
                  name: names[c.id] ?? "Customer",
                  lowest: money(c.lowest),
                  now: money(c.now),
                },
              }))}
            />
          )}
        </Section>
      </>
    );
  }

  if (chart === "given-collected") {
    const { buckets, other } = charts.flows;
    if (buckets.every((b) => b.change === 0 && b.given === 0 && b.collected === 0)) return nothing;
    return (
      <>
        <div className="flex flex-col gap-4">
          <Bars
            rows={flowRows(buckets)}
            series={[FLOW_SERIES.given, FLOW_SERIES.collected]}
            label={`Given and collected per ${byDay ? "day" : "month"}, ${range}`}
            readout={buckets.map(
              (b) =>
                `${b.label}: Given ${format(b.given)} · Collected ${format(b.collected)} · Other ${format(b.other)}`,
            )}
          />
          <ChartTable
            caption="Given vs collected"
            columns={[
              { key: "label", label: bucket },
              { key: "given", label: "Given", numeric: true },
              { key: "collected", label: "Collected", numeric: true },
              { key: "other", label: "Other", numeric: true },
              { key: "change", label: "Change", numeric: true },
            ]}
            rows={buckets.map((b) => ({
              key: b.key,
              cells: {
                label: b.label,
                given: money(b.given),
                collected: money(b.collected),
                other: money(b.other),
                change: money(b.change),
              },
            }))}
          />
        </div>
        {other.length > 0 && (
          <Section title="Other">
            <p className="text-muted-foreground mb-2 text-sm">
              Other changes to the dues in the period, by kind
            </p>
            <ChartTable
              caption="Other by kind"
              columns={[
                { key: "kind", label: "Kind" },
                { key: "amount", label: "Amount", numeric: true },
              ]}
              rows={other.map((o) => ({
                key: o.kind,
                cells: { kind: kindLabel(o.kind), amount: money(o.amount) },
              }))}
            />
          </Section>
        )}
      </>
    );
  }

  const { top } = charts;
  const path = "/reports/charts/top-customers";
  const series = TOP_SERIES[by];
  const rows = topRows(top, names);
  return (
    <div className="flex flex-col gap-4">
      <SegmentedNav
        label="Rank by"
        items={[
          { href: withQuery(path, query), label: "Sales", current: by === "sales" },
          {
            href: withQuery(path, { by: "profit", ...query }),
            label: "Profit",
            current: by === "profit",
          },
        ]}
      />
      {rows.length === 0 ? (
        nothing
      ) : (
        <>
          <HBars
            rows={rows}
            series={[series]}
            label={`Top customers by ${series.label.toLowerCase()}, ${range}`}
            readout={rows.map((r) => `${r.label}: ${format(r[by])}`)}
          />
          <ChartTable
            caption="Top customers"
            columns={[
              { key: "name", label: "Customer" },
              { key: "pieces", label: "Pieces", numeric: true },
              { key: "sales", label: "Sales", numeric: true },
              { key: "profit", label: "Profit", numeric: true },
            ]}
            rows={top.map((g) => ({
              key: g.id,
              href: g.id === OTHERS ? undefined : `/customers/${g.id}`,
              cells: {
                name: names[g.id] ?? "Customer",
                pieces: g.pieces,
                sales: money(g.sales),
                profit: money(g.profit),
              },
            }))}
          />
        </>
      )}
    </div>
  );
}
