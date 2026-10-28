import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { auditLog, profiles } from "@mbl/db/schema";
import { DB } from "../db/db.module";

// Ref: src/server/export.ts (N-4.6): only `lastExport` (the Export page's line). The workbook, the
// `export` audit row and the Excel reports move in N-5.2.

@Injectable()
export class ExportService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** UIDD §4.12: the latest export (time and who), or null. */
  async lastExport() {
    const [last] = await this.db
      .select({ at: auditLog.at, by: profiles.name })
      .from(auditLog)
      .leftJoin(profiles, eq(profiles.userId, auditLog.userId))
      .where(eq(auditLog.action, "export"))
      .orderBy(desc(auditLog.at))
      .limit(1);
    return last ? { at: last.at.toISOString(), by: last.by ?? "someone" } : null;
  }
}
