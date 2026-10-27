import { Inject, Injectable } from "@nestjs/common";
import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { cards, customers, models, people, suppliers } from "@mbl/db/schema";
import { cardName, customerName, partnerWarning } from "@mbl/domain/setup";
import { memo } from "../auth/memo";
import { DB } from "../db/db.module";

// Ref: src/server/setup.ts (N-4.1). The Setup screen's lists (UIDD §4.11). `updatedAt` goes to the
// client as ISO text: edit, deactivate and delete send it back (D-010). The writes are
// setup.service.ts.

const stamp = <R extends { updatedAt: Date }>(
  row: R,
): Omit<R, "updatedAt"> & { updatedAt: string } => ({
  ...row,
  updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class SetupDataService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Loaded once per render (memo.ts, D-032): the layout, page and entry sheet share it. */
  loadSetup() {
    return memo("setup", async () => {
      const [peopleRows, cardRows, customerRows, supplierRows, modelRows] = await Promise.all([
        this.db.select().from(people).orderBy(asc(people.name)),
        this.db
          .select({ card: cards, owner: people.name })
          .from(cards)
          .innerJoin(people, eq(people.id, cards.ownerPersonId))
          .orderBy(asc(people.name), asc(cards.name), asc(cards.network)),
        this.db
          .select()
          .from(customers)
          .orderBy(
            desc(customers.isSystem),
            asc(customers.proprietorName),
            asc(customers.shopName),
          ),
        this.db.select().from(suppliers).orderBy(asc(suppliers.name)),
        this.db.select().from(models).orderBy(asc(models.name)),
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
  }
}

export type SetupData = Awaited<ReturnType<SetupDataService["loadSetup"]>>;
