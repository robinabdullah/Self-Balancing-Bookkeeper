import { describe, expect, it } from "vitest";
import { entryLabel, entryLabels, otherSide } from "@mbl/domain/journal/labels";
import { quickActions } from "@/components/shell/nav";
import { type Card, cardSummaries } from "@mbl/domain/engine/cards";
import { type BooksData, computeBooks } from "@mbl/domain/engine/index";
import { type MoneyEntry, postEntry } from "@mbl/domain/engine/post";
import { dayBefore, investorReport } from "@mbl/domain/investor-report";
import { format } from "@mbl/domain/money";
import { investorLines } from "@mbl/domain/months-view";
import { cleanPrefill } from "@mbl/domain/prefill";
import { entryConfirm } from "@mbl/domain/confirms";
import { investorSheets } from "@mbl/domain/report-sheets";
import { investorText } from "@mbl/domain/report-text";
import { moneyEntrySchema } from "@mbl/domain/validation/money-entry";
import type { JournalRow } from "../../apps/api/src/journal/journal.service";
import type { SetupData } from "../../apps/api/src/setup/setup-data.service";
import { CARD, SUMON, ARIF, NADIM, TODAY, data, person, setupCards } from "./report-fixture";
import { PARTNERS, expectBalanced, imbalance, posted } from "./invariant";

// CR-035 (D-060; SRS §5, §6.3; UIDD §4.6, §4.8, §4.17, §5): a Capital out paid by card, a
// person's personal spending the business pays with the card's bill. Card +A, capital −A; no
// cash, no profit. Synthetic ids and amounts only (D-014).

const A = 220_690; // ৳2,206.90
const CITY: Card = { id: "card-city", statementDay: 27, dueDay: 12 };
const money = (m: Omit<MoneyEntry, "table">): MoneyEntry => ({ table: "money", ...m });
const byCard = (date: string, more: Partial<MoneyEntry> = {}) =>
  money({
    type: "capital_out",
    date,
    amount: A,
    personId: SUMON,
    source: "card",
    cardId: CITY.id,
    ...more,
  });

describe("U-CR-035.1 postEntry: capital out by card", () => {
  it("card +A, the person's capital −A; no cash, no profit", () => {
    expect(postEntry(byCard("2026-10-27"))).toEqual([
      { account: "card", amount: A, id: CITY.id },
      { account: "capital", amount: -A, id: SUMON },
    ]);
  });

  it("a stored null source (every capital out before D-060) still moves cash", () => {
    const old = money({ type: "capital_out", date: "2026-10-07", amount: A, personId: SUMON });
    const cash = [
      { account: "cash", amount: -A },
      { account: "capital", amount: -A, id: SUMON },
    ];
    expect(postEntry(old)).toEqual(cash);
    expect(postEntry({ ...old, source: null })).toEqual(cash);
    expect(postEntry({ ...old, source: "cash", cardId: null })).toEqual(cash);
  });

  it("needs the card when paid by card", () => {
    expect(() => postEntry(byCard("2026-10-27", { cardId: null }))).toThrow(/card/);
  });

  it("its reversal negates it; each row balances (books-balance invariant)", () => {
    const entry = byCard("2026-10-27");
    expect(postEntry({ ...entry, reversesId: "orig-1" })).toEqual([
      { account: "card", amount: -A, id: CITY.id },
      { account: "capital", amount: A, id: SUMON },
    ]);
    expect(imbalance(postEntry(entry))).toBe(0);
    const original = posted(entry);
    expectBalanced([original, posted({ ...entry, date: "2026-10-28", reversesId: original.id })]);
  });
});

