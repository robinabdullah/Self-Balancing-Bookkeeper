"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { DMY_ERROR, DateInput } from "@/components/forms/date-fields";
import { inputClass } from "@/components/forms/field";
import { modalSheet } from "@/components/forms/form-modal";
import type { PayAccount } from "@mbl/domain/business";
import { HowToPay, firstPick } from "@/components/send/how-to-pay";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  addMonths,
  clampDay,
  formatDate,
  formatMonth,
  formatRange,
  monthOf,
} from "@mbl/domain/dates";
import { statementPdfHref, withQuery } from "@mbl/domain/href";
import { periodOptions, periodRange } from "@mbl/domain/journal-filter";
import { cn } from "@/lib/utils";
import { SharePdfButton } from "./share-pdf";

// UIDD §4.8 (D-038, D-040): the one Report sheet. ⋯ → Statement opens it over the account page
// (`?report=1`): a Period (This month · Last month · a month ▾ · Custom From/To) and the outputs
// that exist for it: View on screen (`?from=&to=`), WhatsApp message (the send preview) and, on
// customers and suppliers, Share PDF (D-041) with Add How to pay (customers, the business's
// accounts). D-043: the Cash book and the Sales report open it from their ⤴ Share icon, with their
// own title and outputs (the Cash book's day on screen is an extra first chip). D-045: the
// Investor report picks whole months (Custom = From month / To month); the Monthly pack one month
// (no Custom; the outputs carry `month=`), and Months opens it with its outputs on the pack.

type Props = {
  /** This page without `report`: where the outputs and Close go. */
  base: string;
  /** The month of the oldest entry ("YYYY-MM"), for the month list. */
  first: string | null;
  today: string;
  /** Customers and suppliers: the due statement PDF (`accounts`: How to pay, customers only). */
  pdf?: { kind: "customer" | "supplier"; id: string; accounts: PayAccount[] };
  title?: string;
  /** The day on screen (Cash book): a first chip, selected. */
  day?: string;
  /** The send preview's `send=` value; null: no WhatsApp message. */
  send?: string | null;
  /** A report's PDF and Excel routes; the period is added as `from`/`to`. */
  pdfHref?: string;
  excelHref?: string;
  /** "any" dates (default), whole "months", or one "month" (`month=` instead of from/to). */
  period?: "any" | "months" | "month";
  /** Where View and WhatsApp go, when not this page (Months → the Monthly pack). */
  target?: string;
};

