import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { parse } from "@mbl/domain/money";

// UIDD §4.8 (task 4.3.1): a customer's Bills tab: each sale with its lines (model, qty, unit price
// and the lot's unit cost), newest first. A reversal is not a bill; a reversed bill says so. The
// profit comes from the books (`billProfit`), not from here.

export type BillLine = { modelId: string; qty: number; unitPrice: number; unitCost: number };
export type Bill = {
  id: string;
  date: string;
  /** D-036: shown as INV-0042 (D-042). */
  invoiceNo: number | null;
  reversedBy: string | null;
  note: string;
  lines: BillLine[];
};

export async function customerBills(customerId: string): Promise<Bill[]> {
  const [bills, lines] = await Promise.all([
    db.execute<{
      id: string;
      date: string;
      invoice_no: number | null;
      reversed_by: string | null;
      note: string;
    }>(sql`
      select s.id, s.date::text as date, s.invoice_no, s.note,
        (select r.id from sales r where r.reverses_id = s.id) as reversed_by
      from sales s
      where s.customer_id = ${customerId} and s.reverses_id is null
      order by s.date desc, s.created_at desc`),
    db.execute<{
      sale_id: string;
      model_id: string;
      qty: number;
      unit_price: string;
      unit_cost: string;
    }>(sql`
      select l.sale_id, p.model_id, l.qty, l.unit_price::text, p.unit_cost::text
      from sale_lines l
      join sales s on s.id = l.sale_id
      join purchase_lines p on p.id = l.lot_id
      where s.customer_id = ${customerId} and s.reverses_id is null
      order by l.created_at, l.id`),
  ]);
  return bills.map((b) => ({
    id: b.id,
    date: b.date,
    invoiceNo: b.invoice_no == null ? null : Number(b.invoice_no),
    reversedBy: b.reversed_by,
    note: b.note,
    lines: lines
      .filter((l) => l.sale_id === b.id)
      .map((l) => ({
        modelId: l.model_id,
        qty: Number(l.qty),
        unitPrice: parse(l.unit_price) as number,
        unitCost: parse(l.unit_cost) as number,
      })),
  }));
}
