import { describe, expect, it, vi } from "vitest";

// U-CR-013.9 (D-032): the loaders a layout, page and entry sheet share are wrapped in React's
// `cache`, so a request loads each once. React only caches inside a server render, so this checks
// the wrapping, not timing. Nothing here touches the database.
const cached = new Set<unknown>();
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => {
    cached.add(fn);
    return fn;
  },
}));

describe("U-CR-013.9 per-request loaders", () => {
  it("loadBooks, loadSetup, loadEntry and getUser go through React cache", async () => {
    const [{ loadBooks }, { loadSetup }, { loadEntry }, { getUser }] = await Promise.all([
      import("@/server/books"),
      import("@/server/setup"),
      import("@/server/journal"),
      import("@/lib/supabase/server"),
    ]);
    for (const [name, fn] of Object.entries({ loadBooks, loadSetup, loadEntry, getUser }))
      expect(cached.has(fn), name).toBe(true);
  });

  it("the transaction loaders stay uncached (the close and export read inside a transaction)", async () => {
    const { loadBooksData } = await import("@/server/books");
    const { loadCalendar } = await import("@/server/action");
    expect(cached.has(loadBooksData)).toBe(false);
    expect(cached.has(loadCalendar)).toBe(false);
  });
});
