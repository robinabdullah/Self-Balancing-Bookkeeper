import { Amount } from "@/components/amount";
import type { DueTrend } from "@/lib/charts/customers";
import { formatDate, formatRange } from "@/lib/dates";
import { format } from "@/lib/money";
import { StepTrend } from "./charts";
import { POSITION_SERIES } from "./money-cards";
import { nothing } from "./profit-detail";
import { rowsOf } from "./profit-cards";

// D-064 (UIDD §4.17; clarified 2026-10-24): a customer's Due trend: a step line of the due at the
// end of each day with dashed Lowest and Average lines, then Now · Average · Lowest · Highest ·
// Last paid. Now is today's due (the customer page's); Last paid is the latest payment ever that
// still stands.

const ago = (days: number) =>
  days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;

export function DueTrendView({ trend, from, to }: { trend: DueTrend; from: string; to: string }) {
  const { points, now, average, lowest, highest, lastPaid } = trend;
  const stats: [string, React.ReactNode][] = [
    ["Now", <Amount key="now" poisha={now} />],
    ["Average", average == null ? "—" : <Amount key="avg" poisha={average} />],
    ["Lowest (always kept)", <Amount key="low" poisha={lowest} />],
    ["Highest", <Amount key="high" poisha={highest} />],
    ["Last paid", lastPaid ? `${formatDate(lastPaid.date)} (${ago(lastPaid.days)})` : "—"],
  ];
  return (
    <div className="flex flex-col gap-4">
      {points.every((p) => p.amount === 0) ? (
        nothing
      ) : (
        <StepTrend
          rows={rowsOf(points, "dues")}
          series={[POSITION_SERIES.dues]}
          refs={[
            { label: "Lowest", value: lowest },
            ...(average == null ? [] : [{ label: "Average", value: average }]),
          ]}
          label={`Due at each day end, ${formatRange(from, to)}`}
          readout={points.map((p) => `${p.label}: ${format(p.amount)}`)}
        />
      )}
      <dl
        aria-label="Due trend"
        className="grid grid-cols-2 gap-3 rounded-lg border p-3 lg:grid-cols-5"
      >
        {stats.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
