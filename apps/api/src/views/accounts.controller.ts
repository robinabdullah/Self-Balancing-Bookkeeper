import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import {
  type StatementRange,
  billProfit,
  statementLines,
  statementRange,
  statementRowsOf,
} from "@mbl/domain/accounts";
import { cardDetail, cardRows, emiLabel } from "@mbl/domain/card-view";
import { dueTrend } from "@mbl/domain/charts/customers";
import { standing } from "@mbl/domain/charts/kinds";
import { aboveTarget } from "@mbl/domain/engine/customers";
import { parseRange } from "@mbl/domain/journal-filter";
import { entryLabels, otherSide } from "@mbl/domain/journal/labels";
import { parse } from "@mbl/domain/money";
import { peopleRows, personDetail } from "@mbl/domain/people-view";
import { setupNames } from "@mbl/domain/setup";
import { rowId } from "@mbl/domain/validation/fields";
import { AccountReportsService } from "../account-reports/account-reports.service";
import { AccountsService } from "../accounts/accounts.service";
import { BooksService } from "../books/books.service";
import { CardDetailService } from "../cards/card-detail.service";
import { ChartsService } from "../charts/charts.service";
import { JournalService } from "../journal/journal.service";
import { SetupDataService } from "../setup/setup-data.service";

// N-4.5 (design rule 6): the account pages' reads. The statement lines come labelled and the
// period's totals without its lines, so the label map never crosses to web. `?from=&to=` is the
// page's period (`parseRange`); an unknown or malformed id is a 404. Ref: the `[id]/page.tsx` of
// customers, suppliers, people and cards, and customers/[id]/trend/page.tsx.

type Range = { from?: string; to?: string };
type Labels = Map<string, string>;

const labelled = <T extends { entryId: string }>(lines: T[], labels: Labels) =>
  lines.map((l) => ({ ...l, label: labels.get(l.entryId) ?? "Entry" }));

/** A period's opening, totals and closing; its lines go separately, labelled. */
const totals = (r: StatementRange): Omit<StatementRange, "lines"> => ({
  opening: r.opening,
  up: r.up,
  down: r.down,
  closing: r.closing,
});

function known(id: string) {
  if (!rowId.safeParse(id).success) throw new NotFoundException();
}

function found<T>(row: T | undefined): T {
  if (!row) throw new NotFoundException();
  return row;
}

@Controller("views")
export class AccountViewsController {
  constructor(
    private readonly books: BooksService,
    private readonly setup: SetupDataService,
    private readonly journal: JournalService,
    private readonly accounts: AccountsService,
    private readonly cards: CardDetailService,
    private readonly reports: AccountReportsService,
    private readonly charts: ChartsService,
  ) {}

  /**
   * UIDD §4.8 (task 4.3.1): a customer's contact, balance (+ "Above target"), statement with a
   * running balance, and the Bills tab with each bill's lines and profit.
   */
  @Get("customers/:id")
  async customer(@Param("id") id: string, @Query() q: Range) {
    known(id);
    const [{ books }, setup, journal, bills] = await Promise.all([
      this.books.loadBooks(),
      this.setup.loadSetup(),
      this.journal.loadJournal(),
      this.accounts.customerBills(id),
    ]);
    const customer = found(setup.customers.find((c) => c.id === id));
    const balance = books.customers[id]?.balance ?? 0;
    const target = customer.targetBalance == null ? null : parse(customer.targetBalance);
    const range = parseRange(q);
    const period = range && statementRange(books.customers[id]?.rows ?? [], range.from, range.to);
    return {
      customer,
      balance,
      above: aboveTarget(balance, target),
      lines: labelled(
        period ? period.lines : statementLines(books.customers[id]),
        entryLabels(journal),
      ),
      period: period && totals(period),
      bills: bills.map((b) => ({
        ...b,
        profit: billProfit(books.posted.find((p) => p.id === b.id)),
      })),
      names: setupNames(setup),
      first: journal.at(-1)?.date ?? null,
    };
  }

  /**
   * D-064 (UIDD §4.17): a customer's Due trend: the due at each day end with its figures, then the
   * window's statement. Walk-in has none.
   */
  @Get("customers/:id/trend")
  async trend(
    @Param("id") id: string,
    @Query() q: { period?: string; from?: string; to?: string },
  ) {
    known(id);
    const [base, { data, books }, setup, journal] = await Promise.all([
      this.charts.loadChartPeriod(q),
      this.books.loadBooks(),
      this.setup.loadSetup(),
      this.journal.loadJournal(),
    ]);
    const customer = found(setup.customers.find((c) => c.id === id && !c.isSystem));
    const { today, period } = base;
    const rows = books.customers[id]?.rows ?? [];
    const payments = standing(data.entries, "customer_payment")
      .filter((e) => e.table === "money" && e.customerId === id)
      .map((e) => e.date);
    const range = statementRange(rows, period.from, period.to);
    return {
      ...base,
      name: customer.display,
      trend: dueTrend(rows, period.from, period.to, today, payments),
      lines: labelled(range.lines, entryLabels(journal)),
      range: totals(range),
    };
  }

