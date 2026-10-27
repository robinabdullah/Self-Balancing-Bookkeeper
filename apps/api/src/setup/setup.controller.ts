import { Body, Controller, Delete, Param, Put, UseInterceptors } from "@nestjs/common";
import type { SetupKind } from "@mbl/domain/setup";
import {
  activeSchema,
  cardSchema,
  customerSchema,
  modelSchema,
  personSchema,
  supplierSchema,
} from "@mbl/domain/validation/setup";
import { ResultStatus } from "../action/result-status";
import { byId } from "../action/runner";
import { ZodBody } from "../swagger";
import { SetupService } from "./setup.service";

// N-3.1: the Setup lists' writes (UIDD §4.11). The body carries the row's id and, on an edit, the
// `updatedAt` the form saw; the runner validates it. An unknown `kind` throws (500), as before.
@Controller("setup")
@UseInterceptors(ResultStatus)
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Put("person")
  @ZodBody(personSchema)
  savePerson(@Body() input: unknown) {
    return this.setup.savePerson(input);
  }

  @Put("card")
  @ZodBody(cardSchema)
  saveCard(@Body() input: unknown) {
    return this.setup.saveCard(input);
  }

  @Put("customer")
  @ZodBody(customerSchema)
  saveCustomer(@Body() input: unknown) {
    return this.setup.saveCustomer(input);
  }

  @Put("supplier")
  @ZodBody(supplierSchema)
  saveSupplier(@Body() input: unknown) {
    return this.setup.saveSupplier(input);
  }

  @Put("model")
  @ZodBody(modelSchema)
  saveModel(@Body() input: unknown) {
    return this.setup.saveModel(input);
  }

  @Put(":kind/active")
  @ZodBody(activeSchema)
  setActive(@Param("kind") kind: SetupKind, @Body() input: unknown) {
    return this.setup.setActive(kind, input);
  }

  @Delete(":kind")
  @ZodBody(byId)
  removeRow(@Param("kind") kind: SetupKind, @Body() input: unknown) {
    return this.setup.removeRow(kind, input);
  }
}
