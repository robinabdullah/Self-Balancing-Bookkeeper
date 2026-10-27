import { randomUUID } from "node:crypto";
import { type ReactElement, createElement } from "react";
import { type DocumentProps, Text } from "@react-pdf/renderer";
import { extractText } from "unpdf";
import { describe, expect, it } from "vitest";
import { businessDetailsSchema, pdfTermsSchema, TERMS_MAX } from "@/lib/validation/business";
import { PdfDocument, renderPdf } from "@/pdf/document";
import { type PdfBusiness, type PdfKind, pdfFrame } from "@/pdf/layout";

// CR-029 (D-049, D-050; UIDD §4.13, §4.16): each customer document prints only its own terms,
// then the footer line apart; the Sales report prints neither. Each box is multi-line, at most
// 1,000 characters. U-CR-029.2 (the rendered "Terms & conditions" box) is in invoice-pdf.test.ts.
const shop = (terms: Partial<PdfBusiness>) => ({ name: "Test Shop", ...terms }) as PdfBusiness;

const all = shop({
  invoiceTerms: "7-day replacement\n\n  Box and accessories intact  \r\nNo cash refund",
  receiptTerms: "Cheques are subject to clearance",
  statementTerms: "Report any difference within 7 days",
  footer: "Thank you for your business",
});

describe("CR-029 per-document PDF terms", () => {
  it("U-CR-029.1 each kind gets only its own terms + the footer; blank prints nothing; ≤ 1,000 characters", () => {
    // Multi-line: each line its own line, trimmed, blank lines dropped; the footer line apart.
    const parts = (b: PdfBusiness | null, kind: PdfKind) => {
      const { terms, footer } = pdfFrame(b, kind, []);
      return { terms, footer };
    };
    const thanks = ["Thank you for your business"];
    expect(parts(all, "invoice")).toEqual({
      terms: ["7-day replacement", "Box and accessories intact", "No cash refund"],
      footer: thanks,
    });
    expect(parts(all, "receipt")).toEqual({
      terms: ["Cheques are subject to clearance"],
      footer: thanks,
    });
    expect(parts(all, "statement")).toEqual({
      terms: ["Report any difference within 7 days"],
      footer: thanks,
    });
    // The Sales report is internal: no terms and no footer line.
    expect(parts(all, "report")).toEqual({ terms: [], footer: [] });

    // Empty terms print nothing; the footer line alone still prints.
    const footerOnly = shop({ invoiceTerms: " \n \n", footer: "Thanks" });
    expect(parts(footerOnly, "invoice")).toEqual({ terms: [], footer: ["Thanks"] });
    expect(parts(footerOnly, "receipt")).toEqual({ terms: [], footer: ["Thanks"] });
    expect(parts(shop({}), "statement")).toEqual({ terms: [], footer: [] });
    expect(parts(null, "invoice")).toEqual({ terms: [], footer: [] });

    // The schema: blank → null, 1,000 characters accepted, 1,001 refused, lines kept.
    const id = randomUUID();
    const ok = pdfTermsSchema.parse({
      id,
      invoiceTerms: "x".repeat(TERMS_MAX),
      receiptTerms: "  ",
      statementTerms: " Line 1\nLine 2 ",
      footer: "",
    });
    expect(ok).toEqual({
      id,
      invoiceTerms: "x".repeat(1000),
      receiptTerms: null,
      statementTerms: "Line 1\nLine 2",
      footer: null,
    });
    const tooLong = pdfTermsSchema.safeParse({ id, receiptTerms: "x".repeat(1001) });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]).toMatchObject({
      path: ["receiptTerms"],
      message: "At most 1,000 characters",
    });

    // Details no longer carries the invoice terms or footer line: saving it can't clear them.
    const details = businessDetailsSchema.parse({
      id,
      name: "Test Shop",
      invoiceTerms: "kept",
      footer: "kept",
    });
    expect(details).not.toHaveProperty("invoiceTerms");
    expect(details).not.toHaveProperty("footer");
  });

  it("U-CR-029.3 after a PDF with ':', the next PDF's '1.' still copies as '1.' (fontkit cache)", async () => {
    // This file renders nothing else, so fontkit's glyph cache starts empty: the first PDF has
    // a ":" (drawn from two ".") and no ".", the second has the numbered terms.
    const page = (b: PdfBusiness, body: string) =>
      renderPdf(
        createElement(
          PdfDocument,
          { frame: pdfFrame(b, "receipt", []), title: "t" } as Parameters<typeof PdfDocument>[0],
          createElement(Text, null, body),
        ) as ReactElement<DocumentProps>,
      );
    await page(shop({}), "Saved at 12:30");
    const bytes = await page(shop({ receiptTerms: "Cheques clear later.\nNo refunds" }), "Body");
    const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
    expect(text).toMatch(/Terms & conditions\s*1\.\s*Cheques clear later\.\s*2\.\s*No refunds/);
  }, 30_000);
});
