import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { type BoughtLine, type SentBackLine, purchasesByModel } from "@mbl/domain/by-model";
import { parse } from "@mbl/domain/money";
import type { StockLine, StockMoveKind } from "@mbl/domain/stock-movement";
import { DB } from "../db/db.module";

// Ref: src/server/report-lines.ts (N-4.5). D-045: the dated lot lines the new reports read. Every
// line carries its lot's model and cost; a reversal's lines are stored copies (reverse.ts) and
// count the other way.

const poisha = (text: string) => parse(text) as number;

/** Who we bought from: a supplier (any purchase naming them), or a customer (bought off their
 * due). */
export type Seller = { supplierId: string } | { customerId: string };

const from = (s: Seller, p: string) =>
  "supplierId" in s
    ? sql`${sql.raw(p)}.supplier_id = ${s.supplierId}`
    : sql`${sql.raw(p)}.source = 'customer_offset' and ${sql.raw(p)}.customer_id = ${s.customerId}`;

@Injectable()
export class ReportLinesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * D-045 By model: what we bought from them in the period at the price paid, less the phones from
   * their lots sent back in the period at the refund amount, however refunded. Damaged / lost is
   * a write-off, never sent back.
   */
  async loadPurchasesByModel(seller: Seller, start: string, end: string) {
    const [bought, sentBack] = await Promise.all([
      this.db.execute<{
        model_id: string;
        qty: number;
        unit_cost: string;
        purchase_id: string;
        reverses_id: string | null;
      }>(sql`
      select l.model_id, l.qty, l.unit_cost, p.id as purchase_id, p.reverses_id
      from purchase_lines l join purchases p on p.id = l.purchase_id
      where ${from(seller, "p")} and p.date between ${start} and ${end}`),
      this.db.execute<{
        model_id: string;
        qty: number;
        unit_amount: string;
        reversal: boolean;
      }>(sql`
      select lot.model_id, rl.qty, rl.unit_amount, r.reverses_id is not null as reversal
      from return_lines rl
      join returns r on r.id = rl.return_id
      join purchase_lines lot on lot.id = rl.lot_id
      join purchases lp on lp.id = lot.purchase_id
      where r.kind = 'purchase' and r.reason is distinct from 'damaged_lost'
        and ${from(seller, "lp")} and r.date between ${start} and ${end}`),
    ]);
    return purchasesByModel(
      bought.map((l): BoughtLine => ({
        modelId: l.model_id,
        qty: Number(l.qty),
        unitCost: poisha(l.unit_cost),
        reversal: l.reverses_id != null,
        purchaseId: l.purchase_id,
        reversesId: l.reverses_id,
      })),
      sentBack.map((l): SentBackLine => ({
        modelId: l.model_id,
        qty: Number(l.qty),
        unitAmount: poisha(l.unit_amount),
        reversal: l.reversal,
      })),
    );
  }

  /** Every lot movement dated on or before `end`, for the pack's stock movement. */
  async loadStockLines(end: string): Promise<StockLine[]> {
    const rows = await this.db.execute<{
      model_id: string;
      date: string;
      qty: number;
      unit_cost: string;
      kind: StockMoveKind;
      reversal: boolean;
    }>(sql`
    select l.model_id, p.date::text as date, l.qty, l.unit_cost,
      case p.source when 'opening' then 'opening' when 'opening_correction' then 'correction'
        else 'bought' end as kind,
      p.reverses_id is not null as reversal
    from purchase_lines l join purchases p on p.id = l.purchase_id
    where p.date <= ${end}
    union all
    select lot.model_id, s.date::text, sl.qty, lot.unit_cost, 'sold', s.reverses_id is not null
    from sale_lines sl join sales s on s.id = sl.sale_id
    join purchase_lines lot on lot.id = sl.lot_id
    where s.date <= ${end}
    union all
    select lot.model_id, r.date::text, rl.qty, lot.unit_cost,
      case when r.kind = 'customer' then 'returned_in' when r.reason = 'damaged_lost'
        then 'written_off' else 'back' end,
      r.reverses_id is not null
    from return_lines rl join returns r on r.id = rl.return_id
    join purchase_lines lot on lot.id = rl.lot_id
    where r.date <= ${end}`);
    return rows.map((r) => ({
      modelId: r.model_id,
      date: r.date,
      qty: Number(r.qty),
      unitCost: poisha(r.unit_cost),
      kind: r.kind,
      reversal: r.reversal,
    }));
  }
}
