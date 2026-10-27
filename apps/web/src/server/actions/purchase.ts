"use server";

import { write } from "@/api/client";

// Purchase add/edit and Undo (PRD §4.2; SRS §4 purchases, §5, §8; UIDD §4.3; D-009). N-3.3: the
// api saves them (apps/api/src/purchase). The Journal (3.8) deletes with `deletePurchase` too.

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
export async function savePurchase(input: unknown) {
  return write("PUT", "/purchases", input);
}

/** Undo or Journal delete (D-010): only while nothing was sold or returned from its lots. */
export async function deletePurchase(input: unknown) {
  return write("DELETE", "/purchases", input);
}
