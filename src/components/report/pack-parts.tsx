import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/states";
import { formatDate, formatMonth } from "@/lib/dates";
import { sub } from "@/lib/money";
import { type DueChange, type MonthlyPack, sumOf } from "@/lib/monthly-pack";
import { type StockMoveRow, stockColumns, stockTotal } from "@/lib/stock-movement";
import { Section } from "./investor-view";

// D-045 (UIDD §4.17): the Monthly pack's sections 5–8: stock movement, dues and their change,
// card bills and cash flow by entry type. A phone shows list rows, desktop tables.

const cell = "px-3 py-2";
const num = `${cell} text-right tabular-nums`;
type Name = (id: string) => string;

export function StockPart({ rows, name }: { rows: StockMoveRow[]; name: Name }) {
  const cols = stockColumns(rows);
  const t = stockTotal(rows);
  return (
    <Section title="5. Stock movement">
      {rows.length === 0 ? (
        <EmptyState hint="No stock." />
      ) : (
        <>
          <ul aria-label="Stock movement" className="divide-y rounded-lg border lg:hidden">
            {rows.map((r) => (
              <li key={r.id} className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 px-3 py-2">
                <span className="font-medium">{name(r.id)}</span>
                <span className="text-right font-medium">
                  {r.closing} left · <Amount poisha={r.value} />
                </span>
                <span className="text-muted-foreground col-span-2 text-sm">
                  {cols
                    .filter(([k]) => k !== "closing" && r[k] !== 0)
                    .map(([k, h]) => `${h} ${r[k]}`)
                    .join(" · ") || "No moves"}
                </span>
              </li>
            ))}
            <li className="bg-muted/40 grid min-h-11 grid-cols-[1fr_auto] gap-x-3 px-3 py-2 font-medium">
              <span>Total</span>
              <span className="text-right">
                {t.closing} left · <Amount poisha={t.value} />
              </span>
            </li>
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border lg:block">
            <table aria-label="Stock movement" className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left">
                <tr>
                  <th className={`${cell} font-medium`}>Model</th>
                  {cols.map(([k, h]) => (
                    <th key={k} className={`${num} font-medium`}>
                      {h}
                    </th>
                  ))}
                  <th className={`${num} font-medium`}>Value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...rows, { ...t, id: "" }].map((r) => (
                  <tr key={r.id || "total"} className={r.id ? "" : "bg-muted/40 font-medium"}>
                    <td className={cell}>{r.id ? name(r.id) : "Total"}</td>
                    {cols.map(([k]) => (
                      <td key={k} className={num}>
                        {r[k]}
                      </td>
                    ))}
                    <td className={num}>
                      <Amount poisha={r.value} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}

function DueTable({ title, rows, name }: { title: string; rows: DueChange[]; name: Name }) {
  if (rows.length === 0) return null;
  const total = { start: sumOf(rows, (r) => r.start), end: sumOf(rows, (r) => r.end) };
  return (
    <div className="overflow-x-auto rounded-lg border lg:max-w-2xl">
      <table aria-label={title} className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground text-left">
          <tr>
            <th className={`${cell} font-medium`}>{title}</th>
            <th className={`${num} font-medium`}>Start</th>
            <th className={`${num} font-medium`}>End</th>
            <th className={`${num} hidden font-medium sm:table-cell`}>Change</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {[...rows, { id: "", ...total, change: sub(total.end, total.start) }].map((r) => (
            <tr key={r.id || "total"} className={r.id ? "" : "bg-muted/40 font-medium"}>
              <td className={cell}>{r.id ? name(r.id) : "Total"}</td>
              <td className={num}>
                <Amount poisha={r.start} />
              </td>
              <td className={num}>
                <Amount poisha={r.end} />
              </td>
              <td className={`${num} hidden sm:table-cell`}>
                <Amount poisha={r.change} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DuesPart({ dues, name }: { dues: MonthlyPack["dues"]; name: Name }) {
  return (
    <Section title="6. Dues and their change">
      {dues.customers.length + dues.suppliers.length === 0 ? (
        <EmptyState hint="No dues." />
      ) : (
        <>
          <DueTable title="Customers" rows={dues.customers} name={name} />
          <DueTable title="Suppliers" rows={dues.suppliers} name={name} />
        </>
      )}
    </Section>
  );
}

export function CardBillsPart({ cards, name }: { cards: MonthlyPack["cards"]; name: Name }) {
  return (
    <Section title="7. Card bills">
      {cards.bills.length === 0 ? (
        <EmptyState hint="No bills due next month or overdue." />
      ) : (
        <ul aria-label="Card bills" className="divide-y rounded-lg border lg:max-w-2xl">
          {cards.bills.map((b) => (
            <li
              key={`${b.cardId}-${b.month}`}
              className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 px-3 py-2"
            >
              <span className="font-medium">{name(b.cardId)}</span>
              <span className="text-right font-medium">
                <Amount poisha={b.remaining} />
              </span>
              <span className="text-muted-foreground text-sm">
                {formatMonth(b.month)} bill · due {formatDate(b.dueDate)}
                {b.overdue && <span className="text-destructive"> · overdue</span>}
              </span>
              <span className="text-muted-foreground text-right text-sm">
                of <Amount poisha={b.amount} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {cards.emi.length > 0 && (
        <ul aria-label="Remaining EMI" className="divide-y rounded-lg border lg:max-w-2xl">
          {cards.emi.map((e) => (
            <li key={e.cardId} className="flex min-h-11 items-center justify-between gap-3 px-3">
              <span>{name(e.cardId)} · EMI left</span>
              <Amount poisha={e.remaining} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function CashFlowPart({ cash }: { cash: MonthlyPack["cash"] }) {
  return (
    <Section title="8. Cash flow by entry type">
      <div className="overflow-x-auto rounded-lg border lg:max-w-2xl">
        <table aria-label="Cash flow" className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-left">
            <tr>
              <th className={`${cell} font-medium`}>Type</th>
              <th className={`${num} font-medium`}>In</th>
              <th className={`${num} font-medium`}>Out</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr className="font-medium">
              <td className={cell}>Opening</td>
              <td className={num}>
                <Amount poisha={cash.opening} />
              </td>
              <td className={num} />
            </tr>
            {cash.rows.map((r) => (
              <tr key={r.type}>
                <td className={cell}>{r.label}</td>
                <td className={num}>{r.in !== 0 && <Amount poisha={r.in} />}</td>
                <td className={num}>{r.out !== 0 && <Amount poisha={r.out} />}</td>
              </tr>
            ))}
            <tr className="bg-muted/40 font-semibold">
              <td className={cell}>Closing</td>
              <td className={num}>
                <Amount poisha={cash.closing} />
              </td>
              <td className={num} />
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  );
}
