# Self-Balancing Bookkeeper — Tasks (AI assistant track)

*Task breakdown · 13 October 2026.* This file implements `docs/AI.md` (decision D-057). The track is
separate from v1.1: the v1.1 tasks stay in `docs/TASKS.md`, and the AI work never changes a v1.1
rule.

## Now
- **Now:** AI-0 (docs) is done. The next task is **AI-1.1**.
- **Deploy cadence:** still open. Recommended: deploy after **AI-2**, the first point where it can
  be used on a phone, then after each later phase. The user decides before AI-2 ends.
- **Blocked on:** —

## How to use

- **Ticks:** `[ ]` = to do, `[x]` = done. A task is ticked only when all of its subtasks, tests and
  acceptance criteria are met.
- **IDs:**
  - tasks are `AI-<phase>.<n>` and subtasks `AI-<phase>.<n>.<s>`;
  - tests are `U` unit · `I` integration · `E` end-to-end · `M` manual, plus the task id (e.g.
    `U-AI-1.2.1`);
  - IDs never clash with `CR-NNN` in `docs/TASKS.md`.
- **Running a task:** `/next-task AI-1.1`. Feedback or a change: `/change-request <text>`. AI-track
  changes edit `docs/AI.md` and add a task here.
- **D entries** stay in `docs/DECISIONS.md`, numbered with the rest of the project.
- 👤 marks a step only the user can do.

## Principles (on top of `docs/TASKS.md` → Principles, which all apply)

- **Read-only (AI.md §2).**
  - Nothing under `src/server/ai/**` imports a server action, `runAction` or `@/db` (except
    `read.ts`).
  - All AI data loading runs inside `aiRead()` (a READ ONLY transaction).
- **No figure from the model (AI.md §6).**
  - Every number, name and date in an answer is a fact placeholder, rendered by code from the
    linked screen's own view-model.
- **Engine untouched:** `src/lib/engine/**` is not edited.
- **UI (D-034):** Home gets nothing new. Ask lives in More. Explain items live in the existing ⋯
  and Report sheets. Settings → AI is split into sections.
- **No real API calls in tests:** tests use the fake provider (`AI_FAKE=1`). A real-provider check
  is a manual script the user runs.

## Definition of Done (every AI task)

- [ ] The task's listed tests are written and green: unit, integration, and E2E at 360 and 1280.
- [ ] `npm run typecheck` and `npm run lint` are clean, including `max-lines` and the AI
  import ban.
- [ ] `git diff --stat src/lib/engine` is empty.
- [ ] The read-only integration test is green: every tool runs, then every table's row count and
  `audit_log` are unchanged.
- [ ] No key, prompt, answer or business data appears in logs or test output (D-014). Contacts,
  saved bank accounts and card secrets never appear in any tool's output.
- [ ] Every new form has its About text in `src/lib/help-text.ts`.
- [ ] The docs still match the code. If they don't, a D entry is added and `docs/AI.md` is updated
  first.
- [ ] UI tasks: no horizontal scroll at 360 px, tap targets ≥ 44 px, axe clean in every theme, and
  360 + 1280 screenshots shown to the user before ticking.

---

## Phase AI-0 — Docs

- [x] **AI-0.1 Spec, task list and pointers** (2026-10-13)
  - **Source:** user request · **Decision:** D-057 · **Docs:** `docs/AI.md` (new); one-line
    pointers in PRD §4, SRS §2 and UIDD §3; `CLAUDE.md`.
  - [x] `docs/AI.md` and this file.
  - [x] D-057 in `docs/DECISIONS.md`.
  - [x] Pointers in PRD, SRS and UIDD. `CLAUDE.md`: the Docs list, plus "AI is read-only" under
    Non-negotiables.
  - [x] `/next-task` and `/change-request` know AI ids. New `.claude/rules/ai.md`.
  - **Acceptance:** `/next-task AI-1.1` finds its task here. No `src/` change.

---

## Phase AI-1 — Foundation (providers, keys, read-only plumbing)

*At the end of this phase:* Arif can add Gemini, GLM, Claude or any OpenAI-compatible provider
with several keys, test them, order them and switch them off. Nothing answers questions yet.

