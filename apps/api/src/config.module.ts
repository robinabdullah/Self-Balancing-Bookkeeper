import { Global, Module } from "@nestjs/common";
import { loadConfig } from "./config";

/** The checked environment (inject with `@Inject(CONFIG)`). */
export const CONFIG = Symbol("CONFIG");

@Global()
@Module({ providers: [{ provide: CONFIG, useFactory: () => loadConfig() }], exports: [CONFIG] })
export class ConfigModule {}
