import { beforeAll } from "vitest";
import { localSql, truncateAll } from "./local-db";

// Each test file starts from empty tables.
beforeAll(async () => {
  const sql = localSql();
  await truncateAll(sql);
  await sql.end();
});
