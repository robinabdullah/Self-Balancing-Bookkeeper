import { Body, Controller, Delete, Put, UseInterceptors } from "@nestjs/common";
import { cardBillDateSchema } from "@mbl/domain/validation/setup";
import { ResultStatus } from "../action/result-status";
import { byId } from "../action/runner";
import { ZodBody } from "../swagger";
import { BillDatesService } from "./bill-dates.service";

// N-3.7: a card bill's real statement and due dates (UIDD §4.8): add or edit, and Undo.
@Controller("cards/bill-dates")
@UseInterceptors(ResultStatus)
export class BillDatesController {
  constructor(private readonly billDates: BillDatesService) {}

  @Put()
  @ZodBody(cardBillDateSchema)
  saveBillDates(@Body() input: unknown) {
    return this.billDates.saveBillDates(input);
  }

  @Delete()
  @ZodBody(byId)
  deleteBillDates(@Body() input: unknown) {
    return this.billDates.deleteBillDates(input);
  }
}
