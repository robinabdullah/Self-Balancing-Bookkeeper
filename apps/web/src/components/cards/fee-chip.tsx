"use client";

import { useState } from "react";
import { type Alert, LEVEL } from "@mbl/domain/alert-level";
import { cn } from "@/lib/utils";

// UIDD §4.8 (D-081): while a card has an annual-fee alert (SRS §15), a chip beside its status badge,
// coloured by the alert's level; a tap toggles the alert's line under it (the `InfoNote` pattern:
// no hover-only info). Nothing shows otherwise.
export function FeeChip({ alert, label }: { alert: Alert; label: string }) {
  const [open, setOpen] = useState(false);
  const level = LEVEL[alert.level];
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${level.label}: ${label}`}
        onClick={() => setOpen((o) => !o)}
        className="focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded-full outline-none focus-visible:ring-3"
      >
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
            level.tone,
          )}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {label}
        </span>
      </button>
      {open && (
        <span
          role="note"
          className={cn("block basis-full rounded-md border px-3 py-2 text-sm", level.tone)}
        >
          {alert.detail}
        </span>
      )}
    </>
  );
}
