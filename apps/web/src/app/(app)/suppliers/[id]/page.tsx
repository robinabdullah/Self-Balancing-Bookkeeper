import { notFound } from "next/navigation";
import { BankOverlay } from "@/components/bank/bank-overlay";
import { AccountHeader } from "@/components/accounts/account-header";
import { AccountOverlays } from "@/components/accounts/account-overlays";
import { RangeChip } from "@/components/accounts/range-chip";
import { QuickActions } from "@/components/accounts/quick-actions";
import { Statement } from "@/components/accounts/statement";
import { StatementByModel } from "@/components/report/by-model";
import { EntryOverlay, preloadEntry } from "@/components/journal/entry-overlay";
import { supplierDueText } from "@mbl/domain/accounts";
import { dhakaToday } from "@mbl/domain/dates";
import { withQuery } from "@mbl/domain/href";
import { parseRange } from "@mbl/domain/journal-filter";
import { rowId } from "@mbl/domain/validation/fields";
import type { SupplierView } from "@mbl/api/views/accounts.controller";
import { api } from "@/api/client";

// UIDD §4.8 (task 4.3.2): a supplier's phone, what we owe them and the statement with a running
// balance. `?entry=` opens an entry over the page (D-032), `?bank=1` the saved bank accounts (D-039);
// `?from=&to=` a period, `?report=1` / `?send=` the Report sheet / send preview (D-040); D-045: a
// period also shows Purchases by model. N-4.5: one `/views/suppliers/:id` read.
export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    entry?: string;
    bank?: string;
    from?: string;
    to?: string;
    report?: string;
    send?: string;
  }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { entry, bank, report, send } = sp;
  if (!rowId.safeParse(id).success) notFound();
  if (entry) preloadEntry(entry);
  const range = parseRange(sp);
  const base = withQuery(`/suppliers/${id}`, { ...range });
  const { supplier, balance, lines, period, first } = await api<SupplierView>(
    withQuery(`/views/suppliers/${id}`, { ...range }),
  );

  return (
    <>
      <AccountHeader
        back={{ href: "/suppliers", label: "Suppliers" }}
        actions={<QuickActions kind="supplier" row={supplier} from={base} />}
        name={supplier.name}
        due={supplierDueText(balance)}
        phone={supplier.phone}
      />
      {entry && <EntryOverlay id={entry} closeHref={base} />}
      {bank && (
        <BankOverlay owner={{ kind: "supplier", id, label: supplier.name }} closeHref={base} />
      )}
      <AccountOverlays
        kind="supplier"
        id={id}
        base={base}
        report={report}
        send={send}
        range={range}
        first={first}
        today={dhakaToday()}
      />
      {range && <RangeChip {...range} clear={withQuery(base, { from: null, to: null })} />}
      <h2 className="mt-4 mb-2 font-semibold">Statement</h2>
      <Statement kind="supplier" lines={lines} range={period ?? undefined} base={base} />
      {range && <StatementByModel kind="supplier" id={id} from={range.from} to={range.to} />}
    </>
  );
}
