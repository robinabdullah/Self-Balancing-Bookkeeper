// D-077 (UIDD §1): long lists show the newest 25 rows, then "Show 25 more" (the last batch says
// what is left). Display only: balances, counts and totals use every row.
export const PAGE = 25;

/** The first `n` rows, how many are hidden and how many the next tap adds. */
export function visibleRows<T>(rows: T[], n: number) {
  const shown = rows.slice(0, n);
  const hidden = rows.length - shown.length;
  return { shown, hidden, next: Math.min(PAGE, hidden) };
}
