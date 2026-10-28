import { notFound } from "next/navigation";
import { AccountHeader } from "@/components/accounts/account-header";
import { AccountOverlays } from "@/components/accounts/account-overlays";
import { RangeChip } from "@/components/accounts/range-chip";
import { Statement } from "@/components/accounts/statement";
import { QuickActions } from "@/components/accounts/quick-actions";
import { Amount } from "@/components/amount";
import { BankBadge } from "@/components/cards/bank-badge";
import { CardBills } from "@/components/cards/card-bills";
import { CardSecretsOverlay } from "@/components/cards/card-secrets-overlay";
import { CardMoves, EmiPlans } from "@/components/cards/card-detail";
import { StatusBadge } from "@/components/cards/card-list";
import { InfoNote } from "@/components/info-note";
import { EntryOverlay, preloadEntry } from "@/components/journal/entry-overlay";
import { ordinal } from "@mbl/domain/card-view";
import { dhakaToday, formatDate } from "@mbl/domain/dates";
import { withQuery } from "@mbl/domain/href";
import { parseRange } from "@mbl/domain/journal-filter";
import { viewHelp } from "@mbl/domain/help-text";
import { format } from "@mbl/domain/money";
import { rowId } from "@mbl/domain/validation/fields";
import type { CardView } from "@mbl/api/views/accounts.controller";
import { api } from "@/api/client";

// UIDD §4.8 (task 4.4.2): a card's full summary row, then its statements (tap a bill to set its
// actual dates), charges and credits, and EMI plans. Every number is from `cardSummaries` (SRS §6).
// `?entry=` opens an entry over the page (D-032). `?from=&to=` shows the charges and credits for a
// period as a statement; `?report=1` / `?send=` the Report sheet / send preview (D-040). D-045:
// with a period, Statements lists that period's bills as on its last day (read-only), and the
// period's charges, card payments and refunds & cashback follow the statement. `?secret=1`: the
// card's saved details (D-046). N-4.5: one `/views/cards/:id` read.
export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    entry?: string;
    from?: string;
    to?: string;
    report?: string;
    send?: string;
    secret?: string;
  }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { entry, report, send, secret } = sp;
  if (!rowId.safeParse(id).success) notFound();
  if (entry) preloadEntry(entry);
  const range = parseRange(sp);
  const base = withQuery(`/cards/${id}`, { ...range });
  const {
    card,
    row,
    summary,
    bills,
    periodBills,
    billDates,
    moves,
    lines,
    period,
    plans,
    today: asOf,
    first,
  } = await api<CardView>(withQuery(`/views/cards/${id}`, { ...range }));
  const balanceText =
    row.balance < 0 ? `Card credit ${format(0 - row.balance)}` : `Balance ${format(row.balance)}`;

  const facts: [React.ReactNode, React.ReactNode][] = [
    ["Bill days", `Statement ${ordinal(row.statementDay)} · Due ${ordinal(row.dueDay)}`],
    ["Credit limit", row.creditLimit == null ? "—" : <Amount poisha={row.creditLimit} />],
    [
      <InfoNote key="a" label="Available ≈" note={viewHelp.available} />,
      row.available == null ? "—" : <Amount poisha={row.available} />,
    ],
    [
      "Next due",
      row.nextDue ? (
        <>
          {formatDate(row.nextDue.date)} · <Amount poisha={row.nextDue.amount} />
        </>
      ) : (
        "—"
      ),
    ],
    ["Overdue", <Amount key="o" poisha={row.overdue} />],
    ["Due within 7 days", <Amount key="w" poisha={summary.dueWithin7Days} />],
    ["Unbilled", <Amount key="u" poisha={summary.unbilled} />],
    ["Remaining EMI", <Amount key="e" poisha={summary.remainingEmi} />],
  ];

  return (
    <>
      <AccountHeader
        back={{ href: "/cards", label: "Cards" }}
        actions={<QuickActions kind="card" row={card} from={base} />}
        name={card.display}
        badge={<BankBadge name={card.name} />}
        due={balanceText}
        phone={null}
      >
        <p className="mt-1">
          <StatusBadge status={row.status} />
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 text-sm lg:grid-cols-4">
          {facts.map(([term, value], i) => (
            <div key={i} className="flex min-h-11 flex-col justify-center">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </AccountHeader>
      {entry && <EntryOverlay id={entry} closeHref={base} />}
      {secret && <CardSecretsOverlay card={card} closeHref={base} />}
      <AccountOverlays
        kind="card"
        id={id}
        base={base}
        report={report}
        send={send}
        range={range}
        first={first}
        today={dhakaToday()}
      />

      <h2 className="mt-6 mb-2 font-semibold">Statements</h2>
      {periodBills ? (
        <>
          <p className="text-muted-foreground mb-2 text-sm">
            Bills in the period, as on {formatDate(periodBills.end)}
          </p>
          <CardBills
            cardId={id}
            bills={[...periodBills.bills].reverse()}
            billDates={billDates}
            today={asOf}
            base={base}
            period
          />
        </>
      ) : (
        <CardBills cardId={id} bills={bills} billDates={billDates} today={asOf} base={base} />
      )}
      <h2 className="mt-6 mb-2 font-semibold">Charges and credits</h2>
      {range && period ? (
        <>
          <RangeChip {...range} clear={withQuery(base, { from: null, to: null })} />
          <Statement
            kind="card"
            label="Charges and credits"
            lines={lines}
            range={period}
            base={base}
          />
          {periodBills && (
            <dl aria-label="Period totals" className="mt-3 grid grid-cols-3 gap-x-4 text-sm">
              {(
                [
                  ["Charges", periodBills.split.charges],
                  ["Card payments", periodBills.split.payments],
                  ["Refunds & cashback", periodBills.split.refunds],
                ] as const
              ).map(([term, value]) => (
                <div key={term} className="flex min-h-11 flex-col justify-center">
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd className="font-medium">
                    <Amount poisha={value} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </>
      ) : (
        <CardMoves moves={moves} base={base} />
      )}
      <h2 className="mt-6 mb-2 font-semibold">EMI plans</h2>
      <EmiPlans base={base} plans={plans} />
    </>
  );
}
