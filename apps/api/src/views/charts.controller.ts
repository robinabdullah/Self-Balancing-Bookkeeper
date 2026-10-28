import { Controller, Get, Query } from "@nestjs/common";
import { CARD_FEES } from "@mbl/domain/charts/profit";
import { EXPENSE_CATEGORIES } from "@mbl/domain/validation/fields";
import { ChartsService } from "../charts/charts.service";

// N-4.8 (design rule 6): the Charts pages' reads, one view per tab (the tab page and the chart's
// detail page share it). The window comes off `period`/`from`/`to` (`chartPeriod`). A bad `cat`
// or `by` falls back as the pages did (no filter; sales / pieces); an unknown tab is no route,
// so a 404. Ref: the `reports/charts` pages.

type Window = { period?: string; from?: string; to?: string };

const CATEGORIES: string[] = [...EXPENSE_CATEGORIES, CARD_FEES];

@Controller("views")
export class ChartViewsController {
  constructor(private readonly charts: ChartsService) {}

  /** D-064 (UIDD §4.17): the Profit tab; `cat` filters the Expenses bars. */
  @Get("charts/profit")
  async profit(@Query() q: Window & { cat?: string }) {
    const base = await this.charts.loadChartPeriod(q);
    return this.charts.loadProfitCharts(
      base,
      q.cat && CATEGORIES.includes(q.cat) ? q.cat : undefined,
    );
  }

  /** D-064 (UIDD §4.17): the Money tab. */
  @Get("charts/money")
  async money(@Query() q: Window) {
    return this.charts.loadMoneyCharts(await this.charts.loadChartPeriod(q));
  }

  /** D-064 (UIDD §4.17): the Customers tab; `by` ranks the top customers (sales, or profit). */
  @Get("charts/customers")
  async customers(@Query() q: Window & { by?: string }) {
    const base = await this.charts.loadChartPeriod(q);
    return this.charts.loadCustomerCharts(base, q.by === "profit" ? "profit" : "sales");
  }

  /** D-064 (UIDD §4.17): the Stock tab; `by` ranks the top models (pieces, or profit). */
  @Get("charts/stock")
  async stock(@Query() q: Window & { by?: string }) {
    const base = await this.charts.loadChartPeriod(q);
    return this.charts.loadStockCharts(base, q.by === "profit" ? "profit" : "pieces");
  }
}

export type ProfitChartsView = Awaited<ReturnType<ChartViewsController["profit"]>>;
export type MoneyChartsView = Awaited<ReturnType<ChartViewsController["money"]>>;
export type CustomerChartsView = Awaited<ReturnType<ChartViewsController["customers"]>>;
export type StockChartsView = Awaited<ReturnType<ChartViewsController["stock"]>>;
