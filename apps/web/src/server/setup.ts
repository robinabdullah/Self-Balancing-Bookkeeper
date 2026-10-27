import "server-only";
import { cache } from "react";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@mbl/db";
import { cards, customers, models, people, suppliers } from "@mbl/db/schema";
import { cardName, customerName, partnerWarning } from "@mbl/domain/setup";

// The Setup screen's lists (UIDD §4.11). `updatedAt` goes to the client as ISO text: edit,
// deactivate and delete send it back (D-010).

const stamp = <R extends { updatedAt: Date }>(
  row: R,
): Omit<R, "updatedAt"> & { updatedAt: string } => ({
  ...row,
  updatedAt: row.updatedAt.toISOString(),
});

/** Loaded once per request (`cache`, D-032): the layout, page and entry sheet share it. */
export const loadSetup = cache(async () => {
  const [peopleRows, cardRows, customerRows, supplierRows, modelRows] = await Promise.all([
    db.select().from(people).orderBy(asc(people.name)),
    db
      .select({ card: cards, owner: people.name })
      .from(cards)
      .innerJoin(people, eq(people.id, cards.ownerPersonId))
      .orderBy(asc(people.name), asc(cards.name), asc(cards.network)),
    db
      .select()
      .from(customers)
      .orderBy(desc(customers.isSystem), asc(customers.proprietorName), asc(customers.shopName)),
    db.select().from(suppliers).orderBy(asc(suppliers.name)),
    db.select().from(models).orderBy(asc(models.name)),
  ]);
  return {
    people: peopleRows.map(stamp),
    partnerWarning: partnerWarning(peopleRows),
    cards: cardRows.map(({ card, owner }) => ({
      ...stamp(card),
      owner,
      display: cardName(card.name, owner, card.network),
    })),
    customers: customerRows.map((c) => ({
      ...stamp(c),
      display: customerName(c),
      shopNameMissing: !c.isSystem && !c.shopName,
    })),
    suppliers: supplierRows.map(stamp),
    models: modelRows.map(stamp),
  };
});

export type SetupData = Awaited<ReturnType<typeof loadSetup>>;
