"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import type { EffectRow } from "@mbl/domain/effect-rows";
import { useFormHelp } from "@/lib/form-help";
import { type AboutForm, aboutText } from "@mbl/domain/help-text";
import { cn } from "@/lib/utils";
import { EffectRows } from "./effect-rows";

// UIDD §3 notes box, just above Save: "About this form" (collapsible; More → Form help sets how
// it starts, "Off" hides it) and "What this will do" (always shown on an entry form; the rows
// come from postEntry via `previewEntry`, task 3.3.3, D-061).

export function NotesBox({
  about,
  preview,
}: {
  about?: AboutForm;
  /** undefined = the form has no preview (Setup); null = not filled in enough yet. */
  preview?: EffectRow[] | null;
}) {
  const mode = useFormHelp();
  const [open, setOpen] = useState(mode === "expanded");
  const showAbout = about && mode !== "off";
  if (!showAbout && preview === undefined) return null;
  return (
    <section className="bg-muted/50 divide-y rounded-lg border text-sm">
      {showAbout && (
        <div>
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-between px-3 font-medium"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            About this form
            <ChevronDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
          {open && <p className="px-3 pb-3">{aboutText[about]}</p>}
        </div>
      )}
      {preview !== undefined && (
        <div className="px-3 py-2" aria-live="polite">
          <h3 className="flex min-h-9 items-center font-medium">What this will do</h3>
          {preview ? (
            <EffectRows rows={preview} label="What this will do" className="mb-1 text-base" />
          ) : (
            <p className="text-muted-foreground pb-1">Fill in the form to see the changes.</p>
          )}
        </div>
      )}
    </section>
  );
}
