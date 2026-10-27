import { describe, expect, it } from "vitest";
import { scriptDbUrl } from "../../scripts/lib/script-db";

// D-066: the one-off scripts refuse a non-local DB unless CONFIRM_PROD=1 (checked before any
// connection; no URL here is ever connected to).
const LOCAL = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const REMOTE = "postgresql://user:pw@db.example.supabase.co:5432/postgres";

describe("U-D-066.1 scriptDbUrl", () => {
  it("allows local Supabase", () => {
    expect(scriptDbUrl({ DATABASE_URL: LOCAL })).toBe(LOCAL);
    const localhost = "postgresql://postgres:postgres@localhost:55322/postgres";
    expect(scriptDbUrl({ DATABASE_URL: localhost })).toBe(localhost);
    const ipv6 = "postgresql://postgres:postgres@[::1]:55322/postgres";
    expect(scriptDbUrl({ DATABASE_URL: ipv6 })).toBe(ipv6);
  });

  it("refuses a remote DB without CONFIRM_PROD=1", () => {
    expect(() => scriptDbUrl({ DATABASE_URL: REMOTE })).toThrow(/not local/);
    expect(() => scriptDbUrl({ DATABASE_URL: REMOTE, CONFIRM_PROD: "yes" })).toThrow(/not local/);
  });

  it("allows a remote DB with CONFIRM_PROD=1", () => {
    expect(scriptDbUrl({ DATABASE_URL: REMOTE, CONFIRM_PROD: "1" })).toBe(REMOTE);
  });

  it("needs DATABASE_URL", () => {
    expect(() => scriptDbUrl({})).toThrow(/not set/);
  });
});