export function ReportSheet({
  base,
  first,
  today,
  pdf,
  title = "Statement",
  day,
  send = "statement",
  pdfHref,
  excelHref,
  period: mode = "any",
  target,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [period, setPeriod] = useState(day ? "day" : "this");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const current = monthOf(today);
  const [span, setSpan] = useState({ from: current, to: current });
  const [bad, setBad] = useState(false);
  const [howToPay, setHowToPay] = useState(false);
  const [picked, setPicked] = useState(() => firstPick(pdf?.accounts ?? []));
  const months = periodOptions(first, today).filter(([v]) => /^\d{4}-\d{2}$/.test(v));
  const everyMonth = (
    [
      [current, formatMonth(current)],
      [addMonths(current, -1), formatMonth(addMonths(current, -1))],
      ...months,
    ] as [string, string][]
  ).filter(([v], i) => i === 0 || !first || v >= first);
  const range =
    period === "day" && day
      ? { from: day, to: day }
      : mode === "months" && period === "custom"
        ? span.from <= span.to
          ? { from: `${span.from}-01`, to: clampDay(span.to, 31) }
          : null
        : periodRange(period, today, custom);
  /** What an output adds to its link: the dates, or the month. */
  const params = range && (mode === "month" ? { month: monthOf(range.from) } : range);
  const close = () => {
    setOpen(false);
    router.push(base, { scroll: false });
  };
  const chip = (value: string, label: string) => (
    <Button
      key={value}
      type="button"
      variant={period === value ? "default" : "outline"}
      aria-pressed={period === value}
      className="min-h-11 px-3"
      onClick={() => setPeriod(value)}
    >
      {label}
    </Button>
  );
  const output = (label: string, extra: Record<string, string>) =>
    params ? (
      <Link
        href={withQuery(target ?? base, { ...params, ...extra })}
        scroll={false}
        className={cn(buttonVariants({ variant: "outline" }), "min-h-11 justify-start px-4")}
      >
        {label}
      </Link>
    ) : (
      <Button variant="outline" disabled className="min-h-11 justify-start px-4">
        {label}
      </Button>
    );

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()} history={false}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(modalSheet, "overflow-y-auto lg:max-w-md")}
      >
        <SheetHeader className="flex-row items-center justify-between border-b py-2">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            Pick a period, then view it on screen or share it
          </SheetDescription>
          <SheetClose asChild>
            <Button variant="ghost" className="-mr-2 size-11" aria-label="Close">
              <XIcon />
            </Button>
          </SheetClose>
        </SheetHeader>

        <div className="flex flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm">
          <section aria-label="Period" className="flex flex-col gap-2">
            <h3 className="font-medium">Period</h3>
            <div className="flex flex-wrap gap-2">
              {day && chip("day", formatDate(day))}
              {chip("this", "This month")}
              {chip("last", "Last month")}
              {mode !== "month" && chip("custom", "Custom")}
            </div>
            {months.length > 0 && (
              <select
                aria-label="A month"
                className={cn(inputClass, "text-sm")}
                value={/^\d{4}-\d{2}$/.test(period) ? period : ""}
                onChange={(e) => e.target.value && setPeriod(e.target.value)}
              >
                <option value="">A month…</option>
                {months.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            {period === "custom" && mode === "months" && (
              <div className="grid grid-cols-2 gap-2">
                {(["from", "to"] as const).map((key) => (
                  <label key={key} className="flex flex-col gap-1 font-medium">
                    {key === "from" ? "From month" : "To month"}
                    <select
                      className={cn(inputClass, "text-sm font-normal")}
                      value={span[key]}
                      onChange={(e) => setSpan((s) => ({ ...s, [key]: e.target.value }))}
                    >
                      {everyMonth.map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            {period === "custom" && mode === "any" && (
              <div className="grid grid-cols-2 gap-2">
                {(["from", "to"] as const).map((key) => (
                  <label key={key} className="flex flex-col gap-1 font-medium">
                    {key === "from" ? "From" : "To"}
                    <DateInput
                      value={custom[key]}
                      max={today}
                      onChange={(d) => d !== null && setCustom((c) => ({ ...c, [key]: d }))}
                      onBadChange={setBad}
                    />
                  </label>
                ))}
                {bad && <p className="text-destructive col-span-2">{DMY_ERROR}</p>}
              </div>
            )}
            <p className="text-muted-foreground" aria-live="polite">
              {range
                ? mode === "month"
                  ? formatMonth(range.from)
                  : formatRange(range.from, range.to)
                : "Pick From and To (From first)"}
            </p>
          </section>

          <section aria-label="Outputs" className="flex flex-col gap-2">
            {output("View on screen", {})}
            {send && output("WhatsApp message", { send })}
            {pdfHref && (
              <SharePdfButton
                className="justify-start"
                href={params && withQuery(pdfHref, params)}
              />
            )}
            {pdf && (
              <SharePdfButton
                className="justify-start"
                href={
                  range &&
                  statementPdfHref(pdf.kind, pdf.id, range.from, range.to, howToPay ? picked : [])
                }
              />
            )}
            {pdf && (
              <HowToPay
                accounts={pdf.accounts}
                on={howToPay}
                picked={picked}
                onChange={(on, ids) => {
                  setHowToPay(on);
                  setPicked(ids);
                }}
              />
            )}
            {excelHref &&
              (params ? (
                <a
                  href={withQuery(excelHref, params)}
                  download
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "min-h-11 justify-start px-4",
                  )}
                >
                  Download Excel
                </a>
              ) : (
                <Button variant="outline" disabled className="min-h-11 justify-start px-4">
                  Download Excel
                </Button>
              ))}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
