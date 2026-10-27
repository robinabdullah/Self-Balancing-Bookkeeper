import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // D-013: hard cap 1000 lines per source file (aim for ≤ 500).
    rules: {
      "max-lines": ["error", { max: 1000, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // D-064: only the chart pieces import Recharts, so no other page loads it.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/charts/**", "src/components/ui/chart.tsx"],
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
      "out/**",
      "build/**",
      "next-env.d.ts",
      "src/components/ui/**",
      "src/db/migrations/**",
    ],
  },
];

export default eslintConfig;
