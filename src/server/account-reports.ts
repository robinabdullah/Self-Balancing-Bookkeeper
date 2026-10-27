import "server-only";
import type { StatementKind } from "@/lib/accounts";
import { type ModelRow, salesByModel } from "@/lib/by-model";
import { type EmiInstallment, billsIn, creditSplit, emiSchedule } from "@/lib/card-view";
import { type Books, type BooksData, computeBooks } from "@/lib/engine/index";
import type { Bill } from "@/lib/engine/cards";
import { type InvestorReport, dayBefore, investorReport } from "@/lib/investor-report";
import { setupNames } from "@/lib/setup";
import { loadBooks } from "@/server/books";
import { cardDetailData } from "@/server/cards";
import { loadJournal } from "@/server/journal";
import { loadPurchasesByModel } from "@/server/report-lines";
import { loadSales } from "@/server/reports";
import { loadSetup } from "@/server/setup";

// D-045: what the per-account reports add, read as on the period's last day (one "as on" rule):
// a card's bills, credit split and EMI schedule; a customer's or supplier's By model; the
// Investor report. The screen, PDF, Excel and message of each read the same loader.

/** The books as on `day` (the request's own books when that is today). */
export function booksOn(data: BooksData, books: Books, today: string, day: string): Books {
  return day >= today ? books : computeBooks(data, day);
}

const lastDay = (to: string, today: string) => (to < today ? to : today);

/** Each entry's Journal type ("card_payment", "profit_paid", …). */
export async function typeOfEntries() {
  const journal = await loadJournal();
  const types = new Map(journal.map((r) => [r.id, r.type]));
  return (entryId: string) => types.get(entryId);
}

export type CardExtras = {
  kind: "card";
  /** As on the period's last day. */
  end: string;
  facts: Pick<Books["cards"][string], "balance" | "nextDue" | "overdue" | "remainingEmi">;
  bills: Bill[];
  split: ReturnType<typeof creditSplit>;
  emi: { label: string; total: number; months: number; schedule: EmiInstallment[] }[];
};
export type ModelExtras = {
  kind: "customer" | "supplier";
  /** Customer: sales by model; supplier: bought from them by model. */
  byModel: ModelRow[];
  /** Customer: what we bought from them by model. */
  bought: ModelRow[];
};
export type StatementExtras = (CardExtras | ModelExtras) & { names: Record<string, string> };

/** D-045: a statement's additions for a period (none for a person). */
export async function loadStatementExtras(
  kind: StatementKind,
  id: string,
  from: string,
  to: string,
): Promise<StatementExtras | null> {
  if (kind === "person") return null;
  const setup = await loadSetup();
  const names = setupNames(setup);
  if (kind === "customer") {
    const [{ report }, bought] = await Promise.all([
      loadSales(from, to, id),
      loadPurchasesByModel({ customerId: id }, from, to),
    ]);
    return { kind, byModel: salesByModel(report), bought, names };
  }
  if (kind === "supplier") {
    const byModel = await loadPurchasesByModel({ supplierId: id }, from, to);
    return { kind, byModel, bought: [], names };
  }

  const [{ data, books, asOf }, extra, typeOf] = await Promise.all([
    loadBooks(),
    cardDetailData(id),
    typeOfEntries(),
  ]);
  const end = lastDay(to, asOf);
  const s = booksOn(data, books, asOf, end).cards[id];
  if (!s) return null;
  const firstBill = new Map(s.moves.map((m) => [m.entryId, m.billMonth]));
  return {
    kind,
    end,
    facts: {
      balance: s.balance,
      nextDue: s.nextDue,
      overdue: s.overdue,
      remainingEmi: s.remainingEmi,
    },
    bills: billsIn(s.bills, from, end),
    split: creditSplit(s.moves, from, end, typeOf),
    emi: s.emiPlans.map((p) => ({
      label: extra.emiItems[p.entryId] ?? "EMI purchase",
      total: p.total,
      months: p.months,
      schedule: emiSchedule(p, firstBill.get(p.entryId) ?? from.slice(0, 7), s.bills, end),
    })),
    names,
  };
}

/** D-045: the Investor / Partner report for whole months (`from` = a 1st, `to` = a last day). */
export async function loadInvestorReport(
  personId: string,
  from: string,
  to: string,
): Promise<InvestorReport | null> {
  const [{ data, books, asOf }, setup, typeOf] = await Promise.all([
    loadBooks(),
    loadSetup(),
    typeOfEntries(),
  ]);
  const person = setup.people.find((p) => p.id === personId);
  if (!person) return null;
  return investorReport({
    person,
    books,
    atEnd: booksOn(data, books, asOf, lastDay(to, asOf)),
    beforeFrom: computeBooks(data, dayBefore(from)),
    allocations: data.allocations,
    closed: data.closed,
    cards: setup.cards,
    from,
    to,
    today: asOf,
    typeOf,
  });
}
