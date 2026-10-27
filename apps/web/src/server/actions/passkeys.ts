"use server";

import type { RevealOptions, SetupOptions } from "@mbl/api/passkeys/passkeys.service";
import { call, write } from "@/api/client";

// D-046 (UIDD §4.13): Settings → Fingerprint unlock. Setting up a device asks for the login
// password first; each device is audited by its name only (never its key). N-3.8: the api does
// all of it (apps/api/src/passkeys), with the browser's host and user agent forwarded.

/** Step 1 of set-up: the password, then the options the browser needs. */
export async function fingerprintSetupOptions(input: unknown) {
  return call<SetupOptions>("POST", "/passkeys/setup-options", input);
}

/** Step 2 of set-up: the browser's answer, checked and saved. */
export async function registerFingerprint(response: unknown) {
  return write("POST", "/passkeys", response);
}

/** A reveal's challenge, or null when this user has no fingerprint set up. */
export async function revealOptions() {
  return call<RevealOptions>("POST", "/passkeys/reveal-options");
}

export async function removeFingerprint(input: unknown) {
  return write("DELETE", "/passkeys", input);
}