- [ ] **AI-1.1 One label list + view-model facts**
  - **Docs:** AI.md §6.
  - [ ] AI-1.1.1 `src/lib/labels.ts` holds the UI labels used by Home, the balance breakdown and the
    reports this track touches. `page.tsx`, `dashboard.ts` and the report builders import them.
    The text on screen doesn't change.
  - [ ] AI-1.1.2 A `Fact` type `{ id, label, context, kind, value, href }` and per-screen fact
    builders (start with Home and the balance breakdown). Each builder reads the screen's own
    view-model.
  - **Tests:**
    - [ ] U-AI-1.1.1 Each Home fact equals the Home tile's value.
    - [ ] U-AI-1.1.2 "We owe suppliers" is + on Home and − in the breakdown, and each fact carries
      its own screen's sign.
    - [ ] E-AI-1.1.1 Home and the balance chip show the same text as before (no visual change).
      "Before" is the Books balance sheet after CR-039 (D-064): Business assets, Total we owe, Net
      worth.
  - **Acceptance:** no label is written twice. The facts tie out to the screens.

- [ ] **AI-1.2 Migration: AI tables + kill switch**
  - **Docs:** AI.md §8.
  - [ ] AI-1.2.1 `ai_providers`, `ai_models`, `ai_keys` and `ai_usage` (columns as in §8, base
    columns, FKs, CHECKs: `tier` and `adapter` enums, `base_url` starts with `https://`, caps ≥
    0), plus `business_profile.ai_enabled` (default false). RLS enabled, no policies.
  - [ ] AI-1.2.2 The export `TABLES` gets none of these tables. The Setup delete guards are
    unaffected.
  - **Tests:**
    - [ ] I-AI-1.2.1 The migration applies on local Supabase, and RLS is on for every new table.
    - [ ] I-AI-1.2.2 The Excel export contains no `ai_*` sheet.
  - **Acceptance:** one migration file. Production is never touched (that is a 👤-approved deploy
    step).

- [ ] **AI-1.3 Read-only plumbing**
  - **Docs:** AI.md §2.
  - [ ] AI-1.3.1 `src/server/ai/read.ts`: `aiRead(fn)` opens a transaction on the shared pool,
    runs `SET TRANSACTION READ ONLY`, then `fn(tx)`. It uses `loadBooksData(tx)`.
  - [ ] AI-1.3.2 An ESLint `no-restricted-imports` block for `src/server/ai/**`: it bans
    `@/server/actions/*`, `@/server/action` and `@/db` (with `read.ts` allowed).
  - **Tests:**
    - [ ] I-AI-1.3.1 An INSERT inside `aiRead()` throws a read-only error, and no row is added.
    - [ ] U-AI-1.3.1 Linting a planted file that imports `@/server/actions/sale` fails.
  - **Acceptance:** no second DB pool. `loadBooksData` behaves the same.

- [ ] **AI-1.4 Settings → AI (only Arif)**
  - **Docs:** AI.md §8, §10. UIDD §4.13 pointer.
  - [ ] AI-1.4.1 Server actions save, toggle, reorder and delete a provider, model and key through
    `runAction()`, plus an `AI_ADMIN_EMAIL` check. A key is encrypted with `encryptField` (AAD
    `ai_key:<id>`), and only `last4` is returned. Audit rows never hold the secret.
  - [ ] AI-1.4.2 The Settings → AI section: the kill switch, then Providers / Models / Keys lists,
    each item opening a sheet. Everyone else sees it read-only. About text is in `help-text.ts`.
  - **Tests:**
    - [ ] I-AI-1.4.1 Saving a key stores ciphertext only. Reading it back via the action returns
      `last4` only.
    - [ ] I-AI-1.4.2 A partner whose email is not `AI_ADMIN_EMAIL` is refused on every AI
      settings action.
    - [ ] I-AI-1.4.3 The audit row of a key save has no secret in `before` or `after`.
    - [ ] E-AI-1.4.1 Arif adds a provider, model and key. The key list shows `…last4`. The other
      partner sees no edit controls (360 + 1280).
  - **Acceptance:** a key is never shown again after Save.

- [ ] **AI-1.5 Adapters, router, limits and usage**
  - **Docs:** AI.md §3, §4.
  - [ ] AI-1.5.1 Pin the `ai`, `@ai-sdk/google`, `@ai-sdk/anthropic` and
    `@ai-sdk/openai-compatible` versions. Check the build on Next 16 (standalone).
  - [ ] AI-1.5.2 `src/server/ai/router.ts`:
    - providers by priority;
    - checked models with the job's abilities;
    - a rotation over ready keys;
    - 429 → rest (`retryDelay` / daily reset / 60 s) → next key → next provider;
    - bad key → Error with the key text stripped;
    - timeouts (30 s per call, 60 s overall) never rest a key;
    - the daily token cap;
    - 6 questions a minute per user;
    - kill switch.
  - [ ] AI-1.5.3 `ai_usage` adds the requests and tokens per key per day. Settings shows Used
    today.
  - **Tests:**
    - [ ] U-AI-1.5.1 A 429 on key 1 rests it, and key 2 answers.
    - [ ] U-AI-1.5.2 When every key of provider A rests, provider B answers.
    - [ ] U-AI-1.5.3 With nothing ready, the result is "resting until <earliest>".
    - [ ] U-AI-1.5.4 A timeout doesn't rest the key.
    - [ ] U-AI-1.5.5 A provider over its cap is skipped until tomorrow (Asia/Dhaka).
    - [ ] U-AI-1.5.6 An error text holding the key is cleaned.
    - [ ] I-AI-1.5.1 Usage rows add up across 3 fake answers.
  - **Acceptance:** switching the active provider in Settings changes who answers, with no code
    change.

