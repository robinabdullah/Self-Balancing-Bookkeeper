# Mobile Business Lite — Tasks (NestJS migration)

*Task breakdown · 27 October 2026* — moves the app to a NestJS backend with Next.js as the UI on
top: the same screens, URLs, cookies, messages and numbers (D-068). This repo is the public copy
(D-069). The v1.1 product tasks are in `docs/TASKS.md`. They are finished and are only read when
cited.

## Now
- **Live:** production runs the reference repo (`D:/Projects/Mobile-Business-Lite`) until N-7.2.
- **Session:** S3 in progress. N-1.1 (the parity harness) is done and waiting for review. S3 stops
  for review after each step (the user chose this, because the moves can't be split later).
  The first CI run on `dev` is green.
- **Next:** N-1.2 (workspaces plus `apps/web`), after N-1.1 is committed.
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
- [ ] **N-1.2 Workspaces plus `apps/web`**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/next.config.ts`, `playwright.config.ts`,
    `vitest.config.ts`, `scripts/deploy.sh`
  - [ ] A pure `git mv` commit, then a path-rewrite commit.
  - [ ] Updated: tsconfig, eslint, the vitest projects, Playwright `APP_FILES`, `next.config.ts`
    (`transpilePackages`, `outputFileTracingRoot`, `turbopack.root`), CI, and the `deploy.sh` and
    unit paths.
  - **Acceptance:** full suites green; parity.
- [ ] **N-1.3 `packages/domain`**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/lib/**`, `src/components/journal/labels.ts`
  - [ ] Move the pure lib (engine, money, dates, guards, validation, view helpers, `labels.ts`,
    `money/types.ts`, the `PayAccount` type) with relative imports. `card-view.ts` and
    `form-help.ts` stay in web. Structural types replace the `SetupData`/`JournalRow` imports.
  - **Acceptance:** the unit suite is green from its new home; parity.
- [ ] **N-1.4 `packages/db`**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/db/**`,
    `src/lib/validation/{money-entry,trade,setup}.ts`
  - [ ] Move the schema, migrations, drizzle.config and client factory. The enum value lists move
    to domain (`pgEnum(name, X_VALUES)`), so drizzle leaves the browser bundle.
  - **Acceptance:** `drizzle-kit generate` reports no change; no `drizzle-orm` in
    `.next/static/chunks`; parity.

---

## Phase N-2 — Nest foundation

*At the end:* Nest runs beside Next in dev and E2E; the shell, branding, profile and theme come
from Nest.

### Session S4
Screenshots: the shell (top bar, balance chip), the theme switch, Swagger `/docs`.

- [ ] **N-2.1 Spike: packaging**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/pdf/document.tsx`, `src/server/passkeys.ts`
  - [ ] The Nest webpack build bundles `@mbl/*`, react-pdf (ESM-only), ExcelJS, simplewebauthn and
    the chosen Swagger library (`nestjs-zod` vs zod 4 `z.toJSONSchema`).
  - [ ] Copied to an empty folder, the build serves `/health`, one PDF, one XLSX and the
    registration options. Record the RSS.
  - **Acceptance:** the written result in this step decides the bundle and the Swagger library.
- [ ] **N-2.2 api skeleton**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/db/index.ts` (the CR-030 note)
  - [ ] Zod-validated config, a DbModule (one pool, closed on shutdown), `/health` (`select 1`),
    a 1 MB JSON limit, bind 127.0.0.1, Swagger in dev only.
  - **Tests:** [ ] I-N-2.2.x: the pool closes; Swagger is absent when `NODE_ENV=production`.
- [ ] **N-2.3 Auth and context**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/auth.ts`,
    `src/lib/supabase/server.ts`, `src/proxy.ts`
  - [ ] ALS middleware, a JWT guard (`jose`, `@Public`), the render memo (`X-Render-Id`), and
    `requirePartner` from the context.
  - [ ] Spike: local `jwt_expiry=60` across expiries.
  - [ ] 👤 Production key-type check (a production read, needs the user's OK at the time).
  - **Tests:** [ ] supertest: 401 for missing, expired or garbage tokens; a non-partner can read
    but gets 403 on a write route; no 401 across expiries.
- [ ] **N-2.4 Web API client and test harness**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/tests/integration/setup.ts`, `local-db.ts`,
    `playwright.config.ts`
  - [ ] The token from `getSession`, forwarded headers, the render id, timeouts, 401 → login,
    404 → `notFound`, `Jsonify`.
  - [ ] Playwright runs two servers (api 3002 first, web 3001).
  - [ ] The integration facade (old function names, a JSON round trip,
    `Test.createTestingModule`); Vitest plus unplugin-swc.
  - **Acceptance:** `next build` passes with the API down; the full E2E is green with two servers.
- [ ] **N-2.5 First slice: `/branding`, `/me`, `/views/shell`, `setTheme`**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/app/layout.tsx`, `src/app/(app)/layout.tsx`,
    `src/server/business.ts`, `src/server/actions/settings.ts`
  - [ ] Spike: a 60 ms DB delay (toxiproxy).
  - **Acceptance:** one `loadBooksData` per render (counter test); TTFB within +10%; the theme
    E2E is green; parity.

---

## Phase N-3 — Writes (every server action becomes a thin proxy)

*At the end:* no `runAction` or `db.transaction` in `apps/web`. Each step moves its
`src/server/actions/<file>.ts` Ref to a Nest controller and service, adds the web proxy, and ports
that file's integration tests to the facade.

### Session S5
Screenshots: each form saving, the duplicate warning, the Undo toast.

- [ ] **N-3.1 Write runner and the Setup lists**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/action.ts`, `src/server/actions/setup.ts`
  - [ ] Port `runAction` almost verbatim; add the status interceptor and web's `write()`/`call()`.
  - [ ] The Setup lists (`savePerson` … `saveModel`, `setActive`, `removeRow`) set the pattern.
  - **Tests:** [ ] `action.test` and `setup-actions.test` green via the facade; the `setup.spec`
    E2E.
- [ ] **N-3.2 Money entries**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/actions/money.ts`
  - **Tests:** [ ] `money-actions.test`; `money.spec`, `personal-spend.spec`.
- [ ] **N-3.3 Purchases**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/actions/purchase.ts`
  - **Tests:** [ ] `purchase-actions.test`; `purchase.spec`.
- [ ] **N-3.4 Sales (incl. "Received now", Undo)**
  - **Ref:** `D:/Projects/Mobile-Business-Lite/src/server/actions/sale.ts`
  - **Tests:** [ ] `sale-actions.test`; `sale.spec`, `entry-flow.spec`.
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
