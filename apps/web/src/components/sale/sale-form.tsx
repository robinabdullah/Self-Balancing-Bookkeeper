"use client";

import { useHydrated } from "@/components/forms/use-hydrated";
import { useContext, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FormErrors,
  LinesError,
  MoneyField,
  QtyField,
  Reread,
  TextField,
} from "@/components/forms/field";
import { DateField } from "@/components/forms/date-fields";
import { type Fields, FormValues } from "@/components/forms/form-body";
import { FormPage } from "@/components/forms/form-page";
import { type AddForm, PickerField } from "@/components/forms/picker";
import { SetupForm } from "@/components/setup/setup-forms";
import { SkeletonRows } from "@/components/states";
import { dhakaToday, formatDate } from "@/lib/dates";
import { type SaleEntry, postEntry } from "@/lib/engine/post";
import { type Planned, type StockLot, planSale } from "@/lib/engine/stock";
import { add, format, mul, parse, sub } from "@/lib/money";
import { effectRows } from "@/lib/effect-rows";
import type { Names } from "@/lib/preview";
import { dueText } from "@/lib/setup";
import { cn } from "@/lib/utils";
import { nest } from "@/lib/validation/fields";
import { sendHref } from "@/lib/href";
import { saleSchema } from "@/lib/validation/trade";
import { deleteSale, saveSale } from "@/server/actions/sale";
import type { EditValues } from "@/server/entries";
import type { SetupData } from "@/server/setup";

// UIDD §4.4 (task 3.5): the sale bill page. Customer (defaults to the last one used; Walk-in is
// in the list), repeatable lines (model "· N in stock", qty, unit price), the lots each line takes
// (oldest first, or "Choose lot"), its total and profit, then note, "Received now" and the notes
// box. The lot plan here is a preview: the server picks again on save. Field names follow the
// schema, lines as `lines.0.qty`. Edit (from the Journal, 3.8) opens the stored bill: each line
// keeps its id and its lot (D-004); Received now is for a new bill only.

type FormLine = { modelId?: string; qty?: string; unitPrice?: string; lotId?: string };

/** Each line's lots, from the lots on the page; null while the line has no model or qty. */
function planOf(fields: Fields, lots: StockLot[]): (Planned | null)[] {
  const { date, lines = [] } = nest(fields) as { date?: string; lines?: FormLine[] };
  const ready = lines.map((l) => ({
    modelId: l.modelId ?? "",
    qty: Number(l.qty),
    lotId: l.lotId || null,
  }));
  const filled = ready.flatMap((l, i) =>
    l.modelId && Number.isInteger(l.qty) && l.qty > 0 ? [i] : [],
  );
  const planned = planSale(
    lots,
    filled.map((i) => ready[i]),
    date || dhakaToday(),
  );
  return ready.map((_, i) => planned[filled.indexOf(i)] ?? null);
}

/** A line's total and profit at its unit price, once its lots are known. */
function lineSums(fields: Fields, i: number, p: Planned | null) {
  const line = (nest(fields) as { lines?: FormLine[] }).lines?.[i];
  const price = parse(line?.unitPrice ?? "");
  if (!p || !("picks" in p) || price === null || price < 0) return null;
  const total = p.picks.map((x) => mul(price, x.qty)).reduce(add, 0);
  const cost = p.picks.map((x) => mul(x.unitCost, x.qty)).reduce(add, 0);
  return { total, profit: sub(total, cost) };
}

/** The footer: the bill total and profit over the lines filled in so far. */
function footer(fields: Fields, lots: StockLot[]) {
  const sums = planOf(fields, lots).flatMap((p, i) => lineSums(fields, i, p) ?? []);
  if (sums.length === 0) return null;
  const total = sums.map((s) => s.total).reduce(add, 0);
  const profit = sums.map((s) => s.profit).reduce(add, 0);
  return `Total ${format(total)} · profit ${format(profit)}`;
}

