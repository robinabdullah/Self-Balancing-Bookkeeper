import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { Public } from "./auth/public";
import { DB } from "./db/db.module";

@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Up when the DB answers (deploy and Playwright wait on this). */
  @Get()
  async health() {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException("Database unavailable");
    }
    return { ok: true };
  }
}
