// D-043, D-045 (UIDD §4.16): what an internal report PDF says, as text: a title, the period, then
// sections of facts ("Label  value" lines) and tables (a head row, rows and an optional Total
// row). The Sales report, the Investor report, the card statement and the Monthly pack all use
// it; `report-pdf.tsx` lays it out. Pure, so tests can read what a PDF says.

export type ReportTable = {
  heads: string[];
  rows: string[][];
  total?: string[];
  /** Column widths ("40%"). */
  widths?: string[];
  /** How many leading columns are text (left-aligned; default 1); the rest are numbers. */
  textCols?: number;
};

export type ReportSection = {
  title?: string;
  /** Label / value lines; the last is bold when `strongLast`. */
  facts?: [label: string, value: string][];
  strongLast?: boolean;
  table?: ReportTable;
  /** A grey line under the section ("not allocated yet"). */
  note?: string;
};

export type ReportPdf = {
  title: string;
  /** Who it is about ("Nadim", "Arif · EBL Visa"), shown under the title. */
  name?: string;
  period: string;
  sections: ReportSection[];
};

/** A table's columns split evenly after a wider first column. */
export function widthsFor(columns: number): string[] {
  if (columns <= 1) return ["100%"];
  const first = columns > 5 ? 24 : 40;
  const rest = (100 - first) / (columns - 1);
  return [`${first}%`, ...Array.from({ length: columns - 1 }, () => `${rest}%`)];
}

/** Every amount a report PDF prints, for the consistency tests (U-CR-025.5). */
export const pdfText = (doc: ReportPdf) =>
  [
    doc.title,
    doc.name,
    doc.period,
    ...doc.sections.flatMap((s) => [
      s.title,
      ...(s.facts ?? []).flat(),
      ...(s.table ? [...s.table.heads, ...s.table.rows.flat(), ...(s.table.total ?? [])] : []),
      s.note,
    ]),
  ]
    .filter(Boolean)
    .join("\n");
