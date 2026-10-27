import "server-only";
import { eq, max, min } from "drizzle-orm";
import { db } from "@mbl/db";
import { monthCloses, moneyEntries, purchases } from "@mbl/db/schema";
import { dhakaToday, monthOf } from "@mbl/domain/dates";
import type { Calendar } from "@mbl/domain/guards";
import type { Result } from "@mbl/domain/result";

// The one write path (SRS §2.3, §3; D-010) is the api's runner now (apps/api/src/action/runner.ts;
// N-3.8 moved its last caller). What is left here serves web's reads until they move in N-4: the
// calendar the money forms check dates against, and the types.

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type { Result };

/** Today (Dhaka), the opening date (the opening items' date) and the last closed month. */
export async function loadCalendar(tx: Tx | typeof db = db): Promise<Calendar> {
  // Side by side: one round trip, not three (D-032).
  const [[money], [stock], [close]] = await Promise.all([
    tx
      .select({ date: min(moneyEntries.date) })
      .from(moneyEntries)
      .where(eq(moneyEntries.type, "opening")),
    tx
      .select({ date: min(purchases.date) })
      .from(purchases)
      .where(eq(purchases.source, "opening")),
    tx.select({ month: max(monthCloses.month) }).from(monthCloses),
  ]);
  const dates = [money?.date, stock?.date].filter((d): d is string => !!d).sort();
  return {
    today: dhakaToday(),
    openingDate: dates[0] ?? null,
    lastClosed: close?.month ? monthOf(close.month) : null,
  };
}