  /** UIDD §4.8 (task 4.3.2): a supplier's phone, what we owe them and the statement. */
  @Get("suppliers/:id")
  async supplier(@Param("id") id: string, @Query() q: Range) {
    known(id);
    const [{ books }, setup, journal] = await Promise.all([
      this.books.loadBooks(),
      this.setup.loadSetup(),
      this.journal.loadJournal(),
    ]);
    const supplier = found(setup.suppliers.find((s) => s.id === id));
    const range = parseRange(q);
    const period = range && statementRange(books.suppliers[id]?.rows ?? [], range.from, range.to);
    return {
      supplier,
      balance: books.suppliers[id]?.balance ?? 0,
      lines: labelled(
        period ? period.lines : statementLines(books.suppliers[id]),
        entryLabels(journal),
      ),
      period: period && totals(period),
      first: journal.at(-1)?.date ?? null,
    };
  }

  /**
   * UIDD §4.8 (task 4.5): a partner's or investor's capital history, cards supplied and profit
   * (allocated per month, paid and reinvested).
   */
  @Get("people/:id")
  async person(@Param("id") id: string, @Query() q: Range) {
    known(id);
    const [{ data, books, asOf }, setup, journal] = await Promise.all([
      this.books.loadBooks(),
      this.setup.loadSetup(),
      this.journal.loadJournal(),
    ]);
    const person = found(setup.people.find((p) => p.id === id));
    const [row] = peopleRows([person], books);
    const byId = new Map(journal.map((r) => [r.id, r]));
    const labels = entryLabels(journal, otherSide(setupNames(setup), "person")); // D-060
    const detail = personDetail(id, books, data.allocations, asOf, (e) => byId.get(e)?.type);
    const range = parseRange(q);
    const period =
      range && statementRange(statementRowsOf("person", id, books, asOf), range.from, range.to);
    const inRange = <T extends { date: string }>(lines: T[]) =>
      range ? lines.filter((l) => l.date >= range.from && l.date <= range.to) : lines;
    return {
      person,
      row,
      capital: labelled(period ? period.lines : detail.capital, labels),
      period: period && totals(period),
      cards: cardRows(
        setup.cards.filter((c) => c.ownerPersonId === id),
        books.cards,
      ),
      profit: detail.profit,
      allocations: detail.allocations,
      profitMoves: labelled(inRange(detail.profitMoves), labels),
      first: journal.at(-1)?.date ?? null,
    };
  }

  /**
   * UIDD §4.8 (task 4.4.2): a card's facts, its bills (or a period's, D-045), charges and credits
   * (or a period's statement) and EMI plans.
   */
  @Get("cards/:id")
  async card(@Param("id") id: string, @Query() q: Range) {
    known(id);
    const range = parseRange(q);
    const [{ books, asOf }, setup, journal, extra, cardReport] = await Promise.all([
      this.books.loadBooks(),
      this.setup.loadSetup(),
      this.journal.loadJournal(),
      this.cards.cardDetailData(id),
      range ? this.reports.loadStatementExtras("card", id, range.from, range.to) : null,
    ]);
    const card = found(setup.cards.find((c) => c.id === id));
    const [row] = cardRows([card], books.cards);
    const summary = books.cards[id];
    const { bills, moves, emiPlans } = cardDetail(summary);
    const labels = entryLabels(journal, otherSide(setupNames(setup), "card")); // D-060
    const label = (entryId: string) => labels.get(entryId) ?? "Entry";
    const emi = new Map(emiPlans.map((p) => [p.entryId, p]));
    const period =
      range && statementRange(statementRowsOf("card", id, books, asOf), range.from, range.to);
    return {
      card,
      row,
      summary: {
        dueWithin7Days: summary?.dueWithin7Days ?? 0,
        unbilled: summary?.unbilled ?? 0,
        remainingEmi: summary?.remainingEmi ?? 0,
      },
      bills,
      periodBills: cardReport?.kind === "card" ? cardReport : null,
      billDates: extra.billDates,
      moves: moves.map((m) => {
        const plan = m.billMonth ? emi.get(m.entryId) : undefined;
        return { ...m, label: label(m.entryId), emi: plan && emiLabel(plan, m.billMonth!) };
      }),
      lines: period ? labelled(period.lines, labels) : [],
      period: period && totals(period),
      plans: emiPlans.map((p) => ({ ...p, label: extra.emiItems[p.entryId] ?? label(p.entryId) })),
      today: asOf,
      first: journal.at(-1)?.date ?? null,
    };
  }
}

export type CustomerView = Awaited<ReturnType<AccountViewsController["customer"]>>;
export type CustomerTrendView = Awaited<ReturnType<AccountViewsController["trend"]>>;
export type SupplierView = Awaited<ReturnType<AccountViewsController["supplier"]>>;
export type PersonView = Awaited<ReturnType<AccountViewsController["person"]>>;
export type CardView = Awaited<ReturnType<AccountViewsController["card"]>>;
