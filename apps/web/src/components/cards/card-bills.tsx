"use client";

import { useState } from "react";
import Link from "next/link";
import { PencilIcon } from "lucide-react";
import { Amount } from "@/components/amount";
import { DateField } from "@/components/forms/date-fields";
import { FormModal } from "@/components/forms/form-modal";
import { money } from "@/components/shell/nav";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { billToPay, visibleBills } from "@mbl/domain/card-view";
import { daysInMonth, formatDate, formatMonth } from "@mbl/domain/dates";
import type { Bill } from "@mbl/domain/engine/cards";
import { withQuery } from "@mbl/domain/href";
import { toDecimal } from "@mbl/domain/money";
import { deleteBillDates, saveBillDates } from "@/server/actions/cards";
import type { BillDatesRow } from "@/server/cards";

// UIDD §4.8 (task 4.4.2, D-032): a card's statements, newest first: bill month, statement and due
// dates (actual / est.), amount, paid, remaining. By default only the unpaid bills whose statement
// is out and the next bill show; "Show all" adds the paid and later EMI bills. "Set dates" opens
// the "Card bill dates" modal (D-020): the bank's real statement or due date for that month; a
// blank date keeps the usual day. The oldest unpaid bill has "Pay ৳remaining": a card payment
// with the card and amount filled in (editable, for a split payment). D-045: a period's bills
// (`period`) are a read-only report as on its last day: all of them, no Set dates or Pay.

type Props = {
  cardId: string;
  bills: Bill[];
  billDates: BillDatesRow[];
  today: string;
  /** This page: the payment form comes back here. */
  base: string;
  /** D-045: the bills of a period, as a read-only report. */
  period?: boolean;
};

const tag = (actual: boolean) => (actual ? "actual" : "est.");

export function CardBills({ cardId, bills, billDates, today, base, period = false }: Props) {
  const [editing, setEditing] = useState<string | null>(null); // the bill month
  const [all, setAll] = useState(false);
  if (bills.length === 0)
    return <EmptyState hint={period ? "No bills in this period." : "No bills yet."} />;
  const { shown, hiddenCount } = period
    ? { shown: bills, hiddenCount: 0 }
    : visibleBills(bills, today);
  const pay = period ? null : billToPay(bills);
  const payHref = (b: Bill) =>
    withQuery(money("card_payment"), { cardId, amount: toDecimal(b.remaining), from: base });

  return (
    <>
      <ul aria-label="Statements" className="divide-y rounded-lg border">
        {(all ? bills : shown).map((b) => (
          <li key={b.month} className="px-3 py-2">
            <div className="grid grid-cols-[1fr_auto] gap-x-3">
              <span className="font-medium">{formatMonth(b.month)}</span>
              <Amount poisha={b.amount} className="text-right font-medium" />
              <span className="text-muted-foreground text-sm">
                Statement {formatDate(b.statementDate)} ({tag(b.statementActual)})
              </span>
              <span className="text-muted-foreground text-right text-sm">
                Paid <Amount poisha={b.paid} />
              </span>
              <span className="text-muted-foreground text-sm">
                Due {formatDate(b.dueDate)} ({tag(b.dueActual)})
              </span>
              <span className="text-right text-sm font-medium">
                Remaining <Amount poisha={b.remaining} />
              </span>
            </div>
            {!period && (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground -ml-2 min-h-11 px-2"
                  onClick={() => setEditing(b.month)}
                  aria-label={`Set ${formatMonth(b.month)} bill dates`}
                >
                  <PencilIcon aria-hidden />
                  Set dates
                </Button>
                {b.month === pay && (
                  <Button asChild variant="outline" className="min-h-11 px-3">
                    <Link href={payHref(b)}>
                      Pay <Amount poisha={b.remaining} />
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          className="mt-1 min-h-11 px-2"
          aria-expanded={all}
          onClick={() => setAll((a) => !a)}
        >
          {all ? "Show fewer bills" : `Show all ${bills.length} bills`}
        </Button>
      )}
      {editing && (
        <BillDatesForm
          key={editing}
          cardId={cardId}
          month={editing}
          row={billDates.find((d) => d.billMonth === editing) ?? null}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </>
  );
}

function BillDatesForm({
  cardId,
  month,
  row,
  onOpenChange,
}: {
  cardId: string;
  month: string;
  row: BillDatesRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [id] = useState(() => row?.id ?? crypto.randomUUID());
  const meta = { id, cardId, billMonth: month, ...(row && { updatedAt: row.updatedAt }) };
  // The pickers open on the bill's month; a statement date stays in its month (SRS §6 "Check
  // dates" flags one that doesn't), the due date comes after it.
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  return (
    <FormModal
      open
      onOpenChange={onOpenChange}
      title={`${formatMonth(month)} bill dates`}
      about="card_bill_dates"
      meta={meta}
      submit={saveBillDates}
      undo={row ? undefined : (saved) => deleteBillDates(saved)}
    >
      <DateField
        label="Actual statement date"
        name="actualStatementDate"
        min={first}
        max={last}
        defaultValue={row?.actualStatementDate ?? ""}
      />
      <DateField
        label="Actual due date"
        name="actualDueDate"
        min={first}
        max={null}
        defaultValue={row?.actualDueDate ?? ""}
      />
    </FormModal>
  );
}
