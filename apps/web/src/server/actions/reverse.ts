"use server";

import { write } from "@/api/client";

// Reverse from the Journal (PRD §4.5; SRS §8; D-003, D-026): a new entry with `reverses_id` and
// the same content, which the engine negates. N-3.6: the api reverses it (apps/api/src/reverse),
// with the original and its lots locked while it checks the dependents.

/** Reverse `reversesId` with a new entry `id` on `date` (and `forMonth` if the original has one). */
export async function reverseEntry(input: unknown) {
  return write("PUT", "/reversals", input);
}
