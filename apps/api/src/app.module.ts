import { Module } from "@nestjs/common";
import { Runner } from "./action/runner";
import { AuthModule } from "./auth/auth.module";
import { BooksService } from "./books/books.service";
import { BusinessService } from "./business/business.service";
import { ConfigModule } from "./config.module";
import { DbModule } from "./db/db.module";
import { HealthController } from "./health.controller";
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
  ],
  providers: [
    Runner,
    BooksService,
    BusinessService,
    SetupService,
  ],
})
export class AppModule {}
