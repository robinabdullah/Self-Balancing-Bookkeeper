"use server";

import { type AnyColumn, and, asc, eq, notInArray, sql } from "drizzle-orm";
import { customers, purchaseLines, purchases } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { type Errors, deleteErrors, lotEditErrors, walkInErrors } from "@/lib/guards";
import { add, mul, parse, toDecimal } from "@/lib/money";
import { nest } from "@/lib/validation/fields";
import { type PurchaseValues, purchaseSchema } from "@/lib/validation/trade";
import { type Row, type Tx, byId, isReversed, runAction } from "@/server/action";

// Purchase add/edit and Undo (PRD §4.2; SRS §4 purchases, §5, §8; UIDD §4.3; D-009). A purchase
// is a header plus its lines; each line is a lot whose id the form generates. An edit keeps the
// lots that were sold or returned and their cost/qty rules (SRS §8). The Journal (3.8) deletes
// with `deletePurchase` too.

const total = (v: PurchaseValues) => v.lines.map((l) => mul(l.unitCost, l.qty)).reduce(add, 0);

const header = (v: PurchaseValues) => ({
  date: v.date,
  source: v.source,
  supplierId: v.supplierId,
  cardId: v.cardId,
  customerId: v.customerId,
  emiMonths: v.emiMonths,
  billMonthOverride: v.billMonthOverride && `${v.billMonthOverride}-01`,
  note: v.note,
});

const lineRows = (v: PurchaseValues, userId: string) =>
  v.lines.map((l) => ({
    id: l.id,
    purchaseId: v.id,
    modelId: l.modelId,
    qty: l.qty,
    unitCost: toDecimal(l.unitCost),
    imeiNote: l.imeiNote,
    createdBy: userId,
  }));

/** The stored lines (the lots), locked so a concurrent sale waits for this edit (SRS §4). */
const lotsOf = (tx: Tx, id: string) =>
  tx
    .select()
    .from(purchaseLines)
    .where(eq(purchaseLines.purchaseId, id))
    .orderBy(asc(purchaseLines.createdAt))
    .for("update");

/** The header with its lines, for the audit row. */
const withLines = async (tx: Tx, row: Row) => ({ ...row, lines: await lotsOf(tx, row.id) });

type Use = { lotId: string; date: string; qty: number };

/**
 * Each sale or return of this purchase's lots, with the units it takes from the lot: sold and
 * purchase-returned count +, customer-returned −; a reversal counts the other way (SRS §4).
 */
async function usesOf(tx: Tx, purchaseId: string): Promise<Use[]> {
  const rows = await tx.execute<{ lot_id: string; date: string; qty: number }>(sql`
    select sl.lot_id, s.date, sl.qty * case when s.reverses_id is null then 1 else -1 end as qty
    from sale_lines sl
    join sales s on s.id = sl.sale_id
    join purchase_lines l on l.id = sl.lot_id
    where l.purchase_id = ${purchaseId}
    union all
    select rl.lot_id, r.date,
      rl.qty * case when r.kind = 'customer' then -1 else 1 end
             * case when r.reverses_id is null then 1 else -1 end
    from return_lines rl
    join returns r on r.id = rl.return_id
    join purchase_lines l on l.id = rl.lot_id
    where l.purchase_id = ${purchaseId}`);
  return rows.map((r) => ({ lotId: r.lot_id, date: r.date, qty: Number(r.qty) }));
}

