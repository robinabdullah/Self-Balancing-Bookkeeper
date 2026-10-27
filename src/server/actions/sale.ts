"use server";

import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { auditLog, moneyEntries, saleLines, sales } from "@/db/schema";
import { nextInvoiceNo, nextReceiptNo } from "@/server/numbers";
import { formatDate } from "@/lib/dates";
import { type Planned, planSale } from "@/lib/engine/stock";
import { type Errors, deleteErrors } from "@/lib/guards";
import { add, mul, toDecimal } from "@/lib/money";
import { nest, optional, rowId } from "@/lib/validation/fields";
import { type SaleValues, saleSchema } from "@/lib/validation/trade";
import { CONFLICT, type Row, type Tx, byId, isReversed, runAction } from "@/server/action";
import { stockLots } from "@/server/stock";

// Sale bill add/edit and Undo (PRD §4.2; SRS §4 sales + lot picking, §5, §8; UIDD §4.4; D-004,
// D-006). The server picks the lots: with the candidate lots locked, `planSale` fills each line
// oldest first (or from its chosen lot) and splits it into sale lines. An edited line keeps its
// lot. "Received now" is a customer payment saved in the same transaction; Undo removes both.
// A new bill gets the next invoice number and its payment the next receipt number (D-036).
// The Journal (3.8) deletes with `deleteSale` too (no payment: it is its own entry there).

const billTotal = (v: SaleValues) => v.lines.map((l) => mul(l.unitPrice, l.qty)).reduce(add, 0);

/** The stored lines, locked so a return of them waits for this edit or Undo. */
const linesOf = (tx: Tx, id: string) =>
  tx
    .select()
    .from(saleLines)
    .where(eq(saleLines.saleId, id))
    .orderBy(asc(saleLines.createdAt))
    .for("update");

/** The header with its lines, for the audit row. */
const withLines = async (tx: Tx, row: Row) => ({ ...row, lines: await linesOf(tx, row.id) });

/** Units returned from each of this sale's lines (a reversed return counts back), with dates. */
async function returnsOf(tx: Tx, saleId: string) {
  const rows = await tx.execute<{ sale_line_id: string; date: string; qty: number }>(sql`
    select rl.sale_line_id, r.date::text as date,
      rl.qty * case when r.reverses_id is null then 1 else -1 end as qty
    from return_lines rl
    join returns r on r.id = rl.return_id
    join sale_lines sl on sl.id = rl.sale_line_id
    where sl.sale_id = ${saleId}`);
  return rows.map((r) => ({ saleLineId: r.sale_line_id, date: r.date, qty: Number(r.qty) }));
}

/** SRS §4, §8: what an edit may not do to lines that were returned, or to the date. */
async function returnedErrors(tx: Tx, v: SaleValues): Promise<Errors> {
  const stored = await linesOf(tx, v.id);
  const returns = await returnsOf(tx, v.id);
  const errors: Errors = {};
  if (v.lines.some((l) => l.id && !stored.some((s) => s.id === l.id)))
    errors.form = "A line changed — reload";
  for (const line of stored) {
    const returned = returns.filter((r) => r.saleLineId === line.id).reduce((n, r) => n + r.qty, 0);
    if (returned === 0) continue;
    const i = v.lines.findIndex((l) => l.id === line.id);
    if (i < 0) {
      errors.form ??= "A removed line's phones were returned — keep that line";
      continue;
    }
    if (v.lines[i].lotId !== line.lotId)
      errors[`lines.${i}.lotId`] = "Phones from this line were returned — its lot can't change";
    if (v.lines[i].qty < returned)
      errors[`lines.${i}.qty`] = `Can't be less than ${returned} — already returned`;
  }
  const first = returns.map((r) => r.date).sort()[0];
  if (first && v.date > first)
    errors.date = `This bill has a return on ${formatDate(first)} — the date can't be after that`;
  return errors;
}

/** The lots each line takes, from the locked lots; an edit can reuse the units it holds. */
async function plan(tx: Tx, v: SaleValues, editing: boolean) {
  const lots = await stockLots(tx, {
    modelIds: [...new Set(v.lines.map((l) => l.modelId))],
    exceptSaleId: editing ? v.id : undefined,
    lock: true,
  });
  return planSale(lots, v.lines, v.date);
}

const planErrors = (planned: Planned[]): Errors =>
  Object.fromEntries(
    planned.flatMap((p, i) => ("error" in p ? [[`lines.${i}.${p.field}`, p.error]] : [])),
  );

/** One sale line per lot a form line takes; an edited line keeps its id (D-004). */
function lineRows(v: SaleValues, planned: Planned[], userId: string) {
  return v.lines.flatMap((l, i) => {
    const p = planned[i];
    if (!("picks" in p)) throw new Error("Unplanned line"); // the guards stop this first
    return p.picks.map((pick, n) => ({
      ...(n === 0 && l.id ? { id: l.id } : {}),
      saleId: v.id,
      lotId: pick.lotId,
      qty: pick.qty,
      unitPrice: toDecimal(l.unitPrice),
      createdBy: userId,
    }));
  });
}

