import "server-only";
import { type PdfKind, pdfFrame } from "@/pdf/layout";
import { requirePartner } from "@/server/auth";
import { getBusiness, getLogo, loadBankAccounts } from "@/server/business";

// D-041, D-042: what every `/pdf/*` route shares. Partner-only like the export; GET, since a PDF
// changes nothing (no audit row).

/** A 403 response for anyone but a partner, else null. */
export async function refuseNonPartner() {
  try {
    await requirePartner();
    return null;
  } catch {
    return new Response("Only partners can make PDFs", { status: 403 });
  }
}

/** The business and a `kind` PDF's frame, How to pay listing the picked business accounts
 * (`?pay=`). */
export async function pdfContext(kind: PdfKind, pay: string[]) {
  const [business, logo, accounts] = await Promise.all([
    getBusiness(),
    getLogo(),
    loadBankAccounts(),
  ]);
  const howToPay = accounts.filter((a) => a.owner.kind === "business" && pay.includes(a.id));
  return { business, frame: pdfFrame(business && { ...business, logo }, kind, howToPay) };
}

/** `?pay=` as account ids. */
export const payIds = (q: URLSearchParams) => q.get("pay")?.split(",") ?? [];

export const pdfResponse = (body: Uint8Array, name: string) =>
  new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
