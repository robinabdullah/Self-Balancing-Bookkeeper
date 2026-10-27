import { createClient } from "@supabase/supabase-js";
import type postgres from "postgres";
import { localSql, migrateLocal } from "../integration/local-db";
import { PARTNER } from "./helpers";
import { localSupabase } from "./local-supabase";

// Seeds the partner login in local Supabase Auth (sign-ups are off, so admin creates it) and
// links it in `profiles` with role = partner (SRS §11).
export default async function globalSetup() {
  await ensurePartner();
  const sql = localSql();
  try {
    await migrateLocal(sql);
    await linkPartner(sql);
  } finally {
    await sql.end();
  }
}

/** The partner's Auth user, if missing (also the parity seed's: its August close names them). */
export async function ensurePartner() {
  const { url, serviceRoleKey } = localSupabase();
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.createUser({ ...PARTNER, email_confirm: true });
  if (error && error.code !== "email_exists") throw error;
}

/** The partner's `profiles` row (also re-added by a spec that empties the tables). */
export async function linkPartner(sql: postgres.Sql) {
  await sql`
    insert into profiles (user_id, name, role)
    select id, 'Test Partner', 'partner' from auth.users where email = ${PARTNER.email}
    on conflict (user_id) do nothing`;
}
