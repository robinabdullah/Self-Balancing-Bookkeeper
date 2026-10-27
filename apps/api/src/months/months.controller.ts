import { Body, Controller, Delete, Put, UseInterceptors } from "@nestjs/common";
import { ResultStatus } from "../action/result-status";
import { byId } from "../action/runner";
import { ZodBody } from "../swagger";
import { MonthsService, closeSchema } from "./months.service";

// N-3.6: close a month and re-open the latest closed one (SRS §7; UIDD Months).
@Controller("month-closes")
@UseInterceptors(ResultStatus)
export class MonthsController {
  constructor(private readonly months: MonthsService) {}

  @Put()
  @ZodBody(closeSchema)
  closeMonth(@Body() input: unknown) {
    return this.months.closeMonth(input);
  }

  @Delete()
  @ZodBody(byId)
  reopenMonth(@Body() input: unknown) {
    return this.months.reopenMonth(input);
  }
}
