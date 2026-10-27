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
    // Generated files are exempt (D-013).
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-e2e/**",
      ".next-parity/**",
      ".parity/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "apps/web/src/components/ui/**",
      "apps/web/src/db/migrations/**",
    ],
  },
];

export default eslintConfig;
