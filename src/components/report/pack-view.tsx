import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/states";
import { positionSections } from "@/lib/dashboard";
import { formatDate, formatMonth } from "@/lib/dates";
import { type MonthlyPack, topGroups } from "@/lib/monthly-pack";
import { NOT_ALLOCATED, OPEN_NOTE, allocationText } from "@/lib/report-text";
import { Lines, Section } from "./investor-view";
import { CardBillsPart, CashFlowPart, DuesPart, StockPart } from "./pack-parts";
import { SalesView } from "./sales-view";

// D-045 (UIDD §4.17): the Monthly partner pack on screen, its 8 sections in order. The same model
// as its PDF, Excel and message.

const cell = "px-3 py-2";

export function PackView({ pack: p, names }: { pack: MonthlyPack; names: Record<string, string> }) {
  const name = (id: string) => names[id] ?? "—";
  return (
    <div className="flex flex-col gap-6">
      {!p.closed && <p className="text-muted-foreground text-sm">{OPEN_NOTE}</p>}

      <Section title="1. Profit & loss">
        <div className="overflow-x-auto rounded-lg border lg:max-w-2xl">
          <table aria-label="Profit & loss" className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-left">
              <tr>
                <th className={`${cell} font-medium`}>Line</th>
                <th className={`${cell} text-right font-medium`}>{formatMonth(p.month)}</th>
                <th className={`${cell} text-right font-medium`}>Last month</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {p.profit.rows.map((r) => (
                <tr key={r.label}>
                  <td className={cell}>{r.label}</td>
                  <td className={`${cell} text-right`}>
                    <Amount poisha={r.amount} />
                  </td>
                  <td className={`${cell} text-right`}>
                    {r.last == null ? "—" : <Amount poisha={r.last} />}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-semibold">
                <td className={cell}>Month profit</td>
                <td className={`${cell} text-right`}>
                  <Amount poisha={p.profit.total} />
                </td>
                <td className={`${cell} text-right`}>
                  {p.profit.last == null ? "—" : <Amount poisha={p.profit.last} />}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`2. Position on ${formatDate(p.end)}`}>
        <div className="grid gap-3 lg:grid-cols-3">
          {positionSections(p.position).map((s) => (
            <div key={s.title} className="flex flex-col gap-1">
              <h3 className="text-muted-foreground text-sm">{s.title}</h3>
              <Lines
                label={s.title}
                strongLast
                lines={[...s.lines, ...s.totals].map((l): [string, number] => [l.label, l.amount])}
              />
            </div>
          ))}
        </div>
        <p className="text-sm font-medium">
          {p.position.difference === 0 ? (
            "✓ The books balance"
          ) : (
            <span className="text-destructive">
              ✗ Off by <Amount poisha={p.position.difference} />
            </span>
          )}
        </p>
      </Section>

      <Section title="3. Allocations">
        {p.allocations.rows == null ? (
          <p className="text-muted-foreground text-sm">Profit {NOT_ALLOCATED}</p>
        ) : (
          <ul aria-label="Allocations" className="divide-y rounded-lg border lg:max-w-2xl">
            {p.allocations.rows.map((a) => (
              <li
                key={`${a.personId}-${a.kind}`}
                className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 px-3 py-2"
              >
                <span className="font-medium">{name(a.personId)}</span>
                <span className={`text-sm ${a.amount < 0 ? "text-destructive" : ""}`}>
                  {allocationText(a)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {p.allocations.owed.length > 0 && (
          <Lines
            label="Profit owed at month end"
            lines={p.allocations.owed.map((o): [string, number] => [
              `${name(o.id)} — owed on ${formatDate(p.end)}`,
              o.amount,
            ])}
          />
        )}
      </Section>

      <Section title="4. Sales">
        {p.sales.byModel.length === 0 ? (
          <EmptyState hint="No sales this month." />
        ) : (
          <SalesView
            report={{ ...p.sales, byCustomer: topGroups(p.sales.byCustomer) }}
            names={names}
            customerTitle="Top customers"
          />
        )}
      </Section>

      <StockPart rows={p.stock} name={name} />
      <DuesPart dues={p.dues} name={name} />
      <CardBillsPart cards={p.cards} name={name} />
      <CashFlowPart cash={p.cash} />
    </div>
  );
}
