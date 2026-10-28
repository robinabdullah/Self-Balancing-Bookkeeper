import { Injectable } from "@nestjs/common";
import { TYPE_LABEL } from "@mbl/domain/journal/labels";
import { addMonths, monthOf } from "@mbl/domain/dates";
import { computeBooks } from "@mbl/domain/engine/index";
import { type MonthlyPack, OTHERS, monthlyPack, packDates } from "@mbl/domain/monthly-pack";
import { setupNames } from "@mbl/domain/setup";
import { AccountReportsService, booksOn } from "../account-reports/account-reports.service";
import { BooksService } from "../books/books.service";
import { MonthsDataService } from "../months/months-data.service";
import { SetupDataService } from "../setup/setup-data.service";
import { ReportLinesService } from "./report-lines.service";
import { ReportsService } from "./reports.service";

// Ref: src/server/pack.ts (N-4.7). D-045 (UIDD §4.17): the Monthly partner pack for one month, as
// on its last day (today for this month). The screen, PDF, Excel and message all read this one
// loader.

export type PackView = { pack: MonthlyPack; names: Record<string, string> };

@Injectable()
export class PackService {
  constructor(
    private readonly books: BooksService,
    private readonly setup: SetupDataService,
    private readonly months: MonthsDataService,
    private readonly reports: AccountReportsService,
    private readonly sales: ReportsService,
    private readonly lines: ReportLinesService,
  ) {}

  /** The months a pack exists for: the opening month to this month (none without entries). */
  async packMonths() {
    const { data, asOf } = await this.books.loadBooks();
    const first = data.entries[0]?.date;
    return { first: first ? monthOf(first) : null, last: monthOf(asOf), closed: data.closed };
  }

  /** `?month=` when it is a month with a pack (the opening month to this month), else null. */
  async packMonth(asked: string | undefined): Promise<string | null> {
    if (!asked || !/^\d{4}-(0[1-9]|1[0-2])$/.test(asked)) return null;
    const { first, last } = await this.packMonths();
    return first && asked >= first && asked <= last ? asked : null;
  }

  async loadPack(month: string): Promise<PackView> {
    const [{ data, books, asOf }, setup, typeOf] = await Promise.all([
      this.books.loadBooks(),
      this.setup.loadSetup(),
      this.reports.typeOfEntries(),
    ]);
    const { start, end, before } = packDates(month, asOf);
    const closed = new Set(data.closed.map(monthOf));
    const [snapshots, { report: sales }, stockLines] = await Promise.all([
      this.months.loadSnapshots([month, addMonths(month, -1)].filter((m) => closed.has(m))),
      this.sales.loadSales(start, end),
      this.lines.loadStockLines(end),
    ]);
    const first = data.entries[0]?.date;
    const pack = monthlyPack({
      month,
      today: asOf,
      firstMonth: first ? monthOf(first) : null,
      books,
      atStart: computeBooks(data, before),
      atEnd: booksOn(data, books, asOf, end),
      snapshots,
      allocations: data.allocations,
      closed: data.closed,
      sales,
      stockLines,
      typeOf,
      typeLabel: (t) => TYPE_LABEL[t] ?? t,
    });
    return { pack, names: { ...setupNames(setup), [OTHERS]: "Other customers" } };
  }
}
