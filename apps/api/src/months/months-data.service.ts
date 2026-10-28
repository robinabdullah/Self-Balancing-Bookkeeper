import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { moneyEntries, monthCloses, people, profiles } from "@mbl/db/schema";
import type { MonthProfit } from "@mbl/domain/engine/months";
import { monthOf } from "@mbl/domain/dates";
import { parse } from "@mbl/domain/money";
import { DB } from "../db/db.module";

// Ref: src/server/months.ts (N-4.6): the Months reads. The writes are months.service.ts.

@Injectable()
export class MonthsDataService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The closed months with their close dates (UIDD §4.9 "Closed on dd Mon"). */
  async loadCloses() {
    return this.db
      .select({ month: monthCloses.month, closeDate: monthCloses.closeDate })
      .from(monthCloses)
      .orderBy(asc(monthCloses.month));
  }

  /**
   * A closed month's row (task 5.2): its close date, who closed it and the stored snapshot; its id
   * and `updatedAt` for Re-open (5.4).
   */
  async loadClose(month: string) {
    const [close] = await this.db
      .select({
        id: monthCloses.id,
        updatedAt: monthCloses.updatedAt,
        closeDate: monthCloses.closeDate,
        snapshot: monthCloses.snapshot,
        by: profiles.name,
      })
      .from(monthCloses)
      .leftJoin(profiles, eq(profiles.userId, monthCloses.closedBy))
      .where(eq(monthCloses.month, `${month}-01`));
    return (
      close && {
        ...close,
        updatedAt: close.updatedAt.toISOString(),
        snapshot: close.snapshot as MonthProfit,
      }
    );
  }

  /** The stored snapshots of those months that are closed ("YYYY-MM" → Profit(M)), in one query. */
  async loadSnapshots(months: string[]): Promise<Record<string, MonthProfit>> {
    if (months.length === 0) return {};
    const rows = await this.db
      .select({ month: monthCloses.month, snapshot: monthCloses.snapshot })
      .from(monthCloses)
      .where(
        inArray(
          monthCloses.month,
          months.map((m) => `${m}-01`),
        ),
      );
    return Object.fromEntries(rows.map((r) => [monthOf(r.month), r.snapshot as MonthProfit]));
  }

  /** The re-open warning (SRS §7, task 5.4): profit paid / reinvested entries made since M's close. */
  async profitSinceClose(month: string) {
    const rows = await this.db
      .select({
        id: moneyEntries.id,
        type: moneyEntries.type,
        date: moneyEntries.date,
        person: people.name,
        amount: moneyEntries.amount,
      })
      .from(moneyEntries)
      .innerJoin(monthCloses, eq(monthCloses.month, `${month}-01`))
      .leftJoin(people, eq(people.id, moneyEntries.personId))
      .where(
        and(
          inArray(moneyEntries.type, ["profit_paid", "profit_reinvested"]),
          gt(moneyEntries.createdAt, monthCloses.createdAt),
        ),
      )
      .orderBy(asc(moneyEntries.createdAt));
    return rows.map((r) => ({ ...r, amount: parse(r.amount) as number }));
  }
}

export type CloseRow = NonNullable<Awaited<ReturnType<MonthsDataService["loadClose"]>>>;
export type PaidSince = Awaited<ReturnType<MonthsDataService["profitSinceClose"]>>;
