import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, getTableColumns, getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import ExcelJS from "exceljs";
import type { Db } from "@mbl/db/client";
import {
  allocations,
  auditLog,
  bankAccounts,
  businessProfile,
  cardBillDates,
  cards,
  customers,
  models,
  moneyEntries,
  monthCloses,
  people,
  profiles,
  purchaseLines,
  purchases,
  returnLines,
  returns,
  saleLines,
  sales,
  suppliers,
} from "@mbl/db/schema";
import { dhakaToday } from "@mbl/domain/dates";
import { computeBooks } from "@mbl/domain/engine/index";
import { type Cell, type Column, type Kind, type Sheet, summarySheets } from "@mbl/domain/export";
import { parse, toDecimal } from "@mbl/domain/money";
import { BooksService } from "../books/books.service";
import { DB } from "../db/db.module";
import { stockLots } from "../stock/lots";

// Ref: src/server/export.ts. SRS §10, D-017 (task 6.4.1): the backup workbook. One
// read-consistent transaction loads every table (one raw sheet each) and the books (the summary
// sheets), then writes the `export` audit row. Amounts are numbers; the summaries come from
// `computeBooks`, never a second formula. N-5.2: also the reports' Excel files (D-043, D-045;
// `files/xlsx.controller.ts`) and the Export page's last-export line (N-4.6).

/**
 * Every app table, in Setup → trade → money → close → audit order. Never the card details or the
 * passkeys (`card_secrets`, `passkeys`, `passkey_challenges`, D-036).
 */
const TABLES: PgTable[] = [
  people,
  profiles,
  cards,
  cardBillDates,
  customers,
  suppliers,
  models,
  businessProfile,
  bankAccounts,
  purchases,
  purchaseLines,
  sales,
  saleLines,
  returns,
  returnLines,
  moneyEntries,
  monthCloses,
  allocations,
  auditLog,
];

/** Raw sheets are named after their table; Excel sheet names ignore case, so "(raw)" keeps
 * "customers (raw)" apart from the "Customers" summary. */
export const rawSheetName = (table: PgTable) => `${getTableName(table)} (raw)`;

/** Columns left out: the logo is longer than an Excel cell holds (32,767 characters, D-036). */
const OMIT: Record<string, string[]> = { business_profile: ["logo"] };

function kindOf(column: { columnType: string; scale?: number }): Kind {
  switch (column.columnType) {
    case "PgNumeric":
      return column.scale === 2 ? "money" : "pct";
    case "PgInteger":
      return "int";
    case "PgDateString":
      return "date";
    default:
      return "text";
  }
}

/** A stored value as a sheet cell: money → poisha, timestamps → ISO text, jsonb → JSON text. */
function cellOf(kind: Kind, value: unknown): Cell {
  if (value == null) return null;
  if (kind === "money") return parse(String(value));
  if (kind === "pct") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return value as Cell;
}

function rawSheet(table: PgTable, rows: Record<string, unknown>[]): Sheet {
  const omit = OMIT[getTableName(table)] ?? [];
  const columns = Object.entries(getTableColumns(table))
    .filter(([, c]) => !omit.includes(c.name))
    .map(([key, c]) => ({
      key,
      header: c.name,
      kind: kindOf(c as unknown as { columnType: string; scale?: number }),
    }));
  return {
    name: rawSheetName(table),
    columns: columns.map(({ header, kind }) => ({ header, kind })),
    rows: rows.map((r) => columns.map((c) => cellOf(c.kind, r[c.key]))),
  };
}

const FORMAT: Partial<Record<Kind, string>> = {
  money: "#,##0.00",
  pct: "0.###",
  date: "yyyy-mm-dd",
};

/** A cell as ExcelJS writes it: money as taka (a number), dates as Excel dates. */
function excelValue(kind: Kind, value: Cell): ExcelJS.CellValue {
  if (value == null) return null;
  if (kind === "money") return Number(toDecimal(value as number));
  if (kind === "date") return new Date(`${value}T00:00:00Z`);
  return value;
}

/** The workbook for these sheets (also the Sales report's Excel, D-043). */
export function toWorkbook(sheets: Sheet[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = s.columns.map((c: Column) => ({
      header: c.header,
      width: Math.max(12, c.header.length + 2),
      style: FORMAT[c.kind] ? { numFmt: FORMAT[c.kind] } : {},
    }));
    ws.getRow(1).font = { bold: true };
    for (const row of s.rows) ws.addRow(row.map((v, i) => excelValue(s.columns[i].kind, v)));
  }
  return wb;
}

@Injectable()
export class ExportService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly books: BooksService,
  ) {}

  /** Builds the workbook as of `asOf` and records the export (audit row, no row_id). */
  async exportWorkbook(userId: string, asOf: string = dhakaToday()) {
    const sheets = await this.db.transaction(
      async (tx) => {
        const raw = await Promise.all(TABLES.map((t) => tx.select().from(t)));
        const [data, lots] = await Promise.all([this.books.loadBooksData(tx), stockLots(tx)]);
        const rows = (t: PgTable) => raw[TABLES.indexOf(t)] as never[];
        const sheets = [
          ...summarySheets({
            books: computeBooks(data, asOf),
            people: rows(people),
            cards: rows(cards),
            customers: rows(customers),
            suppliers: rows(suppliers),
            models: rows(models),
            lots,
            closes: rows(monthCloses),
          }),
          ...TABLES.map((t, i) => rawSheet(t, raw[i] as Record<string, unknown>[])),
        ];
        await tx.insert(auditLog).values({
          table: "export",
          action: "export",
          after: { asOf },
          userId,
          createdBy: userId,
        });
        return sheets;
      },
      { isolationLevel: "repeatable read" },
    );
    return toWorkbook(sheets).xlsx.writeBuffer();
  }

  /** UIDD §4.12: the latest export (time and who), or null. */
  async lastExport() {
    const [last] = await this.db
      .select({ at: auditLog.at, by: profiles.name })
      .from(auditLog)
      .leftJoin(profiles, eq(profiles.userId, auditLog.userId))
      .where(eq(auditLog.action, "export"))
      .orderBy(desc(auditLog.at))
      .limit(1);
    return last ? { at: last.at.toISOString(), by: last.by ?? "someone" } : null;
  }
}
