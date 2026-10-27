"use server";

import { write } from "@/api/client";

// D-046 (UIDD §4.14): add, edit or remove a saved card number. N-3.8: the api encrypts and saves
// it (apps/api/src/card-secrets); its audit rows never hold a value. Edit and Remove need your
// own reveal of that number in the last 10 minutes (D-054: one primary per card; D-067: a number
// on one card only).

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
export async function saveCardDetails(input: unknown) {
  return write("PUT", "/card-secrets", input);
}

export async function removeCardDetails(input: unknown) {
  return write("DELETE", "/card-secrets", input);
}
