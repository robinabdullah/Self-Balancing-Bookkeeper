import "server-only";
import type postgres from "postgres";
import { createDb, pgClient } from "./client";

// A shared DB client on DATABASE_URL, one pool per process (globalThis: a module loaded twice
// still opens one pool; CR-030). N-6.1 (D-068): web no longer has a database; the api owns its
// pool (apps/api/src/db/db.module.ts), and the integration tests use this one.
const cache = globalThis as unknown as { pg?: postgres.Sql };

export const db = createDb((cache.pg ??= pgClient(process.env.DATABASE_URL!)));
