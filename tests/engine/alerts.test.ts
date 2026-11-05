import { describe, expect, it } from "vitest";
import {
  type Alert,
  type AlertKind,
  type AlertSetup,
  FEE_UNKNOWN_ROOM,
  badgeCount,
  buildAlerts,
} from "@mbl/domain/alerts";
import { available } from "@mbl/domain/card-view";
import type { AgeLot } from "@mbl/domain/charts/stock";
import { addDays } from "@mbl/domain/dates";
import type { BillDates } from "@mbl/domain/engine/cards";
import type { Allocation } from "@mbl/domain/engine/months";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import type { Entry, MoneyEntry } from "@mbl/domain/engine/post";
import { format, parse, toDecimal } from "@mbl/domain/money";
import { PARTNERS, expectBalanced } from "./invariant";

// CR-056 (SRS §15, D-079, D-081): the Alerts bell's rules. Synthetic ids and amounts (D-014).
const [ARIF] = PARTNERS.map((p) => p.id);
const SCB = "card-scb"; // statement 15th, due 5th; expiry 01/29 (S19)
const EBL = "card-ebl"; // statement 5th, due 20th
const [SHOP, PAID, WALKIN] = ["cust-shop", "cust-paid", "cust-walkin"];

let seq = 0;
const stored = (entry: Entry): StoredEntry => {
  seq += 1;
  return { ...entry, id: `e-${seq}`, createdAt: `${entry.date}T10:00:00.${seq}Z` };
};
const money = (
  type: MoneyEntry["type"],
  date: string,
  amount: number,
  extra: Partial<MoneyEntry> = {},
) => stored({ table: "money", type, date, amount, ...extra });
const fee = (date: string, amount: number, category: string | null, cardId = SCB) =>
  money("card_fee", date, amount, { cardId, category });
const sale = (date: string, customerId: string, price: number) =>
  stored({ table: "sale", date, customerId, lines: [{ qty: 1, unitPrice: price, unitCost: 0 }] });
const cardBuy = (date: string, cardId: string, cost: number) =>
  stored({ table: "purchase", date, source: "card", cardId, lines: [{ qty: 1, unitCost: cost }] });
const lot = (date: string, remaining: number): AgeLot => ({
  id: `lot-${date}`,
  modelId: "model-a",
  date,
  createdAt: `${date}T10:00:00Z`,
  qty: remaining,
  unitCost: 1_000,
  sold: 0,
  returned: 0,
  toSeller: 0,
  remaining,
  imeiNote: null,
});

/** A closed month's profit split 50/50 between the partners. */
const halves = (month: string, profit: number): Allocation[] =>
  PARTNERS.map((p) => ({ month, personId: p.id, kind: "partner", amount: profit / 2 }));

/** S19: last January's statement had an Annual fee of 5,000 + VAT 750 on SCB Visa. */
const LAST_YEAR_FEE = [fee("2026-01-10", 500_000, "annual"), fee("2026-01-10", 75_000, "vat")];

type Opts = {
  today: string;
  /** Available ≈ on SCB (sets its limit to balance + room); null = no limit. */
  room?: number | null;
  feeMonths?: Record<string, number>;
  closed?: string[];
  /** A closed month's split (SRS §7): the partners' shares of its profit. */
  allocations?: Allocation[];
  billDates?: BillDates[];
  lots?: AgeLot[];
  inactive?: string[];
};

