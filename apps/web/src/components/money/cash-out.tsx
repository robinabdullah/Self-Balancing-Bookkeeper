"use client";

import { useContext, useState } from "react";
import { FormInitial, MoneyField, Reread, inputClass } from "@/components/forms/field";
import { FormValues } from "@/components/forms/form-body";
import { feePct, receivedAt } from "@/lib/cash-out";
import { format, parse, plain, sub } from "@/lib/money";

// UIDD §4.6, D-056: Charged to card, an optional Fee % that fills Cash received (never saved),
// Cash received (typing in it clears the %), and the fee between them (a business expense).

export function CashOut() {
  const values = useContext(FormValues);
  const [typed, setTyped] = useState(useContext(FormInitial).cashReceived ?? "");
  const [rate, setRate] = useState("");
  const charged = String(values?.cardCharged ?? "");
  const fill = rate.trim() ? receivedAt(charged, rate) : null;
  const shown = fill && fill.received != null ? plain(fill.received) : typed;

  const c = parse(charged);
  const r = parse(shown);
  const fee = c !== null && r !== null && r <= c ? sub(c, r) : null;
  const ofCharge = fee !== null && c !== null ? feePct(fee, c) : null;

  return (
    <>
      <Reread when={shown} />
      <MoneyField label="Charged to card" name="cardCharged" help="card_cash_out_amounts" />
      <div className="flex flex-col gap-1">
        <label htmlFor="fee-pct" className="flex min-h-11 items-center text-sm font-medium">
          Fee % (optional)
        </label>
        <div className="relative">
          <input
            id="fee-pct"
            inputMode="decimal"
            autoComplete="off"
            value={rate}
            onChange={(e) => {
              // Clearing the % keeps the amount it filled.
              if (!e.target.value.trim()) setTyped(shown);
              setRate(e.target.value);
            }}
            aria-invalid={!!fill?.error}
            aria-describedby="fee-pct-hint"
            className={`${inputClass} pr-8`}
          />
          <span
            aria-hidden
            className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2"
          >
            %
          </span>
        </div>
        <p
          id="fee-pct-hint"
          className={fill?.error ? "text-destructive text-sm" : "text-muted-foreground text-sm"}
        >
          {fill?.error ?? "Type the agent's fee % and Cash received fills in."}
        </p>
      </div>
      <MoneyField
        label="Cash received"
        name="cashReceived"
        value={shown}
        onChange={(e) => {
          setTyped(e.target.value);
          setRate("");
        }}
      />
      {fee !== null && (
        <p className="text-muted-foreground text-sm">
          Fee (business expense): {format(fee)}
          {ofCharge && c !== null && ` · ${ofCharge}% of ${format(c)}`}
        </p>
      )}
    </>
  );
}
