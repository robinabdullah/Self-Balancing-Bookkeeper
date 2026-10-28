import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/public";
import { BusinessService } from "../business/business.service";
import { sendText } from "./respond";

// Ref: src/app/logo/route.ts (N-5.3). D-039: the business logo, public (the login page shows it)
// and cached for a year: its URL carries a hash of it (`/logo?v=`, `logoSrc`), so a new logo is a
// new URL. Web's `/logo` forwards it.
@Controller("files")
export class LogoController {
  constructor(private readonly business: BusinessService) {}

  @Public()
  @Get("logo")
  async logo(@Res() res: Response) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(
      (await this.business.getLogo()) ?? "",
    );
    if (!match) return sendText(res, 404, "No logo");
    res
      .set({ "Content-Type": match[1], "Cache-Control": "public, max-age=31536000, immutable" })
      .send(Buffer.from(match[2], "base64"));
  }
}
