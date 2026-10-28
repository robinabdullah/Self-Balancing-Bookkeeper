import type { Request, Response } from "express";
import type { AuthService } from "../auth/auth.service";

// N-5 (design rule 6): what every `/files/*` route shares. Web's file routes forward the status,
// the body and these headers unchanged (apps/web/src/api/files.ts), so the browser gets what the
// reference's route handlers sent. Ref: src/app/pdf/respond.ts, src/server/export.ts.

/** The query as the reference's routes read it (`URLSearchParams.get`: the first value). */
export const searchOf = (req: Request) => new URL(req.originalUrl, "http://api").searchParams;

/** The signed-in partner's profile, or null: a file route answers anyone else with its own 403. */
export const partnerOrNull = (auth: AuthService) => auth.requirePartner().catch(() => null);

/** A plain-text answer (a refusal), as the reference's `new Response(text, { status })`. */
export function sendText(res: Response, status: number, text: string) {
  res.status(status).type("text/plain").send(text);
}

/** A download, named `name`; never cached. */
export function sendFile(res: Response, body: Uint8Array, type: string, name: string) {
  res
    .set({
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    })
    .send(Buffer.from(body));
}