function run(entries: StoredEntry[], o: Opts) {
  const data: BooksData = {
    entries: [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    partners: PARTNERS,
    allocations: o.allocations ?? [],
    closed: o.closed ?? [],
    cards: [
      { id: SCB, statementDay: 15, dueDay: 5 },
      { id: EBL, statementDay: 5, dueDay: 20 },
    ],
    billDates: o.billDates ?? [],
  };
  const books = computeBooks(data, o.today);
  expectBalanced(books.posted, o.today, data.allocations, data.closed);
  const balance = books.cards[SCB]?.balance ?? 0;
  const room = o.room === undefined ? 10_000_000 : o.room;
  const setup: AlertSetup = {
    cards: [
      {
        id: SCB,
        display: "Arif · SCB Visa",
        creditLimit: room == null ? null : toDecimal(balance + room),
        active: !o.inactive?.includes(SCB),
      },
      {
        id: EBL,
        display: "Arif · EBL Visa",
        creditLimit: null,
        active: !o.inactive?.includes(EBL),
      },
    ],
    people: [
      { id: ARIF, name: "Arif" },
      { id: PARTNERS[1].id, name: "Sumon" },
    ],
    customers: [
      { id: WALKIN, display: "Walk-in", isSystem: true },
      { id: SHOP, display: "Shop (Owner)", isSystem: false },
      { id: PAID, display: "Paid Shop (Owner)", isSystem: false },
    ],
  };
  const before = JSON.stringify(books);
  const result = buildAlerts({
    data,
    books,
    setup,
    feeMonths: o.feeMonths ?? { [SCB]: 1 },
    lots: o.lots ?? [],
    today: o.today,
  });
  expect(JSON.stringify(books)).toBe(before); // no figure in the books changes
  return { ...result, books, setup };
}
const of = (alerts: Alert[], kind: AlertKind) => alerts.filter((a) => a.kind === kind);
const feeOf = (entries: StoredEntry[], o: Opts) => of(run(entries, o).alerts, "card_fee");

describe("CR-056 alerts (SRS §15, D-079, D-081)", () => {
  it("U-CR-056.1 the fee date: the expiry month this year or next, an override, no expiry", () => {
    // This year: 2 Jan → the 15 Jan 2027 statement.
    expect(feeOf([], { today: "2027-01-02" })[0]).toMatchObject({
      date: "2027-01-15",
      href: `/cards/${SCB}`,
      cardId: SCB,
      title: "Arif · SCB Visa · annual fee",
    });
    // Next year: past this year's statement, the next one is 15 Jan 2028 (> 15 days → none);
    // from 31 Dec 2027 it is 15 days away.
    expect(feeOf([], { today: "2027-01-16" })).toEqual([]);
    expect(feeOf([], { today: "2027-12-31" })[0].date).toBe("2028-01-15");
    // A card_bill_dates override moves the statement.
    const billDates = [{ cardId: SCB, billMonth: "2027-01-01", actualStatementDate: "2027-01-12" }];
    expect(feeOf([], { today: "2027-01-02", billDates })[0].date).toBe("2027-01-12");
    // No saved expiry: no fee alert, and the card is counted (an inactive card isn't).
    const none = run([], { today: "2027-01-02", feeMonths: {} });
    expect(of(none.alerts, "card_fee")).toEqual([]);
    expect(none.noExpiryCards).toBe(2);
    expect(run([], { today: "2027-01-02", feeMonths: {}, inactive: [EBL] }).noExpiryCards).toBe(1);
    expect(run([], { today: "2027-01-02" }).noExpiryCards).toBe(1); // EBL has no expiry
    // An inactive card gets no fee alert.
    expect(feeOf([], { today: "2027-01-02", inactive: [SCB] })).toEqual([]);
  });

  it("U-CR-056.2 the fee amount: last year's Annual + VAT; other kinds, legacy, reversed don't count", () => {
    const today = "2027-01-02";
    const known = feeOf(LAST_YEAR_FEE, { today, room: 10_000_000 })[0];
    expect(known.detail).toContain("Annual fee ≈ ৳5,750 on 15 Jan.");
    // Other kinds, the legacy category and a reversed Annual fee leave the amount unknown.
    const reversed = fee("2026-01-11", 400_000, "annual");
    const noise = [
      fee("2026-01-10", 20_000, "sms"),
      fee("2026-01-10", 30_000, "card fee/interest"),
      reversed,
      money("card_fee", "2026-01-12", 400_000, {
        cardId: SCB,
        category: "annual",
        reversesId: reversed.id,
      }),
      fee("2025-12-10", 500_000, "annual"), // the Dec 2025 bill, not January's
      fee("2026-01-10", 500_000, "annual", EBL), // another card
    ];
    const unknown = feeOf(noise, { today, room: 10_000_000 })[0];
    expect(unknown.detail).toMatch(/^The annual fee usually comes with the 15 Jan statement/);
    // This year's Annual fee already recorded on the January bill → no alert.
    expect(feeOf([...LAST_YEAR_FEE, fee("2027-01-01", 500_000, "annual")], { today })).toEqual([]);
    // A VAT alone this year doesn't count as the fee being recorded.
    expect(feeOf([...LAST_YEAR_FEE, fee("2027-01-01", 75_000, "vat")], { today })).toHaveLength(1);
  });

  it("U-CR-056.3 the fee at its edges: days, room, unknown amount, no limit", () => {
    const at = (days: number) => addDays("2027-01-15", -days);
    const level = (entries: StoredEntry[], days: number, room: number | null) =>
      feeOf(entries, { today: at(days), room })[0]?.level;
    // 16 days → none; 15 / 4 days → Soon (even with room enough, D-081); 3 / 0 → Urgent when short.
    expect(level(LAST_YEAR_FEE, 16, 0)).toBeUndefined();
    expect(level(LAST_YEAR_FEE, 15, 0)).toBe("soon");
    expect(level(LAST_YEAR_FEE, 4, 0)).toBe("soon");
    expect(level(LAST_YEAR_FEE, 3, 0)).toBe("urgent");
    expect(level(LAST_YEAR_FEE, 0, 0)).toBe("urgent");
    // Room = amount covers it (Soon, never Urgent); amount − 1 is short.
    expect(level(LAST_YEAR_FEE, 15, 575_000)).toBe("soon");
    const covered = feeOf(LAST_YEAR_FEE, { today: at(3), room: 575_000 })[0];
    expect(covered.level).toBe("soon");
    expect(covered.detail).toContain("Available ≈ ৳5,750 covers it.");
    const short = feeOf(LAST_YEAR_FEE, { today: at(3), room: 574_999 })[0];
    expect(short.level).toBe("urgent");
    expect(short.detail).toContain("Available ≈ ৳5,749.99, so pay at least ৳0.01 before then.");
    expect(short.detail).toContain("Available ≈ is approximate");
    // Unknown amount: short below ৳10,000 (no figure shown).
    expect(level([], 3, FEE_UNKNOWN_ROOM)).toBe("soon");
    expect(level([], 3, FEE_UNKNOWN_ROOM - 1)).toBe("urgent");
    const keep = feeOf([], { today: at(3), room: 120_000 })[0];
    expect(keep.detail).toBe(
      "The annual fee usually comes with the 15 Jan statement (expiry month). Available ≈ ৳1,200, so keep room for it. Available ≈ is approximate — excludes personal spending not entered as Personal spend.",
    );
    // No limit: Soon throughout, with its own texts.
    expect(level(LAST_YEAR_FEE, 0, null)).toBe("soon");
    expect(feeOf(LAST_YEAR_FEE, { today: at(3), room: null })[0].detail).toBe(
      "Annual fee ≈ ৳5,750 on 15 Jan. No limit is set, so Available ≈ isn't known.",
    );
    expect(feeOf([], { today: at(3), room: null })[0].detail).toBe(
      "The annual fee usually comes with the 15 Jan statement (expiry month). No limit is set.",
    );
  });

  it("U-CR-056.3 card bills: overdue / due today → Urgent, in 7 days → Soon, in 8 → none", () => {
    // EBL: bought 1 Oct → the Oct bill, statement 5 Oct, due 20 Oct.
    const entries = [cardBuy("2026-10-01", EBL, 1_200_000)];
    const bill = (today: string) => of(run(entries, { today, feeMonths: {} }).alerts, "card_bill");
    expect(bill("2026-10-12")).toEqual([]);
    expect(bill("2026-10-13")[0]).toMatchObject({
      level: "soon",
      title: "Arif · EBL Visa · bill",
      detail: "৳12,000 due 20 Oct · 7 days left",
      href: `/cards/${EBL}`,
      date: "2026-10-20",
    });
    expect(bill("2026-10-20")[0]).toMatchObject({
      level: "urgent",
      detail: "৳12,000 due 20 Oct · today",
    });
    expect(bill("2026-10-22")[0]).toMatchObject({
      level: "urgent",
      detail: "৳12,000 due 20 Oct · 2 days overdue",
    });
  });

  it("U-CR-056.3 customers: 29 / 30 / 59 / 60 days, never paid, last paid, Walk-in left out", () => {
    const entries = [
      sale("2026-08-01", SHOP, 500_000),
      sale("2026-08-01", WALKIN, 300_000),
      sale("2026-07-01", PAID, 800_000),
      money("customer_payment", "2026-08-02", 100_000, { customerId: PAID }),
    ];
    const due = (today: string) =>
      of(run(entries, { today, feeMonths: {}, closed: [] }).alerts, "customer");
    // SHOP never paid: counted from its first entry (1 Aug); PAID from its last payment (2 Aug).
    expect(due("2026-08-30")).toEqual([]);
    const at30 = due("2026-08-31");
    expect(at30.map((a) => [a.title, a.level])).toEqual([["Shop (Owner) · due", "soon"]]);
    expect(at30[0]).toMatchObject({
      detail: "Owes ৳5,000 · no payment in 30 days",
      href: `/customers/${SHOP}`,
    });
    expect(due("2026-09-01")[1]).toMatchObject({ detail: "Owes ৳7,000 · last paid 30 days ago" });
    expect(due("2026-09-29").find((a) => a.href.endsWith(SHOP))?.level).toBe("soon"); // 59 days
    expect(due("2026-09-30").find((a) => a.href.endsWith(SHOP))?.level).toBe("urgent"); // 60 days
    expect(due("2026-12-01").some((a) => a.href.endsWith(WALKIN))).toBe(false);
  });

  it("U-CR-056.3 the close: Soon on the 1st–4th of the next month, Urgent from the 5th", () => {
    const entries = [sale("2026-09-10", WALKIN, 100_000)];
    const close = (today: string) => of(run(entries, { today, feeMonths: {} }).alerts, "close");
    expect(close("2026-09-30")).toEqual([]);
    expect(close("2026-10-01")[0]).toMatchObject({
      level: "soon",
      title: "Close Sep 2026",
      detail: "Sep 2026 is ready to close.",
      href: "/months/2026-09",
    });
    expect(close("2026-10-04")[0].level).toBe("soon");
    expect(close("2026-10-05")[0].level).toBe("urgent");
    expect(close("2026-11-02")[0]).toMatchObject({ level: "urgent", title: "Close Sep 2026" });
    const split = halves("2026-09", 100_000);
    expect(
      of(
        run(entries, {
          today: "2026-10-20",
          closed: ["2026-09"],
          allocations: split,
          feeMonths: {},
        }).alerts,
        "close",
      ),
    ).toEqual([]);
  });

  it("U-CR-056.3 old stock (90 / 91 days) and profit owed (0 / > 0) are FYI", () => {
    const today = "2026-12-01";
    const stock = (lots: AgeLot[]) => of(run([], { today, lots, feeMonths: {} }).alerts, "stock");
    expect(stock([lot(addDays(today, -90), 3)])).toEqual([]);
    expect(stock([lot(addDays(today, -91), 3), lot(addDays(today, -200), 0)])[0]).toMatchObject({
      level: "fyi",
      title: "Old stock",
      detail: "3 phones older than 90 days",
      href: "/stock",
    });
    // A closed month's profit: ৳1,000 cashback in Sep → ৳500 owed to each partner.
    const cashback = [money("cashback", "2026-09-10", 100_000, { source: "cash" })];
    const closed = { closed: ["2026-09"], allocations: halves("2026-09", 100_000) };
    const profit = of(run(cashback, { today, ...closed, feeMonths: {} }).alerts, "profit");
    expect(profit.map((a) => [a.title, a.detail, a.level, a.href])).toEqual([
      // Same level and date → by title.
      ["Arif · profit owed", "৳500 not paid or reinvested yet", "fyi", `/people/${ARIF}`],
      [
        "Sumon · profit owed",
        "৳500 not paid or reinvested yet",
        "fyi",
        `/people/${PARTNERS[1].id}`,
      ],
    ]);
    expect(of(run([], { today, feeMonths: {} }).alerts, "profit")).toEqual([]);
  });

  it("U-CR-056.3 sorted Urgent → Soon → FYI, then by date; the badge counts Urgent + Soon", () => {
    const today = "2026-10-20";
    const { alerts } = run(
      [cardBuy("2026-10-01", EBL, 1_200_000), sale("2026-09-10", SHOP, 500_000)],
      { today, feeMonths: {}, lots: [lot("2026-01-01", 2)] },
    );
    expect(alerts.map((a) => [a.level, a.kind])).toEqual([
      ["urgent", "close"], // Sep not closed, from 5 Oct (date 1 Oct)
      ["urgent", "card_bill"], // due today (20 Oct)
      ["soon", "customer"], // 40 days
      ["fyi", "stock"],
    ]);
    expect(badgeCount(alerts)).toBe(3);
    expect(badgeCount([])).toBe(0);
  });

  it("U-CR-056.4 S19: Soon on 1 Jan (pay at least ৳4,550), Urgent from 12 Jan; amounts tie out", () => {
    const s19 = (today: string) => run(LAST_YEAR_FEE, { today, room: 120_000 });
    const jan1 = s19("2027-01-01");
    const alert = of(jan1.alerts, "card_fee")[0];
    expect(alert.level).toBe("soon");
    expect(alert.detail).toBe(
      "Annual fee ≈ ৳5,750 on 15 Jan. Available ≈ ৳1,200, so pay at least ৳4,550 before then. Available ≈ is approximate — excludes personal spending not entered as Personal spend.",
    );
    expect(of(s19("2027-01-11").alerts, "card_fee")[0].level).toBe("soon");
    expect(of(s19("2027-01-12").alerts, "card_fee")[0].level).toBe("urgent");
    // Tie-out: the Available ≈ shown = the card page's figure from the books.
    const limit = parse(jan1.setup.cards[0].creditLimit!);
    expect(alert.detail).toContain(
      `Available ≈ ${format(available(limit, jan1.books.cards[SCB].balance)!)}`,
    );
    // The bill's remaining shown = the books' bill (the Jan 2026 fees, unpaid → overdue).
    const bill = of(jan1.alerts, "card_bill")[0];
    const unpaid = jan1.books.cards[SCB].bills.find((b) => b.remaining > 0)!;
    expect(bill.detail.startsWith(`${format(unpaid.remaining)} due`)).toBe(true);
    expect(bill.level).toBe("urgent");
  });
});
