import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { purchaseLines, purchases } from "@/db/schema";
import type { StockLot } from "@mbl/domain/engine/stock";
import { parse } from "@mbl/domain/money";
import { stockLots } from "@/server/stock";

// What the return form picks from (UIDD §4.5): the bill lines of sales that weren't reversed,
// with what each can still give back, and the lots with stock, with their purchase's source and
// counterparty (the refund target's default, SRS §4). The action checks it all again on save.

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
  source: (typeof purchases.$inferSelect)["source"];
  supplierId: string | null;
  cardId: string | null;
  customerId: string | null;
};

/** `exceptReturnId`: an edit, so that return's own units count as still to return / in stock. */
export async function returnOptions(
  exceptReturnId?: string,
): Promise<{ lines: BillLine[]; lots: ReturnLot[] }> {
  const except = exceptReturnId ? sql`and r.id <> ${exceptReturnId}` : sql``;
  const [rows, lots] = await Promise.all([
    db.execute<{
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
      where s.reverses_id is null
        and not exists (select 1 from sales x where x.reverses_id = s.id)
      order by s.date desc, s.created_at desc, sl.created_at`),
    stockLots(db, { exceptReturnId }).then((all) => all.filter((l) => l.remaining > 0)),
  ]);
  const sources = lots.length
    ? await db
        .select({
          lotId: purchaseLines.id,
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
  return {
    lines: rows.map((r) => ({
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
    })),
    lots: lots.map((l) => ({ ...l, ...bySource.get(l.id)! })),
  };
}
