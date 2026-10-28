import { Injectable } from "@nestjs/common";
import { docLabel, entryLabels, entryTitle, otherSide } from "@mbl/domain/journal/labels";
import {
  type StatementKind,
  duesAround,
  statementRange,
  statementRowsOf,
} from "@mbl/domain/accounts";
import type { MessageType } from "@mbl/domain/business";
import { dhakaToday, formatSaved } from "@mbl/domain/dates";
import {
  cardPdfHref,
  investorPdfHref,
  invoicePdfHref,
  receiptPdfHref,
  statementPdfHref,
} from "@mbl/domain/href";
import { cardExtrasText, investorText, modelText } from "@mbl/domain/report-text";
import {
  type ItemLine,
  SEND_TYPES,
  compose,
  discountText,
  paymentText,
  profitShareText,
  recipientNumber,
  reminderText,
  returnText,
  saleText,
  statementText,
} from "@mbl/domain/whatsapp";
import { setupNames } from "@mbl/domain/setup";
import {
  AccountReportsService,
  type StatementExtras,
} from "../account-reports/account-reports.service";
import { BooksService } from "../books/books.service";
import { BusinessService } from "../business/business.service";
import { JournalService } from "../journal/journal.service";
import { SetupDataService } from "../setup/setup-data.service";

// Ref: src/server/messages.ts (N-4.5). D-040: what a message says and who it goes to, read off the
// books, the journal and Setup. The text itself comes from `@mbl/domain/whatsapp`; the send
// preview adds the greeting and sign-off.

export type Draft = {
  type: MessageType;
  /** Who it goes to ("Rahman Telecom (Karim)") and their number as typed. */
  recipient: string;
  phone: string | null;
  /** The wa.me number, or null: Share instead. */
  number: string | null;
  /** `{name}` in the greeting: the proprietor's or the person's name (none for Walk-in). */
  name: string | null;
  body: string;
  /** The PDF of the same thing (`/pdf/…`), when there is one (D-041). */
  pdf?: string | null;
};

export type DraftSource =
  | { kind: "entry"; id: string }
  | { kind: "reminder"; customerId: string }
  | { kind: "statement"; account: StatementKind; id: string; from: string; to: string }
  | { kind: "investor"; personId: string; from: string; to: string };

const TYPE: Record<string, MessageType> = {
  sale: "sale",
  customer_payment: "payment",
  customer_return: "return",
  customer_discount: "discount",
  customer_profit_share: "profit_share",
};

const contact = (c: { whatsapp: string | null; phone: string | null }) => ({
  phone: c.whatsapp || c.phone,
  number: recipientNumber(c.whatsapp, c.phone),
});

