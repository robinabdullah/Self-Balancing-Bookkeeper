import { Injectable } from "@nestjs/common";
import { type AnyColumn, and, eq, sql } from "drizzle-orm";
import type { Tx } from "@mbl/db/client";
import { customers, moneyEntries } from "@mbl/db/schema";
import { deleteErrors, walkInErrors } from "@mbl/domain/guards";
import { toDecimal } from "@mbl/domain/money";
import { type MoneyEntryValues, moneyEntrySchema } from "@mbl/domain/validation/money-entry";
import { type Row, Runner, byId, isReversed } from "../action/runner";
import { nextReceiptNo } from "../numbers";

// Ref: src/server/actions/money.ts (N-3.2). Money entries add/edit and Undo (PRD §4.2; SRS §4
// money_entries, §5; UIDD §4.6; D-005, D-007, D-009): every single-amount type through one schema
// and one table. The schema keeps only the type's own fields; every other column is stored as
// null, so an edit clears what no longer applies. An edit keeps the type (and a customer payment
// its receipt number, given at save, D-036). The Journal (3.8) deletes with `deleteMoneyEntry` too.

/** Every column the form writes; a field the type doesn't have is null. */
function columns(v: MoneyEntryValues) {
  const f: Partial<{
    forMonth: string | null;
    customerId: string | null;
    supplierId: string | null;
    cardId: string | null;
    personId: string | null;
    source: "cash" | "card";
    category: string;
    cardCharged: number;
    cashReceived: number;
    settleMode: "received" | "added_to_due";
  }> = v;
  const decimal = (p: number | undefined) => (p === undefined ? null : toDecimal(p));
  return {
    type: v.type,
    date: v.date,
    amount: toDecimal(v.amount),
    forMonth: f.forMonth ? `${f.forMonth}-01` : null,
    customerId: f.customerId ?? null,
    supplierId: f.supplierId ?? null,
    cardId: f.cardId ?? null,
    personId: f.personId ?? null,
    source: f.source ?? null,
    category: f.category ?? null,
    cardCharged: decimal(f.cardCharged),
    cashReceived: decimal(f.cashReceived),
    settleMode: f.settleMode ?? null,
    openingKind: v.type === "opening_correction" ? v.openingKind : null,
    note: v.note,
  };
}

const same = (col: AnyColumn, value: string | null) => sql`${col} is not distinct from ${value}`;

async function walkInId(tx: Tx) {
  const [walkIn] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.isSystem, true));
  return walkIn?.id ?? "";
}

@Injectable()
export class MoneyService {
  constructor(private readonly runner: Runner) {}

  /** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
  saveMoneyEntry(input: unknown) {
    const op = (input as { updatedAt?: unknown } | null)?.updatedAt ? "update" : "insert";
    return this.runner.runAction(
      {
        op,
        table: moneyEntries,
        schema: moneyEntrySchema,
        // SRS §2.3: same type, counterparty, amount and date.
        duplicate: (v) => {
          const c = columns(v);
          return and(
            eq(moneyEntries.type, v.type),
            eq(moneyEntries.date, v.date),
            eq(moneyEntries.amount, c.amount),
            same(moneyEntries.customerId, c.customerId),
            same(moneyEntries.supplierId, c.supplierId),
            same(moneyEntries.cardId, c.cardId),
            same(moneyEntries.personId, c.personId),
          );
        },
        guards: async ({ tx, values: v, current }) => {
          if (current && current.type !== v.type)
            return { type: "An entry's type can't change — delete it and enter the other type" };
          const { customerId } = columns(v);
          return customerId
            ? walkInErrors({ table: "money", type: v.type, customerId }, await walkInId(tx))
            : {};
        },
        write: async (tx, v, { userId }) => {
          if (op === "update") {
            const [r] = await tx
              .update(moneyEntries)
              .set(columns(v))
              .where(eq(moneyEntries.id, v.id))
              .returning();
            return r;
          }
          const [r] = await tx
            .insert(moneyEntries)
            .values({
              ...columns(v),
              id: v.id,
              receiptNo: v.type === "customer_payment" ? nextReceiptNo : null,
              createdBy: userId,
            })
            .onConflictDoNothing({ target: moneyEntries.id })
            .returning();
          return r ?? null;
        },
      },
      input,
    );
  }

  /** Undo of a new money entry (D-010): not once it has a reversal (SRS §8). */
  deleteMoneyEntry(input: unknown) {
    return this.runner.runAction(
      {
        op: "delete",
        table: moneyEntries,
        schema: byId,
        guards: async ({ tx, values, current, calendar }) => {
          const deps = {
            reversed: await isReversed(tx, moneyEntries, values.id),
            hasDependents: false,
          };
          return deleteErrors(current as Row & { date: string }, deps, calendar.lastClosed);
        },
      },
      input,
    );
  }
}
