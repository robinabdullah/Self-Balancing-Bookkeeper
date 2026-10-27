import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { type Db, createDb, pgClient } from "@mbl/db/client";
import { CONFIG } from "../config.module";
import type { Config } from "../config";

/** How the api's connections show in `pg_stat_activity`. */
export const APP_NAME = "mbl-api";

/** The one Drizzle client of the api (inject with `@Inject(DB)`). */
export const DB = Symbol("DB");

// N-2.2: the api holds one pool (postgres.js default: 10) and ends it on shutdown, so a restart never
// leaves connections behind. This replaces web's globalThis pool (CR-030) once web stops reading.
@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [CONFIG],
      useFactory: (c: Config) =>
        createDb(pgClient(c.DATABASE_URL, { connection: { application_name: APP_NAME } })),
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onApplicationShutdown() {
    await this.db.$client.end({ timeout: 5 });
  }
}
