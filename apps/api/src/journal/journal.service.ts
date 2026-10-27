import { Inject, Injectable } from "@nestjs/common";
import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { isLocked } from "@mbl/domain/guards";
import { parse } from "@mbl/domain/money";
import { rowId } from "@mbl/domain/validation/fields";
import { loadCalendar } from "../action/runner";
import { memo } from "../auth/memo";
import { DB } from "../db/db.module";
import type { EntryTable } from "../reverse/reverse.service";

// Ref: src/server/journal.ts (N-4.1). The Journal (PRD §4.5; SRS §8; UIDD §4.10): every entry of
// the four entry tables, newest first, with its total, counterparty ids, reversal links and the 🔒
// lock (SRS §7). The detail adds the lines and the audit history.

export type JournalRow = {
  table: EntryTable;
  id: string;
  date: string;
  /** "YYYY-MM" or null. */
  forMonth: string | null;
  createdAt: string;
  updatedAt: string;
  /** The filter key: "purchase", "sale", "customer_return", "purchase_return" or the money type. */
  type: string;
  /** Purchase source; return reason; money source, category or opening kind. */
  detail: string | null;
  customerId: string | null;
  supplierId: string | null;
  cardId: string | null;
  personId: string | null;
  /** Poisha: the bill total, the refund total or the amount (signed for opening items). */
  amount: number;
  reversesId: string | null;
  reversedBy: string | null;
  /** A sale's invoice or a customer payment's receipt number (D-036; shown by `docLabel`). */
  docNo: number | null;
  note: string;
  locked: boolean;
};

type Raw = {
  tbl: EntryTable;
  id: string;
  date: string;
  for_month: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  type: string;
  detail: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  card_id: string | null;
  person_id: string | null;
  amount: string;
  reverses_id: string | null;
  reversed_by: string | null;
  doc_no: number | null;
  note: string;
};

/** One line of a purchase, sale or return, for the detail. Money in poisha. */
export type EntryLine = { modelId: string; qty: number; unitAmount: number; note: string | null };

/** One audit row (who, when, before → after). */
export type HistoryRow = {
  action: string;
  at: string;
  by: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

@Injectable()
export class JournalService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The rows and the calendar they were locked against (one round trip for both). */
  private async query(where: SQL = sql``) {
    const [raw, calendar] = await Promise.all([
      this.db.execute<Raw>(sql`
      select * from (
        select 'purchase' as tbl, p.id, p.date::text as date, null::text as for_month,
          p.created_at, p.updated_at, 'purchase' as type, p.source::text as detail,
          p.customer_id, p.supplier_id, p.card_id, null::uuid as person_id,
          coalesce((select sum(l.qty * l.unit_cost) from purchase_lines l
            where l.purchase_id = p.id), 0)::text as amount,
          p.reverses_id, (select r.id from purchases r where r.reverses_id = p.id) as reversed_by,
          null::int as doc_no, p.note
        from purchases p
        union all
        select 'sale', s.id, s.date::text, null, s.created_at, s.updated_at, 'sale', null,
          s.customer_id, null, null, null,
          coalesce((select sum(l.qty * l.unit_price) from sale_lines l
            where l.sale_id = s.id), 0)::text,
          s.reverses_id, (select r.id from sales r where r.reverses_id = s.id), s.invoice_no,
          s.note
        from sales s
        union all
        select 'return', t.id, t.date::text, null, t.created_at, t.updated_at,
          t.kind || '_return', t.reason::text, t.customer_id, t.supplier_id, t.card_id, null,
          coalesce((select sum(l.qty * l.unit_amount) from return_lines l
            where l.return_id = t.id), 0)::text,
          t.reverses_id, (select r.id from returns r where r.reverses_id = t.id), null, t.note
        from returns t
        union all
        select 'money', m.id, m.date::text, to_char(m.for_month, 'YYYY-MM'), m.created_at,
          m.updated_at, m.type::text, coalesce(m.opening_kind::text, m.category, m.source::text),
          m.customer_id, m.supplier_id, m.card_id, m.person_id, m.amount::text,
          m.reverses_id, (select r.id from money_entries r where r.reverses_id = m.id), m.receipt_no,
          m.note
        from money_entries m
      ) j ${where}
      order by j.date desc, j.created_at desc`),
      loadCalendar(this.db),
    ]);
    const rows = raw.map((r): JournalRow => ({
      table: r.tbl,
      id: r.id,
      date: r.date,
      forMonth: r.for_month,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
      type: r.type,
      detail: r.detail,
      customerId: r.customer_id,
      supplierId: r.supplier_id,
      cardId: r.card_id,
      personId: r.person_id,
      amount: parse(r.amount) as number,
      reversesId: r.reverses_id,
      reversedBy: r.reversed_by,
      docNo: r.doc_no == null ? null : Number(r.doc_no),
      note: r.note,
      locked: isLocked({ date: r.date, forMonth: r.for_month }, calendar.lastClosed),
    }));
    return { rows, calendar };
  }

  async loadJournal() {
    return (await this.query()).rows;
  }

  /**
   * One entry with its lines, history and calendar, loaded side by side (D-032). Once per render
   * (memo.ts); a page starts it early with `preloadEntry` (web's entry-overlay.tsx).
   */
  loadEntry(id: string) {
    return memo(`entry:${id}`, async () => {
      if (!rowId.safeParse(id).success) return null;
      const [
        {
          rows: [row],
          calendar,
        },
        lines,
        history,
      ] = await Promise.all([
        this.query(sql`where j.id = ${id}`),
        this.db.execute<{ model_id: string; qty: number; amount: string; note: string | null }>(sql`
      select l.model_id, l.qty, l.unit_cost::text as amount, l.imei_note as note, l.created_at
      from purchase_lines l where l.purchase_id = ${id}
      union all
      select p.model_id, l.qty, l.unit_price::text, null, l.created_at
      from sale_lines l join purchase_lines p on p.id = l.lot_id where l.sale_id = ${id}
      union all
      select p.model_id, l.qty, l.unit_amount::text, null, l.created_at
      from return_lines l join purchase_lines p on p.id = l.lot_id where l.return_id = ${id}
      order by created_at`),
        this.db.execute<{
          action: string;
          at: Date | string;
          by: string | null;
          before: Record<string, unknown> | null;
          after: Record<string, unknown> | null;
        }>(sql`
      select a.action, a.at, p.name as by, a.before, a.after
      from audit_log a left join profiles p on p.user_id = a.user_id
      where a.row_id = ${id}
      order by a.at, a.created_at`),
      ]);
      if (!row) return null;
      return {
        row,
        lines: lines.map((l): EntryLine => ({
          modelId: l.model_id,
          qty: Number(l.qty),
          unitAmount: parse(l.amount) as number,
          note: l.note,
        })),
        history: history.map((h): HistoryRow => ({
          ...h,
          at: new Date(h.at).toISOString(),
          by: h.by ?? "someone",
        })),
        calendar,
      };
    });
  }
}

export type JournalEntry = NonNullable<Awaited<ReturnType<JournalService["loadEntry"]>>>;
