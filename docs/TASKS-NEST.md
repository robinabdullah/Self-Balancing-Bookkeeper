# Mobile Business Lite — Tasks (NestJS migration)

*Task breakdown · 27 October 2026* — moves the app to a NestJS backend with Next.js as the UI on
top: the same screens, URLs, cookies, messages and numbers (D-068). This repo is the public copy
(D-069). The v1.1 product tasks are in `docs/TASKS.md`. They are finished and are only read when
cited.

## Now
- **Live:** production runs the reference repo (`D:/Projects/Mobile-Business-Lite`) until N-7.2.
- **Session:** S4 done (2026-10-27), uncommitted, waiting for the user's review: N-2.1 … N-2.5.
  - **CI on the S3 push (run 40555560370) failed in `checks`:**
    - `parity-seed.test.ts` saw no August close. The seed closes August as `partner@test.local`,
      and only E2E's global setup created that user, which the `checks` job never runs.
    - Fix (its own `fix(...)` commit): `ensurePartner()` in `tests/e2e/global-setup.ts`, called
      by `seedParity`.
    - Reproduced locally by deleting the user (fails as on CI), and green with the fix.
  - **Phase gate:**
    - typecheck and lint clean;
    - unit 721; integration 153;
    - E2E 52 passed, 7 skipped (smoke, home, stock, pdf, export, settings, shell, ui-dark;
      night_owl);
    - parity MATCH (202 files).
  - At N-7.2, update the VPS's installed unit file to run `apps/web/server.js` (N-1.2), and do the
    production key-type check (moved from N-2.3).
- **Next:** S5 (`/next-phase S5`, in a new conversation), after S4 is pushed and CI is green.
- **Blocked on:** —

## How to use

- `[ ]` = to do, `[x]` = done. A step is ticked only when its subtasks, tests and acceptance are
  done. A session that stops halfway resumes at the first unticked step of its session.
- **IDs:**
  - Steps are `N-x.y` (phase x), grouped under their session S1–S10.
  - Hotfixes redone from the reference are `HF-n`.
  - Change requests made during the migration are `CR-NNN`, continuing `docs/TASKS.md`'s
    numbering.
  - Tests are `U` unit · `I` integration · `E` end-to-end · `M` manual, plus the id
    (e.g. `I-N-3.4.1`).
- **Ref:** absolute paths in the reference repo, which is read-only. A session reads a step's
  Ref files and its targets, nothing else, and runs `git diff --no-index <ref file> <new file>` to
  see exactly what moved. The reference's behavior is the target unless a D entry says otherwise.
- **Parity** (from N-1.1) means the harness dump of this repo's local build matches the baseline
  dump of the reference's local build.
  - `npm run parity:ref` makes the baseline. It exports the reference HEAD with `git archive`
    into `D:/Projects/MBL-parity-ref`, then installs and builds it there. The copy is re-exported
    only when the reference moves (an HF-n).
  - `npm run parity` dumps this repo's build and compares it with the baseline. It exits 1 on any
    difference and reports TTFB.
  - Both seed local Supabase with the fictional parity book (`scripts/parity/seed.ts`) and run
    `next start` on port 3011 at a fixed clock (20 Oct 2026, 11:00 Dhaka).
  - Dumps go to the gitignored `.parity/`. Never run it while E2E or `npm run dev` uses the
    local DB.
- **Running the work:**
  - A session is `/next-phase S<n>`: the steps (left uncommitted), then the phase gate, then a
    stop for the user's review. The user says when to commit, or commits themselves. The next session starts in a new conversation.
  - A hotfix is `/next-task HF-n`, done before the next N step.
  - Feedback or a rule change is `/change-request`: a D entry, then the docs, then a CR task under
    "Change requests" below.
- **Denylist check:** real names, phones, the production domain and the shop's details must never
  be committed. A gitignored `.denylist` at the repo root (one case-insensitive pattern per line,
  never committed) feeds:
  `git grep --untracked -n -I -i -E -f .denylist -- .`.
  - There are no exclusions (since N-0.5). Add `--untracked` so new files count too.
  - The output must be empty.
- **Real workbooks:** `docs/source/` is gitignored and never committed here (D-069); N-0.4 deleted
  it from disk.
- 👤 = a step only the user can do or must approve at the time (GitHub, production, consent).

## Definition of Done (every step)

- [ ] The step's listed tests are written (or ported) and green.
- [ ] Engine and integration scenarios still assert the **books-balance invariant**.
- [ ] `npm run typecheck` and `npm run lint` are clean (incl. `max-lines`).
- [ ] The behavior matches the Ref files, or a D entry records the difference.
- [ ] The denylist check is empty. No real data or card secret appears in logs, test output or
  fixtures.
- [ ] Nothing is committed before the user's review. When the user asks, one commit per step:
  `<type>(<scope>): <desc> (N-x.y)`.

**Phase gate (end of every session):**
- typecheck, lint and the full unit suite;
- the phase's integration files;
- the phase's E2E specs with `E2E_THEMES=night_owl` at 360 + 1280;
- the parity dump (from N-1.1).

Then stop and show the user the session's screenshots (360 + 1280, one theme), the parity
report, the test counts, what changed and why in each step, and any deviation. After the user
approves, commit and push to `dev` only on the user's word (or the user does it); CI then runs
the full suites (from N-0.6). A phase ends when CI is
green and the parity dump matches.

---

## Phase N-0 — The new repo with a clean history

*At the end:* a private GitHub repo whose one root commit is the cleaned monolith; all suites are
green; Claude works here as it does in the reference.

### Session S1 — bootstrap, private material out, fictional names
Screenshots: Home, Settings → Business, a customer page (fictional names).

