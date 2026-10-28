import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, lte, or } from "drizzle-orm";
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { Db } from "@mbl/db/client";
import { passkeyChallenges, passkeys } from "@mbl/db/schema";
import { context } from "../auth/context";
import { DB } from "../db/db.module";

// Ref: src/server/passkeys.ts (N-3.8): set-up, the reveal's options and (N-5.3) the reveal's
// check. D-046 (SRS §11): fingerprint unlock (passkeys,
// WebAuthn). Every challenge is one-time: saved for 2 minutes, for this user, and deleted when it
// is answered. The site (rpID) and origin are the public host behind nginx, which web forwards as
// X-Forwarded-Host/-Proto (auth/context.ts; D-031).

const CHALLENGE_MS = 2 * 60_000;

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

@Injectable()
export class Passkeys {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The passkey's site and origin, from the browser's request (never the api's own host). */
  relyingParty() {
    const c = context();
    const host = c.host ?? "localhost";
    const hostname = host.replace(/:\d+$/, "");
    const local = hostname === "localhost" || hostname === "127.0.0.1";
    const proto = c.proto ?? (local ? "http" : "https");
    return { rpID: hostname, origin: `${proto}://${host}` };
  }

  private async saveChallenge(userId: string, challenge: string) {
    await this.db
      .delete(passkeyChallenges)
      .where(
        or(eq(passkeyChallenges.userId, userId), lte(passkeyChallenges.expiresAt, new Date())),
      );
    await this.db.insert(passkeyChallenges).values({
      userId,
      challenge,
      expiresAt: new Date(Date.now() + CHALLENGE_MS),
      createdBy: userId,
    });
  }

  /** Deletes the challenge; true only if it was this user's and still fresh. */
  async takeChallenge(userId: string, challenge: string) {
    const rows = await this.db
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

  /** This user's devices, oldest first. */
  loadPasskeys(userId: string) {
    return this.db
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
  }

  async registrationOptions(user: { id: string; email?: string }, displayName: string) {
    const { rpID } = this.relyingParty();
    const existing = await this.loadPasskeys(user.id);
    const options = await generateRegistrationOptions({
      rpName: "Self-Balancing Bookkeeper",
      rpID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email ?? displayName,
      userDisplayName: displayName,
      attestationType: "none",
      excludeCredentials: existing.map((p) => ({
        id: p.credentialId,
        transports: transportsOf(p.transports),
      })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
    });
    await this.saveChallenge(user.id, options.challenge);
    return options;
  }

  /** The new credential, or null when the challenge or the signature isn't valid. */
  async verifyRegistration(userId: string, response: RegistrationResponseJSON) {
    const challenge = signedChallenge(response);
    if (!challenge || !(await this.takeChallenge(userId, challenge))) return null;
    const { rpID, origin } = this.relyingParty();
    try {
      const { verified, registrationInfo } = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!verified || !registrationInfo) return null;
      const { credential } = registrationInfo;
      return {
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports ?? null,
      };
    } catch {
      return null;
    }
  }

  /** Options for a reveal, or null when this user has no passkey. */
  async authenticationOptions(userId: string) {
    const mine = await this.loadPasskeys(userId);
    if (!mine.length) return null;
    const { rpID } = this.relyingParty();
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: mine.map((p) => ({
        id: p.credentialId,
        transports: transportsOf(p.transports),
      })),
      userVerification: "required",
    });
    await this.saveChallenge(userId, options.challenge);
    return options;
  }

  /** True when the fingerprint answered this user's fresh challenge with one of their passkeys. */
  async verifyAuthentication(userId: string, response: AuthenticationResponseJSON) {
    const challenge = signedChallenge(response);
    if (!challenge || !(await this.takeChallenge(userId, challenge))) return false;
    const [key] = await this.db
      .select()
      .from(passkeys)
      .where(and(eq(passkeys.credentialId, String(response.id)), eq(passkeys.userId, userId)));
    if (!key) return false;
    const { rpID, origin } = this.relyingParty();
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
      await this.db
        .update(passkeys)
        .set({ counter: authenticationInfo.newCounter })
        .where(eq(passkeys.id, key.id));
      return true;
    } catch {
      return false;
    }
  }
}
