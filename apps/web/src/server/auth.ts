import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db } from "@mbl/db";
import { profiles } from "@mbl/db/schema";
import { getUser } from "@/lib/supabase/server";

// SRS §11: every server action re-checks the session and role = partner.
export async function requirePartner() {
  const user = await getUser();
  if (!user) throw new Error("Not signed in");
  const [profile] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.userId, user.id), eq(profiles.role, "partner")));
  if (!profile) throw new Error("Only partners can do this");
  return profile;
}

/** D-037: the signed-in user's profile (theme, and the id + `updatedAt` its action needs). */
export const getProfile = cache(async () => {
  const user = await getUser();
  if (!user) return null;
  const [profile] = await db
    .select({ id: profiles.id, theme: profiles.theme, updatedAt: profiles.updatedAt })
    .from(profiles)
    .where(eq(profiles.userId, user.id));
  return profile ?? null;
});
