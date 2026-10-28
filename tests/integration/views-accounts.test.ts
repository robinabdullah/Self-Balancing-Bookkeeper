import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@mbl/db";
import {
  billProfit,
  statementLines,
  statementRange,
  statementRowsOf,
} from "@mbl/domain/accounts";
import { fillTemplate, firstPhone, template } from "@mbl/domain/business";
import { cardDetail, cardRows, emiLabel } from "@mbl/domain/card-view";
import { dueTrend } from "@mbl/domain/charts/customers";
import { standing } from "@mbl/domain/charts/kinds";
import { aboveTarget } from "@mbl/domain/engine/customers";
import { entryLabels, otherSide } from "@mbl/domain/journal/labels";
import { parse } from "@mbl/domain/money";
import { peopleRows, personDetail } from "@mbl/domain/people-view";
import { setupNames } from "@mbl/domain/setup";
import { loadStatementExtras } from "@/server/account-reports";
import { customerBills } from "@/server/accounts";
import { loadBooks } from "@/server/books";
import { getBusiness, loadBankAccounts, payAccounts } from "@/server/business";
import { loadCardSecrets } from "@/server/card-secrets";
import { cardDetailData } from "@/server/cards";
import { loadChartPeriod } from "@/server/charts";
import { loadJournal } from "@/server/journal";
import { type DraftSource, loadDraft } from "@/server/messages";
import { loadSetup } from "@/server/setup";
import { ids, pid, seedParity } from "../../scripts/parity/seed";
import { type TestUser, deleteUsers, signedInUser, startApi } from "./api";
import { localSql } from "./local-db";

// N-4.5: the account pages and the overlays they open each read one `/views/*`. Each view holds
// what web's page or overlay computed from web's own loaders (Ref: the `[id]/page.tsx` of
// customers, suppliers, people and cards, customers/[id]/trend, and the bank, account, send,
// by-model and card-secrets overlays), after the JSON round trip. Fictional book (D-069).
const sql = localSql();
let app: INestApplication;
let partner: TestUser;
let refs: Record<string, string>;

beforeAll(async () => {
  ({ refs } = await seedParity(sql));
  app = await startApi();
  partner = await signedInUser(sql, "partner");
});

afterAll(async () => {
  await app.close();
  await deleteUsers(sql);
  await sql.end();
  await db.$client.end();
});

const get = (path: string) =>
  request(app.getHttpServer())
    .get(path)
    .set({ Authorization: `Bearer ${partner.token}` });

const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const SEP = { from: "2026-09-01", to: "2026-09-30" };
const sep = "from=2026-09-01&to=2026-09-30";

type Lines = { entryId: string }[];
const labelled = (lines: Lines, labels: Map<string, string>) =>
  lines.map((l) => ({ ...l, label: labels.get(l.entryId) ?? "Entry" }));
const totals = ({ opening, up, down, closing }: ReturnType<typeof statementRange>) => ({
  opening,
  up,
  down,
  closing,
});