const audit = (tx: Tx, row: { id: string }, action: "insert" | "delete", userId: string) =>
  tx.insert(auditLog).values({
    table: "money_entries",
    rowId: row.id,
    action,
    before: action === "delete" ? row : null,
    after: action === "insert" ? row : null,
    userId,
    createdBy: userId,
  });

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
export async function saveSale(input: unknown) {
  const values = nest(input);
  const op = (values as { updatedAt?: unknown } | null)?.updatedAt ? "update" : "insert";
  let planned: Planned[] = [];
  return runAction(
    {
      op,
      table: sales,
      schema: saleSchema,
      before: withLines,
      // SRS §2.3: same customer, bill total and date.
      duplicate: (v) =>
        and(
          eq(sales.date, v.date),
          eq(sales.customerId, v.customerId),
          sql`(select sum(qty * unit_price) from ${saleLines}
               where ${saleLines.saleId} = ${sales.id}) = ${toDecimal(billTotal(v))}`,
        ),
      guards: async ({ tx, values: v, current }) => {
        if (current && v.receivedNow !== null)
          return { receivedNow: "Received now is only for a new bill — add a payment instead" };
        planned = await plan(tx, v, !!current);
        return { ...planErrors(planned), ...(current ? await returnedErrors(tx, v) : {}) };
      },
      write: async (tx, v, { userId }) => {
        const header = { date: v.date, customerId: v.customerId, note: v.note };
        if (op === "insert") {
          const [s] = await tx
            .insert(sales)
            .values({ ...header, id: v.id, invoiceNo: nextInvoiceNo, createdBy: userId })
            .onConflictDoNothing({ target: sales.id })
            .returning();
          if (!s) return null;
          const lines = await tx
            .insert(saleLines)
            .values(lineRows(v, planned, userId))
            .returning();
          if (v.receivedNow !== null && v.paymentId) {
            const [payment] = await tx
              .insert(moneyEntries)
              .values({
                id: v.paymentId,
                type: "customer_payment",
                date: v.date,
                amount: toDecimal(v.receivedNow),
                customerId: v.customerId,
                receiptNo: nextReceiptNo,
                createdBy: userId,
              })
              .returning();
            await audit(tx, payment, "insert", userId);
          }
          return { ...s, lines };
        }
        const [s] = await tx.update(sales).set(header).where(eq(sales.id, v.id)).returning();
        const keep = v.lines.flatMap((l) => (l.id ? [l.id] : []));
        await tx
          .delete(saleLines)
          .where(
            and(
              eq(saleLines.saleId, v.id),
              keep.length ? notInArray(saleLines.id, keep) : undefined,
            ),
          );
        const lines = await tx
          .insert(saleLines)
          .values(lineRows(v, planned, userId))
          .onConflictDoUpdate({
            target: saleLines.id,
            set: {
              lotId: sql`excluded.lot_id`,
              qty: sql`excluded.qty`,
              unitPrice: sql`excluded.unit_price`,
              updatedAt: sql`now()`,
            },
            setWhere: eq(saleLines.saleId, v.id), // never another sale's line
          })
          .returning();
        return { ...s, lines };
      },
    },
    values,
  );
}

/**
 * Undo of a new sale (D-006): the bill and, if it had "Received now", that payment. The payment
 * was saved in the same transaction, so it has the bill's `updatedAt` unless it changed since.
 */
export async function deleteSale(input: unknown) {
  let payment: typeof moneyEntries.$inferSelect | undefined;
  return runAction(
    {
      op: "delete",
      table: sales,
      schema: byId.extend({ paymentId: optional(rowId) }),
      before: withLines,
      guards: async ({ tx, values, current, calendar }) => {
        const sale = current as Row & { date: string; customerId: string };
        // Without a sale reversal, the units it gave back leave its lots again: they must not
        // go below 0 (sold again since, D-026). Without a plain sale, stock only goes up.
        const lots = await stockLots(tx, {
          lotIds: (await linesOf(tx, values.id)).map((l) => l.lotId),
          exceptSaleId: values.id,
          lock: true,
        });
        const deps = {
          reversed: await isReversed(tx, sales, values.id),
          hasDependents:
            (await returnsOf(tx, values.id)).length > 0 || lots.some((l) => l.remaining < 0),
        };
        const errors = deleteErrors(sale, deps, calendar.lastClosed);
        if (errors.form || !values.paymentId) return errors;
        [payment] = await tx
          .select()
          .from(moneyEntries)
          .where(eq(moneyEntries.id, values.paymentId))
          .for("update");
        if (!payment) return {}; // saved without Received now
        const [paymentReversal] = await tx
          .select({ id: moneyEntries.id })
          .from(moneyEntries)
          .where(eq(moneyEntries.reversesId, payment.id));
        const same =
          payment.type === "customer_payment" &&
          payment.customerId === sale.customerId &&
          payment.date === sale.date &&
          payment.updatedAt.getTime() === sale.updatedAt.getTime();
        return same && !paymentReversal ? {} : { form: CONFLICT };
      },
      write: async (tx, values, { userId }) => {
        if (payment) {
          await tx.delete(moneyEntries).where(eq(moneyEntries.id, payment.id));
          await audit(tx, payment, "delete", userId);
        }
        await tx.delete(sales).where(eq(sales.id, values.id));
      },
    },
    input,
  );
}
