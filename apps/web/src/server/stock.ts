import "server-only";
import { type SQL, desc, sql } from "drizzle-orm";
import { db } from "@mbl/db";
import { type purchaseSource, sales } from "@mbl/db/schema";
import { type LotMove, type StockLot, lotsRemaining } from "@mbl/domain/engine/stock";
import { parse } from "@mbl/domain/money";
import type { Tx } from "@/server/action";

// Stock lots with what each has left (SRS §4), for the Stock view, the sale form and the sale
// action. A reversal purchase's lines are not lots; a reversed purchase's lots have 0 left.

/** Where a lot came from (UIDD §4.7): its IMEI/note, its purchase's source and that party. */
export type LotInfo = {
  imeiNote: string | null;
  source: (typeof purchaseSource.enumValues)[number];
  /** The card (card), customer (customer's due) or supplier (otherwise) of its purchase. */
  fromId: string | null;
};

type Options = {
  /** Only these models' lots. */
  modelIds?: string[];
  /** Only these lots. */
  lotIds?: string[];
  /** Leave this sale's own lines out of the moves: an edit can reuse the units it holds. */
  exceptSaleId?: string;
  /** Leave this return's own lines out of the moves (a return's edit or Undo). */
  exceptReturnId?: string;
  /** Lock the lots (`FOR UPDATE`) until the transaction ends: the write path (SRS §4). */
  lock?: boolean;
};

const inList = (ids: string[]) =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );

export async function stockLots(
  q: Tx | typeof db = db,
  opts: Options = {},
): Promise<(StockLot & LotInfo)[]> {
  const { modelIds, lotIds, exceptSaleId, exceptReturnId, lock } = opts;
  if (modelIds?.length === 0 || lotIds?.length === 0) return [];
  const only: SQL = sql.join(
    [
      modelIds ? sql`and l.model_id in (${inList(modelIds)})` : sql``,
      lotIds ? sql`and l.id in (${inList(lotIds)})` : sql``,
    ],
    sql` `,
  );
  const lots = await q.execute<{
    id: string;
    model_id: string;
    date: string;
    created_at: Date | string;
    qty: number;
    unit_cost: string;
    reversed: boolean;
    imei_note: string | null;
    source: LotInfo["source"];
    from_id: string | null;
  }>(sql`
    select l.id, l.model_id, p.date::text as date, l.created_at, l.qty, l.unit_cost,
      exists (select 1 from purchases r where r.reverses_id = p.id) as reversed,
      l.imei_note, p.source,
      case p.source when 'card' then p.card_id when 'customer_offset' then p.customer_id
        else p.supplier_id end as from_id
    from purchase_lines l
    join purchases p on p.id = l.purchase_id
    where p.reverses_id is null ${only}
    order by l.id
    ${lock ? sql`for update of l` : sql``}`);
  if (lots.length === 0) return [];

  const ids = inList(lots.map((l) => l.id));
  const except = exceptSaleId ? sql`and sl.sale_id <> ${exceptSaleId}` : sql``;
  const exceptReturn = exceptReturnId ? sql`and rl.return_id <> ${exceptReturnId}` : sql``;
  const moves = await q.execute<{ lot_id: string; qty: number; kind: string; reversal: boolean }>(
    sql`
    select sl.lot_id, sl.qty, 'sale' as kind, s.reverses_id is not null as reversal
    from sale_lines sl join sales s on s.id = sl.sale_id
    where sl.lot_id in (${ids}) ${except}
    union all
    select rl.lot_id, rl.qty, r.kind || '_return', r.reverses_id is not null
    from return_lines rl join returns r on r.id = rl.return_id
    where rl.lot_id in (${ids}) ${exceptReturn}`,
  );
  return lotsRemaining(
    lots.map((l) => ({
      id: l.id,
      modelId: l.model_id,
      date: l.date,
      createdAt: new Date(l.created_at).toISOString(),
      qty: Number(l.qty),
      unitCost: parse(l.unit_cost) as number,
      reversed: l.reversed,
      imeiNote: l.imei_note,
      source: l.source,
      fromId: l.from_id,
    })),
    moves.map((m) => ({
      lotId: m.lot_id,
      qty: Number(m.qty),
      kind: m.kind as LotMove["kind"],
      reversal: m.reversal,
    })),
  );
}

/** UIDD §4.4: the sale form's customer defaults to the last one used. */
export async function lastSaleCustomerId(): Promise<string | null> {
  const [last] = await db
    .select({ id: sales.customerId })
    .from(sales)
    .orderBy(desc(sales.createdAt))
    .limit(1);
  return last?.id ?? null;
}
