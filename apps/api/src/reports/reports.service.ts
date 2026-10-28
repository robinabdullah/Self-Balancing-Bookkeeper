import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { purchaseLines, returnLines, returns, saleLines, sales } from "@mbl/db/schema";
import { entryTitle, reversalLabel, whoOf } from "@mbl/domain/journal/labels";
import { type CashBook, cashBook } from "@mbl/domain/cash-book";
import type { DatedLines } from "@mbl/domain/charts/profit";
import { parse } from "@mbl/domain/money";
import { type SalesReport, salesReport } from "@mbl/domain/sales-report";
import { setupNames } from "@mbl/domain/setup";
import { BooksService } from "../books/books.service";
import { DB } from "../db/db.module";
import { JournalService } from "../journal/journal.service";
import { SetupDataService } from "../setup/setup-data.service";

// Ref: src/server/reports.ts (N-4.5). D-043 (UIDD §4.17): what the Reports read. The Cash book
// comes off the books' posted entries (labelled from the Journal rows); the Sales report off the
// sale and customer-return lines, each joined to its lot for the model and the cost. Every figure
// ties out to `computeBooks`.

/** A Cash book row's entry ("Payment in MR-0017", "Reversal of Expense") and who. */
export type CashLabel = { title: string; who: string };

export type CashBookView = {
  book: CashBook;
  labels: Record<string, CashLabel>;
  /** The oldest entry's date (the stepper's first day). */
  first: string | null;
};

const poisha = (text: string) => parse(text) as number;

export type SalesView = { report: SalesReport; names: Record<string, string> };

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly books: BooksService,
    private readonly journal: JournalService,
    private readonly setup: SetupDataService,
  ) {}

  async loadCashBook(from: string, to: string): Promise<CashBookView> {
    const [{ books }, journal, setup] = await Promise.all([
      this.books.loadBooks(),
      this.journal.loadJournal(),
      this.setup.loadSetup(),
    ]);
    const book = cashBook(books.posted, from, to);
    const names = setupNames(setup);
    const rows = new Map(journal.map((r) => [r.id, r]));
    const labels: Record<string, CashLabel> = {};
    for (const { id } of book.days.flatMap((d) => d.rows)) {
      const row = rows.get(id);
      if (!row) continue;
      labels[id] = { title: reversalLabel(row, rows, entryTitle), who: whoOf(row, names) };
    }
    return { book, labels, first: journal.at(-1)?.date ?? null };
  }

  /** The sale and customer-return lines dated `from` … `to` (each joined to its lot for the model
   * and the cost); with `customerId`, only that customer's. */
  async loadSalesLines(from: string, to: string, customerId?: string): Promise<DatedLines> {
    const [soldRows, returnedRows] = await Promise.all([
      this.db
        .select({
          saleId: sales.id,
          date: sales.date,
          customerId: sales.customerId,
          reversesId: sales.reversesId,
          modelId: purchaseLines.modelId,
          qty: saleLines.qty,
          unitPrice: saleLines.unitPrice,
          unitCost: purchaseLines.unitCost,
        })
        .from(saleLines)
        .innerJoin(sales, eq(sales.id, saleLines.saleId))
        .innerJoin(purchaseLines, eq(purchaseLines.id, saleLines.lotId))
        .where(
          and(
            gte(sales.date, from),
            lte(sales.date, to),
            customerId ? eq(sales.customerId, customerId) : undefined,
          ),
        ),
      this.db
        .select({
          date: returns.date,
          customerId: returns.customerId,
          reversesId: returns.reversesId,
          modelId: purchaseLines.modelId,
          qty: returnLines.qty,
          unitAmount: returnLines.unitAmount,
          unitCost: purchaseLines.unitCost,
        })
        .from(returnLines)
        .innerJoin(returns, eq(returns.id, returnLines.returnId))
        .innerJoin(purchaseLines, eq(purchaseLines.id, returnLines.lotId))
        .where(
          and(
            eq(returns.kind, "customer"),
            gte(returns.date, from),
            lte(returns.date, to),
            customerId ? eq(returns.customerId, customerId) : undefined,
          ),
        ),
    ]);
    return {
      sold: soldRows.map((r) => ({
        ...r,
        unitPrice: poisha(r.unitPrice),
        unitCost: poisha(r.unitCost),
        reversal: r.reversesId != null,
      })),
      returned: returnedRows.map((r) => ({
        ...r,
        customerId: r.customerId ?? "",
        unitAmount: poisha(r.unitAmount),
        unitCost: poisha(r.unitCost),
        reversal: r.reversesId != null,
      })),
    };
  }

  /** The Sales report for a period; with `customerId`, only that customer's (D-045: their By
   * model under the statement is the Sales report's own figures). */
  async loadSales(from: string, to: string, customerId?: string): Promise<SalesView> {
    const [lines, setup] = await Promise.all([
      this.loadSalesLines(from, to, customerId),
      this.setup.loadSetup(),
    ]);
    return { report: salesReport(lines.sold, lines.returned), names: setupNames(setup) };
  }
}
