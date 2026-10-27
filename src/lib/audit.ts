// The Journal's History tab (UIDD §4.10): which fields an edit changed, old → new, from an audit
// row's before/after (the stored rows, lines included). Pure; names come from the Setup lists.
import { formatDate, formatMonth } from "@/lib/dates";
import { format, parse } from "@/lib/money";

export type Change = { field: string; from: string; to: string };

type Stored = Record<string, unknown>;

const SKIP = new Set(["id", "createdAt", "updatedAt", "createdBy", "reversesId"]);
/** The stored money and month columns (shared with the edit values, `server/entries.ts`). */
export const MONEY = new Set([
  "amount",
  "cardCharged",
  "cashReceived",
  "unitCost",
  "unitPrice",
  "unitAmount",
]);
export const MONTH = new Set(["forMonth", "billMonthOverride"]);

/** "unitCost" → "Unit cost", "customerId" → "Customer". */
const fieldName = (key: string) => {
  const words = key
    .replace(/Id$/, "")
    .replace(/([A-Z])/g, " $1")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function show(key: string, value: unknown, names: Record<string, string>): string {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value);
  if (MONEY.has(key)) return format(parse(text) ?? 0);
  if (MONTH.has(key)) return formatMonth(text);
  if (key === "date") return formatDate(text);
  return names[text] ?? text;
}

/** A line as "2 × Model V @ ৳18,000". */
function line(l: Stored, names: Record<string, string>): string {
  const price = l.unitCost ?? l.unitPrice ?? l.unitAmount;
  const model = l.modelId ? `${names[String(l.modelId)] ?? "?"} ` : "";
  return `${l.qty} × ${model}@ ${format(parse(String(price)) ?? 0)}`;
}

/** The fields that differ between `before` and `after` (an edit); none for an add or delete. */
export function auditChanges(
  before: Stored | null,
  after: Stored | null,
  names: Record<string, string> = {},
): Change[] {
  if (!before || !after) return [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.flatMap((key) => {
    if (SKIP.has(key)) return [];
    const [from, to] = [before[key], after[key]].map((v) =>
      key === "lines" && Array.isArray(v)
        ? (v as Stored[]).map((l) => line(l, names)).join(", ")
        : show(key, v, names),
    );
    return from === to ? [] : [{ field: fieldName(key), from, to }];
  });
}
