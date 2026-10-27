import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/states";
import { AVG, type ModelRow, modelTotal, piecesAt } from "@mbl/domain/by-model";
import { loadStatementExtras } from "@/server/account-reports";

// D-045 (UIDD §4.8): the By model tables under a customer's or supplier's statement for a period
// (Model · Pieces · Avg unit price · Amount, no profit; D-056: on a phone the average sits under
// the model, "30 pcs × ৳15,700"). The same loader as its PDF, Excel and message.

export async function StatementByModel({
  kind,
  id,
  from,
  to,
}: {
  kind: "customer" | "supplier";
  id: string;
  from: string;
  to: string;
}) {
  const x = await loadStatementExtras(kind, id, from, to);
  if (!x || x.kind === "card") return null;
  const name = (m: string) => x.names[m] ?? "—";
  return x.kind === "customer" ? (
    <>
      <ByModel
        title="Sales by model"
        rows={x.byModel}
        name={name}
        empty="No sales in this period."
      />
      {x.bought.length > 0 && <ByModel title="Bought from you" rows={x.bought} name={name} />}
    </>
  ) : (
    <ByModel
      title="Purchases by model"
      rows={x.byModel}
      name={name}
      empty="No purchases in this period."
    />
  );
}

export function ByModel({
  title,
  rows,
  name,
  empty,
}: {
  title: string;
  rows: ModelRow[];
  name: (id: string) => string;
  empty?: string;
}) {
  const t = modelTotal(rows);
  return (
    <section aria-label={title} className="mt-6 flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState hint={empty ?? "Nothing in this period."} />
      ) : (
        <table aria-label={title} className="w-full rounded-lg border text-sm lg:max-w-2xl">
          <thead className="bg-muted/40 text-muted-foreground text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 text-right font-medium">Pieces</th>
              <th className="hidden px-3 py-2 text-right font-medium lg:table-cell">{AVG}</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  {name(r.id)}
                  {r.avg != null && (
                    <span className="text-muted-foreground block text-sm lg:hidden">
                      {piecesAt(r)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.pieces}</td>
                <td className="hidden px-3 py-2 text-right lg:table-cell">
                  {r.avg == null ? "—" : <Amount poisha={r.avg} />}
                </td>
                <td className="px-3 py-2 text-right">
                  <Amount poisha={r.amount} />
                </td>
              </tr>
            ))}
            <tr className="bg-muted/40 font-medium">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{t.pieces}</td>
              <td className="hidden lg:table-cell" />
              <td className="px-3 py-2 text-right">
                <Amount poisha={t.amount} />
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
