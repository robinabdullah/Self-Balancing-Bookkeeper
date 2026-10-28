import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // N-1.2: the Next app is apps/web (for the pages-folder rules).
    settings: { next: { rootDir: "apps/web/" } },
  },
  {
    // D-013: hard cap 1000 lines per source file (aim for ≤ 500).
    rules: {
      "max-lines": ["error", { max: 1000, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // D-064: only the chart pieces import Recharts, so no other page loads it.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/components/charts/**", "apps/web/src/components/ui/chart.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["recharts", "@/components/ui/chart"].map((name) => ({
            name,
            message: "Use src/components/charts (D-064).",
          })),
        },
      ],
    },
  },
  {
    // N-6.1 (D-068): web is the UI over the api. It holds no database, crypto or file code, and
    // takes the api's types only (`import type`), never its code.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: ["postgres", "crypto", "node:crypto", "exceljs", "@simplewebauthn/server"].map(
            (name) => ({ name, message: "Server code lives in apps/api (D-068)." }),
          ),
          patterns: [
            {
              group: ["@mbl/db", "@mbl/db/*", "drizzle-orm", "drizzle-orm/*", "@react-pdf/*"],
              message: "Server code lives in apps/api (D-068).",
            },
            {
              group: ["@mbl/api", "@mbl/api/*", "**/apps/api/**"],
              allowTypeImports: true,
              message: "Web imports the api's types only (`import type`, D-068).",
            },
          ],
        },
      ],
    },
  },
  {
    // N-6.1 (D-068): domain is pure and shared by both apps: no UI, framework or database.
    files: ["packages/domain/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "next",
                "next/*",
                "@mbl/db",
                "@mbl/db/*",
                "drizzle-orm",
                "drizzle-orm/*",
                "@nestjs/*",
                "@mbl/api",
                "@mbl/api/*",
              ],
              message: "Domain stays pure: no React, Next, Nest or database (D-068).",
            },
          ],
        },
      ],
    },
  },
  {
    // Generated files are exempt (D-013).
    ignores: [
      "node_modules/**",
      "**/.next/**",
      "**/.next-e2e/**",
      "**/.next-parity/**",
      ".parity/**",
      "out/**",
      "build/**",
      "apps/api/dist/**",
      "**/next-env.d.ts",
      "apps/web/src/components/ui/**",
      "packages/db/migrations/**",
    ],
  },
];

export default eslintConfig;
