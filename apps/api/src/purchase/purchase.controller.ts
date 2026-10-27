import { Body, Controller, Delete, Put, UseInterceptors } from "@nestjs/common";
import { purchaseSchema } from "@mbl/domain/validation/trade";
import { ResultStatus } from "../action/result-status";
import { byId } from "../action/runner";
import { ZodBody } from "../swagger";
import { PurchaseService } from "./purchase.service";

// N-3.3: purchases (UIDD §4.3): add or edit (with the `updatedAt` the form saw), and Undo.
@Controller("purchases")
@UseInterceptors(ResultStatus)
export class PurchaseController {
  constructor(private readonly purchases: PurchaseService) {}

  @Put()
  @ZodBody(purchaseSchema)
  savePurchase(@Body() input: unknown) {
    return this.purchases.savePurchase(input);
  }

  @Delete()
  @ZodBody(byId)
  deletePurchase(@Body() input: unknown) {
    return this.purchases.deletePurchase(input);
  }
}
