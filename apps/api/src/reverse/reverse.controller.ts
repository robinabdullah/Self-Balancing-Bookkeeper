import { Body, Controller, Put, UseInterceptors } from "@nestjs/common";
import { ResultStatus } from "../action/result-status";
import { ZodBody } from "../swagger";
import { ReverseService, reverseSchema } from "./reverse.service";

// N-3.6: reverse an entry from the Journal (SRS §8): a new entry with `reverses_id`.
@Controller("reversals")
@UseInterceptors(ResultStatus)
export class ReverseController {
  constructor(private readonly reversals: ReverseService) {}

  @Put()
  @ZodBody(reverseSchema)
  reverseEntry(@Body() input: unknown) {
    return this.reversals.reverseEntry(input);
  }
}
