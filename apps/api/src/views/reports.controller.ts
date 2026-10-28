import { Controller, Get, NotFoundException, Query } from "@nestjs/common";
import { parseRange } from "@mbl/domain/journal-filter";
import { defaultPackMonth } from "@mbl/domain/monthly-pack";
import { peopleRows } from "@mbl/domain/people-view";
import { rowId } from "@mbl/domain/validation/fields";
import { AccountReportsService } from "../account-reports/account-reports.service";
import { BooksService } from "../books/books.service";
import { JournalService } from "../journal/journal.service";
import { PackService } from "../reports/pack.service";
import { ReportsService } from "../reports/reports.service";
import { SetupDataService } from "../setup/setup-data.service";

// N-4.7 (design rule 6): the Reports pages' reads: Cash book, Sales, Investor and the Monthly
// pack. The page keeps its day/range logic and passes plain `from`/`to`/`month`/`person`; a bad
// period, person or month is a 404 (the pages' own notFound cases). Ref: the `reports/{cash,
// sales,investor,pack}` pages.

type Period = { from?: string; to?: string };

function period(q: Period) {
  const range = parseRange(q);
  if (!range) throw new NotFoundException();
  return range;
}

@Controller("views")
export class ReportViewsController {
  constructor(
    private readonly books: BooksService,
    private readonly setup: SetupDataService,
    private readonly journal: JournalService,
    private readonly reports: ReportsService,
    private readonly investor: AccountReportsService,
    private readonly pack: PackService,
  ) {}

  /** D-043 (UIDD §4.17): the Cash book for a day or a range, with each row's label. */
  @Get("reports/cash")
  async cash(@Query() q: Period) {
    const { from, to } = period(q);
    return this.reports.loadCashBook(from, to);
  }

  /** D-043 (UIDD §4.17): the Sales report for a period. */
  @Get("reports/sales")
  async sales(@Query() q: Period) {
    const { from, to } = period(q);
    const [{ report, names }, journal] = await Promise.all([
      this.reports.loadSales(from, to),
      this.journal.loadJournal(),
    ]);
    return { report, names, first: journal.at(-1)?.date ?? null };
  }

  /**
   * D-045 (UIDD §4.17): without `person`, the investors and partners (active, or still holding
   * capital, profit owed or a difference); with one, their report for whole months.
   */
  @Get("reports/investor")
  async investorReport(@Query() q: Period & { person?: string }) {
    if (q.person === undefined) {
      const [{ books }, setup] = await Promise.all([
        this.books.loadBooks(),
        this.setup.loadSetup(),
      ]);
      const rows = peopleRows(setup.people, books).filter(
        (p) => p.active || p.capital !== 0 || p.profitOwed !== 0 || p.openingDifference != null,
      );
      return { kind: "list" as const, rows };
    }
    if (!rowId.safeParse(q.person).success) throw new NotFoundException();
    const { from, to } = period(q);
    const [report, journal] = await Promise.all([
      this.investor.loadInvestorReport(q.person, from, to),
      this.journal.loadJournal(),
    ]);
    if (!report) throw new NotFoundException();
    return { kind: "report" as const, report, first: journal.at(-1)?.date ?? null };
  }

  /**
   * D-045 (UIDD §4.17): the Monthly partner pack for `month` (the latest closed month by default,
   * else last month). No months yet is empty; a month outside the opening…this month is a 404.
   */
  @Get("reports/pack")
  async monthlyPack(@Query() q: { month?: string }) {
    const { first, last, closed } = await this.pack.packMonths();
    if (!first) return { empty: true as const };
    const month = q.month
      ? await this.pack.packMonth(q.month)
      : defaultPackMonth(closed, first, last);
    if (!month) throw new NotFoundException();
    const { pack, names } = await this.pack.loadPack(month);
    return { empty: false as const, first, month, pack, names };
  }
}

export type CashReportView = Awaited<ReturnType<ReportViewsController["cash"]>>;
export type SalesReportView = Awaited<ReturnType<ReportViewsController["sales"]>>;
export type InvestorReportView = Awaited<ReturnType<ReportViewsController["investorReport"]>>;
export type PackReportView = Awaited<ReturnType<ReportViewsController["monthlyPack"]>>;
