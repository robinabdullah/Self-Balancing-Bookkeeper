import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@mbl/db";
import { auditLog, cardSecrets, cards, people } from "@mbl/db/schema";
import {
  type CardDetails,
  FINGERPRINT_FAILED,
  NO_KEY,
  REVEAL_SECONDS,
  USE_FINGERPRINT,
} from "@mbl/domain/card-secrets";
import { cardName } from "@mbl/domain/setup";
import { rowId } from "@mbl/domain/validation/fields";
import {
  decryptField,
  hasCardKey,
  revealWindowOf,
  revealWindowOpen,
  signRevealWindow,
} from "@/server/card-crypto";
import { verifyAuthentication } from "@/server/passkeys";

// D-046 (UIDD §4.14): the saved card details. Pages get only the masked rows; the values leave
// the server only through `revealCardDetails` (the `no-store` reveal route), one number at a time,
// after a fingerprint (never a password: D-052), with a `reveal` audit row that holds no value.
// D-054: a fingerprint also opens a 30 s window (a signed cookie) in which any number reveals.

/** The saved numbers: never a value, only the tag and the last 4 digits. A card's primary first. */
export async function loadCardSecrets() {
  const rows = await db
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

export type CardSecret = Awaited<ReturnType<typeof loadCardSecrets>>[number];

/** The reveal route's answer: the details (and, after a fingerprint, the window's cookie value),
 * or an error message and its HTTP status. */
type Reveal =
  { status: 200; details: CardDetails; window?: string } | { status: number; error: string };

/** One saved number (`secretId`) of card `cardId`: by fingerprint (`passkey`), or within the
 * 30 s window a fingerprint opened (`window: true` + its cookie). */
export async function revealCardDetails(
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
    ? await db
        .select()
        .from(cardSecrets)
        .where(and(eq(cardSecrets.id, secretId as string), eq(cardSecrets.cardId, cardId)))
    : [];
  if (!row) return { status: 404, error: "No saved details for this card" };

  if (byFingerprint) {
    if (!(await verifyAuthentication(userId, passkey as never)))
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
  await db.insert(auditLog).values({
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

/** D-046: edit and remove need your own reveal of that number in the last 10 minutes. */
export async function recentReveal(
  tx: Pick<typeof db, "select">,
  userId: string,
  secretId: string,
  minutes: number,
) {
  const [hit] = await tx
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.table, "card_secrets"),
        eq(auditLog.rowId, secretId),
        eq(auditLog.action, "reveal"),
        eq(auditLog.userId, userId),
        sql`${auditLog.at} > now() - make_interval(mins => ${minutes})`,
      ),
    )
    .limit(1);
  return !!hit;
}
