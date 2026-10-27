import { Body, Controller, Delete, Put, UseInterceptors } from "@nestjs/common";
import { returnSchema } from "@mbl/domain/validation/trade";
import { ResultStatus } from "../action/result-status";
import { byId } from "../action/runner";
import { ZodBody } from "../swagger";
import { ReturnService } from "./return.service";

// N-3.5: customer and purchase returns (UIDD §4.5): add or edit, and Undo.
@Controller("returns")
@UseInterceptors(ResultStatus)
export class ReturnController {
  constructor(private readonly returns: ReturnService) {}

  @Put()
  @ZodBody(returnSchema)
  saveReturn(@Body() input: unknown) {
    return this.returns.saveReturn(input);
  }

  @Delete()
  @ZodBody(byId)
  deleteReturn(@Body() input: unknown) {
    return this.returns.deleteReturn(input);
  }
}
