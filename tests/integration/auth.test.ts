import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { requirePartner } from "@/server/auth";
import { localSupabase } from "../e2e/local-supabase";
import { localSql } from "./local-db";

// The session comes from Next cookies, so the test stands in for the Supabase Auth lookup;
// the profiles check runs against local Supabase.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser }));

const sql = localSql();
const { url, serviceRoleKey } = localSupabase();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const userIds: string[] = [];

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
  partner = await authUserWithRole("partner");
  investor = await authUserWithRole("investor");
  noProfile = await authUserWithRole(null);
});

afterAll(async () => {
  await sql`delete from profiles where user_id = any(${userIds})`;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await sql.end();
});

describe("requirePartner (task 1.5)", () => {
  it("I1.5.1 rejects no session and a non-partner role", async () => {
    getUser.mockResolvedValueOnce(null);
    await expect(requirePartner()).rejects.toThrow("Not signed in");

    getUser.mockResolvedValueOnce(investor);
    await expect(requirePartner()).rejects.toThrow("Only partners can do this");

    getUser.mockResolvedValueOnce(noProfile);
    await expect(requirePartner()).rejects.toThrow("Only partners can do this");

    getUser.mockResolvedValueOnce(partner);
    await expect(requirePartner()).resolves.toMatchObject({ userId: partner.id, role: "partner" });
  });
});
