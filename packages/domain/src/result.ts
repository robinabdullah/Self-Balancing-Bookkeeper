import type { Errors } from "./guards";

// What every write returns (SRS §2.3, D-010): the forms read it, web's server actions pass it
// through, and the api sends it as the body with 200/409/422 (N-2.5).
export type Result =
  | { status: "ok"; id: string; updatedAt: string | null } // null after a delete
  | { status: "duplicate"; id: string; by: string; at: string }
  | { status: "conflict"; message: string }
  | { status: "invalid"; errors: Errors };
