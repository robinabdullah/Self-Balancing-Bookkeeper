import { randomUUID } from "node:crypto";
import type { INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createClient } from "@supabase/supabase-js";
import type postgres from "postgres";
import request from "supertest";
import type { Result } from "@mbl/domain/result";
import type { Me } from "../../apps/api/src/shell/shell.controller";
import type { Jsonify } from "../../apps/web/src/api/jsonify";
import { setupApp } from "../../apps/api/src/app";
import { AppModule } from "../../apps/api/src/app.module";
import { type Config, loadConfig } from "../../apps/api/src/config";
import { CONFIG } from "../../apps/api/src/config.module";
import { localSupabase } from "../e2e/local-supabase";

// N-2.2/N-2.3: the integration facade. The api runs in-process (`Test.createTestingModule`)
// with the same setup as main.ts, against local Supabase; tests call it over HTTP with
// supertest, as signed-in users with real tokens from local Supabase Auth.

/** A started api; `config` overrides the checked environment, `controllers` adds test routes. */
export async function startApi(
  config: Partial<Config> = {},
  controllers: Type[] = [],
): Promise<INestApplication> {
  const cfg = { ...loadConfig(), ...config };
  const ref = await Test.createTestingModule({ imports: [AppModule], controllers })
    .overrideProvider(CONFIG)
    .useValue(cfg)
    .compile();
  const app = setupApp(ref.createNestApplication({ bodyParser: false, logger: false }), cfg);
  await app.init();
  return app;
}

export type TestUser = { userId: string; profileId: string | null; email: string; token: string };

const created: string[] = [];
const supabase = () => {
  const { url, anonKey, serviceRoleKey } = localSupabase();
  const options = { auth: { persistSession: false } };
  return {
    admin: createClient(url, serviceRoleKey, options),
    anon: createClient(url, anonKey, options),
  };
};

/**
 * A new Auth user with this role's `profiles` row (none for null), signed in: `token` is the
 * access token local Supabase Auth issued, as web forwards it.
 */
export async function signedInUser(
  sql: postgres.Sql,
  role: "partner" | "investor" | null,
  name = "Test",
): Promise<TestUser> {
  const { admin, anon } = supabase();
  const email = `api-${randomUUID()}@test.local`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user.id);
  const [profile] = role
    ? await sql<{ id: string }[]>`
        insert into profiles (user_id, name, role) values (${data.user.id}, ${name}, ${role})
        returning id`
    : [];
  const session = await anon.auth.signInWithPassword({ email, password });
  if (session.error) throw session.error;
  return {
    userId: data.user.id,
    profileId: profile?.id ?? null,
    email,
    token: session.data.session.access_token,
  };
}

/** Removes the users `signedInUser` made (their profiles first). */
export async function deleteUsers(sql: postgres.Sql) {
  const ids = created.splice(0);
  if (!ids.length) return;
  await sql`delete from profiles where user_id in ${sql(ids)}`;
  const { admin } = supabase();
  for (const id of ids) await admin.auth.admin.deleteUser(id);
}

/**
 * The old server-function names, called as `user` through the api with a JSON round trip, as
 * web's thin proxies call it (N-2.4). Later steps add theirs.
 */
export function as(app: INestApplication, user: TestUser) {
  const http = () => request(app.getHttpServer());
  const auth = { Authorization: `Bearer ${user.token}` };
  /** A read's body (null when the api sent null); throws on any other status than 200. */
  const read = async <T>(path: string): Promise<T> => {
    const res = await http().get(path).set(auth);
    if (res.status !== 200) throw new Error(`GET ${path}: ${res.status}`);
    return (res.text ? JSON.parse(res.text) : null) as T;
  };
  /** A write's `Result` (200/409/422), as web's `write()` takes it; throws on anything else. */
  const write = async (method: "post" | "put" | "delete", path: string, body: unknown) => {
    const res = await http()
      [method](path)
      .set(auth)
      .send(body as object);
    if (![200, 409, 422].includes(res.status)) throw new Error(`${method} ${path}: ${res.status}`);
    return res.body as Result;
  };
  return {
    read,
    write,
    getProfile: () => read<Jsonify<Me>>("/me"),
    setTheme: (input: unknown) => write("put", "/me/theme", input),
  };
}