/** D-045: a statement's additions as text (the same loader as its screen and PDF). */
export function extrasText(x: StatementExtras | null) {
  if (!x) return null;
  if (x.kind === "card") return cardExtrasText(x);
  const name = (id: string) => x.names[id] ?? "—";
  return x.kind === "customer"
    ? compose([
        modelText("Sales by model", x.byModel, name),
        modelText("Bought from you", x.bought, name),
      ])
    : modelText("Purchases by model", x.byModel, name);
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly books: BooksService,
    private readonly setup: SetupDataService,
    private readonly journal: JournalService,
    private readonly business: BusinessService,
    private readonly reports: AccountReportsService,
  ) {}

  loadDraft(source: DraftSource): Promise<Draft | null> {
    if (source.kind === "entry") return this.entryDraft(source.id);
    if (source.kind === "reminder") return this.reminderDraft(source.customerId);
    if (source.kind === "investor")
      return this.investorDraft(source.personId, source.from, source.to);
    return this.statementDraft(source.account, source.id, source.from, source.to);
  }

  /**
   * A customer's Sale, Payment in, Return, Discount or Profit share as its message or document
   * reads it: the customer, the saved time, the dues around it, a sale's "Received now" payment
   * and (on demand) its lines. A reversal → null; a reversed entry is returned (its documents
   * print CANCELLED, D-042).
   */
  private async customerEntry(id: string) {
    const [{ books }, setup, journal] = await Promise.all([
      this.books.loadBooks(),
      this.setup.loadSetup(),
      this.journal.loadJournal(),
    ]);
    const row = journal.find((r) => r.id === id);
    const posted = books.posted.find((p) => p.id === id);
    if (!row || !posted || !SEND_TYPES.has(row.type) || row.reversesId) return null;
    const c = setup.customers.find((x) => x.id === row.customerId);
    if (!c) return null;

    const model = new Map(setup.models.map((m) => [m.id, m.name]));
    // A sale and its "Received now" payment are saved in one transaction: same customer, date and
    // time. Each finds the other: the sale's Paid now, the payment's bill.
    const pairOf = (type: string) =>
      journal.find(
        (r) =>
          r.type === type &&
          r.id !== id &&
          !r.reversesId &&
          r.customerId === c.id &&
          r.date === row.date &&
          r.createdAt === row.createdAt,
      );
    const paid = row.type === "sale" ? pairOf("customer_payment") : undefined;
    const bill = row.type === "customer_payment" ? pairOf("sale") : undefined;
    return {
      row,
      posted,
      c,
      customer: { name: c.display, walkIn: c.isSystem },
      savedAt: formatSaved(row.createdAt, row.date),
      dues: duesAround(books.posted, c.id, posted),
      paidNow: paid?.amount ?? 0,
      bill: bill ? { number: docLabel(bill), amount: bill.amount } : null,
      /** The date of the reversal that cancels it, if any. */
      reversedOn: (row.reversedBy && journal.find((r) => r.id === row.reversedBy)?.date) || null,
      items: async (): Promise<ItemLine[]> =>
        ((await this.journal.loadEntry(id))?.lines ?? []).map((l) => ({
          model: model.get(l.modelId) ?? "Phone",
          qty: l.qty,
          unitPrice: l.unitAmount,
        })),
    };
  }

  /** D-042: a sale's invoice or a customer payment's money receipt, cancelled when reversed. */
  async loadDocEntry(id: string) {
    const e = await this.customerEntry(id);
    if (!e || (e.row.type !== "sale" && e.row.type !== "customer_payment")) return null;
    const { row, c, customer, savedAt, dues, paidNow, bill, reversedOn } = e;
    const common = {
      number: docLabel(row),
      savedAt,
      customer: { ...customer, phone: c.phone, address: c.address },
      dues,
      reversedOn,
    };
    return row.type === "sale"
      ? { kind: "invoice" as const, ...common, items: await e.items(), paidNow }
      : { kind: "receipt" as const, ...common, amount: row.amount, bill };
  }

  /** After a Sale, Payment in, Return, Discount or Profit share (not reversed, not a reversal). */
  private async entryDraft(id: string): Promise<Draft | null> {
    const [e, business] = await Promise.all([this.customerEntry(id), this.business.getBusiness()]);
    if (!e || e.row.reversedBy) return null;
    const { row, posted, c, customer, savedAt, dues, items } = e;

    let body: string;
    let pdf: string | null = null;
    if (row.type === "sale") {
      body = saleText({
        shop: business?.name ?? "",
        invoiceNo: row.docNo,
        savedAt,
        customer,
        items: await items(),
        paidNow: e.paidNow,
        dues,
      });
      pdf = invoicePdfHref(id);
    } else if (row.type === "customer_payment") {
      body = paymentText({
        receiptNo: row.docNo,
        savedAt,
        customer,
        amount: row.amount,
        dues,
      });
      pdf = receiptPdfHref(id);
    } else if (row.type === "customer_return") {
      body = returnText({ savedAt, customer, items: await items(), refund: row.amount, dues });
    } else if (row.type === "customer_discount") {
      body = discountText({ savedAt, customer, amount: row.amount, dues });
    } else {
      body = profitShareText({
        savedAt,
        customer,
        amount: row.amount,
        dues,
        forMonth: row.forMonth,
        toDue: posted.effects.some((f) => f.account === "customer_due"),
      });
    }

    return {
      type: TYPE[row.type],
      recipient: c.display,
      ...(c.isSystem ? { phone: null, number: null } : contact(c)),
      name: c.isSystem ? null : c.proprietorName,
      body,
      pdf,
    };
  }

  /** ⋯ → Remind on WhatsApp: today's due and the last payment. */
  private async reminderDraft(customerId: string): Promise<Draft | null> {
    const [{ books }, setup, journal] = await Promise.all([
      this.books.loadBooks(),
      this.setup.loadSetup(),
      this.journal.loadJournal(),
    ]);
    const c = setup.customers.find((x) => x.id === customerId);
    if (!c || c.isSystem) return null;
    const last = journal.find(
      (r) =>
        r.type === "customer_payment" && r.customerId === c.id && !r.reversesId && !r.reversedBy,
    );
    return {
      type: "reminder",
      recipient: c.display,
      ...contact(c),
      name: c.proprietorName,
      body: reminderText({
        due: books.customers[c.id]?.balance ?? 0,
        asOf: dhakaToday(),
        lastPayment: last ? { amount: last.amount, date: last.date } : null,
      }),
    };
  }

  /** An account's statement for a period (D-040, D-041): who it is for, the range and each
   * entry's label with its INV-/MR- number. Null for an unknown row or Walk-in. */
  async loadStatement(kind: StatementKind, id: string, from: string, to: string) {
    const [{ books, asOf }, setup, journal] = await Promise.all([
      this.books.loadBooks(),
      this.setup.loadSetup(),
      this.journal.loadJournal(),
    ]);
    const person = (pid: string) => setup.people.find((p) => p.id === pid);
    let who: {
      /** The statement's title ("Arif · EBL Visa") and who receives it. */
      title: string;
      recipient: string;
      name: string | null;
      whatsapp: string | null;
      phone: string | null;
    };
    if (kind === "customer") {
      const c = setup.customers.find((x) => x.id === id);
      if (!c || c.isSystem) return null;
      who = { ...c, title: c.display, recipient: c.display, name: c.proprietorName };
    } else if (kind === "supplier") {
      const s = setup.suppliers.find((x) => x.id === id);
      if (!s) return null;
      who = { ...s, title: s.name, recipient: s.name, name: s.name };
    } else if (kind === "person") {
      const p = person(id);
      if (!p) return null;
      who = { ...p, title: p.name, recipient: p.name, name: p.name };
    } else {
      // A card's statement goes to the person who supplies it.
      const card = setup.cards.find((x) => x.id === id);
      const owner = card && person(card.ownerPersonId);
      if (!card || !owner) return null;
      who = { ...owner, title: card.display, recipient: owner.name, name: owner.name };
    }

    // a reversal: "Reversal of …" (D-058); a Capital out by card names the other side (D-060)
    const labels = entryLabels(journal, otherSide(setupNames(setup), kind, entryTitle));
    const label = (entryId: string) => labels.get(entryId) ?? "Entry";
    return { who, label, range: statementRange(statementRowsOf(kind, id, books, asOf), from, to) };
  }

  /** The Report sheet's WhatsApp message: a statement for a period, to the account's own number.
   * A customer's or supplier's also has its PDF (D-041). */
  private async statementDraft(
    kind: StatementKind,
    id: string,
    from: string,
    to: string,
  ): Promise<Draft | null> {
    const [statement, extras] = await Promise.all([
      this.loadStatement(kind, id, from, to),
      this.reports.loadStatementExtras(kind, id, from, to),
    ]);
    if (!statement) return null;
    const { who, label, range } = statement;
    return {
      type: "statement",
      recipient: who.recipient,
      ...contact(who),
      name: who.name,
      body: statementText({
        kind,
        name: who.title,
        from,
        to,
        range,
        label,
        extra: extrasText(extras),
      }),
      pdf:
        kind === "customer" || kind === "supplier"
          ? statementPdfHref(kind, id, from, to)
          : kind === "card"
            ? cardPdfHref(id, from, to)
            : null,
    };
  }

  /** D-045: the Investor report message, to the person (the Investor report template). */
  private async investorDraft(personId: string, from: string, to: string): Promise<Draft | null> {
    const [report, setup, business] = await Promise.all([
      this.reports.loadInvestorReport(personId, from, to),
      this.setup.loadSetup(),
      this.business.getBusiness(),
    ]);
    const p = setup.people.find((x) => x.id === personId);
    if (!report || !p) return null;
    return {
      type: "investor",
      recipient: p.name,
      ...contact(p),
      name: p.name,
      body: investorText(report, business?.name),
      pdf: investorPdfHref(personId, from, to),
    };
  }
}
