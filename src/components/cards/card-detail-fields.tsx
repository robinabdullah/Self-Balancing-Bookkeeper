"use client";

import { useState } from "react";
import { TextField } from "@/components/forms/field";
import { expiredBefore, typedNumber } from "@/lib/card-secrets";
import { autoSlash, dhakaToday, formatMonth } from "@/lib/dates";

// D-067 (UIDD §4.14): the card details form formats as you type: the number in groups of four
// (saved as digits) and the expiry's "/" after MM (the numeric keypad has none). A past expiry
// warns, never blocks.

export function CardNumberField({ initial }: { initial: string }) {
  const [text, setText] = useState(() => typedNumber(initial));
  return (
    <TextField
      label="Card number"
      name="number"
      inputMode="numeric"
      autoComplete="off"
      maxLength={23}
      value={text}
      onChange={(e) => setText(typedNumber(e.target.value))}
    />
  );
}

export function ExpiryField({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const expired = expiredBefore(text, dhakaToday());
  return (
    <>
      <TextField
        label="Expiry"
        name="expiry"
        placeholder="MM/YY"
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        value={text}
        onChange={(e) => setText(autoSlash(text, e.target.value, [2, 2]))}
      />
      {expired && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
        >
          This card expired in {formatMonth(expired)}. It can still be saved.
        </p>
      )}
    </>
  );
}
