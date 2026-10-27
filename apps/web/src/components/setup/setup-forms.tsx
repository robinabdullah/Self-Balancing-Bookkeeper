"use client";

import { useState } from "react";
import { Choice, Field, MoneyField, TextField } from "@/components/forms/field";
import { FormModal } from "@/components/forms/form-modal";
import { PickerField } from "@/components/forms/picker";
import { CARD_NETWORKS, type CardNetwork, NETWORK_LABEL, typeWordIn } from "@mbl/domain/banks";
import { format, parse } from "@mbl/domain/money";
import type { SetupKind } from "@mbl/domain/setup";
import {
  saveCard,
  saveCustomer,
  saveModel,
  savePerson,
  saveSupplier,
} from "@/server/actions/setup";
import type { SetupData } from "@/server/setup";

// UIDD §4.11: the Setup add/edit forms, each in the modal shell (3.2.6). Fields follow SRS §4.

type Data = SetupData;
type Person = Data["people"][number];
type Card = Data["cards"][number];
type Customer = Data["customers"][number];
type Supplier = Data["suppliers"][number];
type Model = Data["models"][number];
export type SetupRow = Person | Card | Customer | Supplier | Model;

/** `onSaved`: a picker's "+ Add new" selects the new row (task 3.3.1). */
type Shell = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (saved: { id: string }) => void;
};

/** Stored money "150000.00" → "1,50,000" for the input (money.ts parses it back). */
const moneyText = (stored: string | null) =>
  stored === null ? "" : format(parse(stored) ?? 0).replace("৳", "");

/** Phone · WhatsApp · Email (D-039): messages go to WhatsApp, else the phone. */
function ContactFields({ row }: { row: Person | Customer | Supplier | null }) {
  return (
    <>
      <TextField label="Phone" name="phone" type="tel" defaultValue={row?.phone ?? ""} />
      <TextField
        label="WhatsApp"
        name="whatsapp"
        type="tel"
        placeholder="01…, if not the phone"
        defaultValue={row?.whatsapp ?? ""}
      />
      <TextField label="Email" name="email" type="email" defaultValue={row?.email ?? ""} />
    </>
  );
}

/** The modal for one row: `row` = null adds a new one (with a fresh client id, SRS §3). */
function useMeta(row: SetupRow | null): Record<string, string> {
  const [id] = useState(() => row?.id ?? crypto.randomUUID());
  return row ? { id, updatedAt: row.updatedAt } : { id };
}

function PersonForm({ row, ...shell }: Shell & { row: Person | null }) {
  const [kind, setKind] = useState(row?.kind ?? "partner");
  return (
    <FormModal
      {...shell}
      title={row ? "Edit person" : "Add person"}
      about="setup_person"
      meta={useMeta(row)}
      submit={savePerson}
    >
      <TextField label="Name" name="name" defaultValue={row?.name} autoComplete="off" />
      <Field label="Kind" name="kind">
        {({ id, ...control }) => (
          <div id={id} role="radiogroup" className="grid grid-cols-2 gap-2">
            {(["partner", "investor"] as const).map((k) => (
              <label
                key={k}
                className="has-checked:border-primary has-checked:bg-muted flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm"
              >
                <input
                  type="radio"
                  {...control}
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="accent-primary"
                />
                {k === "partner" ? "Partner" : "Investor"}
              </label>
            ))}
          </div>
        )}
      </Field>
      {kind === "partner" && (
        <TextField
          label="Profit share %"
          name="profitSharePct"
          help="profit_share_pct"
          inputMode="decimal"
          defaultValue={row?.profitSharePct ? String(Number(row.profitSharePct)) : ""}
        />
      )}
      <TextField
        label="Note"
        name="note"
        placeholder="e.g. managed by Arif"
        defaultValue={row?.note ?? ""}
      />
      <ContactFields row={row} />
    </FormModal>
  );
}

