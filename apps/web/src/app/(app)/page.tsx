import Link from "next/link";
import type { HomeView } from "@mbl/api/views/home.controller";
import { api } from "@/api/client";
import { Amount } from "@/components/amount";
import { BankBadge } from "@/components/cards/bank-badge";
import { EntryOverlay, preloadEntry } from "@/components/journal/entry-overlay";
import { entryLabel, whoOf } from "@mbl/domain/journal/labels";
import { EmptyState } from "@/components/states";
import { daysLeft } from "@mbl/domain/dashboard";
import { formatDate, formatMonth, monthOf } from "@mbl/domain/dates";
import { entryHref } from "@mbl/domain/href";
import { format } from "@mbl/domain/money";
import { cn } from "@/lib/utils";

// UIDD §4.2 (task 4.1.2–3): the engine's numbers as of today. Every amount comes from
// `computeBooks` (via `loadBooks`); stock units from the lots' remaining qty. Tiles open their
// pages, a card alert opens its card, and a recent entry opens over Home (`?entry=`, D-032).
// N-4.2: one `/views/home` read; the reductions over the books run in the api.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>;
}) {
  const { entry } = await searchParams;
  if (entry) preloadEntry(entry);
  const { asOf, books, units, dues, profit, alerts, cards, topDues, recent, names } =
    await api<HomeView>("/views/home");
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const month = monthOf(asOf);

  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Home</h1>
      {entry && <EntryOverlay id={entry} closeHref="/" />}
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile title="Cash" href="/reports/cash" alert={!!books.firstNegativeCash}>
          <Amount poisha={books.cash} />
          {books.firstNegativeCash && (
            <p role="alert" className="text-destructive text-sm font-normal">
              Cash went negative on {formatDate(books.firstNegativeCash)} — an entry is probably
              missing
            </p>
          )}
        </Tile>
        <Tile title="Stock" href="/stock">
          <Amount poisha={books.stock} />
          <p className="text-muted-foreground text-sm font-normal">
            {units} {units === 1 ? "unit" : "units"} at cost
          </p>
        </Tile>
        <Tile title="Customers owe" href="/reports/charts?tab=customers">
          <Amount poisha={books.customerDues} />
        </Tile>
        <Tile title="We owe suppliers" href="/suppliers">
          <Amount poisha={books.supplierDues} />
        </Tile>
        <Tile title="Card dues" href="/cards">
          <p className={cn("text-sm", dues.overdue > 0 && "text-destructive")}>
            Overdue <Amount poisha={dues.overdue} />
          </p>
          <p className={cn("text-sm", dues.week > 0 && "text-amber-700 dark:text-amber-400")}>
            Due in 7 days <Amount poisha={dues.week} />
          </p>
        </Tile>
        <Tile title={`Profit · ${formatMonth(month)}`} href="/reports/charts?tab=profit">
          <Amount poisha={profit} />
          <p className="text-muted-foreground text-sm font-normal">This month so far</p>
        </Tile>
        {!books.openingDifference.resolved && (
          <Tile title="Opening difference" href="/people">
            <Amount poisha={books.openingDifference.total} />
            <p className="text-muted-foreground text-sm font-normal">Not resolved yet</p>
          </Tile>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <List
          title="Card alerts"
          more={{ href: "/cards", label: "All cards" }}
          empty="No card bills to pay."
        >
          {alerts.map((a) => (
            <Item key={a.cardId} href={`/cards/${a.cardId}`}>
              <span className="flex items-center gap-2 font-medium">
                <BankBadge name={cardById.get(a.cardId)?.name ?? ""} />
                {names[a.cardId] ?? "Card"}
              </span>
              <Amount poisha={a.amount} className="text-right font-medium" />
              <span
                className={cn(
                  "text-sm",
                  a.daysLeft < 0 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                Due {formatDate(a.dueDate)} · {daysLeft(a.daysLeft)}
              </span>
            </Item>
          ))}
        </List>

        <List
          title="Top customer dues"
          more={{ href: "/customers", label: "All customers" }}
          empty="No customer owes anything."
        >
          {topDues.map((d) => (
            <Item key={d.customerId} href={`/customers/${d.customerId}`}>
              <span className="font-medium">{names[d.customerId] ?? "Customer"}</span>
              <span className="text-right font-medium">
                Owes <Amount poisha={d.balance} />
              </span>
              {d.aboveTarget != null && (
                <span
                  className={cn(
                    "text-sm",
                    d.aboveTarget <= 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-destructive",
                  )}
                >
                  Above target: {format(d.aboveTarget)}
                </span>
              )}
            </Item>
          ))}
        </List>

        <List
          title="Recent entries"
          more={{ href: "/journal", label: "Journal" }}
          empty="No entries yet."
        >
          {recent.map((row) => (
            <Item key={row.id} href={entryHref("/", row.id)} scroll={false}>
              <span className="font-medium">{entryLabel(row)}</span>
              <Amount poisha={row.amount} className="text-right font-medium" />
              <span className="text-muted-foreground truncate text-sm">
                {formatDate(row.date)}
                {whoOf(row, names) && ` · ${whoOf(row, names)}`}
              </span>
            </Item>
          ))}
        </List>
      </div>
    </>
  );
}

function Tile({
  title,
  href,
  alert,
  children,
}: {
  title: string;
  href: string;
  alert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="hover:bg-muted/40 rounded-lg">
      <div
        className={cn(
          "flex h-full flex-col gap-1 rounded-lg border p-3",
          alert && "border-destructive",
        )}
      >
        <h2 className="text-muted-foreground text-sm">{title}</h2>
        <div className="flex flex-col gap-1 text-lg font-semibold">{children}</div>
      </div>
    </Link>
  );
}

function List({
  title,
  more,
  empty,
  children,
}: {
  title: string;
  more: { href: string; label: string };
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Link href={more.href} className="text-primary flex min-h-11 items-center text-sm">
          {more.label}
        </Link>
      </div>
      {children.length ? (
        <ul className="divide-y rounded-lg border">{children}</ul>
      ) : (
        <EmptyState hint={empty} />
      )}
    </section>
  );
}

function Item({
  href,
  scroll,
  children,
}: {
  href: string;
  scroll?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="px-3">
      <Link href={href} scroll={scroll} className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2">
        {children}
      </Link>
    </li>
  );
}
