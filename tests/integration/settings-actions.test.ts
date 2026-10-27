import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ShellView } from "../../apps/api/src/shell/shell.controller";
import { type TestUser, as, deleteUsers, signedInUser, startApi } from "./api";
import { localSql } from "./local-db";

// CR-017 (D-037; UIDD §4.13): Settings → Theme is saved on the user's own profile and audited.
// N-2.5: through the api as Partner A (the facade keeps the old names), with real sign-ins. A
// theme posts nothing, so the books stay balanced.
const sql = localSql();
let app: INestApplication;
type Partner = TestUser & { id: string; updatedAt: string };
let a: Partner;
let b: Partner;

async function partner(name: string): Promise<Partner> {
  const user = await signedInUser(sql, "partner", name);
  const [p] = await sql<{ updatedAt: Date }[]>`
    select updated_at as "updatedAt" from profiles where id = ${user.profileId}`;
  return { ...user, id: user.profileId!, updatedAt: p.updatedAt.toISOString() };
}

beforeAll(async () => {
  app = await startApi();
  a = await partner("Partner A");
  b = await partner("Partner B");
});

beforeEach(async () => {
  await sql`truncate audit_log`;
});

afterAll(async () => {
  await sql`truncate audit_log`;
  await app.close();
  await deleteUsers(sql);
  await sql.end();
});

const themeOf = async (id: string) =>
  (await sql<{ theme: string }[]>`select theme from profiles where id = ${id}`)[0].theme;
const setTheme = (input: unknown) => as(app, a).setTheme(input);

describe("CR-017 Settings → Theme", () => {
  it("I-CR-017.1 a new profile starts on Night Owl; a change is saved and audited", async () => {
    expect(await themeOf(a.id)).toBe("night_owl");
    const result = await setTheme({ id: a.id, updatedAt: a.updatedAt, theme: "light" });
    expect(result.status).toBe("ok");
    expect(await themeOf(a.id)).toBe("light");
    const audit = await sql<
      { table: string; action: string; before: { theme: string }; after: { theme: string } }[]
    >`
      select "table", action, before, after from audit_log`;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      table: "profiles",
      action: "update",
      before: { theme: "night_owl" },
      after: { theme: "light" },
    });
    expect((await as(app, a).getProfile())?.theme).toBe("light");
    if (result.status === "ok") a.updatedAt = result.updatedAt!;
    const { balance } = await as(app, a).read<ShellView>("/views/shell");
    expect(balance.difference).toBe(0);
  });

  it("I-CR-017.1 a partner can't change the other partner's theme", async () => {
    const result = await setTheme({ id: b.id, updatedAt: b.updatedAt, theme: "dark" });
    expect(result).toMatchObject({ status: "invalid", errors: { form: expect.any(String) } });
    expect(await themeOf(b.id)).toBe("night_owl");
    expect(await sql`select 1 from audit_log`).toHaveLength(0);
  });

  it("I-CR-017.1 an unknown theme is refused; a stale updatedAt is a conflict", async () => {
    const bad = await setTheme({ id: a.id, updatedAt: a.updatedAt, theme: "solarized" });
    expect(bad.status).toBe("invalid");
    const stale = await setTheme({
      id: a.id,
      updatedAt: new Date(0).toISOString(),
      theme: "dark",
    });
    expect(stale.status).toBe("conflict");
    expect(await themeOf(a.id)).toBe("light");
  });
});
