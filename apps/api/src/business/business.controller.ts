import { Body, Controller, Delete, Put, UseInterceptors } from "@nestjs/common";
import {
  bankAccountSchema,
  businessDetailsSchema,
  logoSchema,
  pdfTermsSchema,
  templateSchema,
} from "@mbl/domain/validation/business";
import { ResultStatus } from "../action/result-status";
import { byId } from "../action/runner";
import { ZodBody } from "../swagger";
import { BusinessActionsService } from "./business-actions.service";

// N-3.7: Settings → Business (details, logo, message templates, PDF terms; D-039, D-049) and the
// saved bank accounts (UIDD §4.13, §4.14).
@Controller()
@UseInterceptors(ResultStatus)
export class BusinessController {
  constructor(private readonly business: BusinessActionsService) {}

  @Put("business/details")
  @ZodBody(businessDetailsSchema)
  saveBusinessDetails(@Body() input: unknown) {
    return this.business.saveBusinessDetails(input);
  }

  @Put("business/logo")
  @ZodBody(logoSchema)
  saveLogo(@Body() input: unknown) {
    return this.business.saveLogo(input);
  }

  @Put("business/template")
  @ZodBody(templateSchema)
  saveTemplate(@Body() input: unknown) {
    return this.business.saveTemplate(input);
  }

  @Put("business/pdf-terms")
  @ZodBody(pdfTermsSchema)
  savePdfTerms(@Body() input: unknown) {
    return this.business.savePdfTerms(input);
  }

  @Put("bank-accounts")
  @ZodBody(bankAccountSchema)
  saveBankAccount(@Body() input: unknown) {
    return this.business.saveBankAccount(input);
  }

  @Delete("bank-accounts")
  @ZodBody(byId)
  deleteBankAccount(@Body() input: unknown) {
    return this.business.deleteBankAccount(input);
  }
}
