import "server-only";
import { Text, View } from "@react-pdf/renderer";
import { PdfDocument, pdf, renderPdf } from "./document";
import type { PdfFrame } from "./layout";
import { type ReportPdf, type ReportSection, type ReportTable, widthsFor } from "./report";

// D-043, D-045 (UIDD §4.16): an internal report on the shared page: title, name, period, then
// each section's facts and table. No How to pay and no terms (the "report" frame).

function Table({ table }: { table: ReportTable }) {
  const widths = table.widths ?? widthsFor(table.heads.length);
  const row = (cells: string[], style: "head" | "bold" | null, key: string | number) => (
    <View key={key} style={[pdf.row, style ? pdf[style] : {}]} wrap={false}>
      {cells.map((c, i) => (
        <Text
          key={i}
          style={[pdf.cell, { width: widths[i] }, i >= (table.textCols ?? 1) ? pdf.num : {}]}
        >
          {c}
        </Text>
      ))}
    </View>
  );
  return (
    <View>
      {row(table.heads, "head", "head")}
      {table.rows.map((r, i) => row(r, null, i))}
      {table.total && row(table.total, "bold", "total")}
    </View>
  );
}

/** Each section's title, facts, table and note. */
export function Sections({ sections }: { sections: ReportSection[] }) {
  return sections.map((s, i) => (
    <View key={i} style={pdf.section}>
      {s.title && <Text style={pdf.bold}>{s.title}</Text>}
      {s.facts && (
        <View style={{ width: "60%" }}>
          {s.facts.map(([label, value], j) => (
            <View
              key={j}
              style={[pdf.row, s.strongLast && j === s.facts!.length - 1 ? pdf.bold : {}]}
              wrap={false}
            >
              <Text style={[pdf.cell, { width: "60%" }]}>{label}</Text>
              <Text style={[pdf.cell, pdf.num, { width: "40%" }]}>{value}</Text>
            </View>
          ))}
        </View>
      )}
      {s.table && <Table table={s.table} />}
      {s.note && <Text style={[pdf.muted, { marginTop: 2 }]}>{s.note}</Text>}
    </View>
  ));
}

export function ReportDocument({ frame, doc }: { frame: PdfFrame; doc: ReportPdf }) {
  return (
    <PdfDocument
      frame={frame}
      title={[doc.title, doc.name, doc.period].filter(Boolean).join(" — ")}
    >
      <Text style={pdf.title}>{doc.title}</Text>
      {doc.name && <Text style={pdf.bold}>{doc.name}</Text>}
      <Text style={[pdf.muted, { marginBottom: 6 }]}>{doc.period}</Text>
      <Sections sections={doc.sections} />
    </PdfDocument>
  );
}

/** A report as PDF bytes. */
export const renderReportPdf = (frame: PdfFrame, doc: ReportPdf) =>
  renderPdf(<ReportDocument frame={frame} doc={doc} />);
