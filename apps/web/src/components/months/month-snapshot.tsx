import { Amount } from "@/components/amount";
import type { Allocation } from "@mbl/domain/engine/months";
import { add } from "@mbl/domain/money";
import type { BreakdownLine } from "@mbl/domain/months-view";

// UIDD §4.9 (tasks 5.1, 5.2): the profit breakdown (the close screen and a closed month), and a
// closed month's stored allocations, read-only: investors (basis × rate % = amount), then the
// partners' split. A loss shows in red (`Amount`).

const PART = { cash: "Cash", card: "Card", partner: "Partner" } as const;
const row = "flex min-h-11 items-center justify-between gap-3 px-3";

export function Breakdown({ lines, total }: { lines: BreakdownLine[]; total: number }) {
  return (
    <section aria-labelledby="breakdown" className="mb-6">
      <h2 id="breakdown" className="mb-2 font-semibold">
        Profit breakdown
      </h2>
      <dl aria-label="Profit breakdown" className="divide-y rounded-lg border lg:max-w-md">
        {lines.map((l) => (
          <div key={l.label} className={row}>
            <dt>{l.label}</dt>
            <dd>
              <Amount poisha={l.amount} />
            </dd>
          </div>
        ))}
        <div className={`${row} font-semibold`}>
          <dt>Month profit</dt>
          <dd>
            <Amount poisha={total} />
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function ClosedAllocations({
  rows,
  nameOf,
}: {
  rows: Allocation[];
  nameOf: Map<string, string>;
}) {
  const investors = rows.filter((r) => r.kind !== "partner");
  const partners = rows.filter((r) => r.kind === "partner");
  const name = (r: Allocation) => nameOf.get(r.personId) ?? "Person";
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="investors">
        <h2 id="investors" className="mb-2 font-semibold">
          Investor allocations
        </h2>
        <ul aria-label="Investor allocations" className="divide-y rounded-lg border lg:max-w-2xl">
          {investors.length === 0 && (
            <li className={`${row} text-muted-foreground text-sm`}>No investor allocations.</li>
          )}
          {investors.map((r) => (
            <li key={`${r.personId}-${r.kind}`} className={`${row} flex-wrap py-2`}>
              <span className="font-medium">
                {name(r)} · {PART[r.kind]}
              </span>
              <span className="text-sm">
                <Amount poisha={r.basis ?? 0} /> × {r.ratePct}% ={" "}
                <Amount poisha={r.amount} className="font-medium" />
              </span>
            </li>
          ))}
          <li className={`${row} font-medium`}>
            <span>Total to investors</span>
            <Amount poisha={investors.reduce((n, r) => add(n, r.amount), 0)} />
          </li>
        </ul>
      </section>
      <section aria-labelledby="partners">
        <h2 id="partners" className="mb-2 font-semibold">
          Partners
        </h2>
        <ul aria-label="Partner split" className="divide-y rounded-lg border lg:max-w-md">
          {partners.map((r) => (
            <li key={r.personId} className={row}>
              <span>{name(r)}</span>
              <Amount poisha={r.amount} className="font-medium" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
