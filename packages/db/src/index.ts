import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Server-only DB client (SRS §2.4). `prepare: false` keeps it compatible with Supabase's
// transaction pooler. Next loads this module more than once per server (in dev each compiled
// route; in production the pages and the route handlers each), and each copy would open its own
// pool of 10. Production's session pooler allows 15 clients, so a PDF route was refused while the
// pages' pool was busy (CR-030). One client on globalThis keeps the whole server to one pool.
const cache = globalThis as unknown as { pg?: postgres.Sql };
// D-032 (speed: the DB is a cross-region round trip away):
// - `max_lifetime: null`: connections aren't closed and reopened on a 30–60 min timer;
// - `fetch_types: false`: no type lookup on each new connection. That is safe only while no
//   column or query uses Postgres arrays (none do: jsonb is not an array). Revisit if one does.
const client = (cache.pg ??= postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max_lifetime: null,
  fetch_types: false,
}));

export const db = drizzle(client, { schema });
