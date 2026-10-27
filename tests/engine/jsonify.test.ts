import { describe, expectTypeOf, it } from "vitest";
import type { Jsonify } from "@/api/jsonify";

// U-N-2.4.1 (design rule 7): the api's JSON types. The checks are compile-time (`npm run
// typecheck`); a Date that a page would treat as a Date fails the build.
describe("U-N-2.4.1 Jsonify", () => {
  it("turns Dates into strings, drops functions and keeps the rest", () => {
    type Row = {
      id: string;
      createdAt: Date;
      updatedAt: Date | null;
      note?: string;
      amount: number;
      lines: { at: Date; qty: number }[];
      done: boolean;
      fn: () => void;
    };
    expectTypeOf<Jsonify<Row>>().toEqualTypeOf<{
      id: string;
      createdAt: string;
      updatedAt: string | null;
      note?: string;
      amount: number;
      lines: { at: string; qty: number }[];
      done: boolean;
    }>();
    expectTypeOf<Jsonify<Date[]>>().toEqualTypeOf<string[]>();
    expectTypeOf<Jsonify<null>>().toEqualTypeOf<null>();
  });
});
