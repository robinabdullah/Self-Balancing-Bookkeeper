"use server";

import { write } from "@/api/client";

// Close M and re-open the latest closed month (SRS §7, tasks 5.2 and 5.4; D-023, D-028). N-3.6:
// the api does both (apps/api/src/months), with Profit(M) computed there from the stored facts.

export async function closeMonth(input: unknown) {
  return write("PUT", "/month-closes", input);
}

/** Only the latest closed month; its entries are untouched. */
export async function reopenMonth(input: unknown) {
  return write("DELETE", "/month-closes", input);
}
