import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { purchaseLines, purchases } from "@mbl/db/schema";
import type { StockLot } from "@mbl/domain/engine/stock";
import { parse } from "@mbl/domain/money";
import { rowId } from "@mbl/domain/validation/fields";
import { DB } from "../db/db.module";
import { stockLots } from "../stock/lots";

// Ref: src/server/returns.ts (N-4.3, CR-051).
// What the return form picks from (UIDD §4.5): the bill lines of sales that weren't reversed,
// with what each can still give back, and the lots with stock, with their purchase's source and
// counterparty (the refund target's default, SRS §4). The action checks it all again on save.
// D-074: from an entry sheet, only that purchase's lots, or that sale's lines.

/** A sale line (one per lot); `left` = qty − already returned. Money in poisha. */
export type BillLine = {
  id: string;
  saleId: string;
  date: string;
  customerId: string;
  modelId: string;
  lotDate: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  left: number;
};

export type ReturnLot = StockLot & {
  purchaseId: string;
  source: (typeof purchases.$inferSelect)["source"];
  supplierId: string | null;
  cardId: string | null;
  customerId: string | null;
};

type Options = {
  /** An edit: that return's own units count as still to return / in stock. */
  exceptReturnId?: string;
  /** Only this purchase's lots (D-074: the form opened from its entry sheet). */
  purchaseId?: string;
  /** Only this sale's lines (D-074: is anything left to return on it?). */
  saleId?: string;
};

@Injectable()
export class ReturnOptionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The bill lines and the lots with stock (with their purchase's source and counterparty). */
  async returnOptions(opts: Options = {}): Promise<{ lines: BillLine[]; lots: ReturnLot[] }> {
    const { exceptReturnId, purchaseId } = opts;
    const [lines, lots] = await Promise.all([
      this.billLines(opts),
      stockLots(this.db, { exceptReturnId, purchaseId }).then((all) =>
        all.filter((l) => l.remaining > 0),
      ),
    ]);
    const sources = lots.length
      ? await this.db
          .select({
            lotId: purchaseLines.id,
            purchaseId: purchases.id,
            source: purchases.source,
            supplierId: purchases.supplierId,
            cardId: purchases.cardId,
            customerId: purchases.customerId,
          })
          .from(purchaseLines)
          .innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
          .where(
            inArray(
              purchaseLines.id,
              lots.map((l) => l.id),
            ),
          )
      : [];
    const bySource = new Map(sources.map(({ lotId, ...source }) => [lotId, source]));
    return { lines, lots: lots.map((l) => ({ ...l, ...bySource.get(l.id)! })) };
  }

  /** D-074: what an entry still has to return, by its id (a purchase's lots or a sale's lines). */
  leftToReturn(id: string): Promise<{ lines: BillLine[]; lots: ReturnLot[] }> {
    return rowId.safeParse(id).success
      ? this.returnOptions({ purchaseId: id, saleId: id })
      : Promise.resolve({ lines: [], lots: [] });
  }

  /** The lines of sales that stand, with what each can still give back. */
  private async billLines({ exceptReturnId, saleId }: Options): Promise<BillLine[]> {
    const except = exceptReturnId ? sql`and r.id <> ${exceptReturnId}` : sql``;
    const only = saleId ? sql`and s.id = ${saleId}` : sql``;
    const rows = await this.db.execute<{
      id: string;
      sale_id: string;
      date: string;
      customer_id: string;
      model_id: string;
      lot_date: string;
      qty: number;
      unit_price: string;
      unit_cost: string;
      returned: number;
    }>(sql`
      select sl.id, sl.sale_id, s.date::text as date, s.customer_id, l.model_id,
        p.date::text as lot_date, sl.qty, sl.unit_price, l.unit_cost,
        coalesce((select sum(rl.qty * case when r.reverses_id is null then 1 else -1 end)
          from return_lines rl join returns r on r.id = rl.return_id
          where rl.sale_line_id = sl.id ${except}), 0) as returned
      from sale_lines sl
      join sales s on s.id = sl.sale_id
      join purchase_lines l on l.id = sl.lot_id
      join purchases p on p.id = l.purchase_id
      where s.reverses_id is null ${only}
        and not exists (select 1 from sales x where x.reverses_id = s.id)
      order by s.date desc, s.created_at desc, sl.created_at`);
    return rows.map((r) => ({
      id: r.id,
      saleId: r.sale_id,
      date: r.date,
      customerId: r.customer_id,
      modelId: r.model_id,
      lotDate: r.lot_date,
      qty: Number(r.qty),
      unitPrice: parse(r.unit_price) as number,
      unitCost: parse(r.unit_cost) as number,
      left: Number(r.qty) - Number(r.returned),
    }));
  }
}
