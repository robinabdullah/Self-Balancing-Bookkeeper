"use server";

import { and, eq, ne } from "drizzle-orm";
import { cardBillDates } from "@/db/schema";
import type { Errors } from "@mbl/domain/guards";
import { cardBillDateSchema } from "@mbl/domain/validation/setup";
import { byId, runAction } from "@/server/action";

// UIDD §4.8 (task 4.4.2; D-020): a card bill's real statement/due dates (`card_bill_dates`,
// overrides only, SRS §6). One row per card and bill month: add (no `updatedAt`) or edit it. Undo
// deletes a new row. Not an entry: no date or month-lock guards, and a future due date is normal.

const TAKEN = "These dates were just set by someone else — reload";

export async function saveBillDates(input: unknown) {
  const op = (input as { updatedAt?: unknown } | null)?.updatedAt ? "update" : "insert";
  return runAction(
    {
      op,
      table: cardBillDates,
      schema: cardBillDateSchema,
      guards: async ({ tx, values }): Promise<Errors> => {
        const [other] = await tx
          .select({ id: cardBillDates.id })
          .from(cardBillDates)
          .where(
            and(
              eq(cardBillDates.cardId, values.cardId),
              eq(cardBillDates.billMonth, `${values.billMonth}-01`),
              ne(cardBillDates.id, values.id),
            ),
          )
          .limit(1);
        return other ? { form: TAKEN } : {};
      },
      write: async (tx, v, { userId }) => {
        const row = {
          cardId: v.cardId,
          billMonth: `${v.billMonth}-01`,
          actualStatementDate: v.actualStatementDate,
          actualDueDate: v.actualDueDate,
        };
        if (op === "update") {
          const [r] = await tx
            .update(cardBillDates)
            .set(row)
            .where(eq(cardBillDates.id, v.id))
            .returning();
          return r;
        }
        const [r] = await tx
          .insert(cardBillDates)
          .values({ ...row, id: v.id, createdBy: userId })
          .onConflictDoNothing({ target: cardBillDates.id })
          .returning();
        return r ?? null;
      },
    },
    input,
  );
}

/** Undo of a new row: the bill goes back to the card's usual days. */
export async function deleteBillDates(input: unknown) {
  return runAction({ op: "delete", table: cardBillDates, schema: byId }, input);
}
