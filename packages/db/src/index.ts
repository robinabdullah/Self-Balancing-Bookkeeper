import "server-only";
import type postgres from "postgres";
import { createDb, pgClient } from "./client";

// Server-only DB client (SRS §2.4). Next loads this module more than once per server (in dev
// each compiled route; in production the pages and the route handlers each), and each copy would
// open its own pool of 10. Production's session pooler allows 15 clients, so a PDF route was
// refused while the pages' pool was busy (CR-030). One client on globalThis keeps the whole
// server to one pool.
const cache = globalThis as unknown as { pg?: postgres.Sql };

export const db = createDb((cache.pg ??= pgClient(process.env.DATABASE_URL!)));
