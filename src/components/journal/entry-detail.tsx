"use client";

import { useContext, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockIcon, XIcon } from "lucide-react";
import { DateField, MonthSelect } from "@/components/forms/date-fields";
import { EffectRows } from "@/components/forms/effect-rows";
import { type Fields, FormValues } from "@/components/forms/form-body";
import { FormModal, modalSheet } from "@/components/forms/form-modal";
import { SharePdfButton } from "@/components/report/share-pdf";
import { Button } from "@/components/ui/button";
import { leaveSheet } from "@/components/ui/use-back-close";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { auditChanges } from "@/lib/audit";
import { formatDate, formatMonth, formatStamp } from "@/lib/dates";
import {
  type EffectRow,
  type Posting,
  type RowsContext,
  deleteRows,
  didRows,
  reversalRows,
} from "@/lib/effect-rows";
import type { BillDates, Card } from "@/lib/engine/cards";
import { type Calendar, dateErrors, defaultReversal } from "@/lib/guards";
import { entryHref, invoicePdfHref, receiptPdfHref, sendHref, withQuery } from "@/lib/href";
import { format } from "@/lib/money";
import { forMonthChoices } from "@/lib/month-choices";
import { cn } from "@/lib/utils";
import { SEND_TYPES } from "@/lib/whatsapp";
import type { Result } from "@/server/action";
import { deleteMoneyEntry } from "@/server/actions/money";
import { deletePurchase } from "@/server/actions/purchase";
import { deleteReturn } from "@/server/actions/return";
import { reverseEntry } from "@/server/actions/reverse";
import { deleteSale } from "@/server/actions/sale";
import type { JournalEntry, JournalRow } from "@/server/journal";
import { editPath, entryTitle, isOpening, whoOf } from "./labels";

// UIDD §4.10 (task 3.8.2): an entry's detail, a bottom sheet on a phone. It opens over the page it
// was tapped on (`<page>?entry=<id>`, D-032) and closing returns to `closeHref`. Details · History
// (the audit rows: who, when, which fields changed old → new). Actions: Edit
// (the same form, type fixed, D-008) · Delete (open months) · Reverse (dated in the original's
// month while it is open, otherwise today; never before the original). A reversed entry and a
// reversal have no Edit (D-026). The actions check everything again on the server. D-061: the
// entry's rows ("What it did"), negated in the Delete dialog, and the reversal's in Reverse.

const DELETE: Record<JournalRow["table"], (input: unknown) => Promise<Result>> = {
  purchase: deletePurchase,
  sale: deleteSale,
  return: deleteReturn,
  money: deleteMoneyEntry,
};

const ACTION: Record<string, string> = {
  insert: "Added",
  update: "Edited",
  delete: "Deleted",
  reverse: "Added as a reversal",
};

type Props = { entry: JournalEntry; names: Record<string, string>; closeHref: string };

/** The reversal's date and for month as the dialog has them; null while the date is incomplete. */
const reversalOn = (f: Fields, start: { forMonth: string | null }) => {
  const date = typeof f.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? f.date : null;
  const forMonth = typeof f.forMonth === "string" && f.forMonth ? f.forMonth : start.forMonth;
  return date ? { date, forMonth } : null;
};

