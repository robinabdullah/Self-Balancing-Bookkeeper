# Self-Balancing Bookkeeper — Tasks (v1.1)

*Task breakdown · 10 October 2026* — implements `docs/PRD.md`, `docs/SRS.md`, `docs/UIDD.md`.
Decisions: `docs/DECISIONS.md`. **v1 (phases 0–7, CR-001…CR-014) is archived in
`docs/TASKS-v1.md`**; read it only when a D entry or a test id cites an old task.

## Now
- **Live:** v1.1 (CR-015 … CR-029), deployed 2026-10-12.
- **On `dev`, for the next deploy:** CR-030 (then check the card PDF in production), CR-031 …
  CR-046, D-065 … D-067.
- **Next:** no app task left to build. 👤 the second partner's fingerprint (closes CR-026); the
  Ops backup; the deploy (then check the card PDF in production, CR-030); go-live checks 7.2–7.5.
- **Blocked on:** —

## How to use

- `[ ]` = to do, `[x]` = done. A task is ticked only when all its subtasks, tests and acceptance
  criteria are done.
- **IDs:** tasks are `CR-NNN`, subtasks `CR-NNN.S`. Tests = `U` unit · `I` integration · `E`
  end-to-end · `M` manual, plus the id (e.g. `U-CR-015.1`).
- Each task cites its doc sections and D entry. In normal flow, read only those. When something
  looks off, read the full related docs and code (D-019).
- **Now** is at most 5 bullets: what's live, what's on `dev` for the next deploy, what's next and
  what blocks. `/next-task` updates it at the end of each task; results and test counts go in the
  task, not in Now. At each deploy "On `dev`" moves into "Live" (D-066).
