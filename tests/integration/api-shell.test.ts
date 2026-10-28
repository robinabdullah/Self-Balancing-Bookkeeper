import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { appName, logoSrc } from "@mbl/domain/business";
import { breakdown } from "@mbl/domain/dashboard";
import { formatMonth } from "@mbl/domain/dates";
import { nextToClose } from "@mbl/domain/engine/months";
import { BooksService } from "../../apps/api/src/books/books.service";
import { BusinessService } from "../../apps/api/src/business/business.service";
import { seedParity } from "../../scripts/parity/seed";
import { type TestUser, deleteUsers, signedInUser, startApi } from "./api";
import { localSql } from "./local-db";
import { service } from "./services";

// N-2.5: the first slice. The app shell (top bar, balance chip, "Closing: …"), the profile and
// the branding come from the api, with the same values web's layout computed (Ref:
// src/app/(app)/layout.tsx), and the books load once per page render. The expected values are read
// from the api's own services (N-6.1). Fictional book (D-069).
const sql = localSql();
let app: INestApplication;
let partner: TestUser;

beforeAll(async () => {
  await seedParity(sql);
  app = await startApi();
  partner = await signedInUser(sql, "partner");
});

afterAll(async () => {
  await app.close();
  await deleteUsers(sql);
  await sql.end();
});

const get = (path: string, renderId?: string) =>
  request(app.getHttpServer())
    .get(path)
    .set({
      Authorization: `Bearer ${partner.token}`,
      ...(renderId ? { "X-Render-Id": renderId } : {}),
    });

describe("first slice (N-2.5)", () => {
  it("I-N-2.5.2 /views/shell has the web layout's name, logo, email, Closing and balance", async () => {
    const [{ data, books, asOf }, business] = await Promise.all([
      service(app, BooksService).loadBooks(),
      service(app, BusinessService).getBusiness(),
    ]);
    const month = nextToClose(data.closed, data.entries[0]?.date ?? null, asOf);
    const expected = {
      name: appName(business),
      logo: logoSrc(business),
      email: partner.email,
      closing: { label: `Closing: ${formatMonth(month)}`, href: `/months/${month}` },
      balance: breakdown(books),
    };
    const { body } = await get("/views/shell").expect(200);
    expect(body).toEqual(JSON.parse(JSON.stringify(expected)));
    expect(body.balance.difference).toBe(0); // the books balance
    expect(body.balance.haveLines.length).toBeGreaterThan(0);
  });

  it("I-N-2.5.1 one loadBooksData per render id across the shell, profile and branding", async () => {
    const loads = vi.spyOn(app.get(BooksService), "loadBooksData");
    const render = randomUUID();
    await get("/views/shell", render).expect(200);
    await get("/me", render).expect(200);
    await get("/branding", render).expect(200);
    await get("/views/shell", render).expect(200); // the page's own call, same render
    expect(loads).toHaveBeenCalledTimes(1);
    await get("/views/shell", randomUUID()).expect(200); // the next render loads afresh
    expect(loads).toHaveBeenCalledTimes(2);
    loads.mockRestore();
  });

  it("I-N-2.5.3 /branding needs no sign-in; /me and /views/shell do", async () => {
    const business = await service(app, BusinessService).getBusiness();
    await request(app.getHttpServer()).get("/branding").expect(200, {
      name: business!.name,
      shortName: business!.shortName,
      logoVersion: business!.logoVersion,
    });
    await request(app.getHttpServer()).get("/me").expect(401);
    await request(app.getHttpServer()).get("/views/shell").expect(401);
    const { body } = await get("/me").expect(200);
    expect(body).toMatchObject({ id: partner.profileId, theme: "night_owl" });
  });
});
