"use client";

import { useHydrated } from "@/components/forms/use-hydrated";
import { createContext, useContext, useState } from "react";
import { Choice, FormInitial, MoneyField, Reread, TextField } from "@/components/forms/field";
import { DateField, MonthSelect } from "@/components/forms/date-fields";
import { type Fields, FormValues } from "@/components/forms/form-body";
import { FormModal, usePageModal } from "@/components/forms/form-modal";
import { type AddForm, PickerField } from "@/components/forms/picker";
import { CashOut } from "@/components/money/cash-out";
import { LABEL, type MoneyType, TYPES } from "@mbl/domain/money/types";
import { moneyEntryLabel } from "@/components/shell/nav";
import { SetupForm } from "@/components/setup/setup-forms";
import { SkeletonRows } from "@/components/states";
import { addMonths, dhakaToday, monthOf } from "@mbl/domain/dates";
import type { BillDates } from "@mbl/domain/engine/cards";
import type { MoneyEntry, Partner } from "@mbl/domain/engine/post";
import { type Calendar, dateErrors } from "@mbl/domain/guards";
import type { AboutForm, HelpField } from "@mbl/domain/help-text";
import { add, format, parse } from "@mbl/domain/money";
import { forMonthChoices } from "@mbl/domain/month-choices";
import { entryConfirm } from "@mbl/domain/confirms";
import { type Names, previewEntry } from "@mbl/domain/preview";
import { type SetupKind, dueText, setupNames } from "@mbl/domain/setup";
import { EXPENSE_CATEGORIES, EXPENSE_LABELS } from "@mbl/domain/validation/fields";
import { sendHref } from "@mbl/domain/href";
import { moneyEntrySchema } from "@mbl/domain/validation/money-entry";
import { SEND_TYPES } from "@mbl/domain/whatsapp";
import { deleteMoneyEntry, saveMoneyEntry } from "@/server/actions/money";
import type { EditValues, SetupData } from "@/api/contract";

// UIDD §4.6 (task 3.7): one modal for every single-amount type. The New sheet sets the type
// (`?type=`); without one, a type picker comes first. Capital in/out and profit
// paid/reinvested switch with chips. The fields follow the type as in SRS §4; the schema drops
// any the type doesn't have. A discount's customer shows the current due (4.1.5); profit
// paid/reinvested's person shows the profit owed, with a warning (never a block) when the amount
// exceeds it (5.5.1). Edit (from the Journal, 3.8) opens the stored entry; its type is fixed
// (D-008). A form opened from a page starts with `prefill` (that card, customer … and amount) and
// goes back to `from` after Save or Cancel (D-032).

/** Types that share one form; chips pick between them. */
const PAIRS: [MoneyType, MoneyType][] = [
  ["capital_in", "capital_out"],
  ["profit_paid", "profit_reinvested"],
];
const pairOf = (t: MoneyType) => PAIRS.find((p) => p.includes(t));

const ABOUT: Partial<Record<MoneyType, AboutForm>> = {
  capital_in: "capital",
  capital_out: "capital",
  profit_paid: "profit_paid_reinvested",
  profit_reinvested: "profit_paid_reinvested",
};
const aboutOf = (t: MoneyType) => ABOUT[t] ?? (t as AboutForm);

const CATEGORY = EXPENSE_CATEGORIES.map((c) => [c, EXPENSE_LABELS[c]] as [typeof c, string]);
const SETTLE: ["received" | "added_to_due", string][] = [
  ["received", "Received now"],
  ["added_to_due", "Add to his due"],
];
const WRONG: [string, string][] = [
  ["cash", "Cash"],
  ["customer_due", "Customer due"],
  ["supplier_due", "Supplier due"],
  ["card_balance", "Card balance"],
  ["capital", "Capital"],
  ["profit_owed", "Profit owed"],
];

/** The form's values as an engine entry, or null while incomplete. */
function entryOf(fields: Fields): MoneyEntry | null {
  const parsed = moneyEntrySchema.safeParse(fields);
  return parsed.success ? { ...parsed.data, table: "money" } : null;
}

