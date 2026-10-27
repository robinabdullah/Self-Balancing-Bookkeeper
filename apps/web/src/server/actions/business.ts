"use server";

import { eq } from "drizzle-orm";
import { bankAccounts, businessProfile } from "@mbl/db/schema";
import {
  type BankAccountInput,
  bankAccountSchema,
  businessDetailsSchema,
  logoSchema,
  pdfTermsSchema,
  templateSchema,
} from "@mbl/domain/validation/business";
import { type Row, type Tx, byId, runAction } from "@/server/action";

// D-039 (UIDD §4.13, §4.14): Settings → Business (Details · Logo · Messages · PDF terms, D-049)
// and the saved bank accounts, each through `runAction` with an audit row. No business-profile
// audit row holds the logo: it says "changed" or "removed" instead (the image would bloat the log
// and its export).

/** The audit's copy of the business row: the logo left out (undefined isn't stored in JSON). */
const auditable = (row: Record<string, unknown>) => ({ ...row, logo: undefined });

const profileUpdate = async (
  tx: Tx,
  id: string,
  set: Partial<typeof businessProfile.$inferInsert>,
) => {
  const [r] = await tx
    .update(businessProfile)
    .set(set)
    .where(eq(businessProfile.id, id))
    .returning();
  return r;
};

export async function saveBusinessDetails(input: unknown) {
  return runAction(
    {
      op: "update",
      table: businessProfile,
      schema: businessDetailsSchema,
      before: async (_tx, current) => auditable(current),
      write: async (tx, { id, ...details }) => auditable(await profileUpdate(tx, id, details)),
    },
    input,
  );
}

export async function saveLogo(input: unknown) {
  return runAction(
    {
      op: "update",
      table: businessProfile,
      schema: logoSchema,
      before: async (_tx, current: Row) => ({ logo: current.logo ? "set" : null }),
      write: async (tx, { id, logo }) => {
        await profileUpdate(tx, id, { logo });
        return { logo: logo ? "changed" : "removed" };
      },
    },
    input,
  );
}

/** One message type's greeting and sign-off; the other types are kept as they are. */
export async function saveTemplate(input: unknown) {
  return runAction(
    {
      op: "update",
      table: businessProfile,
      schema: templateSchema,
      before: async (_tx, current) => ({ templates: current.templates }),
      write: async (tx, { id, type, greeting, signOff }, { current }) => {
        const templates = {
          ...(current?.templates as object | null),
          [type]: { greeting, signOff },
        };
        await profileUpdate(tx, id, { templates });
        return { templates };
      },
    },
    input,
  );
}

const terms = (r: Row) => ({
  invoiceTerms: r.invoiceTerms,
  receiptTerms: r.receiptTerms,
  statementTerms: r.statementTerms,
  footer: r.footer,
});

/** D-049: each document's terms and the footer line, in one sheet. */
export async function savePdfTerms(input: unknown) {
  return runAction(
    {
      op: "update",
      table: businessProfile,
      schema: pdfTermsSchema,
      before: async (_tx, current) => terms(current),
      write: async (tx, { id, ...set }) => terms(await profileUpdate(tx, id, set)),
    },
    input,
  );
}

const owner = (v: BankAccountInput) => ({
  personId: v.ownerKind === "person" ? v.ownerId : null,
  customerId: v.ownerKind === "customer" ? v.ownerId : null,
  supplierId: v.ownerKind === "supplier" ? v.ownerId : null,
});

/** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
export async function saveBankAccount(input: unknown) {
  const op = (input as { updatedAt?: unknown } | null)?.updatedAt ? "update" : "insert";
  return runAction(
    {
      op,
      table: bankAccounts,
      schema: bankAccountSchema,
      write: async (tx, v, { userId }) => {
        const row = {
          ...owner(v),
          bankName: v.bankName,
          branch: v.branch,
          accountName: v.accountName,
          accountNumber: v.accountNumber,
          routingNumber: v.routingNumber,
          note: v.note,
        };
        if (op === "update") {
          const [r] = await tx
            .update(bankAccounts)
            .set(row)
            .where(eq(bankAccounts.id, v.id))
            .returning();
          return r;
        }
        const [r] = await tx
          .insert(bankAccounts)
          .values({ id: v.id, ...row, createdBy: userId })
          .onConflictDoNothing({ target: bankAccounts.id })
          .returning();
        return r ?? null;
      },
    },
    input,
  );
}

export async function deleteBankAccount(input: unknown) {
  return runAction({ op: "delete", table: bankAccounts, schema: byId }, input);
}
