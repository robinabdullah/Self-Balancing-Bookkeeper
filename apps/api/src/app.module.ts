import { Module } from "@nestjs/common";
import { Runner } from "./action/runner";
import { AuthModule } from "./auth/auth.module";
import { BooksService } from "./books/books.service";
import { BusinessActionsService } from "./business/business-actions.service";
import { BusinessController } from "./business/business.controller";
import { BusinessService } from "./business/business.service";
import { CardSecretsController } from "./card-secrets/card-secrets.controller";
import { CardSecretsService } from "./card-secrets/card-secrets.service";
import { BillDatesController } from "./cards/bill-dates.controller";
import { BillDatesService } from "./cards/bill-dates.service";
import { ConfigModule } from "./config.module";
import { DbModule } from "./db/db.module";
import { EntriesService } from "./entries/entries.service";
import { HealthController } from "./health.controller";
import { JournalService } from "./journal/journal.service";
import { MoneyController } from "./money/money.controller";
import { MoneyService } from "./money/money.service";
import { MonthsController } from "./months/months.controller";
import { MonthsService } from "./months/months.service";
import { Passkeys } from "./passkeys/passkeys";
import { PasskeysController } from "./passkeys/passkeys.controller";
import { PasskeysService } from "./passkeys/passkeys.service";
import { PurchaseController } from "./purchase/purchase.controller";
import { PurchaseService } from "./purchase/purchase.service";
import { ReturnController } from "./return/return.controller";
import { ReturnService } from "./return/return.service";
import { ReverseController } from "./reverse/reverse.controller";
import { ReverseService } from "./reverse/reverse.service";
import { SaleController } from "./sale/sale.controller";
import { SaleService } from "./sale/sale.service";
import { SettingsController } from "./settings/settings.controller";
import { SetupController } from "./setup/setup.controller";
import { SetupDataService } from "./setup/setup-data.service";
import { SetupService } from "./setup/setup.service";
import { ShellController } from "./shell/shell.controller";
import { ReturnOptionsService } from "./returns/return-options.service";
import { StockService } from "./stock/stock.service";
import { FormViewsController } from "./views/forms.controller";
import { HomeViewsController } from "./views/home.controller";
import { ListViewsController } from "./views/lists.controller";

@Module({
  imports: [ConfigModule, DbModule, AuthModule],
  controllers: [
    HealthController,
    ShellController,
    SettingsController,
    SetupController,
    MoneyController,
    PurchaseController,
    SaleController,
    ReturnController,
    ReverseController,
    MonthsController,
    BillDatesController,
    BusinessController,
    CardSecretsController,
    PasskeysController,
    HomeViewsController,
    ListViewsController,
    FormViewsController,
  ],
  providers: [
    Runner,
    BooksService,
    BusinessService,
    SetupDataService,
    JournalService,
    EntriesService,
    StockService,
    ReturnOptionsService,
    SetupService,
    MoneyService,
    PurchaseService,
    SaleService,
    ReturnService,
    ReverseService,
    MonthsService,
    BillDatesService,
    BusinessActionsService,
    CardSecretsService,
    Passkeys,
    PasskeysService,
  ],
})
export class AppModule {}
