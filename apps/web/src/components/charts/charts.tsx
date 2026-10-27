"use client";

import type { ReactElement } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { compact, format } from "@mbl/domain/money";
import { type DetailLine, HOVER_ONLY, ReadoutLine, useReadout } from "./readout";

// D-064 (UIDD §4.17, §6): the chart shapes. Only `src/components/charts/**` imports Recharts, so
// only the chart pages load it. Colours are `var(--chart-n)` (the app themes with `data-theme`,
// never the `.dark` keys); no animation; no text on a fill. A detail chart is one labelled image
// (its table holds the exact figures); a card's mini chart has no axes and sits in an aria-hidden
// wrapper (`ChartCard`).

/** A drawn value: `color` is "var(--chart-n)", the same account or person on every chart. */
export type Series = { key: string; label: string; color: string };
/** One bucket (or one ranked item): its label and a number per series key. */
export type ChartRow = { label: string } & Record<string, string | number | null>;
/** What the numbers are: poisha (axes `compact`, tooltip `format`), a percent or a count. */
export type Axis = "money" | "percent" | "count";

type Common = {
  rows: ChartRow[];
  series: Series[];
  /** A detail chart's one-line label; a mini chart has none. */
  label?: string;
  /** A card's mini chart: no axes, grid, tooltip or readout. */
  mini?: boolean;
  /** The phone readout: one line per row, "{bucket}: {values}". */
  readout?: string[];
  /** Lines behind the readout's "See breakdown", one list per row. */
  details?: DetailLine[][];
  axis?: Axis;
  height?: number;
};

type Click = ((state: { activeTooltipIndex?: unknown }) => void) | undefined;

const tickText = (axis: Axis) => (v: number) =>
  axis === "money" ? compact(Math.round(v)) : axis === "percent" ? `${v}%` : String(v);
const valueText = (axis: Axis, v: number) =>
  axis === "money" ? format(v) : axis === "percent" ? `${v}%` : String(v);
/** A ranked item's axis name, cut to one line (the readout, tooltip and table have it whole). */
const short = (name: string) => (name.length > 14 ? `${name.slice(0, 13)}…` : name);
const hasNegative = (rows: ChartRow[], series: Series[]) =>
  rows.some((r) => series.some((s) => Number(r[s.key] ?? 0) < 0));
const fill = (s: Series) => `var(--color-${s.key})`;

/** The readout line, the container and the click → readout pick. */
function Frame({
  rows,
  series,
  label,
  mini,
  readout,
  details,
  height,
  children,
}: Common & { children: (onClick: Click) => ReactElement }) {
  const { index, pick } = useReadout(rows.length);
  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  );
  const onClick: Click =
    readout && !mini
      ? (state) => {
          const i = Number(state.activeTooltipIndex);
          if (Number.isInteger(i)) pick(i);
        }
      : undefined;
  return (
    <div className="min-w-0">
      {readout && !mini && <ReadoutLine text={readout[index]} detail={details?.[index]} />}
      <ChartContainer
        config={config}
        role={label ? "img" : undefined}
        aria-label={label}
        className="aspect-auto w-full min-w-0"
        style={{ height: height ?? (mini ? 48 : 240) }}
      >
        {children(onClick)}
      </ChartContainer>
    </div>
  );
}

/** The grid, axes and (hover-only) tooltip of a detail chart; a mini chart hides its axes. */
function axes(mini: boolean | undefined, axis: Axis, vertical = false) {
  if (mini)
    return [
      <XAxis
        key="x"
        dataKey={vertical ? undefined : "label"}
        type={vertical ? "number" : "category"}
        hide
      />,
      <YAxis
        key="y"
        dataKey={vertical ? "label" : undefined}
        type={vertical ? "category" : "number"}
        hide
      />,
    ];
  const numbers = { tickFormatter: tickText(axis), tickLine: false, axisLine: false } as const;
  const labels = { tickLine: false, axisLine: false, minTickGap: 8 } as const;
  return [
    <CartesianGrid key="g" vertical={vertical} horizontal={!vertical} />,
    vertical ? (
      <XAxis key="x" type="number" {...numbers} />
    ) : (
      <XAxis key="x" dataKey="label" {...labels} />
    ),
    vertical ? (
      <YAxis key="y" type="category" dataKey="label" width={96} tickFormatter={short} {...labels} />
    ) : (
      <YAxis key="y" width={56} {...numbers} />
    ),
    <ChartTooltip
      key="t"
      content={
        <ChartTooltipContent
          className={HOVER_ONLY}
          formatter={(value, name) => (
            <div className="flex w-full justify-between gap-3">
              <span className="text-muted-foreground">{name}</span>
              <span className="font-medium tabular-nums">{valueText(axis, Number(value))}</span>
            </div>
          )}
        />
      }
    />,
  ];
}

