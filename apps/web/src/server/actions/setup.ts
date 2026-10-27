"use server";

import type { SetupKind } from "@mbl/domain/setup";
import { write } from "@/api/client";

// Setup add/edit, deactivate/activate and delete (PRD §4.1; SRS §4 Setup; UIDD §4.11; D-023).
// N-3.1: the api saves them (apps/api/src/setup), with the uniqueness, Walk-in and "deactivate
// instead of delete once used" guards.

const kindPath = (kind: SetupKind) => `/setup/${encodeURIComponent(kind)}`;

export async function savePerson(input: unknown) {
  return write("PUT", "/setup/person", input);
}

export async function saveCard(input: unknown) {
  return write("PUT", "/setup/card", input);
}

export async function saveCustomer(input: unknown) {
  return write("PUT", "/setup/customer", input);
}

export async function saveSupplier(input: unknown) {
  return write("PUT", "/setup/supplier", input);
}

export async function saveModel(input: unknown) {
  return write("PUT", "/setup/model", input);
}

/** Deactivated rows stay in the books but are hidden in pickers (UIDD §4.11). */
export async function setActive(kind: SetupKind, input: unknown) {
  return write("PUT", `${kindPath(kind)}/active`, input);
}

/** Only a row nothing points to can be deleted; otherwise deactivate it (UIDD §4.11). */
export async function removeRow(kind: SetupKind, input: unknown) {
  return write("DELETE", kindPath(kind), input);
}