type Props = {
  data: SetupData;
  /** Each customer's current due: the discount's customer picker shows it (UIDD §4.6). */
  dues: Record<string, number>;
  /** Each person's profit owed: profit paid/reinvested shows it and warns above it (5.5.1). */
  owed: Record<string, number>;
  type: MoneyType | null;
  /** New entry: the starting values from the page it was opened from (`cleanPrefill`). */
  prefill?: Record<string, string>;
  /** Where Save and Cancel go back to; otherwise Home (new) or the entry in the Journal (edit). */
  from?: string;
  edit?: EditValues;
  /** Today, the opening date and the last closed month: the For month choices (D-035). */
  calendar: Calendar;
  /** The cards' actual bill dates: a card charge's row names its bill (D-060, D-061). */
  billDates: BillDates[];
};

const MoneyCalendar = createContext<Calendar | null>(null);

export function MoneyForm(props: Props) {
  // The id is made in the browser (SRS §3) after hydration, so the server's HTML and the
  // browser's first render agree.
  const [id] = useState(() => props.edit?.id ?? crypto.randomUUID());
  return useHydrated() ? <Money {...props} id={id} /> : <SkeletonRows />;
}

const isProfit = (t: string | undefined) => t === "profit_paid" || t === "profit_reinvested";

/** Edit: the profit owed before this entry, so its own amount isn't counted against it. */
function owedBefore(owed: Props["owed"], edit: EditValues | undefined) {
  const v = edit?.values;
  if (!v?.personId || !isProfit(v.type)) return owed;
  return { ...owed, [v.personId]: add(owed[v.personId] ?? 0, parse(v.amount ?? "") ?? 0) };
}

function Money({
  data,
  dues,
  owed,
  type: opened,
  prefill,
  from,
  edit,
  calendar,
  billDates,
  id,
}: Props & { id: string }) {
  const [type, setType] = useState<MoneyType | "">(opened ?? "");
  const done = from ?? (edit ? `/journal?entry=${id}` : "/");
  const modal = usePageModal(done);
  const names: Names = setupNames(data);
  const partners: Partner[] = data.people
    .filter((p) => p.kind === "partner" && p.active)
    .map((p) => ({ id: p.id, pct: Number(p.profitSharePct ?? 0) }));
  const ctx = { names, cards: data.cards, billDates };
  const owedNow = owedBefore(owed, edit);
  const pair = type && !edit ? pairOf(type) : undefined;
  const label = (opened && moneyEntryLabel(opened)) || (type && LABEL[type]) || "New entry";

  return (
    <FormModal
      {...modal}
      title={edit ? `Edit ${LABEL[opened as MoneyType] ?? "entry"}` : label}
      about={type ? aboutOf(type) : undefined}
      meta={edit ? { id, updatedAt: edit.updatedAt } : { id }}
      initial={edit?.values ?? prefill}
      submit={saveMoneyEntry}
      undo={edit ? undefined : deleteMoneyEntry}
      send={(saved, f) =>
        SEND_TYPES.has(String(f.type)) ? sendHref(f.customerId, saved.id) : null
      }
      preview={(f) => previewEntry(entryOf(f), ctx, partners)}
      confirm={(f) =>
        entryConfirm(entryOf(f), { ...ctx, people: data.people, owed: owedNow, partners })
      }
    >
      <Reread when={type} />
      <MoneyCalendar.Provider value={calendar}>
        {!opened ? (
          <PickerField
            label="Type"
            name="type"
            placeholder="Pick a type"
            options={TYPES.map(([t, label]) => ({ id: t, label }))}
            onChange={(t) => setType(t as MoneyType)}
          />
        ) : pair ? (
          <Choice
            label="Type"
            name="type"
            options={pair.map((t) => [t, LABEL[t] as string])}
            value={type}
            onChange={setType}
          />
        ) : (
          <input type="hidden" name="type" value={type} />
        )}
        {type && (
          <>
            <DateField label="Date" name="date" />
            {/* a pair (capital in/out …) keeps its fields when the chip switches */}
            <TypeFields
              key={pair?.[0] ?? type}
              type={type}
              data={data}
              dues={dues}
              owed={owedNow}
            />
            <TextField
              label={type === "customer_discount" ? "Reason" : "Note"}
              name="note"
              autoComplete="off"
            />
          </>
        )}
      </MoneyCalendar.Provider>
    </FormModal>
  );
}

