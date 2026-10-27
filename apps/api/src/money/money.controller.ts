import { Body, Controller, Delete, Put, UseInterceptors } from "@nestjs/common";
import { moneyEntrySchema } from "@mbl/domain/validation/money-entry";
import { ResultStatus } from "../action/result-status";
import { byId } from "../action/runner";
import { ZodBody } from "../swagger";
import { MoneyService } from "./money.service";

// N-3.2: money entries (UIDD §4.6): add or edit (with the `updatedAt` the form saw), and Undo.
@Controller("money-entries")
@UseInterceptors(ResultStatus)
export class MoneyController {
  constructor(private readonly money: MoneyService) {}

  @Put()
  @ZodBody(moneyEntrySchema)
  saveMoneyEntry(@Body() input: unknown) {
    return this.money.saveMoneyEntry(input);
  }

  @Delete()
  @ZodBody(byId)
  deleteMoneyEntry(@Body() input: unknown) {
    return this.money.deleteMoneyEntry(input);
  }
}
