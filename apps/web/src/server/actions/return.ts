"use server";

import { type AnyColumn, and, eq, inArray, sql } from "drizzle-orm";
import { purchaseLines, returnLines, returns } from "@/db/schema";
import { formatDate } from "@mbl/domain/dates";
import { type Errors, deleteErrors } from "@mbl/domain/guards";
import { add, mul, toDecimal } from "@mbl/domain/money";
import { nest } from "@mbl/domain/validation/fields";
import { type ReturnValues, returnSchema } from "@mbl/domain/validation/trade";
import { type Row, type Tx, byId, isReversed, runAction } from "@/server/action";
import { stockLots } from "@/server/stock";

// Customer and purchase returns: add/edit and Undo (PRD §4.2; SRS §4 returns, §5, §8; UIDD
// §4.5; D-011). A customer return takes units back from its bill lines into the same lots, up to
// sold − returned. A purchase return sends units of one purchase's lots back (≤ what each has
// left), or writes them off (damaged / lost). Lots and sale lines are locked while it is checked.
// The Journal (3.8) deletes with `deleteReturn` too.

type CustomerValues = Extract<ReturnValues, { kind: "customer" }>;
type PurchaseValues = Extract<ReturnValues, { kind: "purchase" }>;

const total = (v: ReturnValues) => v.lines.map((l) => mul(l.unitAmount, l.qty)).reduce(add, 0);

/** The header with its lines, for the audit row. */
const withLines = async (tx: Tx, row: Row) => ({
  ...row,
  lines: await tx.select().from(returnLines).where(eq(returnLines.returnId, row.id)),
});

/** The lots this return takes from, locked, less this return's own lines (SRS §4). */
const lotsOf = (tx: Tx, lotIds: string[], returnId: string) =>
  stockLots(tx, { lotIds: [...new Set(lotIds)], exceptReturnId: returnId, lock: true });

type SaleLine = {
  id: string;
  lot_id: string;
  qty: number;
  customer_id: string;
  date: string;
  reversed: boolean;
};

/** SRS §4: each bill line is the customer's, not reversed, and has units left to return. */
async function customerErrors(tx: Tx, v: CustomerValues) {
  const lineIds = [...new Set(v.lines.map((l) => l.saleLineId))];
  // The bill and its lines are locked first, as a sale edit locks its header first.
  const rows = await tx.execute<SaleLine>(sql`
    select sl.id, sl.lot_id, sl.qty, s.customer_id, s.date::text as date,
      (s.reverses_id is not null or exists (select 1 from sales x where x.reverses_id = s.id))
        as reversed
    from sale_lines sl join sales s on s.id = sl.sale_id
    where sl.id in (${sql.join(
      lineIds.map((id) => sql`${id}`),
      sql`, `,
    )})
    for update of sl, s`);
  const returned = await tx.execute<{ sale_line_id: string; qty: number }>(sql`
    select rl.sale_line_id, rl.qty * case when r.reverses_id is null then 1 else -1 end as qty
    from return_lines rl join returns r on r.id = rl.return_id
    where rl.sale_line_id in (${sql.join(
      lineIds.map((id) => sql`${id}`),
      sql`, `,
    )}) and rl.return_id <> ${v.id}`);
  const left = new Map(rows.map((r) => [r.id, Number(r.qty)]));
  for (const r of returned)
    left.set(r.sale_line_id, (left.get(r.sale_line_id) ?? 0) - Number(r.qty));

  const errors: Errors = {};
  const lines: { saleLineId: string; lotId: string; qty: number; unitAmount: number }[] = [];
  v.lines.forEach((l, i) => {
    const row = rows.find((r) => r.id === l.saleLineId);
    const field = `lines.${i}`;
    if (!row) errors[`${field}.saleLineId`] = "Pick a bill line";
    else if (row.customer_id !== v.customerId)
      errors[`${field}.saleLineId`] = "This line is from another customer's bill";
    else if (row.reversed) errors[`${field}.saleLineId`] = "This bill was reversed";
    else {
      const n = left.get(row.id) ?? 0;
      if (l.qty > n) errors[`${field}.qty`] = `Only ${Math.max(n, 0)} left to return on this line`;
      left.set(row.id, n - l.qty);
      if (v.date < row.date)
        errors.date = `The sale was on ${formatDate(row.date)} — the return can't be before it`;
      lines.push({ ...l, lotId: row.lot_id });
    }
  });
  if (Object.keys(errors).length) return { errors, lines };

  // Customer-returned units add to their lot. An edit to fewer must not leave it below 0: they
  // may have been sold again since.
  const lots = await lotsOf(
    tx,
    lines.map((l) => l.lotId),
    v.id,
  );
  const stock = new Map(lots.map((l) => [l.id, l.remaining]));
  lines.forEach((l, i) => {
    const before = stock.get(l.lotId) ?? 0;
    stock.set(l.lotId, before + l.qty);
    if (before + l.qty < 0)
      errors[`lines.${i}.qty`] =
        `Can't be less than ${0 - before} — phones from this return were sold again`;
  });
  return { errors, lines };
}

