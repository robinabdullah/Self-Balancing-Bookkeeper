import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Result } from "@mbl/domain/result";
import { createClient } from "@/lib/supabase/server";
import type { Jsonify } from "./jsonify";

// N-2.4 (D-068): web's server calls the api (127.0.0.1, never the browser). Each call carries:
// - the Supabase access token from the session cookie (proxy.ts has already refreshed it);
// - the browser's host, protocol and user agent (passkeys and audit rows need them);
// - on reads, one X-Render-Id per page render, so the api loads the books once per render.
// A read's 401 → /login and 404 → not found; a write's 200/409/422 body is its `Result`.
// Anything else throws, which a form shows as "Not saved — tap Save again". Nothing is retried.

const TIMEOUT_MS = 15_000;
const renderId = cache(() => randomUUID());

/** The session's access token, or null when signed out (once per request). */
export const accessToken = cache(async () => {
  const { data } = await (await createClient()).auth.getSession();
  return data.session?.access_token ?? null;
});

async function send(method: string, path: string, body?: unknown) {
  await cookies(); // request-time only: `next build` never calls the api (design rule 11)
  const [h, token] = await Promise.all([headers(), accessToken()]);
  // Only what the browser's request had: the api applies the reference's own defaults.
  const sent = {
    "X-Forwarded-Host": h.get("x-forwarded-host") ?? h.get("host"),
    "X-Forwarded-Proto": h.get("x-forwarded-proto"),
    "User-Agent": h.get("user-agent"),
  };
  const forwarded = Object.fromEntries(
    Object.entries(sent).filter((e): e is [string, string] => e[1] != null),
  );
  if (token) forwarded.Authorization = `Bearer ${token}`;
  if (method === "GET") forwarded["X-Render-Id"] = renderId();
  if (body !== undefined) forwarded["Content-Type"] = "application/json";
  return fetch(`${process.env.API_URL}${path}`, {
    method,
    headers: forwarded,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** A read; 401 → /login, 404 → the not-found page. */
export async function api<T>(path: string): Promise<Jsonify<T>> {
  const res = await send("GET", path);
  if (res.status === 401) redirect("/login");
  return body(res, path);
}

/** A read that is null when signed out, where a redirect would loop (the root layout, /login). */
export async function apiOrNull<T>(path: string): Promise<Jsonify<T> | null> {
  const res = await send("GET", path);
  return res.status === 401 ? null : body(res, path);
}

async function body(res: Response, path: string) {
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`api GET ${path}: ${res.status}`);
  const text = await res.text(); // the api sends null as an empty body
  return text ? JSON.parse(text) : null;
}

/** A write's `Result` (200/409/422), without revalidating (e.g. passkey options). */
export async function call<T = Result>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await send(method, path, body);
  if (![200, 409, 422].includes(res.status))
    throw new Error(`api ${method} ${path}: ${res.status}`);
  return res.json();
}

/** A write through the api's runner; on ok, every page shows the change (as runAction did). */
export async function write(method: string, path: string, body: unknown): Promise<Result> {
  const result = await call(method, path, body);
  if (result.status === "ok") revalidatePath("/", "layout");
  return result;
}
