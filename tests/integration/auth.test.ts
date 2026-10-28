import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthService } from "../../apps/api/src/auth/auth.service";
import { localSupabase } from "../e2e/local-supabase";
import { startApi } from "./api";
import { localSql } from "./local-db";
import { service } from "./services";

// The profiles check runs against local Supabase. N-6.1: it is the api's (`AuthService`), with
// the signed-in user as its request context holds it (the guard sets it from the token).
const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const userIds: string[] = [];
let app: INestApplication;

async function authUserWithRole(role: "partner" | "investor" | null) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `auth-${randomUUID()}@test.local`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);
  if (role) {
    await sql`insert into profiles (user_id, name, role) values (${data.user.id}, 'Test', ${role})`;
  }
  return data.user;
}

let partner: { id: string };
let investor: { id: string };
let noProfile: { id: string };
beforeAll(async () => {
  app = await startApi();
  partner = await authUserWithRole("partner");
  investor = await authUserWithRole("investor");
  noProfile = await authUserWithRole(null);
});

afterAll(async () => {
  await app.close();
  await sql`delete from profiles where user_id = any(${userIds})`;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await sql.end();
});

const requirePartner = (userId: string | null) => service(app, AuthService, userId).requirePartner();

describe("requirePartner (task 1.5)", () => {
  it("I1.5.1 rejects no session and a non-partner role", async () => {
    await expect(requirePartner(null)).rejects.toThrow("Not signed in");
    await expect(requirePartner(investor.id)).rejects.toThrow("Only partners can do this");
    await expect(requirePartner(noProfile.id)).rejects.toThrow("Only partners can do this");
    await expect(requirePartner(partner.id)).resolves.toMatchObject({
      userId: partner.id,
      role: "partner",
    });
  });
});
