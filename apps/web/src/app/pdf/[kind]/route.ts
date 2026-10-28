import type { NextRequest } from "next/server";
import { forwardFile } from "@/api/files";

// N-5.1 (D-041, D-042, D-043, D-045): the 7 PDFs (invoice, receipt, statement, card, investor,
// sales, pack) are made by the api (`/files/pdf/<kind>`); this route keeps their URLs.
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return forwardFile("GET", `/files/pdf/${encodeURIComponent(kind)}${request.nextUrl.search}`);
}