describe("U-CR-035.2 validation: Paid by on Capital out only", () => {
  const ID = "00000000-0000-4000-8000-000000000001";
  const PERSON = "00000000-0000-4000-8000-000000000002";
  const CARD_ID = "00000000-0000-4000-8000-000000000003";
  const base = { id: ID, date: "2026-10-15", note: "", personId: PERSON, amount: "2,206.90" };
  const parse = (v: Record<string, unknown>) => moneyEntrySchema.safeParse(v);

  it("Card needs a card ('Pick a card')", () => {
    const r = parse({ ...base, type: "capital_out", source: "card" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["cardId", "Pick a card"],
    ]);
  });

  it("Card keeps the card; Cash clears it", () => {
    expect(
      moneyEntrySchema.parse({ ...base, type: "capital_out", source: "card", cardId: CARD_ID }),
    ).toMatchObject({ source: "card", cardId: CARD_ID, amount: A });
    expect(
      moneyEntrySchema.parse({ ...base, type: "capital_out", source: "cash", cardId: CARD_ID }),
    ).toMatchObject({ source: "cash", cardId: null });
  });

  it("no source → cash", () => {
    expect(moneyEntrySchema.parse({ ...base, type: "capital_out" })).toMatchObject({
      source: "cash",
      cardId: null,
    });
  });

  it("capital in takes no source or card", () => {
    const v = moneyEntrySchema.parse({
      ...base,
      type: "capital_in",
      source: "card",
      cardId: CARD_ID,
    });
    expect(v).not.toHaveProperty("source");
    expect(v).not.toHaveProperty("cardId");
  });
});

describe("U-CR-035.3 card bills: billed like any card charge (SRS §6.3)", () => {
  const city = (entries: ReturnType<typeof posted>[], asOf: string) =>
    cardSummaries(entries, [CITY], [], asOf)[CITY.id];

  it("in the bill of its date; on the statement day → that bill; in Charges", () => {
    const onStatement = posted(byCard("2026-10-27"));
    const dayAfter = posted(byCard("2026-10-28"));
    const s = city([onStatement, dayAfter], "2026-11-15");
    expect(s.bills.map((b) => [b.month, b.amount])).toEqual([
      ["2026-10", A],
      ["2026-11", A],
    ]);
    expect(s.balance).toBe(2 * A);
    expect(s.remainingEmi).toBe(0);
  });

  it("paid / remaining: a card payment pays it", () => {
    const charge = posted(byCard("2026-10-27"));
    const pay = posted(
      money({ type: "card_payment", date: "2026-11-05", cardId: CITY.id, amount: A }),
    );
    const [bill] = city([charge, pay], "2026-11-15").bills;
    expect([bill.amount, bill.paid, bill.remaining]).toEqual([A, A, 0]);
    expectBalanced([charge, pay]);
  });

  it("a reversal drops the pair off the bills (D-058); the balance nets to 0", () => {
    const original = posted(byCard("2026-10-27"));
    const reversal = posted({ ...byCard("2026-10-28"), reversesId: original.id });
    const s = city([original, reversal], "2026-11-15");
    expect(s.bills).toEqual([]);
    expect(s.balance).toBe(0);
  });
});

// The confirm sheet's lines (UIDD §5): Sumon's personal spend on Arif's card; an investor's.
const confirmCtx = {
  names: {
    [CITY.id]: "Arif · City Amex",
    [SUMON]: "Sumon",
    [ARIF]: "Arif",
    [NADIM]: "Nadim",
  },
  cards: [{ ...CITY, owner: "Arif", ownerPersonId: ARIF }],
  people: [
    { id: ARIF, name: "Arif", kind: "partner" },
    { id: SUMON, name: "Sumon", kind: "partner" },
    { id: NADIM, name: "Nadim", kind: "investor" },
  ],
  billDates: [],
  owed: {},
  partners: [],
};

describe("U-CR-035.4 the confirm before saving a capital out by card", () => {
  it("another person's card: a sentence, the figures, and where it shows", () => {
    expect(entryConfirm(byCard("2026-10-27"), confirmCtx)).toEqual({
      title: "Sumon's personal spend",
      lead: "The business pays this with Arif · City Amex's bill. It comes off Sumon's capital; it isn't a business cost.",
      rows: [
        { label: "Arif · City Amex", sub: "Oct 2026 bill", value: `+${format(A)}` },
        { label: "Sumon's capital", value: format(-A) },
        { label: "Cash and profit", value: "no change" },
      ],
      notes: [`Shows on Arif's card statement as "Capital out · Sumon".`],
    });
  });

  it("the person's own card: no notes; the bill follows the date", () => {
    const sheet = entryConfirm(byCard("2026-10-28", { personId: ARIF }), confirmCtx);
    expect(sheet?.title).toBe("Arif's personal spend");
    expect(sheet?.rows[0]).toEqual({
      label: "Arif · City Amex",
      sub: "Nov 2026 bill",
      value: `+${format(A)}`,
    });
    expect(sheet?.rows[1]).toEqual({ label: "Arif's capital", value: format(-A) });
    expect(sheet?.notes).toEqual([]);
  });

  it("an investor: also notes the lower cash basis at the close", () => {
    const sheet = entryConfirm(byCard("2026-10-27", { personId: NADIM }), confirmCtx);
    expect(sheet?.notes).toEqual([
      `Shows on Arif's card statement as "Capital out · Nadim".`,
      "It lowers Nadim's cash basis at the month's close.",
    ]);
  });

  it("no confirm for cash, another type, or an incomplete entry", () => {
    const cash = money({ type: "capital_out", date: "2026-10-27", amount: A, personId: SUMON });
    expect(entryConfirm({ ...cash, source: "cash" }, confirmCtx)).toBeNull();
    expect(entryConfirm(cash, confirmCtx)).toBeNull();
    expect(entryConfirm({ ...byCard("2026-10-27"), type: "expense" }, confirmCtx)).toBeNull();
    expect(entryConfirm(byCard("2026-10-27", { cardId: "unknown" }), confirmCtx)).toBeNull();
    expect(entryConfirm(null, confirmCtx)).toBeNull();
  });
});

