import Link from "next/link";
import { Amount } from "@/components/amount";
import { BankBadge } from "@/components/cards/bank-badge";
import { StatusBadge } from "@/components/cards/card-list";
import { formatDate, formatMonth } from "@mbl/domain/dates";
import type { InvestorReport } from "@mbl/domain/investor-report";
import {
  NOT_ALLOCATED,
  OPEN_NOTE,
  allocationText,
  cardState,
  monthsLabel,
} from "@mbl/domain/report-text";

// D-045 (UIDD §4.17): a person's Investor / Partner report on screen: capital, card investment,
// allocations per month, the profit roll-forward to "Profit owed now" and, for a partner, the
// share % and opening difference. The same model as its PDF, Excel and message.

const row = "flex min-h-11 items-center justify-between gap-3 px-3";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Label / amount lines; the last one bold when `strongLast`. */
export function Lines({
  label,
  lines,
  strongLast = false,
}: {
  label: string;
  lines: [React.ReactNode, number][];
  strongLast?: boolean;
}) {
  return (
    <dl aria-label={label} className="divide-y rounded-lg border lg:max-w-md">
      {lines.map(([term, amount], i) => (
        <div
          key={i}
          className={`${row} ${strongLast && i === lines.length - 1 ? "font-semibold" : ""}`}
        >
          <dt>{term}</dt>
          <dd>
            <Amount poisha={amount} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function InvestorView({ report: r }: { report: InvestorReport }) {
  const p = r.profit;
  const period = monthsLabel(r.from, r.to);
  return (
    <div className="flex flex-col gap-6">
      {r.open && <p className="text-muted-foreground text-sm">{OPEN_NOTE}</p>}

      <Section title="Capital">
        <Lines
          label="Capital"
          strongLast
          lines={[
            [`On ${formatDate(r.from)}`, r.capital.opening],
            ...r.capital.groups.map((g): [string, number] => [g.label, g.amount]),
            [`On ${formatDate(r.to)}`, r.capital.closing],
          ]}
        />
      </Section>

      {r.cards.length > 0 && (
        <Section title="Card investment">
          <p className="text-muted-foreground text-sm">As on {formatDate(r.to)}</p>
          <ul aria-label="Cards supplied" className="divide-y rounded-lg border lg:max-w-2xl">
            {r.cards.map((c) => (
              <li key={c.id} className="px-3">
                <Link
                  href={`/cards/${c.id}`}
                  className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <BankBadge name={c.name} />
                    {c.display}
                  </span>
                  <span className="text-right">
                    <StatusBadge status={c.status} />
                  </span>
                  <span className="text-muted-foreground col-span-2 text-sm">{cardState(c)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Lines
            label="Card payments"
            lines={[[`Card payments made in ${period}`, r.cardPayments]]}
          />
        </Section>
      )}

      <Section title="Allocations">
        <ul aria-label="Allocations" className="divide-y rounded-lg border lg:max-w-2xl">
          {r.months.map((m) => (
            <li key={m.month} className="flex min-h-11 flex-col justify-center gap-0.5 px-3 py-2">
              <span className="font-medium">{formatMonth(m.month)}</span>
              {m.rows == null ? (
                <span className="text-muted-foreground text-sm">{NOT_ALLOCATED}</span>
              ) : m.rows.length === 0 ? (
                <span className="text-muted-foreground text-sm">nothing allocated</span>
              ) : (
                m.rows.map((a) => (
                  <span
                    key={a.kind}
                    className={`text-sm ${a.amount < 0 ? "text-destructive" : ""}`}
                  >
                    {allocationText(a)}
                  </span>
                ))
              )}
              {m.basisNote && (
                <span className="text-muted-foreground text-sm">Cash basis set at close</span>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Profit owed">
        <Lines
          label="Profit owed"
          strongLast
          lines={[
            [`Owed before ${formatDate(r.from)}`, p.before],
            [`Allocated for ${period}`, p.allocated],
            ...(p.later !== 0 ? [["Allocated for later months", p.later] as [string, number]] : []),
            ...(p.other !== 0 ? [["Opening & corrections", p.other] as [string, number]] : []),
            ...p.paid.map((l): [string, number] => [`Paid on ${formatDate(l.date)}`, 0 - l.amount]),
            ...p.reinvested.map((l): [string, number] => [
              `Reinvested on ${formatDate(l.date)}`,
              0 - l.amount,
            ]),
            ["Profit owed now", p.owedNow],
          ]}
        />
      </Section>

      {r.partner && (
        <Section title="Partner">
          <dl aria-label="Partner" className="divide-y rounded-lg border lg:max-w-md">
            <div className={row}>
              <dt>Share now</dt>
              <dd>{r.partner.sharePct == null ? "—" : `${r.partner.sharePct}%`}</dd>
            </div>
            {r.partner.openingDifference != null && (
              <div className={row}>
                <dt>Opening difference</dt>
                <dd>
                  <Amount poisha={r.partner.openingDifference} />
                </dd>
              </div>
            )}
          </dl>
        </Section>
      )}
    </div>
  );
}
