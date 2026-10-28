import { describe, expect, it, vi } from "vitest";

// U-CR-013.9 (D-032): what a layout, page and entry sheet share in one request is wrapped in
// React's `cache`, so a request loads it once. React only caches inside a server render, so this
// checks the wrapping, not timing. N-6.1: web's loaders are gone; the api loads the books once
// per render with its own memo (apps/api/src/auth/memo.ts, I-N-2.3.3), and web keeps only the
// session and its token here. Nothing here touches the database.
const cached = new Set<unknown>();
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => {
    cached.add(fn);
    return fn;
  },
}));

describe("U-CR-013.9 per-request loaders", () => {
  it("getUser and the api token go through React cache", async () => {
    const [{ getUser }, { accessToken }] = await Promise.all([
      import("@/lib/supabase/server"),
      import("@/api/client"),
    ]);
    for (const [name, fn] of Object.entries({ getUser, accessToken }))
      expect(cached.has(fn), name).toBe(true);
  });
});
