import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as enums from "@mbl/domain/enums";
import { themes } from "@mbl/domain/themes";
import * as schema from "@mbl/db/schema";

// N-1.3 (D-068): packages/domain is the pure core both apps share (the web app now, Nest from
// N-2): no framework, DB or session import, and the schema's enums are built from its lists.
// U-N-1.3.2 is also N-1.4's enum check, now against packages/db (`@mbl/db/schema`).

const DOMAIN = "packages/domain/src";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : [],
  );
}

describe("Domain package (N-1.3)", () => {
  it("U-N-1.3.1 nothing in packages/domain imports the app, a framework, the DB or the session", () => {
    const banned = /from "(@\/|next|react|drizzle-orm|server-only|@supabase|.*apps\/)/;
    const offenders = files(DOMAIN).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => banned.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it("U-N-1.3.2 every pgEnum in the schema is built from its domain list", () => {
    const pairs: [{ enumValues: readonly string[] }, readonly string[]][] = [
      [schema.profileRole, enums.PROFILE_ROLE_VALUES],
      [schema.theme, themes],
      [schema.cardNetwork, enums.CARD_NETWORK_VALUES],
      [schema.personKind, enums.PERSON_KIND_VALUES],
      [schema.purchaseSource, enums.PURCHASE_SOURCE_VALUES],
      [schema.returnKind, enums.RETURN_KIND_VALUES],
      [schema.refundTo, enums.REFUND_TO_VALUES],
      [schema.returnReason, enums.RETURN_REASON_VALUES],
      [schema.moneyType, enums.MONEY_TYPE_VALUES],
      [schema.paySource, enums.PAY_SOURCE_VALUES],
      [schema.settleMode, enums.SETTLE_MODE_VALUES],
      [schema.openingKind, enums.OPENING_KIND_VALUES],
      [schema.allocationKind, enums.ALLOCATION_KIND_VALUES],
      [schema.auditAction, enums.AUDIT_ACTION_VALUES],
    ];
    for (const [pg, list] of pairs) expect(pg.enumValues).toEqual(list);
    // Every enum the schema exports is covered above.
    const all = Object.values(schema).filter((v) => typeof v === "function" && "enumValues" in v);
    expect(all).toHaveLength(pairs.length);
  });
});