describe("I-N-4.5.1 each account view has what web's page computed", () => {
  it("/views/customers/:id, with and without a period", async () => {
    const id = ids.rahman;
    const [{ books }, setup, journal, bills] = await Promise.all([
      loadBooks(),
      loadSetup(),
      loadJournal(),
      customerBills(id),
    ]);
    const customer = setup.customers.find((c) => c.id === id)!;
    const balance = books.customers[id]?.balance ?? 0;
    const target = customer.targetBalance == null ? null : parse(customer.targetBalance);
    const labels = entryLabels(journal);
    const period = statementRange(books.customers[id]?.rows ?? [], SEP.from, SEP.to);
    const common = {
      customer,
      balance,
      above: aboveTarget(balance, target),
      bills: bills.map((b) => ({
        ...b,
        profit: billProfit(books.posted.find((p) => p.id === b.id)),
      })),
      names: setupNames(setup),
      first: journal.at(-1)?.date ?? null,
    };

    const all = (await get(`/views/customers/${id}`).expect(200)).body;
    expect(all).toEqual(
      json({
        ...common,
        lines: labelled(statementLines(books.customers[id]), labels),
        period: null,
      }),
    );
    expect(all.lines.length).toBeGreaterThan(0);
    expect(all.bills.length).toBeGreaterThan(0);

    const inSep = (await get(`/views/customers/${id}?${sep}`).expect(200)).body;
    expect(inSep).toEqual(
      json({ ...common, lines: labelled(period.lines, labels), period: totals(period) }),
    );
  });

  it("/views/customers/:id/trend", async () => {
    const id = ids.rahman;
    const [base, { data, books }, setup, journal] = await Promise.all([
      loadChartPeriod({}),
      loadBooks(),
      loadSetup(),
      loadJournal(),
    ]);
    const { today, period } = base;
    const rows = books.customers[id]?.rows ?? [];
    const payments = standing(data.entries, "customer_payment")
      .filter((e) => e.table === "money" && e.customerId === id)
      .map((e) => e.date);
    const range = statementRange(rows, period.from, period.to);
    const { body } = await get(`/views/customers/${id}/trend`).expect(200);
    expect(body).toEqual(
      json({
        ...base,
        name: setup.customers.find((c) => c.id === id)!.display,
        trend: dueTrend(rows, period.from, period.to, today, payments),
        lines: labelled(range.lines, entryLabels(journal)),
        range: totals(range),
      }),
    );
  });

  it("/views/suppliers/:id, with and without a period", async () => {
    const id = ids.alpha;
    const [{ books }, setup, journal] = await Promise.all([loadBooks(), loadSetup(), loadJournal()]);
    const labels = entryLabels(journal);
    const common = {
      supplier: setup.suppliers.find((s) => s.id === id),
      balance: books.suppliers[id]?.balance ?? 0,
      first: journal.at(-1)?.date ?? null,
    };
    const all = (await get(`/views/suppliers/${id}`).expect(200)).body;
    expect(all).toEqual(
      json({
        ...common,
        lines: labelled(statementLines(books.suppliers[id]), labels),
        period: null,
      }),
    );
    expect(all.lines.length).toBeGreaterThan(0);
    const period = statementRange(books.suppliers[id]?.rows ?? [], SEP.from, SEP.to);
    expect((await get(`/views/suppliers/${id}?${sep}`).expect(200)).body).toEqual(
      json({ ...common, lines: labelled(period.lines, labels), period: totals(period) }),
    );
  });

  it("/views/people/:id, with and without a period", async () => {
    for (const id of [ids.arif, ids.kamal]) {
      const [{ data, books, asOf }, setup, journal] = await Promise.all([
        loadBooks(),
        loadSetup(),
        loadJournal(),
      ]);
      const person = setup.people.find((p) => p.id === id)!;
      const byId = new Map(journal.map((r) => [r.id, r]));
      const labels = entryLabels(journal, otherSide(setupNames(setup), "person"));
      const detail = personDetail(id, books, data.allocations, asOf, (e) => byId.get(e)?.type);
      const common = {
        person,
        row: peopleRows([person], books)[0],
        cards: cardRows(
          setup.cards.filter((c) => c.ownerPersonId === id),
          books.cards,
        ),
        profit: detail.profit,
        allocations: detail.allocations,
        first: journal.at(-1)?.date ?? null,
      };
      expect((await get(`/views/people/${id}`).expect(200)).body).toEqual(
        json({
          ...common,
          capital: labelled(detail.capital, labels),
          period: null,
          profitMoves: labelled(detail.profitMoves, labels),
        }),
      );
      const period = statementRange(
        statementRowsOf("person", id, books, asOf),
        SEP.from,
        SEP.to,
      );
      expect((await get(`/views/people/${id}?${sep}`).expect(200)).body).toEqual(
        json({
          ...common,
          capital: labelled(period.lines, labels),
          period: totals(period),
          profitMoves: labelled(
            detail.profitMoves.filter((l) => l.date >= SEP.from && l.date <= SEP.to),
            labels,
          ),
        }),
      );
    }
  });

  it("/views/cards/:id, with and without a period", async () => {
    for (const id of [ids.visa, ids.amex]) {
      const [{ books, asOf }, setup, journal, extra, cardReport] = await Promise.all([
        loadBooks(),
        loadSetup(),
        loadJournal(),
        cardDetailData(id),
        loadStatementExtras("card", id, SEP.from, SEP.to),
      ]);
      const card = setup.cards.find((c) => c.id === id)!;
      const summary = books.cards[id];
      const { bills, moves, emiPlans } = cardDetail(summary);
      const labels = entryLabels(journal, otherSide(setupNames(setup), "card"));
      const label = (entryId: string) => labels.get(entryId) ?? "Entry";
      const emi = new Map(emiPlans.map((p) => [p.entryId, p]));
      const common = {
        card,
        row: cardRows([card], books.cards)[0],
        summary: {
          dueWithin7Days: summary?.dueWithin7Days ?? 0,
          unbilled: summary?.unbilled ?? 0,
          remainingEmi: summary?.remainingEmi ?? 0,
        },
        bills,
        billDates: extra.billDates,
        moves: moves.map((m) => {
          const plan = m.billMonth ? emi.get(m.entryId) : undefined;
          return { ...m, label: label(m.entryId), emi: plan && emiLabel(plan, m.billMonth!) };
        }),
        plans: emiPlans.map((p) => ({
          ...p,
          label: extra.emiItems[p.entryId] ?? label(p.entryId),
        })),
        today: asOf,
        first: journal.at(-1)?.date ?? null,
      };
      expect((await get(`/views/cards/${id}`).expect(200)).body).toEqual(
        json({ ...common, periodBills: null, lines: [], period: null }),
      );
      const period = statementRange(statementRowsOf("card", id, books, asOf), SEP.from, SEP.to);
      const inSep = (await get(`/views/cards/${id}?${sep}`).expect(200)).body;
      expect(inSep).toEqual(
        json({
          ...common,
          periodBills: cardReport,
          lines: labelled(period.lines, labels),
          period: totals(period),
        }),
      );
      expect(inSep.periodBills.kind).toBe("card");
    }
  });
});

