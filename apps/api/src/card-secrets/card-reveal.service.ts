import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { auditLog, cardSecrets } from "@mbl/db/schema";
import {
  type CardDetails,
  FINGERPRINT_FAILED,
  NO_KEY,
  REVEAL_SECONDS,
  USE_FINGERPRINT,
} from "@mbl/domain/card-secrets";
import { rowId } from "@mbl/domain/validation/fields";
import { DB } from "../db/db.module";
import { Passkeys } from "../passkeys/passkeys";
import {
  decryptField,
  hasCardKey,
  revealWindowOf,
  revealWindowOpen,
  signRevealWindow,
} from "./card-crypto";

// Ref: src/server/card-secrets.ts (`revealCardDetails`, N-5.3). D-046 (UIDD §4.14): the values
// leave the server only here (the `no-store` reveal route), one number at a time, after a
// fingerprint (never a password: D-052), with a `reveal` audit row that holds no value.
// D-054: a fingerprint also opens a 30 s window (a signed cookie) in which any number reveals.

/** The reveal route's answer: the details (and, after a fingerprint, the window's cookie value),
 * or an error message and its HTTP status. */
export type Reveal =
  { status: 200; details: CardDetails; window?: string } | { status: number; error: string };

@Injectable()
export class CardRevealService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly passkeys: Passkeys,
  ) {}

  /** One saved number (`secretId`) of card `cardId`: by fingerprint (`passkey`), or within the
   * 30 s window a fingerprint opened (`window: true` + its cookie). */
  async revealCardDetails(
    userId: string,
    cardId: string,
    body: unknown,
    cookie: string | null = null,
  ): Promise<Reveal> {
    const { passkey, secretId, window } = (body ?? {}) as {
      passkey?: unknown;
      secretId?: unknown;
      window?: unknown;
    };
    const byFingerprint = typeof passkey === "object" && passkey !== null;
    if (!byFingerprint && window !== true) return { status: 400, error: USE_FINGERPRINT };
    if (!hasCardKey()) return { status: 503, error: NO_KEY };
    const [row] = rowId.safeParse(secretId).success
      ? await this.db
          .select()
          .from(cardSecrets)
          .where(and(eq(cardSecrets.id, secretId as string), eq(cardSecrets.cardId, cardId)))
      : [];
    if (!row) return { status: 404, error: "No saved details for this card" };

    if (byFingerprint) {
      if (!(await this.passkeys.verifyAuthentication(userId, passkey as never)))
        return { status: 401, error: FINGERPRINT_FAILED };
    } else if (!revealWindowOpen(revealWindowOf(cookie), userId, Date.now()))
      return { status: 401, error: USE_FINGERPRINT };

    const open = (text: string | null) => (text === null ? null : decryptField(text, cardId));
    let details: CardDetails;
    try {
      details = {
        holder: open(row.holder),
        number: open(row.number)!,
        expiry: open(row.expiry),
        cvv: open(row.cvv),
      };
    } catch (error) {
      return { status: 500, error: (error as Error).message };
    }
    await this.db.insert(auditLog).values({
      table: "card_secrets",
      rowId: row.id,
      action: "reveal",
      after: { card: cardId, via: byFingerprint ? "fingerprint" : "window" },
      userId,
      createdBy: userId,
    });
    if (!byFingerprint) return { status: 200, details };
    return {
      status: 200,
      details,
      window: signRevealWindow(userId, Date.now() + REVEAL_SECONDS * 1000),
    };
  }
}
