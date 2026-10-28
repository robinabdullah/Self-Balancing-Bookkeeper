// N-6.2: a fresh clone's demo book (README → Run it locally). Migrates local Supabase, then
// replaces every table's rows with the fictional parity book (scripts/parity/seed.ts, D-069) and
// the demo login partner@test.local / partner-test-password. Local Supabase only: it never reads
// an env file, so it can't reach production.
import { localSql, migrateLocal } from "../tests/integration/local-db";
import { seedParity } from "./parity/seed";

async function main() {
  const sql = localSql();
  try {
    await migrateLocal(sql);
    await seedParity(sql);
    console.log("Demo book seeded. Sign in as partner@test.local / partner-test-password.");
  } finally {
    await sql.end();
  }
}
void main();