export function EntryDetail({
  entry,
  names,
  closeHref,
  posting,
  cards,
  billDates,
}: Props & {
  /** The entry as the books hold it (D-061); null: no rows. */
  posting: Posting | null;
  cards: Card[];
  billDates: BillDates[];
}) {
  const router = useRouter();
  const { row } = entry;
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"details" | "history">("details");
  const [deleting, setDeleting] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [reversalId] = useState(() => crypto.randomUUID());
  // Shut at once, then drop `?entry` from the URL; the page underneath stays as it is.
  const close = (replace = false) => {
    setOpen(false);
    router[replace ? "replace" : "push"](closeHref, { scroll: false });
  };
  // Tapping the same row again right after closing brings a fresh `entry` → open again.
  const [shown, setShown] = useState(entry);
  if (shown !== entry) {
    setShown(entry);
    setOpen(true);
  }
  // From another page, Edit comes back here (with this entry open) after Save or Cancel.
  const self = entryHref(closeHref, row.id);
  const editHref =
    closeHref === "/journal" ? editPath(row) : withQuery(editPath(row), { from: self });

  const paired = !!row.reversesId || !!row.reversedBy;
  const canEdit = !row.locked && !paired && !isOpening(row);
  const canReverse = !paired;
  // D-040: a customer's Sale, Payment in, Return, Discount or Profit share that stands.
  const send = !paired && SEND_TYPES.has(row.type) ? sendHref(row.customerId, row.id) : null;
  // D-042: a reversed sale or payment has no Send ▸; its cancelled invoice / receipt instead.
  const cancelledPdf = !row.reversedBy
    ? null
    : row.type === "sale"
      ? invoicePdfHref(row.id)
      : row.type === "customer_payment"
        ? receiptPdfHref(row.id)
        : null;
  const start = defaultReversal(row, entry.calendar);
  const ctx: RowsContext = { names, cards, billDates };

  return (
    // `?entry=` is in the URL, so Back already closes this sheet.
    <Sheet open={open} onOpenChange={(o) => !o && close()} history={false}>
      <SheetContent side="bottom" showCloseButton={false} className={cn(modalSheet, "lg:max-w-lg")}>
        <SheetHeader className="flex-row items-start justify-between border-b py-2">
          <div className="flex flex-col gap-0.5">
            <SheetTitle className="text-lg">{entryTitle(row)}</SheetTitle>
            <SheetDescription>
              {formatDate(row.date)} · {format(row.amount)}
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" className="-mr-2 size-11" aria-label="Close">
              <XIcon />
            </Button>
          </SheetClose>
        </SheetHeader>

        <div role="tablist" className="bg-muted mx-4 mt-3 grid grid-cols-2 gap-1 rounded-lg p-1">
          {(["details", "history"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "text-foreground/75 min-h-11 rounded-md text-sm",
                tab === t && "bg-background text-foreground font-medium shadow-sm",
              )}
            >
              {t === "details" ? "Details" : "History"}
            </button>
          ))}
        </div>

        {/* Focusable: a scrolling panel must be reachable by keyboard (UIDD §6). */}
        <div
          role="tabpanel"
          tabIndex={0}
          className="flex flex-col gap-3 overflow-y-auto p-4 text-sm"
        >
          {tab === "details" ? (
            <Details
              entry={entry}
              names={names}
              closeHref={closeHref}
              did={posting && didRows(posting, ctx)}
            />
          ) : (
            <History entry={entry} names={names} closeHref={closeHref} />
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {!row.locked && (
            <Button
              variant="outline"
              // Red, and still ≥ 4.5:1 on the sheet in every theme (UIDD §6).
              className="min-h-11 border-red-300 px-4 text-red-700 hover:text-red-800 dark:border-red-900 dark:text-red-300 dark:hover:text-red-300"
              onClick={() => setDeleting(true)}
            >
              Delete
            </Button>
          )}
          {canReverse && (
            <Button variant="outline" className="min-h-11 px-4" onClick={() => setReversing(true)}>
              Reverse
            </Button>
          )}
          {send && (
            <Button asChild variant="outline" className="min-h-11 px-4">
              <Link href={send}>Send ▸</Link>
            </Button>
          )}
          {cancelledPdf && <SharePdfButton href={cancelledPdf} />}
          {canEdit && (
            <Button asChild className="min-h-11 px-4">
              <Link href={editHref}>Edit</Link>
            </Button>
          )}
        </div>

        <FormModal
          open={deleting}
          onOpenChange={setDeleting}
          title="Delete this entry?"
          meta={{ id: row.id, updatedAt: row.updatedAt }}
          submit={DELETE[row.table]}
          submitLabel="Delete"
          savedMessage="Deleted"
          preview={posting ? () => deleteRows(posting, ctx) : undefined}
          onSaved={() => {
            leaveSheet(); // the confirm's history entry becomes the page without `?entry`
            close(true);
          }}
        >
          <p className="text-sm">
            It is removed for good, with its lines. The change is kept in the audit log.
          </p>
        </FormModal>
        <FormModal
          open={reversing}
          onOpenChange={setReversing}
          title="Reverse this entry?"
          meta={{ id: reversalId, table: row.table, reversesId: row.id }}
          submit={reverseEntry}
          submitLabel="Reverse"
          savedMessage="Reversed"
          preview={
            posting
              ? (f) => {
                  const on = reversalOn(f, start);
                  return on && reversalRows(posting, ctx, on.date, on.forMonth);
                }
              : undefined
          }
        >
          <p className="text-sm">
            Adds a linked entry that cancels this one. It can&apos;t be dated before{" "}
            {formatDate(row.date)}.
          </p>
          <p className="text-muted-foreground text-sm">
            Only for an entry that shouldn&apos;t count at all: a mistake, or a payment that
            bounced. A phone returned or refunded? Enter a return instead.
          </p>
          <DateField label="Date" name="date" defaultValue={start.date} />
          {start.forMonth && <ReverseMonth start={start.forMonth} calendar={entry.calendar} />}
        </FormModal>
      </SheetContent>
    </Sheet>
  );
}

