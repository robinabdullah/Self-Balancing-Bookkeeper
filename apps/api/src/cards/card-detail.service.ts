import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { DB } from "../db/db.module";

// Ref: src/server/cards.ts (N-4.5). UIDD §4.8 (task 4.4.2): what a card's detail needs besides the
// books: its `card_bill_dates` rows (id + `updatedAt` for the edit modal) and each EMI purchase's
// models (the plan's item).

export type BillDatesRow = {
  id: string;
  billMonth: string; // "YYYY-MM"
  actualStatementDate: string | null;
  actualDueDate: string | null;
  updatedAt: string;
};

@Injectable()
export class CardDetailService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async cardDetailData(cardId: string) {
    const [dates, items] = await Promise.all([
      this.db.execute<{
        id: string;
        bill_month: string;
        actual_statement_date: string | null;
        actual_due_date: string | null;
        updated_at: Date | string;
      }>(sql`
      select id, to_char(bill_month, 'YYYY-MM') as bill_month,
        actual_statement_date::text, actual_due_date::text, updated_at
      from card_bill_dates where card_id = ${cardId}`),
      this.db.execute<{ id: string; item: string }>(sql`
      select p.id, string_agg(m.name || ' × ' || l.qty, ', ' order by l.created_at, l.id) as item
      from purchases p
      join purchase_lines l on l.purchase_id = p.id
      join models m on m.id = l.model_id
      where p.card_id = ${cardId} and p.emi_months > 1
      group by p.id`),
    ]);
    return {
      billDates: dates.map((d): BillDatesRow => ({
        id: d.id,
        billMonth: d.bill_month,
        actualStatementDate: d.actual_statement_date,
        actualDueDate: d.actual_due_date,
        updatedAt: new Date(d.updated_at).toISOString(),
      })),
      emiItems: Object.fromEntries(items.map((i) => [i.id, i.item])) as Record<string, string>,
    };
  }
}
