import { Body, Controller, Delete, HttpCode, Post, UseInterceptors } from "@nestjs/common";
import { ResultStatus } from "../action/result-status";
import { byId } from "../action/runner";
import { ZodBody } from "../swagger";
import { PasskeysService } from "./passkeys.service";

// N-3.8: Settings → Fingerprint unlock (D-046; UIDD §4.13): set-up (the password, then the
// browser's answer), remove, and a reveal's options. The set-up and remove answers are `Result`s
// (200/422); the reveal's options are plain JSON, or an empty body when there is no passkey.
@Controller("passkeys")
export class PasskeysController {
  constructor(private readonly passkeys: PasskeysService) {}

  @Post("setup-options")
  @UseInterceptors(ResultStatus)
  fingerprintSetupOptions(@Body() input: unknown) {
    return this.passkeys.fingerprintSetupOptions(input);
  }

  @Post()
  @UseInterceptors(ResultStatus)
  registerFingerprint(@Body() response: unknown) {
    return this.passkeys.registerFingerprint(response);
  }

  @Delete()
  @UseInterceptors(ResultStatus)
  @ZodBody(byId)
  removeFingerprint(@Body() input: unknown) {
    return this.passkeys.removeFingerprint(input);
  }

  @Post("reveal-options")
  @HttpCode(200)
  revealOptions() {
    return this.passkeys.revealOptions();
  }
}