describe("U-CR-035.5 the card page's Personal spend link and its prefill", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const [CARD_ID, PERSON] = [id(1), id(2)];
  const setup = {
    customers: [],
    suppliers: [],
    cards: [{ id: CARD_ID, active: true }],
    people: [{ id: PERSON, active: true }],
  } as unknown as SetupData;

  it("⋯ More → New entry lists Personal spend after Card fee and Purchase", () => {
    const g = quickActions("card", { id: CARD_ID, active: true }, `/cards/${CARD_ID}`);
    expect(g.more.newEntry.map((a) => a.label)).toEqual(["Card fee", "Purchase", "Personal spend"]);
    const link = new URL(g.more.newEntry[2].href, "http://x");
    expect(link.pathname).toBe("/money/new");
    expect(Object.fromEntries(link.searchParams)).toEqual({
      type: "capital_out",
      cardId: CARD_ID,
      from: `/cards/${CARD_ID}`,
    });
  });

  it("an inactive card has no Personal spend", () => {
    expect(quickActions("card", { id: CARD_ID, active: false }, "/c").more.newEntry).toEqual([]);
  });

  it("the form opens with the card and Paid by Card picked; the person stays to pick", () => {
    expect(cleanPrefill("capital_out", { cardId: CARD_ID, from: "/cards/x" }, setup)).toEqual({
      prefill: { cardId: CARD_ID, source: "card" },
      from: "/cards/x",
    });
    expect(cleanPrefill("capital_in", { cardId: CARD_ID }, setup).prefill).toEqual({});
  });
});

describe("U-CR-035.6 labels name the other side", () => {
  const row = (id: string, more: Partial<JournalRow>): JournalRow =>
    ({
      id,
      table: "money",
      type: "capital_out",
      detail: "card",
      docNo: null,
      reversesId: null,
      cardId: CITY.id,
      personId: SUMON,
      ...more,
    }) as JournalRow;
  const spend = row("spend", {});
  const undo = row("undo", { reversesId: "spend" });
  const cash = row("cash", { detail: null, cardId: null });
  const journal = [spend, undo, cash];
  const names = confirmCtx.names;

  it("Journal: 'Capital out · Card'; a cash capital out is unchanged", () => {
    expect(entryLabel(spend)).toBe("Capital out · Card");
    expect(entryLabel(cash)).toBe("Capital out");
    expect(entryLabel(row("old", { detail: "cash" }))).toBe("Capital out");
  });

  it("a card's statement names the person; a person's statement names the card", () => {
    expect(Object.fromEntries(entryLabels(journal, otherSide(names, "card")))).toEqual({
      spend: "Capital out · Sumon",
      undo: "Reversal of Capital out · Sumon",
      cash: "Capital out",
    });
    expect(Object.fromEntries(entryLabels(journal, otherSide(names, "person")))).toEqual({
      spend: "Capital out · Arif · City Amex",
      undo: "Reversal of Capital out · Arif · City Amex",
      cash: "Capital out",
    });
  });

  it("other statements and other types keep the given labeller", () => {
    const pay = row("pay", { type: "card_payment", detail: null });
    expect(otherSide(names, "customer")(spend)).toBe("Capital out · Card");
    expect(otherSide(names, "card")(pay)).toBe("Card payment");
  });
});

