"use server";

import { write } from "@/api/client";

// Money entries add/edit and Undo (PRD §4.2; SRS §4 money_entries, §5; UIDD §4.6; D-005, D-007,
// D-009). N-3.2: the api saves them (apps/api/src/money). The Journal (3.8) deletes with
// `deleteMoneyEntry` too.

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
export async function saveMoneyEntry(input: unknown) {
  return write("PUT", "/money-entries", input);
}

/** Undo of a new money entry (D-010): not once it has a reversal (SRS §8). */
export async function deleteMoneyEntry(input: unknown) {
  return write("DELETE", "/money-entries", input);
}
