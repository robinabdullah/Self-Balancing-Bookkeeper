"use server";

import { write } from "@/api/client";

// D-039 (UIDD §4.13, §4.14): Settings → Business (Details · Logo · Messages · PDF terms, D-049)
// and the saved bank accounts. N-3.7: the api saves them (apps/api/src/business), each with an
// audit row that never holds the logo itself.

export async function saveBusinessDetails(input: unknown) {
  return write("PUT", "/business/details", input);
}

export async function saveLogo(input: unknown) {
  return write("PUT", "/business/logo", input);
}

/** One message type's greeting and sign-off; the other types are kept as they are. */
export async function saveTemplate(input: unknown) {
  return write("PUT", "/business/template", input);
}

/** D-049: each document's terms and the footer line, in one sheet. */
export async function savePdfTerms(input: unknown) {
  return write("PUT", "/business/pdf-terms", input);
}

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
export async function saveBankAccount(input: unknown) {
  return write("PUT", "/bank-accounts", input);
}

export async function deleteBankAccount(input: unknown) {
  return write("DELETE", "/bank-accounts", input);
}
