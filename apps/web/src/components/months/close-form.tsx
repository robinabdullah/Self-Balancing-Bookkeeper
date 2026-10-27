"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Amount } from "@/components/amount";
import { inputClass } from "@/components/forms/field";
import { FormModal } from "@/components/forms/form-modal";
import { Button } from "@/components/ui/button";
import { formatMonth } from "@mbl/domain/dates";
import { computeClose } from "@mbl/domain/engine/months";
import type { Partner } from "@mbl/domain/engine/post";
import type { Errors } from "@mbl/domain/guards";
import { add, parse, pct, plain, sub } from "@mbl/domain/money";
import { type InvestorLine, parseRate, readLine } from "@mbl/domain/months-view";
import type { Result } from "@/server/action";
import { closeMonth } from "@/server/actions/months";

// UIDD §4.9 steps 2–3, 5 (tasks 5.1, 5.2): the investor allocations (basis × rate % = amount; the
// amount follows basis × rate until it is typed over) and the partners' split of what is left,
// live. On a phone each line is a card; at ≥ 1024px the lines form a table. A line without an
// amount is skipped (D-028). Close month → a confirm with the lock warning → `closeMonth`.

type Text = { basis: string; rate: string; amount: string | null };

const PART = { cash: "Cash", card: "Card" } as const;

/** A line's amount text (auto until typed over), what it counts (`readLine`) and its errors. */
function read(t: Text) {
  const basis = t.basis.trim() ? parse(t.basis) : null;
  const rate = t.rate.trim() ? parseRate(t.rate) : null;
  const auto = basis != null && basis >= 0 && rate != null ? pct(basis, rate) : null;
  const amountText = t.amount ?? (auto == null ? "" : plain(auto));
  const line = readLine({ basis: t.basis, ratePct: t.rate, amount: amountText });
  return { amountText, amount: line.amount, errors: Object.values(line.errors) };
}

