"use server";

import { write } from "@/api/client";

// UIDD §4.13 (D-037): Settings → Theme, saved on the user's own profile (all devices), audited
// like every other change. N-2.5: the api saves it (apps/api/src/settings).

export async function setTheme(input: unknown) {
  return write("PUT", "/me/theme", input);
}
