import { Controller, Get, Param } from "@nestjs/common";
import { cardAlerts, cardDues, topDues } from "@mbl/domain/dashboard";
import { monthOf } from "@mbl/domain/dates";
import { parse } from "@mbl/domain/money";
import { setupNames } from "@mbl/domain/setup";
import { BooksService } from "../books/books.service";
import { JournalService } from "../journal/journal.service";
import { SetupDataService } from "../setup/setup-data.service";
import { StockService } from "../stock/stock.service";

// N-4.2 (design rule 6): one read per page, with what the page's JSX shows. The derivations that
// need the whole books run here, so only the shown values cross to web. Ref:
// src/app/(app)/page.tsx, src/app/(app)/journal/page.tsx, src/components/journal/entry-overlay.tsx.
@Controller("views")
export class HomeViewsController {
  constructor(
    private readonly books: BooksService,
    private readonly setup: SetupDataService,
    private readonly stock: StockService,
    private readonly journal: JournalService,
  ) {}

  /**
   * UIDD §4.2 (task 4.1.2–3): the engine's numbers as of today. Every amount comes from
   * `computeBooks` (via `loadBooks`); stock units from the lots' remaining qty.
   */
  @Get("home")
  async home() {
    const [{ books, asOf }, setup, lots, journal] = await Promise.all([
      this.books.loadBooks(),
      this.setup.loadSetup(),
      this.stock.lots(),
      this.journal.loadJournal(),
    ]);
    const month = monthOf(asOf);
    const targets = Object.fromEntries(
      setup.customers.map((c) => [c.id, c.targetBalance == null ? null : parse(c.targetBalance)]),
    );
    return {
      asOf,
      books: {
        cash: books.cash,
        firstNegativeCash: books.firstNegativeCash,
        stock: books.stock,
        customerDues: books.customerDues,
        supplierDues: books.supplierDues,
        openingDifference: {
          resolved: books.openingDifference.resolved,
          total: books.openingDifference.total,
        },
      },
      units: lots.reduce((n, l) => n + l.remaining, 0),
      dues: cardDues(books.cards),
      profit: books.months.find((m) => m.month === month)?.profit ?? 0,
      alerts: cardAlerts(books.cards, asOf),
      cards: setup.cards.map((c) => ({ id: c.id, name: c.name })),
      topDues: topDues(books.customers, targets),
      recent: journal.slice(0, 10),
      names: setupNames(setup),
    };
  }

  /** UIDD §4.10 (task 3.8, D-032): every entry; the filters live in web's URL. */
  @Get("journal")
  async journalView() {
    const [rows, data] = await Promise.all([this.journal.loadJournal(), this.setup.loadSetup()]);
    const people = [
      ...data.customers.map((c) => ({ id: c.id, label: c.display, hint: "Customer" })),
      ...data.suppliers.map((s) => ({ id: s.id, label: s.name, hint: "Supplier" })),
      ...data.cards.map((c) => ({ id: c.id, label: c.display, hint: "Card" })),
      ...data.people.map((p) => ({ id: p.id, label: p.name, hint: "Person" })),
    ];
    const oldest = rows.at(-1)?.date;
    return {
      rows,
      names: setupNames(data),
      people,
      firstMonth: oldest ? monthOf(oldest) : null,
    };
  }

  /**
   * D-032: an entry's detail sheet over any page that lists entries (null: it no longer exists).
   * D-061: the entry as the books hold it (and its original, for a reversal) feeds "What it did".
   */
  @Get("entry/:id")
  async entry(@Param("id") id: string) {
    const [entry, setup, { data }] = await Promise.all([
      this.journal.loadEntry(id),
      this.setup.loadSetup(),
      this.books.loadBooks(),
    ]);
    if (!entry) return null;
    const stored = data.entries.find((e) => e.id === id);
    const original = stored?.reversesId && data.entries.find((e) => e.id === stored.reversesId);
    return {
      entry,
      names: setupNames(setup),
      posting: stored
        ? {
            entry: stored,
            original: original || null,
            reversed: !!entry.row.reversedBy,
            partners: data.partners,
          }
        : null,
      cards: data.cards,
      billDates: data.billDates,
    };
  }
}

export type HomeView = Awaited<ReturnType<HomeViewsController["home"]>>;
export type JournalView = Awaited<ReturnType<HomeViewsController["journalView"]>>;
export type EntryView = Awaited<ReturnType<HomeViewsController["entry"]>>;
