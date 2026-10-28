"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Amount } from "@/components/amount";
import { FormModal } from "@/components/forms/form-modal";
import { LABEL } from "@mbl/domain/money/types";
import { Button } from "@/components/ui/button";
import { formatDate, formatMonth } from "@mbl/domain/dates";
import { reopenMonth } from "@/server/actions/months";
import type { PaidSince } from "@/api/contract";

// UIDD §4.9 step 5 (task 5.4): the latest closed month's Re-open → a confirm that lists (as a
// warning) the profit paid / reinvested entries made since the close → `reopenMonth`. The page
// then shows the month's close screen again.

type Paid = PaidSince;

export function ReopenMonth({
  month,
  close,
  paid,
}: {
  month: string;
  close: { id: string; updatedAt: string };
  paid: Paid;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button
        variant="outline"
        className="mt-6 min-h-11 w-full px-4 lg:w-fit"
        onClick={() => setOpen(true)}
      >
        Re-open
      </Button>
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={`Re-open ${formatMonth(month)}?`}
        meta={close}
        submit={reopenMonth}
        submitLabel="Re-open"
        savedMessage={`${formatMonth(month)} re-opened`}
        onSaved={() => router.refresh()}
      >
        <p className="text-sm">
          Its allocations and snapshot are deleted (kept in the audit log) and its entries unlock.
          Close it again when the corrections are done.
        </p>
        {paid.length > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
          >
            <p className="mb-1 font-medium">Profit paid or reinvested since the close:</p>
            <ul aria-label="Profit paid or reinvested since the close">
              {paid.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-x-3">
                  <span>
                    {formatDate(e.date)} · {LABEL[e.type]} · {e.person ?? "Person"}
                  </span>
                  <Amount poisha={e.amount} />
                </li>
              ))}
            </ul>
            <p className="mt-1">They stay as entered; check them against the new close.</p>
          </div>
        )}
      </FormModal>
    </>
  );
}