const zeroLine = <ReferenceLine key="0" y={0} stroke="var(--border)" />;

/** Bars per bucket, side by side per series (or `stacked`: Profit shares by person); signed
 * values go below 0 (net profit, a loss's shares). */
export function Bars(props: Common & { stacked?: boolean }) {
  const { rows, series, mini, stacked, axis = "money" } = props;
  return (
    <Frame {...props}>
      {(onClick) => (
        <BarChart
          data={rows}
          stackOffset={stacked ? "sign" : undefined}
          accessibilityLayer={false}
          onClick={onClick}
        >
          {axes(mini, axis)}
          {hasNegative(rows, series) && zeroLine}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? "a" : undefined}
              fill={fill(s)}
              maxBarSize={48}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      )}
    </Frame>
  );
}

/** Stacked bars, positives above 0 and negatives below (`stackOffset="sign"`), and an optional
 * line (Business value: Cash · Stock · Customers owe up, Card · Suppliers down, Net worth).
 * `total`: a figure the tooltip lists after the series `after`, not drawn (Business assets, the
 * top of the bars above 0, CR-046). */
export function SignedStack(
  props: Common & { line?: Series; total?: { series: Series; after: string } },
) {
  const { rows, series, line, total, mini, axis = "money" } = props;
  const all = [...series, ...(total ? [total.series] : []), ...(line ? [line] : [])];
  return (
    <Frame {...props} series={all}>
      {(onClick) => (
        <ComposedChart data={rows} stackOffset="sign" accessibilityLayer={false} onClick={onClick}>
          {axes(mini, axis)}
          {zeroLine}
          {series.flatMap((s) => [
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={fill(s)}
              isAnimationActive={false}
            />,
            total?.after === s.key && !mini && (
              <Line
                key={total.series.key}
                dataKey={total.series.key}
                name={total.series.label}
                stroke="none"
                dot={false}
                activeDot={false}
                legendType="none"
                isAnimationActive={false}
              />
            ),
          ])}
          {line && (
            <Line
              dataKey={line.key}
              name={line.label}
              stroke={fill(line)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      )}
    </Frame>
  );
}

/** One or more lines (Cash, Customers owe, margin %); on a detail chart a point below 0 gets a red
 * dot (a mini chart has no marks). `dots`: a dot on every point, so a lone point between gaps
 * (margin % of a month with sales) shows. */
export function LineSeries(props: Common & { dots?: boolean }) {
  const { rows, series, mini, axis = "money", dots } = props;
  return (
    <Frame {...props}>
      {(onClick) => (
        <LineChart data={rows} accessibilityLayer={false} onClick={onClick}>
          {axes(mini, axis)}
          {hasNegative(rows, series) && zeroLine}
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={fill(s)}
              strokeWidth={2}
              isAnimationActive={false}
              dot={({ cx, cy, value, index }) =>
                value == null || mini ? (
                  <g key={index} />
                ) : Number(value) < 0 ? (
                  <circle key={index} cx={cx} cy={cy} r={3} fill="var(--destructive)" />
                ) : dots ? (
                  <circle key={index} cx={cx} cy={cy} r={3} fill={fill(s)} />
                ) : (
                  <g key={index} />
                )
              }
            />
          ))}
        </LineChart>
      )}
    </Frame>
  );
}

/** A step line (a customer's due at the end of each day) with dashed reference lines (Lowest,
 * Average). The labels sit on the plot's background, never on a fill. */
export function StepTrend(props: Common & { refs?: { label: string; value: number }[] }) {
  const { rows, series, refs = [], mini, axis = "money" } = props;
  return (
    <Frame {...props}>
      {(onClick) => (
        <LineChart data={rows} accessibilityLayer={false} onClick={onClick}>
          {axes(mini, axis)}
          {refs.map((r) => (
            <ReferenceLine
              key={r.label}
              y={r.value}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={
                mini ? undefined : { value: r.label, position: "insideBottomRight", fontSize: 11 }
              }
            />
          ))}
          {series.map((s) => (
            <Line
              key={s.key}
              type="stepAfter"
              dataKey={s.key}
              name={s.label}
              stroke={fill(s)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      )}
    </Frame>
  );
}

/** Horizontal bars, one per ranked item (Top customers, Top models). */
export function HBars(props: Common) {
  const { rows, series, mini, axis = "money", height } = props;
  return (
    <Frame {...props} height={height ?? (mini ? 48 : Math.max(120, rows.length * 32))}>
      {(onClick) => (
        <BarChart data={rows} layout="vertical" accessibilityLayer={false} onClick={onClick}>
          {axes(mini, axis, true)}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={fill(s)}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      )}
    </Frame>
  );
}