- [x] **N-0.1 Bootstrap** (2026-10-27)
  - **Ref:** the whole reference repo (`git archive` of `dev` at `cce0cc5`) · **D:** D-068, D-069
  - [x] The project memory is copied from the reference's folder and updated for this repo
    (branch, production, local run, test flow).
  - [x] `.env.local` is copied with this repo's ports (never `.env.prod`); `npm ci`.
  - [x] `supabase/config.toml` gets its own `project_id` (`Mobile-Business-Lite-Public`) and ports
    (api 55321, db 55322, shadow 55320, pooler 55329, studio 55323, smtp 55324, analytics 55327,
    inspector 8183). The hard-coded ports in the tests and CI are updated to match.
  - [x] `.gitignore`: `docs/source/` and `.denylist`; `.denylist` is written.
  - [x] CLAUDE.md: the reference rule, this file, `/next-phase`.
  - [x] This file; the `/next-phase` skill; `/next-task` and `/change-request` know about
    TASKS-NEST.md and `HF-n`.
  - [x] D-068 and D-069 in `docs/DECISIONS.md` (D-069 amends D-014).
  - [x] `git init -b main` (local only, no remote) and the first commit.
  - **Tests:** [x] typecheck, lint, unit green · [x] local Supabase starts on the new ports (beside
    the reference's stack, if it is running); `drizzle-kit migrate`; `schema.test.ts` green.
  - **Acceptance:** `/next-task N-0.2` finds its step; local Supabase runs on its own ports.
  - **Result (2026-10-27):** typecheck + lint clean; unit 722/722; this repo's stack (5 containers)
    runs beside the reference's (11); `drizzle-kit migrate` applied 0000–0006; `schema.test` 10/10.

- [x] **N-0.2 Remove private material**
  - **Ref:** the files listed · **D:** D-069
  - [x] Delete `docs/PROJECT-AUDIT.*` and the one-off production scripts (`scripts/rename-cards.ts`,
    `scripts/fix-card-opening.ts`, `scripts/cards/`), with the tests that only cover them. Tests
    that import a helper from them get an inline replacement.
  - [x] The production domain and VPS details become placeholders in `deploy/*`,
    `scripts/deploy.sh`, `tests/engine/proxy.test.ts` and the docs.
  - [x] `LICENSE` (MIT); `.gitignore` ignores `.env*` except `.env.example`; `.env.example` (local
    values only).
  - [x] CLAUDE.md's `docs/source/` line says it is gitignored and on disk only until N-0.4.
  - **Tests:** [x] typecheck, lint, unit, integration green.
  - **Acceptance:** a grep for the production domain finds nothing.
  - **Result (2026-10-27):** typecheck + lint clean; unit 717/717 (the 5 tests of the deleted
    scripts went with them); integration 143/143; `git grep -i` for the domain is empty. The
    domain is `business.example.com`; the VPS user stays the generic `ubuntu`. `LICENSE` holder:
    "Mobile Business Lite contributors" (the user confirms at review).

- [x] **N-0.3 Fictional people and shop**
  - **Ref:** about 85 files in `src/`, `tests/`, `scripts/opening/workbook.ts`, `.claude/rules/`
    · **D:** D-069
  - [x] Real names and phones become fictional ones (one mapping, the same everywhere; ids
    follow) in `src/` comments and strings, the tests, the E2E seed,
    `scripts/opening/workbook.ts` and `.claude/rules/`.
  - [x] Migration `0004`: the fictional shop's name, phones and a generated logo. Its journal
    `when` is kept: Drizzle decides on `created_at` and never re-runs an applied migration
    (`drizzle-orm/pg-core/dialect.js`).
  - **Tests:** [x] the S1 phase gate, run in full because there is no CI before N-0.6: typecheck,
    lint, full unit, full integration, full E2E in night_owl at 360 + 1280.
  - **Acceptance:** the denylist check is empty (exclusions as in How to use).
  - **Result (2026-10-27):** typecheck + lint clean; unit 717/717; integration 143/143; E2E
    (night_owl, 360 + 1280) 272 passed, 15 skipped, 0 failed (20.4 min). The denylist check is
    empty; inside the excluded fixture only the workbook's file path is left (N-0.4).
    - Two more real names turned up in the opening adapter's comments and joined the denylist; a
      check against the workbooks (yes/no only) confirmed every replacement name is new.
    - The fixture file is renamed to `tests/fixtures/investor-workbook.ts`. The opening adapter
      (`scripts/opening/workbook.ts`) now names fictional labels, so it no longer matches the real
      workbook; that import was one-time and stays in the reference.
    - Name-order expectations changed with the new names ("by name" is unchanged): the partners'
      order in `books`/`opening-import`, and two customers in `accounts.test`.
    - An existing local DB keeps the old profile row (0004 only inserts into an empty table):
      `npx supabase db reset`, then `npx drizzle-kit migrate`.

### Session S2 — synthetic card fixture, clean specs, publish privately
Screenshots: a card page with the synthetic cards; the GitHub repo with one commit.

- [x] **N-0.4 Synthetic card fixture** (2026-10-27)
  - **Ref:** the real-workbook card fixture `tests/fixtures/investor-workbook.ts`,
    `tests/engine/cards.test.ts`, SRS §6 · **D:** D-069, D-070
  - [x] Fictional cards, bill and due days and entries, with hand-checked expected balances in
    `tests/engine/cards.test.ts`. SRS §6 uses the same numbers.
  - [x] Delete the opening tools (D-070, CR-047): the template builder, the importer,
    `scripts/opening/*` and their two test files.
  - [x] Delete `docs/source/` from disk.
  - **Tests:** [x] U-N-0.4.x pass.
  - **Acceptance:** no test reads an xlsx from `docs/source`; the denylist exclusion for the
    fixture is dropped.
  - **Result (2026-10-27):** `tests/fixtures/investor-cards.ts` holds 18 inline rows over 7
    fictional cards (Kite, Lotus, Delta, Harbor, Summit, River Amex/Visa), with no ExcelJS. U2.6.9
    became U-N-0.4.1 … .6: total ৳6,45,751.25, cash-outs ৳1,90,000 (6), invested ৳8,00,000.
    `cards.test` 31/31. `docs/source/` was deleted after checking that the reference holds the
    same four files. Unit 715 (−3 opening-template, +1 fixture test); integration 138 (−5
    opening-import).

- [x] **N-0.5 Clean specs** (2026-10-27)
  - **Ref:** `docs/*` · **D:** D-069
  - [x] PRD §3/§7, SRS, UIDD, DECISIONS(-v1), TASKS*, v1.1-plan and AI.md get fictional names and
    figures. The rules and their meaning are unchanged. Links to deleted files are removed.
  - **Acceptance:** the denylist check is empty over `docs/` too (no exclusions left).
  - **Result (2026-10-27):** N-0.3's mapping was applied to all 10 docs (three Sonnet agents,
    reviewed). Real figures became fictional ones, the same across docs: the opening gap is
    ৳12,400, and the largest customer is ~৳75L with a ৳50L target. The money-format example
    ৳90,40,275 (a real balance) is now ৳75,12,345 in the docs, `src/lib/money.ts` and
    `money.test.ts`. A partner's name inside a common AI term was reworded, because the denylist matched it. The denylist over
    the whole tree, untracked files included, is empty with no exclusions.

