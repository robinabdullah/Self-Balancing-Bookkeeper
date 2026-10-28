import { Body, Controller, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { REVEAL_SECONDS, REVEAL_WINDOW_COOKIE } from "@mbl/domain/card-secrets";
import { rowId } from "@mbl/domain/validation/fields";
import { AuthService } from "../auth/auth.service";
import { partnerOrNull } from "../files/respond";
import { Passkeys } from "../passkeys/passkeys";
import { CardRevealService } from "./card-reveal.service";

// Ref: src/app/(app)/cards/[id]/reveal/route.ts (N-5.3). D-046 (SRS §11): one saved number of a
// card, after a fingerprint (never a password, D-052), or within the 30 s window that fingerprint
// opened (D-054: an httpOnly cookie, this browser only). POST, never cached (`no-store`); an error
// never echoes what was sent. Web's route forwards only the `card_reveal` cookie in and this
// `Set-Cookie` back.
const NO_STORE = { "Cache-Control": "no-store" };

@Controller("cards")
export class CardRevealController {
  constructor(
    private readonly auth: AuthService,
    private readonly reveals: CardRevealService,
    private readonly passkeys: Passkeys,
  ) {}

  @Post(":id/reveal")
  async reveal(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const json = (status: number, value: unknown) => res.status(status).set(NO_STORE).json(value);
    const partner = await partnerOrNull(this.auth);
    if (!partner) return json(403, { error: "Only partners can see card details" });
    if (!rowId.safeParse(id).success) return json(404, { error: "No such card" });
    const result = await this.reveals.revealCardDetails(
      partner.userId,
      id,
      body ?? null,
      req.headers.cookie ?? null,
    );
    if (!("details" in result)) return json(result.status, { error: result.error });
    if (result.window) {
      const secure = this.passkeys.relyingParty().origin.startsWith("https:") ? "; Secure" : "";
      res.append(
        "Set-Cookie",
        `${REVEAL_WINDOW_COOKIE}=${result.window}; Max-Age=${REVEAL_SECONDS}; Path=/cards; HttpOnly; SameSite=Strict${secure}`,
      );
    }
    json(200, result.details);
  }
}
