import "server-only";
import type { NextRequest } from "next/server";
import { rowId } from "@/lib/validation/fields";
import { invoicePdf, receiptPdf } from "@/pdf/invoice";
import { renderDocPdf } from "@/pdf/invoice-pdf";
import { pdfFileName } from "@/pdf/layout";
import { loadDocEntry } from "@/server/messages";
import { payIds, pdfContext, pdfResponse, refuseNonPartner } from "./respond";

// D-042 (UIDD §4.16): `/pdf/invoice?id=<sale>` and `/pdf/receipt?id=<customer payment>`, with
// `&pay=<business account ids>` for How to pay. A reversed entry prints CANCELLED; a reversal, or
// an entry of another kind, has no document (404).
export const docGet = (kind: "invoice" | "receipt") =>
  async function GET(request: NextRequest) {
    const refused = await refuseNonPartner();
    if (refused) return refused;
    const q = request.nextUrl.searchParams;
    const id = q.get("id");
    if (!rowId.safeParse(id).success) return new Response(`Bad ${kind} request`, { status: 400 });

    const [entry, { business, frame }] = await Promise.all([
      loadDocEntry(id!),
      pdfContext(kind, payIds(q)),
    ]);
    if (entry?.kind !== kind) return new Response(`No such ${kind}`, { status: 404 });

    const doc = entry.kind === "invoice" ? invoicePdf(entry) : receiptPdf(entry);
    const body = await renderDocPdf(frame, doc);
    return pdfResponse(body, pdfFileName(business, kind, entry.number ?? id!.slice(0, 8)));
  };
