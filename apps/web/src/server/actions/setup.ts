"use server";

import { type SQL, and, eq, is, isNull, ne, sql } from "drizzle-orm";
import { type PgColumn, PgTable, getTableConfig } from "drizzle-orm/pg-core";
import type { z } from "zod";
import * as schema from "@/db/schema";
import {
  bankAccounts,
  cardSecrets,
  cards,
  customers,
  models,
  people,
  suppliers,
} from "@/db/schema";
import type { Errors } from "@mbl/domain/guards";
import { toDecimal } from "@mbl/domain/money";
import { BUILT_IN, type SetupKind, USED, setupKinds } from "@mbl/domain/setup";
import {
  activeSchema,
  cardSchema,
  customerSchema,
  modelSchema,
  personSchema,
  supplierSchema,
} from "@mbl/domain/validation/setup";
import { type AppTable, type Row, type Tx, byId, runAction } from "@/server/action";

// Setup add/edit, deactivate/activate and delete (PRD §4.1; SRS §4 Setup; UIDD §4.11; D-023).
// Each goes through `runAction`; the guards here add uniqueness, Walk-in being read-only and
// "deactivate instead of delete once used". The partners' total is only a warning (D-023).

const tables: Record<SetupKind, AppTable> = {
  person: people,
  card: cards,
  customer: customers,
  supplier: suppliers,
  model: models,
};

function tableOf(kind: SetupKind) {
  if (!setupKinds.includes(kind)) throw new Error("Unknown setup list");
  return tables[kind];
}

/** D-023: Walk-in (`is_system`) can't be edited, deactivated or deleted. */
const builtIn = ({ current }: { current: Row | null }): Errors =>
  current?.isSystem ? { form: BUILT_IN } : {};

const NAME_USED = "This name is already used";

/** [field, the matching rows, message]: another row matching is a clash. */
type Unique = [field: string, where: SQL | undefined, message: string];

async function taken(tx: Tx, table: AppTable, where: SQL | undefined, id: string) {
  const [row] = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(where, ne(table.id, id)))
    .limit(1);
  return !!row;
}

/**
 * True if any row points at `id` through a foreign key; the keys come from the schema. A cascading
 * key is a saved detail (bank accounts, card details, D-036): it goes with its owner instead.
 */
async function used(tx: Tx, table: AppTable, id: string) {
  const columns = (Object.values(schema) as unknown[])
    .filter((t): t is PgTable => is(t, PgTable))
    .flatMap((t) => getTableConfig(t).foreignKeys)
    .filter((fk) => fk.onDelete !== "cascade")
    .map((fk) => fk.reference())
    .filter((ref) => ref.foreignTable === table)
    .map((ref) => ref.columns[0]);
  for (const column of columns) {
    const [row] = await tx
      .select({ one: sql`1` })
      .from(column.table)
      .where(eq(column, id))
      .limit(1);
    if (row) return true;
  }
  return false;
}

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
function save<T extends { id: string }>(
  table: AppTable,
  schema: z.ZodType<T>,
  input: unknown,
  toRow: (v: T) => Record<string, unknown>,
  unique: (v: T) => Unique[],
) {
  const op = (input as { updatedAt?: unknown } | null)?.updatedAt ? "update" : "insert";
  return runAction(
    {
      op,
      table,
      schema,
      guards: async ({ tx, values, current }) => {
        const errors = builtIn({ current });
        if (errors.form) return errors;
        for (const [field, where, message] of unique(values))
          if (await taken(tx, table, where, values.id)) errors[field] ??= message;
        return errors;
      },
      write: async (tx, v, { userId }) => {
        const row = toRow(v);
        if (op === "update") {
          const [r] = await tx.update(table).set(row).where(eq(table.id, v.id)).returning();
          return r;
        }
        const [r] = await tx
          .insert(table)
          .values({ ...row, createdBy: userId })
          .onConflictDoNothing({ target: table.id })
          .returning();
        return r ?? null;
      },
    },
    input,
  );
}

