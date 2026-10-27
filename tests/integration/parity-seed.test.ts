import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { computeBooks } from "@mbl/domain/engine/index";
import { parse } from "@mbl/domain/money";
import { loadBooksData } from "@/server/books";
import { PARITY_TODAY } from "../../scripts/parity/config";
import { ids, seedParity } from "../../scripts/parity/seed";
import { expectBalanced } from "../engine/invariant";
import { localSql } from "./local-db";

// N-1.1 (D-068): the parity harness's fictional book loads through the one loader and balances,
// so the dumps both builds make are of a valid set of books. Fictional data only (D-069).
const sql = localSql();
const tk = (taka: string) => parse(taka) as number;

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

describe("Parity seed (N-1.1)", () => {
  it("I-N-1.1.1 the parity book loads, balances and has the hand-checked totals", async () => {
    const seeded = await seedParity(sql);
    const data = await loadBooksData();
    expect(data.entries.map((e) => e.id)).toEqual(seeded.entries.map((e) => e.id));
    expect(data.closed).toEqual(["2026-08-01"]);

    const books = computeBooks(data, PARITY_TODAY);
    expect(books.invariant.difference).toBe(0);
    expectBalanced(books.posted, PARITY_TODAY, data.allocations, data.closed);

    // Cash: 2,00,000 − 1,80,000 + 60,000 − 15,000 + 29,400 − 50,000 + 5,00,000 − 40,000
    //   − 89,000 + 30,000 − 30,000 + 30,000 − 10,000 + 300 − 5,000 − 8,000 + 50,000.
    expect(books.cash).toBe(tk("472700"));
    // Rahman: 1,64,000 − 60,000 + 2,000 + 1,06,500 − 14,000 + 34,000 − 500 − 50,000.
    expect(books.customers[ids.rahman].balance).toBe(tk("182000"));
    // Star: 52,500 − 17,500 − 30,000 + 30,000 − 30,000 + 79,000 + 5,000 + 1,000 (correction).
    expect(books.customers[ids.star].balance).toBe(tk("90000"));
    // Alpha: 1,20,000 credit − 50,000 − 15,000 returned − 20,000 by card.
    expect(books.suppliers[ids.alpha].balance).toBe(tk("35000"));
    // EBL Visa: 1,44,000 − 40,000 + 1,200 + 20,000; City Amex: 30,000 + 500.
    expect(books.cards[ids.visa].balance).toBe(tk("125200"));
    expect(books.cards[ids.amex].balance).toBe(tk("30500"));
  });

  it("I-N-1.1.2 a second seed gives the same rows (fixed ids and stamps)", async () => {
    const dump = () => sql`
      select id, created_at from money_entries union all select id, created_at from sales
      union all select id, created_at from purchases order by id`;
    await seedParity(sql);
    const first = await dump();
    await seedParity(sql);
    expect(await dump()).toEqual(first);
  });
});
