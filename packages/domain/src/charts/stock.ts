import { daysBetween } from "../dates";
import type { StockLot } from "../engine/stock";
import { topGroups } from "../monthly-pack";
import { add, mul } from "../money";
import type { SalesGroup } from "../sales-report";
import { type ModelStock, stockByModel } from "../stock-view";
import { TOP } from "./customers";

// D-064 (UIDD §4.17; clarified 2026-10-24): the Stock tab. Stock age is today's stock (the period
// row doesn't change it): each lot's units left and their value at cost, by its age = today − its
// purchase date. Every lot counts, a reversed one too, so Σ the ages' value = the Stock page's
// value = the books' stock; an age lists its models through `stockByModel`. Top models sold = the
// window's Sales report By model. Pure; integer poisha.

type AgeLot = StockLot & { imeiNote: string | null; source?: string };

/** The four ages: `key` = the first day (the `?age=` value), `to` = the last (none: 91 and on);
 * `short` = the chart's axis label (all four fit at 360 px). */
export const AGES = [
  { key: "0", label: "0–30 days", short: "0–30", to: 30 },
  { key: "31", label: "31–60 days", short: "31–60", to: 60 },
  { key: "61", label: "61–90 days", short: "61–90", to: 90 },
  { key: "91", label: "90+ days", short: "90+", to: Infinity },
] as const;

export type AgeKey = (typeof AGES)[number]["key"];

export type StockAge<L extends AgeLot> = {
  key: AgeKey;
  label: string;
  short: string;
  units: number;
  value: number;
  models: ModelStock<L>[];
};

export function stockAge<L extends AgeLot>(
  lots: L[],
  names: Record<string, string>,
  today: string,
): StockAge<L>[] {
  const left = lots.filter((l) => l.remaining !== 0);
  return AGES.map((a, n) => {
    const from = n === 0 ? -Infinity : AGES[n - 1].to + 1;
    const inAge = left.filter((l) => {
      const days = daysBetween(l.date, today);
      return days >= from && days <= a.to;
    });
    return {
      key: a.key,
      label: a.label,
      short: a.short,
      units: inAge.reduce((s, l) => s + l.remaining, 0),
      value: inAge.reduce((s, l) => add(s, mul(l.unitCost, l.remaining)), 0),
      models: stockByModel(inAge, names, { all: false, search: "" }),
    };
  });
}

export type StockCharts = {
  ages: StockAge<AgeLot>[];
  /** Σ the ages' value: the Stock page's value. */
  total: number;
  /** Stock from the opening is still left (the "Opening stock counts from" note). */
  opening: boolean;
  /** The top 10 by `by`, then "Other models". */
  top: SalesGroup[];
};

export function stockCharts(i: {
  lots: AgeLot[];
  names: Record<string, string>;
  today: string;
  /** The window's Sales report's By model. */
  byModel: SalesGroup[];
  by: "pieces" | "profit";
}): StockCharts {
  const ages = stockAge(i.lots, i.names, i.today);
  return {
    ages,
    total: ages.reduce((s, a) => add(s, a.value), 0),
    opening: i.lots.some((l) => l.source === "opening" && l.remaining !== 0),
    top: topGroups(i.byModel, TOP, i.by),
  };
}