/** "What this will do": the bill (and its Received now payment) through postEntry. */
function preview(fields: Fields, lots: StockLot[], names: Names) {
  const parsed = saleSchema.safeParse(nest(fields));
  const plan = planOf(fields, lots);
  if (!parsed.success || plan.some((p) => !p || !("picks" in p))) return null;
  const v = parsed.data;
  const sale: SaleEntry = {
    table: "sale",
    date: v.date,
    customerId: v.customerId,
    lines: v.lines.flatMap((l, i) =>
      (plan[i] as { picks: { qty: number; unitCost: number }[] }).picks.map((p) => ({
        qty: p.qty,
        unitPrice: l.unitPrice,
        unitCost: p.unitCost,
      })),
    ),
  };
  const effects = postEntry(sale);
  if (v.receivedNow !== null)
    effects.push(
      ...postEntry({
        table: "money",
        type: "customer_payment",
        date: v.date,
        amount: v.receivedNow,
        customerId: v.customerId,
      }),
    );
  return effectRows(effects, { names });
}

const lotName = (lot: StockLot) =>
  `lot ${formatDate(lot.date).slice(0, 6)} @${format(lot.unitCost)}`;

type Props = {
  data: SetupData;
  /** Each customer's current due, shown under the customer picker (UIDD §4.4). */
  dues: Record<string, number>;
  lots: StockLot[];
  /** The customer picked at the start: the last sale's, or the page's it was opened from. */
  lastCustomerId: string | null;
  /** Where Save and Cancel go back to (D-032). */
  from?: string;
  edit?: EditValues;
};

export function SaleForm(props: Props) {
  // The ids are made in the browser (SRS §3) after hydration, so the server's HTML and the
  // browser's first render agree. `paymentId` is for "Received now" (D-006).
  const [ids] = useState(() => ({
    id: props.edit?.id ?? crypto.randomUUID(),
    paymentId: crypto.randomUUID(),
  }));
  return useHydrated() ? <Sale {...props} {...ids} /> : <SkeletonRows />;
}

function Sale({
  data,
  dues,
  lots,
  lastCustomerId,
  from,
  edit,
  id,
  paymentId,
}: Props & { id: string; paymentId: string }) {
  const [lines, setLines] = useState(() =>
    edit ? edit.lines.map((l) => l.id) : [crypto.randomUUID()],
  );
  const storedLine = new Map(edit?.lines.map((l) => [l.id, l]));

  const names: Names = Object.fromEntries(data.customers.map((c) => [c.id, c.display]));
  const inStock = new Map<string, number>();
  for (const l of lots) inStock.set(l.modelId, (inStock.get(l.modelId) ?? 0) + l.remaining);
  const models = data.models
    .filter((m) => m.active && inStock.has(m.id))
    .map((m) => ({ id: m.id, label: `${m.name} · ${inStock.get(m.id)} in stock` }));
  const current = edit?.values.customerId ?? lastCustomerId;
  const customers = data.customers.filter((c) => c.active || c.id === current);
  const addCustomer: AddForm = (shell) => (
    <SetupForm
      kind="customer"
      row={null}
      data={data}
      {...shell}
      onSaved={(s) => shell.onSaved(s.id)}
    />
  );

  return (
    <FormPage
      title={edit ? "Edit sale" : "New sale"}
      about="sale"
      meta={edit ? { id, updatedAt: edit.updatedAt } : { id, paymentId }}
      initial={edit?.values}
      submit={saveSale}
      undo={edit ? undefined : (saved) => deleteSale({ ...saved, paymentId })}
      send={(saved, f) => sendHref(f.customerId, saved.id)}
      done={from ?? (edit ? `/journal?entry=${id}` : undefined)}
      preview={(f) => preview(f, lots, names)}
      total={(f) => footer(f, lots)}
    >
      <Reread when={lines.join()} />
      <DateField label="Date" name="date" />
      <PickerField
        label="Customer"
        name="customerId"
        placeholder="Pick a customer"
        defaultValue={current}
        options={customers.map((c) => ({
          id: c.id,
          label: c.display,
          hint: dueText(dues[c.id] ?? 0),
        }))}
        add={addCustomer}
      />

      <h2 className="mt-2 font-medium">Lines</h2>
      {models.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nothing in stock yet — add a purchase first.
        </p>
      )}
      {lines.map((key, i) => (
        <SaleLine
          key={key}
          i={i}
          stored={storedLine.get(key)}
          lots={lots}
          models={models}
          onRemove={() => setLines((ls) => ls.filter((l) => l !== key))}
        />
      ))}
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
      <TextField label="Note" name="note" autoComplete="off" />
      {!edit && (
        <MoneyField
          label="Received now"
          name="receivedNow"
          help="sale_received_now"
          placeholder="Optional"
        />
      )}
    </FormPage>
  );
}

