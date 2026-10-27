import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// The DB client factory (N-2.2), shared by web's one global pool (index.ts) and the api's
// DbModule, which owns its pool and ends it on shutdown. `prepare: false` keeps it compatible
// with Supabase's transaction pooler. D-032 (speed: the DB is a cross-region round trip away):
// - `max_lifetime: null`: connections aren't closed and reopened on a 30–60 min timer;
// - `fetch_types: false`: no type lookup on each new connection. That is safe only while no
//   column or query uses Postgres arrays (none do: jsonb is not an array). Revisit if one does.
export const pgClient = (url: string, options: Parameters<typeof postgres>[1] = {}) =>
  postgres(url, { prepare: false, max_lifetime: null, fetch_types: false, ...options });

export const createDb = (client: postgres.Sql) => drizzle(client, { schema });

export type Db = ReturnType<typeof createDb>;

/** A transaction handle (`db.transaction(async (tx) => …)`). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
