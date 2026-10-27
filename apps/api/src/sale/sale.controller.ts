import { Body, Controller, Delete, Put, UseInterceptors } from "@nestjs/common";
import { saleSchema } from "@mbl/domain/validation/trade";
import { ResultStatus } from "../action/result-status";
import { byId } from "../action/runner";
import { ZodBody } from "../swagger";
import { SaleService } from "./sale.service";

// N-3.4: sale bills (UIDD §4.4), incl. "Received now": add or edit, and Undo.
@Controller("sales")
@UseInterceptors(ResultStatus)
export class SaleController {
  constructor(private readonly sales: SaleService) {}

  @Put()
  @ZodBody(saleSchema)
  saveSale(@Body() input: unknown) {
    return this.sales.saveSale(input);
  }

  @Delete()
  @ZodBody(byId)
  deleteSale(@Body() input: unknown) {
    return this.sales.deleteSale(input);
  }
}