/** SRS §4, §8: what an edit may not do to lots that were sold or returned, or to the date. */
async function lotErrors(
  tx: Tx,
  v: PurchaseValues,
  storedDate: string,
  lastClosed: string | null,
): Promise<Errors> {
  const uses = await usesOf(tx, v.id);
  const errors: Errors = {};
  for (const lot of await lotsOf(tx, v.id)) {
    const lotUses = uses.filter((u) => u.lotId === lot.id);
    if (lotUses.length === 0) continue;
    const i = v.lines.findIndex((l) => l.id === lot.id);
    if (i < 0) {
      errors.form ??= "A removed line's phones were sold or returned — keep that line";
      continue;
    }
    const line = v.lines[i];
    const locked = lotEditErrors(
      lotUses.map((u) => u.date),
      lastClosed,
    ).form;
    if (locked && (line.qty !== lot.qty || line.unitCost !== parse(lot.unitCost)))
      errors.form ??= locked;
    const used = lotUses.reduce((n, u) => n + u.qty, 0);
    if (line.qty < used)
      errors[`lines.${i}.qty`] =
        `Can't be less than ${used} — already sold or returned from this lot`;
  }
  const first = uses.map((u) => u.date).sort()[0];
  if (first && v.date !== storedDate && v.date > first)
    errors.date = `Stock from this purchase was sold or returned on ${formatDate(first)} — the date can't be after that`;
  return errors;
}

async function walkInId(tx: Tx) {
  const [walkIn] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.isSystem, true));
  return walkIn?.id ?? "";
}

const same = (col: AnyColumn, value: string | null) => sql`${col} is not distinct from ${value}`;

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
export async function savePurchase(input: unknown) {
  const values = nest(input);
  const op = (values as { updatedAt?: unknown } | null)?.updatedAt ? "update" : "insert";
  return runAction(
    {
      op,
      table: purchases,
      schema: purchaseSchema,
      before: withLines,
      // SRS §2.3: same source, counterparty, bill total and date.
      duplicate: (v) =>
        and(
          eq(purchases.date, v.date),
          eq(purchases.source, v.source),
          same(purchases.supplierId, v.supplierId),
          same(purchases.cardId, v.cardId),
          same(purchases.customerId, v.customerId),
          sql`(select sum(qty * unit_cost) from ${purchaseLines}
               where ${purchaseLines.purchaseId} = ${purchases.id}) = ${toDecimal(total(v))}`,
        ),
      guards: async ({ tx, values: v, calendar, current }) => ({
        ...(v.source === "customer_offset"
          ? walkInErrors({ table: "purchase", ...v }, await walkInId(tx))
          : {}),
        ...(current ? await lotErrors(tx, v, current.date as string, calendar.lastClosed) : {}),
      }),
      write: async (tx, v, { userId }) => {
        if (op === "insert") {
          const [p] = await tx
            .insert(purchases)
            .values({ ...header(v), id: v.id, createdBy: userId })
            .onConflictDoNothing({ target: purchases.id })
            .returning();
          if (!p) return null;
          return {
            ...p,
            lines: await tx.insert(purchaseLines).values(lineRows(v, userId)).returning(),
          };
        }
        const [p] = await tx
          .update(purchases)
          .set(header(v))
          .where(eq(purchases.id, v.id))
          .returning();
        await tx.delete(purchaseLines).where(
          and(
            eq(purchaseLines.purchaseId, v.id),
            notInArray(
              purchaseLines.id,
              v.lines.map((l) => l.id),
            ),
          ),
        );
        const lines = await tx
          .insert(purchaseLines)
          .values(lineRows(v, userId))
          .onConflictDoUpdate({
            target: purchaseLines.id,
            set: {
              modelId: sql`excluded.model_id`,
              qty: sql`excluded.qty`,
              unitCost: sql`excluded.unit_cost`,
              imeiNote: sql`excluded.imei_note`,
              updatedAt: sql`now()`,
            },
            setWhere: eq(purchaseLines.purchaseId, v.id), // never another purchase's lot
          })
          .returning();
        return { ...p, lines };
      },
    },
    values,
  );
}

/** Undo or Journal delete (D-010): only while nothing was sold or returned from its lots. */
export async function deletePurchase(input: unknown) {
  return runAction(
    {
      op: "delete",
      table: purchases,
      schema: byId,
      before: withLines,
      guards: async ({ tx, values, current, calendar }) => {
        const deps = {
          reversed: await isReversed(tx, purchases, values.id),
          hasDependents: (await usesOf(tx, values.id)).length > 0,
        };
        return deleteErrors(current as Row & { date: string }, deps, calendar.lastClosed);
      },
    },
    input,
  );
}
