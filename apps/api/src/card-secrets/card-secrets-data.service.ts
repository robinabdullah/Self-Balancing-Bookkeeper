import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { cardSecrets, cards, people } from "@mbl/db/schema";
import { cardName } from "@mbl/domain/setup";
import { DB } from "../db/db.module";

// Ref: src/server/card-secrets.ts (N-4.5), the read: D-046 (UIDD §4.14) pages get only the masked
// rows; the values leave the server only through the reveal (N-5.3). The writes are
// card-secrets.service.ts.

@Injectable()
export class CardSecretsDataService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The saved numbers: never a value, only the tag and the last 4 digits. A card's primary first. */
  async loadCardSecrets() {
    const rows = await this.db
      .select({
        id: cardSecrets.id,
        cardId: cardSecrets.cardId,
        supplementary: cardSecrets.supplementary,
        last4: cardSecrets.last4,
        updatedAt: cardSecrets.updatedAt,
        card: cards.name,
        network: cards.network,
        owner: people.name,
      })
      .from(cardSecrets)
      .innerJoin(cards, eq(cards.id, cardSecrets.cardId))
      .innerJoin(people, eq(people.id, cards.ownerPersonId))
      .orderBy(
        asc(people.name),
        asc(cards.name),
        asc(cards.network),
        asc(cardSecrets.cardId),
        asc(cardSecrets.supplementary),
        asc(cardSecrets.createdAt),
      );
    return rows.map((r) => ({
      ...r,
      display: cardName(r.card, r.owner, r.network),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
}

export type CardSecret = Awaited<ReturnType<CardSecretsDataService["loadCardSecrets"]>>[number];
