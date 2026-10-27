"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error?: string };

// UIDD §4.1: email + password. Sign-ups are off in Supabase (SRS §11).
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Wrong email or password" };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  // Local scope: signing out here keeps the partner signed in on their other devices (UIDD §4.1).
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
