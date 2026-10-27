"use client";

import { useState } from "react";
import { InfoIcon } from "lucide-react";

// UIDD §1: no hover-only info. A label with an ⓘ that toggles a short inline note under it (for
// views; form fields have their own ⓘ in `Field`).
export function InfoNote({ label, note }: { label: string; note: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex flex-col">
      <span className="inline-flex items-center">
        {label}
        <button
          type="button"
          // A 44px tap target that doesn't make its label's line taller (-my-3).
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -my-3 flex size-11 items-center justify-center rounded-lg outline-none focus-visible:ring-3"
          aria-label={`About ${label}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <InfoIcon className="size-4" />
        </button>
      </span>
      {open && (
        <span role="note" className="bg-muted max-w-48 rounded-md px-2 py-1 text-xs font-normal">
          {note}
        </span>
      )}
    </span>
  );
}
