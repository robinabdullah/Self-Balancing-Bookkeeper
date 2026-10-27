import Link from "next/link";
import { Amount } from "@/components/amount";
import { SegmentedNav } from "@/components/shell/segmented-nav";
import { type ChartPeriod, periodQuery } from "@/lib/charts/period";
import type { AgeKey, StockCharts } from "@/lib/charts/stock";
import { formatDate, formatRange } from "@/lib/dates";
import { withQuery } from "@/lib/href";
import { format } from "@/lib/money";
import { ChartTable } from "./chart-table";
import { Bars, HBars } from "./charts";
import { Section } from "./money-detail";
import { Beside, Notes, nothing } from "./profit-detail";
import {
  AGE_SERIES,
  MODEL_SERIES,
  NO_STOCK,
  type StockChart,
  ageRows,
  modelRows,
  noStock,
  pcs,
} from "./stock-cards";

// D-064 (UIDD §4.17; clarified 2026-10-24): the Stock tab's detail pages. Stock age: today's stock
// by age, a table of the four ages whose rows (`?age=`) list that age's models below it (All ages
// clears it); the opening note while stock from the opening is left. Top models sold switches
// Pieces / Profit (`?by=profit`) and totals the Sales report by model.

const money = (n: number) => <Amount poisha={n} />;
const units = (n: number) => `${n} ${n === 1 ? "unit" : "units"}`;

export function StockDetail({
  chart,
  charts,
  period,
  names,
  firstDate,
  age,
  by,
}: {
  chart: StockChart;
  charts: StockCharts;
  period: ChartPeriod;
  names: Record<string, string>;
  /** The opening date (the opening note). */
  firstDate: string;
  age?: AgeKey;
  by: "pieces" | "profit";
}) {
  const query = periodQuery(period);

  if (chart === "stock-age") {
    const { ages, opening } = charts;
    const path = "/reports/charts/stock-age";
    const picked = ages.find((a) => a.key === age);
    if (noStock(ages))
      return (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {NO_STOCK}
        </p>
      );
    return (
      <>
        <Notes notes={[opening && `Opening stock counts from ${formatDate(firstDate)}`]} />
        <Beside
          chart={
            <Bars
              rows={ageRows(ages)}
              series={[AGE_SERIES]}
              label="Stock by age in days, value at cost, as of today"
              readout={ages.map((a) => `${a.label}: ${format(a.value)} · ${units(a.units)}`)}
            />
          }
          table={
            <ChartTable
              caption="Stock age"
              columns={[
                { key: "label", label: "Age" },
                { key: "units", label: "Units", numeric: true },
                { key: "value", label: "Value", numeric: true },
              ]}
              rows={ages.map((a) => ({
                key: a.key,
                href: withQuery(path, { ...query, age: a.key }),
                cells: { label: a.label, units: a.units, value: money(a.value) },
              }))}
            />
          }
        />
        {picked && (
          <Section title={`Models · ${picked.label}`}>
            <p className="mb-2 flex flex-wrap items-center gap-x-3 text-sm">
              <span className="text-muted-foreground">
                {units(picked.units)} · {format(picked.value)} at cost
              </span>
              <Link
                href={withQuery(path, query)}
                scroll={false}
                className="text-primary flex min-h-11 items-center"
              >
                All ages
              </Link>
            </p>
            {picked.models.length === 0 ? (
              <p className="text-muted-foreground text-sm">No stock of this age.</p>
            ) : (
              <ChartTable
                caption={`Models · ${picked.label}`}
                columns={[
                  { key: "name", label: "Model" },
                  { key: "units", label: "Units", numeric: true },
                  { key: "value", label: "Value", numeric: true },
                ]}
                rows={picked.models.map((m) => ({
                  key: m.modelId,
                  cells: { name: m.name, units: m.units, value: money(m.value) },
                }))}
              />
            )}
          </Section>
        )}
      </>
    );
  }

  const { top } = charts;
  const path = "/reports/charts/top-models";
  const series = MODEL_SERIES[by];
  const rows = modelRows(top, names);
  const range = formatRange(period.from, period.to);
  return (
    <div className="flex flex-col gap-4">
      <SegmentedNav
        label="Rank by"
        items={[
          { href: withQuery(path, query), label: "Pieces", current: by === "pieces" },
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
            axis={by === "pieces" ? "count" : "money"}
            label={`Top models sold by ${series.label.toLowerCase()}, ${range}`}
            readout={rows.map(
              (r) => `${r.label}: ${by === "pieces" ? pcs(r.pieces) : format(r.profit)}`,
            )}
          />
          <ChartTable
            caption="Top models sold"
            columns={[
              { key: "name", label: "Model" },
              { key: "pieces", label: "Pieces", numeric: true },
              { key: "sales", label: "Sales", numeric: true },
              { key: "profit", label: "Profit", numeric: true },
            ]}
            rows={top.map((g) => ({
              key: g.id,
              cells: {
                name: names[g.id] ?? "Model",
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