/** The reversal's For month (D-035): the months its date allows, newest first. */
function ReverseMonth({ start, calendar }: { start: string; calendar: Calendar }) {
  const [month, setMonth] = useState(start);
  const f = useContext(FormValues);
  const date = (typeof f?.date === "string" && f.date) || calendar.today;
  return (
    <MonthSelect
      label="For month"
      name="forMonth"
      help="for_month"
      choices={(keep) => forMonthChoices(calendar, date, keep)}
      value={month}
      onChange={setMonth}
      error={dateErrors({ date, forMonth: month }, calendar).forMonth}
    />
  );
}

function Details({ entry, names, closeHref, did }: Props & { did: EffectRow[] | null }) {
  const { row, lines } = entry;
  const who = whoOf(row, names);
  const item = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
  const link = (id: string, text: string) => (
    <Link
      href={entryHref(closeHref, id)}
      scroll={false}
      className="text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
    >
      {text}
    </Link>
  );
  return (
    <>
      {row.locked && (
        <p className="bg-muted flex items-center gap-2 rounded-lg p-3">
          <LockIcon className="size-4 shrink-0" aria-hidden />
          In a closed month: it can&apos;t be edited or deleted — reverse it instead.
        </p>
      )}
      <dl className="flex flex-col gap-2">
        {item("Date", formatDate(row.date))}
        {row.forMonth && item("For month", formatMonth(row.forMonth))}
        {who && item("Who", who)}
        {item(lines.length ? "Total" : "Amount", format(row.amount))}
        {row.note && item("Note", row.note)}
      </dl>
      {lines.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 px-3 py-2">
              <span>
                {l.qty} × {names[l.modelId] ?? "?"}
                {l.note && <span className="text-muted-foreground"> · {l.note}</span>}
              </span>
              <span className="tabular-nums">@ {format(l.unitAmount)}</span>
            </li>
          ))}
        </ul>
      )}
      {did && (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">What it did</h3>
          <EffectRows rows={did} label="What it did" />
        </section>
      )}
      {row.reversedBy && link(row.reversedBy, "Reversed by → view the reversal")}
      {row.reversesId && link(row.reversesId, "Reverses → view the original")}
    </>
  );
}

function History({ entry, names }: Props) {
  if (entry.history.length === 0)
    return <p className="text-muted-foreground">No changes recorded.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {entry.history.map((h, i) => {
        const changes = h.action === "update" ? auditChanges(h.before, h.after, names) : [];
        return (
          <li key={i} className="rounded-lg border p-3">
            <p className="font-medium">
              {ACTION[h.action] ?? h.action} by {h.by}
            </p>
            <p className="text-muted-foreground">{formatStamp(h.at)}</p>
            {changes.length > 0 && (
              <EffectRows
                wrap
                label="Changes"
                className="mt-2"
                rows={changes.map((c) => ({ label: c.field, value: `${c.from} → ${c.to}` }))}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
