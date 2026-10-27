import "server-only";
import { type SQL, and, asc, eq, getTableName, max, min, ne, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, monthCloses, moneyEntries, profiles, purchases } from "@/db/schema";
import { dhakaToday, monthOf } from "@/lib/dates";
import { type Calendar, type Errors, dateErrors, editErrors, pairEditErrors } from "@/lib/guards";
import { rowId } from "@/lib/validation/fields";
import { requirePartner } from "@/server/auth";

// The one write path (SRS §2.3, §3; D-010). Every server action calls `runAction`:
// requirePartner → Zod → (in one transaction) the `updated_at` check or the double-submit no-op →
// duplicate check → guards → write → audit row → revalidatePath.

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Any app table: they all have the common columns (SRS §4). */
export type AppTable = PgTable & {
  id: PgColumn;
  createdAt: PgColumn;
  updatedAt: PgColumn;
  createdBy: PgColumn;
};

/** The stored (header) row, read under `FOR UPDATE`. */
export type Row = Record<string, unknown> & { id: string; updatedAt: Date };

/** insert/reverse create a row (reverse = a new entry with `reverses_id`, SRS §8); Undo = delete. */
export type Op = "insert" | "reverse" | "update" | "delete";

export type Result =
  | { status: "ok"; id: string; updatedAt: string | null } // null after a delete
  | { status: "duplicate"; id: string; by: string; at: string }
  | { status: "conflict"; message: string }
  | { status: "invalid"; errors: Errors };

type Ctx = { userId: string; current: Row | null };

type Spec<T extends { id: string }> = {
  op: Op;
  /** The header table: the row that is locked, audited and stamped. */
  table: AppTable;
  schema: z.ZodType<T>;
  /** The audit row's action when it isn't the op's own (a month close or re-open, SRS §7). */
  audit?: "close" | "reopen";
  /** New entries only: the "similar entry" condition (same type, counterparty, amount, date). */
  duplicate?: (values: T) => SQL | undefined;
  /** Header+lines entries: the audit "before" with the lines (default: the header row). */
  before?: (tx: Tx, current: Row) => Promise<unknown>;
  /** Entity guards (dependents, lots, Walk-in …). The date and lock guards always run. */
  guards?: (g: Ctx & { tx: Tx; values: T; calendar: Calendar }) => Errors | Promise<Errors>;
} & (
  | { op: "delete"; write?: (tx: Tx, values: T, ctx: Ctx) => Promise<unknown> }
  /** Inserts use `on conflict (id) do nothing`; returns the audit "after", or null if nothing was written. */
  | {
      op: "insert" | "reverse" | "update";
      write: (tx: Tx, values: T, ctx: Ctx) => Promise<unknown>;
    }
);

export const CONFLICT = "Someone else changed this entry — reload";

/** A delete or Undo sends only the id (and `updatedAt`). */
export const byId = z.object({ id: rowId });

// What the client sends besides the form values: the row's `updatedAt` it saw (edit, delete,
// Undo) and `confirmDuplicate` ("Save anyway").
const meta = z.object({
  id: rowId,
  updatedAt: z.string().optional(),
  confirmDuplicate: z.boolean().optional(),
});

const AUDIT = { insert: "insert", reverse: "reverse", update: "update", delete: "delete" } as const;

function fieldErrors(error: z.ZodError): Errors {
  const errors: Errors = {};
  for (const issue of error.issues) errors[issue.path.join(".") || "form"] ??= issue.message;
  return errors;
}

/** Today (Dhaka), the opening date (the opening items' date) and the last closed month. */
export async function loadCalendar(tx: Tx | typeof db = db): Promise<Calendar> {
  // Side by side: one round trip, not three (D-032).
  const [[money], [stock], [close]] = await Promise.all([
    tx
      .select({ date: min(moneyEntries.date) })
      .from(moneyEntries)
      .where(eq(moneyEntries.type, "opening")),
    tx
      .select({ date: min(purchases.date) })
      .from(purchases)
      .where(eq(purchases.source, "opening")),
    tx.select({ month: max(monthCloses.month) }).from(monthCloses),
  ]);
  const dates = [money?.date, stock?.date].filter((d): d is string => !!d).sort();
  return {
    today: dhakaToday(),
    openingDate: dates[0] ?? null,
    lastClosed: close?.month ? monthOf(close.month) : null,
  };
}

