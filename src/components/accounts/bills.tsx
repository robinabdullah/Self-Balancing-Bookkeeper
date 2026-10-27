import Link from "next/link";
import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/states";
import { formatDate } from "@/lib/dates";
import { entryHref, withQuery } from "@/lib/href";
import { add, format, mul } from "@/lib/money";
import { invoiceLabel } from "@/lib/whatsapp";
import type { Bill } from "@/server/accounts";

// UIDD §4.8 (task 4.3.1): a customer's Bills tab: each sale, newest first, with its lines, total
// and profit (from the books). A reversed bill says so; its profit is cancelled by the reversal.
// Each bill that stands has Send ▸: the send preview over this page (D-040). Each shows its
// invoice number (D-042).

type Props = {
  bills: (Bill & { profit: number })[];
  names: Record<string, string>;
  /** This page's URL: a bill opens over it (D-032). */
  base: string;
};

export function Bills({ bills, names, base }: Props) {
  if (bills.length === 0) return <EmptyState hint="No bills yet." />;
  return (
    <ul aria-label="Bills" className="flex flex-col gap-3">
      {bills.map((b) => {
        const total = b.lines.reduce((n, l) => add(n, mul(l.unitPrice, l.qty)), 0);
        return (
          <li key={b.id} className="rounded-lg border">
            <Link
              href={entryHref(base, b.id)}
              scroll={false}
              className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 px-3 py-2"
            >
              {/* Date, number and chip stay whole; the chip wraps to its own line on a phone. */}
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                <span className="whitespace-nowrap">
                  {formatDate(b.date)}
                  {b.invoiceNo != null && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {invoiceLabel(b.invoiceNo)}
                    </span>
                  )}
                </span>
                {b.reversedBy && (
                  <span className="bg-muted rounded-full border px-2 py-0.5 text-xs font-normal">
                    Reversed
                  </span>
                )}
              </span>
              <Amount poisha={total} className="text-right font-medium" />
              <span className="text-muted-foreground truncate text-sm">{b.note}</span>
              <span className="text-muted-foreground text-right text-sm whitespace-nowrap">
                Profit <Amount poisha={b.profit} />
              </span>
            </Link>
            <ul aria-label="Lines" className="bg-muted/40 divide-y border-t text-sm">
              {b.lines.map((l, i) => (
                <li key={i} className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-2">
                  <span>{names[l.modelId] ?? "Model"}</span>
                  <Amount poisha={mul(l.unitPrice, l.qty)} className="text-right" />
                  <span className="text-muted-foreground col-span-2">
                    {l.qty} × {format(l.unitPrice)} · cost {format(l.unitCost)} each
                  </span>
                </li>
              ))}
            </ul>
            {!b.reversedBy && (
              <p className="flex justify-end border-t px-1">
                <Link
                  href={withQuery(base, { send: b.id })}
                  scroll={false}
                  aria-label={`Send the ${formatDate(b.date)} bill on WhatsApp`}
                  className="text-primary flex min-h-11 items-center px-3 text-sm font-medium"
                >
                  Send ▸
                </Link>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
