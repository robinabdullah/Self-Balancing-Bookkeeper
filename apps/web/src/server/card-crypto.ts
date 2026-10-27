import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { NO_KEY } from "@mbl/domain/card-secrets";

// D-046 (SRS §11): each saved card field is AES-256-GCM ciphertext, with the card's id bound in
// as the extra data, so a value moved to another card can't be read. The key `CARD_SECRET_KEY`
// (32 bytes, base64) is only in the server's env. Errors never carry a value.

const UNREADABLE = "Card details can't be read — check the server key";

/** The key, or an error ("not set up") when it is missing or not 32 bytes. */
export function cardKey(text = process.env.CARD_SECRET_KEY): Buffer {
  const key = text ? Buffer.from(text, "base64") : null;
  if (!key || key.length !== 32) throw new Error(NO_KEY);
  return key;
}

export function hasCardKey() {
  try {
    cardKey();
    return true;
  } catch {
    return false;
  }
}

/** "v1.<iv>.<tag>.<ciphertext>", each base64url. */
export function encryptField(plain: string, cardId: string, key = cardKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(cardId));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => p.toString("base64url")).join(".");
}

export function decryptField(text: string, cardId: string, key = cardKey()) {
  const [version, iv, tag, data] = text.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) throw new Error(UNREADABLE);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(cardId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(UNREADABLE);
  }
}

// D-054: one fingerprint opens a 30 s reveal window, held in an httpOnly cookie
// "<user id>.<end ms>.<HMAC-SHA256>" whose key is derived from the card key. The end is signed, so
// it can't be moved; nothing is stored.
/** The reveal window's cookie (httpOnly, `Path=/cards`). */
export const REVEAL_WINDOW_COOKIE = "card_reveal";

/** The reveal window's cookie value, from a `Cookie` header. */
export const revealWindowOf = (cookie: string | null) =>
  cookie
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${REVEAL_WINDOW_COOKIE}=`))
    ?.slice(REVEAL_WINDOW_COOKIE.length + 1);

const windowMac = (body: string, key: Buffer) =>
  createHmac("sha256", createHmac("sha256", key).update("card-reveal-window").digest())
    .update(body)
    .digest("base64url");

export function signRevealWindow(userId: string, until: number, key = cardKey()) {
  const body = `${userId}.${until}`;
  return `${body}.${windowMac(body, key)}`;
}

/** True while the window is this user's, untampered and not over. */
export function revealWindowOpen(
  token: string | undefined,
  userId: string,
  now: number,
  key = cardKey(),
) {
  const [user, until, mac] = (token ?? "").split(".");
  if (!user || !until || !mac) return false;
  const want = Buffer.from(windowMac(`${user}.${until}`, key));
  const got = Buffer.from(mac);
  return (
    got.length === want.length &&
    timingSafeEqual(got, want) &&
    user === userId &&
    Number(until) > now
  );
}
