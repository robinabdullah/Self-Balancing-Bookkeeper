import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { businessName, exportFileName, slug } from "@mbl/domain/business";
import { dhakaToday } from "@mbl/domain/dates";
import type { Sheet } from "@mbl/domain/export";
import { parseRange } from "@mbl/domain/journal-filter";
import { cardSheets, investorSheets, modelSheets, packSheets, statementSheet } from "@mbl/domain/report-sheets";
import { salesSheets } from "@mbl/domain/sales-report";
import { rowId } from "@mbl/domain/validation/fields";
import { AccountReportsService } from "../account-reports/account-reports.service";
import { AuthService } from "../auth/auth.service";
import { BusinessService } from "../business/business.service";
import { ExportService, toWorkbook } from "../export/export.service";
import { MessagesService } from "../messages/messages.service";
import { PackService } from "../reports/pack.service";
import { ReportsService } from "../reports/reports.service";
import { partnerOrNull, searchOf, sendFile, sendText } from "./respond";

// N-5.2 (D-043, D-045): the reports' Excel files, `GET /files/xlsx/<report>` with the query of
// web's `/reports/<report>/xlsx` URL, and the backup, `POST /files/export` (SRS §10, D-017).
// Ref: src/app/(app)/reports/*/xlsx, src/app/(app)/export/download, src/server/export.ts.

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A report: its file name's parts, and its sheets (null: a bad request). */
type Report = (q: URLSearchParams) => { parts: string[]; sheets: () => Promise<Sheet[] | null> };

const rangeOf = (q: URLSearchParams) =>
  parseRange({ from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });

const KINDS = ["customer", "supplier", "card"] as const;
type Kind = (typeof KINDS)[number];
const HEADS: Record<Kind, [string, string]> = {
  customer: ["Debit", "Credit"],
  supplier: ["Credit", "Debit"],
  card: ["Charge", "Credit"],
};

@Controller("files")
export class XlsxController {
  constructor(
    private readonly auth: AuthService,
    private readonly business: BusinessService,
    private readonly exports: ExportService,
    private readonly messages: MessagesService,
    private readonly extras: AccountReportsService,
    private readonly reports: ReportsService,
    private readonly packs: PackService,
  ) {}

  private readonly kinds: Record<string, Report> = {
    sales: (q) => this.sales(q),
    investor: (q) => this.investor(q),
    pack: (q) => this.pack(q),
    statement: (q) => this.statement(q),
  };

  /**
   * D-043, D-045: a report's Excel file (partner-only; a GET with no audit row, like the PDFs: it
   * is a view, not the backup), named "<business>-<parts>.xlsx". 403 for anyone but a partner.
   */
  @Get("xlsx/:report")
  async xlsx(@Param("report") report: string, @Req() req: Request, @Res() res: Response) {
    const make = Object.hasOwn(this.kinds, report) ? this.kinds[report] : null;
    if (!make) throw new NotFoundException();
    if (!(await partnerOrNull(this.auth)))
      return sendText(res, 403, "Only partners can download reports");
    const { parts, sheets } = make(searchOf(req));
    const [built, business] = await Promise.all([sheets(), this.business.getBusiness()]);
    if (!built) return sendText(res, 400, "Bad report request");
    const body = await toWorkbook(built).xlsx.writeBuffer();
    const name = [businessName(business), ...parts].map(slug).join("-");
    sendFile(res, new Uint8Array(body), XLSX, `${name}.xlsx`);
  }

  /** SRS §10, §11 (task 6.4.1): POST, since every download writes an `export` audit row (D-017). */
  @Post("export")
  @HttpCode(200)
  async export(@Res() res: Response) {
    const partner = await partnerOrNull(this.auth);
    if (!partner) return sendText(res, 403, "Only partners can export");
    const today = dhakaToday();
    const [body, business] = await Promise.all([
      this.exports.exportWorkbook(partner.userId, today),
      this.business.getBusiness(),
    ]);
    sendFile(res, new Uint8Array(body), XLSX, exportFileName(business, today));
  }

  /** D-043 (UIDD §4.17): the Sales report for a period (`?from=&to=`). */
  private sales(q: URLSearchParams) {
    const range = rangeOf(q);
    return {
      parts: ["sales", range?.from ?? "", "to", range?.to ?? ""],
      sheets: async () => {
        if (!range) return null;
        const { report, names } = await this.reports.loadSales(range.from, range.to);
        return salesSheets(report, (id) => names[id] ?? "—");
      },
    };
  }

  /** D-045 (UIDD §4.17): the Investor / Partner report (`?person=&from=&to=`). */
  private investor(q: URLSearchParams) {
    const person = q.get("person");
    const range = rangeOf(q);
    return {
      parts: ["investor-report", range?.from ?? "", "to", range?.to ?? ""],
      sheets: async () => {
        if (!range || !rowId.safeParse(person).success) return null;
        const report = await this.extras.loadInvestorReport(person!, range.from, range.to);
        return report && investorSheets(report);
      },
    };
  }

  /** D-045 (UIDD §4.17): the Monthly pack (`?month=YYYY-MM`), a sheet per section. */
  private pack(q: URLSearchParams) {
    const asked = q.get("month") ?? "";
    return {
      parts: ["monthly-pack", asked],
      sheets: async () => {
        const month = await this.packs.packMonth(asked);
        if (!month) return null;
        const { pack, names } = await this.packs.loadPack(month);
        return packSheets(pack, (id) => names[id] ?? "—");
      },
    };
  }

  /**
   * D-045 (UIDD §4.8): a customer's, supplier's or card's statement (`?kind=&id=&from=&to=`): the
   * Statement, then By model (customer, supplier) or the bills and the EMI schedule (card).
   */
  private statement(q: URLSearchParams) {
    const kind = q.get("kind") as Kind;
    const id = q.get("id");
    const range = rangeOf(q);
    return {
      parts: ["statement", range?.from ?? "", "to", range?.to ?? ""],
      sheets: async () => {
        if (!KINDS.includes(kind) || !rowId.safeParse(id).success || !range) return null;
        const [statement, x] = await Promise.all([
          this.messages.loadStatement(kind, id!, range.from, range.to),
          this.extras.loadStatementExtras(kind, id!, range.from, range.to),
        ]);
        if (!statement || !x) return null;
        const sheet = statementSheet(
          statement.range,
          range.from,
          range.to,
          statement.label,
          HEADS[kind],
        );
        if (x.kind === "card") return cardSheets(sheet, x);
        const name = (m: string) => x.names[m] ?? "—";
        return x.kind === "customer"
          ? modelSheets(
              sheet,
              [
                ["Sales by model", x.byModel],
                ["Bought from you", x.bought],
              ],
              name,
            )
          : modelSheets(sheet, [["Purchases by model", x.byModel]], name);
      },
    };
  }
}
