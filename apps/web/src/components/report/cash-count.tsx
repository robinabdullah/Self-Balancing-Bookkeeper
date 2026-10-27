"use client";

import { useState } from "react";
import { inputClass } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { format, parse, sub } from "@mbl/domain/money";
import { cn } from "@/lib/utils";

// D-043 (UIDD §4.17): Count cash, on today's Cash book only. A link opens a small box (UI rule 3);
// the counted amount is checked against today's closing cash. Nothing is saved.
export function CashCount({ closing }: { closing: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const counted = text.trim() ? parse(text) : null;
  const diff = counted == null ? null : sub(counted, closing);

  if (!open)
    return (
      <Button variant="link" className="min-h-11 self-start px-0" onClick={() => setOpen(true)}>
        Count cash
      </Button>
    );
  return (
    <section aria-label="Cash count" className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <label className="flex flex-col gap-1 font-medium">
        Counted cash
        <input
          inputMode="decimal"
          autoFocus
          className={cn(inputClass, "font-normal")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <p aria-live="polite" className="min-h-5 font-medium">
        {text.trim() && counted == null && (
          <span className="text-destructive">Type an amount, e.g. 4,03,900</span>
        )}
        {diff === 0 && "Matches ✓"}
        {diff != null && diff < 0 && (
          <span className="text-destructive">Short by {format(0 - diff)}</span>
        )}
        {diff != null && diff > 0 && `Over by ${format(diff)}`}
      </p>
    </section>
  );
}
