"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { allocations, monthCloses, people } from "@mbl/db/schema";
import { dhakaToday, formatMonth, monthOf } from "@mbl/domain/dates";
import { toPosted } from "@mbl/domain/engine/index";
import { computeClose, monthProfit, nextToClose } from "@mbl/domain/engine/months";
import { type Errors, closeErrors } from "@mbl/domain/guards";
import { toDecimal } from "@mbl/domain/money";
import { readLine } from "@mbl/domain/months-view";
import { partnerWarning } from "@mbl/domain/setup";
import { nest, pick, rowId } from "@mbl/domain/validation/fields";
import { byId, loadCalendar, runAction } from "@/server/action";
import { loadBooksData } from "@/server/books";

// Close M (SRS §7, task 5.2; D-023, D-028): in one transaction, the checks (the next month to
// close, not a month that hasn't started, partners total 100), the investor `allocations` (lines
// with no amount are skipped), one `partner` row per partner from `computeClose`, the
// `month_closes` row with its snapshot (Profit(M) and its breakdown) and the `close` audit row.
// Profit(M) is computed here from the stored facts, never taken from the client.

const text = z.string().optional().default("");

const closeSchema = z.preprocess(
  nest,
  z
    .object({
      id: rowId,
      month: z.string().regex(/^\d{4}-\d{2}$/, { error: "Pick a month" }),
      allocations: z
        .array(
          z.object({
            personId: pick("an investor"),
            kind: z.enum(["cash", "card"]),
            basis: text,
            ratePct: text,
            amount: text,
          }),
        )
        .optional()
        .default([]),
    })
    .superRefine((v, ctx) =>
      v.allocations.forEach((line, i) => {
        for (const [field, message] of Object.entries(readLine(line).errors))
          ctx.addIssue({ code: "custom", path: ["allocations", i, field], message });
      }),
    ),
);

export async function closeMonth(input: unknown) {
  return runAction(
    {
      op: "insert",
      audit: "close",
      table: monthCloses,
      schema: closeSchema,
      guards: async ({ tx, values }) => {
        // One close at a time: the last closed month is read again under this lock.
        await tx.execute(sql`lock table month_closes in exclusive mode`);
        const calendar = await loadCalendar(tx);
        const [first] = await tx.execute<{ date: string | null }>(sql`select least(
          (select min(date) from purchases), (select min(date) from sales),
          (select min(date) from returns), (select min(date) from money_entries))::text as date`);
        const next = nextToClose(
          calendar.lastClosed ? [calendar.lastClosed] : [],
          first?.date ?? null,
          calendar.today,
        );
        const month = closeErrors(values.month, next, calendar);
        if (month.form) return month;

        const everyone = await tx.select().from(people);
        const partners = partnerWarning(everyone);
        if (partners) return { form: partners };
        const investors = new Set(everyone.filter((p) => p.kind === "investor").map((p) => p.id));
        const seen = new Set<string>();
        for (const [i, l] of values.allocations.entries()) {
          const key = `${l.personId}:${l.kind}`;
          if (!investors.has(l.personId) || seen.has(key))
            return { [`allocations.${i}.personId`]: "Pick an investor, once per cash/card line" };
          seen.add(key);
        }
        return {};
      },
      write: async (tx, v, { userId }) => {
        const data = await loadBooksData(tx);
        const today = dhakaToday();
        const posted = data.entries.map((e) => toPosted(e, data.partners));
        const profit = monthProfit(posted, v.month, today);
        const investors = v.allocations.flatMap((l) => {
          const { row } = readLine(l);
          return row ? [{ personId: l.personId, kind: l.kind, ...row }] : [];
        });
        const rows = [...investors, ...computeClose(profit, investors, data.partners)];
        const month = `${v.month}-01`;
        const stored = rows.map((r) => ({
          month,
          personId: r.personId,
          kind: r.kind,
          basis: r.basis == null ? null : toDecimal(r.basis),
          ratePct: r.ratePct == null ? null : String(r.ratePct),
          amount: toDecimal(r.amount),
          createdBy: userId,
        }));
        await tx.insert(allocations).values(stored);
        const [close] = await tx
          .insert(monthCloses)
          .values({
            id: v.id,
            month,
            closeDate: today,
            snapshot: profit,
            closedBy: userId,
            createdBy: userId,
          })
          .returning();
        return { ...close, allocations: stored };
      },
    },
    input,
  );
}

// Re-open M (SRS §7, task 5.4): only the latest closed month. Its allocations and its
// `month_closes` row (with the snapshot) are deleted; the `reopen` audit row keeps both in its
// "before". Entries are untouched: the profit paid/reinvested since the close only warns.
export async function reopenMonth(input: unknown) {
  return runAction(
    {
      op: "delete",
      audit: "reopen",
      table: monthCloses,
      schema: byId,
      before: async (tx, current) => ({
        ...current,
        allocations: await tx
          .select()
          .from(allocations)
          .where(eq(allocations.month, current.month as string)),
      }),
      guards: async ({ tx, current }): Promise<Errors> => {
        // One close or re-open at a time: the last closed month is read again under this lock.
        await tx.execute(sql`lock table month_closes in exclusive mode`);
        const latest = (await loadCalendar(tx)).lastClosed as string;
        if (latest === monthOf(current?.month as string)) return {};
        return { form: `Only the latest closed month (${formatMonth(latest)}) can be re-opened` };
      },
      write: async (tx, _v, { current }) => {
        const month = current?.month as string;
        await tx.delete(allocations).where(eq(allocations.month, month));
        await tx.delete(monthCloses).where(eq(monthCloses.month, month));
      },
    },
    input,
  );
}
