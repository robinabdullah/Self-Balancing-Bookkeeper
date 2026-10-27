import "server-only";
import { cache } from "react";
import { asc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "@/db";
import type { PayAccount } from "@mbl/domain/business";
import { bankAccounts, businessProfile, customers, people, suppliers } from "@/db/schema";
import { customerName } from "@mbl/domain/setup";
import type { OwnerKind } from "@mbl/domain/validation/business";

// D-039: the business profile (Settings → Business, the app name) and the saved bank accounts
// (More → Saved details, an owner's ⋯ → Bank accounts). The logo itself is read only by `/logo`.

const columns = getTableColumns(businessProfile);
const withoutLogo = Object.fromEntries(
  Object.entries(columns).filter(([key]) => key !== "logo"),
) as Omit<typeof columns, "logo">;

/** Every column but the logo, plus a short hash of it for the `/logo?v=` URL (null: no logo). */
export const getBusiness = cache(async () => {
  const [row] = await db
    .select({ ...withoutLogo, logoVersion: sql<string | null>`left(md5(logo), 8)` })
    .from(businessProfile)
    .limit(1);
  return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null;
});

export type Business = NonNullable<Awaited<ReturnType<typeof getBusiness>>>;

/** `/logo`: the stored data URL. */
export async function getLogo() {
  const [row] = await db.select({ logo: businessProfile.logo }).from(businessProfile).limit(1);
  return row?.logo ?? null;
}

export const logoSrc = (b: { logoVersion: string | null } | null) =>
  b?.logoVersion ? `/logo?v=${b.logoVersion}` : null;

export type Owner = { kind: OwnerKind; id: string | null; label: string };

const ORDER: Record<OwnerKind, number> = { business: 0, person: 1, customer: 2, supplier: 3 };

/** All saved accounts, the business's first, then by owner and bank. */
export const loadBankAccounts = cache(async () => {
  const rows = await db
    .select({
      account: bankAccounts,
      person: people.name,
      shopName: customers.shopName,
      proprietorName: customers.proprietorName,
      supplier: suppliers.name,
    })
    .from(bankAccounts)
    .leftJoin(people, eq(people.id, bankAccounts.personId))
    .leftJoin(customers, eq(customers.id, bankAccounts.customerId))
    .leftJoin(suppliers, eq(suppliers.id, bankAccounts.supplierId))
    .orderBy(asc(bankAccounts.bankName), asc(bankAccounts.createdAt));
  return rows
    .map(({ account: a, person, shopName, proprietorName, supplier }) => {
      const owner: Owner = a.personId
        ? { kind: "person", id: a.personId, label: person ?? "" }
        : a.customerId
          ? {
              kind: "customer",
              id: a.customerId,
              label: customerName({ shopName, proprietorName: proprietorName ?? "" }),
            }
          : a.supplierId
            ? { kind: "supplier", id: a.supplierId, label: supplier ?? "" }
            : { kind: "business", id: null, label: "The business" };
      return { ...a, updatedAt: a.updatedAt.toISOString(), owner };
    })
    .sort(
      (x, y) =>
        ORDER[x.owner.kind] - ORDER[y.owner.kind] || x.owner.label.localeCompare(y.owner.label),
    );
});

export type BankAccount = Awaited<ReturnType<typeof loadBankAccounts>>[number];

/** The business's own accounts, for How to pay (D-040, D-041). */
export async function payAccounts(): Promise<PayAccount[]> {
  return (await loadBankAccounts())
    .filter((a) => a.owner.kind === "business")
    .map((a) => ({
      id: a.id,
      label: `${a.bankName} · ${a.accountNumber}`,
      fields: {
        bankName: a.bankName,
        branch: a.branch,
        accountName: a.accountName,
        accountNumber: a.accountNumber,
        routingNumber: a.routingNumber,
      },
    }));
}

/** How many accounts each owner has (Setup's delete confirm). */
export async function bankCounts() {
  const rows = await db
    .select({
      owner: sql<string>`coalesce(${bankAccounts.personId}, ${bankAccounts.customerId}, ${bankAccounts.supplierId})`,
      n: sql<number>`count(*)::int`,
    })
    .from(bankAccounts)
    .groupBy(sql`1`);
  return Object.fromEntries(rows.filter((r) => r.owner).map((r) => [r.owner, r.n]));
}
