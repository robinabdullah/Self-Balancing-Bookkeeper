import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import type { Db, Tx } from "@mbl/db/client";
import {
  allocations,
  cardBillDates,
  cards,
  moneyEntries,
  monthCloses,
  people,
  purchaseLines,
  purchases,
  returnLines,
  returns,
  saleLines,
  sales,
} from "@mbl/db/schema";
import { dhakaToday } from "@mbl/domain/dates";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import { parse } from "@mbl/domain/money";
import { memo } from "../auth/memo";
import { DB } from "../db/db.module";

// Ref: src/server/books.ts. SRS §2 (task 4.1.1): the only path from the DB to the engine. Every
// fact row is loaded and mapped to the engine's types (money as integer poisha); `computeBooks`
// derives every balance from them on each request. Nothing here computes a balance.

const poisha = (text: string) => parse(text) as number;
const maybe = (text: string | null) => (text == null ? null : poisha(text));
const iso = (at: Date) => at.toISOString();

/** Lines grouped by their entry's id, in their stored order. */
function byEntry<T extends { of: string }>(rows: T[]): Map<string, Omit<T, "of">[]> {
  const out = new Map<string, Omit<T, "of">[]>();
  for (const { of, ...line } of rows) {
    const list = out.get(of) ?? [];
    list.push(line);
    out.set(of, list);
  }
  return out;
}

@Injectable()
export class BooksService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every fact row; `q` = the transaction when an action computes from the books (the close). */
  async loadBooksData(q: Tx | Db = this.db): Promise<BooksData> {
    const [
      purchaseRows,
      purchaseLineRows,
      saleRows,
      saleLineRows,
      returnRows,
      returnLineRows,
      moneyRows,
      partnerRows,
      allocationRows,
      closeRows,
      cardRows,
      billDateRows,
    ] = await Promise.all([
      q.select().from(purchases),
      q
        .select({
          of: purchaseLines.purchaseId,
          qty: purchaseLines.qty,
          unitCost: purchaseLines.unitCost,
        })
        .from(purchaseLines)
        .orderBy(asc(purchaseLines.createdAt), asc(purchaseLines.id)),
      q.select().from(sales),
      q
        .select({
          of: saleLines.saleId,
          qty: saleLines.qty,
          unitPrice: saleLines.unitPrice,
          unitCost: purchaseLines.unitCost,
        })
        .from(saleLines)
        .innerJoin(purchaseLines, eq(purchaseLines.id, saleLines.lotId))
        .orderBy(asc(saleLines.createdAt), asc(saleLines.id)),
      q.select().from(returns),
      q
        .select({
          of: returnLines.returnId,
          qty: returnLines.qty,
          unitAmount: returnLines.unitAmount,
          unitCost: purchaseLines.unitCost,
        })
        .from(returnLines)
        .innerJoin(purchaseLines, eq(purchaseLines.id, returnLines.lotId))
        .orderBy(asc(returnLines.createdAt), asc(returnLines.id)),
      q.select().from(moneyEntries),
      // Active partners in the forms' order (by name); the first takes the splitShares residual.
      q
        .select({ id: people.id, pct: people.profitSharePct })
        .from(people)
        .where(and(eq(people.kind, "partner"), eq(people.active, true)))
        .orderBy(asc(people.name)),
      q.select().from(allocations),
      q.select({ month: monthCloses.month }).from(monthCloses).orderBy(asc(monthCloses.month)),
      q
        .select({ id: cards.id, statementDay: cards.statementDay, dueDay: cards.dueDay })
        .from(cards),
      q.select().from(cardBillDates),
    ]);

    const purchaseLinesOf = byEntry(purchaseLineRows);
    const saleLinesOf = byEntry(saleLineRows);
    const returnLinesOf = byEntry(returnLineRows);

    const entries: StoredEntry[] = [
      ...purchaseRows.map((p): StoredEntry => ({
        table: "purchase",
        id: p.id,
        date: p.date,
        createdAt: iso(p.createdAt),
        reversesId: p.reversesId,
        source: p.source,
        cardId: p.cardId,
        supplierId: p.supplierId,
        customerId: p.customerId,
        emiMonths: p.emiMonths,
        billMonthOverride: p.billMonthOverride,
        lines: (purchaseLinesOf.get(p.id) ?? []).map((l) => ({
          qty: l.qty,
          unitCost: poisha(l.unitCost),
        })),
      })),
      ...saleRows.map((s): StoredEntry => ({
        table: "sale",
        id: s.id,
        date: s.date,
        createdAt: iso(s.createdAt),
        reversesId: s.reversesId,
        customerId: s.customerId,
        lines: (saleLinesOf.get(s.id) ?? []).map((l) => ({
          qty: l.qty,
          unitPrice: poisha(l.unitPrice),
          unitCost: poisha(l.unitCost),
        })),
      })),
      ...returnRows.map((r): StoredEntry => ({
        table: "return",
        id: r.id,
        date: r.date,
        createdAt: iso(r.createdAt),
        reversesId: r.reversesId,
        kind: r.kind,
        customerId: r.customerId,
        cardId: r.cardId,
        supplierId: r.supplierId,
        refundTo: r.refundTo,
        reason: r.reason,
        lines: (returnLinesOf.get(r.id) ?? []).map((l) => ({
          qty: l.qty,
          unitAmount: poisha(l.unitAmount),
          unitCost: poisha(l.unitCost),
        })),
      })),
      ...moneyRows.map((m): StoredEntry => ({
        table: "money",
        id: m.id,
        date: m.date,
        createdAt: iso(m.createdAt),
        reversesId: m.reversesId,
        type: m.type,
        amount: poisha(m.amount),
        forMonth: m.forMonth,
        customerId: m.customerId,
        supplierId: m.supplierId,
        cardId: m.cardId,
        personId: m.personId,
        source: m.source,
        category: m.category,
        cardCharged: maybe(m.cardCharged),
        cashReceived: maybe(m.cashReceived),
        settleMode: m.settleMode,
        billMonthOverride: m.billMonthOverride,
        emiMonths: m.emiMonths,
        openingKind: m.openingKind,
      })),
    ].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );

    return {
      entries,
      partners: partnerRows.map((p) => ({ id: p.id, pct: Number(p.pct ?? 0) })),
      allocations: allocationRows.map((a) => ({
        month: a.month,
        personId: a.personId,
        kind: a.kind,
        basis: maybe(a.basis),
        ratePct: a.ratePct == null ? null : Number(a.ratePct),
        amount: poisha(a.amount),
      })),
      closed: closeRows.map((c) => c.month),
      cards: cardRows,
      billDates: billDateRows.map((b) => ({
        cardId: b.cardId,
        billMonth: b.billMonth,
        actualStatementDate: b.actualStatementDate,
        actualDueDate: b.actualDueDate,
      })),
    };
  }

  /**
   * The books as of `asOf` (default: today in Dhaka), with the data they came from. Loaded once
   * per page render (memo.ts; the layout's and the page's calls share it, D-032); every render
   * still computes them fresh.
   */
  loadBooks(asOf: string = dhakaToday()) {
    return memo(`books:${asOf}`, async () => {
      const data = await this.loadBooksData();
      return { data, books: computeBooks(data, asOf), asOf };
    });
  }
}