/** The type's own fields (SRS §4 Money). */
function TypeFields({
  type,
  data,
  dues,
  owed,
}: { type: MoneyType } & Omit<Props, "type" | "calendar" | "billDates">) {
  const pick = (kind: SetupKind, rows: { id: string; label: string }[]) => ({
    options: rows,
    add: addNew(kind, data),
  });
  const people = pick(
    "person",
    data.people
      .filter((p) => p.active)
      .map((p) => ({
        id: p.id,
        label: p.name,
        ...(isProfit(type) && { hint: `Profit owed ${format(owed[p.id] ?? 0)}` }),
      })),
  );
  // D-009: Walk-in can't get cash or a profit share.
  const noWalkIn = type === "customer_cash_given" || type === "customer_profit_share";
  const customers = pick(
    "customer",
    data.customers
      .filter((c) => c.active && !(noWalkIn && c.isSystem))
      .map((c) => ({
        id: c.id,
        label: c.display,
        ...(type === "customer_discount" && { hint: dueText(dues[c.id] ?? 0) }),
      })),
  );
  const suppliers = pick(
    "supplier",
    data.suppliers.filter((s) => s.active).map((s) => ({ id: s.id, label: s.name })),
  );
  const cards = pick(
    "card",
    data.cards.filter((c) => c.active).map((c) => ({ id: c.id, label: c.display })),
  );
  const amount = <MoneyField label="Amount" name="amount" />;
  const customer = (
    <PickerField label="Customer" name="customerId" placeholder="Pick a customer" {...customers} />
  );
  const card = <PickerField label="Card" name="cardId" placeholder="Pick a card" {...cards} />;

  switch (type) {
    case "customer_payment":
    case "customer_cash_given":
    case "customer_discount":
      return (
        <>
          {customer}
          {amount}
        </>
      );
    case "customer_profit_share":
      return <ProfitShare customer={customer} amount={amount} />;
    case "supplier_payment":
      return (
        <>
          <PickerField
            label="Supplier"
            name="supplierId"
            placeholder="Pick a supplier"
            {...suppliers}
          />
          {amount}
          <CashOrCard label="Paid by" card={card} />
        </>
      );
    case "card_payment":
    case "card_fee":
      return (
        <>
          {card}
          {amount}
        </>
      );
    case "card_cash_out":
      return (
        <>
          {card}
          <CashOut />
        </>
      );
    case "cashback":
      return (
        <>
          {amount}
          <CashOrCard label="Received in" card={card} />
        </>
      );
    case "expense":
      return <Expense amount={amount} card={card} />;
    case "capital_in":
    case "capital_out":
    case "profit_paid":
    case "profit_reinvested":
      return (
        <>
          <PickerField label="Person" name="personId" placeholder="Pick a person" {...people} />
          {amount}
          {isProfit(type) && <AboveOwed owed={owed} />}
          {/* D-060: a person's own spending on a card the business pays */}
          {type === "capital_out" && (
            <CashOrCard label="Paid by" card={card} help="capital_out_paid_by" />
          )}
        </>
      );
    case "opening_correction":
      return <OpeningCorrection targets={{ customers, suppliers, cards, people }} />;
    default:
      return null;
  }
}

