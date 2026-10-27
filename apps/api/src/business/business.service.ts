import { Inject, Injectable } from "@nestjs/common";
import { getTableColumns, sql } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { businessProfile } from "@mbl/db/schema";
import { memo } from "../auth/memo";
import { DB } from "../db/db.module";

// Ref: src/server/business.ts (D-039): the business profile (Settings → Business, the app
// name). The logo itself is read only by `/logo`. The rest of the file moves in N-3.7/N-4.

const columns = getTableColumns(businessProfile);
const withoutLogo = Object.fromEntries(
  Object.entries(columns).filter(([key]) => key !== "logo"),
) as Omit<typeof columns, "logo">;

@Injectable()
export class BusinessService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every column but the logo, plus a short hash of it for the `/logo?v=` URL (null: no logo). */
  getBusiness() {
    return memo("business", async () => {
      const [row] = await this.db
        .select({ ...withoutLogo, logoVersion: sql<string | null>`left(md5(logo), 8)` })
        .from(businessProfile)
        .limit(1);
      return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null;
    });
  }
}

export type Business = NonNullable<Awaited<ReturnType<BusinessService["getBusiness"]>>>;
