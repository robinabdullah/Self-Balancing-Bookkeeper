import "server-only";
import { and, asc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { db } from "@mbl/db";
import { passkeyChallenges, passkeys } from "@mbl/db/schema";

// D-046 (SRS §11): fingerprint unlock (passkeys, WebAuthn). Every challenge is one-time: saved for
// 2 minutes, for this user, and deleted when it is answered. The site (rpID) and origin are the
// public host behind nginx (X-Forwarded-Host/-Proto, as in proxy.ts; D-031). N-3.8: set-up and the
// reveal's options moved to the api (apps/api/src/passkeys); the reveal's check stays here with
// the reveal route until N-5.3, and the device list until its page's read moves (N-4.6).

/** The passkey's site and origin, from the request. */
export async function relyingParty() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const hostname = host.replace(/:\d+$/, "");
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return { rpID: hostname, origin: `${proto}://${host}` };
}

/** Deletes the challenge; true only if it was this user's and still fresh. */
export async function takeChallenge(userId: string, challenge: string) {
  const rows = await db
    .delete(passkeyChallenges)
    .where(
      and(
        eq(passkeyChallenges.challenge, challenge),
        eq(passkeyChallenges.userId, userId),
        gt(passkeyChallenges.expiresAt, new Date()),
      ),
    )
    .returning({ id: passkeyChallenges.id });
  return rows.length > 0;
}

/** The challenge the browser signed, read from its client data. */
function signedChallenge(response: { response?: { clientDataJSON?: unknown } }) {
  try {
    const data = JSON.parse(
      Buffer.from(String(response.response?.clientDataJSON), "base64url").toString("utf8"),
    );
    return typeof data.challenge === "string" ? data.challenge : null;
  } catch {
    return null;
  }
}

const transportsOf = (t: unknown) =>
  Array.isArray(t) ? (t as AuthenticatorTransportFuture[]) : undefined;

/** This user's devices, oldest first (Settings → Fingerprint unlock). */
export async function loadPasskeys(userId: string) {
  const rows = await db
    .select({
      id: passkeys.id,
      deviceName: passkeys.deviceName,
      createdAt: passkeys.createdAt,
      updatedAt: passkeys.updatedAt,
      credentialId: passkeys.credentialId,
      transports: passkeys.transports,
    })
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .orderBy(asc(passkeys.createdAt));
  return rows;
}

/** True when the fingerprint answered this user's fresh challenge with one of their passkeys. */
export async function verifyAuthentication(userId: string, response: AuthenticationResponseJSON) {
  const challenge = signedChallenge(response);
  if (!challenge || !(await takeChallenge(userId, challenge))) return false;
  const [key] = await db
    .select()
    .from(passkeys)
    .where(and(eq(passkeys.credentialId, String(response.id)), eq(passkeys.userId, userId)));
  if (!key) return false;
  const { rpID, origin } = await relyingParty();
  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: key.credentialId,
        publicKey: Buffer.from(key.publicKey, "base64url"),
        counter: key.counter,
        transports: transportsOf(key.transports),
      },
      requireUserVerification: true,
    });
    if (!verified) return false;
    await db
      .update(passkeys)
      .set({ counter: authenticationInfo.newCounter })
      .where(eq(passkeys.id, key.id));
    return true;
  } catch {
    return false;
  }
}
