import type { ReactNode } from "react";
import type { StockCharts } from "@/lib/charts/stock";
import type { SalesGroup } from "@/lib/sales-report";
import { OTHERS } from "@/lib/monthly-pack";
import { format } from "@/lib/money";
import { ChartCard } from "./chart-card";
import { Bars, HBars, type Series } from "./charts";
import { TOP_SERIES } from "./customer-cards";
import { POSITION_SERIES } from "./money-cards";

// D-064 (UIDD §4.17; clarified 2026-10-24): the Stock tab's two cards: Stock age (today's stock,
// "as of today"; the 90+ value) and Top models sold (the window's Sales report by model, by
// pieces). The detail pages share the series below.

export const STOCK_CHARTS = ["stock-age", "top-models"] as const;
export type StockChart = (typeof STOCK_CHARTS)[number];

export const STOCK_TITLE: Record<StockChart, string> = {
  "stock-age": "Stock age",
  "top-models": "Top models sold",
};

// Stock's value is Stock at cost's colour (Business value).
export const AGE_SERIES = {
  key: "value",
  label: "Value at cost",
  color: POSITION_SERIES.stock.color,
} satisfies Series;

export const MODEL_SERIES = {
  pieces: { key: "pieces", label: "Pieces", color: "var(--chart-2)" },
  profit: TOP_SERIES.profit,
} satisfies Record<string, Series>;

export const NO_STOCK = "Nothing in stock";

export const ageRows = (ages: StockCharts["ages"]) =>
  ages.map((a) => ({ label: a.short, value: a.value }));

/** Nothing left in any age. */
export const noStock = (ages: StockCharts["ages"]) =>
  ages.every((a) => a.models.length === 0 && a.value === 0);

/** The ranked models as bars (the "Other models" row is in the table only). */
export const modelRows = (top: SalesGroup[], names: Record<string, string>) =>
  top
    .filter((g) => g.id !== OTHERS)
    .map((g) => ({ label: names[g.id] ?? "Model", pieces: g.pieces, profit: g.profit }));

export const pcs = (n: number) => `${n} pcs`;

export function StockCards({
  charts,
  names,
  href,
}: {
  charts: StockCharts;
  names: Record<string, string>;
  /** A detail page's link, with the window. */
  href: (chart: StockChart) => string;
}) {
  const { ages, top } = charts;
  const first = top.find((g) => g.id !== OTHERS);
  const mini = (empty: boolean, text: string, chart: ReactNode) =>
    empty ? <span className="text-muted-foreground text-sm">{text}</span> : chart;

  return (
    <section aria-label="Stock charts" className="mt-4 grid gap-3 lg:grid-cols-3">
      <ChartCard
        href={href("stock-age")}
        title={STOCK_TITLE["stock-age"]}
        headline={`${format(ages[3].value)} over 90 days`}
        note="as of today"
      >
        {mini(
          noStock(ages),
          NO_STOCK,
          <Bars mini rows={ageRows(ages)} series={[AGE_SERIES]} />,
        )}
      </ChartCard>
      <ChartCard
        href={href("top-models")}
        title={STOCK_TITLE["top-models"]}
        headline={first ? `${names[first.id] ?? "Model"} · ${pcs(first.pieces)}` : "—"}
      >
        {mini(
          !first,
          "Nothing in this period",
          <HBars mini axis="count" rows={modelRows(top, names)} series={[MODEL_SERIES.pieces]} />,
        )}
      </ChartCard>
    </section>
  );
}
