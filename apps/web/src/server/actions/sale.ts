"use server";

import { write } from "@/api/client";

// Sale bill add/edit and Undo (PRD §4.2; SRS §4 sales + lot picking, §5, §8; UIDD §4.4; D-004,
// D-006). N-3.4: the api saves them (apps/api/src/sale): it picks the lots, saves "Received now"
// in the same transaction and gives the invoice and receipt numbers (D-036). The Journal (3.8)
// deletes with `deleteSale` too (no payment: it is its own entry there).

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
export async function saveSale(input: unknown) {
  return write("PUT", "/sales", input);
}

/** Undo of a new sale (D-006): the bill and, if it had "Received now", that payment. */
export async function deleteSale(input: unknown) {
  return write("DELETE", "/sales", input);
}
