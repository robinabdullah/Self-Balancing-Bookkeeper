"use server";

import { and, eq, ne } from "drizzle-orm";
import { cardSecrets, cards, people } from "@mbl/db/schema";
import type { Errors } from "@mbl/domain/guards";
import {
  DUPLICATE_NUMBER,
  EDIT_AFTER_REVEAL_MINUTES,
  NO_KEY,
  ONE_PRIMARY,
  REVEAL_FIRST,
} from "@mbl/domain/card-secrets";
import { cardName } from "@mbl/domain/setup";
import { cardDetailsSchema } from "@mbl/domain/validation/card-secrets";
import { type Row, type Tx, byId, runAction } from "@/server/action";
import { decryptField, encryptField, hasCardKey } from "@/server/card-crypto";
import { recentReveal } from "@/server/card-secrets";

// D-046 (UIDD §4.14): add, edit or remove a saved card number through the action helper. The
// values are encrypted before they are stored, and the audit rows say only which card and what
// happened, never a value (the helper's default "before" would copy the ciphertext). Edit and
// Remove need your own reveal of that number in the last 10 minutes; adding needs none.
// D-054: a card holds its primary and supplementary numbers, at most one primary.
// D-067: a number is saved on one card only.

const auditOf = (current: Row) => ({ card: current.cardId });

async function revealed(tx: Tx, userId: string, current: Row | null): Promise<Errors> {
  return current && (await recentReveal(tx, userId, current.id, EDIT_AFTER_REVEAL_MINUTES))
    ? {}
    : { form: REVEAL_FIRST };
}

/** D-054: a second primary on the card is refused (the unique index backs this up). */
async function onePrimary(tx: Tx, cardId: string, id: string): Promise<Errors> {
  const [has] = await tx
    .select({ id: cardSecrets.id })
    .from(cardSecrets)
    .where(
      and(
        eq(cardSecrets.cardId, cardId),
        eq(cardSecrets.supplementary, false),
        ne(cardSecrets.id, id),
      ),
    );
  return has ? { tag: ONE_PRIMARY } : {};
}

/**
 * D-067: a number already saved on any other row (another card, or this card's other number) is
 * refused, naming its card. The numbers are sealed per card, so only the rows with the same last 4
 * digits are opened and compared.
 */
async function uniqueNumber(tx: Tx, number: string, id: string): Promise<Errors> {
  const rows = await tx
    .select({
      cardId: cardSecrets.cardId,
      number: cardSecrets.number,
      card: cards.name,
      network: cards.network,
      owner: people.name,
    })
    .from(cardSecrets)
    .innerJoin(cards, eq(cards.id, cardSecrets.cardId))
    .innerJoin(people, eq(people.id, cards.ownerPersonId))
    .where(and(eq(cardSecrets.last4, number.slice(-4)), ne(cardSecrets.id, id)));
  const same = rows.find((r) => decryptField(r.number, r.cardId) === number);
  return same
    ? { number: `${DUPLICATE_NUMBER} ${cardName(same.card, same.owner, same.network)}` }
    : {};
}

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
export async function saveCardDetails(input: unknown) {
  const op = (input as { updatedAt?: unknown } | null)?.updatedAt ? "update" : "insert";
  return runAction(
    {
      op,
      table: cardSecrets,
      schema: cardDetailsSchema,
      before: async (_tx, current) => auditOf(current),
      guards: async ({ tx, values, userId, current }): Promise<Errors> => {
        if (!hasCardKey()) return { form: NO_KEY };
        let errors: Errors;
        if (op === "update") {
          errors = await revealed(tx, userId, current);
          if (errors.form) return errors;
          if (values.tag === "primary")
            errors = await onePrimary(tx, current!.cardId as string, values.id);
        } else {
          const [card] = await tx
            .select({ id: cards.id })
            .from(cards)
            .where(eq(cards.id, values.cardId));
          if (!card) return { cardId: "Pick the card" };
          errors = values.tag === "primary" ? await onePrimary(tx, values.cardId, values.id) : {};
        }
        return Object.keys(errors).length ? errors : uniqueNumber(tx, values.number, values.id);
      },
      write: async (tx, v, { userId, current }) => {
        const cardId = op === "update" ? (current!.cardId as string) : v.cardId;
        const seal = (text: string | null) => (text === null ? null : encryptField(text, cardId));
        const row = {
          supplementary: v.tag === "supplementary",
          number: seal(v.number)!,
          holder: seal(v.holder),
          expiry: seal(v.expiry),
          cvv: seal(v.cvv),
          last4: v.number.slice(-4),
        };
        if (op === "update") {
          await tx.update(cardSecrets).set(row).where(eq(cardSecrets.id, v.id));
          return { card: cardId, details: "changed" };
        }
        const [r] = await tx
          .insert(cardSecrets)
          .values({ id: v.id, cardId, ...row, createdBy: userId })
          .onConflictDoNothing({ target: cardSecrets.id })
          .returning({ id: cardSecrets.id });
        return r ? { card: cardId, details: "added" } : null;
      },
    },
    input,
  );
}

export async function removeCardDetails(input: unknown) {
  return runAction(
    {
      op: "delete",
      table: cardSecrets,
      schema: byId,
      before: async (_tx, current) => auditOf(current),
      guards: ({ tx, userId, current }) => revealed(tx, userId, current),
    },
    input,
  );
}
