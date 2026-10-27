import { describe, expect, it } from "vitest";

describe("unit tooling", () => {
  it("runs a unit test without a DB", () => {
    expect(1 + 1).toBe(2);
  });
});
