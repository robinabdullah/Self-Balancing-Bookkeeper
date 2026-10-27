// Write guards (SRS §3, §7, §8; D-003, D-005, D-009). Pure: the server action passes in today,
// the opening date, the last closed month and the dependent facts it read from the DB. Each guard
// returns field → message (UIDD §5 wording); `{}` = allowed. `form` is a whole-form error.
import { formatDate, formatMonth, monthOf } from "@/lib/dates";

export type Errors = Record<string, string>;

/** `lastClosed` = the latest closed month ("YYYY-MM"); months close in order (SRS §7). */
export type Calendar = { today: string; openingDate: string | null; lastClosed: string | null };

/** `forMonth` is "YYYY-MM" or the stored 1st "YYYY-MM-01". */
type Dated = { date: string; forMonth?: string | null };

/** An entry row: a reversal has `reversesId` (SRS §8). */
type Linked = Record<string, unknown> & { reversesId?: unknown };

/** What depends on a row: a reversal of it, or sales/returns of its lots or lines. */
type Dependents = { reversed: boolean; hasDependents: boolean };

export const closed = (month: string, lastClosed: string | null) =>
  lastClosed !== null && month <= lastClosed;

/**
 * Date checks for a new entry, an edited entry's new values, or a reversal (SRS §3, §7): no
 * future date, nothing before the opening, `for_month` ≤ the date's month (D-005), and neither
 * the date nor the for_month in a closed month. Opening items are dated the opening date.
 */
export function dateErrors(e: Dated, cal: Calendar): Errors {
  const errors: Errors = {};
  const month = monthOf(e.date);
  if (e.date > cal.today) errors.date = "Date can't be in the future";
  else if (cal.openingDate && e.date < cal.openingDate)
    errors.date = `Date is before the opening date (${formatDate(cal.openingDate)})`;
  else if (closed(month, cal.lastClosed))
    errors.date = `Date is in a closed month (${formatMonth(month)})`;

  if (e.forMonth) {
    const forMonth = monthOf(e.forMonth);
    if (cal.openingDate && forMonth < monthOf(cal.openingDate))
      errors.forMonth = `Month is before the opening month (${formatMonth(cal.openingDate)})`;
    else if (forMonth > month)
      errors.forMonth = `Month can't be after the date's month (${formatMonth(month)})`;
    else if (closed(forMonth, cal.lastClosed))
      errors.forMonth = `Month is closed (${formatMonth(forMonth)})`;
  }
  return errors;
}

/** Lock rule (SRS §7): month(date) or for_month ≤ the last closed month. */
export function isLocked(e: Dated, lastClosed: string | null): boolean {
  return (
    closed(monthOf(e.date), lastClosed) || (!!e.forMonth && closed(monthOf(e.forMonth), lastClosed))
  );
}

/** Locked rows can't be edited or deleted; they can be reversed (SRS §7, §8). */
export function editErrors(e: Dated, lastClosed: string | null): Errors {
  if (!isLocked(e, lastClosed)) return {};
  const month = closed(monthOf(e.date), lastClosed) ? e.date : (e.forMonth as string);
  return { form: `This entry is in a closed month (${formatMonth(month)}) — reverse it instead` };
}

/** Reverse eligibility (SRS §8, D-003): at most once, never a reversal, no dependents. */
export function reverseErrors(original: Linked, deps: Dependents): Errors {
  if (original.reversesId)
    return { form: "A reversal can't be reversed — delete it, or enter the original again" };
  if (deps.reversed) return { form: "This entry is already reversed" };
  if (deps.hasDependents) return { form: "Other entries depend on this one — reverse them first" };
  return {};
}

/** D-026: a reversal, and an entry that has one, can't be edited, so the pair always cancels. */
export function pairEditErrors(e: Linked, reversed: boolean): Errors {
  if (e.reversesId) return { form: "A reversal can't be edited — delete it and reverse again" };
  if (reversed) return { form: "A reversed entry can't be edited — delete the reversal first" };
  return {};
}

/**
 * The reversal's default date (SRS §8): the original's date and for_month while both are open, so
 * the two cancel in the same month; otherwise today, with for_month = today's month.
 */
export function defaultReversal(
  original: Dated,
  cal: Calendar,
): { date: string; forMonth: string | null } {
  if (!isLocked(original, cal.lastClosed))
    return { date: original.date, forMonth: original.forMonth ? monthOf(original.forMonth) : null };
  return { date: cal.today, forMonth: original.forMonth ? monthOf(cal.today) : null };
}

/** The chosen reversal date: a valid open-month date, never before the original's (SRS §8). */
export function reversalDateErrors(original: Dated, reversal: Dated, cal: Calendar): Errors {
  if (reversal.date < original.date)
    return { date: `A reversal can't be dated before the original (${formatDate(original.date)})` };
  return dateErrors(reversal, cal);
}

/** Delete (SRS §8): open month only; not with a reversal or dependents (a used lot or line). */
export function deleteErrors(e: Dated, deps: Dependents, lastClosed: string | null): Errors {
  const locked = editErrors(e, lastClosed);
  if (locked.form) return locked;
  if (deps.reversed) return { form: "This entry has a reversal — delete the reversal first" };
  if (deps.hasDependents)
    return { form: "Other entries depend on this one — delete or reverse them first" };
  return {};
}

/**
 * A lot's unit_cost or qty can't change if any of its sales or returns falls in a closed month:
 * that would change a closed month's profit (SRS §8). `usedOn` = those sale/return dates.
 */
export function lotEditErrors(usedOn: string[], lastClosed: string | null): Errors {
  const hit = usedOn.map(monthOf).find((m) => closed(m, lastClosed));
  if (!hit) return {};
  return {
    form: `This lot has sales or returns in a closed month (${formatMonth(hit)}) — its cost and qty can't change`,
  };
}

/** Walk-in (D-009): not for a customer_offset purchase, a profit share or cash given. */
export function walkInErrors(
  e: { table: string; type?: string; source?: string | null; customerId?: string | null },
  walkInId: string,
): Errors {
  if (e.customerId !== walkInId) return {};
  const barred =
    (e.table === "purchase" && e.source === "customer_offset") ||
    (e.table === "money" &&
      (e.type === "customer_profit_share" || e.type === "customer_cash_given"));
  return barred ? { customerId: "Walk-in can't be used here — pick a customer" } : {};
}

/**
 * Close M (SRS §7 step 1, D-028): not already closed, not a month that hasn't started, and the
 * next month to close (the month after the last closed one, else the first month with entries),
 * so every earlier month with entries is closed. `next` comes from `nextToClose`.
 */
export function closeErrors(month: string, next: string, cal: Calendar): Errors {
  if (closed(month, cal.lastClosed)) return { form: `${formatMonth(month)} is already closed` };
  if (month > monthOf(cal.today)) return { form: `${formatMonth(month)} hasn't started` };
  if (month !== next) return { form: `Close ${formatMonth(next)} first` };
  return {};
}