const decimal = (poisha: number | null) => (poisha === null ? null : toDecimal(poisha));

export async function savePerson(input: unknown) {
  return save(
    people,
    personSchema,
    input,
    (v) => ({ ...v, profitSharePct: v.profitSharePct === null ? null : String(v.profitSharePct) }),
    (v) => [["name", eq(people.name, v.name), NAME_USED]],
  );
}

export async function saveCard(input: unknown) {
  return save(
    cards,
    cardSchema,
    input,
    (v) => ({ ...v, creditLimit: decimal(v.creditLimit) }),
    (v) => [
      [
        "name",
        and(
          eq(cards.ownerPersonId, v.ownerPersonId),
          eq(cards.name, v.name),
          eq(cards.network, v.network),
        ),
        "This owner already has a card with this name and type",
      ],
    ],
  );
}

export async function saveCustomer(input: unknown) {
  return save(
    customers,
    customerSchema,
    input,
    (v) => ({ ...v, targetBalance: decimal(v.targetBalance) }),
    (v) => [
      v.shopName
        ? ["shopName", eq(customers.shopName, v.shopName), "This shop name is already used"]
        : [
            "proprietorName",
            and(eq(customers.proprietorName, v.proprietorName), isNull(customers.shopName)),
            "A customer with this name has no shop name — add one to tell them apart",
          ],
    ],
  );
}

export async function saveSupplier(input: unknown) {
  return save(
    suppliers,
    supplierSchema,
    input,
    (v) => v,
    (v) => [["name", eq(suppliers.name, v.name), NAME_USED]],
  );
}

export async function saveModel(input: unknown) {
  return save(
    models,
    modelSchema,
    input,
    (v) => v,
    (v) => [["name", eq(models.name, v.name), NAME_USED]],
  );
}

/** Deactivated rows stay in the books but are hidden in pickers (UIDD §4.11). */
export async function setActive(kind: SetupKind, input: unknown) {
  const table = tableOf(kind);
  return runAction(
    {
      op: "update",
      table,
      schema: activeSchema,
      guards: builtIn,
      write: async (tx, v) => {
        const [r] = await tx
          .update(table)
          .set({ active: v.active })
          .where(eq(table.id, v.id))
          .returning();
        return r;
      },
    },
    input,
  );
}

/** The saved bank accounts' owner column per kind (D-039). */
const bankOwner: Partial<Record<SetupKind, PgColumn>> = {
  person: bankAccounts.personId,
  customer: bankAccounts.customerId,
  supplier: bankAccounts.supplierId,
};

/**
 * Only a row nothing points to can be deleted; otherwise deactivate it (UIDD §4.11). Its saved
 * bank accounts go with it (a database cascade) and are listed in its audit row (D-039); a card's
 * saved details too, noted without their values (D-046).
 */
export async function removeRow(kind: SetupKind, input: unknown) {
  const table = tableOf(kind);
  return runAction(
    {
      op: "delete",
      table,
      schema: byId,
      before: async (tx, current) => {
        const owner = bankOwner[kind];
        const accounts = owner
          ? await tx.select().from(bankAccounts).where(eq(owner, current.id))
          : [];
        // D-046: a card's saved details go with it; the audit says so, never their values.
        const details =
          kind === "card" &&
          (
            await tx
              .select({ id: cardSecrets.id })
              .from(cardSecrets)
              .where(eq(cardSecrets.cardId, current.id))
          ).length > 0;
        return {
          ...current,
          ...(accounts.length ? { bankAccounts: accounts } : {}),
          ...(details ? { cardDetails: true } : {}),
        };
      },
      guards: async ({ tx, values, current }) => {
        const errors = builtIn({ current });
        if (errors.form) return errors;
        return (await used(tx, table, values.id)) ? { form: USED } : {};
      },
    },
    input,
  );
}
