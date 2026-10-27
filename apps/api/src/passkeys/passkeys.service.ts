import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import type { Db } from "@mbl/db/client";
import { auditLog, passkeys } from "@mbl/db/schema";
import { deviceName } from "@mbl/domain/card-secrets";
import type { Errors } from "@mbl/domain/guards";
import type { Result } from "@mbl/domain/result";
import { Runner, byId } from "../action/runner";
import { AuthService } from "../auth/auth.service";
import { context } from "../auth/context";
import { DB } from "../db/db.module";
import { Passkeys } from "./passkeys";
import { LOCKED, WRONG_PASSWORD, checkPassword } from "./password-check";

// Ref: src/server/actions/passkeys.ts (N-3.8). D-046 (UIDD §4.13): Settings → Fingerprint unlock.
// Setting up a device asks for the login password first; each device is audited by its name only
// (never its key). The email is the signed-in token's; the device name comes from the browser's
// user agent, which web forwards.

@Injectable()
export class PasskeysService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly auth: AuthService,
    private readonly runner: Runner,
    private readonly keys: Passkeys,
  ) {}

  private async signedIn() {
    const profile = await this.auth.requirePartner();
    return { profile, user: { id: profile.userId, email: context().email ?? undefined } };
  }

  /** Step 1 of set-up: the password, then the options the browser needs. */
  async fingerprintSetupOptions(input: unknown) {
    const { profile, user } = await this.signedIn();
    const password = (input as { password?: unknown } | null)?.password;
    const check = await checkPassword(
      user.id,
      user.email,
      typeof password === "string" ? password : "",
    );
    if (check !== "ok")
      return {
        status: "invalid" as const,
        errors: { password: check === "locked" ? LOCKED : WRONG_PASSWORD },
      };
    return {
      status: "ok" as const,
      options: await this.keys.registrationOptions(user, profile.name),
    };
  }

  /** Step 2 of set-up: the browser's answer, checked and saved. */
  async registerFingerprint(response: unknown): Promise<Result> {
    const { user } = await this.signedIn();
    const credential = await this.keys.verifyRegistration(
      user.id,
      response as RegistrationResponseJSON,
    );
    if (!credential)
      return { status: "invalid", errors: { form: "Fingerprint not set up — try again" } };
    const device = deviceName(context().userAgent);
    const id = randomUUID();
    const saved = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(passkeys)
        .values({ id, userId: user.id, ...credential, deviceName: device, createdBy: user.id })
        .onConflictDoNothing({ target: passkeys.credentialId })
        .returning({ updatedAt: passkeys.updatedAt });
      if (row)
        await tx.insert(auditLog).values({
          table: "passkeys",
          rowId: id,
          action: "insert",
          after: { device },
          userId: user.id,
          createdBy: user.id,
        });
      return row;
    });
    if (!saved) return { status: "invalid", errors: { form: "This device is already set up" } };
    return { status: "ok", id, updatedAt: saved.updatedAt.toISOString() };
  }

  /** A reveal's challenge, or null when this user has no fingerprint set up. */
  async revealOptions() {
    const { user } = await this.signedIn();
    return this.keys.authenticationOptions(user.id);
  }

  removeFingerprint(input: unknown) {
    return this.runner.runAction(
      {
        op: "delete",
        table: passkeys,
        schema: byId,
        before: async (_tx, current) => ({ device: current.deviceName }),
        guards: ({ userId, current }): Errors =>
          current?.userId === userId ? {} : { form: "Only your own devices can be removed" },
      },
      input,
    );
  }
}

export type SetupOptions = Awaited<ReturnType<PasskeysService["fingerprintSetupOptions"]>>;
export type RevealOptions = Awaited<ReturnType<PasskeysService["revealOptions"]>>;
