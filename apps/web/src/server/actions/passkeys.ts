"use server";

import { randomUUID } from "node:crypto";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLog, passkeys } from "@/db/schema";
import { deviceName } from "@mbl/domain/card-secrets";
import type { Errors } from "@mbl/domain/guards";
import { getUser } from "@/lib/supabase/server";
import { type Result, byId, runAction } from "@/server/action";
import { requirePartner } from "@/server/auth";
import { LOCKED, WRONG_PASSWORD, checkPassword } from "@/server/password-check";
import { authenticationOptions, registrationOptions, verifyRegistration } from "@/server/passkeys";

// D-046 (UIDD §4.13): Settings → Fingerprint unlock. Setting up a device asks for the login
// password first; each device is audited by its name only (never its key).

async function signedIn() {
  const profile = await requirePartner();
  const user = await getUser();
  return { profile, user: { id: profile.userId, email: user?.email } };
}

/** Step 1 of set-up: the password, then the options the browser needs. */
export async function fingerprintSetupOptions(input: unknown) {
  const { profile, user } = await signedIn();
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
  return { status: "ok" as const, options: await registrationOptions(user, profile.name) };
}

/** Step 2 of set-up: the browser's answer, checked and saved. */
export async function registerFingerprint(response: unknown): Promise<Result> {
  const { user } = await signedIn();
  const credential = await verifyRegistration(user.id, response as RegistrationResponseJSON);
  if (!credential)
    return { status: "invalid", errors: { form: "Fingerprint not set up — try again" } };
  const device = deviceName((await headers()).get("user-agent"));
  const id = randomUUID();
  const saved = await db.transaction(async (tx) => {
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
  revalidatePath("/", "layout");
  return { status: "ok", id, updatedAt: saved.updatedAt.toISOString() };
}

/** A reveal's challenge, or null when this user has no fingerprint set up. */
export async function revealOptions() {
  const { user } = await signedIn();
  return authenticationOptions(user.id);
}

export async function removeFingerprint(input: unknown) {
  return runAction(
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