- [x] **N-0.6 Publish privately** (2026-10-27)
  - [x] Squash all local commits into one root commit ("Mobile Business Lite v1.1 — Next.js
    monolith"), then `git reflog expire --expire=now --all && git gc --prune=now`, so no earlier
    object stays in the local store.
  - [x] gitleaks and the denylist over the whole tree; create `dev`.
  - [x] 👤 `gh repo create Self-Balancing-Bookkeeper --private --source . --push` (the user's
    name; the app keeps its own), then push `dev`. gitleaks runs from its Docker image.
  - **Acceptance:** CI green on `dev`; GitHub shows exactly one commit on `main`.
  - **Result (2026-10-27):** S1 and S2 were squashed into one root commit, then the reflog was
    expired and gc run. gitleaks v8.18.4 (Docker) found no leaks; the denylist is empty. The first
    CI run on `dev` is checked at the start of S3.

---

## Phase N-1 — Baseline and monorepo (still the same monolith)

*At the end:* npm workspaces; the parity dump matches the reference's.

### Session S3
Screenshots: the parity report; Home, Stock, a PDF (unchanged).

- [x] **N-1.1 Parity harness and baseline** (2026-10-27)
  - **Ref:** a local build of the reference
  - [x] A seed of fictional data (including the business profile).
  - [x] A route manifest with search-param variants.
  - [x] Dumps: `innerText` at 360/1280, PDF text via unpdf, XLSX cells, audit rows after a
    scripted write sequence, TTFB.
  - [x] Run it on a local build of the reference to make the baseline.
  - **Tests:** [x] U-N-1.1.1 normalize · [x] U-N-1.1.2 compare · [x] U-N-1.1.3 TTFB report ·
    [x] I-N-1.1.1 the parity book balances (hand-checked totals) · [x] I-N-1.1.2 re-seeding gives
    the same rows.
  - **Acceptance:** two runs on the reference are identical; this repo's build matches the
    baseline.
  - **Result (2026-10-27):** `scripts/parity/` (9 files, ≤ 471 lines each); `npm run parity:ref`
    and `npm run parity`.
    - **Seed:** direct SQL with fixed ids and stamps, like `books.test.ts`, so it doesn't depend
      on the actions N-3 rewrites. It holds an opening, Aug closed (the engine computes the close),
      Sep and Oct open, and 36 entries across purchases, sales, both returns, a reversal and 15
      money types. It also has bank accounts, saved card details and the business profile.
      Hand-checked: cash ৳4,72,700, customer dues ৳1,82,000 and ৳90,000, supplier due ৳35,000,
      card dues ৳1,25,200 and ৳30,500.
    - **Clock:** the app reads the real time, so `next start` is preloaded with
      `scripts/parity/clock.cjs`. It starts the clock at 20 Oct 2026 11:00 Dhaka, so the baseline
      stays valid on later days. The browser uses Playwright's `clock.setSystemTime`.
    - **Masking:** only uuids (aliased in order), DB timestamps and the PDFs' "Generated" time.
    - **Dumps (202 files):** 92 routes × 2 viewports, 9 PDFs, 5 workbooks, the export, and the
      audit rows of 12 UI writes. Those writes are a customer, an expense with its edit and delete,
      a payment and its reversal, a sale, a card purchase, a Sep close and re-open, business
      details, and the export.
    - **Results:** reference vs reference MATCH; this repo vs the baseline MATCH. A one-character
      change is caught (exit 1). TTFB ≈ 9.6 s over the 92 routes on both builds.
    - **Counts:** unit 718 (+3); integration +2.
    - **Notes:**
      - The reference copy is `D:/Projects/MBL-parity-ref`, made with `git archive` (`src` plus
        the configs, no docs or tests).
      - Every `next build` adds its dist's types to `tsconfig.json`; the `.next-parity` lines are
        kept.
      - One run takes ~4 min with a fresh build.
- [x] **N-1.2 Workspaces plus `apps/web`** (2026-10-27)
  - **Ref:** `D:/Projects/Mobile-Business-Lite/next.config.ts`, `playwright.config.ts`,
    `vitest.config.ts`, `scripts/deploy.sh`
  - [x] A pure `git mv` commit, then a path-rewrite commit.
  - [x] Updated: tsconfig, eslint, the vitest projects, Playwright `APP_FILES`, `next.config.ts`
    (`transpilePackages`, `outputFileTracingRoot`, `turbopack.root`), CI, and the `deploy.sh` and
    unit paths.
  - **Tests:** [x] typecheck, lint, unit, integration · [x] E2E smoke, home, stock, pdf, export
    (night_owl, 360 + 1280) · [x] M-N-1.2.1 the standalone build runs like the VPS · [x] parity.
  - **Acceptance:** full suites green; parity.
  - **Result (2026-10-27):**
    - **The move:** `src`, `next.config.ts`, `postcss.config.mjs` and `components.json` →
      `apps/web/` (294 staged renames).
      - The root keeps `tests/`, `scripts/`, `supabase/`, `deploy/`, `docs/` and the
        vitest/playwright/drizzle configs, since they will span web and api.
      - The root `package.json` gets `workspaces`, and its `dependencies` move to
        `apps/web/package.json` (`@mbl/web`). Root `dev`, `build` and `start` run `-w @mbl/web`.
      - The root `tsconfig.json` still typechecks everything (`@/*` → `apps/web/src/*`).
        `apps/web/tsconfig.json` extends it for Next. There is no separate base file.
    - **`apps/web/next.config.ts`:**
      - `outputFileTracingRoot` and `turbopack.root` point to the repo root;
      - it loads the root `.env.local` with `process.loadEnvFile`, which never overrides set
        variables. (`@next/env` caches its first load, so it can't load a second folder.)
      - `transpilePackages` comes in N-1.3, when there is a package.
    - **PDF fonts:** `src/pdf/document.tsx` reads `PDF_FONT_DIR` first, and vitest sets it. Next
      and the standalone server still find the fonts from their cwd (`apps/web`).
    - **Playwright** and the parity harness run the server with cwd `apps/web`.
    - **Deploy:**
      - `deploy.sh` copies `apps/web/.next/standalone` with static files and `.env.local` into
        `apps/web/`;
      - the unit file now runs `apps/web/server.js`.
      - 👤 At N-7.2 the VPS's installed unit file must be updated too.
    - **CI** is unchanged: it runs from the root.
    - The `.claude/rules` globs, CLAUDE.md, `.prettierignore`, eslint and drizzle paths now point
      to `apps/web/src`.
    - **Results:**
      - unit 718 and integration 140;
      - E2E 23 passed, 2 skipped (the specs' viewport skips);
      - the standalone server answers `/login` 200 and `/logo` 200 (DB, env next to
        `server.js`), and `/` → 307 to login;
      - `drizzle-kit generate` reports no change;
      - parity MATCH (202 files, TTFB +3.3%).
- [x] **N-1.3 `packages/domain`** (2026-10-27)
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/lib/**`, `src/components/journal/labels.ts`
  - [x] Move the pure lib (engine, money, dates, guards, validation, view helpers, `labels.ts`,
    `money/types.ts`, the `PayAccount` type) with relative imports. `card-view.ts` and
    `form-help.ts` stay in web. Structural types replace the `SetupData`/`JournalRow` imports.
  - **Tests:** [x] U-N-1.3.1 nothing in domain imports the app, a framework, the DB or the session
    (a planted `next/link` import fails it) · [x] U-N-1.3.2 every pgEnum is built from its domain
    list · [x] unit, integration · [x] E2E smoke, home, stock, pdf, export (night_owl) ·
    [x] parity.
  - **Acceptance:** the unit suite is green from its new home; parity.
  - **Result (2026-10-27):**
    - **The move:** 58 files went to `packages/domain/src` (`@mbl/domain`, which exports
      `"./*": "./src/*.ts"` and depends only on `zod`). Their paths mirror the source:
      - `lib/<x>` → `src/<x>`;
      - `components/journal/labels.ts` → `src/journal/labels.ts`;
      - `components/money/types.ts` → `src/money/types.ts`.
    - **What stays in web:** `form-help.ts` (a React hook), `supabase/server.ts` and `utils.ts`.
    - **Deviation (user's decision):** `card-view.ts` moved too. It is pure, and `export.ts`,
      `investor-report.ts` and `report-text.ts` (plus four lib files that use those) need
      `cardRows` and `STATUS`. Its badge colour strings travel as plain text.
    - **Imports:** a script rewrote `@/lib/x` → `@mbl/domain/x` in web, tests and scripts
      (294 files), and to relative paths inside domain. Next compiles the package via
      `transpilePackages`.
    - **Pulled forward from N-1.4:** `packages/domain/src/enums.ts` holds every pgEnum's value
      list.
      - `schema.ts` builds `pgEnum(name, X_VALUES)` from them; the theme uses `themes`.
      - The engine types and the forms' `z.enum` use the same lists, so domain never imports the
        schema.
    - **Structural types:**
      - `prefill.ts` reads a local `SetupRows`;
      - `labels.ts` reads a local `JournalRow` with the 10 fields it uses;
      - `PayAccount` now lives in domain `business.ts`.
    - **Also fixed:** the eslint ignores now match `.next*` build folders at any depth. N-1.2's lint
      had passed only because no build existed under `apps/web` yet.
    - **Results:**
      - unit 720 (+2) and integration 140;
      - E2E 23 passed, 2 skipped;
      - `drizzle-kit generate` reports no change;
      - parity MATCH (202 files).
      - TTFB +7% against the morning's baseline, but −8% against the reference measured at the
        same moment, so the difference is machine load.
- [x] **N-1.4 `packages/db`**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/db/**`,
    `src/lib/validation/{money-entry,trade,setup}.ts`
  - [x] Move the schema, migrations, drizzle.config and client factory. The enum value lists move
    to domain (`pgEnum(name, X_VALUES)`), so drizzle leaves the browser bundle.
  - **Tests:** [x] I-N-1.4.1 every migration in `packages/db/migrations` is applied (in
    `migration.test.ts`) · [x] U-N-1.3.2 (the enum check, now against `@mbl/db/schema`) ·
    [x] M-N-1.4.1 `db:generate` reports no change · [x] M-N-1.4.2 no drizzle in the client
    chunks · [x] unit, integration · [x] E2E smoke, home, stock, pdf, export (night_owl) ·
    [x] parity.
  - **Acceptance:** `drizzle-kit generate` reports no change; no `drizzle-orm` in
    `.next/static/chunks`; parity.
  - **Result (2026-10-27):**
    - **The move:** `schema.ts` and `index.ts` → `packages/db/src`, the migrations →
      `packages/db/migrations`, `drizzle.config.ts` → `packages/db/`.
      - The package is `@mbl/db`. It exports `"."` (the server-only client) and `"./schema"`,
        and depends on `@mbl/domain`, `drizzle-orm`, `postgres` and `server-only`.
      - A script rewrote `@/db` → `@mbl/db` in web, tests and scripts (75 files). Next compiles
        the package via `transpilePackages`.
    - **The enum lists** were already done in N-1.3.
    - **Commands:** drizzle-kit no longer finds its config at the root, so the root has
      `npm run db:generate` and `npm run db:migrate` (`--config packages/db/drizzle.config.ts`).
      CI, `deploy.sh` and CLAUDE.md use them.
    - **Paths updated:** the migrations folder in `local-db.ts`, `migration.test.ts`, eslint and
      `.prettierignore`; the db-actions rule glob; the ai rule.
    - **Results:**
      - unit 720 and integration 141 (+1);
      - E2E 25 passed, 2 skipped;
      - `db:generate` reports "No schema changes".
      - The client chunks hold no drizzle: 0 of 44 files match
        `drizzle-orm|PgTable|pgEnum|PgColumn`. The same grep matches 87 server files, so the
        check does detect drizzle.
      - parity MATCH (202 files), TTFB +2.4%.

---

## Phase N-2 — Nest foundation

*At the end:* Nest runs beside Next in dev and E2E; the shell, branding, profile and theme come
from Nest.

### Session S4
Screenshots: the shell (top bar, balance chip), the theme switch, Swagger `/docs`.

- [x] **N-2.1 Spike: packaging**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/pdf/document.tsx`, `src/server/passkeys.ts`
  - [x] The Nest webpack build bundles `@mbl/*`, react-pdf (ESM-only), ExcelJS, simplewebauthn and
    the chosen Swagger library (`nestjs-zod` vs zod 4 `z.toJSONSchema`).
  - [x] Copied to an empty folder, the build serves `/health`, one PDF, one XLSX and the
    registration options. Record the RSS.
  - **Acceptance:** the written result in this step decides the bundle and the Swagger library.
  - **Result (2026-10-27):**
    - **Nest 11, not 12:**
      - Nest 12 (Aug 2026) ships ESM-only (`"type": "module"`), and `nestjs-zod` supports only
        Nest ≤ 11.
      - Nest 11.2.8 is CJS like the rest of the repo.
    - **The bundle:** plain `webpack` + `swc-loader` (`apps/api/webpack.config.js`), not the Nest
      CLI.
      - The CLI adds angular-devkit, and its default `webpack-node-externals` would need a custom
        config anyway.
      - swc keeps the decorator metadata.
      - The output is one self-contained `dist/main.js` (10 MB with the spike's libraries) plus
        `dist/fonts`; nothing is external.
      - The tweaks:
        - `server-only` is aliased to an empty module;
        - Nest's lazy optional requires (microservices, websockets, class-validator,
          class-transformer) are ignored when they aren't installed;
        - `__dirname` stays real, so `env.ts` points `PDF_FONT_DIR` at `dist/fonts`.
    - **Empty-folder run** (only `dist/` copied, no `node_modules`), all 200:
      - `/health`;
      - the invoice PDF, whose text is right incl. `৳` from the Bengali fallback, at 26 KB and
        0.18 s cold;
      - an XLSX with a money cell of 12,345 and a date cell;
      - `generateRegistrationOptions`.
    - **RSS:** 127 MB after boot, 177 MB after 5 PDF + 5 XLSX, 218 MB peak with Swagger loaded,
      and 142 MB settled. The planned `MemoryMax=768M` has room.
    - **Swagger:** `@nestjs/swagger` with zod 4's
      `z.toJSONSchema(schema, { target: "openapi-3.0", io: "input" })` in an `@ApiBody`
      (`apps/api/src/swagger.ts`, `ZodBody`).
      - This adds no dependency and no global pipe (design rule 2: write bodies go to the runner's
        own Zod step).
      - `nestjs-zod` was not needed.
      - Swagger UI's assets come from `swagger-ui-dist` by `__dirname`, so they 404 inside the
        bundle. N-2.2 therefore keeps `@nestjs/swagger` external and loads it only outside
        production.
    - **`npm audit`:**
      - Most findings are already on HEAD: body-parser, qs, undici, zod < 4.6.6, uuid, fast-uri,
        ip-address.
      - The new deps add `multer` (via platform-express; no upload route yet) and `js-yaml` (via
        Swagger; dev only).
      - None is fixed here.
    - The spike controller and its libraries (react-pdf, ExcelJS, simplewebauthn) were removed
      again. N-3.8 and N-5 add them back with the real code.
- [x] **N-2.2 api skeleton**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/db/index.ts` (the CR-030 note)
  - [x] Zod-validated config, a DbModule (one pool, closed on shutdown), `/health` (`select 1`),
    a 1 MB JSON limit, bind 127.0.0.1, Swagger in dev only.
  - **Tests:** [x] I-N-2.2.x: the pool closes; Swagger is absent when `NODE_ENV=production`.
  - **Result (2026-10-27):**
    - **`apps/api` (`@mbl/api`):**
      - `config.ts` is a Zod env check. A bad value stops the boot with its name only, e.g.
        "Bad api environment: DATABASE_URL".
      - `ConfigModule` and `DbModule` are global.
      - `/health` runs `select 1` and answers 503 "Database unavailable" when the DB is down.
      - `app.ts` `setupApp()` is shared by `main.ts` and the test facade. It sets the 1 MB
        `express.json` with Nest's own body parser off, enables shutdown hooks, and serves
        Swagger at `/docs` unless `NODE_ENV=production`.
      - `main.ts` binds `127.0.0.1:${API_PORT}` (default 3003).
    - **The DB client factory:** `@mbl/db/client` exports `pgClient(url, options)` (the D-032
      options) and `createDb(client)`.
      - Web's `index.ts` keeps its one `globalThis` client (CR-030, U-CR-030.4 green) through it.
      - The api's `DbModule` owns its own pool (`application_name = mbl-api`) and ends it in
        `onApplicationShutdown`.
    - **The bundle:**
      - `webpack.config.mjs` (ESM, so lint passes) bundles `@nestjs/swagger`;
      - only the lazy `swagger-ui-dist/absolute-path.js` stays external. That way dev serves the
        UI's files from `node_modules`, and production never calls it.
      - Checked on the built bundle: dev `/docs` and its JS are 200; with `NODE_ENV=production`,
        `/docs` is 404 and `/health` is 200.
    - **Repo config:**
      - the root `tsconfig.json` gains `experimentalDecorators` + `emitDecoratorMetadata`;
      - Vitest's integration project transforms with `unplugin-swc` (decorator metadata);
      - eslint and `.gitignore` skip `apps/api/dist`.
    - **Tests:** `tests/integration/api-skeleton.test.ts` covers I-N-2.2.1 (pool ends on
      `app.close()`, mutation-checked), I-N-2.2.2 (Swagger dev only), I-N-2.2.3 (`/health`) and
      I-N-2.2.4 (> 1 MB → 413). The facade's `startApi()` is in `tests/integration/api.ts`.
    - **Results:** integration 145 (+4; the 141 existing are green under swc); typecheck and lint
      clean.
- [x] **N-2.3 Auth and context**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/auth.ts`,
    `src/lib/supabase/server.ts`, `src/proxy.ts`
  - [x] ALS middleware, a JWT guard (`jose`, `@Public`), the render memo (`X-Render-Id`), and
    `requirePartner` from the context.
  - [x] Spike: local `jwt_expiry=60` across expiries.
  - 👤 Production key-type check: the user moved it to N-7.2 (2026-10-27). The guard supports
    both key types until then.
  - **Tests:** [x] supertest: 401 for missing, expired or garbage tokens; a non-partner can read
    but gets 403 on a write route; no 401 across expiries.
  - **Result (2026-10-27):**
    - **Context** (`apps/api/src/auth/context.ts`):
      - an `AsyncLocalStorage` store per request, set by express middleware in `setupApp`;
      - it holds `{ method, renderId, userId, email, memo }`;
      - `renderId` is web's `X-Render-Id`, kept only when it is a UUID.
    - **`JwtGuard`** (global `APP_GUARD`; `@Public()` skips it):
      - reads `Authorization: Bearer`;
      - verifies with `jose`: `aud = authenticated`, `iss = ${SUPABASE_URL}/auth/v1`, `exp`;
      - checks the signature by the project's JWKS (ES256/RS256), or with HS256 by
        `SUPABASE_JWT_SECRET` only when that is set;
      - any failure → 401 "Not signed in";
      - no identity header is trusted.
      - **Found:** local Supabase (CLI 2.120) signs user tokens with **ES256** and publishes its
        JWKS. So JWKS is the main path, and dev, E2E and CI need no secret.
    - **`AuthService.requirePartner()`:**
      - reads the context, then the `profiles` row with `role = partner`, memoised;
      - throws `UnauthorizedException("Not signed in")` or
        `ForbiddenException("Only partners can do this")`, the reference's words.
      - `getProfile()` came with N-2.5.
    - **Render memo** (`auth/memo.ts`):
      - `memo(key, load)` shares a load per `userId:renderId` for 30 s on a GET with an
        `X-Render-Id`; otherwise it is per request, so a write never reads a render's value;
      - a failed load is not kept.
    - **Spike `jwt_expiry = 60`** (local config set, Supabase restarted, then reverted):
      - setup: the E2E builds of api and web, with the partner's theme set to Dark, so a 401 on
        the root layout's `/me` would show as Night Owl;
      - 9 renders of `/`, `/stock`, `/settings` and `/journal` over 3½ min, more than 3
        expiries: all stayed signed in, Dark, with the shell;
      - a theme save after the expiries was saved;
      - both server logs show 0 errors and 0 401s;
      - `proxy.ts`'s `getUser()` refreshes the cookie before each render, so web never forwards
        an expired token.
    - **Tests:** `tests/integration/api-auth.test.ts` (5):
      - I-N-2.3.1:
        - a real local token passes;
        - 401 "Not signed in" for: none, garbage, a malformed token, a forged ES256 (own key,
          same `kid`), expired, another secret, `aud = anon`, another issuer, no `sub`, the anon
          key, and no `Bearer`;
        - HS256 passes only with the secret configured.
      - I-N-2.3.2: partner, investor and a user without a profile all read; only the partner
        writes (403 "Only partners can do this", and 401 without a token).
      - I-N-2.3.3: the memo per render and user; none without an id, with a bad id, or on a
        POST.
      - I-N-2.3.4: `@Public`.
      - Mutation-checked: dropping the audience check, the issuer check, or the GET-only memo
        each fails a test.
    - The facade's `signedInUser()` creates an Auth user and a profile, then signs in through
      local Supabase Auth for a real access token.
- [x] **N-2.4 Web API client and test harness**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/tests/integration/setup.ts`, `local-db.ts`,
    `playwright.config.ts`
  - [x] The token from `getSession`, forwarded headers, the render id, timeouts, 401 → login,
    404 → `notFound`, `Jsonify`.
  - [x] Playwright runs two servers (api 3002 first, web 3001).
  - [x] The integration facade (old function names, a JSON round trip,
    `Test.createTestingModule`); Vitest plus unplugin-swc.
  - **Acceptance:** `next build` passes with the API down; the full E2E is green with two servers.
  - **Result (2026-10-27):**
    - **`apps/web/src/api/client.ts`** (server-only):
      - `accessToken()` is the session's token from `getSession()`, once per request;
      - `send()` awaits `cookies()` first, so a build never calls the api;
      - it forwards `X-Forwarded-Host` (else `host`), `X-Forwarded-Proto` and `User-Agent`, only
        when the request had them, so the api keeps the reference's defaults;
      - one `X-Render-Id` per render, on reads only;
      - a 15 s `AbortSignal.timeout` and `no-store`; nothing is retried.
      - `api<T>()`: 401 → `/login`, 404 → `notFound()`, other non-2xx throws; an empty 200
        body (Nest's `null`) → `null`.
      - `apiOrNull<T>()`: a 401 is `null`, for the root layout, where a redirect would loop on
        `/login`.
      - `call()`: 200/409/422 → the body, else it throws.
      - `write()`: `call()`, then `revalidatePath("/", "layout")` on ok.
    - **`Jsonify<T>`** (`apps/web/src/api/jsonify.ts`): Date → string; functions and
      `undefined` dropped.
    - **`Result`** moved to `@mbl/domain/result`. Web's `action.ts` re-exports it, the api
      runner uses it, and so does `write()`.
    - **Ports** (one table, in `.env.example` and the configs):
      - dev: web 3000, api 3003 (`npm run dev` runs both with `concurrently`; the api rebuilds
        with `webpack --watch` and restarts with `node --watch`);
      - E2E: 3001, 3002;
      - parity: 3011, 3012;
      - production: 4006 (N-7.1).
      - `.env.local` gains `SUPABASE_URL`, `API_PORT` and `API_URL` (local values).
    - **Playwright:** `webServer` is an array, api first: build if stale (`API_FILES` →
      `apps/api/dist/main.js`), `node apps/api/dist/main.js`, waiting on `/health`,
      `NODE_ENV=production`. Web gets `API_URL`.
    - **Parity:** `self` also builds and serves the api on 3012 with the same `clock.cjs` and
      `PARITY_NOW`, and stops both. `ref` is unchanged.
    - **CI:** `checks` runs `npm run build:api`.
    - **Facade** (`tests/integration/api.ts`):
      - `startApi(config, controllers)`;
      - `signedInUser()` and `deleteUsers()`;
      - `as(app, user)` gives `read`, `write` (200/409/422 → `Result`, else it throws, as web's
        `write()` does) and the old names (`getProfile`, `setTheme`).
    - **Tests:**
      - U-N-2.4.1 `tests/engine/jsonify.test.ts` (`expectTypeOf`; mutation-checked: Dates kept
        → typecheck fails);
      - I-N-2.4.1: the facade round trip, used by `settings-actions.test.ts` (N-2.5);
      - M-N-2.4.1: `next build` passed with nothing listening on 3001–3003.
      - E2E smoke passed with two servers. The full E2E runs on CI after the push (D-065); the
        phase specs ran locally in N-2.5.
    - The subagent also re-formatted a few untouched lines of `scripts/parity/run.ts` with
      Prettier. It wasn't Prettier-clean before.
- [x] **N-2.5 First slice: `/branding`, `/me`, `/views/shell`, `setTheme`**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/app/layout.tsx`, `src/app/(app)/layout.tsx`,
    `src/server/business.ts`, `src/server/actions/settings.ts`
  - [x] Spike: a 60 ms DB delay (toxiproxy).
  - **Acceptance:** one `loadBooksData` per render (counter test); TTFB within +10%; the theme
    E2E is green; parity.
  - **Result (2026-10-27):**
    - **api services** (ports of the Ref, with `db` → `this.db` and `cache()` → `memo()`):
      - `BusinessService.getBusiness()`;
      - `BooksService.loadBooksData()` and `loadBooks(asOf)`. The query code is identical to
        web's (`git diff -w`); only the class wrapper differs.
      - `AuthService.getProfile()`.
    - **Endpoints:**
      - `GET /branding` (`@Public`): `{ name, shortName, logoVersion }`;
      - `GET /me`: `{ id, theme, updatedAt }` or null;
      - `GET /views/shell`: `{ name, logo, email, closing, balance }`, computed as
        `(app)/layout.tsx` did;
      - `PUT /me/theme` → the runner.
    - **The runner moved early (user decision):**
      - `apps/api/src/action/runner.ts` is web's `runAction` verbatim (checked with `git diff -w`),
        with `requirePartner` from the context and no `revalidatePath`;
      - `ResultStatus` maps ok → 200, duplicate/conflict → 409, invalid → 422;
      - web's other actions keep web's `runAction` until S5.
    - **Web:**
      - the root layout reads `/branding` (title) and `apiOrNull("/me")` (theme);
      - `(app)/layout.tsx` makes one `/views/shell` call. The JSX is unchanged, and the RSC
        `getUser()` round trip is gone.
      - `setTheme` = `write("PUT", "/me/theme", input)`.
      - `logoSrc` moved to `@mbl/domain/business`; web re-exports it.
      - View types are imported type-only from `@mbl/api/*` (`apps/api/package.json` `exports`).
    - **Deviation:** the login page (not a Ref of this step) also reads `/branding`, because its
      title and logo need the same public data. Its text is unchanged; parity covers `/login`.
    - **Temporary:** Home still loads the books in web as well (`(app)/page.tsx`, until N-4.2), so
      one Home render loads them once in each process.
    - **Tests:**
      - `settings-actions.test.ts` is ported to the facade: the same 3 test ids, real sign-ins,
        and the books-balance check through `/views/shell`.
      - `api-shell.test.ts`:
        - I-N-2.5.1: one `loadBooksData` for `/views/shell` ×2, `/me` and `/branding` in one
          render, then 2 after a new render. Mutation-checked: without the memo it gets 2.
        - I-N-2.5.2: `/views/shell` equals the values web's layout computes, on the parity book.
        - I-N-2.5.3: `/branding` is public; `/me` and `/views/shell` are 401 without a token.
      - E2E settings, shell, ui-dark and smoke (night_owl): 30 passed, 5 skipped (viewport-only
        tests).
    - **Parity:** MATCH (202 files). TTFB over 92 routes was 9633 → 5651 ms (−41%) against the
      morning's baseline; the final gate run gave 9633 → 6256 ms (−35%).
    - **Spike: 60 ms DB delay** (toxiproxy on 55323 in front of 55322, a measured 65 ms per round
      trip; both builds dumped back to back through it):
      - MATCH (202 files);
      - TTFB over 92 routes: reference 21390 → this repo 18190 ms (**−15%**);
      - `/` 225 → 210 ms, `/settings` 283 → 194 ms, `/stock` 231 → 197 ms.
      - The extra api hop costs less than the reference's per-render GoTrue `getUser()`, even
        with Home's books loaded on both sides.
      - Not modelled: production's DB and Auth are cross-region from the VPS, so `getUser()`
        costs more there. That only helps this repo.

---

## Phase N-3 — Writes (every server action becomes a thin proxy)

*At the end:* no `runAction` or `db.transaction` in `apps/web`. Each step moves its
`src/server/actions/<file>.ts` Ref to a Nest controller and service, adds the web proxy, and ports
that file's integration tests to the facade.

### Session S5
Screenshots: each form saving, the duplicate warning, the Undo toast.

- [x] **N-3.1 Write runner and the Setup lists**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/action.ts`, `src/server/actions/setup.ts`
  - [x] Port `runAction` almost verbatim; add the status interceptor and web's `write()`/`call()`.
    Done early in N-2.5 (user decision, 2026-10-27): `apps/api/src/action/{runner,result-status}.ts`
    and `apps/web/src/api/client.ts`. Web's `runAction` stays until its last caller moves.
  - [x] The Setup lists (`savePerson` … `saveModel`, `setActive`, `removeRow`) set the pattern.
  - **Tests:** [x] `action.test` and `setup-actions.test` green via the facade; the `setup.spec`
    E2E.
  - **Result (2026-10-27):**
    - **The pattern** (every N-3 step):
      - `apps/api/src/<area>/<area>.service.ts` is the Ref action file as a class: `runAction` →
        `this.runner.runAction`, imports remapped. `git diff --no-index -w` against the Ref shows
        only that wrapper.
      - `<area>.controller.ts` is thin: `ResultStatus`, `@ZodBody` (Swagger), and `@Body() input:
        unknown` straight to the service. The runner's Zod step validates.
      - The id stays in the body (the runner's contract), as in `PUT /me/theme`.
      - Web's `src/server/actions/<file>.ts` keeps its exported names and signatures; each is a
        `write(method, path, input)`. The forms are unchanged (they pass plain objects).
    - **Routes:** `PUT /setup/{person,card,customer,supplier,model}`, `PUT /setup/:kind/active`,
      `DELETE /setup/:kind`. An unknown kind throws "Unknown setup list" (500), as before; web
      URL-encodes the kind.
    - **Facade** (`tests/integration/api.ts`):
      - `as()` gains the old names;
      - `partnerApi(sql, name)` gives an in-process api, a signed-in partner and those names, with
        `close()`;
      - `startApi()` takes `providers` (a test controller's `Runner`) and listens once on an
        ephemeral port, so supertest reuses the server for concurrent requests (it warned about
        listeners before).
    - **`action.test.ts`:** a test-only controller runs the in-test specs on the api's `Runner`
      over HTTP. I3.1.1–4 are unchanged. I3.1.5 is now HTTP: 401 "Not signed in" without a
      token, 403 "Only partners can do this" for an investor, nothing written.
    - **User decision (S5):** files that use these actions only to make data switch to the facade
      too. Web actions that haven't moved (reverse, close, business, card secrets) keep the
      `getUser` mock, returning the facade partner's id, so both paths act as one partner.
      - N-3.1: `setup-actions` (ported), `business-actions` and `card-secrets` (`removeRow`; that
        file signs its own password partner in).
    - **Tests:** action + setup-actions 10, business-actions + card-secrets 17; `setup.spec` 9
      passed.
    - **Found (not changed):** `setup.spec` E-CR-016.5 picks "the first Owner", so it needs a
      person in the DB from an earlier spec. Right after an integration run (which empties
      `people` on the same local DB) it failed on mobile; it passed on the re-run and in the
      gate. CI's E2E job has its own DB.
- [x] **N-3.2 Money entries**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/actions/money.ts`
  - **Tests:** [x] `money-actions.test`; `money.spec`, `personal-spend.spec`.
  - **Result (2026-10-27):**
    - `apps/api/src/money/*` and `apps/api/src/numbers.ts` (the Ref's `nextReceiptNo` /
      `nextInvoiceNo`); `PUT|DELETE /money-entries`.
    - Switched to the facade: `money-actions` (ported) and 11 files that save money entries for
      their data (account-reports, cards, charts, journal-actions, lock-actions, messages, numbers,
      pdf, profit-actions, reopen-actions, reports). Sonnet subagents edited them; reviewed here.
    - **Tests:** 12 files, 52 passed; E2E 17 passed.
- [x] **N-3.3 Purchases**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/actions/purchase.ts`
  - **Tests:** [x] `purchase-actions.test`; `purchase.spec`.
  - **Result (2026-10-27):**
    - `apps/api/src/purchase/*`; `PUT|DELETE /purchases`.
    - Switched: `purchase-actions` (ported), `card-page`; charts, journal-actions and lock-actions
      gain the names.
    - **Tests:** 5 files, 22 passed; E2E 5 passed.
- [x] **N-3.4 Sales (incl. "Received now", Undo)**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/actions/sale.ts`
  - **Tests:** [x] `sale-actions.test`; `sale.spec`, `entry-flow.spec`.
  - **Result (2026-10-27):**
    - `apps/api/src/sale/*`; `PUT|DELETE /sales`.
    - `apps/api/src/stock/lots.ts` is web's `stockLots` with `q` required (the write path's part;
      `git diff -w` shows only that). Web's copy stays for its reads and `reverse.ts` until S6/S7.
    - Web's `src/server/numbers.ts` is deleted: nothing in web uses it any more.
    - Switched: `sale-actions` (ported); account-reports, charts, journal-actions, lock-actions,
      messages, numbers, pdf and reports gain the names.
    - **Tests:** 9 files, 37 passed; E2E 11 passed.
- [ ] **N-3.5 Returns**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/actions/return.ts`
  - **Tests:** [ ] `return-actions.test`; `return.spec`.

### Session S6
Screenshots: a reversal, a month close, the logo upload, the card reveal.

- [ ] **N-3.6 Reverse; month close and re-open**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/actions/reverse.ts`,
    `src/server/actions/months.ts`
  - **Tests:** [ ] `journal-actions`, `close-actions`, `reopen-actions`, `lock-actions`;
    `reversal.spec`, `month-close.spec`.
- [ ] **N-3.7 Card bill dates; business details, logo (1 MB), templates, PDF terms, bank accounts**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/actions/cards.ts`,
    `src/server/actions/business.ts`
  - **Tests:** [ ] `cards`, `business-actions`; `business.spec`, `card-page.spec`.
- [ ] **N-3.8 Card details save/remove; passkeys**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/actions/card-secrets.ts`,
    `src/server/actions/passkeys.ts`, `src/server/password-check.ts`
  - [ ] Passkeys: the setup options with the password check and lockout, register, remove, and
    the reveal options.
  - **Tests:** [ ] `card-secrets.test` (header mocks become forwarded headers);
    `card-secrets.spec`, `settings.spec`.

---

## Phase N-4 — Reads (pages get one `/views/*` call; JSX unchanged)

*At the end:* no value import of `@/server` in web; parity over every route; the Date leaks are
fixed.

### Session S7
Screenshots: those screens, plus the parity report.

- [ ] **N-4.1 Core read services and contract**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/{books,setup,business,journal,entries,stock}.ts`
  - [ ] Books (with the memo), setup, business, journal, entries, stock and calendar become
    services; `contract.ts` holds the `Jsonify` types.
  - **Tests:** [ ] the `books` and `queries` integration tests are green; the memo counter.
- [ ] **N-4.2 Home, Journal, EntryOverlay**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/app/(app)/page.tsx`, `journal/page.tsx`,
    `src/components/journal/entry-overlay.tsx`
  - **Tests:** [ ] the `home`, `journal` and `dashboard-totals` E2E; parity.
- [ ] **N-4.3 Entry form pages: sales, purchases, returns, money (new and edit)**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/app/(app)/{sales,purchases,returns,money}/**`,
    `src/server/returns.ts`
  - **Tests:** [ ] `entry-sheet` and the form specs; parity.
- [ ] **N-4.4 Lists: stock, cards, customers, suppliers, people**
  - **Ref:** the list `page.tsx` files under `D:/Projects/Mobile-Business-Lite/src/app/(app)/`
  - **Tests:** [ ] the `stock` and `cards-tab` E2E; parity.

### Session S8
Screenshots: those screens, plus the parity report.

- [ ] **N-4.5 Account pages and overlays**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/{accounts,cards,account-reports,messages}.ts`,
    the overlay components
  - [ ] Account pages: customers, suppliers, people, cards `[id]`, the customer trend.
  - [ ] Overlays: Bank, AccountOverlays, Send, StatementByModel, CardSecrets.
  - **Tests:** [ ] `account-reports`, `messages`, the `card-page` E2E; parity.
- [ ] **N-4.6 Months (and `[month]`), setup, saved, settings (passkey dates), export page**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/months.ts`, `settings/page.tsx`,
    `saved/page.tsx`
  - **Tests:** [ ] the `month-close` and `settings` E2E; the Date leaks typecheck clean; parity.
- [ ] **N-4.7 Reports: cash, sales, investor, pack**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/{reports,pack}.ts`, `report-lines.ts`
  - **Tests:** [ ] the `reports` E2E; parity.
- [ ] **N-4.8 Charts (tabs and `[chart]`)**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/charts.ts`
  - **Tests:** [ ] the `charts*` E2E specs; parity.

---

## Phase N-5 + N-6 — Files, cleanup and final gate

### Session S9
Screenshots: the PDFs and XLSX, the 8 screens × 3 themes, the README.

- [ ] **N-5.1 PDFs ×7 in Nest**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/app/pdf/**`, `src/pdf/**`
  - [ ] The font path comes from config or `__dirname`; one `app/pdf/[kind]/route.ts` forwarder.
  - **Tests:** [ ] `pdf.test` via supertest; `pdf.spec`; PDF-text parity.
- [ ] **N-5.2 XLSX ×4 and the export download**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/app/(app)/reports/*/xlsx`, `export/download`,
    `src/server/export.ts`
  - [ ] The export runs at repeatable read and writes an audit row.
  - **Tests:** [ ] `export.test`, `reports.test`; `export.spec`; cell parity.
- [ ] **N-5.3 Card reveal and `/logo`**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/app/(app)/cards/[id]/reveal/route.ts`,
    `logo/route.ts`, `src/lib/card-crypto.ts`
  - [ ] The reveal needs a passkey and sets the 30 s `card_reveal` cookie (`Path=/cards`).
  - **Tests:** [ ] `card-secrets.spec` (CDP authenticator on localhost); `curl -I /logo` headers
    identical.
- [ ] **N-6.1 Delete web's server code; boundary lint**
  - [ ] Remove `DATABASE_URL` and `CARD_SECRET_KEY` from web.
  - [ ] Boundary lint. Web: no db, drizzle, postgres or `node:crypto`; api imports are type-only.
    Domain: no react, next, db or nest.
  - [ ] Prune the dependencies.
  - **Tests:** [ ] E2E green with web's env stripped; the lint rule tests.
- [ ] **N-6.2 Docs**
  - [ ] A README for interviewers: screenshots of fictional data, a diagram, how to run it
    locally, the test matrix, the key D entries.
  - [ ] `docs/ARCHITECTURE.md`; the final SRS §1/§2/§11/§12/§13; the CLAUDE.md commands.
  - **Acceptance:** a fresh clone runs by following the README.
- [ ] **N-6.3 Final gate**
  - **Ref:** the baseline
  - [ ] Text parity at both viewports; screenshots of 8 screens × 3 themes; file text; audit rows;
    latency; full CI.
  - [ ] All `HF-n` done.
  - [ ] 👤 The partners' consent, then make the repo public.
  - **Acceptance:** all green; gitleaks and the denylist clean again.

---

## Phase N-7 — Production switch

### Session S10
Screenshots: the rehearsal log; the production smoke test.

- [ ] **N-7.1 Two-unit deploy and rehearsal**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/scripts/deploy.sh`, `deploy/*`
  - [ ] A two-unit `deploy.sh`: build both, migrate once, stage, start the api then web with curl
    checks, a marker file, and `--env-file` per copy. Rolling back to a monolith copy stops the
    api.
  - [ ] `deploy/mobile-business-api.service`; `deploy/README.md`.
  - [ ] Rehearse deploy → rollback → deploy in WSL with systemd.
  - **Acceptance:** the rehearsal log is in this step.
- [ ] **N-7.2 👤 Switch** (the user's go-ahead, at a quiet time)
  - [ ] 👤 Production key-type check (moved from N-2.3), before the api's `.env` is written:
    `curl -s https://<project>.supabase.co/auth/v1/.well-known/jwks.json`.
    - Keys listed → JWKS; the api needs only `SUPABASE_URL`.
    - `{"keys":[]}` → HS256; the api also needs `SUPABASE_JWT_SECRET`.
    - Then drop the unused path from `apps/api/src/auth/jwt.guard.ts`.
  - [ ] Node 24 via nvm; clone this repo to the VPS (deploy key); web and api `.env` (mode 600)
    from the old `.env.local`; the units; deploy.
  - [ ] Smoke test with both partners: login, save/delete, PDF, reveal.
  - [ ] One week of watching, with the old clone kept for rollback.
  - **Tests:** [ ] M-N-7.2.x smoke passes; logs clean for 24 h. Then the reference becomes an
    archive.

---

## Hotfixes (HF-n)

A fix made in the reference repo (production) becomes a step here, done before the next N step:

```
- [ ] **HF-n Title** (YYYY-MM-DD)
  - **Ref:** <reference commit sha> · **D:** D-NNN (if a rule changed)
  - [ ] subtasks…
  - **Tests:** [ ] U/I/E…
  - **Acceptance:** …
```

(none yet)

## Change requests (during the migration)

Feedback or a rule change found during the migration goes here, after its D entry and doc edits
(`/change-request`). It uses the `docs/TASKS.md` template and continues its CR numbering.

- [x] **CR-047 Delete the opening-import tools** (2026-10-27)
  - **Source:** user decision in N-0.4 · **Decision:** D-070 · **Docs:** SRS §1, §9, §12, §13
  - [x] Delete `scripts/build-opening-template.ts`, `scripts/import-opening.ts`,
    `scripts/opening/*`, `tests/engine/opening-template.test.ts`,
    `tests/integration/opening-import.test.ts`, and the `opening-template.xlsx` lines in
    `.gitignore`.
  - **Tests:** [x] typecheck, lint, unit and integration green without them; opening entries stay
    covered by the engine and integration suites.
  - **Acceptance:** nothing imports `scripts/opening`; nothing reads `docs/source`.
