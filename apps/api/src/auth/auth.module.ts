import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthService } from "./auth.service";
import { JwtGuard } from "./jwt.guard";

@Global()
@Module({
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtGuard }],
  exports: [AuthService],
})
export class AuthModule {}
