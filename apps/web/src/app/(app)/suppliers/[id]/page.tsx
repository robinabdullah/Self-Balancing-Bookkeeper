import { notFound } from "next/navigation";
import { BankOverlay } from "@/components/bank/bank-overlay";
import { AccountHeader } from "@/components/accounts/account-header";
import { AccountOverlays } from "@/components/accounts/account-overlays";
import { RangeChip } from "@/components/accounts/range-chip";
import { QuickActions } from "@/components/accounts/quick-actions";
import { Statement } from "@/components/accounts/statement";
import { StatementByModel } from "@/components/report/by-model";
import { EntryOverlay } from "@/components/journal/entry-overlay";
import { entryLabels } from "@mbl/domain/journal/labels";
import { statementLines, statementRange, supplierDueText } from "@mbl/domain/accounts";
import { dhakaToday } from "@mbl/domain/dates";
import { withQuery } from "@mbl/domain/href";
import { parseRange } from "@mbl/domain/journal-filter";
import { rowId } from "@mbl/domain/validation/fields";
import { loadBooks } from "@/server/books";
import { loadJournal, preloadEntry } from "@/server/journal";
import { loadSetup } from "@/server/setup";

// UIDD §4.8 (task 4.3.2): a supplier's phone, what we owe them and the statement with a running
// balance. `?entry=` opens an entry over the page (D-032), `?bank=1` the saved bank accounts (D-039);
// `?from=&to=` a period, `?report=1` / `?send=` the Report sheet / send preview (D-040); D-045: a
// period also shows Purchases by model.
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
  const [{ books }, setup, journal] = await Promise.all([loadBooks(), loadSetup(), loadJournal()]);
  const supplier = setup.suppliers.find((s) => s.id === id);
  if (!supplier) notFound();

  const labels = entryLabels(journal);
  const period = range && statementRange(books.suppliers[id]?.rows ?? [], range.from, range.to);
  const lines = (period ? period.lines : statementLines(books.suppliers[id])).map((l) => ({
    ...l,
    label: labels.get(l.entryId) ?? "Entry",
  }));

  return (
    <>
      <AccountHeader
        back={{ href: "/suppliers", label: "Suppliers" }}
        actions={<QuickActions kind="supplier" row={supplier} from={base} />}
        name={supplier.name}
        due={supplierDueText(books.suppliers[id]?.balance ?? 0)}
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
        first={journal.at(-1)?.date ?? null}
        today={dhakaToday()}
      />
      {range && <RangeChip {...range} clear={withQuery(base, { from: null, to: null })} />}
      <h2 className="mt-4 mb-2 font-semibold">Statement</h2>
      <Statement kind="supplier" lines={lines} range={period ?? undefined} base={base} />
      {range && <StatementByModel kind="supplier" id={id} from={range.from} to={range.to} />}
    </>
  );
}
