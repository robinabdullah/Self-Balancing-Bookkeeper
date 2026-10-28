import type { NextRequest } from "next/server";
import { REVEAL_WINDOW_COOKIE } from "@mbl/domain/card-secrets";
import { forwardFile } from "@/api/files";

// D-046 (SRS §11): one saved number of a card, after a fingerprint (never a password, D-052), or
// within the 30 s window that fingerprint opened (D-054: an httpOnly cookie, this browser only).
// N-5.3: the api checks and decrypts it (`/cards/<id>/reveal`); only the window's cookie goes in,
// and the api's `Set-Cookie` comes back. A body that isn't a JSON object is sent as `{}`, which the
// api refuses as the reference refused it (400 "Use your fingerprint").
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sent: unknown = await request.json().catch(() => null);
  const body = typeof sent === "object" && sent !== null ? sent : {};
  const window = request.cookies.get(REVEAL_WINDOW_COOKIE)?.value;
  return forwardFile("POST", `/cards/${encodeURIComponent(id)}/reveal`, {
    body,
    cookie: window ? `${REVEAL_WINDOW_COOKIE}=${window}` : undefined,
    setCookie: true,
  });
}
