"use server";

import { write } from "@/api/client";

// UIDD §4.8 (task 4.4.2; D-020): a card bill's real statement/due dates (overrides only, SRS §6).
// N-3.7: the api saves them (apps/api/src/cards).

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
export async function saveBillDates(input: unknown) {
  return write("PUT", "/cards/bill-dates", input);
}

/** Undo of a new row: the bill goes back to the card's usual days. */
export async function deleteBillDates(input: unknown) {
  return write("DELETE", "/cards/bill-dates", input);
}
