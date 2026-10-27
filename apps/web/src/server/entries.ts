import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  moneyEntries,
  purchaseLines,
  purchases,
  returnLines,
  returns,
  saleLines,
  sales,
} from "@/db/schema";
import { MONEY, MONTH } from "@mbl/domain/audit";
import { parse, plain } from "@mbl/domain/money";
import { rowId } from "@mbl/domain/validation/fields";
import type { EntryTable } from "@/server/actions/reverse";

// Edit opens the same form as Add (UIDD §3, §4.10): a stored entry as the form's text values,
// named as the form's fields. Purchase and sale lines come as a list (they can be added and
// removed); a return's one line is `lines.0.*` like its fields.

const SKIP = new Set(["createdAt", "updatedAt", "createdBy", "reversesId"]);

/** A stored row as text: money "18,000", months "YYYY-MM"; null columns are left out. */
function asText(row: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (SKIP.has(key) || value === null || value === undefined) continue;
    const text = String(value);
    out[prefix + key] = MONEY.has(key)
      ? plain(parse(text) as number)
      : MONTH.has(key)
        ? text.slice(0, 7)
        : text;
  }
  return out;
}

export type EditValues = {
  id: string;
  updatedAt: string;
  values: Record<string, string>;
  lines: Record<string, string>[];
};

const HEADERS = { purchase: purchases, sale: sales, return: returns, money: moneyEntries };

export async function editValues(table: EntryTable, id: string): Promise<EditValues | null> {
  if (!rowId.safeParse(id).success) return null;
  const header = HEADERS[table];
  const [row] = (await db.select().from(header).where(eq(header.id, id))) as (Record<
    string,
    unknown
  > & { updatedAt: Date })[];
  if (!row) return null;
  const base = { id, updatedAt: row.updatedAt.toISOString(), values: asText(row) };

  if (table === "purchase") {
    const lines = await db
      .select()
      .from(purchaseLines)
      .where(eq(purchaseLines.purchaseId, id))
      .orderBy(asc(purchaseLines.createdAt));
    return { ...base, lines: lines.map((l) => asText(l)) };
  }
  if (table === "sale") {
    // An edited line keeps its lot (D-004): each stored line opens with its lot chosen.
    const lines = await db
      .select({ line: saleLines, modelId: purchaseLines.modelId })
      .from(saleLines)
      .innerJoin(purchaseLines, eq(purchaseLines.id, saleLines.lotId))
      .where(eq(saleLines.saleId, id))
      .orderBy(asc(saleLines.createdAt));
    return { ...base, lines: lines.map((l) => asText({ ...l.line, modelId: l.modelId })) };
  }
  if (table === "return") {
    const [line] = await db
      .select({ line: returnLines, saleId: saleLines.saleId })
      .from(returnLines)
      .leftJoin(saleLines, eq(saleLines.id, returnLines.saleLineId))
      .where(eq(returnLines.returnId, id));
    if (!line) return { ...base, lines: [] };
    const values = { ...base.values, ...asText(line.line, "lines.0.") };
    return {
      ...base,
      values: line.saleId ? { ...values, saleId: line.saleId } : values,
      lines: [],
    };
  }
  return { ...base, lines: [] };
}
