"use client";

import { useHydrated } from "@/components/forms/use-hydrated";
import { useContext, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FormInitial,
  LinesError,
  MoneyField,
  QtyField,
  Reread,
  TextField,
} from "@/components/forms/field";
import { DateField, MonthSelect } from "@/components/forms/date-fields";
import { type Fields, FormValues } from "@/components/forms/form-body";
import { FormPage } from "@/components/forms/form-page";
import { type AddForm, PickerField } from "@/components/forms/picker";
import { SetupForm } from "@/components/setup/setup-forms";
import { SkeletonRows } from "@/components/states";
import { dhakaToday, monthOf } from "@mbl/domain/dates";
import type { BillDates } from "@mbl/domain/engine/cards";
import type { Partner } from "@mbl/domain/engine/post";
import { withQuery } from "@mbl/domain/href";
import { add, format, mul, parse } from "@mbl/domain/money";
import { billMonthChoices } from "@mbl/domain/month-choices";
import type { RowsContext } from "@mbl/domain/effect-rows";
import { type Names, emiPreview, previewEntry } from "@mbl/domain/preview";
import { type SetupKind, dueText, setupNames } from "@mbl/domain/setup";
import { nest } from "@mbl/domain/validation/fields";
import { purchaseSchema } from "@mbl/domain/validation/trade";
import { deletePurchase, savePurchase } from "@/server/actions/purchase";
import type { EditValues, SetupData } from "@/api/contract";

// UIDD §4.3 (task 3.4): the purchase page. Paid by (Cash · Card · Supplier credit · Customer's
// due; Advanced: Opening correction), with a card its bill month and EMI (with the EMI preview,
// D-032), repeatable lines (each a lot), the notes box and the footer total. Field names follow
// the schema, lines as `lines.0.qty`. Edit
// (from the Journal, 3.8) opens the stored purchase; each line keeps its id (its lot).

type Source = "cash" | "card" | "supplier_credit" | "customer_offset" | "opening_correction";

const PAID_BY: [Source, string][] = [
  ["cash", "Cash"],
  ["card", "Card"],
  ["supplier_credit", "Supplier credit"],
  ["customer_offset", "Customer's due"],
];

/** "What this will do": the schema's output through postEntry, or null while incomplete. */
function preview(fields: Fields, ctx: RowsContext, partners: Partner[]) {
  const parsed = purchaseSchema.safeParse(nest(fields));
  return previewEntry(parsed.success ? { ...parsed.data, table: "purchase" } : null, ctx, partners);
}

/** Σ qty × unit cost over the lines filled in so far (poisha). */
function lineSum(fields: Fields) {
  const lines = (nest(fields) as { lines?: { qty?: string; unitCost?: string }[] }).lines ?? [];
  return lines
    .map((l) => {
      const qty = Number(l.qty);
      const cost = parse(l.unitCost ?? "");
      return Number.isInteger(qty) && qty > 0 && cost ? mul(cost, qty) : 0;
    })
    .reduce(add, 0);
}

/** The footer total. */
function total(fields: Fields) {
  const sum = lineSum(fields);
  return sum ? `Total ${format(sum)}` : null;
}

/** D-032: "5 × ৳4,347.33 · first in Nov 2026 bill" under EMI months, from the engine's rule. */
function EmiPreview({ cards, billDates }: { cards: SetupData["cards"]; billDates: BillDates[] }) {
  const f = useContext(FormValues);
  if (!f) return null;
  const text = (key: string) => (typeof f[key] === "string" ? (f[key] as string) : "");
  const p = emiPreview(
    cards.find((c) => c.id === text("cardId")),
    text("date"),
    lineSum(f),
    Number(text("emiMonths")),
    text("billMonthOverride") || null,
    billDates,
  );
  return p ? (
    <p role="status" aria-label="EMI preview" className="bg-muted rounded-md px-3 py-2 text-sm">
      {p.text}
    </p>
  ) : null;
}

/**
 * D-035: Auto, or the month before the purchase → 4 months after it. The month before is rare, so
 * it warns (never blocks); the server accepts any month.
 */
