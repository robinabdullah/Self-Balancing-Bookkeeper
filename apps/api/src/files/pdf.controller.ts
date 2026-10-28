import { Controller, Get, NotFoundException, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { parseRange } from "@mbl/domain/journal-filter";
import { rowId } from "@mbl/domain/validation/fields";
import { AccountReportsService } from "../account-reports/account-reports.service";
import { AuthService } from "../auth/auth.service";
import { BusinessService } from "../business/business.service";
import { MessagesService } from "../messages/messages.service";
import { cardPdf, investorPdf, modelSection } from "../pdf/account-reports";
import { invoicePdf, receiptPdf } from "../pdf/invoice";
import { renderDocPdf } from "../pdf/invoice-pdf";
import { type PdfKind, pdfFileName, pdfFrame } from "../pdf/layout";
import { packPdf } from "../pdf/pack";
import type { ReportSection } from "../pdf/report";
import { renderReportPdf } from "../pdf/report-pdf";
import { salesPdf } from "../pdf/sales";
import { statementPdf } from "../pdf/statement";
import { renderStatementPdf } from "../pdf/statement-pdf";
import { PackService } from "../reports/pack.service";
import { ReportsService } from "../reports/reports.service";
import { partnerOrNull, searchOf, sendFile, sendText } from "./respond";

// N-5.1 (D-041, D-042, D-043, D-045; UIDD §4.16–4.17): the 7 PDFs, `GET /files/pdf/<kind>` with
// the query of web's `/pdf/<kind>` URL. Partner-only like the export; GET, since a PDF changes
// nothing (no audit row). Ref: src/app/pdf/** (each kind below is its route, word for word).

type Made = { body: Uint8Array; name: string } | { status: 400 | 404; text: string };
type Kind = (q: URLSearchParams) => Promise<Made>;

const refuse = (status: 400 | 404, text: string): Made => ({ status, text });

/** `?pay=` as account ids. */
const payIds = (q: URLSearchParams) => q.get("pay")?.split(",") ?? [];

const rangeOf = (q: URLSearchParams) =>
  parseRange({ from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });

@Controller("files")
export class PdfController {
  constructor(
    private readonly auth: AuthService,
    private readonly business: BusinessService,
    private readonly messages: MessagesService,
    private readonly extras: AccountReportsService,
    private readonly reports: ReportsService,
    private readonly packs: PackService,
  ) {}

  private readonly kinds: Record<string, Kind> = {
    invoice: (q) => this.doc("invoice", q),
    receipt: (q) => this.doc("receipt", q),
    statement: (q) => this.statement(q),
    card: (q) => this.card(q),
    investor: (q) => this.investor(q),
    sales: (q) => this.sales(q),
    pack: (q) => this.pack(q),
  };

  @Get("pdf/:kind")
  async pdf(@Param("kind") kind: string, @Req() req: Request, @Res() res: Response) {
    const make = Object.hasOwn(this.kinds, kind) ? this.kinds[kind] : null;
    if (!make) throw new NotFoundException();
    if (!(await partnerOrNull(this.auth))) return sendText(res, 403, "Only partners can make PDFs");
    const made = await make(searchOf(req));
    if ("text" in made) return sendText(res, made.status, made.text);
    sendFile(res, made.body, "application/pdf", made.name);
  }

  /** The business and a `kind` PDF's frame, How to pay listing the picked business accounts. */
  private async context(kind: PdfKind, pay: string[]) {
    const [business, logo, accounts] = await Promise.all([
      this.business.getBusiness(),
      this.business.getLogo(),
      this.business.loadBankAccounts(),
    ]);
    const howToPay = accounts.filter((a) => a.owner.kind === "business" && pay.includes(a.id));
    return { business, frame: pdfFrame(business && { ...business, logo }, kind, howToPay) };
  }

  /**
   * D-042: `invoice?id=<sale>` and `receipt?id=<customer payment>`, with `&pay=`. A reversed
   * entry prints CANCELLED; a reversal, or an entry of another kind, has no document (404).
   */
  private async doc(kind: "invoice" | "receipt", q: URLSearchParams): Promise<Made> {
    const id = q.get("id");
    if (!rowId.safeParse(id).success) return refuse(400, `Bad ${kind} request`);

    const [entry, { business, frame }] = await Promise.all([
      this.messages.loadDocEntry(id!),
      this.context(kind, payIds(q)),
    ]);
    if (entry?.kind !== kind) return refuse(404, `No such ${kind}`);

    const doc = entry.kind === "invoice" ? invoicePdf(entry) : receiptPdf(entry);
    const body = await renderDocPdf(frame, doc);
    return { body, name: pdfFileName(business, kind, entry.number ?? id!.slice(0, 8)) };
  }

  /**
   * D-041: a customer's or supplier's due statement for a period; D-045: with its By model
   * tables. `?kind=customer|supplier&id=&from=&to=&pay=` (How to pay: customers only).
   */
  private async statement(q: URLSearchParams): Promise<Made> {
    const kind = q.get("kind");
    const id = q.get("id");
    const range = rangeOf(q);
    if ((kind !== "customer" && kind !== "supplier") || !rowId.safeParse(id).success || !range)
      return refuse(400, "Bad statement request");

    const [statement, extras, { business, frame }] = await Promise.all([
      this.messages.loadStatement(kind, id!, range.from, range.to),
      this.extras.loadStatementExtras(kind, id!, range.from, range.to),
      this.context("statement", kind === "customer" ? payIds(q) : []),
    ]);
    if (!statement) return refuse(404, "No such account");

    const doc = statementPdf({
      kind,
      name: statement.who.title,
      from: range.from,
      to: range.to,
      range: statement.range,
      label: statement.label,
      sections: bySections(extras),
    });
    const body = await renderStatementPdf(frame, doc);
    return {
      body,
      name: pdfFileName(business, "statement", statement.who.title, range.from, "to", range.to),
    };
  }

  /**
   * D-045: a card's statement for a period (`?id=&from=&to=`), read as on its last day: the
   * facts, the bills, charges and credits, and the EMI schedule.
   */
  private async card(q: URLSearchParams): Promise<Made> {
    const id = q.get("id");
    const range = rangeOf(q);
    if (!range || !rowId.safeParse(id).success) return refuse(400, "Bad card statement request");

    const [statement, extras, { business, frame }] = await Promise.all([
      this.messages.loadStatement("card", id!, range.from, range.to),
      this.extras.loadStatementExtras("card", id!, range.from, range.to),
      this.context("report", []),
    ]);
    if (!statement || extras?.kind !== "card") return refuse(404, "No such card");
    const doc = cardPdf({
      ...extras,
      name: statement.who.title,
      from: range.from,
      to: range.to,
      range: statement.range,
      label: statement.label,
    });
    return {
      body: await renderReportPdf(frame, doc),
      name: pdfFileName(
        business,
        "card-statement",
        statement.who.title,
        range.from,
        "to",
        range.to,
      ),
    };
  }

  /** D-045: the Investor / Partner report (`?person=&from=&to=`): no How to pay, no terms. */
  private async investor(q: URLSearchParams): Promise<Made> {
    const person = q.get("person");
    const range = rangeOf(q);
    if (!range || !rowId.safeParse(person).success)
      return refuse(400, "Bad investor report request");

    const [report, { business, frame }] = await Promise.all([
      this.extras.loadInvestorReport(person!, range.from, range.to),
      this.context("report", []),
    ]);
    if (!report) return refuse(404, "No such person");
    const body = await renderReportPdf(frame, investorPdf(report));
    return {
      body,
      name: pdfFileName(business, "investor-report", report.person.name, range.from, "to", range.to),
    };
  }

  /** D-043: the Sales report for a period (`?from=&to=`): no How to pay, terms or footer. */
  private async sales(q: URLSearchParams): Promise<Made> {
    const range = rangeOf(q);
    if (!range) return refuse(400, "Bad sales report request");

    const [{ report, names }, { business, frame }] = await Promise.all([
      this.reports.loadSales(range.from, range.to),
      this.context("report", []),
    ]);
    const doc = salesPdf({ report, ...range, name: (id) => names[id] ?? "—" });
    const body = await renderReportPdf(frame, doc);
    return { body, name: pdfFileName(business, "sales", range.from, "to", range.to) };
  }

  /** D-045: the Monthly pack (`?month=YYYY-MM`): an internal report frame. */
  private async pack(q: URLSearchParams): Promise<Made> {
    const month = await this.packs.packMonth(q.get("month") ?? undefined);
    if (!month) return refuse(400, "Bad monthly pack request");

    const [{ pack, names }, { business, frame }] = await Promise.all([
      this.packs.loadPack(month),
      this.context("report", []),
    ]);
    const body = await renderReportPdf(
      frame,
      packPdf(pack, (id) => names[id] ?? "—"),
    );
    return { body, name: pdfFileName(business, "monthly-pack", month) };
  }
}

type Extras = Awaited<ReturnType<AccountReportsService["loadStatementExtras"]>>;

/** D-045: the By model tables after the closing line (no profit: a customer document). */
function bySections(x: Extras): ReportSection[] {
  if (!x || x.kind === "card") return [];
  const name = (id: string) => x.names[id] ?? "—";
  const tables: [string, typeof x.byModel][] =
    x.kind === "customer"
      ? [
          ["Sales by model", x.byModel],
          ["Bought from you", x.bought],
        ]
      : [["Purchases by model", x.byModel]];
  return tables.flatMap(([title, rows]) => modelSection(title, rows, name) ?? []);
}
