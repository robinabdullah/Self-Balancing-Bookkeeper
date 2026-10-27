import { REVEAL_SECONDS } from "@mbl/domain/card-secrets";
import { rowId } from "@mbl/domain/validation/fields";
import { requirePartner } from "@/server/auth";
import { REVEAL_WINDOW_COOKIE } from "@/server/card-crypto";
import { revealCardDetails } from "@/server/card-secrets";
import { relyingParty } from "@/server/passkeys";

// D-046 (SRS §11): one saved number of a card, after a fingerprint (never a password, D-052), or
// within the 30 s window that fingerprint opened (D-054: an httpOnly cookie, this browser only).
// POST, never cached (`no-store`); an error never echoes what was sent.
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = (await requirePartner()).userId;
  } catch {
    return Response.json(
      { error: "Only partners can see card details" },
      { status: 403, headers: NO_STORE },
    );
  }
  const { id } = await params;
  if (!rowId.safeParse(id).success)
    return Response.json({ error: "No such card" }, { status: 404, headers: NO_STORE });
  const body = await request.json().catch(() => null);
  const result = await revealCardDetails(userId, id, body, request.headers.get("cookie"));
  if (!("details" in result))
    return Response.json({ error: result.error }, { status: result.status, headers: NO_STORE });
  const headers = new Headers(NO_STORE);
  if (result.window) {
    const secure = (await relyingParty()).origin.startsWith("https:") ? "; Secure" : "";
    headers.append(
      "Set-Cookie",
      `${REVEAL_WINDOW_COOKIE}=${result.window}; Max-Age=${REVEAL_SECONDS}; Path=/cards; HttpOnly; SameSite=Strict${secure}`,
    );
  }
  return Response.json(result.details, { status: 200, headers });
}
