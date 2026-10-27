"use client";

import { useHydrated } from "@/components/forms/use-hydrated";
import { useContext, useState } from "react";
import {
  Choice,
  FormInitial,
  MoneyField,
  QtyField,
  Reread,
  TextField,
} from "@/components/forms/field";
import { DateField } from "@/components/forms/date-fields";
import type { Fields } from "@/components/forms/form-body";
import { FormModal, usePageModal } from "@/components/forms/form-modal";
import { PickerField } from "@/components/forms/picker";
import { SkeletonRows } from "@/components/states";
import { formatDate } from "@mbl/domain/dates";
import type { ReturnEntry } from "@mbl/domain/engine/post";
import { add, format, mul, plain } from "@mbl/domain/money";
import { type Names, previewEntry } from "@mbl/domain/preview";
import { setupNames } from "@mbl/domain/setup";
import { nest } from "@mbl/domain/validation/fields";
import { returnSchema } from "@mbl/domain/validation/trade";
import { sendHref } from "@mbl/domain/href";
import { deleteReturn, saveReturn } from "@/server/actions/return";
import type { BillLine, EditValues, ReturnLot, SetupData } from "@/api/contract";

// UIDD §4.5 (task 3.6): the return modal. Customer return: customer → bill → line → qty → refund
// per unit (starts at the sale price). Purchase return: reason (Returned to seller · Damaged /
// lost) → lot → qty → refund per unit (starts at the lot's cost; 0 for damaged / lost) → refund
// goes to (starts as the way the lot was paid for; none for opening lots, D-011). Field names
// follow the schema, the one line as `lines.0.qty`. Edit (from the Journal, 3.8) opens the stored
// return; its kind is fixed, and each pick starts at the stored one until a pick above changes.

type Kind = "customer" | "purchase";
type Reason = "returned" | "damaged_lost";
type Refund = "cash" | "card" | "supplier" | "customer";

const KINDS: [Kind, string][] = [
  ["customer", "Customer return"],
  ["purchase", "Purchase return"],
];
const REASONS: [Reason, string][] = [
  ["returned", "Returned to seller"],
  ["damaged_lost", "Damaged / lost"],
];
const REFUND_TO: [Refund, string][] = [
  ["cash", "Cash"],
  ["card", "Card"],
  ["supplier", "Supplier"],
  ["customer", "Customer's due"],
];
/** The refund goes back the way the lot was paid for; opening lots have no default (SRS §4). */
const DEFAULT_REFUND: Partial<Record<ReturnLot["source"], Refund>> = {
  cash: "cash",
  card: "card",
  supplier_credit: "supplier",
  customer_offset: "customer",
};

const lotName = (date: string, unitCost: number) =>
  `lot ${formatDate(date).slice(0, 6)} @${format(unitCost)}`;

/** The form's values as an engine entry (cost from the line's lot), or null while incomplete. */
function entryOf(fields: Fields, lines: BillLine[], lots: ReturnLot[]): ReturnEntry | null {
  const parsed = returnSchema.safeParse(nest(fields));
  if (!parsed.success) return null;
  const v = parsed.data;
  const costs = v.lines.map((l) =>
    "saleLineId" in l
      ? lines.find((x) => x.id === l.saleLineId)?.unitCost
      : lots.find((x) => x.id === l.lotId)?.unitCost,
  );
  if (costs.some((c) => c === undefined)) return null;
  return {
    ...v,
    table: "return",
    lines: v.lines.map((l, i) => ({ ...l, unitCost: costs[i] as number })),
  };
}

type Props = {
  data: SetupData;
  lines: BillLine[];
  lots: ReturnLot[];
  edit?: EditValues;
  /** Where Save and Cancel go back to (D-032). */
  from?: string;
};

export function ReturnForm(props: Props) {
  // The id is made in the browser (SRS §3) after hydration, so the server's HTML and the
  // browser's first render agree.
  const [id] = useState(() => props.edit?.id ?? crypto.randomUUID());
  return useHydrated() ? <Return {...props} id={id} /> : <SkeletonRows />;
}

