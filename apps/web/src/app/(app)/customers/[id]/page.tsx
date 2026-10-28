import { notFound } from "next/navigation";
import { BankOverlay } from "@/components/bank/bank-overlay";
import { AccountHeader } from "@/components/accounts/account-header";
import { AccountOverlays } from "@/components/accounts/account-overlays";
import { RangeChip } from "@/components/accounts/range-chip";
import { QuickActions } from "@/components/accounts/quick-actions";
import { Bills } from "@/components/accounts/bills";
import { Statement } from "@/components/accounts/statement";
import { StatementByModel } from "@/components/report/by-model";
import { EntryOverlay, preloadEntry } from "@/components/journal/entry-overlay";
import { SegmentedNav } from "@/components/shell/segmented-nav";
import { dhakaToday } from "@mbl/domain/dates";
import { withQuery } from "@mbl/domain/href";
import { parseRange } from "@mbl/domain/journal-filter";
import { format } from "@mbl/domain/money";
import { dueText } from "@mbl/domain/setup";
import { cn } from "@/lib/utils";
import { rowId } from "@mbl/domain/validation/fields";
import type { CustomerView } from "@mbl/api/views/accounts.controller";
import { api } from "@/api/client";

// UIDD §4.8 (task 4.3.1): a customer's contact, balance (+ "Above target"), statement with a
// running balance, and the Bills tab (`?tab=bills`) with each bill's lines and profit. `?entry=`
// opens an entry over the page (D-032), `?bank=1` the saved bank accounts (D-039); `?from=&to=` shows
// the statement for a period, `?report=1` / `?send=` open the Report sheet / send preview (D-040);
// D-045: a period also shows Sales by model (and Bought from you). N-4.5: one `/views/customers/:id`
// read.
export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    entry?: string;
    bank?: string;
    from?: string;
    to?: string;
    report?: string;
    send?: string;
  }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { tab, entry, bank, report, send } = sp;
  if (!rowId.safeParse(id).success) notFound();
  if (entry) preloadEntry(entry);
  const range = parseRange(sp);
  const { customer, balance, above, lines, period, bills, names, first } = await api<CustomerView>(
    withQuery(`/views/customers/${id}`, { ...range }),
  );
  const showBills = tab === "bills";
  const base = withQuery(`/customers/${id}`, { tab: showBills ? "bills" : null, ...range });

  return (
    <>
      <AccountHeader
        back={{ href: "/customers", label: "Customers" }}
        actions={<QuickActions kind="customer" row={customer} from={base} owes={balance > 0} />}
        name={customer.display}
        due={dueText(balance)}
        phone={customer.phone}
        email={customer.email}
        address={customer.address}
      >
        {above != null && (
          <p
            className={cn(
              "text-sm font-medium",
              above <= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
            )}
          >
            Above target: {format(above)}
          </p>
        )}
      </AccountHeader>
      {entry && <EntryOverlay id={entry} closeHref={base} />}
      {bank && !customer.isSystem && (
        <BankOverlay owner={{ kind: "customer", id, label: customer.display }} closeHref={base} />
      )}
      <AccountOverlays
        kind="customer"
        id={id}
        base={base}
        report={customer.isSystem ? undefined : report}
        send={send}
        range={range}
        first={first}
        today={dhakaToday()}
      />

      <SegmentedNav
        label="Customer"
        className="my-4"
        items={[
          { href: `/customers/${id}`, label: "Statement", current: !showBills },
          { href: `/customers/${id}?tab=bills`, label: "Bills", current: showBills },
        ]}
      />
      {showBills ? (
        <Bills
          bills={bills}
          names={names}
          base={base}
        />
      ) : (
        <>
          {range && <RangeChip {...range} clear={withQuery(base, { from: null, to: null })} />}
          <Statement kind="customer" lines={lines} range={period ?? undefined} base={base} />
          {range && !customer.isSystem && (
            <StatementByModel kind="customer" id={id} from={range.from} to={range.to} />
          )}
        </>
      )}
    </>
  );
}
