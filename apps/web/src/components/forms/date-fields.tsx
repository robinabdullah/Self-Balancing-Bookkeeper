"use client";

import { useContext, useEffect, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { autoSlash, dhakaToday, formatDmy, formatMonth, parseDmy } from "@/lib/dates";
import type { MonthChoice } from "@/lib/month-choices";
import { cn } from "@/lib/utils";
import { Field, FormChanged, FormInitial, inputClass } from "./field";
import type { HelpField } from "@/lib/help-text";

// UIDD §2 (D-035): dates are typed as dd/mm/yyyy whatever the phone's language, with a 📅 that
// opens the phone's calendar; the form still sends YYYY-MM-DD. Months are a dropdown of the
// allowed months ("Oct 2026").

export const DMY_ERROR = "Enter the date as dd/mm/yyyy";

type DateInputProps = {
  /** "YYYY-MM-DD", or "" when empty or not a date yet. */
  value: string;
  /** A full valid date, "" when cleared, or null while the text isn't a date (partial or bad). */
  onChange: (date: string | null) => void;
  /** The text isn't a date after leaving the box (or is again fine). */
  onBadChange?: (bad: boolean) => void;
  min?: string;
  max?: string;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-label"?: string;
};

/** The dd/mm/yyyy box plus the 📅: the phone's own date input, transparent over the icon. */
export function DateInput({ value, onChange, onBadChange, min, max, ...aria }: DateInputProps) {
  const [text, setText] = useState(() => formatDmy(value));
  // A new value from outside (the calendar, a reset) shows in the box; typing never resets it.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== (parseDmy(text) ?? "")) setText(formatDmy(value));
  }
  const bad = (t: string) => t !== "" && parseDmy(t) === null;

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        {...aria}
        value={text}
        suppressHydrationWarning // the server's and the phone's "today" can differ at midnight
        onChange={(e) => {
          const next = autoSlash(text, e.target.value);
          setText(next);
          if (!bad(next)) onBadChange?.(false);
          onChange(next === "" ? "" : parseDmy(next));
        }}
        onBlur={() => onBadChange?.(bad(text))}
        className={cn(inputClass, "pr-12")}
      />
      <span className="absolute inset-y-0 right-0 flex w-11 items-center justify-center overflow-hidden">
        <CalendarIcon className="text-muted-foreground size-4" aria-hidden />
        <input
          type="date"
          aria-label="Open calendar"
          value={value}
          min={min}
          max={max}
          suppressHydrationWarning
          onClick={(e) => {
            try {
              e.currentTarget.showPicker?.(); // desktop: a click on the field opens it too
            } catch {}
          }}
          onChange={(e) => {
            setText(formatDmy(e.target.value));
            onBadChange?.(false);
            onChange(e.target.value);
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </span>
    </div>
  );
}

/**
 * A form's date: defaults to today (Dhaka), or the stored value on Edit, or `defaultValue` ("" is
 * allowed). `max` is today unless given; null = no limit. The limits only bound the calendar: the
 * server checks every date.
 */
export function DateField({
  label,
  name,
  help,
  defaultValue,
  min,
  max,
}: {
  label: string;
  name: string;
  help?: HelpField;
  defaultValue?: string;
  min?: string;
  max?: string | null;
}) {
  const initial = useContext(FormInitial)[name];
  const [date, setDate] = useState(() => defaultValue ?? initial ?? dhakaToday());
  const [bad, setBad] = useState(false);
  const changed = useContext(FormChanged);
  useEffect(() => changed(), [date, changed]); // the hidden input fires no change event
  return (
    <Field label={label} name={name} help={help} error={bad ? DMY_ERROR : undefined}>
      {({ name: field, ...control }) => (
        <>
          <input type="hidden" name={field} value={date} suppressHydrationWarning />
          <DateInput
            {...control}
            value={date}
            onChange={(d) => setDate(d ?? "")}
            onBadChange={setBad}
            min={min}
            max={max === undefined ? dhakaToday() : (max ?? undefined)}
          />
        </>
      )}
    </Field>
  );
}

/**
 * A month as a dropdown of `choices` (from `month-choices.ts`, given the value to keep): closed
 * months greyed "(closed)" and not pickable; `auto` adds "Auto" (""). Controlled with `value`, or
 * keeps its own (the stored value on Edit, else `defaultValue`).
 */
export function MonthSelect({
  label,
  name,
  help,
  choices,
  auto,
  value: controlled,
  onChange,
  defaultValue = "",
  error,
}: {
  label: string;
  name: string;
  help?: HelpField;
  choices: (keep: string) => MonthChoice[];
  auto?: boolean;
  value?: string;
  onChange?: (month: string) => void;
  defaultValue?: string;
  error?: string;
}) {
  const initial = useContext(FormInitial)[name];
  const [own, setOwn] = useState(initial ?? defaultValue);
  const value = controlled ?? own;
  const list = choices(value);
  const missing = value && !list.some((c) => c.value === value); // never switch a value silently
  return (
    <Field label={label} name={name} help={help} error={error}>
      {(control) => (
        <select
          {...control}
          value={value}
          onChange={(e) => {
            setOwn(e.target.value);
            onChange?.(e.target.value);
          }}
          className={inputClass}
        >
          {auto && <option value="">Auto</option>}
          {missing && <option value={value}>{formatMonth(value)}</option>}
          {list.map((c) => (
            <option key={c.value} value={c.value} disabled={c.closed && c.value !== value}>
              {c.closed ? `${c.label} (closed)` : c.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