export function CloseForm({
  month,
  profit,
  investors,
  partners,
}: {
  month: string;
  profit: number;
  investors: InvestorLine[];
  partners: (Partner & { name: string })[];
}) {
  const [texts, setTexts] = useState<Text[]>(() =>
    investors.map((l) => ({
      basis: l.basis == null ? "" : plain(l.basis),
      rate: l.ratePct == null ? "" : String(l.ratePct),
      amount: null,
    })),
  );
  const [id] = useState(() => crypto.randomUUID());
  const [confirm, setConfirm] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const router = useRouter();
  const set = (i: number, patch: Partial<Text>) => {
    setTexts((all) => all.map((t, j) => (j === i ? { ...t, ...patch } : t)));
    setServerErrors({});
  };

  const lines = texts.map(read);
  const toInvestors = lines.reduce((n, l) => add(n, l.amount), 0);
  const split =
    partners.length === 0
      ? []
      : computeClose({ month, total: profit }, lines, partners).map((a, i) => ({
          ...partners[i],
          amount: a.amount,
        }));

  // The close sends every line as FormData would name it (`allocations.N.*`).
  const fields: Record<string, string> = { id, month };
  investors.forEach((l, i) =>
    Object.assign(fields, {
      [`allocations.${i}.personId`]: l.personId,
      [`allocations.${i}.kind`]: l.kind,
      [`allocations.${i}.basis`]: texts[i].basis,
      [`allocations.${i}.ratePct`]: texts[i].rate,
      [`allocations.${i}.amount`]: lines[i].amountText,
    }),
  );
  /** Line errors show on the lines; the confirm shows a whole-form message. */
  async function submit(input: Record<string, unknown>): Promise<Result> {
    const result = await closeMonth(input);
    if (result.status !== "invalid" || result.errors.form) return result;
    setServerErrors(result.errors);
    return { status: "invalid", errors: { form: "Fix the marked investor lines first" } };
  }
  const lineErrors = (i: number) => [
    ...lines[i].errors,
    ...Object.entries(serverErrors)
      .filter(([k]) => k.startsWith(`allocations.${i}.`))
      .map(([, m]) => m),
  ];
  const blocked = lines.some((l) => l.errors.length > 0);

  return (
    <>
      <form noValidate onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-6">
        <section aria-labelledby="investors">
          <h2 id="investors" className="mb-2 font-semibold">
            Investor allocations
          </h2>
          {investors.length === 0 ? (
            <p className="text-muted-foreground text-sm">No investors.</p>
          ) : (
            <ul aria-label="Investor allocations" className="flex flex-col gap-2 lg:gap-0">
              <li
                aria-hidden
                className="text-muted-foreground hidden grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] gap-3 px-2 pb-1 text-sm lg:grid"
              >
                <span>Investor</span>
                <span>Basis</span>
                <span>Rate %</span>
                <span>Amount</span>
              </li>
              {investors.map((l, i) => {
                const who = `${l.name} ${l.kind}`;
                const name = (f: string) => `allocations.${i}.${f}`;
                return (
                  <li
                    key={`${l.personId}-${l.kind}`}
                    className="rounded-lg border p-3 lg:grid lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] lg:items-center lg:gap-3 lg:rounded-none lg:border-0 lg:border-t lg:px-2 lg:py-1"
                  >
                    <p className="font-medium">
                      {l.name} · {PART[l.kind]}
                    </p>
                    <input type="hidden" name={name("personId")} value={l.personId} />
                    <input type="hidden" name={name("kind")} value={l.kind} />
                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,4.5rem)_auto_minmax(0,1fr)] items-center gap-1 lg:contents">
                      <input
                        aria-label={`${who} basis`}
                        name={name("basis")}
                        inputMode="decimal"
                        autoComplete="off"
                        value={texts[i].basis}
                        onChange={(e) => set(i, { basis: e.target.value })}
                        className={inputClass}
                      />
                      <span aria-hidden className="lg:hidden">
                        ×
                      </span>
                      <input
                        aria-label={`${who} rate %`}
                        name={name("ratePct")}
                        inputMode="decimal"
                        autoComplete="off"
                        value={texts[i].rate}
                        onChange={(e) => set(i, { rate: e.target.value })}
                        className={inputClass}
                      />
                      <span aria-hidden className="lg:hidden">
                        % =
                      </span>
                      <input
                        aria-label={`${who} amount`}
                        name={name("amount")}
                        inputMode="decimal"
                        autoComplete="off"
                        value={lines[i].amountText}
                        onChange={(e) => set(i, { amount: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    {lineErrors(i).length > 0 && (
                      <p className="text-destructive mt-1 text-sm lg:col-span-4">
                        {[...new Set(lineErrors(i))].join(" · ")}
                      </p>
                    )}
                  </li>
                );
              })}
              <li className="flex min-h-11 items-center justify-between px-3 font-medium lg:border-t lg:px-2">
                <span>Total to investors</span>
                <Amount poisha={toInvestors} />
              </li>
            </ul>
          )}
        </section>

        <section aria-labelledby="partners">
          <h2 id="partners" className="mb-2 font-semibold">
            Partners
          </h2>
          <p className="text-muted-foreground mb-2 text-sm">
            Left after investors: <Amount poisha={sub(profit, toInvestors)} />
          </p>
          <ul aria-label="Partner split" className="divide-y rounded-lg border lg:max-w-md">
            {split.map((p) => (
              <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 px-3">
                <span>
                  {p.name} {p.pct}%
                </span>
                <Amount poisha={p.amount} className="font-medium" />
              </li>
            ))}
          </ul>
        </section>

        <Button
          type="button"
          className="min-h-11 w-full px-4 lg:w-fit"
          disabled={blocked}
          onClick={() => setConfirm(true)}
        >
          Close month
        </Button>
      </form>
      <FormModal
        open={confirm}
        onOpenChange={setConfirm}
        title={`Close ${formatMonth(month)}?`}
        meta={fields}
        submit={submit}
        submitLabel="Close month"
        savedMessage={`${formatMonth(month)} closed`}
        onSaved={() => router.refresh()}
      >
        <p className="text-sm">
          Entries dated in {formatMonth(month)}, or for {formatMonth(month)}, will be locked: they
          can&apos;t be added, edited or deleted, only reversed in an open month. The allocations
          above are saved as they are. Only the latest closed month can be re-opened.
        </p>
      </FormModal>
    </>
  );
}
