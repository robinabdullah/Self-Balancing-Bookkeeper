import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// U-N-6.1.1–3 (D-068): the boundary lint in eslint.config.mjs. Web is the UI over the api (no
// database, crypto or file code; the api as types only); domain stays pure. Each snippet is
// linted as if it were a file at that path; nothing is written.
const eslint = new ESLint({ cwd: fileURLToPath(new URL("../..", import.meta.url)) });

/** The boundary errors for `code` placed at `filePath`. */
async function boundary(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages
    .filter((m) => m.ruleId === "@typescript-eslint/no-restricted-imports")
    .map((m) => m.message);
}

const WEB = "apps/web/src/app/boundary-check.ts";
const DOMAIN = "packages/domain/src/boundary-check.ts";

describe("U-N-6.1 boundary lint", () => {
  it("U-N-6.1.1 web may not import the database, crypto or file libraries", async () => {
    for (const code of [
      `import { db } from "@mbl/db";`,
      `import { profiles } from "@mbl/db/schema";`,
      `import { eq } from "drizzle-orm";`,
      `import postgres from "postgres";`,
      `import { randomUUID } from "node:crypto";`,
      `import { randomUUID } from "crypto";`,
      `import ExcelJS from "exceljs";`,
      `import { renderToBuffer } from "@react-pdf/renderer";`,
      `import { verifyAuthenticationResponse } from "@simplewebauthn/server";`,
    ])
      expect(await boundary(`${code}\nexport {};\n`, WEB), code).toHaveLength(1);
  }, 60_000);

  it("U-N-6.1.2 web takes the api's types only", async () => {
    const value = `import { BooksService } from "@mbl/api/books/books.service";\nexport { BooksService };\n`;
    expect(await boundary(value, WEB)).toEqual([
      expect.stringContaining("Web imports the api's types only (`import type`, D-068)."),
    ]);
    const type = `import type { Me } from "@mbl/api/shell/shell.controller";\nexport type { Me };\n`;
    expect(await boundary(type, WEB)).toEqual([]);
    expect(await boundary(`import { z } from "zod";\nexport { z };\n`, WEB)).toEqual([]);
  }, 60_000);

  it("U-N-6.1.3 domain imports no React, Next, Nest, api or database", async () => {
    for (const code of [
      `import { cache } from "react";`,
      `import { redirect } from "next/navigation";`,
      `import { Injectable } from "@nestjs/common";`,
      `import { db } from "@mbl/db";`,
      `import { eq } from "drizzle-orm";`,
      `import type { Me } from "@mbl/api/shell/shell.controller";`,
    ])
      expect(await boundary(`${code}\nexport {};\n`, DOMAIN), code).toHaveLength(1);
    expect(await boundary(`import { z } from "zod";\nexport { z };\n`, DOMAIN)).toEqual([]);
  }, 60_000);
});
