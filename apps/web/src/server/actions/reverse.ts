"use server";

import { eq, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  moneyEntries,
  purchaseLines,
  purchases,
  returnLines,
  returns,
  saleLines,
  sales,
} from "@/db/schema";
import { reversalDateErrors, reverseErrors } from "@mbl/domain/guards";
import { date, month, optional, rowId } from "@mbl/domain/validation/fields";
import { type AppTable, CONFLICT, type Row, type Tx, isReversed, runAction } from "@/server/action";
import { stockLots } from "@/server/stock";

// Reverse from the Journal (PRD §4.5; SRS §8; D-003, D-026): a new entry with `reverses_id` and
// the same content (its lines too), which the engine negates. It lands on the chosen open-month
// date, never before the original's. Blocked for a reversal, an entry already reversed, or one
// with live dependents (a sale with returns, a purchase whose lots have sales or returns), and
// when a customer return's units were sold again (stock ≥ 0, SRS §4).

export type EntryTable = "purchase" | "sale" | "return" | "money";

type Lines = { table: AppTable; parent: PgColumn; key: string };

const TABLES: Record<EntryTable, { header: AppTable; lines?: Lines }> = {
  purchase: {
    header: purchases,
    lines: { table: purchaseLines, parent: purchaseLines.purchaseId, key: "purchaseId" },
  },
  sale: { header: sales, lines: { table: saleLines, parent: saleLines.saleId, key: "saleId" } },
  return: {
    header: returns,
    lines: { table: returnLines, parent: returnLines.returnId, key: "returnId" },
  },
  money: { header: moneyEntries },
};

const reverseSchema = z.object({
  id: rowId, // the reversal's own id, made by the client (SRS §3)
  table: z.enum(["purchase", "sale", "return", "money"]),
  reversesId: rowId,
  date,
  forMonth: optional(month),
});

/** Sales or returns that aren't reversals and aren't reversed (SQL, on alias `x`). */
const live = (table: string) =>
  sql.raw(
    `x.reverses_id is null and not exists (select 1 from ${table} y where y.reverses_id = x.id)`,
  );

/** What still depends on the original, so it can't be reversed yet (SRS §8, D-026). */
async function hasDependents(tx: Tx, table: EntryTable, original: Row): Promise<boolean> {
  const id = original.id;
  if (table === "purchase") {
    // Lock the lots, so a sale or return of them waits for this reversal (SRS §4).
    await tx.select().from(purchaseLines).where(eq(purchaseLines.purchaseId, id)).for("update");
    const rows = await tx.execute(sql`
      select 1 from sale_lines sl join sales x on x.id = sl.sale_id
      join purchase_lines l on l.id = sl.lot_id
      where l.purchase_id = ${id} and ${live("sales")}
      union all
      select 1 from return_lines rl join returns x on x.id = rl.return_id
      join purchase_lines l on l.id = rl.lot_id
      where l.purchase_id = ${id} and ${live("returns")}
      limit 1`);
    return rows.length > 0;
  }
  if (table === "sale") {
    const rows = await tx.execute(sql`
      select 1 from return_lines rl join returns x on x.id = rl.return_id
      join sale_lines sl on sl.id = rl.sale_line_id
      where sl.sale_id = ${id} and ${live("returns")}
      limit 1`);
    return rows.length > 0;
  }
  if (table === "return" && original.kind === "customer") {
    // The units it took back leave their lots again: they may have been sold since.
    const lines = await tx.select().from(returnLines).where(eq(returnLines.returnId, id));
    const lots = await stockLots(tx, {
      lotIds: [...new Set(lines.map((l) => l.lotId))],
      lock: true,
    });
    return lots.some(
      (lot) =>
        lot.remaining - lines.filter((l) => l.lotId === lot.id).reduce((n, l) => n + l.qty, 0) < 0,
    );
  }
  return false;
}

/** A row's content without its own id, stamps and invoice/receipt number (a reversal has none, D-036). */
const OWN = ["id", "createdAt", "updatedAt", "createdBy", "reversesId", "invoiceNo", "receiptNo"];
function content(row: Record<string, unknown>) {
  const rest = { ...row };
  for (const key of OWN) delete rest[key];
  return rest;
}

/** Reverse `reversesId` with a new entry `id` on `date` (and `forMonth` if the original has one). */
export async function reverseEntry(input: unknown) {
  const table = reverseSchema.shape.table.safeParse((input as { table?: unknown } | null)?.table);
  if (!table.success) return { status: "invalid" as const, errors: { form: "Unknown entry" } };
  const { header, lines } = TABLES[table.data];
  let original: Row | undefined;
  return runAction(
    {
      op: "reverse",
      table: header,
      schema: reverseSchema,
      guards: async ({ tx, values: v, calendar }) => {
        [original] = (await tx
          .select()
          .from(header)
          .where(eq(header.id, v.reversesId))
          .for("update")) as Row[];
        if (!original) return { form: CONFLICT };
        const errors = reverseErrors(original, {
          reversed: await isReversed(tx, header, original.id),
          hasDependents: await hasDependents(tx, table.data, original),
        });
        if (errors.form) return errors;
        const stored = original as Row & { date: string; forMonth?: string | null };
        if (stored.forMonth && !v.forMonth) return { forMonth: "Pick a month" };
        return reversalDateErrors(
          stored,
          { date: v.date, forMonth: stored.forMonth ? v.forMonth : null },
          calendar,
        );
      },
      write: async (tx, v, { userId }) => {
        const from = original as Row;
        const [row] = (await tx
          .insert(header)
          .values({
            ...content(from),
            id: v.id,
            reversesId: from.id,
            date: v.date,
            ...("forMonth" in from ? { forMonth: from.forMonth ? `${v.forMonth}-01` : null } : {}),
            createdBy: userId,
          } as never)
          .onConflictDoNothing()
          .returning()) as Row[];
        if (!row || !lines) return row ?? null;
        const stored = await tx.select().from(lines.table).where(eq(lines.parent, from.id));
        const copies = stored.map((l) => ({ ...content(l), [lines.key]: v.id, createdBy: userId }));
        return {
          ...row,
          lines: copies.length
            ? await tx
                .insert(lines.table)
                .values(copies as never)
                .returning()
            : [],
        };
      },
    },
    input,
  );
}
