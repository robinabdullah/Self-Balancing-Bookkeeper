import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@mbl/db";
import { loadBooks } from "@/server/books";
import type { Result } from "@mbl/domain/result";
import { CONFLICT } from "../../apps/api/src/action/runner";
import { partnerApi } from "./api";
import { localSql } from "./local-db";

// Task 4.4.2 (UIDD §4.8; SRS §6; D-020): a card bill's actual dates. N-3.2/N-3.6/N-3.7: the money
// entries, reversals and bill dates go through the api (the facade), as a signed-in partner.
// Synthetic data only.

const sql = localSql();
let api: Awaited<ReturnType<typeof partnerApi>>;
const saveBillDates = (input: unknown) => api.saveBillDates(input);
const deleteBillDates = (input: unknown) => api.deleteBillDates(input);
const reverseEntry = (input: unknown) => api.reverseEntry(input);
const saveMoneyEntry = (input: unknown) => api.saveMoneyEntry(input);
const deleteMoneyEntry = (input: unknown) => api.deleteMoneyEntry(input);
const ids = { person: randomUUID(), card: randomUUID(), fee: randomUUID() };
const asOf = "2026-10-15";

beforeAll(async () => {
  api = await partnerApi(sql, "Partner A");
  await sql`insert into people (id, name, kind, profit_share_pct)
    values (${ids.person}, 'Partner A', 'partner', 100)`;
  // EBL-style days: statement 5th, due 20th the same month.
  await sql`insert into cards (id, name, owner_person_id, statement_day, due_day)
    values (${ids.card}, 'Test Visa', ${ids.person}, 5, 20)`;
  // A ৳1,000 card fee on 10 Sep → the Oct bill, due 20 Oct.
  await sql`insert into money_entries (id, date, type, amount, card_id, category, for_month)
    values (${ids.fee}, '2026-09-10', 'card_fee', 1000.00, ${ids.card}, 'card fee/interest', '2026-09-01')`;
});

beforeEach(() => {});

afterAll(async () => {
  await sql`truncate money_entries, card_bill_dates, cards, audit_log cascade`;
  await sql`delete from people`;
  await api.close();
  await sql.end();
  await db.$client.end();
});

const octBill = async () => {
  const { books } = await loadBooks(asOf);
  expect(books.invariant.difference).toBe(0);
  const card = books.cards[ids.card];
  return { bill: card.bills.find((b) => b.month === "2026-10"), status: card.status };
};

describe("4.4 card bill dates", () => {
  it("I4.4.1 setting an actual due date moves that bill's due date and status", async () => {
    expect(await octBill()).toMatchObject({
      bill: { dueDate: "2026-10-20", dueActual: false, remaining: 100_000 },
      status: "due_within_7_days",
    });

    const id = randomUUID();
    const saved = await saveBillDates({
      id,
      cardId: ids.card,
      billMonth: "2026-10",
      actualStatementDate: "",
      actualDueDate: "2026-10-14",
    });
    expect(saved.status).toBe("ok");
    expect(await octBill()).toMatchObject({
      bill: { dueDate: "2026-10-14", dueActual: true, statementActual: false },
      status: "overdue",
    });
    const [audit] = await sql`select action from audit_log where row_id = ${id}`;
    expect(audit.action).toBe("insert");

    // Edit the same row (with the updatedAt it saw): the due date moves again.
    if (saved.status !== "ok") return;
    const edited = await saveBillDates({
      id,
      updatedAt: saved.updatedAt,
      cardId: ids.card,
      billMonth: "2026-10",
      actualStatementDate: "2026-10-04",
      actualDueDate: "2026-10-25",
    });
    expect(edited.status).toBe("ok");
    expect(await octBill()).toMatchObject({
      bill: { statementDate: "2026-10-04", dueDate: "2026-10-25", statementActual: true },
      status: "upcoming",
    });

    // A stale edit is a conflict; a second row for the same bill is refused.
    expect(
      await saveBillDates({
        id,
        updatedAt: saved.updatedAt,
        cardId: ids.card,
        billMonth: "2026-10",
        actualDueDate: "2026-10-21",
      }),
    ).toEqual({ status: "conflict", message: CONFLICT });
    const second = await saveBillDates({
      id: randomUUID(),
      cardId: ids.card,
      billMonth: "2026-10",
      actualDueDate: "2026-10-21",
    });
    expect(second.status).toBe("invalid");

    // Undo deletes the row: the bill is back on the card's usual days.
    if (edited.status !== "ok") return;
    expect((await deleteBillDates({ id, updatedAt: edited.updatedAt ?? undefined })).status).toBe(
      "ok",
    );
    expect(await octBill()).toMatchObject({
      bill: { dueDate: "2026-10-20", dueActual: false },
      status: "due_within_7_days",
    });
  });
});

const ok = (r: Result) => {
  expect(r.status).toBe("ok");
  if (r.status !== "ok") throw new Error(r.status);
  return { id: r.id, updatedAt: r.updatedAt as string };
};

describe("CR-034 a card reversal cancels its original on the bills (D-058)", () => {
  it("I-CR-034.1 reverse a card payment → its bill due again; delete the reversal → paid", async () => {
    const pay = ok(
      await saveMoneyEntry({
        id: randomUUID(),
        type: "card_payment",
        date: "2026-10-10",
        cardId: ids.card,
        amount: "1,000",
        note: "",
      }),
    );
    expect(await octBill()).toMatchObject({
      bill: { paid: 100_000, remaining: 0 },
      status: "clear",
    });

    const rev = ok(
      await reverseEntry({
        id: randomUUID(),
        table: "money",
        reversesId: pay.id,
        date: "2026-10-12",
      }),
    );
    expect(await octBill()).toMatchObject({
      bill: { amount: 100_000, paid: 0, remaining: 100_000, dueDate: "2026-10-20" },
      status: "due_within_7_days",
    });
    const { books } = await loadBooks(asOf);
    const card = books.cards[ids.card];
    expect(card).toMatchObject({ balance: 100_000, dueWithin7Days: 100_000 });
    expect(card.moves.filter((m) => m.reversed || m.reversal).map((m) => m.entryId)).toEqual([
      pay.id,
      rev.id,
    ]);

    // Deleting the reversal (open month) brings the payment back on its bill.
    ok(await deleteMoneyEntry(rev));
    expect(await octBill()).toMatchObject({
      bill: { paid: 100_000, remaining: 0 },
      status: "clear",
    });
  });
});
