import path from "node:path";
import type { ReactElement, ReactNode } from "react";
import {
  type DocumentProps,
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { PdfFrame } from "./layout";

// D-041 (UIDD §4.16): the A4 page every PDF shares. Noto Sans, with Noto Sans Bengali as its
// fallback for the ৳ glyph. N-5.1: the fonts sit next to this file, and the api's bundle copies
// them next to its main.js (webpack.config.mjs), so `__dirname` finds them in both.

const fonts = path.join(__dirname, "fonts");
for (const family of ["NotoSans", "NotoSansBengali"]) {
  Font.register({
    family,
    fonts: [
      { src: path.join(fonts, `${family}-Regular.ttf`) },
      { src: path.join(fonts, `${family}-Bold.ttf`), fontWeight: "bold" },
    ],
  });
}
// Whole words: no hyphenation in names and numbers.
Font.registerHyphenationCallback((word) => [word]);

// fontkit caches each glyph the first time it meets it, for the life of the server. Embedding a
// font subset meets a composite glyph's parts without their characters (Noto Sans draws ":" from
// two "."), so every later PDF's "." looked right but copied wrong (found in CR-029). Laying out
// every character we print first caches them with their characters.
const PRINTED = `${String.fromCharCode(...Array.from({ length: 95 }, (_, i) => 32 + i))}·–—…−×`;
let warm: Promise<void> | null = null;
const warmFonts = () =>
  (warm ??= Promise.all(
    [400, 700].map(async (fontWeight) => {
      const font = Font.getFont({ fontFamily: "NotoSans", fontWeight });
      await font.load();
      font.data?.layout(PRINTED);
    }),
  ).then(
    () => undefined,
    (e) => {
      warm = null;
      throw e;
    },
  ));

/** A PDF document as bytes; every renderer goes through here. */
export async function renderPdf(doc: ReactElement<DocumentProps>) {
  await warmFonts();
  return renderToBuffer(doc);
}

const MUTED = "#475569";
const LINE = "#cbd5e1";

export const pdf = StyleSheet.create({
  page: {
    fontFamily: ["NotoSans", "NotoSansBengali"],
    fontSize: 9,
    color: "#0f172a",
    paddingTop: 32,
    paddingHorizontal: 36,
    paddingBottom: 56,
  },
  // The logo beside the text, the pair centered on the page (user feedback 2026-10-11).
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingBottom: 10,
    borderBottom: `1 solid ${LINE}`,
  },
  logo: { width: 48, height: 48, objectFit: "contain" },
  // A long address wraps within the page beside the logo: 523 pt of A4 width, less logo and gap.
  brand: { maxWidth: 440, gap: 2 },
  shop: { fontSize: 14, fontWeight: "bold" },
  muted: { color: MUTED },
  title: { fontSize: 12, fontWeight: "bold", marginTop: 14 },
  bold: { fontWeight: "bold" },
  section: { marginTop: 14, gap: 2 },
  // D-050: the terms in a light box, numbered with a hanging indent; the footer line centered.
  terms: {
    marginTop: 14,
    padding: 8,
    gap: 3,
    backgroundColor: "#f8fafc",
    border: `0.5 solid ${LINE}`,
    borderRadius: 4,
  },
  term: { flexDirection: "row" },
  termNo: { width: 14 },
  termText: { flex: 1 },
  thanks: { marginTop: 10, alignItems: "center", color: MUTED },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTop: `1 solid ${LINE}`,
    color: MUTED,
    fontSize: 8,
  },
  row: { flexDirection: "row", borderBottom: `0.5 solid ${LINE}` },
  head: { backgroundColor: "#f1f5f9", fontWeight: "bold" },
  cell: { paddingVertical: 4, paddingHorizontal: 4 },
  num: { textAlign: "right" },
});

/** A PDF of A4 pages: the centered business header, the body, How to pay (when on), the terms
 * under "Terms & conditions" and the centered footer line (D-050), and a page footer with
 * "Generated … · Computer-generated, no signature required" and "Page x / y" on every page. */
export function PdfDocument({
  frame,
  title,
  children,
}: {
  frame: PdfFrame;
  title: string;
  children: ReactNode;
}) {
  return (
    <Document title={title} author={frame.name} creator={frame.name} producer={frame.name}>
      <Page size="A4" style={pdf.page}>
        <View style={pdf.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image has no alt text */}
          {frame.logo && <Image src={frame.logo} style={pdf.logo} />}
          <View style={pdf.brand}>
            <Text style={pdf.shop}>{frame.name}</Text>
            {frame.lines.map((l) => (
              <Text key={l} style={pdf.muted}>
                {l}
              </Text>
            ))}
          </View>
        </View>

        {children}

        {frame.howToPay.length > 0 && (
          <View style={pdf.section} wrap={false}>
            <Text style={pdf.bold}>How to pay</Text>
            {frame.howToPay.map((fields, i) => (
              <View key={i} style={{ marginTop: 4 }}>
                {fields.map(([label, value]) => (
                  <Text key={label}>
                    <Text style={pdf.muted}>{label}: </Text>
                    {value}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}
        {frame.terms.length > 0 && (
          <View style={pdf.terms} wrap={false}>
            <Text style={pdf.bold}>{"Terms & conditions"}</Text>
            {frame.terms.map((t, i) => (
              <View key={i} style={pdf.term}>
                <Text style={pdf.termNo}>{`${i + 1}.`}</Text>
                <Text style={pdf.termText}>{t}</Text>
              </View>
            ))}
          </View>
        )}
        {frame.footer.length > 0 && (
          <View style={pdf.thanks} wrap={false}>
            {frame.footer.map((t, i) => (
              <Text key={i}>{t}</Text>
            ))}
          </View>
        )}

        <View style={pdf.footer} fixed>
          {/* No signature lines: the PDF says so instead (user feedback 2026-10-11). */}
          <Text>{frame.generated} · Computer-generated, no signature required</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
