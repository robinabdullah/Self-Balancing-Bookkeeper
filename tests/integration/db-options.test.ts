import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, moneyEntries, people } from "@/db/schema";
import { parse } from "@/lib/money";
import { localSql } from "./local-db";

// I-CR-013.3 (D-032): the app's DB client keeps its connections (no 30–60 min recycling) and skips
// the type lookup on each new connection. Values still round-trip as before: money as numeric
// text, dates as YYYY-MM-DD, audit jsonb, timestamps for the "changed by someone else" check.
// Synthetic data only (D-014).
const sql = localSql();
afterAll(() => sql.end());

describe("I-CR-013.3 DB client options", () => {
  it("is set up without timed reconnects or the type lookup", () => {
    const options = (db.$client as unknown as { options: Record<string, unknown> }).options;
    expect(options.max_lifetime).toBeNull();
    expect(options.fetch_types).toBe(false);
    expect(options.prepare).toBe(false);
  });

  it("numeric, date, jsonb and timestamptz round-trip", async () => {
    const personId = randomUUID();
    const entryId = randomUUID();
    await db.insert(people).values({ id: personId, name: "Investor R", kind: "investor" });
    await db.insert(moneyEntries).values({
      id: entryId,
      type: "capital_in",
      date: "2026-10-05",
      amount: "1744480.50",
      personId,
    });
    const [row] = await db.select().from(moneyEntries).where(eq(moneyEntries.id, entryId));
    expect(row.amount).toBe("1744480.50");
    expect(parse(row.amount)).toBe(174_448_050);
    expect(row.date).toBe("2026-10-05");
    expect(row.updatedAt).toBeInstanceOf(Date);

    const before = { amount: "1744480.50", nested: { note: "ok", n: 1 } };
    const [audit] = await db
      .insert(auditLog)
      .values({
        action: "update",
        table: "money_entries",
        rowId: entryId,
        before,
        after: null,
        userId: randomUUID(),
      })
      .returning();
    expect(audit.before).toEqual(before);
  });
});
