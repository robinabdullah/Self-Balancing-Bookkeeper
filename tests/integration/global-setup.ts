import { localSql, migrateLocal } from "./local-db";

// Runs once per `npm run test:int`.
export default async function setup() {
  const sql = localSql();
  try {
    await migrateLocal(sql);
  } finally {
    await sql.end();
  }
}