function Return({ data, lines, lots, edit, from, id }: Props & { id: string }) {
  const modal = usePageModal(from ?? (edit ? `/journal?entry=${id}` : "/"));
  const [kind, setKind] = useState<Kind>((edit?.values.kind as Kind) ?? "customer");
  const title = KINDS.find(([k]) => k === kind)?.[1] ?? "return";
  const names: Names = setupNames(data);
  const entry = (f: Fields) => entryOf(f, lines, lots);

  return (
    <FormModal
      {...modal}
      title={edit ? `Edit ${title.toLowerCase()}` : "New return"}
      about={kind === "customer" ? "customer_return" : "purchase_return"}
      meta={edit ? { id, updatedAt: edit.updatedAt } : { id }}
      initial={edit?.values}
      submit={saveReturn}
      undo={edit ? undefined : deleteReturn}
      send={(saved, f) => (f.kind === "customer" ? sendHref(f.customerId, saved.id) : null)}
      preview={(f) => previewEntry(entry(f), { names })}
      total={(f) => {
        const e = entry(f);
        return e && `Refund ${format(e.lines.map((l) => mul(l.unitAmount, l.qty)).reduce(add, 0))}`;
      }}
    >
      <Reread when={kind} />
      {edit ? (
        <input type="hidden" name="kind" value={kind} />
      ) : (
        <Choice label="Type" name="kind" options={KINDS} value={kind} onChange={setKind} />
      )}
      <DateField label="Date" name="date" />
      {kind === "customer" ? (
        <CustomerReturn data={data} lines={lines} />
      ) : (
        <PurchaseReturn data={data} lots={lots} />
      )}
      <TextField label="Note" name="note" autoComplete="off" />
    </FormModal>
  );
}

/** Customer → bill → line (with what it can still give back) → qty → refund per unit. */
function CustomerReturn({ data, lines }: { data: SetupData; lines: BillLine[] }) {
  const stored = useContext(FormInitial);
  const [customerId, setCustomerId] = useState(stored.customerId ?? "");
  const [saleId, setSaleId] = useState(stored.saleId ?? "");
  const [lineId, setLineId] = useState(stored["lines.0.saleLineId"] ?? "");
  const models = new Map(data.models.map((m) => [m.id, m.name]));
  const open = lines.filter((l) => l.left > 0);
  const withBills = new Set(open.map((l) => l.customerId));
  const customers = data.customers.filter((c) => c.active && withBills.has(c.id));
  const bills = [...new Set(open.filter((l) => l.customerId === customerId).map((l) => l.saleId))];
  const billOptions = bills.map((id) => {
    const all = lines.filter((l) => l.saleId === id);
    const total = all.map((l) => mul(l.unitPrice, l.qty)).reduce(add, 0);
    const phones = all.reduce((n, l) => n + l.qty, 0);
    return { id, label: `${formatDate(all[0].date)} · ${format(total)}`, hint: `${phones} phones` };
  });
  const lineOptions = open
    .filter((l) => l.saleId === saleId)
    .map((l) => ({
      id: l.id,
      label: `${models.get(l.modelId)} · ${l.qty} @ ${format(l.unitPrice)}`,
      hint: `${l.left} left to return · ${lotName(l.lotDate, l.unitCost)}`,
    }));
  const line = lines.find((l) => l.id === lineId);

  return (
    <>
      <PickerField
        label="Customer"
        name="customerId"
        placeholder="Pick a customer"
        options={customers.map((c) => ({ id: c.id, label: c.display }))}
        onChange={(id) => {
          setCustomerId(id);
          setSaleId("");
          setLineId("");
        }}
      />
      {customers.length === 0 && (
        <p className="text-muted-foreground text-sm">No bills to return from yet.</p>
      )}
      <PickerField
        key={`bill-${customerId}`}
        label="Bill"
        name="saleId"
        defaultValue={customerId === stored.customerId ? stored.saleId : ""}
        placeholder={customerId ? "Pick a bill" : "Pick the customer first"}
        options={billOptions}
        onChange={(id) => {
          setSaleId(id);
          setLineId("");
        }}
      />
      <PickerField
        key={`line-${saleId}`}
        label="Line"
        name="lines.0.saleLineId"
        defaultValue={saleId === stored.saleId ? stored["lines.0.saleLineId"] : ""}
        placeholder={saleId ? "Pick a line" : "Pick the bill first"}
        options={lineOptions}
        onChange={setLineId}
      />
      <QtyField label="Qty" name="lines.0.qty" defaultValue={stored["lines.0.qty"] ?? "1"} />
      <MoneyField
        key={`refund-${lineId}`}
        label="Refund per unit"
        name="lines.0.unitAmount"
        help="return_refund_per_unit"
        defaultValue={
          lineId === stored["lines.0.saleLineId"]
            ? stored["lines.0.unitAmount"]
            : line
              ? plain(line.unitPrice)
              : ""
        }
      />
    </>
  );
}

