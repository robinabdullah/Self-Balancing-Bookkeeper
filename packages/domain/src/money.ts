// Money is integer poisha (SRS §3). This file is the only place that converts to/from text,
// and the only place that rounds (half-up, in pct/splitShares/splitEven/avgUnit; half away from
// zero in the display-only compact/avgTaka, D-064).

function assertPoisha(...values: number[]) {
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new Error(`Not integer poisha: ${v}`);
  }
}

/** "1,00,000" → 10,000,000 poisha. Returns null for bad input or more than 2 decimals. */
export function parse(text: string): number | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim().replaceAll(",", ""));
  if (!match) return null;
  const [, minus, taka, paisa = ""] = match;
  const poisha = Number(taka + paisa.padEnd(2, "0"));
  if (!Number.isSafeInteger(poisha)) return null;
  return minus ? 0 - poisha : poisha; // 0 - x, not -x: no -0
}

/** ৳ + Indian grouping; decimals only when non-zero (UIDD §2, D-015): ৳75,12,345, ৳17,444.80. */
export function format(poisha: number): string {
  assertPoisha(poisha);
  const abs = Math.abs(poisha);
  const taka = String(Math.floor(abs / 100));
  const paisa = abs % 100;
  const last3 = taka.slice(-3);
  const rest = taka.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ",");
  const grouped = rest ? `${rest},${last3}` : last3;
  return `${poisha < 0 ? "-" : ""}৳${grouped}${paisa ? `.${String(paisa).padStart(2, "0")}` : ""}`;
}

/** Money as a form input shows it: 1,800,000 → "18,000"; −50,000 → "-500". */
export function plain(poisha: number): string {
  return format(poisha).replace("৳", "");
}

/** 1,744,480 → "17444.80": the DB `numeric(14,2)` text. (`parse` reads it back.) */
export function toDecimal(poisha: number): string {
  assertPoisha(poisha);
  const abs = Math.abs(poisha);
  const paisa = String(abs % 100).padStart(2, "0");
  return `${poisha < 0 ? "-" : ""}${Math.floor(abs / 100)}.${paisa}`;
}

export function add(a: number, b: number): number {
  assertPoisha(a, b);
  return a + b;
}

export function sub(a: number, b: number): number {
  assertPoisha(a, b);
  return a - b;
}

/** unit cost × qty (qty is an integer). */
export function mul(poisha: number, qty: number): number {
  assertPoisha(poisha, qty);
  const result = poisha * qty;
  assertPoisha(result);
  return result;
}

/** A rate like 1.125 (%) as integer thousandths of a percent: ≥ 0, ≤ 3 decimals (numeric(6,3)). */
function rateMilli(ratePct: number): bigint {
  const milli = Math.round(ratePct * 1000);
  if (milli < 0 || Math.abs(ratePct * 1000 - milli) > 1e-6) throw new Error(`Bad rate: ${ratePct}`);
  return BigInt(milli);
}

/** basis × ratePct%, rounded half-up (half away from zero for a negative basis). */
export function pct(basis: number, ratePct: number): number {
  assertPoisha(basis);
  const scaled = BigInt(Math.abs(basis)) * rateMilli(ratePct); // poisha × 100,000
  const rounded = Number((scaled + BigInt(50_000)) / BigInt(100_000));
  return basis < 0 ? 0 - rounded : rounded; // 0 - x, not -x: no -0
}

/** Each share = pct(|total|) with the sign applied; the first partner takes the residual. */
export function splitShares(total: number, pcts: number[]): number[] {
  assertPoisha(total);
  const others = pcts.slice(1).map((p) => pct(total, p)); // pct applies the sign to |total|
  return [total - others.reduce((a, b) => a + b, 0), ...others];
}

/** EMI: n equal parts, the remainder in the last. */
export function splitEven(total: number, n: number): number[] {
  assertPoisha(total);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Bad part count: ${n}`);
  const part = (total - (total % n)) / n; // exact integer division
  return [...Array<number>(n - 1).fill(part), total - part * (n - 1)];
}

/** D-056: a display-only average price, total ÷ pieces rounded half-up to whole taka; null when
 * there is nothing to average (pieces ≤ 0 or a negative total). */
export function avgUnit(total: number, pieces: number): number | null {
  assertPoisha(total, pieces);
  if (pieces <= 0 || total < 0) return null;
  const taka = (BigInt(total) + BigInt(50 * pieces)) / BigInt(100 * pieces); // half-up
  return Number(taka) * 100;
}

/** Poisha per unit for `compact`: taka, thousand, lakh, crore. */
const UNITS: [bigint, string][] = [
  [BigInt(100), ""],
  [BigInt(100_000), "K"],
  [BigInt(10_000_000), " L"],
  [BigInt(1_000_000_000), " Cr"],
];

const [ZERO, TWO, TEN] = [BigInt(0), BigInt(2), BigInt(10)];

/** a ÷ d rounded half-up (a, d ≥ 0). */
const roundDiv = (a: bigint, d: bigint) => (TWO * a + d) / (TWO * d);

/** D-064: a chart axis amount: ৳1.2 Cr, ৳4.6 L, ৳45K, ৳850. One decimal under 10 units, rounded
 * half away from zero; a value that rounds to the next unit moves up (৳99.96 L → ৳1 Cr). */
export function compact(poisha: number): string {
  assertPoisha(poisha);
  const abs = BigInt(Math.abs(poisha));
  let i = 0;
  while (i + 1 < UNITS.length && abs >= UNITS[i + 1][0]) i++;
  for (; ; i++) {
    const [unit, suffix] = UNITS[i];
    const whole = roundDiv(abs, unit);
    const next = UNITS[i + 1]?.[0];
    if (next && whole * unit >= next) continue; // rounds up to the next unit
    const tenths = roundDiv(abs * TEN, unit);
    const decimal = i > 0 && tenths < TEN * TEN && tenths % TEN !== ZERO; // under 10 units
    const body = decimal ? `${tenths / TEN}.${tenths % TEN}` : `${whole}`;
    return `${poisha < 0 && whole > ZERO ? "-" : ""}৳${body}${suffix}`;
  }
}

/** D-064: a display-only average, total ÷ n to whole taka, rounded half away from zero (so a
 * credit rounds the same as a due); null when n ≤ 0. */
export function avgTaka(total: number, n: number): number | null {
  assertPoisha(total, n);
  if (n <= 0) return null;
  const taka = Number(roundDiv(BigInt(Math.abs(total)), BigInt(100 * n)));
  return total < 0 ? 0 - taka * 100 : taka * 100; // 0 - x, not -x: no -0
}
