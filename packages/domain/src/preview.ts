// UIDD §3 "What this will do": one row per balance an entry changes, built from the entry's
// `postEntry` effects (SRS §5) by the shared `effectRows` (D-061), so the preview can't drift
// from the books. Pure.
import { type Entry, type Partner, postEntry } from "./engine/post";
import { formatMonth } from "./dates";
import { type BillDates, type Card, billMonthOf } from "./engine/cards";
import { type EffectRow, type RowsContext, billOf, effectRows, overridesOf } from "./effect-rows";
import { format, splitEven } from "./money";

export type { Names } from "./effect-rows";

/** The preview of an unsaved entry, or null while it is incomplete (a needed pick is missing). */
export function previewEntry(
  entry: Entry | null,
  ctx: RowsContext,
  partners: Partner[] = [],
): EffectRow[] | null {
  if (!entry) return null;
  try {
    return effectRows(postEntry(entry, partners), ctx, billOf(entry));
  } catch {
    return null; // postEntry throws "Missing …" until the form has what the rule needs
  }
}

/**
 * UIDD §4.3 (D-032): an EMI card purchase's preview, "5 × ৳4,347.33 · first in Nov 2026 bill".
 * The first bill month is the engine's own `billMonthOf` (SRS §6.3, overrides included) and the
 * parts its `splitEven`, so the preview can't drift from the card's bills. Null while incomplete.
 */
export function emiPreview(
  card: Card | undefined,
  date: string,
  total: number | null,
  months: number,
  billMonthOverride: string | null,
  overrides: BillDates[],
): { parts: number[]; firstBill: string; text: string } | null {
  if (!card || !date || !total || total <= 0 || !Number.isInteger(months) || months < 2)
    return null;
  const firstBill = billMonthOf(card, date, billMonthOverride, overridesOf(overrides, card.id));
  return {
    parts: splitEven(total, months),
    firstBill,
    text: `${installments(total, months)} · first in ${formatMonth(firstBill)} bill`,
  };
}

/** "5 × ৳4,347.33", naming the last part when the split leaves it different ("(last ৳33.35)"). */
export function installments(total: number, months: number) {
  const parts = splitEven(total, months);
  const [first, last] = [parts[0], parts[parts.length - 1]];
  return `${months} × ${format(first)}${last === first ? "" : ` (last ${format(last)})`}`;
}
