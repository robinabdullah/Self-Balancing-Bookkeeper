import Link from "next/link";
import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/states";
import { rowClass, rowLinkClass } from "@/components/tables/row-link";
import type { StatementLine, StatementRange } from "@/lib/accounts";
import { formatDate } from "@/lib/dates";
import { entryHref } from "@/lib/href";
import { cn } from "@/lib/utils";

// UIDD §4.8 (task 4.3): a due statement, newest first. At ≥ 1024px a table (date, entry, debit,
// credit, running balance); on a phone one row per entry: date + entry on the left, the signed
// amount and the balance after it on the right. A row opens the entry over this page
// (`base`, D-032).
// A customer's due going up is a debit; a supplier's (we owe more) is a credit. A person's capital
// (task 4.5) shows In / Out; a card (D-040) Charges / Credits.
// For a period (`range`, D-040) the lines come oldest first between an Opening balance row and the
// period's Totals and Closing balance rows.

type Line = StatementLine & { label: string };
type Props = {
  kind: "customer" | "supplier" | "capital" | "card";
  lines: Line[];
  range?: Omit<StatementRange, "lines">;
  /** This page's URL: an entry opens over it. */
  base: string;
  label?: string;
};

const HEADS = {
  customer: ["Debit", "Credit"],
  supplier: ["Debit", "Credit"],
  capital: ["In", "Out"],
  card: ["Charges", "Credits"],
};

export function Statement({ kind, lines, range, base, label = "Statement" }: Props) {
  if (lines.length === 0 && !range) return <EmptyState hint="No entries yet." />;
  const pick = (up: number | null, down: number | null) =>
    kind === "supplier" ? [down, up] : [up, down];
  const first = (l: Line) => pick(l.up, l.down)[0];
  const second = (l: Line) => pick(l.up, l.down)[1];
  const heads = HEADS[kind];
  const href = (l: Line) => entryHref(base, l.entryId);
  const totals = range && pick(range.up, range.down);

  return (
    <>
      <ul aria-label={label} className="divide-y rounded-lg border lg:hidden">
        {range && <BalanceItem label="Opening balance" poisha={range.opening} />}
        {lines.map((l) => (
          <li key={l.entryId} className="px-3">
            <Link
              href={href(l)}
              scroll={false}
              className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2"
            >
              <span className="font-medium">{l.label}</span>
              <Amount poisha={l.amount} className="text-right font-medium" />
              <span className="text-muted-foreground text-sm">{formatDate(l.date)}</span>
              <span className="text-muted-foreground text-right text-sm">
                Balance <Amount poisha={l.balance} />
              </span>
            </Link>
          </li>
        ))}
        {range && (
          <li className="text-muted-foreground grid min-h-11 grid-cols-[1fr_auto] gap-x-3 px-3 py-2 text-sm">
            <span>Totals</span>
            <span className="text-right">
              {heads[0]} <Amount poisha={totals![0] ?? 0} /> · {heads[1]}{" "}
              <Amount poisha={totals![1] ?? 0} />
            </span>
          </li>
        )}
        {range && <BalanceItem label="Closing balance" poisha={range.closing} />}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border lg:block">
        <table aria-label={label} className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Entry</th>
              {heads.map((h) => (
                <th key={h} className="px-3 py-2 text-right font-medium">
                  {h}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {range && <BalanceRow label="Opening balance" poisha={range.opening} />}
            {lines.map((l) => (
              <tr key={l.entryId} className={rowClass}>
                <td className="px-3 py-2">{formatDate(l.date)}</td>
                <td className="px-3 py-2">
                  <Link href={href(l)} scroll={false} className={cn("text-primary", rowLinkClass)}>
                    {l.label}
                  </Link>
                </td>
                {[first(l), second(l)].map((n, i) => (
                  <td key={i} className="px-3 py-2 text-right">
                    {n != null && <Amount poisha={n} />}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-medium">
                  <Amount poisha={l.balance} />
                </td>
              </tr>
            ))}
            {range && (
              <tr className="text-muted-foreground">
                <td className="px-3 py-2" colSpan={2}>
                  Totals
                </td>
                {totals!.map((n, i) => (
                  <td key={i} className="px-3 py-2 text-right">
                    <Amount poisha={n ?? 0} />
                  </td>
                ))}
                <td />
              </tr>
            )}
            {range && <BalanceRow label="Closing balance" poisha={range.closing} />}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BalanceItem({ label, poisha }: { label: string; poisha: number }) {
  return (
    <li className="bg-muted/40 grid min-h-11 grid-cols-[1fr_auto] items-center gap-x-3 px-3 py-2 font-medium">
      <span>{label}</span>
      <Amount poisha={poisha} className="text-right" />
    </li>
  );
}

function BalanceRow({ label, poisha }: { label: string; poisha: number }) {
  return (
    <tr className="bg-muted/40 font-medium">
      <td className="px-3 py-2" colSpan={4}>
        {label}
      </td>
      <td className="px-3 py-2 text-right">
        <Amount poisha={poisha} />
      </td>
    </tr>
  );
}
