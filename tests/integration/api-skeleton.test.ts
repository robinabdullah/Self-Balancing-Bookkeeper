import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { APP_NAME } from "../../apps/api/src/db/db.module";
import { startApi } from "./api";
import { localSql } from "./local-db";

// N-2.2: the api skeleton: /health, the one pool closed on shutdown, Swagger only outside
// production, the 1 MB JSON limit.
const sql = localSql();
const apps: INestApplication[] = [];
const start = async (...args: Parameters<typeof startApi>) => {
  const app = await startApi(...args);
  apps.push(app);
  return app;
};

afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
  await sql.end();
});

const apiConnections = async () =>
  Number(
    (
      await sql<{ n: string }[]>`
        select count(*) as n from pg_stat_activity where application_name = ${APP_NAME}`
    )[0].n,
  );

describe("api skeleton (N-2.2)", () => {
  it("I-N-2.2.3 /health answers when the DB does", async () => {
    const app = await start();
    await request(app.getHttpServer()).get("/health").expect(200, { ok: true });
  });

  it("I-N-2.2.1 closing the app ends its DB pool", async () => {
    const before = await apiConnections(); // other tests' apps still running
    const app = await startApi();
    await request(app.getHttpServer()).get("/health").expect(200);
    expect(await apiConnections()).toBeGreaterThan(before);
    await app.close();
    await expect.poll(apiConnections).toBe(before);
  });

  it("I-N-2.2.2 Swagger is served outside production only", async () => {
    const dev = await start({ NODE_ENV: "development" });
    await request(dev.getHttpServer()).get("/docs-json").expect(200);
    const prod = await start({ NODE_ENV: "production" });
    await request(prod.getHttpServer()).get("/docs").expect(404);
    await request(prod.getHttpServer()).get("/docs-json").expect(404);
  });

  it("I-N-2.2.4 a JSON body over 1 MB is refused", async () => {
    const app = await start();
    const big = JSON.stringify({ logo: "x".repeat(1_100_000) });
    await request(app.getHttpServer())
      .post("/health")
      .set("Content-Type", "application/json")
      .send(big)
      .expect(413);
  });
});
