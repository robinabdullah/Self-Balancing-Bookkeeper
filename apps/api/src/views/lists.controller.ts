import { Controller, Get } from "@nestjs/common";
import { accountRows } from "@mbl/domain/accounts";
import { cardRows } from "@mbl/domain/card-view";
import { peopleRows } from "@mbl/domain/people-view";
import { setupNames } from "@mbl/domain/setup";
import { BooksService } from "../books/books.service";
import { SetupDataService } from "../setup/setup-data.service";
import { StockService } from "../stock/stock.service";

// N-4.4 (design rule 6): the list pages' reads, with their rows built here. Ref: the list
// page.tsx files under src/app/(app)/.
@Controller("views")
export class ListViewsController {
  constructor(
    private readonly books: BooksService,
    private readonly setup: SetupDataService,
    private readonly stock: StockService,
  ) {}

  /** UIDD §4.7 (task 4.2): every lot with what it has left (SRS §4), grouped by model. */
  @Get("stock")
  async stockView() {
    const [lots, setup] = await Promise.all([this.stock.lots(), this.setup.loadSetup()]);
    return { lots, names: setupNames(setup) };
  }

  /**
   * UIDD §4.8 (task 4.4.1): every card with its balance, Available ≈, next due and status
   * (SRS §6).
   */
  @Get("cards")
  async cardsView() {
    const [{ books }, setup] = await Promise.all([this.books.loadBooks(), this.setup.loadSetup()]);
    return { rows: cardRows(setup.cards, books.cards) };
  }

  /**
   * UIDD §4.8 (task 4.3.1): every customer with what they owe (from the books) and their last
   * entry.
   */
  @Get("customers")
  async customersView() {
    const [{ books }, setup] = await Promise.all([this.books.loadBooks(), this.setup.loadSetup()]);
    const rows = accountRows(
      setup.customers.map((c) => ({
        id: c.id,
        name: c.display,
        terms: [c.shopName, c.proprietorName, c.phone],
        badge: c.active ? undefined : "Inactive",
      })),
      books.customers,
    );
    return { rows };
  }

  /**
   * UIDD §4.8 (task 4.3.2): every supplier with what we owe them (from the books) and their
   * last entry.
   */
  @Get("suppliers")
  async suppliersView() {
    const [{ books }, setup] = await Promise.all([this.books.loadBooks(), this.setup.loadSetup()]);
    const rows = accountRows(
      setup.suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        terms: [s.name, s.phone],
        badge: s.active ? undefined : "Inactive",
      })),
      books.suppliers,
    );
    return { rows };
  }

  /** UIDD §4.8 (task 4.5): every partner and investor with their capital and profit owed. */
  @Get("people")
  async peopleView() {
    const [{ books }, setup] = await Promise.all([this.books.loadBooks(), this.setup.loadSetup()]);
    return { rows: peopleRows(setup.people, books) };
  }
}

export type StockView = Awaited<ReturnType<ListViewsController["stockView"]>>;
export type CardsView = Awaited<ReturnType<ListViewsController["cardsView"]>>;
export type CustomersView = Awaited<ReturnType<ListViewsController["customersView"]>>;
export type SuppliersView = Awaited<ReturnType<ListViewsController["suppliersView"]>>;
export type PeopleView = Awaited<ReturnType<ListViewsController["peopleView"]>>;
