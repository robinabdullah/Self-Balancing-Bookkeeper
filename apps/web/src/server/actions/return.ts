"use server";

import { write } from "@/api/client";

// Customer and purchase returns: add/edit and Undo (PRD §4.2; SRS §4 returns, §5, §8; UIDD
// §4.5; D-011). N-3.5: the api saves them (apps/api/src/return), with the lots and sale lines
// locked while it checks them. The Journal (3.8) deletes with `deleteReturn` too.

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
export async function saveReturn(input: unknown) {
  return write("PUT", "/returns", input);
}

/** Undo or Journal delete: not if its units were sold again or it has a reversal (SRS §8). */
export async function deleteReturn(input: unknown) {
  return write("DELETE", "/returns", input);
}