- [ ] **AI-1.6 Model check (Test)**
  - **Docs:** AI.md §5.
  - [ ] AI-1.6.1 Fake books plus the six checks of §5. Saves `check_score` and `checked_at`.
    Changing the model id clears them.
  - **Tests:**
    - [ ] U-AI-1.6.1 Scripted fake replies score 6/6, 5/6 (a digit in the text) and 4/6 (no
      Bangla, guessed name).
    - [ ] U-AI-1.6.2 A model below 6/6 is never routed to.
  - **Acceptance:** Test uses no real business data.

- [ ] **AI-1.7 Fake provider**
  - **Docs:** AI.md §8 Tests.
  - [ ] AI-1.7.1 With `AI_FAKE=1`, a scripted provider returns tool calls and placeholder text.
    It is refused when `NODE_ENV=production`.
  - [ ] AI-1.7.2 A manual script `scripts/ai-smoke.ts` (the user runs it with their own key)
    asks one question per provider.
  - **Tests:**
    - [ ] U-AI-1.7.1 The fake provider is refused in production mode.
    - [ ] M-AI-1.7.1 👤 The smoke test passes on one Gemini key and one GLM key.

---

## Phase AI-2 — Ask the books

*At the end of this phase:* partners ask questions in English or Bangla, and every figure is a chip
identical to the screen.

- [ ] **AI-2.1 Facts, entity refs, renderer and guard**
  - **Docs:** AI.md §6.
  - [ ] AI-2.1.1 Placeholders `{{F#}}` / `{{E#}}` render as chips (label, `format()` value,
    context, link).
  - [ ] AI-2.1.2 The guard rejects any digit (0–9, ০–৯) outside a placeholder and any unknown
    placeholder. One retry, then a plain fact-list fallback.
  - **Tests:**
    - [ ] U-AI-2.1.1 It rejects "৳97,500", "৯৭", "Redmi 13" and "1. Check…".
    - [ ] U-AI-2.1.2 It accepts "{{F3}}" and "{{E2}}".
    - [ ] U-AI-2.1.3 A chip's text equals `format()` of the fact's value, with its label and
      context.
    - [ ] U-AI-2.1.4 Two failed tries show the fact list.

- [ ] **AI-2.2 Read-only tools**
  - **Docs:** AI.md §7.
  - [ ] AI-2.2.1 The tools `find`, `books_summary`, `customer_statement`, `card_bills`, `stock`,
    `sales`, `cash_book` and `journal_search`. They are pure functions over `aiRead()` data, and
    each fact comes from its linked screen's view-model.
  - [ ] AI-2.2.2 Excluded from every output: contacts, saved bank accounts, card secrets,
    passkeys, AI keys (including their audit rows).
  - [ ] AI-2.2.3 Periods are resolved in Asia/Dhaka (`dates.ts`). Ambiguous names return choices
    and are never guessed.
  - **Tests:**
    - [ ] U-AI-2.2.1 A tie-out per tool: facts equal the linked screen's loader output on a fixed
      set of books.
    - [ ] I-AI-2.2.1 Run every tool on local Supabase. Afterwards all row counts and `audit_log`
      are unchanged.
    - [ ] I-AI-2.2.2 No phone, WhatsApp, email or account number appears in any tool output
      (seeded with known values).
    - [ ] U-AI-2.2.2 "Rahman" with two matches returns two choices.

- [ ] **AI-2.3 More → Ask screen**
  - **Docs:** AI.md §10. UIDD §3 pointer.
  - **D-062 (CR-037):** desktop has no More, so Ask is also its own desktop sidebar link (with an
    icon); the kill switch hides it there too.
  - [ ] AI-2.3.1 A question box, 4 starter chips, answers with chips and an "as of" time, the
    "Answered by …" line, "Thinking…", ambiguity chips, follow-ups kept on the page only.
  - [ ] AI-2.3.2 The kill switch hides Ask. "Resting until …" shows when nothing is ready.
  - **Tests:**
    - [ ] E-AI-2.3.1 (fake provider) Ask "How much do customers owe?". The chip text equals the
      Home tile text, and the chip opens `/customers` (360 + 1280).
    - [ ] E-AI-2.3.2 Ambiguity chips show up for "Rahman".
    - [ ] E-AI-2.3.3 With the kill switch off, Ask is not in More (360) or the sidebar (1280).
    - [ ] M-AI-2.3.1 👤 Ask in English and in Bangla on a real Gemini key (a local run).

