import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonths, dhakaToday, monthOf } from "@mbl/domain/dates";
import { computeBooks } from "@mbl/domain/engine/index";
import type { Result } from "@mbl/domain/result";
import { BooksService } from "../../apps/api/src/books/books.service";
import { expectBalanced } from "../engine/invariant";
import { partnerApi } from "./api";
import { localSql } from "./local-db";
import { service } from "./services";

// CR-050 (D-073): a sole owner is one partner at 100%. The month close goes through the api as in
// close-actions.test.ts, with one partner instead of two. Synthetic data only (D-014).
const sql = localSql();
let api: Awaited<ReturnType<typeof partnerApi>>;
let userId = "";

const today = dhakaToday();
const M1 = addMonths(monthOf(today), -2);
const ids = { owner: randomUUID(), kamal: randomUUID() };

async function ok(result: Result) {
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result;
}

beforeAll(async () => {
  api = await partnerApi(sql, "Owner");
  userId = api.user.userId;
  await sql`truncate money_entries, allocations, month_closes, audit_log`;
  await sql`insert into people (id, name, kind, profit_share_pct) values
    (${ids.owner}, 'Owner', 'partner', 100)`;
  await sql`insert into people (id, name, kind) values (${ids.kamal}, 'Kamal', 'investor')`;
  const opening = `${M1}-01`;
  await sql`insert into money_entries (type, date, amount, opening_kind, person_id, created_by)
    values ('opening', ${opening}, '2000000.00', 'cash', null, ${userId}),
           ('opening', ${opening}, '1000000.00', 'capital', ${ids.kamal}, ${userId}),
           ('opening', ${opening}, '1000000.00', 'capital', ${ids.owner}, ${userId})`;
  await sql`insert into money_entries (type, date, amount, source, created_by)
    values ('cashback', ${`${M1}-10`}, '100000.00', 'cash', ${userId})`; // Profit(M1) 100,000
});

afterAll(async () => {
  await sql`truncate money_entries, allocations, month_closes, audit_log`;
  await sql`delete from people`;
  await api.close();
  await sql.end();
});

describe("CR-050 a sole owner through the api", () => {
  it("I-CR-050.1 profit 100,000, Kamal 2% → Kamal 20,000, the owner 80,000; audited; books balance", async () => {
    const input = {
      id: randomUUID(),
      month: M1,
      "allocations.0.personId": ids.kamal,
      "allocations.0.kind": "cash",
      "allocations.0.basis": "1000000.00",
      "allocations.0.ratePct": "2",
      "allocations.0.amount": "20000.00",
    };
    const closed = await ok(await api.closeMonth(input));

    const rows = await sql`select person_id, kind, amount::text from allocations
      where month = ${`${M1}-01`} order by kind, person_id`;
    expect(rows).toEqual([
      { person_id: ids.kamal, kind: "cash", amount: "20000.00" },
      { person_id: ids.owner, kind: "partner", amount: "80000.00" },
    ]);
    const [audit] = await sql`select "table", row_id, action, after from audit_log`;
    expect(audit).toMatchObject({ table: "month_closes", row_id: closed.id, action: "close" });
    expect(audit.after.allocations).toHaveLength(2);

    const data = await service(api.app, BooksService).loadBooksData();
    const books = computeBooks(data, today);
    expect(books.months.find((m) => m.month === M1)).toMatchObject({
      profit: 10_000_000,
      closed: true,
    });
    expectBalanced(books.posted, today, data.allocations, data.closed);
  });
});
