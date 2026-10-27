import { Inject, Injectable } from "@nestjs/common";
import { desc } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { sales } from "@mbl/db/schema";
import { DB } from "../db/db.module";
import { stockLots } from "./lots";

// Ref: src/server/stock.ts (N-4.1), the read path's part: the Stock view's and the sale form's
// lots (lots.ts, shared with the write path) and the sale form's default customer.

@Injectable()
export class StockService {
  constructor(@Inject(DB) private readonly db: Db) {}

  lots(opts?: Parameters<typeof stockLots>[1]) {
    return stockLots(this.db, opts);
  }

  /** UIDD §4.4: the sale form's customer defaults to the last one used. */
  async lastSaleCustomerId(): Promise<string | null> {
    const [last] = await this.db
      .select({ id: sales.customerId })
      .from(sales)
      .orderBy(desc(sales.createdAt))
      .limit(1);
    return last?.id ?? null;
  }
}
