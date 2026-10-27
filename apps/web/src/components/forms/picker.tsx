"use client";

import { useContext, useEffect, useState } from "react";
import { CheckIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { HelpField } from "@mbl/domain/help-text";
import { cn } from "@/lib/utils";
import { Field, FormChanged, FormInitial, inputClass } from "./field";
import { modalSheet } from "./form-modal";

// UIDD §1.2 "Pick, don't type" (task 3.3.1): a searchable picker in a bottom sheet. The value is
// a hidden input, so the form reads it like any field. "+ Add new" opens a short add form (a
// Setup form in the modal shell) and selects the new row when it is saved. The caller passes only
// active rows (plus the current value), so deactivated rows are hidden (UIDD §4.11). On a phone
// it opens with the list in view, not the keyboard (D-053).

export type Option = { id: string; label: string; hint?: string };

/** The add form a picker opens: `onSaved` gets the new row's id. */
export type AddForm = (shell: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (id: string) => void;
}) => React.ReactNode;

type Props = {
  label: string;
  name: string;
  options: Option[];
  help?: HelpField;
  defaultValue?: string | null;
  placeholder?: string;
  onChange?: (id: string) => void;
  /** "+ Add new": e.g. `(shell) => <SetupForm kind="customer" … {...shell} />`. */
  add?: AddForm;
};

export function PickerField({
  label,
  name,
  options,
  help,
  defaultValue,
  placeholder = "Pick one",
  onChange,
  add,
}: Props) {
  const initial = useContext(FormInitial)[name];
  const [value, setValue] = useState(defaultValue ?? initial ?? "");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<number | null>(null); // the add form's key while open
  const [query, setQuery] = useState("");
  const changed = useContext(FormChanged);
  useEffect(() => changed(), [value, changed]); // after the hidden input has the new value

  const pick = (id: string) => {
    setValue(id);
    setOpen(false);
    onChange?.(id);
  };
  const selected = options.find((o) => o.id === value);
  const q = query.trim().toLowerCase();
  const shown = options.filter((o) => !q || `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q));

  return (
    <Field label={label} name={name} help={help}>
      {({ id, name: field, ...control }) => (
        <>
          <input type="hidden" name={field} value={value} />
          <button
            type="button"
            id={id}
            {...control}
            aria-haspopup="dialog"
            className={cn(inputClass, "flex items-center justify-between gap-2 text-left")}
            onClick={() => {
              setQuery("");
              setOpen(true);
            }}
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected?.label ?? (value ? "…" : placeholder)}
            </span>
            <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
          </button>
          {selected?.hint && <p className="text-muted-foreground text-sm">{selected.hint}</p>}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent
              side="bottom"
              className={cn(modalSheet, "max-h-[85dvh] lg:max-w-md")}
              onOpenAutoFocus={(e) => {
                // D-053: on a phone, focusing Search opens the keyboard over the list; focus the
                // sheet instead, so the keyboard comes up only when Search is tapped.
                if (!window.matchMedia("(pointer: coarse)").matches) return;
                e.preventDefault();
                (e.currentTarget as HTMLElement).focus();
              }}
            >
              <SheetHeader className="border-b py-3">
                <SheetTitle>{label}</SheetTitle>
                <SheetDescription className="sr-only">Search and pick a {label}</SheetDescription>
              </SheetHeader>
              <div className="p-3">
                <input
                  type="search"
                  aria-label={`Search ${label}`}
                  placeholder="Search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={inputClass}
                />
              </div>
              <ul role="listbox" aria-label={label} className="overflow-y-auto px-3">
                {shown.map((o) => (
                  <li key={o.id} role="option" aria-selected={o.id === value}>
                    <button
                      type="button"
                      className="hover:bg-muted flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-1 text-left"
                      onClick={() => pick(o.id)}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{o.label}</span>
                        {o.hint && (
                          <span className="text-muted-foreground truncate text-sm">{o.hint}</span>
                        )}
                      </span>
                      {o.id === value && <CheckIcon className="size-4 shrink-0" aria-hidden />}
                    </button>
                  </li>
                ))}
                {shown.length === 0 && (
                  <li className="text-muted-foreground py-4 text-center text-sm">
                    {q ? "Nothing matches." : "Nothing to pick yet."}
                  </li>
                )}
              </ul>
              {add && (
                <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    onClick={() => {
                      setOpen(false);
                      setAdding((n) => (n ?? 0) + 1);
                    }}
                  >
                    <PlusIcon />
                    Add new
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>

          {add && adding !== null && (
            <AddNew key={adding} form={add} onSaved={pick} onClose={() => setAdding(null)} />
          )}
        </>
      )}
    </Field>
  );
}

/** The add form, mounted fresh for each "+ Add new" so it starts clean with a new id. */
function AddNew({
  form,
  onSaved,
  onClose,
}: {
  form: AddForm;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  return form({
    open,
    onOpenChange: (o) => {
      setOpen(o);
      if (!o) setTimeout(onClose, 300); // unmount after the sheet slides out
    },
    onSaved,
  });
}
