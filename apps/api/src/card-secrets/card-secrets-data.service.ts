import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { cardSecrets, cards, people } from "@mbl/db/schema";
import { cardName } from "@mbl/domain/setup";
import { memo } from "../auth/memo";
import { DB } from "../db/db.module";
import { decryptField, hasCardKey } from "./card-crypto";

// Ref: src/server/card-secrets.ts (N-4.5), the read: D-046 (UIDD §4.14) pages get only the masked
// rows; the values leave the server only through the reveal (N-5.3). The writes are
// card-secrets.service.ts. D-079: the alerts read the month of each primary expiry, and only that.

@Injectable()
export class CardSecretsDataService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * D-079 (SRS §11, §15): each card's primary saved expiry, as its month only (1–12), for the
   * annual fee alert. No fingerprint: the number, holder, year and CVV are never read, and nothing
   * is logged, audited or returned but the month. Every page's shell reads it, so it never throws:
   * no key → {}, an unreadable row is skipped, a failed query → {}. Once per render (`memo`).
   */
  expiryMonths(): Promise<Record<string, number>> {
    return memo("expiry-months", async () => {
      if (!hasCardKey()) return {};
      try {
        const rows = await this.db
          .select({ cardId: cardSecrets.cardId, expiry: cardSecrets.expiry })
          .from(cardSecrets)
          .where(eq(cardSecrets.supplementary, false));
        const months: Record<string, number> = {};
        for (const { cardId, expiry } of rows) {
          if (!expiry) continue;
          try {
            const mm = /^(0[1-9]|1[0-2])/.exec(decryptField(expiry, cardId))?.[1];
            if (mm) months[cardId] = Number(mm);
          } catch {
            // An unreadable row: no fee alert for that card (Saved details shows the error).
          }
        }
        return months;
      } catch {
        return {};
      }
    });
  }

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
