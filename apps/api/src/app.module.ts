import { Module } from "@nestjs/common";
import { Runner } from "./action/runner";
import { AuthModule } from "./auth/auth.module";
import { BooksService } from "./books/books.service";
import { BusinessService } from "./business/business.service";
import { ConfigModule } from "./config.module";
import { DbModule } from "./db/db.module";
import { HealthController } from "./health.controller";
import { MoneyController } from "./money/money.controller";
import { MoneyService } from "./money/money.service";
import { PurchaseController } from "./purchase/purchase.controller";
import { PurchaseService } from "./purchase/purchase.service";
import { SaleController } from "./sale/sale.controller";
import { SaleService } from "./sale/sale.service";
import { SettingsController } from "./settings/settings.controller";
import { SetupController } from "./setup/setup.controller";
import { SetupService } from "./setup/setup.service";
import { ShellController } from "./shell/shell.controller";

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
  ],
  providers: [
    Runner,
    BooksService,
    BusinessService,
    SetupService,
    MoneyService,
    PurchaseService,
    SaleService,
  ],
})
export class AppModule {}