---

## Phase AI-3 — Understand reports

- [ ] **AI-3.1 `month_compare`**
  - **Docs:** AI.md §7, §9.
  - [ ] AI-3.1.1 For a closed month: the month vs the previous month, using the Monthly pack's
    figures. For the open month: the same days (1–N vs 1–N) as the main comparison, plus the
    previous month in full.
  - [ ] AI-3.1.2 Profit components, sales by model (margin %), fees and expenses. Deltas come from
    `money.ts`.
  - **Tests:**
    - [ ] U-AI-3.1.1 The same-days period maths, including a 31-day month vs a 30-day month and
      February.
    - [ ] U-AI-3.1.2 The facts equal the Monthly pack's "P&L vs last month".
- [ ] **AI-3.2 Explain on the Monthly pack and Sales report** (an item in the existing Report
  sheet)
  - **Tests:** [ ] E-AI-3.2.1 Explain opens Ask pre-filled, and its chips equal the pack's
    figures.
- [ ] **AI-3.3 Explain an entry and a card bill** (Journal entry ⋯, card bill ⋯)
  - [ ] What the entry posted, which bill it lands on, and its edit history from `audit_log`.
  - **Tests:** [ ] U-AI-3.3.1 A cash-out lands on the right bill.
    [ ] E-AI-3.3.1 Explain from a Journal entry.

---

## Phase AI-4 — Catch mistakes

- [ ] **AI-4.1 Pre-close rules** (plain TS, in `src/server/ai/review.ts`)
  - [ ] A sale below its lot cost · a cash-out fee % far from that card's usual rate · similar
    entries by both partners · a missing customer profit share · the first negative cash date ·
    a card on "Check dates".
  - **Tests:** [ ] U-AI-4.1.1 One fixture per rule (hit + no hit).
- [ ] **AI-4.2 Cash-count difference**
  - [ ] An entry equal to the difference · a difference divisible by 9 (swapped digits) · half the
    difference (wrong direction).
  - **Tests:** [ ] U-AI-4.2.1 Each pattern is found. A random difference finds nothing.
- [ ] **AI-4.3 Review on the Close screen** (an item in its ⋯)
  - **Tests:** [ ] E-AI-4.3.1 The review lists the seeded problems as chips that link to each
    entry.

---

## Phase AI-5 — Card statement check

- [ ] **AI-5.1 PDF upload, password and extraction**
  - [ ] A PDF upload (size-capped), and a password box when the PDF is locked (never stored).
    Routing uses a model with `pdf`. The rows are extracted as "Bank PDF says".
  - [ ] The extracted rows must add up to the statement total, or the reading is rejected.
  - **Tests:** [ ] U-AI-5.1.1 The total check rejects a reading that doesn't add up.
    [ ] I-AI-5.1.1 Nothing from the PDF is stored.
- [ ] **AI-5.2 Compare with the app's bill** (in code, via `cardSummaries`)
  - **Tests:** [ ] U-AI-5.2.1 A missing fee, cashback and payment are each found.
- [ ] **AI-5.3 Draft fixes**
  - [ ] Each difference opens the normal form pre-filled (card fee, cashback, payment). The
    partner saves.
  - **Tests:** [ ] E-AI-5.3.1 A draft opens the form. Nothing is saved until Save.

---

## Phase AI-6 — Later (to be decided)

- [ ] Quick entry (text or voice → a pre-filled form)
- [ ] "What changed this week" (`audit_log`)
- [ ] Investor and month-summary drafts (customer text never shows cost or profit)
- [ ] Setup hygiene (duplicate-looking names, unused models, missing WhatsApp numbers)
- [ ] "How do I record…?" help (from SRS §5)

---

## 👤 Still needed from the user (AI track)

- [ ] Create the Gemini API key(s). Use keys from different Google Cloud projects if you want
  separate limits.
- [ ] Optional: a GLM (Z.ai) or other provider key for the AI-1.7 smoke test.
- [ ] At deploy time: set `AI_ADMIN_EMAIL` on the VPS, and approve the production migration.
- [ ] Decide the deploy cadence (Now).
