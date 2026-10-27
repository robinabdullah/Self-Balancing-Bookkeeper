import { Amount } from "@/components/amount";
import { InfoNote } from "@/components/info-note";
import { EmptyState } from "@/components/states";
import { AVG, pcs, piecesAt } from "@/lib/by-model";
import { viewHelp } from "@/lib/help-text";
import { add } from "@/lib/money";
import type { SalesGroup, SalesReport } from "@/lib/sales-report";

// D-043 (UIDD §4.17): the Sales report's totals, then By model and By customer (net of returns,
// largest sales first; each table totals the net sales profit). At ≥ 1024px tables; on a phone
// one row per model / customer: the name and sales, then pieces and profit. D-056: By model has
// the Avg unit price (a column; on a phone "30 pcs × ৳15,700").

export function SalesView({
  report: r,
  names,
  customerTitle = "By customer",
}: {
  report: SalesReport;
  names: Record<string, string>;
  /** D-045: the Monthly pack shows "Top customers". */
  customerTitle?: string;
}) {
  if (r.byModel.length === 0) return <EmptyState hint="No sales in this period." />;
  return (
    <div className="flex flex-col gap-4">
      <dl aria-label="Totals" className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
        <Figure label="Bills">{r.bills}</Figure>
        <Figure label="Pieces">{r.pieces}</Figure>
        <Figure label="Sales">
          <Amount poisha={r.sales} />
        </Figure>
        <Figure label="Cost">
          <Amount poisha={r.cost} />
        </Figure>
        <Figure label="Gross profit">
          <Amount poisha={r.grossProfit} />
        </Figure>
        <Figure label="Margin">{r.margin == null ? "—" : `${r.margin}%`}</Figure>
        <Figure label="Returns">
          {pcs(r.returns.pieces)} · <Amount poisha={r.returns.amount} />
          <span className="text-muted-foreground block text-sm font-normal">
            Profit <Amount poisha={r.returns.profit} />
          </span>
        </Figure>
        <Figure label={<InfoNote label="Net sales profit" note={viewHelp.salesReport} />}>
          <Amount poisha={r.netProfit} />
        </Figure>
      </dl>
      <Groups title="By model" head="Model" groups={r.byModel} names={names} avg />
      <Groups title={customerTitle} head="Customer" groups={r.byCustomer} names={names} />
    </div>
  );
}

function Figure({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function Groups({
  title,
  head,
  groups,
  names,
  avg = false,
}: {
  title: string;
  head: string;
  groups: SalesGroup[];
  names: Record<string, string>;
  /** D-056: the Avg unit price (By model only). */
  avg?: boolean;
}) {
  if (groups.length === 0) return null;
  const total = (k: "pieces" | "sales" | "profit") => groups.reduce((s, g) => add(s, g[k]), 0);
  const name = (id: string) => names[id] ?? "—";
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      <ul aria-label={title} className="divide-y rounded-lg border lg:hidden">
        {groups.map((g) => (
          <li key={g.id} className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 px-3 py-2">
            <span className="font-medium">{name(g.id)}</span>
            <Amount poisha={g.sales} className="text-right font-medium" />
            <span className="text-muted-foreground text-sm">
              {avg ? piecesAt(g) : pcs(g.pieces)}
            </span>
            <span className="text-muted-foreground text-right text-sm">
              Profit <Amount poisha={g.profit} />
            </span>
          </li>
        ))}
        <li className="bg-muted/40 grid min-h-11 grid-cols-[1fr_auto] gap-x-3 px-3 py-2 font-medium">
          <span>Total · {pcs(total("pieces"))}</span>
          <span className="text-right">
            <Amount poisha={total("sales")} /> · Profit <Amount poisha={total("profit")} />
          </span>
        </li>
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border lg:block">
        <table aria-label={title} className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-left">
            <tr>
              <th className="px-3 py-2 font-medium">{head}</th>
              <th className="px-3 py-2 text-right font-medium">Pieces</th>
              {avg && <th className="px-3 py-2 text-right font-medium">{AVG}</th>}
              <th className="px-3 py-2 text-right font-medium">Sales</th>
              <th className="px-3 py-2 text-right font-medium">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {groups.map((g) => (
              <tr key={g.id}>
                <td className="px-3 py-2">{name(g.id)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{g.pieces}</td>
                {avg && (
                  <td className="px-3 py-2 text-right">
                    {g.avg == null ? "—" : <Amount poisha={g.avg} />}
                  </td>
                )}
                <td className="px-3 py-2 text-right">
                  <Amount poisha={g.sales} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Amount poisha={g.profit} />
                </td>
              </tr>
            ))}
            <tr className="bg-muted/40 font-medium">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{total("pieces")}</td>
              {avg && <td />}
              <td className="px-3 py-2 text-right">
                <Amount poisha={total("sales")} />
              </td>
              <td className="px-3 py-2 text-right">
                <Amount poisha={total("profit")} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
