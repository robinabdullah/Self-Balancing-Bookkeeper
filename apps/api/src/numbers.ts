import { sql } from "drizzle-orm";

// Ref: src/server/numbers.ts (N-3.2). D-036: invoice and receipt numbers, one running series each,
// taken from their sequence at save (in the insert itself). Never a column default: reversals
// share the tables and get none. A number taken by an insert that writes nothing (a replayed id)
// or later undone is a gap, never reused.

export const nextInvoiceNo = sql<number>`nextval('sales_invoice_no_seq')`;
export const nextReceiptNo = sql<number>`nextval('money_entries_receipt_no_seq')`;