/** SRS §4: one purchase's lots, each with enough left, bought on or before the return date. */
async function purchaseErrors(tx: Tx, v: PurchaseValues) {
  const lotIds = v.lines.map((l) => l.lotId);
  const lots = await lotsOf(tx, lotIds, v.id);
  const purchases = await tx
    .selectDistinct({ id: purchaseLines.purchaseId })
    .from(purchaseLines)
    .where(inArray(purchaseLines.id, lotIds));
  const errors: Errors =
    purchases.length > 1 ? { form: "One return covers one purchase — save a return for each" } : {};
  const left = new Map(lots.map((l) => [l.id, l.remaining]));
  v.lines.forEach((l, i) => {
    const lot = lots.find((x) => x.id === l.lotId);
    if (!lot) {
      errors[`lines.${i}.lotId`] = "Pick a lot";
      return;
    }
    const n = left.get(lot.id) ?? 0;
    if (l.qty > n) errors[`lines.${i}.qty`] = `Only ${Math.max(n, 0)} left in this lot`;
    left.set(lot.id, n - l.qty);
    if (v.date < lot.date)
      errors.date = `The purchase was on ${formatDate(lot.date)} — the return can't be before it`;
  });
  return { errors, lines: v.lines.map((l) => ({ ...l, saleLineId: null })) };
}

const header = (v: ReturnValues) => ({
  kind: v.kind,
  date: v.date,
  customerId: v.customerId,
  cardId: v.kind === "purchase" ? v.cardId : null,
  supplierId: v.kind === "purchase" ? v.supplierId : null,
  refundTo: v.kind === "purchase" ? v.refundTo : null,
  reason: v.kind === "purchase" ? v.reason : null,
  note: v.note,
});

const same = (col: AnyColumn, value: string | null) => sql`${col} is not distinct from ${value}`;

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
export async function saveReturn(input: unknown) {
  const values = nest(input);
  const op = (values as { updatedAt?: unknown } | null)?.updatedAt ? "update" : "insert";
  let lines: { saleLineId: string | null; lotId: string; qty: number; unitAmount: number }[] = [];
  return runAction(
    {
      op,
      table: returns,
      schema: returnSchema,
      before: withLines,
      // SRS §2.3: same kind, counterparty, refund total and date. A write-off always refunds 0,
      // so it matches on the same lots and qty instead.
      duplicate: (v) => {
        const h = header(v);
        const writeOff = v.kind === "purchase" && v.reason === "damaged_lost";
        return and(
          eq(returns.kind, v.kind),
          eq(returns.date, v.date),
          same(returns.customerId, h.customerId),
          same(returns.supplierId, h.supplierId),
          same(returns.cardId, h.cardId),
          same(returns.reason, h.reason),
          ...(writeOff
            ? v.lines.map(
                (l) => sql`exists (select 1 from ${returnLines}
                  where ${returnLines.returnId} = ${returns.id}
                    and ${returnLines.lotId} = ${l.lotId} and ${returnLines.qty} = ${l.qty})`,
              )
            : [
                sql`(select sum(qty * unit_amount) from ${returnLines}
                     where ${returnLines.returnId} = ${returns.id}) = ${toDecimal(total(v))}`,
              ]),
        );
      },
      guards: async ({ tx, values: v, current }) => {
        if (current && current.kind !== v.kind)
          return { kind: "A return's kind can't change — delete it and enter the other kind" };
        const checked =
          v.kind === "customer" ? await customerErrors(tx, v) : await purchaseErrors(tx, v);
        lines = checked.lines;
        return checked.errors;
      },
      write: async (tx, v, { userId }) => {
        let r: typeof returns.$inferSelect | undefined;
        if (op === "insert") {
          [r] = await tx
            .insert(returns)
            .values({ ...header(v), id: v.id, createdBy: userId })
            .onConflictDoNothing({ target: returns.id })
            .returning();
          if (!r) return null;
        } else {
          [r] = await tx.update(returns).set(header(v)).where(eq(returns.id, v.id)).returning();
          await tx.delete(returnLines).where(eq(returnLines.returnId, v.id));
        }
        const rows = await tx
          .insert(returnLines)
          .values(
            lines.map((l) => ({
              returnId: v.id,
              saleLineId: l.saleLineId,
              lotId: l.lotId,
              qty: l.qty,
              unitAmount: toDecimal(l.unitAmount),
              createdBy: userId,
            })),
          )
          .returning();
        return { ...r, lines: rows };
      },
    },
    values,
  );
}

/** Undo or Journal delete: not if its units were sold again or it has a reversal (SRS §8). */
export async function deleteReturn(input: unknown) {
  return runAction(
    {
      op: "delete",
      table: returns,
      schema: byId,
      before: withLines,
      guards: async ({ tx, values, current, calendar }) => {
        // Without this return, its lots must not go below 0: a customer return's units (or a
        // purchase-return reversal's) may have been sold again (D-026).
        const back = await tx
          .select({ lotId: returnLines.lotId })
          .from(returnLines)
          .where(eq(returnLines.returnId, values.id));
        const lots = await lotsOf(
          tx,
          back.map((l) => l.lotId),
          values.id,
        );
        // A customer-return reversal can't go once its bill was reversed: that needed it.
        const billReversed = current?.reversesId
          ? (
              await tx.execute(sql`
                select 1 from return_lines rl
                join sale_lines sl on sl.id = rl.sale_line_id
                join sales x on x.reverses_id = sl.sale_id
                where rl.return_id = ${current.reversesId} limit 1`)
            ).length > 0
          : false;
        const deps = {
          reversed: await isReversed(tx, returns, values.id),
          hasDependents: billReversed || lots.some((l) => l.remaining < 0),
        };
        return deleteErrors(current as Row & { date: string }, deps, calendar.lastClosed);
      },
    },
    input,
  );
}
