# CLAUDE.md

**Mobile Business Lite:** a small, precise bookkeeping web app for a two-partner mobile-phone
trading business. It uses BDT ৳ and the Asia/Dhaka time zone, and replaces their Excel sheets.

**Status:** the NestJS migration (D-068) is under way; see the first unchecked step in
`docs/TASKS-NEST.md`.

## Docs (source of truth; read only the section a task cites)
- **Reference implementation:** `D:/Projects/Mobile-Business-Lite` is the **reference
  implementation**: read-only, never write to it. When porting, read the task's **Ref** files
  there. Its behavior is the target unless a D entry says otherwise. Never copy its `docs/source/`
  or real names (the denylist check, `docs/TASKS-NEST.md` → How to use).
- `docs/TASKS-NEST.md`: the migration steps (`N-x.y`, sessions S1–S10) and hotfixes (`HF-n`), with
  Ref, tests and acceptance. Run a session with `/next-phase S<n>`, a hotfix with `/next-task HF-n`.
- `docs/PRD.md`: what and why (scope §4, stories S1–S18 §6).
- `docs/SRS.md`: how (data model §4, **posting rules §5**, cards §6, close §7, build order §13).
- `docs/UIDD.md`: screens, forms, formatting.
- `docs/TASKS.md`: Now, the open v1.1 tasks, tests, acceptance criteria. Finished v1.1 CRs are in
  `docs/TASKS-v1.1-done.md`; read one there only when it is cited.
- `docs/v1.1-plan.md`: the approved v1.1 spec (decisions, UI rules, each CR's details, review
  findings, WhatsApp message samples). Read the section of the CR you are working on.
- `docs/AI.md` + `docs/TASKS-AI.md`: the AI assistant track (D-057), separate from v1.1; task ids
  `AI-x.y`.
- `docs/TASKS-v1.md`: v1 archive (phases 0–7, CR-001…CR-014); read only when a D entry or test
  id cites an old task.
- `docs/DECISIONS.md`: why each rule changed. Start from its index; v1's entries are in
  `docs/DECISIONS-v1.md`.
- `D:\Projects\Mobile-Business` is a sister repo, for reference only. Don't apply its stack or
  rules here.

## Stack (decided)
- Two apps (D-068; `docs/ARCHITECTURE.md`):
  - `apps/web`: Next.js 16 (App Router, TS; Turbopack build, D-048), the UI. Its server actions
    and file routes are thin proxies to the api; it has no database URL and no card key.
  - `apps/api`: NestJS 11 (webpack + swc bundle), on 127.0.0.1 only: the data, the write runner,
    the `/views/*` reads, the `/files/*` routes, the crypto.
  - `packages/domain` (pure, shared) and `packages/db` (schema, migrations); a boundary lint
    keeps them apart.
- Supabase Postgres + Auth (ap-south-1).
- Drizzle + drizzle-kit (in the api only).
- Tailwind + shadcn/ui; React Hook Form + Zod.
- Vitest (unit; integration = the api in-process with supertest, on local Supabase);
  Playwright (E2E); the parity harness (`scripts/parity`).
- ExcelJS; `@react-pdf/renderer` for PDFs (D-041); shadcn Chart (Recharts) for charts (D-064).

## Non-negotiables
- **Store facts, derive balances:** no stored balances; everything comes from
  `computeBooks()`.
- **Money is integer poisha in TS** (`numeric(14,2)` in the DB). It is never a float.
- **Every entry moves both sides exactly as SRS §5**, and tests assert the books-balance
  invariant.
- **Pick, don't type:** every person/card/customer/supplier/model is a foreign key from a picker.
- **Production is off-limits unless the user says so.** On this laptop `.env.local` is local
  Supabase; the production keys are only in `.env.prod` (and in the VPS's own `.env.local`, D-066).
  - Never read or write production (any `--env-file=.env.prod` run, a query or a script) without
    the user's explicit go-ahead for that specific run. Ask first, every time; an earlier OK does
    not carry over. The scripts refuse a non-local DB unless `CONFIRM_PROD=1` is set.
  - Production reads should be rare. Use local Supabase for tests, experiments and checks.
  - A production write always starts with a dry run shown to the user.
- **The AI is read-only** (`docs/AI.md` §2): nothing in `apps/web/src/server/ai/**` imports a server action
  or writes; its figures are rendered from the screens' view-models, never typed by the model.
- Domain detail lives in `.claude/rules/` (money/engine, DB/actions, AI); it loads when those files
  are touched.

## Principles
- **KISS:** plain functions; no extra layers, state libraries or caching.
- **DRY:** one source per rule; extract only at the 3rd repetition.
- **YAGNI:** nothing beyond PRD §4 without asking.
- **File size:** aim for ≤ 500 lines per file; hard cap 1000 (ESLint `max-lines`).

## Change workflow
- Implement a task with `/next-task [id]`.
- Feedback, a scope change, or a doc/code mismatch → `/change-request`. It writes the D entry and
  the docs first, then a CR task, then the code.
- If anything doesn't align, **stop and tell the user**. Ask when a business rule is ambiguous.

## Commands
```bash
npm run dev                      # web http://localhost:3000 + api http://127.0.0.1:3003
npm run seed:demo                # local only: replace the data with the fictional demo book
npm test                         # unit (engine, money, the card fixture, the boundary lint)
supabase start                   # local Postgres + Auth (Docker) for test:int / test:e2e
npm run test:int                 # the api (in-process) vs local Supabase
npm run test:e2e                 # Playwright, 360px + 1280px, all themes (CI, before a deploy)
E2E_THEMES=night_owl npx playwright test <specs>   # a task's local E2E, one theme (D-065)
npm run typecheck && npm run lint
npm run build:api                # the api's bundle (apps/api/dist)
npm run parity                   # this build vs the reference baseline (npm run parity:ref)
npm run db:generate              # migration from packages/db/src/schema.ts
npm run db:migrate               # apply to DATABASE_URL
```
Env (never committed; `.env.example` lists each app's lines):
- web: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `API_URL`;
- api: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CARD_SECRET_KEY`, `API_PORT`
  (`SUPABASE_JWT_SECRET` only on a legacy HS256 project).

`.env.local` = local Supabase (from `npx supabase status -o env`, plus the E2E card key); each app
reads only its own lines. `.env.prod` = production, which neither app loads by itself.

## Git
- Branches: `main` ← `dev` ← `feature/<step>-<desc>`, merged into `dev` with `--no-ff`.
- Commits: `<type>(<scope>): <desc>`.
  - Types: feat, fix, refactor, docs, test, chore.
  - Scopes: engine, db, ui, auth, import, docs.
- Commit or push only when the user asks. On `dev`, the user's "commit" for an approved task
  means commit and push to `origin/dev`, so CI runs the full suites (D-065).