- Finished v1.1 tasks are in `docs/TASKS-v1.1-done.md`, with the old Now log.
- **Live:** `https://business.example.com` (partners' VPS). Releases: `git pull && bash
  scripts/deploy.sh` in `~/Mobile-Business-Lite` (deploy/README.md).
- **Production DB:** see CLAUDE.md (Non-negotiables). The opening is imported (2026-10-09) and is
  never re-imported.
- 👤 = a step only the user can do (accounts, passwords, real data, hosting choice).
- Run a task with `/next-task [id]`. Record feedback or a change with `/change-request <text>`.

## Workflow (docs are the source of truth)

1. **Docs before code.** If the code needs to differ from PRD/SRS/UIDD, the docs change first.
2. **Feedback or a scope change** → a new **CR task** at the bottom of this file. If it changes a
   rule, add a **D entry** in `DECISIONS.md` first, then the docs, then the code.
3. **Misalignment** (the docs conflict, are ambiguous, or don't match reality) → **stop and tell
   the user**. Don't guess. The resolution is logged as a D entry, with Source = misalignment.
4. Anything beyond PRD §4 needs the user's explicit OK.
5. **Spec:** `docs/v1.1-plan.md` holds the approved details of the v1.1 CRs (the user's decisions,
   the UI rules, edge cases, WhatsApp samples). Read the CR's section there before starting it.
   Ask the user rather than assume (they answer multi-choice questions).

## Principles

- **KISS:**
  - plain functions, server components and server actions;
  - no state library, no caching, no repository/service layers, no generic form builder (beyond
    the one money-entry form the UIDD specifies).
- **DRY:**
  - one source per rule: `money.ts`, `dates.ts`, `postEntry`, `help-text.ts`, and the action
    helper;
  - extract a shared piece only at the **3rd** repetition.
- **YAGNI:** nothing beyond PRD §4 without the user's OK.
- **Small files:**
  - aim for ≤ 500 lines, hard cap 1000 (ESLint `max-lines`);
  - generated files are exempt;
  - split by responsibility.
- **No calculation changes in v1.1:** `src/lib/engine/**` is not edited; every new figure is read
  from the books and has a tie-out test against an existing total. (Exception approved by the user:
  CR-034 changes `engine/cards.ts`, D-058.)
- **A simple UI (D-034):**
  1. Nothing new is always visible on a page, except the 2 main buttons + ⋯ on detail pages and one
     ⤴ Share icon in the title row of report pages (Journal, Months, Cash book, Sales). Home gets
     nothing new.
  2. Occasional things live in sheets (⋯ More, the Report sheet, the send preview, bank accounts,
     card details): one place to open them, Back closes them, the same look everywhere.
  3. Optional parts start closed ("How to pay" off; "Count cash" a link; the period chip only while
     a period is set).
  4. Short forms: a field appears only when it's needed; long settings are split into sections.
  5. One way to do each thing: reports through the Report sheet, messages through the preview.
  6. A feature that would clutter a page is redesigned before it is built.

## Definition of Done (every task)

- [ ] The task's listed tests are written and green.
- [ ] Engine and integration scenarios assert the **books-balance invariant**.
- [ ] `npm run typecheck` and `npm run lint` are clean (incl. `max-lines`).
- [ ] Every form has its About text in `src/lib/help-text.ts` (UIDD §3).
- [ ] The docs still match the code. If not, a D entry is written and the docs are updated first.
- [ ] Real workbook data never appears in logs, test output or fixtures committed outside
  `docs/source` (D-014). Card secrets never appear in logs, test output, audit rows or exports.
- [ ] `git diff --stat src/lib/engine` is empty.
- [ ] The local test gate (D-065, `/next-task` step 5) is green.
- [ ] UI tasks: no horizontal scroll at 360 px, tap targets ≥ 44 px, axe clean (Night Owl locally;
  every theme on CI, D-065), and 360 px + 1280 px screenshots of each touched screen shown to the user before ticking.

---

## Open from v1 (go-live acceptance, PRD §8, SRS §14)

- [ ] **7.2** M7.2.1 SRS §14 manual pass on a phone as each partner: purchase → sale → return →
  payment → card payment → cash-out → expense → close month → profit paid. The dashboard stays ✓
  and the views match the export.
- [ ] **7.3** M7.3.1 Card dues and dates match the bank statements (and the investor's workbook for his
  cards).
- [ ] **7.4** M7.4.1 The first real month is closed and its allocations paid/reinvested in the
  app.
- [ ] **7.5** M7.5.1 The partners stop using Excel for daily entry; a weekly export habit is
  agreed.

---

## Change requests (v1.1, in build order)

New feedback or scope changes go here **before** any code. Copy the template:

```
- [ ] **CR-NNN Title** (YYYY-MM-DD)
  - **Source:** user feedback | misalignment in <task>
  - **Decision:** D-NNN (only if a rule changed) · **Docs:** PRD/SRS/UIDD §…
  - [ ] subtasks…
  - **Tests:** [ ] U/I/E…
  - **Acceptance:** …
```

- [ ] **Ops — nightly off-site backup** (no app change; can run any time, best first; spec:
  `docs/v1.1-plan.md` → Ops)
  - [ ] 👤 A VPS cron runs `pg_dump` nightly (30 days kept) plus a weekly copy off the VPS (Google
    Drive via rclone, or email). Steps in `deploy/README.md`.

- [ ] **CR-026 Card details behind a fingerprint (last)** (2026-10-10)
  - **Source:** user feedback · **Decision:** D-046 (records the accepted CVV risk) · **Docs:** SRS
    §4, §11, §12; UIDD §3, §4.8, §4.11, §4.13, §4.14; `deploy/README.md`
  - **Spec:** `docs/v1.1-plan.md` → CR-026. The user chose to store the CVV too (the risk goes in
    the D entry); the password fallback uses a session-less Supabase client, rate-limited; reveal
    responses are `no-store`; `REVEAL_SECONDS = 30`, one card at a time; no WhatsApp share of card
    data.
  - **The user's choices (2026-10-12):**
    - Edit/Remove only while revealed (the server checks for a reveal in the last 10 min); Add
      needs no unlock.
    - Fingerprint set-up asks for the password first.
    - Saved details has two tabs, **Bank accounts · Cards**, and the Cards tab lists only cards
      with details.
    - A wrong password locks it after 5 tries, for 15 min.
  - [x] CR-026.1 Encrypted `card_secrets` (AES-256-GCM, `CARD_SECRET_KEY`, card id as AAD);
    validation (Luhn, MM/YY, CVV); masked view; save/remove actions audited without values.
  - [x] CR-026.2 Passkeys (WebAuthn) + password fallback (5 tries / 15 min); reveal route
    (`no-store`) for 30 s (`REVEAL_SECONDS`); audit without values.
  - [x] CR-026.3 UI:
    - the card's ⋯ → Manage → Card details (`?secret=1`);
    - the Saved details tabs + the Cards tab;
    - Settings → Fingerprint unlock;
    - Setup's card delete confirm.
  - [x] CR-026.4 `deploy/README.md`: generate `CARD_SECRET_KEY` and back it up.
  - [x] 👤 `CARD_SECRET_KEY` on the VPS and in a password manager (v1.1 deploy, 2026-10-12).
  - [ ] 👤 Fingerprint set-up on each partner's phone: 1 device so far (2026-10-12); then the card
    details typed in the app.
    *(CR-031 / D-054: a card can now hold its supplementary numbers too, and one fingerprint
    reveals any number for 30 s.)*
  - **Tests:**
    - [x] U-CR-026.1 crypto round trip, plus a wrong key, a tampered value, another card and a
      missing key, each failing;
    - [x] U-CR-026.2 validation, mask, Copy all text, device name;
    - [x] I-CR-026.1 save/edit/remove: ciphertext only, audit without values, the edit gate;
    - [x] I-CR-026.2 reveal: refused without a valid, fresh, unused challenge of your own or the
      password; the lockout; `no-store`; a `reveal` audit row without values;
    - [x] I-CR-026.3 passkey set-up needs the password; removing a passkey is audited;
    - [x] I-CR-026.4 the export has no secrets; a card delete removes its details;
    - [x] E-CR-026.1–.3 virtual authenticator: set-up, reveal → 30 s → masked, one at a time,
      password fallback, edit (360 + 1280);
    - [x] a11y in 3 themes.
  - **Local result (2026-10-12):**
    - typecheck + lint clean; unit 601/601; integration 128/128.
    - Full E2E: 232 passed, 11 skipped, 4 failed. The 4 were in `quick-actions.spec` (E-CR-013.4,
      E-CR-018.1 at 360 + 1280); they still expected the card's old ⋯ list and are updated for
      "Card details". Rerun: `quick-actions` 13/13.
    - `card-secrets.spec` with `--reporter=list`: each E-CR-026 id passed on 360 and 1280.
    - The CR-026 a11y test passed in 3 themes (6/6).
    - `git diff --stat src/lib/engine` is empty.
  - **Notes:**
    - `@simplewebauthn/server` 13.3.3 and `/browser` 13.3.0 are pinned. 14.x is three weeks old
      and was not used.
    - `.env.local` has no `CARD_SECRET_KEY` on purpose: it points at production, and the real
      key is made on the VPS (👤).
    - E2E uses a test-only key (`E2E_CARD_KEY`) and runs the WebAuthn spec on `localhost`.
    - `BankAccountsSheet` now uses a shared `OverlaySheet`.
  - [x] **Feedback (2026-10-12, D-051):** masked details show only `•••• •••• •••• 1234`.
    - Drop the `· ••/•• · •••` placeholders.
    - Remove the then-unused `hasExpiry` / `hasCvv` from `maskedLine` and `loadCardSecrets`.
    - Update U-CR-026.2 (the mask) and E-CR-026.2/.3 (the masked text). The revealed view is
      unchanged.
    - Retake the screenshots with a test number whose 4-digit groups differ (e.g.
      `5555 5555 5555 4444`), so the last 4 are visibly the last.
  - [x] **Feedback (2026-10-12, D-052):** reveal with the fingerprint only, never the password.
    - The reveal route refuses `{ password }`.
    - The UI drops the password box. No fingerprint → "Set up fingerprint unlock to see card
      details" + a Settings link; a failed fingerprint → "Fingerprint not accepted — try again".
    - The password and its lockout stay for set-up.
    - Tests: I-CR-026.1/.2/.3 (edit-gate reveals by fingerprint; a password reveal → 400; the
      lockout on set-up), E-CR-026.3 (the no-fingerprint notice, then set-up and reveal), a11y
      (the notice; the revealed view per theme on localhost).
  - **Feedback result (2026-10-12):**
    - typecheck + lint clean; unit 601/601; integration 129/129.
    - The full E2E run (`npx playwright test a11y quick-actions business` matched the whole
      suite): 242 passed, 11 skipped, 0 failed.
    - `card-secrets` + the CR-026 a11y tests with `--reporter=list`: 19/19. Each E-CR-026 id and
      each revealed-view axe scan (3 themes) passed on 360 and 1280.
    - `git diff --stat src/lib/engine` is empty.
    - Screenshots retaken with `5555 5555 5555 4444`.
  - **Screenshots approved by the user (2026-10-12).** CR-026 stays open only for its 👤 step
    (the key on the VPS + fingerprint set-up), done with the v1.1 deploy, like CR-016.

- [ ] **CR-030 Post-deploy fixes: card badge, toast, picker keyboard, card PDF** (2026-10-12)
  - **Source:** user feedback after the v1.1 deploy (phone) · **Decision:** D-053 · **Docs:** UIDD
    §1, §4.8, §5
  - [x] CR-030.1 `BankBadge` shows only the bank (no Type chip). The desktop Cards table shows
    `cardTitle(name, type)` ("EBL Visa"); `cardName()` reuses `cardTitle()`.
  - [x] CR-030.2 The toast sits above sheets and dialogs (`z-45` → above the sheet's `z-50`).
  - [x] CR-030.3 `PickerField`: on a touch device (`pointer: coarse`) the sheet opens with focus
    on itself, not on Search (no keyboard); a computer keeps Search focused.
  - [x] CR-030.4 `/pdf/card` 500 in production.
    - **Not reproduced locally:** 200 for all 23 cards and every statement/investor PDF under each
      of: Node 20.19.6 with the standalone `server.js`; the opening template imported and the
      cards renamed; `TZ=UTC`; a Linux build.
    - **The VPS log:** `EMAXCONNSESSION max clients reached in session mode - pool_size: 15`.
      Production connects through Supabase's session pooler, which allows 15 clients.
    - **Root cause:** Next loads `src/db/index.ts` once for the pages and again for the route
      handlers, and each copy opened its own postgres pool of 10. Measured locally: 11
      connections after the pages, **20** after one card PDF. Locally Postgres allows 100, so it
      never failed there.
    - **Fix:** one client on `globalThis` in production too (it was dev-only), so the server holds
      one pool of at most 10. `deploy/README.md` notes the 15-client budget.
  - **Tests:** [x] U `cardTitle` (Type added once; None adds nothing) and `cardName` unchanged ·
    [x] U/E badge has no Type chip · [x] E toast above an open report sheet when the PDF fails
    (route forced to 500) · [x] E picker at 360 (touch): Search not focused, first option in view;
    at 1280: Search focused · [x] E `/pdf/card`, `/pdf/pack`, `/pdf/investor`, `/pdf/sales` return
    a PDF through the built server (already covered: `account-reports.spec` shares the card and
    investor PDFs; `pdf.spec` the rest) · [x] U-CR-030.4 a second load of `src/db` reuses the
    first client (fails without the fix) · [x] the built server holds ≤ 10 connections after a
    page + a card PDF (measured).
  - **Acceptance:** the phone Cards list reads "[EBL] Shakil · EBL Visa"; a failed Share PDF shows
    its toast over the sheet; Payment In → Customer shows the list with no keyboard; the card PDF
    downloads in production; screenshots (360 + 1280) approved.
  - **Status (2026-10-12):** built on `dev`. Unit 603/603, integration 129/129, typecheck + lint
    clean; E2E 246 passed / 11 skipped; the 2 smoke failures come from the local DB's business
    short name "SMS" (set 2026-10-11, not by a test), not from CR-030. Built server: 10 connections
    after a page + card PDF + 3 packs at once (was 20). Screenshots approved (2026-10-12). Next:
    the deploy, then check the card PDF in production.

- [x] **CR-043 Charts · Customers tab + a customer's Due trend** (2026-10-22)
  - **Source:** user feedback (2026-10-22): a customer's due over time, "the due he keeps".
  - **Decision:** D-064 · **Docs:** UIDD §4.2, §4.8, §4.17 (Charts).
  - [x] CR-043.1 `src/lib/charts/customers.ts`:
    - `dueFlows(posted, kinds, walkIn, period)`: Given, Collected and Other by kind, by bucket;
    - `dueTrend(rows, from, to, today, payments)`: points + Now, Average, Lowest, Highest, Last
      paid;
    - `lowestDues(customers, walkIn, from, to, today)`.
  - [x] CR-043.2 Top customers from `salesReport().byCustomer`; `topCustomers` becomes `topGroups`
    (for models too; "Other" for the rest).
  - [x] CR-043.3 The three cards and detail pages; `/customers/[id]/trend`; ⋯ → Reports & share →
    Due trend (`nav.ts`, not Walk-in); Home's Customers owe tile → `?tab=customers`.
  - **Tests:**
    - [x] U-CR-043.1 per bucket Given − Collected + Other = the change in total dues, with one of
      every kind (sale, cash given, payment, return, discount, profit share added, purchase
      against due, refund, opening, Walk-in, a reversal).
    - [x] U-CR-043.2 `dueTrend`: a hand-worked Average (with a .5 tie and a credit day); Lowest and
      Highest use end-of-day dues; a reversed payment isn't Last paid.
    - [x] U-CR-043.3 `lowestDues` leaves out Walk-in and lowest ≤ 0, highest first.
    - [x] I-CR-043.1 total dues = `books.customerDues`; Given's sales + Walk-in's = the Sales
      report's sales for the window.
    - [x] E-CR-043.1 (360) customer ⋯ → Due trend shows the stats; a Customers owe row opens it;
      (1280) the same; Walk-in has no Due trend.
  - **Acceptance:** Now = the customer page's due; screenshots (360 + 1280) are approved.
  - **The user's answers (2026-10-24; UIDD §4.17, D-064):** Given = sales + cash given, Collected
    = payments, Other = the rest by kind (Walk-in's net is one kind; a reversal under its
    original's kind); Top customers includes Walk-in; Last paid = the latest payment ever.
  - **Status (2026-10-24):** built on `dev`; screenshots (360 + 1280) approved by the user.
    - typecheck + lint clean; unit 715/715 (new `chart-customers.test.ts`; `topCustomers` →
      `topGroups`; the ⋯ lists in `prefill.test.ts`); `charts.test.ts` integration 3/3.
    - E2E (Night Owl, 360 + 1280): `charts-customers` (each E-CR-043.1 passed on both, list
      reporter), `charts`, `home`, `quick-actions`; a11y `E-CR-043` 2/2.
    - `charts-money` fails locally only because the local books are empty (its window starts 3
      days back, so it draws by day); unchanged by CR-043, green on CI.
    - `HBars` names are cut to one line ("E2E Shop 7bd7…"; whole in the table and readout); the
      Due trend's Lowest / Average labels sit above their lines.
    - `git diff --stat src/lib/engine src/server/actions src/db` is empty.

- [x] **CR-044 Charts · Stock tab: stock age, top models** (2026-10-22)
  - **Source:** the user's picks (2026-10-22).
  - **Decision:** D-064 · **Docs:** UIDD §4.17 (Charts).
  - [x] CR-044.1 `src/lib/charts/stock.ts` `stockAge(lots, today)`: 0–30 · 31–60 · 61–90 · 90+ days
    by the lot's date; units left and value at cost; a bucket lists its models through
    `stockByModel`.
  - [x] CR-044.2 Top models from `salesReport().byModel` through `topGroups` (Pieces / Profit).
  - [x] CR-044.3 The two cards and detail pages; the opening-stock note.
  - **Tests:**
    - [x] U-CR-044.1 the 30/31, 60/61 and 90/91 day edges; Σ value = Σ lot values, a reversed
      lot included.
    - [x] I-CR-044.1 Σ stock age value = `books.stock`.
    - [x] E-CR-044.1 (360 + 1280) tapping a bucket lists its models; axe in the 3 themes.
  - **Acceptance:** stock age total = the Stock page's value; screenshots (360 + 1280) are
    approved.
  - **The user's answers (2026-10-24; UIDD §4.17, D-064):** Stock age ignores the period row
    (today's stock, "as of today" on the card); the detail's table of the 4 ages links each row
    (`?age=`) to its models below, with All ages to clear.
  - **Status (2026-10-24):** built on `dev`; screenshots (360 + 1280) approved by the user.
    - typecheck + lint clean; unit 718/718 (new `chart-stock.test.ts`; `topGroups` takes
      `pieces`); `charts.test.ts` integration 4/4.
    - E2E (Night Owl, 360 + 1280): `charts-stock` (E-CR-044.1 passed on both, list reporter),
      `charts`, `charts-customers`; a11y `E-CR-044` 6/6 (3 themes × 2 sizes).
    - The Stock age bars use short axis labels ("31–60"; the table says "31–60 days") so all four
      fit at 360. `ChartCard` takes a `note` ("as of today"). UIDD §4.17's Stock rows moved back
      into the Charts table.
    - `git diff --stat src/lib/engine src/server/actions src/db` is empty.

- [x] **CR-045 Card numbers on one card only; the card form formats as you type** (2026-10-24)
  - **Source:** user feedback after CR-031 (`docs/TASKS-v1.1-done.md`) + the user's answers
    (2026-10-24).
  - **Decision:** D-067 · **Docs:** SRS §4, §11; UIDD §4.14.
  - [x] CR-045.1 `saveCardDetails` guard: decrypt the other rows with the same `last4` and refuse
    a match on `number`, "This number is already saved on <Owner · Card Type>" (`cardName`);
    for Add and Edit (Edit skips its own row).
  - [x] CR-045.2 `autoSlash(prev, next, sizes = [2, 2, 4])` in `dates.ts`; Expiry uses `[2, 2]`.
  - [x] CR-045.3 `typedNumber` (digits grouped in fours, ≤ 19 digits, reuses `groupNumber`) and
    `expiredBefore(expiry, today)` in `src/lib/card-secrets.ts`.
  - [x] CR-045.4 The form: Card number and Expiry format as you type (Edit starts grouped); a past
    expiry shows the amber warning under Expiry and still saves.
  - **Tests:**
    - [x] U-CR-045.1 `autoSlash(…, [2, 2])`: "12" → "12/", "12/26" stops at 5, no "/" while
      deleting; the dd/mm/yyyy cases unchanged.
    - [x] U-CR-045.2 `typedNumber` groups, drops non-digits, caps at 19 digits.
    - [x] U-CR-045.3 `expiredBefore`: "09/26" on 2026-10-24 → true; "10/26" → false; empty/bad →
      false.
    - [x] I-CR-045.1 the same number on another card → refused, naming it; as a supplementary on
      the same card → refused; Edit keeping its own number → saved; another number with the same
      last 4 → saved; a supplementary with no primary and no holder → saved.
    - [x] E-CR-045.1 (360 + 1280) "1226" shows "12/26"; 16 digits show in fours; a duplicate shows
      the error naming the first card; a past expiry warns and saves.
  - **Acceptance:** no number can be saved on two cards; the phone keypad never needs a "/";
    screenshots (360 + 1280) of the form are approved.
  - **Status (2026-10-24):** built on `dev`; screenshots (360 + 1280) approved by the user.
    - typecheck + lint clean; unit 721/721; `card-secrets.test.ts` integration 10/10.
    - E2E (Night Owl, 360 + 1280): `card-secrets` 15/15 (E-CR-045.1 passed on both, list
      reporter; E-CR-026.3's Edit form now starts grouped); a11y "card details" passed.
    - The fields are in the new `src/components/cards/card-detail-fields.tsx`. On Edit and Add,
      the duplicate check runs after the one-primary check, so that error still shows first.
    - `git diff --stat src/lib/engine` is empty.

- [x] **CR-046 Business value: a Business assets column** (2026-10-27)
  - **Source:** user feedback (2026-10-27): the table should show how much money is working in
    the business; then "show it in the chart as well" (tooltip only, the user's pick).
  - **Decision:** D-064 (clarified 2026-10-27) · **Docs:** UIDD §4.17 (Charts).
  - [x] CR-046.1 Business value's detail table (and its phone list) adds **Business assets** =
    `Position.businessAssets` (Cash + Stock at cost + Customers owe) after Customers owe; the
    card and the other columns are unchanged.
  - [x] CR-046.2 The chart draws nothing new: the tooltip lists Business assets after Customers
    owe (`SignedStack`'s `total`, an undrawn line); the phone readout is "{bucket}: Business
    assets ৳… · Net worth ৳…".
  - **Tests:**
    - [x] U-CR-046.1 each position's `businessAssets` = cash + stock + customerDues, and
      businessAssets − card balances − supplier dues = net worth.
    - [x] E-CR-046.1 (360 + 1280) today's row Business assets = the Books balance's, after
      Customers owe; the readout (360) and the tooltip (1280, in the table's order) show it; no
      page scroll.
  - **Acceptance:** the column equals the Books balance's Business assets; screenshots
    (360 + 1280) are approved.
  - **Status (2026-10-27):** built on `dev`; screenshots (360 + 1280) approved by the user.
    - typecheck + lint clean; unit 722/722; `charts.test.ts` integration 4/4.
    - E2E (Night Owl, 360 + 1280): `charts-money` + `charts` 6/6 (E-CR-046.1 passed on both, list
      reporter); a11y `E-CR-042` 2/2.
    - E-CR-042.1 accepted only "month end": it relied on the other specs' older entries, and
      alone on a fresh DB the window is ≤ 62 days, drawn by day. It now accepts "month|day".
    - `git diff --stat src/lib/engine` is empty.

---

## 👤 Still needed from the user (v1.1)
- Ops: choose the off-VPS backup target (Google Drive via rclone, or email).
- CR-016: approve the card rename table (current name → name + type; "visa/master" names decided
  case by case).
- After CR-019: address, email, trade licence/TIN/BIN, invoice terms (Settings → Business); bank
  accounts (Saved details); WhatsApp numbers for customers, suppliers and people; the greetings.
- CR-026: `CARD_SECRET_KEY` on the VPS plus a copy in a password manager; fingerprint set-up on each
  partner's phone; the card details.
