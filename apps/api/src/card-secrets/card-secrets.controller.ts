import { Body, Controller, Delete, Put, UseInterceptors } from "@nestjs/common";
import { cardDetailsSchema } from "@mbl/domain/validation/card-secrets";
import { ResultStatus } from "../action/result-status";
import { byId } from "../action/runner";
import { ZodBody } from "../swagger";
import { CardSecretsService } from "./card-secrets.service";

// N-3.8: a saved card number (D-046, D-054, D-067; UIDD §4.14): add or edit, and remove. Only
// the masked rows and the reveal (still web's route until N-5.3) ever show a value.
@Controller("card-secrets")
@UseInterceptors(ResultStatus)
export class CardSecretsController {
  constructor(private readonly secrets: CardSecretsService) {}

  @Put()
  @ZodBody(cardDetailsSchema)
  saveCardDetails(@Body() input: unknown) {
    return this.secrets.saveCardDetails(input);
  }

  @Delete()
  @ZodBody(byId)
  removeCardDetails(@Body() input: unknown) {
    return this.secrets.removeCardDetails(input);
  }
}