/** True if an entry table (with `reverses_id`) has a reversal of `id` (SRS §8). */
export async function isReversed(tx: Tx, table: AppTable, id: string) {
  const rows = await tx.execute(sql`select 1 from ${table} where reverses_id = ${id} limit 1`);
  return rows.length > 0;
}

type Dated = { date: string; forMonth?: string | null };
const dated = (v: unknown): v is Dated =>
  typeof v === "object" && v !== null && typeof (v as Dated).date === "string";

export async function runAction<T extends { id: string }>(
  spec: Spec<T>,
  input: unknown,
): Promise<Result> {
  const profile = await requirePartner();
  const userId = profile.userId;

  const m = meta.safeParse(input);
  if (!m.success) return { status: "invalid", errors: fieldErrors(m.error) };
  const parsed = spec.schema.safeParse(input);
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error) };
  const values = parsed.data;
  const { id, updatedAt, confirmDuplicate } = m.data;
  const { op, table } = spec;

  const result = await db.transaction(async (tx): Promise<Result> => {
    const [current] = (await tx
      .select()
      .from(table)
      .where(eq(table.id, id))
      .for("update")) as Row[];
    if (op === "update" || op === "delete") {
      if (!current || !updatedAt || current.updatedAt.getTime() !== Date.parse(updatedAt))
        return { status: "conflict", message: CONFLICT };
    } else if (current) {
      // The same id again (a double submit): already saved, nothing to do.
      return { status: "ok", id, updatedAt: current.updatedAt.toISOString() };
    }

    const similar = op === "insert" && !confirmDuplicate && spec.duplicate?.(values);
    if (similar) {
      const [match] = await tx
        .select({ id: table.id, at: table.createdAt, by: profiles.name })
        .from(table)
        .leftJoin(profiles, eq(profiles.userId, table.createdBy))
        .where(and(similar, ne(table.id, id)))
        .orderBy(asc(table.createdAt))
        .limit(1);
      if (match)
        return {
          status: "duplicate",
          id: match.id as string,
          by: match.by ?? "someone",
          at: (match.at as Date).toISOString(),
        };
    }

    const calendar = await loadCalendar(tx);
    // Lock rule (SRS §7): a locked row can't be edited or deleted, whatever else the form says.
    const locked = current && dated(current) ? editErrors(current, calendar.lastClosed) : {};
    if (locked.form) return { status: "invalid", errors: locked };
    const errors: Errors = {
      ...(op !== "delete" && dated(values) ? dateErrors(values, calendar) : {}),
      // D-026: neither side of a reversal pair can be edited.
      ...(op === "update" && current && "reversesId" in current
        ? pairEditErrors(current, await isReversed(tx, table, id))
        : {}),
      ...(await spec.guards?.({ tx, values, calendar, userId, current: current ?? null })),
    };
    if (Object.keys(errors).length) return { status: "invalid", errors };

    const ctx = { userId, current: current ?? null };
    const before = current && spec.before ? await spec.before(tx, current) : (current ?? null);
    const audit = (after: unknown) =>
      tx.insert(auditLog).values({
        table: getTableName(table),
        rowId: id,
        action: spec.audit ?? AUDIT[op],
        before,
        after,
        userId,
        createdBy: userId,
      });

    if (spec.op === "delete") {
      await (spec.write ? spec.write(tx, values, ctx) : tx.delete(table).where(eq(table.id, id)));
      await audit(null);
      return { status: "ok", id, updatedAt: null };
    }

    if (op === "update")
      await tx
        .update(table)
        .set({ updatedAt: sql`now()` })
        .where(eq(table.id, id));
    const after = await spec.write(tx, values, ctx);
    if (after != null) await audit(after);
    const [saved] = await tx
      .select({ updatedAt: table.updatedAt })
      .from(table)
      .where(eq(table.id, id));
    return { status: "ok", id, updatedAt: (saved.updatedAt as Date).toISOString() };
  });

  if (result.status === "ok") revalidatePath("/", "layout"); // every page reads computeBooks
  return result;
}