describe("U-CR-035.7 investor / partner report: Taken out (cash) and (card)", () => {
  const tk = (n: number) => n * 100;
  // Nadim (an investor) spends ৳3,000 on his card; Sumon ৳500 on it; Sumon's cash capital out
  // of 7 Oct is in the fixture already. One spend reversed.
  let n = 0;
  const save = (m: Omit<MoneyEntry, "table">) => {
    n += 1;
    return { table: "money" as const, id: `cr035-${n}`, createdAt: `${m.date}T12:00:00Z`, ...m };
  };
  const spend = (personId: string, date: string, amount: number) =>
    save({ type: "capital_out", date, personId, amount, source: "card", cardId: CARD });
  const nadim = spend(NADIM, "2026-10-21", tk(3_000));
  const sumon = spend(SUMON, "2026-10-22", tk(500));
  const undone = spend(SUMON, "2026-10-23", tk(200));
  const reversal = { ...spend(SUMON, "2026-10-24", tk(200)), reversesId: undone.id };
  const d: BooksData = { ...data, entries: [...data.entries, nadim, sumon, undone, reversal] };
  const types = new Map(d.entries.map((e) => [e.id, e.table === "money" ? e.type : e.table]));
  const typeOf = (id: string) => types.get(id);
  const report = (id: string, from: string, to: string) =>
    investorReport({
      person: person(id),
      books: computeBooks(d, TODAY),
      atEnd: computeBooks(d, to < TODAY ? to : TODAY),
      beforeFrom: computeBooks(d, dayBefore(from)),
      allocations: d.allocations,
      closed: d.closed,
      cards: setupCards,
      from,
      to,
      today: TODAY,
      typeOf,
    });

  it("the books balance with the spends (books-balance invariant)", () => {
    const books = computeBooks(d, TODAY);
    expectBalanced(books.posted, TODAY, d.allocations, d.closed);
  });

  it("splits cash and card drawings; a reversal nets in its own group; closing unchanged", () => {
    const r = report(SUMON, "2026-10-01", "2026-10-31");
    expect(r.capital.groups).toEqual([
      { label: "Taken out (cash)", amount: tk(-10_000) },
      { label: "Taken out (card)", amount: tk(-500) },
    ]);
    expect(r.capital.closing).toBe(computeBooks(d, "2026-10-31").capital[SUMON]);
  });

  it("each group is hidden when 0", () => {
    expect(report(NADIM, "2026-10-01", "2026-10-31").capital.groups.map((g) => g.label)).toEqual([
      "Reinvested",
      "Taken out (card)",
    ]);
    expect(report(SUMON, "2026-11-01", "2026-11-30").capital.groups).toEqual([]);
  });

  it("the card owner's report: the card's balance rises; the owner's capital doesn't", () => {
    const before = computeBooks(data, TODAY);
    const after = computeBooks(d, TODAY);
    expect(after.cards[CARD].balance - before.cards[CARD].balance).toBe(tk(3_500));
    expect(after.capital[NADIM] - before.capital[NADIM]).toBe(tk(-3_000));
    expect(after.cash).toBe(before.cash);
  });

  it("the WhatsApp text and the Excel show both groups", () => {
    const r = report(SUMON, "2026-10-01", "2026-10-31");
    expect(investorText(r)).toContain(`- Taken out (card): ${format(tk(-500))}`);
    expect(investorText(r)).toContain("- Taken out (cash): ");
    expect(JSON.stringify(investorSheets(r))).toContain('"Taken out (card)"');
  });

  it("an investor's cash basis at the close is the month-end capital, net of the spend", () => {
    const people = [{ id: NADIM, name: "Nadim", kind: "investor", active: true }];
    const atEnd = computeBooks(d, "2026-10-31");
    const [cash] = investorLines(people, atEnd, d.allocations, "2026-10");
    expect(cash.basis).toBe(atEnd.capital[NADIM]);
    expect(cash.basis).toBe(computeBooks(data, "2026-10-31").capital[NADIM]! - tk(3_000));
  });

  it("partners' profit is unchanged by a drawing", () => {
    const profit = (b: BooksData) => computeBooks(b, TODAY).months.map((m) => m.profit);
    expect(profit(d)).toEqual(profit(data));
    expect(PARTNERS).toHaveLength(2);
  });
});
