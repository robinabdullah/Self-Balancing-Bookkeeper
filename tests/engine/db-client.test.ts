import { afterAll, describe, expect, it, vi } from "vitest";

// U-CR-030.4: Next loads `src/db` more than once per server (the pages and the route handlers
// each). Every copy must share one postgres client, so the server holds one pool of 10, not one
// per copy: production's session pooler allows 15 clients, and a second pool made the card PDF
// fail. `postgres()` connects lazily, so no database is needed here.
describe("U-CR-030.4 one DB pool per server", () => {
  afterAll(() => {
    delete (globalThis as { pg?: unknown }).pg;
  });

  it("a second load of the module reuses the first client", async () => {
    const first = await import("@/db");
    vi.resetModules();
    const second = await import("@/db");
    expect(second.db).not.toBe(first.db); // a fresh module copy…
    expect(second.db.$client).toBe(first.db.$client); // …on the same pool
  });
});
