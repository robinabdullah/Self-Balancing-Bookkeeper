import { parse, pct, sub } from "@/lib/money";
import { parseRate } from "@/lib/months-view";

// D-056 (UIDD §4.6): the Cash-out form's Fee %. It only fills Cash received (charged − the %,
// exact to the paisa) and is never saved; the fee line also says the fee as a % of the charge.
// Pure.

export const BAD_RATE = "Enter a % like 1.3";

/** Cash received for a fee %: charged − pct(charged, %); null until both read (`error`: a bad %). */
export function receivedAt(
  chargedText: string,
  rateText: string,
): { received: number | null; error?: string } {
  const rate = parseRate(rateText);
  if (rate == null || rate > 100) return { received: null, error: BAD_RATE };
  const charged = parse(chargedText);
  if (charged == null || charged <= 0) return { received: null };
  return { received: sub(charged, pct(charged, rate)) };
}

/** The fee as a % of the charge, half-up to at most 2 decimals ("1.3", "1.15"); display only. */
export function feePct(fee: number, charged: number): string | null {
  if (charged <= 0 || fee < 0) return null;
  const twice = BigInt(fee) * BigInt(20_000) + BigInt(charged);
  const hundredths = Number(twice / (BigInt(2) * BigInt(charged)));
  return String(hundredths / 100);
}
