import { Injectable } from "@nestjs/common";
import { type ChartPeriod, chartPeriod } from "@mbl/domain/charts/period";
import { BooksService } from "../books/books.service";

// Ref: src/server/charts.ts (N-4.5: the period, for the customer's Due trend). D-064 (UIDD §4.17):
// what the Charts pages read. The window comes off the URL (`chartPeriod`), from the opening to
// today; each tab loads only what its charts need.

export type ChartsBase = { today: string; firstDate: string; period: ChartPeriod };

@Injectable()
export class ChartsService {
  constructor(private readonly books: BooksService) {}

  /** Today, the opening date and the window the URL asks for. */
  async loadChartPeriod(params: Parameters<typeof chartPeriod>[0]): Promise<ChartsBase> {
    const { data, asOf } = await this.books.loadBooks();
    const firstDate = data.entries[0]?.date ?? asOf;
    return { today: asOf, firstDate, period: chartPeriod(params, asOf, firstDate) };
  }
}
