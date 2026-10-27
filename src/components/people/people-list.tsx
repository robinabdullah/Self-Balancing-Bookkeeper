import Link from "next/link";
import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/states";
import { rowClass, rowLinkClass } from "@/components/tables/row-link";
import { Button } from "@/components/ui/button";
import type { PersonRow } from "@/lib/people-view";
import { cn } from "@/lib/utils";

// UIDD §4.8 (task 4.5): the People list: name, kind, capital, profit owed (and the opening
// difference while it is unresolved, SRS §5). A stacked row each on a phone, a table at ≥ 1024px;
// a row opens the person's detail.

export const kindText = (p: Pick<PersonRow, "kind" | "profitSharePct">) =>
  p.kind === "partner"
    ? `Partner${p.profitSharePct == null ? "" : ` · ${Number(p.profitSharePct)}%`}`
    : "Investor";

const personHref = (p: PersonRow) => `/people/${p.id}`;

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-muted ml-2 rounded-full border px-2 py-0.5 text-xs font-normal">
      {children}
    </span>
  );
}

/** `href`: where a row goes (the person's page; D-045: the Investor report's list → their report). */
export function PeopleList({
  rows,
  href = personHref,
  label = "People",
}: {
  rows: PersonRow[];
  href?: (p: PersonRow) => string;
  label?: string;
}) {
  if (rows.length === 0)
    return (
      <EmptyState hint="No people yet. Add one in Setup.">
        <Button asChild className="min-h-11">
          <Link href="/setup">Setup</Link>
        </Button>
      </EmptyState>
    );

  const showDiff = rows.some((p) => p.openingDifference != null);
  return (
    <>
      <ul aria-label={label} className="divide-y rounded-lg border lg:hidden">
        {rows.map((p) => (
          <li key={p.id} className="px-3">
            <Link href={href(p)} className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2">
              <span className="font-medium">
                {p.name}
                {!p.active && <Badge>Inactive</Badge>}
              </span>
              <span className="text-right font-medium">
                Capital <Amount poisha={p.capital} />
              </span>
              <span className="text-muted-foreground text-sm">{kindText(p)}</span>
              <span className="text-muted-foreground text-right text-sm">
                Profit owed <Amount poisha={p.profitOwed} />
              </span>
              {p.openingDifference != null && (
                <span className="text-muted-foreground col-span-2 text-sm">
                  Opening difference <Amount poisha={p.openingDifference} />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border lg:block">
        <table aria-label={label} className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 text-right font-medium">Capital</th>
              {showDiff && <th className="px-3 py-2 text-right font-medium">Opening difference</th>}
              <th className="px-3 py-2 text-right font-medium">Profit owed</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((p) => (
              <tr key={p.id} className={rowClass}>
                <td className="px-3 py-2">
                  <Link href={href(p)} className={cn("text-primary", rowLinkClass)}>
                    {p.name}
                  </Link>
                  {!p.active && <Badge>Inactive</Badge>}
                </td>
                <td className="px-3 py-2">{kindText(p)}</td>
                <td className="px-3 py-2 text-right">
                  <Amount poisha={p.capital} />
                </td>
                {showDiff && (
                  <td className="px-3 py-2 text-right">
                    {p.openingDifference != null && <Amount poisha={p.openingDifference} />}
                  </td>
                )}
                <td className="px-3 py-2 text-right">
                  <Amount poisha={p.profitOwed} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
