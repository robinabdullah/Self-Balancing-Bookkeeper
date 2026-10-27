import { Injectable } from "@nestjs/common";
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
import type { Tx } from "@mbl/db/client";
import { type Row, Runner, byId } from "../action/runner";

// Ref: src/server/actions/business.ts (N-3.7). D-039 (UIDD §4.13, §4.14): Settings → Business
// (Details · Logo · Messages · PDF terms, D-049) and the saved bank accounts, each through
// `runAction` with an audit row. No business-profile audit row holds the logo: it says "changed"
// or "removed" instead (the image would bloat the log and its export).

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

const terms = (r: Row) => ({
  invoiceTerms: r.invoiceTerms,
  receiptTerms: r.receiptTerms,
  statementTerms: r.statementTerms,
  footer: r.footer,
});

const owner = (v: BankAccountInput) => ({
  personId: v.ownerKind === "person" ? v.ownerId : null,
  customerId: v.ownerKind === "customer" ? v.ownerId : null,
  supplierId: v.ownerKind === "supplier" ? v.ownerId : null,
});

@Injectable()
export class BusinessActionsService {
  constructor(private readonly runner: Runner) {}

  saveBusinessDetails(input: unknown) {
    return this.runner.runAction(
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

  saveLogo(input: unknown) {
    return this.runner.runAction(
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
  saveTemplate(input: unknown) {
    return this.runner.runAction(
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

  /** D-049: each document's terms and the footer line, in one sheet. */
  savePdfTerms(input: unknown) {
    return this.runner.runAction(
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

  /** Add (no `updatedAt`) or edit (with the `updatedAt` the form saw). */
  saveBankAccount(input: unknown) {
    const op = (input as { updatedAt?: unknown } | null)?.updatedAt ? "update" : "insert";
    return this.runner.runAction(
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

  deleteBankAccount(input: unknown) {
    return this.runner.runAction({ op: "delete", table: bankAccounts, schema: byId }, input);
  }
}
