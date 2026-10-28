import type { Posted } from "./engine/post";
import { add } from "./money";

// D-043 (UIDD §4.17): the Cash book, read off the posted entries' cash effects. Each entry that
// moved cash is one row (its cash effects summed; a reversal's are already negated, on its own
// date), in the order saved; each day runs from its opening to its closing cash. Only days with
// cash moves are listed. Pure; integer poisha.

export type CashRow = { id: string; date: string; amount: number; balance: number };
export type CashDay = { date: string; opening: number; rows: CashRow[]; closing: number };
export type CashBook = {
  from: string;
  to: string;
  opening: number;
  days: CashDay[];
  closing: number;
};

/** Date, then saved time, then id: the books' order. */
const saved = (a: Posted, b: Posted) =>
  a.date.localeCompare(b.date) ||
  a.createdAt.localeCompare(b.createdAt) ||
  a.id.localeCompare(b.id);

/** Every cash move from `from` to `to` (inclusive), each day with its opening and closing cash. */
export function cashBook(posted: Posted[], from: string, to: string): CashBook {
  let balance = 0;
  let opening = 0;
  const days: CashDay[] = [];
  for (const p of [...posted].sort(saved)) {
    if (p.date > to) break;
    const amount = p.effects
      .filter((e) => e.account === "cash")
      .reduce((s, e) => add(s, e.amount), 0);
    if (amount === 0) continue;
    if (p.date < from) {
      balance = add(balance, amount);
      opening = balance;
      continue;
    }
    let today = days.at(-1);
    if (today?.date !== p.date) {
      today = { date: p.date, opening: balance, rows: [], closing: balance };
      days.push(today);
    }
    balance = add(balance, amount);
    today.rows.push({ id: p.id, date: p.date, amount, balance });
    today.closing = balance;
  }
  return { from, to, opening, days, closing: balance };
}

/** A Cash book row's entry ("Payment in MR-0017", "Reversal of Expense") and who. */
export type CashLabel = { title: string; who: string };

/** "Payment in MR-0017 Rahman Telecom (Karim)": a Cash book row as the day book message reads it. */
export const cashLabel = (labels: Record<string, CashLabel>, id: string) =>
  [labels[id]?.title ?? "Entry", labels[id]?.who].filter(Boolean).join(" ");
