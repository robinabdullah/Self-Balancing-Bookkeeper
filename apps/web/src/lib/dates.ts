// Dates are "YYYY-MM-DD" strings (DB `date`, no time) in Asia/Dhaka; a month is "YYYY-MM"
// (SRS §3). Plain string math: no Date objects for calendar days, so no time-zone drift.

const dhakaFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" });

/** The current Dhaka date, e.g. 2026-10-06T18:30Z → "2026-10-07". */
export function dhakaToday(now: Date = new Date()): string {
  return dhakaFormat.format(now);
}

/** "2026-10-07" (or the stored 1st, "2026-10-01") → "2026-10". */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

function toIndex(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return y * 12 + (m - 1);
}

function fromIndex(index: number): string {
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** "2026-12" + 1 → "2027-01"; n may be negative. */
export function addMonths(month: string, n: number): string {
  return fromIndex(toIndex(month) + n);
}

/** Months from `a` to `b` (b − a): the sign compares them. */
export function monthDiff(a: string, b: string): number {
  return toIndex(b) - toIndex(a);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The date in `month` with `day`, clamped to the month end: ("2026-02", 31) → "2026-02-28". */
export function clampDay(month: string, day: number): string {
  const d = Math.min(day, daysInMonth(month));
  return `${month}-${String(d).padStart(2, "0")}`;
}

/**
 * Future dates are rejected (SRS §3). `today` is explicit (callers pass `dhakaToday()`; the
 * engine passes `asOf`). ISO strings compare lexicographically.
 */
export function isFuture(date: string, today: string): boolean {
  return date > today;
}

/** "2026-10-06" + 7 → "2026-10-13"; n may be negative. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Days from `a` to `b` (b − a): "2026-10-07" → "2026-10-14" = 7; negative when b is earlier. */
export function daysBetween(a: string, b: string): number {
  const utc = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** UIDD §2: "2026-10" (or "2026-10-01") → "Oct 2026". */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** UIDD §2: "2026-10-06" → "06 Oct 2026". */
export function formatDate(date: string): string {
  return `${date.slice(8, 10)} ${formatMonth(date)}`;
}

/** UIDD §2 (D-035): a typed "05/10/2026" or "5/10/2026" → "2026-10-05"; anything else → null. */
export function parseDmy(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), m[3]];
  if (month < 1 || month > 12) return null;
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  if (day < 1 || day > daysInMonth(ym)) return null;
  return `${ym}-${String(day).padStart(2, "0")}`;
}

/** "2026-10-05" → "05/10/2026"; "" stays "". */
export function formatDmy(date: string): string {
  return date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : "";
}

/**
 * The dd/mm/yyyy box as it's typed: digits and slashes only, a day or month past 2 digits spills
 * into the next part, the year stops at 4 digits, and a "/" is added after a 2-digit day or month
 * while typing forward (never while deleting). D-067: a card's MM/YY expiry passes `[2, 2]`.
 */
export function autoSlash(prev: string, next: string, sizes = [2, 2, 4]): string {
  const typed = next.replace(/[^\d/]/g, "").replace(/\/{2,}/g, "/");
  if (next.length < prev.length) return typed;
  const parts = typed.split("/");
  const fields: string[] = [];
  let carry = "";
  for (let i = 0; fields.length < sizes.length && (i < parts.length || carry); i++) {
    const part = carry + (parts[i] ?? "");
    const size = sizes[fields.length];
    fields.push(part.slice(0, size));
    carry = fields.length < sizes.length ? part.slice(size) : "";
  }
  const last = fields[fields.length - 1];
  return (
    fields.join("/") +
    (fields.length < sizes.length && last.length === sizes[fields.length - 1] ? "/" : "")
  );
}

const dhakaTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** UIDD §5 "(by Sumon, 10:42)": a saved-at time in Dhaka, with the date when not today. */
export function formatStamp(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const time = dhakaTime.format(at);
  const day = dhakaToday(at);
  return day === dhakaToday(now) ? time : `${formatDate(day)}, ${time}`;
}

const dhakaClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Dhaka",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * D-040: when an entry was saved, for a message: "10 Oct 2026, 3:45 PM" (Asia/Dhaka, never the
 * server's clock). An entry dated another day than it was saved (back-dated) shows its date only.
 */
export function formatSaved(createdAt: string, date: string): string {
  const at = new Date(createdAt);
  if (dhakaToday(at) !== date) return formatDate(date);
  return `${formatDate(date)}, ${dhakaClock.format(at).replace(/\s/g, " ")}`;
}

/** D-040: "01 Oct – 31 Oct 2026"; across years "01 Dec 2025 – 31 Jan 2026". */
export function formatRange(from: string, to: string): string {
  const start = from.slice(0, 4) === to.slice(0, 4) ? formatDate(from).slice(0, 6) : formatDate(from);
  return `${start} – ${formatDate(to)}`;
}