function BillMonth() {
  const f = useContext(FormValues);
  const date = (typeof f?.date === "string" && f.date) || dhakaToday();
  const [month, setMonth] = useState(useContext(FormInitial).billMonthOverride ?? "");
  return (
    <>
      <MonthSelect
        label="Bill month"
        name="billMonthOverride"
        help="purchase_bill_month"
        auto
        choices={(keep) => billMonthChoices(date, keep)}
        value={month}
        onChange={setMonth}
      />
      {month && month < monthOf(date) && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
        >
          Earlier than the purchase month: only if the bank put this charge on last month&apos;s
          bill.
        </p>
      )}
    </>
  );
}

const radioClass =
  "has-checked:border-primary has-checked:bg-muted flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-center text-sm";

/** `dues`: each customer's current due, shown under the Customer's-due picker (UIDD §4.3). */
type Props = {
  data: SetupData;
  dues: Record<string, number>;
  /** The cards' actual bill dates: the EMI preview's first bill (SRS §6). */
  billDates: BillDates[];
  edit?: EditValues;
  /** New purchase: the supplier / card from the page it was opened from (`cleanPrefill`). */
  prefill?: Record<string, string>;
  /** Where Save and Cancel go back to (D-032). */
  from?: string;
};

export function PurchaseForm(props: Props) {
  // The ids are made in the browser (SRS §3) after hydration, so the server's HTML and the
  // browser's first render agree.
  const [id] = useState(() => props.edit?.id ?? crypto.randomUUID());
  return useHydrated() ? <Purchase {...props} id={id} /> : <SkeletonRows />;
}

