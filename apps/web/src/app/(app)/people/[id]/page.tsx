import { notFound } from "next/navigation";
import { BankOverlay } from "@/components/bank/bank-overlay";
import { AccountHeader } from "@/components/accounts/account-header";
import { AccountOverlays } from "@/components/accounts/account-overlays";
import { RangeChip } from "@/components/accounts/range-chip";
import { QuickActions } from "@/components/accounts/quick-actions";
import { Statement } from "@/components/accounts/statement";
import { Amount } from "@/components/amount";
import { EntryOverlay } from "@/components/journal/entry-overlay";
import { entryLabels, otherSide } from "@/components/journal/labels";
import { Allocations, CardsSupplied, ProfitMoves } from "@/components/people/people-detail";
import { Badge, kindText } from "@/components/people/people-list";
import { statementRange, statementRowsOf } from "@/lib/accounts";
import { cardRows } from "@/lib/card-view";
import { dhakaToday } from "@/lib/dates";
import { withQuery } from "@/lib/href";
import { parseRange } from "@/lib/journal-filter";
import { format } from "@/lib/money";
import { peopleRows, personDetail } from "@/lib/people-view";
import { setupNames } from "@/lib/setup";
import { rowId } from "@/lib/validation/fields";
import { loadBooks } from "@/server/books";
import { loadJournal, preloadEntry } from "@/server/journal";
import { loadSetup } from "@/server/setup";

// UIDD §4.8 (task 4.5): a person's capital history and current capital, the cards they supply
// (with business balances), profit allocated per month / paid / reinvested / owed, and their
// opening difference until it is resolved (SRS §5). Every number is from `computeBooks`.
// `?entry=` opens an entry over the page (D-032), `?bank=1` the saved bank accounts (D-039).
// `?from=&to=` shows the capital history and profit moves for a period; `?report=1` / `?send=` the
// Report sheet / send preview (D-040).
export default async function PersonPage({
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
  const base = withQuery(`/people/${id}`, { ...range });
  const [{ data, books, asOf }, setup, journal] = await Promise.all([
    loadBooks(),
    loadSetup(),
    loadJournal(),
  ]);
  const person = setup.people.find((p) => p.id === id);
  if (!person) notFound();

  const [row] = peopleRows([person], books);
  const byId = new Map(journal.map((r) => [r.id, r]));
  const labels = entryLabels(journal, otherSide(setupNames(setup), "person")); // D-060
  const labelled = <T extends { entryId: string }>(lines: T[]) =>
    lines.map((l) => ({ ...l, label: labels.get(l.entryId) ?? "Entry" }));
  const detail = personDetail(id, books, data.allocations, asOf, (e) => byId.get(e)?.type);
  const cards = cardRows(
    setup.cards.filter((c) => c.ownerPersonId === id),
    books.cards,
  );
  const { profit } = detail;
  const period =
    range && statementRange(statementRowsOf("person", id, books, asOf), range.from, range.to);
  const inRange = <T extends { date: string }>(lines: T[]) =>
    range ? lines.filter((l) => l.date >= range.from && l.date <= range.to) : lines;

  const facts: [string, number][] = [
    ...(row.openingDifference == null
      ? []
      : ([["Opening difference", row.openingDifference]] as [string, number][])),
    ["Profit owed", row.profitOwed],
  ];
  const profitFacts: [string, number][] = [
    ["Allocated", profit.allocated],
    ...(profit.opening === 0
      ? []
      : ([["Opening profit owed", profit.opening]] as [string, number][])),
    ["Paid", profit.paid],
    ["Reinvested", profit.reinvested],
    ["Owed", profit.owed],
  ];

  return (
    <>
      <AccountHeader
        back={{ href: "/people", label: "People" }}
        actions={<QuickActions kind="person" row={person} from={base} />}
        name={person.name}
        due={`Capital ${format(row.capital)}`}
        phone={null}
      >
        <p className="text-muted-foreground mt-1 text-sm">
          {kindText(person)}
          {person.note && ` · ${person.note}`}
          {!person.active && <Badge>Inactive</Badge>}
        </p>
        <Facts label="Balances" facts={facts} />
      </AccountHeader>
      {entry && <EntryOverlay id={entry} closeHref={base} />}
      {bank && <BankOverlay owner={{ kind: "person", id, label: person.name }} closeHref={base} />}
      <AccountOverlays
        kind="person"
        id={id}
        base={base}
        report={report}
        send={send}
        range={range}
        first={journal.at(-1)?.date ?? null}
        today={dhakaToday()}
      />
      {range && <RangeChip {...range} clear={withQuery(base, { from: null, to: null })} />}

      <h2 className="mt-6 mb-2 font-semibold">Capital history</h2>
      <Statement
        kind="capital"
        label="Capital history"
        lines={labelled(period ? period.lines : detail.capital)}
        range={period ?? undefined}
        base={base}
      />
      <h2 className="mt-6 mb-2 font-semibold">Cards supplied</h2>
      <CardsSupplied cards={cards} />
      <h2 className="mt-6 mb-2 font-semibold">Profit</h2>
      <Facts label="Profit" facts={profitFacts} />
      <h3 className="mt-4 mb-2 text-sm font-semibold">Allocated per month</h3>
      <Allocations rows={detail.allocations} />
      <h3 className="mt-4 mb-2 text-sm font-semibold">Paid and reinvested</h3>
      <ProfitMoves lines={labelled(inRange(detail.profitMoves))} base={base} />
    </>
  );
}

function Facts({ label, facts }: { label: string; facts: [string, number][] }) {
  return (
    <dl aria-label={label} className="mt-3 grid grid-cols-2 gap-x-4 text-sm lg:grid-cols-5">
      {facts.map(([term, value]) => (
        <div key={term} className="flex min-h-11 flex-col justify-center">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="font-medium">
            <Amount poisha={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
