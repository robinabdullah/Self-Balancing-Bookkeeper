// The month dropdowns' options (UIDD §2, D-035). They mirror the guards, so every open month on
// offer passes `dateErrors`; the server still checks every save.
import { addMonths, formatMonth, monthDiff, monthOf } from "@/lib/dates";
import { type Calendar, closed } from "@/lib/guards";

export type MonthChoice = { value: string; label: string; closed: boolean };

function choices(months: string[], cal: Calendar | null, keep?: string | null): MonthChoice[] {
  const kept = keep ? monthOf(keep) : null;
  const list = kept && !months.includes(kept) ? [...months, kept] : months;
  return list.map((value) => ({
    value,
    label: formatMonth(value),
    closed: cal !== null && closed(value, cal.lastClosed),
  }));
}

/** `from` → `to` ("YYYY-MM"), oldest first. */
function span(from: string, to: string): string[] {
  return Array.from({ length: monthDiff(from, to) + 1 }, (_, i) => addMonths(from, i));
}

/**
 * For month (and the reverse dialog, with the reversal's date): the opening month → the date's
 * month, newest first; the last 12 months while there's no opening yet. Closed months are flagged
 * so the dropdown greys them. `keep` (the stored or default value) is always offered.
 */
export function forMonthChoices(cal: Calendar, date: string, keep?: string | null): MonthChoice[] {
  const to = monthOf(date);
  const from = cal.openingDate ? monthOf(cal.openingDate) : addMonths(to, -11);
  return choices(span(from, to), cal, keep).sort((a, b) => b.value.localeCompare(a.value));
}

/** Bill month: the month before the purchase → 4 months after it, in calendar order. */
export function billMonthChoices(date: string, keep?: string | null): MonthChoice[] {
  const month = monthOf(date);
  const list = choices(span(addMonths(month, -1), addMonths(month, 4)), null, keep);
  return list.sort((a, b) => a.value.localeCompare(b.value));
}
