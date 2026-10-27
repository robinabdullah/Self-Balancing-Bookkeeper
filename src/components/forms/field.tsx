"use client";

import { createContext, useContext, useEffect, useId, useState } from "react";
import { InfoIcon } from "lucide-react";
import { type HelpField, fieldHelp } from "@/lib/help-text";
import type { Errors } from "@/lib/guards";
import { cn } from "@/lib/utils";

// UIDD §3, §5, §6: a labelled field with its inline error and, for non-obvious fields, an ⓘ that
// toggles one or two sentences under it. The form shell provides the errors (task 3.2.6). Plus the
// money and qty inputs (task 3.3.1); dates and months are in `date-fields.tsx` (D-035).

export const FormErrors = createContext<Errors>({});
/** Tells the form a value changed outside a native input event (a picker), to refresh the preview. */
export const FormChanged = createContext<() => void>(() => {});
/** Edit (UIDD §3: the same form as Add): the stored values by field name; {} on Add. */
export const FormInitial = createContext<Record<string, string>>({});

export const inputClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 min-h-11 w-full min-w-0 rounded-lg border bg-transparent px-3 text-base outline-none focus-visible:ring-3 aria-invalid:ring-3 dark:bg-input/30";

type Control = {
  id: string;
  name: string;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
};

export function Field({
  label,
  name,
  help,
  error: local,
  children,
}: {
  label: string;
  name: string;
  help?: HelpField;
  /** An error found in the browser (a bad date, a month the guards refuse); else the server's. */
  error?: string;
  children: (control: Control) => React.ReactNode;
}) {
  const id = useId();
  const server = useContext(FormErrors)[name];
  const error = local || server;
  const [showHelp, setShowHelp] = useState(false);
  const described = [help && showHelp && `${id}-help`, error && `${id}-error`].filter(Boolean);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <label htmlFor={id} className="flex min-h-11 flex-1 items-center text-sm font-medium">
          {label}
        </label>
        {help && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -mr-2 flex size-11 items-center justify-center rounded-lg outline-none focus-visible:ring-3"
            aria-label={`About ${label}`}
            aria-expanded={showHelp}
            onClick={() => setShowHelp((s) => !s)}
          >
            <InfoIcon className="size-4" />
          </button>
        )}
      </div>
      {help && showHelp && (
        <p id={`${id}-help`} className="bg-muted rounded-md px-3 py-2 text-sm">
          {fieldHelp[help]}
        </p>
      )}
      {children({
        id,
        name,
        "aria-invalid": !!error,
        "aria-describedby": described.join(" ") || undefined,
      })}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

/** A text field (names, phone, money as text, days). Dates and months: `date-fields.tsx`. */
export function TextField({
  label,
  name,
  help,
  className,
  ...input
}: { label: string; name: string; help?: HelpField } & React.ComponentProps<"input">) {
  const initial = useContext(FormInitial)[name];
  return (
    <Field label={label} name={name} help={help}>
      {(control) => (
        <input
          defaultValue={input.value === undefined ? initial : undefined}
          {...input}
          {...control}
          className={cn(inputClass, className)}
        />
      )}
    </Field>
  );
}

/** A multi-line text box (the PDF terms, D-049). */
export function TextAreaField({
  label,
  name,
  className,
  ...input
}: { label: string; name: string } & React.ComponentProps<"textarea">) {
  return (
    <Field label={label} name={name}>
      {(control) => (
        <textarea {...input} {...control} className={cn(inputClass, "min-h-24 py-2", className)} />
      )}
    </Field>
  );
}

/** UIDD §2: money opens the numeric keypad; `money.ts` parses the text ("1,50,000.50"). */
export function MoneyField(props: React.ComponentProps<typeof TextField>) {
  return <TextField inputMode="decimal" autoComplete="off" {...props} />;
}

/** UIDD §2: quantities are integers on the numeric keypad. */
export function QtyField(props: React.ComponentProps<typeof TextField>) {
  return <TextField inputMode="numeric" pattern="[0-9]*" autoComplete="off" {...props} />;
}

const chipClass =
  "has-checked:border-primary has-checked:bg-muted flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-center text-sm";

/** One of a few options as tappable chips (radio buttons): paid by, reason, type … */
export function Choice<T extends string>({
  label,
  name,
  help,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label: string;
  name: string;
  help?: HelpField;
  options: [T, string][];
  value: T | "";
  onChange: (value: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <Field label={label} name={name} help={help}>
      {({ id, ...control }) => (
        <div
          id={id}
          role="radiogroup"
          className={cn("grid gap-2", columns === 3 ? "grid-cols-3" : "grid-cols-2")}
        >
          {options.map(([v, text]) => (
            <label key={v} className={chipClass}>
              <input
                type="radio"
                {...control}
                value={v}
                checked={value === v}
                onChange={() => onChange(v)}
                className="accent-primary"
              />
              {text}
            </label>
          ))}
        </div>
      )}
    </Field>
  );
}

/** Fields mounted or removed without a change event (paid by, a line …) → refresh the preview. */
export function Reread({ when }: { when: string }) {
  const changed = useContext(FormChanged);
  useEffect(() => changed(), [changed, when]);
  return null;
}

/** "Add at least one line" after every line was removed (Purchase, Sale). */
export function LinesError() {
  const error = useContext(FormErrors).lines;
  return error ? <p className="text-destructive text-sm">{error}</p> : null;
}
