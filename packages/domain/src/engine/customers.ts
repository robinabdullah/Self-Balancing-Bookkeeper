// Customer and supplier dues (PRD §4.3, UIDD §4.8): each one's balance and a statement with a
// running balance (also a person's capital and profit owed, task 4.5). The amounts come only from
// `postEntry` effects (SRS §5). Pure; integer poisha.
import type { Posted } from "./post";
import { add, sub } from "../money";

/** One entry's signed change to the due, and the balance after it. */
export type StatementRow = { entryId: string; date: string; amount: number; balance: number };

/** A signed balance: a negative customer due = credit; a negative supplier due = an advance. */
export type Statement = { balance: number; rows: StatementRow[] };

/**
 * Statements per customer (`customer_due`), supplier (`supplier_due`) or person (`capital`,
 * `profit_owed`; the People view) id, from the entries dated on or before `asOf`, in date then
 * created_at order. Ids with no entries are left out.
 */
export function dueStatements(
  posted: Posted[],
  account: "customer_due" | "supplier_due" | "capital" | "profit_owed",
  asOf: string,
): Record<string, Statement> {
  const sorted = posted
    .filter((p) => p.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const out: Record<string, Statement> = {};
  for (const p of sorted) {
    for (const e of p.effects) {
      if (e.account !== account || !e.id) continue;
      const s = (out[e.id] ??= { balance: 0, rows: [] });
      s.balance = add(s.balance, e.amount);
      s.rows.push({ entryId: p.id, date: p.date, amount: e.amount, balance: s.balance });
    }
  }
  return out;
}

/** "Above target" = balance − target (≤ 0 is good); null when no target is set. */
export function aboveTarget(balance: number, target: number | null | undefined): number | null {
  return target == null ? null : sub(balance, target);
}
