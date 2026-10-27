import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@mbl/db";
import { setTheme } from "@/server/actions/settings";
import { getProfile } from "@/server/auth";
import { loadBooks } from "@/server/books";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// CR-017 (D-037; UIDD §4.13): Settings → Theme is saved on the user's own profile and audited.
// The session and `revalidatePath` are stood in for as in action.test.ts. A theme posts nothing,
// so the books stay balanced.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const users: string[] = [];

async function partner(name: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `settings-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  users.push(data.user.id);
  const [p] = await sql<{ id: string; updatedAt: Date }[]>`
    insert into profiles (user_id, name, role) values (${data.user.id}, ${name}, 'partner')
    returning id, updated_at as "updatedAt"`;
  return { userId: data.user.id, id: p.id, updatedAt: p.updatedAt.toISOString() };
}

let a: Awaited<ReturnType<typeof partner>>;
let b: Awaited<ReturnType<typeof partner>>;

beforeAll(async () => {
  a = await partner("Partner A");
  b = await partner("Partner B");
});

beforeEach(async () => {
  getUser.mockResolvedValue({ id: a.userId });
  await sql`truncate audit_log`;
});

afterAll(async () => {
  await sql`truncate audit_log`;
  await sql`delete from profiles where user_id in ${sql(users)}`;
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await sql.end();
  await db.$client.end();
});

const themeOf = async (id: string) =>
  (await sql<{ theme: string }[]>`select theme from profiles where id = ${id}`)[0].theme;

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
    expect((await getProfile())?.theme).toBe("light");
    if (result.status === "ok") a.updatedAt = result.updatedAt!;
    const { books } = await loadBooks();
    expect(books.invariant.difference).toBe(0);
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