/** Reason → lot → qty → refund per unit → refund goes to (and its card/supplier/customer). */
function PurchaseReturn({ data, lots }: { data: SetupData; lots: ReturnLot[] }) {
  const stored = useContext(FormInitial);
  const [reason, setReason] = useState<Reason>((stored.reason as Reason) ?? "returned");
  const [lotId, setLotId] = useState(stored["lines.0.lotId"] ?? "");
  const models = new Map(data.models.map((m) => [m.id, m.name]));
  const lot = lots.find((l) => l.id === lotId);
  const same = !!lotId && lotId === stored["lines.0.lotId"]; // still the stored lot (edit)

  return (
    <>
      <Reread when={reason} />
      <Choice
        label="Reason"
        name="reason"
        help="return_damaged_lost"
        options={REASONS}
        value={reason}
        onChange={setReason}
      />
      <PickerField
        label="Lot"
        name="lines.0.lotId"
        placeholder="Pick a lot"
        options={lots.map((l) => ({
          id: l.id,
          label: `${models.get(l.modelId)} · ${lotName(l.date, l.unitCost)}`,
          hint: `${l.remaining} left`,
        }))}
        onChange={setLotId}
      />
      {lots.length === 0 && <p className="text-muted-foreground text-sm">No stock to return.</p>}
      <QtyField label="Qty" name="lines.0.qty" defaultValue={stored["lines.0.qty"] ?? "1"} />
      {reason === "damaged_lost" ? (
        <input type="hidden" name="lines.0.unitAmount" value="0" />
      ) : (
        <>
          <MoneyField
            key={`refund-${lotId}`}
            label="Refund per unit"
            name="lines.0.unitAmount"
            help="return_refund_per_unit"
            defaultValue={
              same && stored["lines.0.unitAmount"] !== "0"
                ? stored["lines.0.unitAmount"]
                : lot
                  ? plain(lot.unitCost)
                  : ""
            }
          />
          <RefundTarget key={`to-${lotId}`} data={data} lot={lot} stored={same ? stored : null} />
        </>
      )}
    </>
  );
}

/**
 * Refund goes to: starts as the lot's own source and counterparty (none for opening lots), or as
 * stored while editing the same lot.
 */
function RefundTarget({
  data,
  lot,
  stored,
}: {
  data: SetupData;
  lot: ReturnLot | undefined;
  stored: Record<string, string> | null;
}) {
  const start: {
    to: Refund | "";
    cardId?: string | null;
    supplierId?: string | null;
    customerId?: string | null;
  } = stored?.refundTo
    ? { ...stored, to: stored.refundTo as Refund }
    : { ...lot, to: (lot && DEFAULT_REFUND[lot.source]) ?? "" };
  const [to, setTo] = useState<Refund | "">(start.to);
  const pick = <R extends { id: string; active: boolean }>(rows: R[], id: string | null) =>
    rows.filter((r) => r.active || r.id === id);

  return (
    <>
      <Reread when={to} />
      <Choice
        label="Refund goes to"
        name="refundTo"
        help="return_refund_to"
        options={REFUND_TO}
        value={to}
        onChange={setTo}
      />
      {to === "card" && (
        <PickerField
          label="Card"
          name="cardId"
          placeholder="Pick a card"
          defaultValue={start.cardId ?? ""}
          options={pick(data.cards, start.cardId ?? null).map((c) => ({
            id: c.id,
            label: c.display,
          }))}
        />
      )}
      {to === "supplier" && (
        <PickerField
          label="Supplier"
          name="supplierId"
          placeholder="Pick a supplier"
          defaultValue={start.supplierId ?? ""}
          options={pick(data.suppliers, start.supplierId ?? null).map((s) => ({
            id: s.id,
            label: s.name,
          }))}
        />
      )}
      {to === "customer" && (
        <PickerField
          label="Customer"
          name="customerId"
          placeholder="Pick a customer"
          defaultValue={start.customerId ?? ""}
          options={pick(data.customers, start.customerId ?? null).map((c) => ({
            id: c.id,
            label: c.display,
          }))}
        />
      )}
    </>
  );
}
