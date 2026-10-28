import { Text, View } from "@react-pdf/renderer";
import { PdfDocument, pdf, renderPdf } from "./document";
import type { PdfFrame } from "./layout";
import { Sections } from "./report-pdf";
import type { StatementPdf } from "./statement";

// D-041 (UIDD §4.16): the due statement on the shared page: title, account, period, the table
// (Opening, entries, Totals, Closing) and the closing line; D-045: then the By model tables.

const WIDTHS = ["15%", "37%", "16%", "16%", "16%"];

export function StatementDocument({ frame, doc }: { frame: PdfFrame; doc: StatementPdf }) {
  const row = (cells: string[], style: "head" | "bold" | null, key: string | number) => (
    <View key={key} style={[pdf.row, style ? pdf[style] : {}]} wrap={false}>
      {cells.map((c, i) => (
        <Text key={i} style={[pdf.cell, { width: WIDTHS[i] }, i >= 2 ? pdf.num : {}]}>
          {c}
        </Text>
      ))}
    </View>
  );
  return (
    <PdfDocument frame={frame} title={`${doc.title} — ${doc.name}`}>
      <Text style={pdf.title}>{doc.title}</Text>
      <Text style={pdf.bold}>{doc.name}</Text>
      <Text style={[pdf.muted, { marginBottom: 10 }]}>{doc.period}</Text>
      <View>
        {row(doc.heads, "head", "head")}
        {doc.rows.map((r, i) => row(r.cells, r.strong ? "bold" : null, i))}
      </View>
      <Text style={[pdf.bold, { fontSize: 11, marginTop: 12 }]}>{doc.closing}</Text>
      {doc.sections && <Sections sections={doc.sections} />}
    </PdfDocument>
  );
}

/** The statement as PDF bytes. */
export const renderStatementPdf = (frame: PdfFrame, doc: StatementPdf) =>
  renderPdf(<StatementDocument frame={frame} doc={doc} />);