function Purchase({ data, dues, billDates, edit, prefill, from, id }: Props & { id: string }) {
  const stored = edit?.values ?? prefill ?? {};
  const [source, setSource] = useState<Source>((stored.source as Source) ?? "cash");
  const [emi, setEmi] = useState(!!stored.emiMonths);
  const [supplierId, setSupplierId] = useState(stored.supplierId ?? "");
  const [payAfter, setPayAfter] = useState(false);
  const [lines, setLines] = useState(() =>
    edit ? edit.lines.map((l) => l.id) : [crypto.randomUUID()],
  );
  const storedLine = new Map(edit?.lines.map((l) => [l.id, l]));
  const keep = (id: string | undefined) => (r: { id: string; active: boolean }) =>
    r.active || r.id === id;

  const names: Names = setupNames(data);
  const partners: Partner[] = data.people
    .filter((p) => p.kind === "partner" && p.active)
    .map((p) => ({ id: p.id, pct: Number(p.profitSharePct ?? 0) }));
  const addNew = (kind: SetupKind): AddForm =>
    function AddNew(shell) {
      return (
        <SetupForm
          kind={kind}
          row={null}
          data={data}
          {...shell}
          onSaved={(s) => shell.onSaved(s.id)}
        />
      );
    };
  const paySupplier = payAfter && source === "supplier_credit" && supplierId;

  return (
    <FormPage
      title={edit ? "Edit purchase" : "New purchase"}
      about="purchase"
      meta={edit ? { id, updatedAt: edit.updatedAt } : { id }}
      initial={edit?.values ?? prefill}
      submit={savePurchase}
      undo={edit ? undefined : deletePurchase}
      preview={(f) => preview(f, { names, cards: data.cards, billDates }, partners)}
      total={total}
      done={
        edit
          ? (from ?? `/journal?entry=${id}`)
          : paySupplier
            ? withQuery(`/money/new?type=supplier_payment&supplierId=${supplierId}`, { from })
            : (from ?? "/")
      }
    >
      <Reread when={`${source}|${emi}|${lines.join()}`} />
      <DateField label="Date" name="date" />
      <PickerField
        label="Supplier"
        name="supplierId"
        placeholder={source === "supplier_credit" ? "Pick a supplier" : "Optional"}
        options={data.suppliers
          .filter(keep(stored.supplierId))
          .map((s) => ({ id: s.id, label: s.name }))}
        onChange={setSupplierId}
        add={addNew("supplier")}
      />
      <Field label="Paid by" name="source" help="purchase_paid_by">
        {({ id: fieldId, ...control }) => (
          <div id={fieldId} role="radiogroup" className="grid grid-cols-2 gap-2">
            {PAID_BY.map(([value, label]) => (
              <label key={value} className={radioClass}>
                <input
                  type="radio"
                  {...control}
                  value={value}
                  checked={source === value}
                  onChange={() => setSource(value)}
                  className="accent-primary"
                />
                {label}
              </label>
            ))}
          </div>
        )}
      </Field>

      {source === "card" && (
        <>
          <PickerField
            label="Card"
            name="cardId"
            placeholder="Pick a card"
            options={data.cards
              .filter(keep(stored.cardId))
              .map((c) => ({ id: c.id, label: c.display }))}
            add={addNew("card")}
          />
          <BillMonth />
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={emi}
              onChange={(e) => setEmi(e.target.checked)}
              className="accent-primary size-4"
            />
            EMI
          </label>
          {emi && (
            <>
              <QtyField label="EMI months" name="emiMonths" help="purchase_emi" />
              <EmiPreview cards={data.cards} billDates={billDates} />
            </>
          )}
        </>
      )}
      {source === "customer_offset" && (
        <PickerField
          label="Customer"
          name="customerId"
          placeholder="Pick a customer"
          // D-009: Walk-in can't be used against a due.
          options={data.customers
            .filter((c) => keep(stored.customerId)(c) && !c.isSystem)
            .map((c) => ({ id: c.id, label: c.display, hint: dueText(dues[c.id] ?? 0) }))}
          add={addNew("customer")}
        />
      )}
      {source === "supplier_credit" && !edit && (
        <div className="bg-muted/50 flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <p>Paid something now? Add a supplier payment after saving.</p>
          <Button
            type="button"
            variant={payAfter ? "default" : "outline"}
            aria-pressed={payAfter}
            className="min-h-11 self-start"
            onClick={() => setPayAfter((p) => !p)}
          >
            {payAfter ? "Will open the payment after saving" : "Add a payment after saving"}
          </Button>
        </div>
      )}

      <details className="rounded-lg border px-3" open={source === "opening_correction"}>
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
          Advanced
        </summary>
        <div className="flex flex-col gap-3 pb-3">
          <label className={radioClass}>
            <input
              type="radio"
              name="source"
              value="opening_correction"
              checked={source === "opening_correction"}
              onChange={() => setSource("opening_correction")}
              className="accent-primary"
            />
            Paid by: Opening correction (a missed opening lot)
          </label>
        </div>
      </details>

      <h2 className="mt-2 font-medium">Lines</h2>
      {lines.map((lineId, i) => {
        const line = storedLine.get(lineId);
        return (
          <div key={lineId} className="relative flex flex-col gap-2 rounded-lg border p-3 pt-1">
            <input type="hidden" name={`lines.${i}.id`} value={lineId} />
            <Button
              type="button"
              variant="ghost"
              className="absolute top-1 right-1 size-11"
              aria-label={`Remove line ${i + 1}`}
              onClick={() => setLines((ls) => ls.filter((l) => l !== lineId))}
            >
              <XIcon />
            </Button>
            <PickerField
              label={`Model (line ${i + 1})`}
              name={`lines.${i}.modelId`}
              placeholder="Pick a model"
              defaultValue={line?.modelId ?? ""}
              options={data.models
                .filter(keep(line?.modelId))
                .map((m) => ({ id: m.id, label: m.name }))}
              add={addNew("model")}
            />
            <div className="grid grid-cols-2 gap-3">
              <QtyField label="Qty" name={`lines.${i}.qty`} defaultValue={line?.qty ?? "1"} />
              <MoneyField
                label="Unit cost"
                name={`lines.${i}.unitCost`}
                help="purchase_unit_cost"
                defaultValue={line?.unitCost ?? ""}
              />
            </div>
            <TextField
              label="IMEI / note"
              name={`lines.${i}.imeiNote`}
              autoComplete="off"
              defaultValue={line?.imeiNote ?? ""}
            />
          </div>
        );
      })}
      <LinesError />
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => setLines((ls) => [...ls, crypto.randomUUID()])}
      >
        <PlusIcon />
        Add line
      </Button>
      <p className="text-muted-foreground text-sm">
        Invoice total doesn&apos;t divide evenly? Use two lines, e.g. 2 @ x + 1 @ y.
      </p>
      <TextField label="Note" name="note" autoComplete="off" />
    </FormPage>
  );
}
