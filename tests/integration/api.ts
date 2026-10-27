import { randomUUID } from "node:crypto";
import type { INestApplication, Provider, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createClient } from "@supabase/supabase-js";
import type postgres from "postgres";
import request from "supertest";
import type { Result } from "@mbl/domain/result";
import type { SetupKind } from "@mbl/domain/setup";
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

/**
 * A started api; `config` overrides the checked environment, `controllers` adds test routes and
 * `providers` what they inject beyond the global modules (e.g. the `Runner`).
 */
export async function startApi(
  config: Partial<Config> = {},
  controllers: Type[] = [],
  providers: Provider[] = [],
): Promise<INestApplication> {
  const cfg = { ...loadConfig(), ...config };
  const ref = await Test.createTestingModule({ imports: [AppModule], controllers, providers })
    .overrideProvider(CONFIG)
    .useValue(cfg)
    .compile();
  const app = setupApp(ref.createNestApplication({ bodyParser: false, logger: false }), cfg);
  // Listening once (an ephemeral port) lets supertest reuse the server for concurrent requests.
  await app.listen(0, "127.0.0.1");
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
  const write = async (
    method: "post" | "put" | "patch" | "delete",
    path: string,
    body: unknown,
  ) => {
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
    // N-3.1: Setup (apps/api/src/setup).
    savePerson: (input: unknown) => write("put", "/setup/person", input),
    saveCard: (input: unknown) => write("put", "/setup/card", input),
    saveCustomer: (input: unknown) => write("put", "/setup/customer", input),
    saveSupplier: (input: unknown) => write("put", "/setup/supplier", input),
    saveModel: (input: unknown) => write("put", "/setup/model", input),
    setActive: (kind: SetupKind, input: unknown) => write("put", `/setup/${kind}/active`, input),
    removeRow: (kind: SetupKind, input: unknown) => write("delete", `/setup/${kind}`, input),
    // N-3.2: money entries (apps/api/src/money).
    saveMoneyEntry: (input: unknown) => write("put", "/money-entries", input),
    deleteMoneyEntry: (input: unknown) => write("delete", "/money-entries", input),
    // N-3.3: purchases (apps/api/src/purchase).
    savePurchase: (input: unknown) => write("put", "/purchases", input),
    deletePurchase: (input: unknown) => write("delete", "/purchases", input),
    // N-3.4: sales (apps/api/src/sale).
    saveSale: (input: unknown) => write("put", "/sales", input),
    deleteSale: (input: unknown) => write("delete", "/sales", input),
    // N-3.5: returns (apps/api/src/return).
    saveReturn: (input: unknown) => write("put", "/returns", input),
    deleteReturn: (input: unknown) => write("delete", "/returns", input),
    // N-3.6: reverse (apps/api/src/reverse); month close and re-open (apps/api/src/months).
    reverseEntry: (input: unknown) => write("put", "/reversals", input),
    closeMonth: (input: unknown) => write("put", "/month-closes", input),
    reopenMonth: (input: unknown) => write("delete", "/month-closes", input),
  };
}

/**
 * N-3.1: an in-process api and a signed-in partner, with the old names bound to them; for files
 * that only need writes to make their data. `close()` stops the api and removes the user.
 */
export async function partnerApi(sql: postgres.Sql, name = "Partner A") {
  const app = await startApi();
  const user = await signedInUser(sql, "partner", name);
  return {
    app,
    user,
    ...as(app, user),
    close: async () => {
      await app.close();
      await deleteUsers(sql);
    },
  };
}
