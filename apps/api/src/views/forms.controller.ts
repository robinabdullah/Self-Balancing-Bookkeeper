import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import type { Db } from "@mbl/db/client";
import { loadCalendar } from "../action/runner";
import { BooksService } from "../books/books.service";
import { DB } from "../db/db.module";
import { EntriesService } from "../entries/entries.service";
import { ReturnOptionsService } from "../returns/return-options.service";
import { SetupDataService } from "../setup/setup-data.service";
import { StockService } from "../stock/stock.service";

// N-4.3 (design rule 6): the entry form pages' reads.
// Ref: src/app/(app)/{sales,purchases,returns,money}/**, src/server/returns.ts.
@Controller("views")
export class FormViewsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly books: BooksService,
    private readonly setup: SetupDataService,
    private readonly stock: StockService,
    private readonly entries: EntriesService,
    private readonly returnOptions: ReturnOptionsService,
  ) {}

  /** UIDD §4.4: the Setup pickers, the customers' dues and the lots with stock. */
  @Get("sales/new")
  async saleNew() {
    const [data, dues, lots, lastCustomerId] = await Promise.all([
      this.setup.loadSetup(),
      this.books.customerDues(),
      this.stock.lots(),
      this.stock.lastSaleCustomerId(),
    ]);
    return { data, dues, lots: lots.filter((l) => l.remaining > 0), lastCustomerId };
  }

  /** UIDD §3, §4.10: the stored bill; the lots count its own units as in stock (D-004). */
  @Get("sales/:id/edit")
  async saleEdit(@Param("id") id: string) {
    const edit = await this.entries.editValues("sale", id);
    if (!edit) throw new NotFoundException();
    const [data, dues, lots] = await Promise.all([
      this.setup.loadSetup(),
      this.books.customerDues(),
      this.stock.lots({ exceptSaleId: id }),
    ]);
    return { edit, data, dues, lots: lots.filter((l) => l.remaining > 0) };
  }

  /** UIDD §4.3: the Setup pickers, the customers' dues and the bill dates. */
  @Get("purchases/new")
  async purchaseNew() {
    const [data, dues, { data: books }] = await Promise.all([
      this.setup.loadSetup(),
      this.books.customerDues(),
      this.books.loadBooks(),
    ]);
    return { data, dues, billDates: books.billDates };
  }

  /** UIDD §3, §4.10: the stored purchase with the same pickers. */
  @Get("purchases/:id/edit")
  async purchaseEdit(@Param("id") id: string) {
    const edit = await this.entries.editValues("purchase", id);
    if (!edit) throw new NotFoundException();
    const [data, dues, { data: books }] = await Promise.all([
      this.setup.loadSetup(),
      this.books.customerDues(),
      this.books.loadBooks(),
    ]);
    return { edit, data, dues, billDates: books.billDates };
  }

  /** UIDD §4.5: the bill lines and lots the return picks from. */
  @Get("returns/new")
  async returnNew() {
    const [data, options] = await Promise.all([
      this.setup.loadSetup(),
      this.returnOptions.returnOptions(),
    ]);
    return { data, ...options };
  }

  /** UIDD §3, §4.10: the stored return; its own units count as still to return / in stock. */
  @Get("returns/:id/edit")
  async returnEdit(@Param("id") id: string) {
    const edit = await this.entries.editValues("return", id);
    if (!edit) throw new NotFoundException();
    const [data, options] = await Promise.all([
      this.setup.loadSetup(),
      this.returnOptions.returnOptions(id),
    ]);
    return { edit, data, ...options };
  }

  /** UIDD §4.6: the Setup pickers, the dues and owed balances, the bill dates and the calendar. */
  @Get("money/new")
  async moneyNew() {
    const [data, { dues, owed, billDates }, calendar] = await Promise.all([
      this.setup.loadSetup(),
      this.books.moneyFormBalances(),
      loadCalendar(this.db),
    ]);
    return { data, dues, owed, billDates, calendar };
  }

  /** UIDD §3, §4.10: the stored money entry (web checks its type is a form type). */
  @Get("money/:id/edit")
  async moneyEdit(@Param("id") id: string) {
    const edit = await this.entries.editValues("money", id);
    if (!edit) throw new NotFoundException();
    const [data, { dues, owed, billDates }, calendar] = await Promise.all([
      this.setup.loadSetup(),
      this.books.moneyFormBalances(),
      loadCalendar(this.db),
    ]);
    return { edit, data, dues, owed, billDates, calendar };
  }
}

export type SaleNewView = Awaited<ReturnType<FormViewsController["saleNew"]>>;
export type SaleEditView = Awaited<ReturnType<FormViewsController["saleEdit"]>>;
export type PurchaseNewView = Awaited<ReturnType<FormViewsController["purchaseNew"]>>;
export type PurchaseEditView = Awaited<ReturnType<FormViewsController["purchaseEdit"]>>;
export type ReturnNewView = Awaited<ReturnType<FormViewsController["returnNew"]>>;
export type ReturnEditView = Awaited<ReturnType<FormViewsController["returnEdit"]>>;
export type MoneyNewView = Awaited<ReturnType<FormViewsController["moneyNew"]>>;
export type MoneyEditView = Awaited<ReturnType<FormViewsController["moneyEdit"]>>;
