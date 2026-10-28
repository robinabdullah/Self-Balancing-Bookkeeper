import { Text, View } from "@react-pdf/renderer";
import { PdfDocument, pdf, renderPdf } from "./document";
import type { DocPdf } from "./invoice";
import type { PdfFrame } from "./layout";

// D-042 (UIDD §4.16): the invoice and the money receipt on the shared page: the title with the
// date on the right (and a big CANCELLED when reversed); "Bill to" / "Received with thanks from"
// the customer, with a stamp beside; the lines table and the total in words, or the amount in a
// shaded box; then the ruled sum (and the receipt's "Cleared N%" bar). User feedback 2026-10-11.

const WIDTHS = ["7%", "47%", "10%", "18%", "18%"];
const RED = "#b91c1c";
const GREEN = "#15803d";
const TONE = { green: GREEN, amber: "#b45309", red: RED };
const SHADE = "#f1f5f9";
const LINE = "#cbd5e1";
const HALF = { width: "50%", alignSelf: "flex-end" } as const;

export function DocDocument({ frame, doc }: { frame: PdfFrame; doc: DocPdf }) {
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
      <View
        style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}
      >
        <Text style={pdf.title}>{doc.title}</Text>
        <Text style={pdf.muted}>{doc.date}</Text>
      </View>
      {doc.cancelled && (
        <View style={{ marginTop: 6 }}>
          <Text style={{ fontSize: 22, fontWeight: "bold", color: RED, letterSpacing: 2 }}>
            CANCELLED
          </Text>
          <Text style={{ color: RED }}>{doc.cancelled}</Text>
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 10,
          marginBottom: 12,
        }}
      >
        <View style={{ gap: 2 }}>
          <Text style={pdf.muted}>{doc.to}</Text>
          <Text style={[pdf.bold, { fontSize: 11 }]}>{doc.name}</Text>
          {doc.contact && <Text style={pdf.muted}>{doc.contact}</Text>}
        </View>
        {doc.stamp && (
          <Text
            style={{
              alignSelf: "center",
              border: `2 solid ${TONE[doc.stamp.tone]}`,
              borderRadius: 4,
              color: TONE[doc.stamp.tone],
              fontSize: 13,
              fontWeight: "bold",
              letterSpacing: 1,
              paddingVertical: 4,
              paddingHorizontal: 10,
              transform: "rotate(-6deg)",
            }}
          >
            {doc.stamp.text}
          </Text>
        )}
      </View>

      {doc.table && (
        <View>
          {row(doc.table.heads, "head", "head")}
          {doc.table.rows.map((r, i) => row(r, null, i))}
          {row(doc.table.total, "bold", "total")}
          {/* No italic face is embedded: the words read muted instead. */}
          <Text style={[pdf.muted, { marginTop: 4, textAlign: "right" }]}>{doc.table.words}</Text>
        </View>
      )}
      {doc.amount && (
        <View
          style={{
            padding: 12,
            gap: 2,
            backgroundColor: SHADE,
            border: `1 solid ${LINE}`,
            borderRadius: 4,
          }}
        >
          <Text style={[pdf.bold, { fontSize: 20 }]}>{doc.amount.value}</Text>
          {/* No italic face is embedded: the words read muted instead. */}
          <Text style={[pdf.muted, { fontSize: 10 }]}>{doc.amount.words}</Text>
        </View>
      )}

      {doc.summary.length > 0 && (
        <View style={[pdf.section, HALF]} wrap={false}>
          {doc.summary.map((l) => (
            <View
              key={l.label}
              style={[
                { flexDirection: "row", justifyContent: "space-between" },
                l.rule ? { borderTop: "1 solid #0f172a", marginTop: 3, paddingTop: 3 } : {},
              ]}
            >
              <Text style={l.strong ? [pdf.bold, { fontSize: 11 }] : pdf.muted}>{l.label}</Text>
              <Text style={l.strong ? [pdf.bold, { fontSize: 11 }] : {}}>{l.value}</Text>
            </View>
          ))}
        </View>
      )}
      {doc.cleared && (
        <View style={[HALF, { marginTop: 10, gap: 3 }]} wrap={false}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: LINE }}>
            <View
              style={{
                width: `${doc.cleared.pct}%`,
                height: 6,
                borderRadius: 3,
                backgroundColor: GREEN,
              }}
            />
          </View>
          <Text style={[pdf.muted, { textAlign: "right", fontSize: 8 }]}>{doc.cleared.label}</Text>
        </View>
      )}
    </PdfDocument>
  );
}

/** The invoice or receipt as PDF bytes. */
export const renderDocPdf = (frame: PdfFrame, doc: DocPdf) =>
  renderPdf(<DocDocument frame={frame} doc={doc} />);