function CardForm({ row, people, ...shell }: Shell & { row: Card | null; people: Person[] }) {
  // Pick, don't type: the owner comes from the active people (plus the current owner).
  const owners = people.filter((p) => p.active || p.id === row?.ownerPersonId);
  const [name, setName] = useState(row?.name ?? "");
  const [network, setNetwork] = useState<CardNetwork>(row?.network ?? "none");
  // D-036: the Type is its own field, so the name shouldn't say it too ("EBL Visa Visa").
  const word = typeWordIn(name, network);
  return (
    <FormModal
      {...shell}
      title={row ? "Edit card" : "Add card"}
      about="setup_card"
      meta={useMeta(row)}
      submit={saveCard}
    >
      <TextField
        label="Card name"
        name="name"
        defaultValue={row?.name}
        placeholder="Brac"
        onChange={(e) => setName(e.target.value)}
      />
      {word && (
        <p role="status" className="-mt-1 text-sm text-amber-800 dark:text-amber-300">
          Remove &lsquo;{word}&rsquo; from the name — it&rsquo;s the Type
        </p>
      )}
      <Choice
        label="Type"
        name="network"
        options={CARD_NETWORKS.map((n) => [n, NETWORK_LABEL[n]])}
        value={network}
        onChange={setNetwork}
      />
      <PickerField
        label="Owner"
        name="ownerPersonId"
        placeholder="Pick the owner"
        options={owners.map((p) => ({ id: p.id, label: p.name }))}
        defaultValue={row?.ownerPersonId}
        add={(shell) => <PersonForm row={null} {...shell} onSaved={(s) => shell.onSaved(s.id)} />}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Statement day"
          name="statementDay"
          help="statement_day"
          inputMode="numeric"
          defaultValue={row?.statementDay}
        />
        <TextField
          label="Due day"
          name="dueDay"
          help="due_day"
          inputMode="numeric"
          defaultValue={row?.dueDay}
        />
      </div>
      <MoneyField
        label="Credit limit"
        name="creditLimit"
        help="credit_limit"
        defaultValue={moneyText(row?.creditLimit ?? null)}
      />
    </FormModal>
  );
}

function CustomerForm({ row, ...shell }: Shell & { row: Customer | null }) {
  return (
    <FormModal
      {...shell}
      title={row ? "Edit customer" : "Add customer"}
      about="setup_customer"
      meta={useMeta(row)}
      submit={saveCustomer}
    >
      <TextField label="Shop name" name="shopName" defaultValue={row?.shopName ?? ""} />
      <TextField label="Proprietor name" name="proprietorName" defaultValue={row?.proprietorName} />
      <ContactFields row={row} />
      <TextField label="Address" name="address" defaultValue={row?.address ?? ""} />
      <MoneyField
        label="Target balance"
        name="targetBalance"
        help="target_balance"
        defaultValue={moneyText(row?.targetBalance ?? null)}
      />
    </FormModal>
  );
}

function SupplierForm({ row, ...shell }: Shell & { row: Supplier | null }) {
  return (
    <FormModal
      {...shell}
      title={row ? "Edit supplier" : "Add supplier"}
      about="setup_supplier"
      meta={useMeta(row)}
      submit={saveSupplier}
    >
      <TextField label="Name" name="name" defaultValue={row?.name} />
      <ContactFields row={row} />
    </FormModal>
  );
}

function ModelForm({ row, ...shell }: Shell & { row: Model | null }) {
  return (
    <FormModal
      {...shell}
      title={row ? "Edit model" : "Add model"}
      about="setup_model"
      meta={useMeta(row)}
      submit={saveModel}
    >
      <TextField
        label="Model name"
        name="name"
        defaultValue={row?.name}
        placeholder="Vivo Y05 4/64"
      />
    </FormModal>
  );
}

/** The add/edit form for a Setup list. */
export function SetupForm({
  kind,
  row,
  data,
  ...shell
}: Shell & { kind: SetupKind; row: SetupRow | null; data: Data }) {
  switch (kind) {
    case "person":
      return <PersonForm {...shell} row={row as Person | null} />;
    case "card":
      return <CardForm {...shell} row={row as Card | null} people={data.people} />;
    case "customer":
      return <CustomerForm {...shell} row={row as Customer | null} />;
    case "supplier":
      return <SupplierForm {...shell} row={row as Supplier | null} />;
    case "model":
      return <ModelForm {...shell} row={row as Model | null} />;
  }
}