describe("I-N-4.5.1 each overlay view has what web's overlay computed", () => {
  it("/views/bank-accounts and /views/pay-accounts", async () => {
    const all = await loadBankAccounts();
    const { body } = await get(`/views/bank-accounts?kind=customer&id=${ids.rahman}`).expect(200);
    expect(body).toEqual(
      json(all.filter((a) => a.owner.kind === "customer" && a.owner.id === ids.rahman)),
    );
    expect(body.length).toBe(1);
    expect((await get("/views/pay-accounts").expect(200)).body).toEqual(json(await payAccounts()));
  });

  it("/views/send: an entry, a reminder, a statement of each kind and an investor report", async () => {
    const sources: DraftSource[] = [
      { kind: "entry", id: refs.invoice },
      { kind: "entry", id: refs.receipt },
      { kind: "reminder", customerId: ids.rahman },
      { kind: "statement", account: "customer", id: ids.rahman, ...SEP },
      { kind: "statement", account: "supplier", id: ids.alpha, ...SEP },
      { kind: "statement", account: "card", id: ids.visa, ...SEP },
      { kind: "statement", account: "person", id: ids.nadim, ...SEP },
      { kind: "investor", personId: ids.kamal, from: "2026-08-01", to: "2026-09-30" },
    ];
    const [business, accounts] = await Promise.all([getBusiness(), payAccounts()]);
    for (const source of sources) {
      const draft = (await loadDraft(source))!;
      const t = template(business?.templates, draft.type);
      const values = {
        name: draft.name,
        shop: business?.name,
        phone: firstPhone(business?.phones),
      };
      const q = new URLSearchParams(source as Record<string, string>);
      const { body } = await get(`/views/send?${q}`).expect(200);
      expect(body, source.kind).toEqual(
        json({
          draft,
          greeting: fillTemplate(t.greeting, values),
          signOff: fillTemplate(t.signOff, values),
          save: business && {
            id: business.id,
            updatedAt: business.updatedAt,
            signOff: t.signOff,
            shop: business.name,
          },
          accounts,
        }),
      );
    }
  });

  it("/views/statement-extras for a customer, a supplier and a card", async () => {
    for (const [kind, id] of [
      ["customer", ids.rahman],
      ["supplier", ids.alpha],
      ["card", ids.visa],
    ] as const) {
      const { body } = await get(`/views/statement-extras/${kind}/${id}?${sep}`).expect(200);
      expect(body).toEqual(json(await loadStatementExtras(kind, id, SEP.from, SEP.to)));
      expect(body.kind).toBe(kind);
    }
  });

  it("/views/card-secrets/:cardId", async () => {
    const { body } = await get(`/views/card-secrets/${ids.visa}`).expect(200);
    const items = (await loadCardSecrets()).filter((s) => s.cardId === ids.visa);
    expect(body).toEqual(json({ items, hasPasskey: false }));
    expect(body.items.length).toBeGreaterThan(0);
    // The books balance.
    expect((await get("/views/shell").expect(200)).body.balance.difference).toBe(0);
  });
});

describe("I-N-4.5.2 an unknown or malformed id", () => {
  it("is a 404 on each account page; Walk-in has no Due trend", async () => {
    const unknown = pid(999);
    for (const path of ["customers", "suppliers", "people", "cards"]) {
      await get(`/views/${path}/${unknown}`).expect(404);
      await get(`/views/${path}/not-an-id`).expect(404);
    }
    await get(`/views/customers/${unknown}/trend`).expect(404);
    const walkIn = (await loadSetup()).customers.find((c) => c.isSystem)!;
    await get(`/views/customers/${walkIn.id}/trend`).expect(404);
    await get(`/views/statement-extras/other/${ids.rahman}?${sep}`).expect(404);
    await get(`/views/statement-extras/customer/not-an-id?${sep}`).expect(404);
    await get(`/views/statement-extras/customer/${ids.rahman}`).expect(404);
  });

  it("sends nothing for a bad send source", async () => {
    for (const q of ["kind=entry&id=not-an-id", "kind=statement&account=customer", "kind=x", ""]) {
      const { text } = await get(`/views/send?${q}`).expect(200);
      expect(text, q).toBe("");
    }
  });
});

describe("I-N-4.5.3 the account views need a sign-in", () => {
  it("401 without a token", async () => {
    for (const path of [
      `customers/${ids.rahman}`,
      `customers/${ids.rahman}/trend`,
      `suppliers/${ids.alpha}`,
      `people/${ids.arif}`,
      `cards/${ids.visa}`,
      "bank-accounts",
      "pay-accounts",
      "send",
      `statement-extras/customer/${ids.rahman}?${sep}`,
      `card-secrets/${ids.visa}`,
    ])
      await request(app.getHttpServer()).get(`/views/${path}`).expect(401);
  });
});