/** One bill line: model, qty, unit price, the lots it takes ("Choose lot"), total and profit. */
function SaleLine({
  i,
  stored,
  lots,
  models,
  onRemove,
}: {
  i: number;
  /** Edit: the stored line (its id, model, qty, price and lot). */
  stored?: Record<string, string>;
  lots: StockLot[];
  models: { id: string; label: string }[];
  onRemove: () => void;
}) {
  const [modelId, setModelId] = useState(stored?.modelId ?? "");
  const [choose, setChoose] = useState(!!stored?.lotId);
  const fields = useContext(FormValues);
  const errors = useContext(FormErrors);
  const plan = fields ? planOf(fields, lots)[i] : null;
  const sums = fields && lineSums(fields, i, plan);
  const date = (fields?.date as string) || dhakaToday();
  const byId = new Map(lots.map((l) => [l.id, l]));
  const lotOptions = lots
    .filter((l) => l.modelId === modelId && l.date <= date)
    .map((l) => ({ id: l.id, label: lotName(l), hint: `${l.remaining} left` }));
  const name = (field: string) => `lines.${i}.${field}`;

  return (
    <div className="relative flex flex-col gap-2 rounded-lg border p-3 pt-1">
      <Reread when={String(choose)} />
      {stored && <input type="hidden" name={name("id")} value={stored.id} />}
      <Button
        type="button"
        variant="ghost"
        className="absolute top-1 right-1 size-11"
        aria-label={`Remove line ${i + 1}`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
      <PickerField
        label={`Model (line ${i + 1})`}
        name={name("modelId")}
        placeholder="Pick a model"
        defaultValue={stored?.modelId ?? ""}
        options={models}
        onChange={setModelId}
      />
      <div className="grid grid-cols-2 gap-3">
        <QtyField label="Qty" name={name("qty")} defaultValue={stored?.qty ?? "1"} />
        <MoneyField
          label="Unit price"
          name={name("unitPrice")}
          defaultValue={stored?.unitPrice ?? ""}
        />
      </div>

      {modelId && choose && (
        <PickerField
          key={modelId} // a new model starts with no lot chosen
          label={`Lot (line ${i + 1})`}
          name={name("lotId")}
          help="sale_choose_lot"
          placeholder="Pick a lot"
          defaultValue={modelId === stored?.modelId ? stored.lotId : ""}
          options={lotOptions}
        />
      )}
      {plan && "picks" in plan && (
        <p className="text-muted-foreground text-sm">
          {plan.picks
            .map((p) => `${p.qty} from ${lotName(byId.get(p.lotId) as StockLot)}`)
            .join(" + ")}
        </p>
      )}
      {plan && "error" in plan && !errors[name(plan.field)] && (
        <p className="text-destructive text-sm">{plan.error}</p>
      )}
      {modelId && (
        <Button
          type="button"
          variant="link"
          className="min-h-11 self-start px-0"
          onClick={() => setChoose((c) => !c)}
        >
          {choose ? "Oldest first instead" : "Choose lot"}
        </Button>
      )}
      {sums && (
        <p className="text-sm">
          Line {format(sums.total)} ·{" "}
          <span
            className={cn(
              sums.profit < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400",
            )}
          >
            {sums.profit < 0 ? "loss" : "profit"} {format(Math.abs(sums.profit))}
          </span>
        </p>
      )}
    </div>
  );
}