/** "+ Add new" on a picker: the Setup form for that kind, selecting the new row. */
function addNew(kind: SetupKind, data: SetupData): AddForm {
  return function AddNew(shell) {
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
}

/** Cash or Card (+ the card), for money paid out or received. */
function CashOrCard({
  label,
  card,
  help,
}: {
  label: string;
  card: React.ReactNode;
  help?: HelpField;
}) {
  const initial = useContext(FormInitial).source;
  const [source, setSource] = useState<"cash" | "card">(initial === "card" ? "card" : "cash");
  return (
    <>
      <Reread when={source} />
      <Choice
        label={label}
        name="source"
        help={help}
        options={[
          ["cash", "Cash"],
          ["card", "Card"],
        ]}
        value={source}
        onChange={setSource}
      />
      {source === "card" && card}
    </>
  );
}

/**
 * For month (D-035): starts at `start` and, until the user changes it, follows `start`; never
 * switches by itself. A month the guards refuse shows their error at once.
 */
function MonthField({ start }: { start: string }) {
  const [own, setOwn] = useState<string | null>(useContext(FormInitial).forMonth ?? null);
  const value = own ?? start;
  const date = useDate();
  const cal = useContext(MoneyCalendar);
  const error = cal ? dateErrors({ date, forMonth: value }, cal).forMonth : undefined;
  return (
    <>
      <Reread when={value} />
      <MonthSelect
        label="For month"
        name="forMonth"
        help="for_month"
        choices={(keep) => (cal ? forMonthChoices(cal, date, keep) : [])}
        value={value}
        onChange={setOwn}
        error={error}
      />
    </>
  );
}

/** The date the form currently has (today until it is read). */
function useDate() {
  const values = useContext(FormValues);
  const date = values?.date;
  return typeof date === "string" && date ? date : dhakaToday();
}

function ProfitShare({ customer, amount }: { customer: React.ReactNode; amount: React.ReactNode }) {
  const initial = useContext(FormInitial).settleMode;
  const [settle, setSettle] = useState((initial as "received" | "added_to_due" | undefined) ?? "");
  return (
    <>
      {customer}
      {amount}
      <MonthField start={addMonths(monthOf(dhakaToday()), -1)} />
      <Choice
        label="Settled by"
        name="settleMode"
        help="profit_share_settle"
        options={SETTLE}
        value={settle}
        onChange={setSettle}
      />
    </>
  );
}

function Expense({ amount, card }: { amount: React.ReactNode; card: React.ReactNode }) {
  const [category, setCategory] = useState(useContext(FormInitial).category ?? "");
  const date = useDate();
  return (
    <>
      <Choice
        label="Category"
        name="category"
        options={CATEGORY}
        value={category}
        onChange={setCategory}
        columns={3}
      />
      {amount}
      <CashOrCard label="Paid by" card={card} />
      <MonthField start={monthOf(date)} />
    </>
  );
}

/** A warning, never a block, when the amount is more than the person's profit owed (UIDD §4.6). */
function AboveOwed({ owed }: { owed: Props["owed"] }) {
  const values = useContext(FormValues);
  const person = String(values?.personId ?? "");
  const amount = parse(String(values?.amount ?? ""));
  const limit = owed[person] ?? 0;
  if (!person || amount === null || amount <= limit) return null;
  return (
    <p role="status" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      This is more than the profit owed ({format(limit)}). It can still be saved.
    </p>
  );
}

type Pick = { options: { id: string; label: string }[]; add: AddForm };

/** What was wrong at opening → whose it is → the signed change. */
function OpeningCorrection({
  targets,
}: {
  targets: Record<"customers" | "suppliers" | "cards" | "people", Pick>;
}) {
  const [kind, setKind] = useState(useContext(FormInitial).openingKind ?? "");
  const target: Record<string, [string, string, string, Pick]> = {
    customer_due: ["Customer", "customerId", "Pick a customer", targets.customers],
    supplier_due: ["Supplier", "supplierId", "Pick a supplier", targets.suppliers],
    card_balance: ["Card", "cardId", "Pick a card", targets.cards],
    capital: ["Person", "personId", "Pick a person", targets.people],
    profit_owed: ["Person", "personId", "Pick a person", targets.people],
  };
  const t = target[kind];
  return (
    <>
      <Reread when={kind} />
      <Choice
        label="What was wrong"
        name="openingKind"
        help="opening_correction_kind"
        options={WRONG}
        value={kind}
        onChange={setKind}
      />
      {t && <PickerField key={t[1]} label={t[0]} name={t[1]} placeholder={t[2]} {...t[3]} />}
      <MoneyField
        label="Change (+ or −)"
        name="amount"
        help="opening_correction_change"
        inputMode="text"
      />
    </>
  );
}
