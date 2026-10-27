import "server-only";
import { createClient } from "@supabase/supabase-js";

// D-046 (SRS §11): the login password, checked again before card details are shown or a
// fingerprint is set up. A separate client that saves no session, so the signed-in session is
// untouched; the session it opens is signed out at once. 5 wrong tries lock it for 15 minutes per
// user, kept in this server's memory (a restart clears it).

export const MAX_TRIES = 5;
export const LOCK_MINUTES = 15;
export const WRONG_PASSWORD = "Wrong password";
export const LOCKED = `Too many tries — wait ${LOCK_MINUTES} minutes`;

const tries = new Map<string, { fails: number; until: number }>();

export type PasswordCheck = "ok" | "wrong" | "locked";

export async function checkPassword(
  userId: string,
  email: string | undefined,
  password: string,
  now = Date.now(),
): Promise<PasswordCheck> {
  const t = tries.get(userId) ?? { fails: 0, until: 0 };
  if (t.until > now) return "locked";
  if (!email || !password) return fail(userId, t, now);

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error?.status === 429) return "locked"; // Supabase Auth's own limit
  if (error?.status === 400) return fail(userId, t, now); // invalid credentials
  if (error) throw new Error("Couldn't check the password — try again");
  await client.auth.signOut({ scope: "local" });
  tries.delete(userId);
  return "ok";
}

function fail(userId: string, t: { fails: number; until: number }, now: number): PasswordCheck {
  const fails = t.fails + 1;
  tries.set(
    userId,
    fails >= MAX_TRIES ? { fails: 0, until: now + LOCK_MINUTES * 60_000 } : { fails, until: 0 },
  );
  return "wrong";
}

/** Tests only: forget the tries. */
export function resetPasswordTries() {
  tries.clear();
}
