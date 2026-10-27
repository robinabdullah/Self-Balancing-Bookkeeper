# Mobile Business Lite — Finished v1.1 tasks (archive)

The ticked v1.1 change requests, moved here word for word from `docs/TASKS.md` (D-066), in their
build order, followed by the old "Now" status log. Open tasks stay in `docs/TASKS.md`. Read a task
here only when a D entry or a test id cites it.

Test files were renamed by feature (D-066); the tasks below keep the old names. Old → new:
`cr035` → `personal-spend` · `cr036` → `entry-effects` · `cr038` → `stock` · `cr039` →
`books-balance` · `cr040` / `cr041` / `cr042` → `charts` / `charts-profit` / `charts-money` ·
`phase3` → `entry-flow` · `phase4` → `dashboard-totals` · `phase5` → `month-close` ·
`reports-cr025` → `account-reports` (e2e and integration) · `cr025-fixture` → `report-fixture` ·
`cr030` / `cr033` → split into `cards-tab`, `pdf`, `money` and `reports`.

## Finished change requests

- [x] **CR-015 Feedback fixes: Back closes sheets, Journal alignment, bank badges, dd/mm/yyyy,
  month dropdown** (2026-10-10)
  - **Source:** user feedback · **Decision:** D-035 · **Docs:** UIDD §1, §2, §4.8, §4.10
  - **Spec:** `docs/v1.1-plan.md` → CR-015. Watch: the hidden date value must call `FormChanged`
    (else the preview / EMI preview won't refresh); keep `min`/`max` (bill dates; the due date has
    no max); the 📅 is the transparent native input over the icon (iPhone); Journal From/To change
    the URL only on a full valid date; month options follow the `dateErrors` rules (opening month →
    the date's month), newest first, always include the current/stored value, closed months greyed;
    Bill month = Auto + purchase month −1…+4 with an amber note on −1; Meghna short "MBL"; one Back
    closes only the top sheet (picker → "+ Add new" stacks); links in a sheet use `replace`.
    Colours: Meghna `#62259a`, Bank Asia `#1f5fb0`, LankaBangla split `#0b8a45, #0b8a45, #f7941d`.
  - [x] CR-015.1 `useBackClose`: every non-page sheet/dialog pushes a same-URL history entry; Back
    closes only the top one (a stack); links inside a sheet navigate with `replace`.
  - [x] CR-015.2 Journal desktop filters: `items-start`, so the Who hint doesn't lift its label.
  - [x] CR-015.3 Bank badges: Meghna (purple), Bank Asia (logo blue), LankaBangla (green + orange).
  - [x] CR-015.4 `DateField` in dd/mm/yyyy (text + 📅 native picker overlay + hidden ISO value);
    Journal From/To and the bill-dates fields use it.
  - [x] CR-015.5 `MonthSelect` ("Oct 2026" dropdown) for For month, Bill month and the reverse
    dialog; closed months greyed "(closed)".
  - **Tests:** [x] U `parseDmy`/`formatDmy`, `monthChoices` vs the guards, banks · [x] E Back on
    New/More/picker/Setup form/Journal filters (mobile), no phantom history entry; Who alignment;
    `fillDate` helper in every spec.
  - **Acceptance:** typecheck, lint, unit, integration and the full E2E run are green.
  - **Result (2026-10-10):** typecheck + lint clean; unit 449/449; integration 87/87; E2E 119 passed,
    11 skipped (phone-only / desktop-only), 0 failed; `git diff --stat src/lib/engine` empty.
    New: `src/components/ui/use-back-close.tsx` (wired into `Sheet`; `history={false}` for the
    entry sheet and page modals), `src/components/forms/date-fields.tsx` (`DateInput`, `DateField`,
    `MonthSelect`), `src/lib/month-choices.ts`, `tests/e2e/back-close.spec.ts`. Money pages pass
    `loadCalendar()` to the form. The user approved the 360/1280 screenshots (2026-10-10).

- [x] **CR-016 All v1.1 schema changes (one migration) + card type** (2026-10-10)
  - **Source:** user feedback · **Decision:** D-036 · **Docs:** SRS §4, §8, §10; UIDD §3, §4.8, §4.11
  - **Spec:** `docs/v1.1-plan.md` → CR-016. Watch: drop the old unique (owner, name) before adding
    (owner, name, network); `reverse.ts` → `content()` must drop `invoiceNo`/`receiptNo`; numbers
    are assigned in code (not a column default; reversals get none; gaps allowed, never reused);
    the export `TABLES` gets `business_profile` (no logo column: Excel's 32,767-character cell
    limit) and `bank_accounts`, never `card_secrets`/`passkeys`; the Setup delete guard ignores bank
    accounts / card secrets and deletes them with the owner ("Also deletes N saved …"); the card
    rename is a script (the card-rename script, dry run first) audited as the approving partner,
    because `audit_log.user_id` is required; the badge falls back to the name while Type = None;
    contacts: people get phone/WhatsApp/email, customers + WhatsApp, suppliers + WhatsApp and
    email, the business + WhatsApp; `audit_action` gains `reveal`.
  - [x] CR-016.1 Migration: `cards.network` + unique (owner, name, network); `profiles.theme`;
    `business_profile` (seeded); `bank_accounts`; `sales.invoice_no` / `money_entries.receipt_no` +
    sequences (backfilled); contact columns (phone / WhatsApp / email); `audit_action` + `reveal`;
    `card_secrets`, `passkeys` (+ `passkey_challenges`, one-time WebAuthn challenges, D-036).
  - [x] CR-016.2 Numbers assigned at save (sale, customer payment incl. Received now; never
    reversals); `reverse.ts` drops them when copying.
  - [x] CR-016.3 Export: add `business_profile` (no logo) and `bank_accounts`; never the secrets.
  - [x] CR-016.4 Setup delete guard ignores bank accounts / card secrets and deletes them with the
    owner.
  - [x] CR-016.5 Card type in Setup (Visa · Mastercard · Amex · None); `cardName` adds the type;
    the badge reads the column (falls back to the name while None).
  - [x] CR-016.6 👤 Approve the rename table; the card-rename script (dry run, then audited run).
    The table is approved (2026-10-10): a rename-plan JSON, 23 cards (Bank Asia
    and Meghna → Visa, both Lanka Bangla → Mastercard). Run on production after the deploy:
    the script with the plan JSON and `--as <partner email> --dry-run`, then again without `--dry-run`.
    - **Done on production (2026-10-12):** the dry run matched the approved table (23 cards), then
      the real run wrote 23 audit rows in Arif's name.
  - **Tests:** [x] I numbers sequential/unique under concurrency, reversal none, Undo gap · [x] I
    export has no secret tables · [x] I delete with saved details · [x] U card display + badge ·
    [x] I migration on the 0000–0002 schema (backfill, sequences, seed, new unique, `--list` before
    it) · [x] I rename script (dry run, audited run, clash) · [x] E card Type chips + name note ·
    [x] E axe on the card form (light/dark) · [x] full E2E run.
  - **Acceptance:** the migration applies on local, then production; every existing test green.
  - **Progress (2026-10-10):** migrations `0003_v1_1_schema` (hand-added backfill + `setval`) and
    `0004_seed_business_profile` (logo 256 px, 29 KB PNG); `src/server/numbers.ts` (`nextval` in
    the insert); saved details use `on delete cascade`, which `used()` skips; `passkeys.transports`
    is jsonb (no Postgres arrays: `fetch_types: false`); `truncateAll` keeps `business_profile`.
    The rename script and its helper module (later removed from this repo). `git diff --stat src/lib/engine` empty.
  - **Local result (2026-10-10):** typecheck + lint clean; unit 455/455; integration 98/98; E2E
    125 passed, 11 skipped (phone-only / desktop-only), 0 failed (run in three batches). Still to do
    at the deploy: the migration on production and CR-016.6.

- [x] **CR-017 Settings page, More regroup, themes (Light · Dark · Night Owl)** (2026-10-10)
  - **Source:** user feedback + misalignment (no cookie) · **Decision:** D-037 · **Docs:** SRS
    §12; UIDD §2, §3, §4.13, §6
  - **Spec:** `docs/v1.1-plan.md` → CR-017. Themes Light · Dark (today's) · Night Owl (default),
    stored on the profile; the root layout reads it on every full page load (no cookie: a layout
    can't write one; D-037). Export stays in More (where Reports will go) until CR-023.
  - [x] CR-017.1 `/settings`: Theme, Form help (moved from More).
  - [x] CR-017.2 More: Months · Journal · Export (→ Reports) · (Saved details) · Setup · Settings ·
    Closing · Sign out; the sidebar matches.
  - [x] CR-017.3 Themes by `data-theme`; Night Owl tokens; per-user (profile), read by the root
    layout on every page load; default Night Owl.
  - **Tests:** [x] U-CR-017.2 More order · [x] I-CR-017.1 theme saved + audited, own profile only
    · [x] E-CR-017.1 theme applies + persists; login is Night Owl · [x] E-CR-017.2 More sheet +
    sidebar · [x] E-CR-017.3 a change on another device (Settings shows it; a stale tap is undone)
    · [x] E-CR-013.2 axe in all 3 themes + the login page · [x] E1.6.2 Form help persists (on
    Settings).
  - **Files:** `src/app/(app)/settings/page.tsx`, `src/components/settings/theme-setting.tsx`,
    `src/server/actions/settings.ts`, `src/lib/themes.ts`, `getProfile()` in `src/server/auth.ts`,
    root layout `data-theme`, `globals.css` (`[data-theme]` tokens), `nav.ts` / `nav-sheets.tsx`.
    Night Owl's red is `#ff6b6b` and muted text `#a2b4c9` (the palette's `#ef5350` is 4.27:1 on
    cards). The journal sheet's Delete uses red-300 in the dark themes (4.44:1 in Night Owl before).
  - **Local result (2026-10-10):** typecheck + lint clean; unit 457/457; integration 101/101; E2E
    135 passed, 11 skipped (phone-only / desktop-only), 0 failed (4 desktop tests timed out late in
    the full run and passed on a rerun). `git diff --stat src/lib/engine` empty. The user reviewed
    the screenshots and asked to tick it (2026-10-10).
  - **Review fixes (2026-10-10):** one theme save at a time (a quick second tap was refused as a
    conflict); a stale tap says "Your theme was changed on another device — reload the page";
    Settings applies the saved theme when reached without a full load; axe on the login page;
    SRS §12 lists `/settings`. E-CR-017.1–3 and the login axe test green on both viewports
    (a later full E2E run overlapped CR-018's in-progress edits in the same folder).

- [x] **CR-018 Detail-page actions: 2 main + ⋯ More** (2026-10-10)
  - **Source:** user feedback · **Decision:** D-038 · **Docs:** UIDD §4.8
  - **Spec:** `docs/v1.1-plan.md` → CR-018. Main buttons: Card = Pay card + Cash-out; Customer =
    Payment in + Sale; Supplier = Supplier payment + Purchase; Person = Capital in/out + Profit
    paid/reinvested. ⋯ is the same centred sheet on desktop. Walk-in: Sale + ⋯ (Journal; the
    sales report joins in CR-023). Inactive: ⋯ only. **The Report sheet (was CR-018.2) moved to
    CR-020** (user, 2026-10-10; D-038).
  - [x] CR-018.1 `quickActions` → primary 2 + grouped ⋯ (New entry / Reports & share / Manage).
  - **Tests:** [x] U-CR-018.1 `quickActions` groups · [x] E-CR-018.1 exactly 2 buttons + ⋯ (Walk-in
    1, inactive 0); every old action reachable in ⋯ with the same link; Back closes ⋯ · [x]
    E-CR-013.2 axe on the open ⋯ in all 3 themes.
  - **Files:** `nav.ts` (`quickActions` → `{ primary, more }`), `nav-sheets.tsx` (`SheetLinks`
    exported; ⋯ reuses `NavSheet`), `quick-actions.tsx`; tests `prefill.test.ts`,
    `quick-actions.spec.ts`, `journal.spec.ts`, `a11y.spec.ts`.
  - **Local result (2026-10-10):** typecheck + lint clean; unit 457/457; integration 101/101; E2E
    148 passed, 11 skipped, 1 failed: `shell.spec:69` (desktop) times out late in the full run when
    the More sheet's Journal link doesn't navigate. It passes on its own, and CR-018 doesn't touch
    that sheet (the same flake CR-017 saw). `git diff --stat src/lib/engine` empty. The user
    approved the 360/1280 screenshots (2026-10-10).
  - **Open flake (2026-10-10):** `shell.spec:69` got `test.slow()`, but a later full run still failed
    it on desktop, this time at a 5 s step: New → Card payment left the URL on `/people`. Both
    failures are a link inside a bottom-bar sheet that hasn't navigated in time, late in a long
    run. It is still open whether that is a slow `next dev` or a real sheet-history bug (D-035). Not
    CR-018 code. → **CR-027**.

- [x] **CR-019 Business profile, message templates, contacts, bank accounts** (2026-10-10)
  - **Source:** user feedback · **Decision:** D-039 · **Docs:** SRS §4, §12; UIDD §3, §4.1, §4.8,
    §4.11, §4.13, §4.14 (new)
  - **User answers (2026-10-10):** 8 message types (Sale, Payment in, Return, Discount, Profit
    share, Due reminder, Statement, Investor report) each with Greeting + Sign-off and defaults in
    code; Share = the phone's share sheet (WhatsApp Web on a computer); Saved details adds for any
    owner (owner picker, the business by default).
  - **Spec:** `docs/v1.1-plan.md` → CR-019. The logo is served from `/logo` (cached); the audit says
    "logo changed" (never the image); bank accounts open from ⋯ → Manage and More → Saved details;
    copy a field / copy all / share; no "print on invoices" tick (How to pay is a switch, off by
    default, business accounts as chips, picked automatically when there is only one).
  - [x] CR-019.1 Settings → Business (Details · Logo · Messages); `/logo` route; name in top bar,
    title, login, export file name.
  - [x] CR-019.2 Contacts (Phone · WhatsApp · Email) on people, customers, suppliers in Setup.
  - [x] CR-019.3 Bank accounts: ⋯ → Manage → Bank accounts; More → Saved details; copy field /
    copy all / share. Setup's delete confirm names them ("Also deletes 2 saved bank accounts"; the
    cascade itself shipped in CR-016.4).
  - **Tests:** [x] U-CR-019.1 templates, app name, export file name · [x] U-CR-019.2 bank text +
    validation · [x] U-CR-019.3 ⋯ Manage → Bank accounts (person/customer/supplier only) ·
    [x] I-CR-019.1 details saved + audited, stale → conflict · [x] I-CR-019.2 logo saved, audit
    says "changed" (no image anywhere in the audit) · [x] I-CR-019.3 template merge ·
    [x] I-CR-019.4 bank accounts add/edit/delete per owner kind, audited, bad routing refused ·
    [x] I-CR-019.5 owner delete takes its accounts (not "used"; listed in the audit) ·
    [x] I-CR-019.6 contacts saved in Setup · [x] E-CR-019.1 Details → top bar + title; logo →
    `/logo` + login page · [x] E-CR-019.2 Messages saved · [x] E-CR-019.3 Saved details add, copy
    field, Copy all, Share · [x] E-CR-019.4 owner ⋯ → Bank accounts sheet, add, Back closes ·
    [x] E-CR-019.5 Setup contacts + delete confirm names the accounts · [x] E-CR-013.2 axe on
    Settings Business sheets and Saved details in all 3 themes.
  - **Files:** `src/lib/business.ts`, `src/lib/validation/business.ts`, `src/server/business.ts`,
    `src/server/actions/business.ts`, `src/app/logo/route.ts`, `src/app/(app)/saved/page.tsx`,
    `src/components/bank/*`, `src/components/settings/{business-settings,logo-form}.tsx`,
    `src/components/shell/business-logo.tsx`; Setup contacts and delete confirm; the name in the
    layouts, top bar, login and export; tests `business.test.ts`, `business-actions.test.ts`,
    `business.spec.ts` (+ `a11y`, `prefill`, `settings`, `quick-actions`, `shell`, `smoke`,
    `export` updated for the new links and name).
  - **Local result (2026-10-10):** typecheck + lint clean; unit 469/469; integration 107/107;
    `business.spec` 10/10 on both viewports. Full E2E: 157 passed, 11 skipped, 8 failed, all
    timeouts late in the 31-min run (`page.goto` / `waitForLoadState`) plus the known
    `shell.spec:69` flake; each of those specs passes when run on its own (a11y, quick-actions,
    settings 44/44; shell + phase3 17/17; card-page 3/3). Found and fixed during testing: at 360px
    a `<fieldset>` (min-content wide) and Setup's row details made the page wider than the screen;
    the bank card's `<dl>` failed axe. `git diff --stat src/lib/engine` empty.

- [x] **CR-020 Statements by period, WhatsApp messages, reminders** (2026-10-10)
  - **Source:** user feedback · **Decision:** D-040 · **Docs:** UIDD §4.8, §4.10, §4.15 (new), §5
  - **Spec:** `docs/v1.1-plan.md` → CR-020 and "WhatsApp messages in detail" (style: sectioned +
    emoji; time "10 Oct 2026, 3:45 PM" in Dhaka, the saved time; back-dated → the date only).
    Watch: a sale and its Received-now payment share `created_at` (treat them as a pair); merge sale
    lines split over lots; Walk-in has no account section; a credit reads "Advance ৳X"; send to the
    WhatsApp number, else the phone, else the share sheet; long text → Copy + Open chat; the
    greeting comes from the saved template, editable in the preview, with "Save greeting as
    default"; times are always Asia/Dhaka (the VPS runs on GMT+8).
  - **User answers (2026-10-10):** the Statement message on all 4 kinds; `toWords()` now; Sale =
    the long layout; the toast's Send ▸ opens the preview on the customer's page; ⤴ Share on report
    pages waits for CR-023/025.
  - [x] CR-020.0 `ReportSheet` (`?report=1`; Period chips reusing `periodOptions`; View on screen ·
    WhatsApp message) from ⋯ → Reports & share → Statement (moved from CR-018, D-038).
  - [x] CR-020.1 `statementRange()`: opening, entries, totals, closing; `?from=&to=` + chip on the
    customer, supplier, card and person pages.
  - [x] CR-020.2 `src/lib/whatsapp.ts` + `toWords()`; `src/server/messages.ts`; the send preview
    (`?send=`; template greeting, editable, How to pay switch); Send ▸ on the toast, entry sheet,
    Bills tab; ⋯ → Remind on WhatsApp.
  - **Tests:** [x] U-CR-020.1 `statementRange` ties out to `dueStatements` / card balance ·
    [x] U-CR-020.2 every message incl. Received-now pair, Walk-in, credit, split lots, Due today,
    back-dated, Dhaka time, How to pay, long text · [x] U-CR-020.3 `waNumber`, `periodRange`,
    `formatRange` · [x] U-CR-020.4 `toWords` · [x] U-CR-020.5 ⋯ Statement / Remind ·
    [x] I-CR-020.1 drafts from real saves (pair, INV/MR numbers) tie out to the books ·
    [x] I-CR-020.2 statement draft for a range · [x] E-CR-020.1 ⋯ → Statement → View: chip,
    Opening/Closing, ✕, Back · [x] E-CR-020.2 toast Send ▸ → preview → wa.me link, Copy, Save
    greeting · [x] E-CR-020.3 entry sheet / Bills / Remind; no number → Share ·
    [x] E-CR-020.4 How to pay · [x] E-CR-013.2 axe on the Report sheet and the send preview.
  - **Files:** `src/lib/{whatsapp,words}.ts`, `statementRange` / `statementRowsOf` / `duesAround`
    in `src/lib/accounts.ts`, `formatSaved` / `formatRange` in `dates.ts`, `periodRange` /
    `parseRange` in `journal-filter.ts`, `src/server/messages.ts`, `src/components/send/*`,
    `src/components/report/report-sheet.tsx`, `src/components/accounts/{account-overlays,range-chip}.tsx`,
    the Statement range mode, the 4 account pages, toast / FormBody `send`, the sale, money and
    return forms, the entry sheet and Bills; tests `statement-range`, `whatsapp`, `words`,
    `prefill` (U), `messages` (I), `messages.spec` (+ `a11y`, `quick-actions`) (E).
  - **Local result (2026-10-11):** typecheck + lint clean; unit 515/515; integration 110/110;
    `messages.spec` 8/8, `quick-actions` 12/12, CR-020 a11y 6/6 (3 themes × 2 viewports). Full
    E2E: 174 passed, 11 skipped, 5 failed in 30.9 min, all late-run timeouts (CR-027:
    `shell.spec:69`, `shell.spec:152`, `a11y.spec:56` light/dark, `settings.spec:20`); each
    passes on its own (shell + settings 15/15, a11y 6/6). Card moves tie out to the card balance.
    No About text was added: the Report sheet and the send preview are sheets, not entry forms
    (UIDD §3). `git diff --stat src/lib/engine` empty.

- [x] **CR-021 PDF engine + due statement PDF** (2026-10-10)
  - **Source:** user feedback · **Decision:** D-041 · **Docs:** UIDD §4.8, §4.15, §4.16 (new),
    SRS §1, §12, `CLAUDE.md` (stack)
  - **Spec:** `docs/v1.1-plan.md` → CR-021.
  - [x] CR-021.1 `@react-pdf/renderer` routes, embedded fonts (৳), Share PDF.
  - **Tests:** [x] U-CR-021.1 no cost/profit in customer documents (+ tie-out, wording, header,
    rendered text) · [x] I-CR-021.1–3 the `/pdf/statement` route (partner-only, refusals, tie-out
    to the books, How to pay on customers only) · [x] E-CR-021.1–2 Share PDF from the Report
    sheet and the send preview with the right totals (shared on 360, downloaded on 1280).
  - **Code:** `src/pdf/{layout.ts,statement.ts,document.tsx,statement-pdf.tsx,fonts/}`,
    `src/app/pdf/statement/route.ts`, `src/components/report/share-pdf.tsx`,
    `src/components/send/how-to-pay.tsx` (shared by the Report sheet and the send preview),
    `loadStatement` (`src/server/messages.ts`), `payAccounts` (`src/server/business.ts`),
    `next.config.ts` (`outputFileTracingIncludes`); tests `statement-pdf` (U), `pdf` (I),
    `pdf.spec` (E).
  - **Local result (2026-10-11):** typecheck + lint clean; unit 522/522; integration 113/113;
    `pdf.spec` 4/4 (E-CR-021.1–2 × 360/1280); full E2E 186 passed, 11 skipped, 0 failed (12.0
    min). The standalone `server.js` serves a PDF (fonts traced into `.next/standalone`). No
    About text: Share PDF sits in sheets, not entry forms (UIDD §3). `git diff --stat
    src/lib/engine` empty. Screenshots approved by the user (2026-10-11).

- [x] **CR-022 Invoice + money receipt** (2026-10-10)
  - **Source:** user feedback · **Decision:** D-042 · **Docs:** UIDD §4.8, §4.10, §4.15, §4.16
  - **Spec:** `docs/v1.1-plan.md` → CR-022.
  - [x] CR-022.1 INV-/MR- numbers shown (Journal row + search, entry sheet title, Bills tab,
    statements).
  - [x] CR-022.2 Invoice and receipt PDFs (`/pdf/invoice`, `/pdf/receipt`; `toWords()` exists since
    CR-020, D-040); Share PDF in the Sale / Payment in send preview; a reversed one prints
    CANCELLED from its entry sheet.
  - [x] Feedback 2026-10-11: the PDF header is centered (the logo beside the text, the pair
    centered on the page; `src/pdf/document.tsx`, shared by every PDF; UIDD §4.16).
  - [x] Feedback 2026-10-11: the money receipt reads like a receipt book ("Received with thanks
    from", phone · address, the amount in a shaded box, a ruled sum with the "Received now" bill
    line so it adds up, a "Cleared N%" bar, a PAID IN FULL / ADVANCE stamp; D-042, UIDD §4.16).
    Every PDF's footer adds "Computer-generated, no signature required".
  - [x] Feedback 2026-10-11: the invoice gets the same top block ("Bill to", phone · address, the
    date on the right), an SL column, the total in words, a ruled sum and a PAID / PARTLY PAID /
    DUE stamp (D-042, UIDD §4.16).
  - **Tests:** [x] U-CR-022.1 invoice/receipt content (merged lines, dues, Walk-in, advance,
    words, CANCELLED, no cost/profit, rendered text, tie-out) · [x] I-CR-022.1–3 the routes
    (partner-only, refusals, tie-out, Received now receipt, CANCELLED, How to pay) and the numbers
    on the Journal / Bills loaders · [x] E-CR-022.1–2 Share PDF from the toast's Send ▸ (invoice,
    receipt) with the numbers shown; the cancelled invoice from the entry sheet.
  - **Code:** `src/pdf/{invoice.ts,invoice-pdf.tsx}`, `src/app/pdf/{respond.ts,doc.ts}` (the PDF
    routes' shared part; the statement route uses it too), `src/app/pdf/{invoice,receipt}/route.ts`,
    `loadDocEntry` + the shared `customerEntry` (`src/server/messages.ts`; `docNumbers` removed),
    `JournalRow.docNo` / `Bill.invoiceNo`, `docLabel` / `entryTitle` (`journal/labels.ts`), the
    entry sheet's Share PDF on a reversed Sale / Payment in, the Bills tab number; tests
    `invoice-pdf` (U), `pdf` (I), `pdf.spec` (E); `messages.spec` E-CR-020.3 now picks the exact
    "Share" (the Payment in preview also has Share PDF).
  - **Local result (2026-10-11):** typecheck + lint clean; unit 533/533; integration 116/116;
    `pdf.spec` 8/8 (E-CR-022.1–2 × 360/1280); full E2E 190 passed, 11 skipped, 0 failed (after the
    E-CR-020.3 selector fix). 360 px Bills tab: the number and the Reversed chip no longer break
    mid-word. No About text (no new form). `git diff --stat src/lib/engine` empty. After the
    receipt/invoice feedback: typecheck + lint clean; unit 537/537; integration 116/116;
    `pdf.spec` 8/8. Screenshots and PDFs approved by the user (2026-10-11). Per-document terms (invoice /
    receipt / statement) were asked for too: a schema change, so a new CR via `/change-request`.

- [x] **CR-029 Per-document PDF terms** (2026-10-11; done before CR-023)
  - **Source:** user feedback after CR-022 · **Decision:** D-049 · **Docs:** SRS §4
    (`business_profile`), UIDD §4.13, §4.16
  - [x] CR-029.1 Schema: `business_profile.receipt_terms`, `statement_terms` (nullable text) →
    `npx drizzle-kit generate` (`0005_*.sql`; local only, production migrates at the v1.1 deploy,
    D-049's exception to D-036). The Excel backup writes them.
  - [x] CR-029.2 Settings → Business: a 4th row **PDF terms** (Invoice terms · Receipt terms ·
    Statement terms · Footer line; multi-line, ≤ 1,000 characters, example hints), its own sheet,
    Save and audit (`savePdfTerms`). Invoice terms and footer line leave **Details** (and its
    schema, so saving Details can't clear them).
  - [x] CR-029.3 PDFs: `pdfFrame` takes the document kind and prints only that kind's terms (each
    line its own line, blank lines dropped), then the footer line. Invoice → invoice terms,
    receipt → receipt terms, customer and supplier statements → statement terms. The Sales
    report PDF (CR-023, D-043) prints no terms and no footer line (today `/pdf/sales` passes
    `terms: []`).
  - [x] Feedback 2026-10-11 (D-050): the terms don't say they come from the shop. Every customer
    PDF puts its terms in a light box headed **"Terms & conditions"**, numbered 1, 2, 3 …; the
    footer line apart, centered below the box (alone, centered, when there are no terms). The
    Sales report still prints neither. `PdfFrame` keeps the terms and the footer apart
    (`document.tsx` lays out the box, the numbers and the centered footer); the PDF terms sheet's
    note is updated (UIDD §4.13, §4.16).
  - [x] Found while building D-050: fontkit caches each glyph for the life of the server, and
    embedding a font subset meets a composite glyph's parts without their characters (Noto Sans
    draws ":" from two "."), so after the first PDF every "." looked right but copied or searched
    wrong ("1." read "1&"). Every PDF now renders through `renderPdf()` (`src/pdf/document.tsx`),
    which first lays out each printed character once so the cache holds them with their
    characters. No visual change; a pre-existing bug since D-041.
  - **Tests:** [x] U-CR-029.1 `pdfFrame`: each kind gets only its own terms + the footer;
    multi-line split; blank prints nothing; the 1,000-character limit · [x] I-CR-029.1
    `savePdfTerms` saves + audits; saving Details keeps the terms · [x] I-CR-029.2
    `/pdf/invoice`, `/pdf/receipt`, `/pdf/statement` each print only their own terms ·
    [x] E-CR-029.1 Settings → Business → PDF terms: type the three terms, then each PDF shows its
    own (360 + 1280); a11y of the new sheet. · [x] U-CR-029.2 (D-050) `pdfFrame` keeps the
    terms and the footer apart; the rendered invoice / receipt / statement read "Terms &
    conditions", "1. …", "2. …", then the footer line; no terms → no heading, the footer alone;
    the Sales report has neither · [x] I-CR-029.2 / E-CR-029.1 also check "Terms & conditions"
    and the numbers · [x] U-CR-029.3 after a PDF with ":", the next PDF's "1." still copies as
    "1." (fails without the `renderPdf` warm-up).
  - **Acceptance:** a statement or receipt never shows the invoice terms; empty terms print
    nothing; the existing invoice terms and footer line keep printing (invoice / every PDF).
    Schema touched → full E2E (D-047). Screenshots: Business (4 rows), the PDF terms sheet, the
    end of each PDF.
  - **Code:** `src/db/schema.ts` + `src/db/migrations/0005_pdf_terms.sql` (two `ADD COLUMN`; not
    run on production); `pdfTermsSchema` / `TERMS_MAX` (`validation/business.ts`; Details lost
    the two fields); `savePdfTerms` (`actions/business.ts`); `TextAreaField` (`forms/field.tsx`);
    the PDF terms row and sheet (`settings/business-settings.tsx`); `PdfKind` and
    `pdfFrame(b, kind, howToPay)` (`src/pdf/layout.ts`), `pdfContext(kind, pay)`
    (`app/pdf/respond.ts`) and its 3 callers (`/pdf/sales` passes `"report"`). Tests
    `pdf-terms` (U, new), `statement-pdf` / `invoice-pdf` (new signature; the statement's own
    terms), `business-actions` I-CR-029.1, `pdf` I-CR-029.2, `export` I-CR-016.3 (the terms
    columns in the backup), `pdf.spec` E-CR-029.1, `a11y.spec` (the PDF terms sheet, every theme).
  - **Local result (2026-10-11):** typecheck + lint clean; unit 554/554; integration 120/120;
    `pdf.spec` 10/10 (E-CR-029.1 × 360/1280); full E2E 204 passed, 11 skipped, 0 failed.
    `git diff --stat src/lib/engine` empty. No About text: the Business sheets aren't in UIDD
    §3's About table (as Details). Screenshots taken (Business 4 rows, the sheet at 360/1280, the
    end of the invoice / receipt / statement PDFs); the user approved them and gave feedback:
    D-050 (the "Terms & conditions" box). **After D-050:** typecheck + lint clean; unit 556/556;
    integration 120/120; full E2E 204 passed, 11 skipped, 0 failed; engine untouched. Code:
    `PdfFrame.footer` apart from `terms`; the box, numbers (hanging indent) and centered footer in
    `document.tsx`; `renderPdf()` used by `invoice-pdf`, `statement-pdf`, `sales-pdf`; the sheet's
    note. New screenshots of the PDF ends and the sheet approved by the user (2026-10-11).
    **CR-029 is done.**

- [x] **CR-023 Reports page: Cash book (+ Cash count), Sales report, Backup** (2026-10-10)
  - **Source:** user feedback · **Decision:** D-043 · **Docs:** UIDD §3, §4.2, §4.12, §4.17
  - **Spec:** `docs/v1.1-plan.md` → CR-023. Built before CR-029 (user, 2026-10-11).
  - [x] CR-023.1 `/reports`; Reports replaces Export in More and the sidebar; Export stays at
    `/export` as "Backup all data".
  - [x] CR-023.2 Cash book (`cashBook()`, ‹ day › stepper, range, entry sheet in place) + Cash
    count; Home Cash tile → Cash book.
  - [x] CR-023.3 Sales report (`salesReport()`, totals, by model, by customer, net of returns).
  - [x] CR-023.4 Outputs: ⤴ Share → the Report sheet (generalised); report messages in the send
    preview (Copy · Share); Sales PDF (`/pdf/sales`) and Excel (`/reports/sales/xlsx`).
  - **Tests:** [x] U-CR-023.1 `cashBook`: closing on any day = `computeBooks(day).cash`, reversal
    side, Received now, quiet days skipped, saved order · [x] U-CR-023.2 `salesReport`: a month's
    net sales profit = `monthProfit` sale + customer_return (reversals included), tables total the
    net figures, margin · [x] U-CR-023.3 `cashBookText` / `salesText` · [x] I-CR-023.1 the loaders
    tie out to `loadBooks` after real saves · [x] I-CR-023.2 `/pdf/sales` + the xlsx route
    (partner-only, 400, tie-out, no audit) · [x] E-CR-023.1 More/sidebar → Reports → the 3 links ·
    [x] E-CR-023.2 Cash tile → Cash book, stepper, entry sheet, Cash count, day book message ·
    [x] E-CR-023.3 Sales report, Share PDF, Download Excel · [x] E-CR-023.4 a11y of the 3 pages.
  - **Acceptance:** typecheck, lint, unit, integration and the full E2E run green (nav touched);
    `git diff --stat src/lib/engine` empty; 360/1280 screenshots approved.
  - **Code:** `src/lib/{cash-book,sales-report}.ts` (pure), `src/server/reports.ts`
    (`loadCashBook`, `loadSales`), `src/app/(app)/reports/{page,cash/page,sales/page}.tsx`,
    `reports/sales/xlsx/route.ts`, `src/app/pdf/sales/route.ts`, `src/pdf/{sales.ts,sales-pdf.tsx}`,
    `src/components/report/{report-title,cash-book-view,cash-count,sales-view}.tsx`; the Report
    sheet takes `title` / `day` / `send` / `pdfHref` / `excelHref`; the send sheet's `ReportDraft`
    (no To, Greeting or How to pay); `cashBookText` / `salesText` (`whatsapp.ts`); `toWorkbook`
    exported; `moreLinks` Export → Reports. Tests `cash-book`, `sales-report` (U), `reports` (I),
    `reports.spec` + a11y (E); updated `settings.test` U-CR-017.2, `home.spec`, `settings.spec`,
    `shell.spec`.
  - **Local result (2026-10-11):** typecheck + lint clean; unit 553/553; integration 118/118;
    `reports.spec` 6/6 (E-CR-023.1–3 × 360/1280); `a11y.spec` 39/39 (E-CR-023.4 in 3 themes);
    full E2E 202 passed, 11 skipped, 0 failed; `git diff --stat src/lib/engine` empty. About
    text: none (no new form); ⓘ on Net sales profit (`viewHelp.salesReport`). Screenshots and
    the Sales PDF approved by the user (2026-10-11). **CR-023 is done.**

- [x] **CR-024 Profit view for any open month** (2026-10-10)
  - **Source:** user feedback · **Decision:** D-044 · **Docs:** UIDD §4.9
  - **Spec:** `docs/v1.1-plan.md` → CR-024. User's choices (2026-10-11): fill every month (a quiet
    month shows ৳0); the open page = title + "Open · close {next} first" + the Profit breakdown.
  - [x] CR-024.1 Months list: every month from the opening month to this month, each linked (a
    month after this month is listed with no link).
  - [x] CR-024.2 `/months/[month]` for a later open month: read-only breakdown so far + the note;
    a month after this month or before the opening is still 404.
  - **Tests:** [x] U-CR-024.1 `monthList` fills quiet months, links up to this month · [x]
    U-CR-024.2 each open month's breakdown sums to its Months list profit · [x] E-CR-024.1 a later
    open month renders (no Close); a future month 404 · [x] E-CR-024.2 a11y of the open month page.
  - **Code:** `monthList(months, closes, next, thisMonth)` fills every month and sets `link`
    (`src/lib/months-view.ts`); `months/page.tsx` passes this month; `month-list.tsx` links on
    `link`; `months/[month]/page.tsx` adds the later-open-month branch (`monthProfit` →
    `breakdownLines` → `Breakdown`). Tests: `months-view.test` (U), `phase5.spec` E-CR-024.1,
    `a11y.spec` E-CR-024.2. A not-found month answers 200 with Next's not-found UI (the (app)
    `loading.tsx` streams), so the E2E asserts the UI, not the status.
  - **Local result (2026-10-11):** typecheck + lint clean; unit 558/558; integration 120/120;
    `phase5` + `a11y` (E-CR-024.2 in 3 themes) + `home` + `shell` specs: 60 passed, 3 skipped
    (360 px-only tests on desktop), 2 failed (E-CR-024.1's 404 status check, fixed as above); the
    `phase5.spec` re-run 4/4 (E-CR-024.1 × 360/1280); `git diff --stat src/lib/engine` empty. About text: none (no new form). Approved by the user
    (2026-10-11). **CR-024 is done.**

- [x] **CR-025 Per-account reports + monthly partner pack** (2026-10-10)
  - **Source:** user feedback + the cross-report check (user, 2026-10-11) · **Decision:** D-045 ·
    **Docs:** UIDD §4.8, §4.9, §4.16, §4.17; SRS §12
  - **Spec:** `docs/v1.1-plan.md` → CR-025, refined by D-045 (one "as on" rule, one model per
    report). All parts built together, one screenshot review (user, 2026-10-11).
  - [x] CR-025.0 Shared: Report sheet `period` (any · months · month) + `target`; the generic report
    PDF (`src/pdf/report.ts`, Sales moved onto it); Reports list + Monthly pack + Investor report.
  - [x] CR-025.1 Investor / Partner report: `investorReport()`, `/reports/investor` (list + report),
    person ⋯ → Investor report, WhatsApp to the person, `/pdf/investor`, Excel.
  - [x] CR-025.2 Card statement (bills as on the period end, credit split, EMI schedule, PDF, Excel);
    customer / supplier By model (+ Bought from you) on screen, PDF, text, Excel.
  - [x] CR-025.3 Monthly pack: 8 sections (`monthly-pack.ts`, `stockMovement`), `/reports/pack`,
    Months ⤴ Share, PDF, Excel, message.
  - **Tests:** [x] U-CR-025.1 `investorReport` (capital groups, roll-forward = profit owed now,
    allocations, cards as on the end, card payments = the card statement's) · [x] U-CR-025.2 card
    (`emiSchedule`, bills as on the end = pack §7, credit split) · [x] U-CR-025.3 By model
    (customer = the Sales report's row; supplier at refund, write-off excluded; Bought from you) ·
    [x] U-CR-025.4 the pack's sections tie out (P&L = Months, ✓, stock Opening = last Closing and
    value = books, dues = statements, cash = Cash book) · [x] U-CR-025.5 texts / PDF models /
    sheets equal their report model · [x] I-CR-025.1 the loaders after real saves tie out to
    `loadBooks` (books-balance invariant) · [x] I-CR-025.2 the new PDF / xlsx routes (partner-only,
    400, tie-out, no audit) · [x] E-CR-025.1 Investor report · [x] E-CR-025.2 card and customer
    statements · [x] E-CR-025.3 Monthly pack + Months ⤴ · [x] E-CR-025.4 a11y of the new pages.
  - **Code:** `src/lib/{investor-report,monthly-pack,stock-movement,by-model,report-text,
    report-sheets}.ts` (pure; `card-view.ts` + `billsIn` / `emiSchedule` / `creditSplit`),
    `src/server/{account-reports,pack,report-lines}.ts` (`loadSales` takes a customer;
    `xlsxReport` in `export.ts`), `src/pdf/{report,report-pdf,account-reports,pack}.ts(x)` (the
    Sales PDF moved onto the generic one; `sales-pdf.tsx` removed), routes `/pdf/{investor,card,pack}`
    and `/reports/{investor,statement,pack}/xlsx`, pages `/reports/{investor,pack}`, Months ⤴,
    `components/report/{investor-view,pack-view,pack-parts,by-model}.tsx`; the Report sheet's
    `period` / `target`; `CardBills` `period`; `PeopleList` `href`; the `investor` send source.
    Tests: `cr025-fixture`, `investor-report`, `card-report`, `by-model`, `monthly-pack`,
    `report-outputs` (U), `cr025-reports` (I), `reports-cr025.spec` + a11y (E); updated
    `prefill.test` (person ⋯), `quick-actions.spec`, `reports.spec` (Reports list), `pdf.spec`
    (a card's Statement has its own PDF now).
  - **Found while checking:** the PDF fonts have no ✓ or → (PDFs print "Balanced" / "clear"; a
    unit test guards it); a top-5 customer table now ends with "Other customers" so its total is
    the net sales (one total in every report).
  - **Local result (2026-10-12):** typecheck + lint clean; unit 591/591; integration 122/122; full
    E2E 222 passed, 11 skipped, 2 failed (`pdf.spec` E-CR-021.2 asserted a card had no PDF: updated
    for D-045), then `pdf` + `reports` + `reports-cr025` specs 23/23 and the CR-025 a11y test in 3
    themes 6/6 (`--reporter=list`: each E-CR-025 id passed on 360 and 1280); `git diff --stat
    src/lib/engine` empty. About text: none (no new form). Screenshots and PDFs approved by the
    user (2026-10-12). **CR-025 is done.**

- [x] **CR-027 Late-run E2E timeouts (desktop): find the cause, make the full suite reliable**
  (2026-10-10)
  - **Source:** misalignment in CR-017/CR-018 verification (user, 2026-10-10: cover every late-run
    timeout; decide the fix after investigating) · **Decision:** D-047 only if the fix changes a
    rule or how E2E runs · **Docs:** UIDD §1 (Back closes sheets, D-035) if the sheet code changes
  - **Symptom:** late in a full `npm run test:e2e` (about 160 tests, one worker, `next dev` on :3001),
    some desktop tests time out. Each passes on its own, and the mobile copy of each passes.
    - `shell.spec:69`, failure 1: More → Journal closed the sheet, but the URL stayed on `/` until
      the 30 s test timeout.
    - `shell.spec:69`, failure 2 (with `test.slow()`): New → Card payment left the URL on `/people`
      at a 5 s check.
    - `journal.spec:160` (`goto` returns-edit), `phase3.spec:106` (customer option click),
      `a11y.spec:56` light and dark (an animation wait; `ERR_ABORTED`), and CR-017's 4 desktop
      timeouts.
  - **Hypotheses:**
    - **(a)** `next dev` recompiles evicted routes late in the run. Dev has no Link prefetch, so a
      soft navigation keeps the old page until the server responds.
    - **(b)** a real bug where a link inside a sheet loses its navigation: `SheetLink` (`replace` +
      `leaveSheet()`) in `use-back-close.tsx`, its `history.go()` / `skipPops` bookkeeping, or
      Next's patched `pushState` (D-035).
    - **(c)** memory pressure on the machine (several sessions plus Chromium; one wait was killed for
      low memory).
  - [x] CR-027.1 Reproduce with evidence: run the full suite with `trace: "retain-on-failure"`
    (locally, not committed). For each failure, read the trace: the RSC/document request is
    pending (slow compile), never sent (lost navigation), or aborted. Note `history.state` and
    the dev-server log at that moment.
  - [x] CR-027.2 *(n/a: the cause is (a) + (c), not (b).)* If (b): a failing test first (an E2E that taps a sheet link right after another
    sheet closed or a modal navigated), then the fix in `use-back-close.tsx`, with UIDD §1 / D-035
    unchanged in behaviour.
  - [x] CR-027.3 If (a) or (c): bring the findings and a recommendation to the user before
    changing anything (options so far: E2E on `next build` + `next start`; longer waits). Then
    write D-047 if the E2E setup changes.
  - **Tests:** [x] the full `npm run test:e2e` green **twice in a row** with nothing else running
    against the local DB (2026-10-11, recorded under CR-028) · [x] any E test added for (b), at
    360 + 1280 (none needed: not (b)).
  - **Acceptance:** the cause of each listed failure is named with trace evidence; the full suite is
    green twice in a row; no `test.slow()` / timeout bump hides a real bug; `src/lib/engine`
    untouched.
  - **Note:** `shell.spec:69` already has `test.slow()` (CR-018). It stays if the test still visits
    about 8 pages after the fix.
  - **Evidence (2026-10-11):**
    - **Traced `next dev` run:** 173 passed, 6 failed, all desktop, all late:
      `a11y.spec:56` dark + night_owl, `card-page.spec:109`, `journal.spec:160`, `phase3.spec:106`,
      `shell.spec:69`. Every trace shows the request sent and the server busy recompiling an
      evicted route: `/cards` was compiled 18× (0.7 s → 14.8 s), `/money/new` 2.7 s → 16.4 s, and
      the dev server's memory grew to ~10 GB. **(a) + (c), not (b).**
    - **Fix applied (D-047):** E2E on `next build` + `next start` (`.next-e2e`), with one login per
      run. First full run: 20.3 min instead of 35.
    - **New finding (production only):** 10 failures, which are real. A same-path, query-only
      navigation (`?entry=`, `?tab=`, `?send=`, `?from=`) is lost ~20–40% of the time on the
      production build. Taps on a supplier's statement row: 3–5 of 12 lost; Home rows 2/12;
      a path change (Stock tab) 0/15. A second tap usually works.
      - Probes show the server response is identical for lost and working taps. Next's router
        state promise is fulfilled. React keeps the transition lanes suspended and never pings
        them.
      - The cause is Next 15.5's layout-router lazy fetch: it dispatches `ACTION_SERVER_PATCH`,
        then suspends on `unresolvedThenable`; the patch reducer finds it "not applicable to the
        current tree" and drops it, so the render waits forever.
      - Not in `use-back-close` and not prefetch (blocking prefetch changes nothing). We are on
        the newest 15.5.x (15.5.27); `latest` is 16.4.0.
    - **The user's choice (2026-10-11):** defer the fix to **CR-028** (before the v1.1 deploy).
      Until then, E2E taps same-page query links through `tapUntil` (one retry, marked CR-028;
      D-047).
  - [x] CR-027.4 `tapUntil(page, link, urlCheck)` in `tests/e2e/helpers.ts`, used only for
    same-page query links in the failing specs (entry-sheet, messages, journal), each marked
    `// CR-028`. `back-close.spec:18` (stale page after Back) and `card-page.spec:109` (a path
    link) are not query taps: trace them first, and change them only if the trace shows the same
    race. Delete the temporary `zz-probe*.spec.ts`.
    - **Tried (2026-10-11), then undone:** `tapUntil` with one re-tap in entry-sheet, messages and
      journal. entry-sheet and journal passed, but E-CR-020.1/.3 failed at 360 + 1280. Repeated 4×,
      E-CR-020.1 failed 3 times: both taps were lost, on "Clear the period" twice and on "View on
      screen" once. `zz-probe3.spec.ts` (the period chip, 11 tries): 4 first taps were lost, and
      in all 4 the **2nd tap was lost too**. The 3rd tap worked 3 times, the 4th tap once. After a
      lost tap, a path link and a fresh load always worked. So one re-tap (D-047) is not enough.
    - **The user's choice (2026-10-11):** do **CR-028 first**. If the upgrade fixes it, this step
      keeps single taps (no `tapUntil`) and only does the traces + probe deletion; otherwise it
      comes back to the user.
    - **Status after CR-028 (2026-10-11):** the upgrade fixed it; no `tapUntil`. The probes are
      deleted. `card-page.spec:109` traced: a test bug (`clickSpot`), fixed (D-048).
      `back-close.spec:18` passed in all 5 full runs on Next 16, so there was no failure to trace.
      The full suite is green twice. The user confirmed (2026-10-11).

- [x] **CR-028 Lost same-page taps on the production build (Next 15.5 router race)** (2026-10-11)
  - **Source:** misalignment in CR-027 (the production E2E build exposed it; the user deferred the
    fix to here, before the v1.1 deploy) · **Decision:** D-047 (the deferral and E2E re-tap); a
    new D entry if the fix upgrades Next (the stack says Next.js 15) · **Docs:** UIDD §1 / D-032
    behaviour unchanged (a tap opens the entry over the page).
  - **Symptom:** on `next build` + `next start` (= the live app), a link that only changes the
    query on the same path (`?entry=`, `?tab=`, `?send=`, `?report=`, `?from=`) does nothing
    ~20–40% of the time. A re-tap often fails too (the period chip needed a 3rd or 4th tap;
    evidence under CR-027.4). Possibly also the stale page after Back from the sale form
    (`back-close.spec:18`).
  - [x] CR-028.1 Spike: Next 16.x in a throwaway worktree. Run the lost-tap probes
    (`zz-probe.spec.ts`: a supplier statement row; `zz-probe3.spec.ts`: the period chip; both
    mobile only, on the production build) and the full E2E. Report the upgrade's size and breaking
    changes to the user before anything lands on `dev`.
    - **Result (2026-10-11, worktree `../MBL-next16-spike`, Next 16.4.0 + React 19.2):**
      - **The race is gone.** Webpack build: 0 lost in 4 runs (40/40 row taps, 80/80 chip taps).
        Turbopack build: 0 lost in 2 runs (20/20, 40/40). On 15.5: 3–5/12 and 4/11 lost.
      - **Full E2E, webpack build:** run 1: 180 passed, 0 failed (11.1 min, was 20.3 min with 10
        failures). Run 2: 179 passed, 1 failed: `card-page.spec:109`. The trace shows a **test
        bug**, not the race: `clickSpot` scrolls the row just into view, then `wheel(0, -120)`
        pushes it below an 800 px viewport (click at y = 858) and nothing is tapped. Centring the
        row (`scrollIntoView({ block: "center" })`, no wheel): 30/30.
      - **Full E2E, Turbopack build:** 178 passed, 2 failed: E-CR-017.1 (both viewports) expects
        `oklch(1 0 0)`; Turbopack's CSS writes the same white as `lab(100 0 0)`.
      - Unit 515/515, integration 110/110, typecheck clean.
      - **Upgrade size:** `next`/`eslint-config-next` 16.4.0, `react`/`react-dom` 19.2.
        `eslint.config.mjs` must use the flat exports (FlatCompat crashes). The new react-hooks
        rules flag 6 places: `set-state-in-effect` in the 4 entry forms' client UUID + the
        entry sheet's re-open, and `immutability` for `<html data-theme>` in theme-setting.
        `middleware.ts` → `proxy.ts` (deprecated, still works). Next rewrites `tsconfig.json`
        (`jsx: react-jsx`, `.next-*/dev/types`). `next build` defaults to Turbopack (`--webpack`
        keeps webpack). VPS Node 20.19.6 ≥ 20.9 is OK. No engine/app logic change.
  - [x] CR-028.2 The user picks: upgrade, or a workaround in our code if the spike fails. Write
    the D entry + docs if the stack changes.
    - **The user's choice (2026-10-11):** upgrade to **Next 16.4 with Turbopack**, and **rework**
      the 6 lint spots (rules stay on). **D-048**; CLAUDE.md, README, SRS §1 + §11 updated.
    - Done on `dev`: next/eslint-config-next 16.4.0, react/react-dom 19.2.8 (exact pins);
      flat `eslint.config.mjs`; `src/middleware.ts` → `src/proxy.ts` (+ its unit test);
      `useHydrated()` (`src/components/forms/use-hydrated.ts`) in the 4 entry forms; the entry
      sheet re-opens without an effect; theme-setting uses `setAttribute`; `clickSpot` centres
      its target; E-CR-017.1 accepts `lab(100 0 0)`; the `zz-probe*` specs deleted.
  - [x] CR-028.3 Single taps everywhere (no `tapUntil` was committed; keep it that way).
  - **Tests:** [x] E-CR-028.1 at 360 + 1280: tapping a statement row, the Bills tab and Home's
    recent row opens it 20/20 on the production build (`same-page-taps.spec.ts`) · [x] the full
    `npm run test:e2e` green twice with no retry (2026-10-11: 182 passed, 11 viewport skips,
    0 failed, ~12 min each). Unit 515/515, integration 110/110, typecheck + lint clean,
    `src/lib/engine` untouched. No UI change, so no screenshots.
  - **Acceptance:** no lost same-page tap in 20 tries per link kind; no re-tap helper in E2E;
    `src/lib/engine` untouched; screenshots only if the UI changes.

- [x] **CR-031 Supplementary card numbers; one fingerprint reveals any card for 30 s** (2026-10-12)
  - **Source:** user feedback · **Decision:** D-054 · **Docs:** PRD §4; SRS §4, §11; UIDD §4.8,
    §4.11, §4.14
  - **Spec:** `docs/v1.1-plan.md` → CR-031. Built on `dev` after CR-030.
  - **The user's choices (2026-10-12):**
    - supplementaries share the primary's bill, limit and days;
    - the swipe isn't recorded;
    - the masked label is "Primary / Supplementary · last 4";
    - any number reveals in the 30 s window, one shown at a time;
    - the window is fixed from the fingerprint;
    - hide on window blur (screenshots can't be blocked);
    - no clipboard clearing;
    - pickers show the card name only.
  - [x] CR-031.1 Schema + migration:
    - `card_secrets.card_id` is no longer unique (indexed);
    - `supplementary` bool default false;
    - unique `card_id` where not `supplementary`.
  - [x] CR-031.2 Actions:
    - add any number to a card;
    - one Primary per card ("This card already has a primary — mark this one Supplementary");
    - edit may change the tag;
    - edit/remove still need a reveal of that number.
  - [x] CR-031.3 Reveal route:
    - `secretId` in the body;
    - the signed `card_reveal` cookie after a fingerprint;
    - `{ window: true }` reveals while the cookie is valid;
    - a window reveal sets no new cookie (the end never moves);
    - audit `via`.
  - [x] CR-031.4 UI:
    - card details grouped per card, with the tag + last 4;
    - Add on any active card, with Primary/Supplementary chips;
    - the countdown runs from the fingerprint;
    - revealing another number masks the previous one;
    - Hide / background / blur end the window;
    - Setup's delete confirm counts the numbers.
  - **Tests:**
    - [x] U-CR-031.1 the window cookie: signs and verifies; expired, tampered or another user's →
      rejected;
    - [x] U-CR-031.2 masked label (Primary / Supplementary);
    - [x] I-CR-031.1 a primary + 2 supplementaries on one card; a second primary is refused; edit
      changes the tag; edit/remove gate per number; a card delete removes them all;
    - [x] I-CR-031.2 reveal:
      - `window` with no cookie → 401;
      - with a valid cookie → 200 for another card, audit `via: window`;
      - an expired cookie → 401;
      - a `secretId` of another card → 404;
    - [x] E-CR-031.1 3 numbers under one card, with their labels (360 + 1280);
    - [x] E-CR-031.2 one fingerprint → reveal A, then B with no new prompt; A masked; countdown
      not reset; after the window, Reveal prompts again; blur masks;
    - [x] a11y in 3 themes.
  - **Acceptance:**
    - a card holds a primary and 2 supplementary numbers;
    - the Cards list, pickers and reports are unchanged;
    - one fingerprint reveals any number for 30 s, one at a time;
    - `src/lib/engine` untouched;
    - screenshots (360 + 1280) approved: the user tested it live on localhost instead and asked to
      tick it (2026-10-12).
  - **Local result (2026-10-12):**
    - typecheck + lint clean; unit 607/607; integration 131/131.
    - Full E2E: 250 passed, 11 skipped, 2 failed. The 2 are `smoke.spec` (the top bar's business
      name), which already failed before CR-031: the local DB's short name is "SMS" (see CR-030).
    - `git diff --stat src/lib/engine` is empty.
    - The production migration (0006) runs at the next deploy. Existing saved numbers become
      Primary.
  - **Follow-up feedback (2026-10-12), for a new CR** (→ CR-045, D-067; answered 2026-10-24):
    - a card number must be unique across all cards. The numbers are encrypted, so the check is
      a comparison of the decrypted numbers on save.
    - Still to ask: must the primary come before supplementaries? must the number match the
      card's Type? is the holder name required for a supplementary?

- [x] **CR-032 One card's opening holds EMI plans: replace its flat opening row (one-off script)** (2026-10-13)
  - **Source:** user feedback (2026-10-13).
    - Jamal · EBL Visa was imported as one flat card balance in the Oct 2026 bill.
    - The 05-Oct-2026 statement shows that this is the billed amount plus 10 EMI plans that
      started before the opening.
  - **Decision:** D-055 · **Docs:** SRS §6 (EMI: early settlement), §9 (cutover checklist).
  - **The user's choices (2026-10-13):**
    - the statement's exact figures (the total falls a little below the rounded amount entered,
      so the opening difference moves by that change);
    - one opening row per EMI plan;
    - the script route (a dry run first, then the real run only after the user approves);
    - an early settlement is a Card payment (+ Card fee); no "Settle early" action.
  - [x] CR-032.1 The opening-EMI helper module (a script helper, later removed from this repo):
    - `parsePlan`: `{ owner, card, expectedOld, rows: [{ amount, emiMonths?, billMonth, note }] }`;
      amounts are strings parsed with `parse()`; EMI only on an amount > 0 with `emiMonths` ≥ 2;
      `billMonth` YYYY-MM.
    - `replaceCardOpening(db, plan, userId, dryRun)`, in one transaction:
      1. find the card (exactly 1) and lock its opening `card_balance` rows `FOR UPDATE`
         (exactly 1, amount = `expectedOld`);
      2. refuse if the opening month is closed or a reversal points at the row;
      3. delete it and insert the new rows (same date and card, `created_by` null as the import);
      4. move each partner's `opening_difference` row by `splitShares(old − new)` (partners
         by name);
      5. write one audit row per delete, insert and update;
      6. a dry run rolls back.
    - The output is the summary only: totals, the row count, each partner's change.
  - [x] CR-032.2 The card-opening fix script, the CLI (later removed from this repo) (`<plan.json> --as <email> [--dry-run]`).
  - [x] CR-032.3 👤 Production:
    - the plan JSON goes in the scratchpad (never the repo);
    - the dry run is shown to the user; the real run only after they approve;
    - then the card page is checked.
    - **Dry run on production (2026-10-13), nothing written:** 1 card row → 11 rows, total
      −৳412.60; Sumon's and Arif's opening difference +206.30 / +206.30. It matched the read-only
      check of the same day: one opening row, no other entries on the card, no closed month.
    - **Applied on production (2026-10-13)** after the user's go-ahead: 14 audit rows in Arif's
      name. A read-back through `loadBooksData` + `computeBooks` shows:
      - books difference 0;
      - balance ৳1,68,340.20, Remaining EMI ৳94,115.20, 10 EMI plans;
      - bills: Oct ৳71,850 (due 20 Oct); Nov, Dec, Jan ৳27,640.50 each; Feb, Mar ৳5,320.50 each.
    - **Final read-only check (2026-10-13):** before vs after, every derived figure was compared
      at 5 dates. Only this card, the partners' opening difference (+412.60) and net assets =
      equity moved; profit, cash, stock and the other cards are unchanged. The statement, the
      investor report and the monthly pack agree with the card. The user approved the card page.
    - Cosmetic, for a possible later CR: the card statement labels these plans "EMI purchase", and
      its 11 same-day opening lines appear in random order.
  - **Tests:**
    - [x] U-CR-032.1 `parsePlan` accepts a valid plan and rejects:
      - EMI on an amount ≤ 0;
      - months < 2;
      - a bad month;
      - 3 decimals.
    - [x] U-CR-032.2 the engine on opening rows shaped like the plan: balance, Remaining EMI, the
      monthly bills, the invariant;
    - [x] U-CR-032.3 an early settlement (a card payment for everything left) → balance 0,
      status clear, the future bills paid, remaining EMI unchanged;
    - [x] I-CR-032.1 the script on local Supabase:
      - a dry run writes nothing;
      - a run replaces the row, moves the opening difference and writes the audit rows; the books
        difference is 0;
      - it refuses on a wrong `expectedOld`, 2 opening rows, a closed month, or a reversal.
    - No E2E: there is no UI change.
  - **Acceptance:**
    - Jamal · EBL Visa shows the Oct 2026 bill at the billed amount, the 10 EMI plans and the right
      Remaining EMI;
    - the books still balance;
    - `src/lib/engine` is untouched.

- [x] **CR-033 Cash-out Fee %, Cards search grouped by owner, Avg unit price in By model** (2026-10-13)
  - **Source:** user feedback (2026-10-13, screenshots of the Cash-out form, the Cards tab and
    the Sales report).
  - **Decision:** D-056 · **Docs:** SRS §3; UIDD §4.6, §4.8, §4.17;
    `.claude/rules/money-engine.md`.
  - **The user's choices (2026-10-13):**
    - Fee % fills Cash received, which can be typed over; exact paisa;
    - group the cards by owner; the heading shows the Balance only, netted; under a search it
      counts and totals only the cards shown;
    - phone rows show the card name only;
    - "Avg unit price" = the average of what was sold (not Sales ÷ Pieces), whole taka, in every
      By model table and its PDF, Excel and text.
  - **Display and input only:** no schema, migration, engine or posting change; nothing new is
    stored. The loaders stay read-only SELECTs.
  - [x] CR-033.1 Cash-out (`src/components/money/money-form.tsx` `CashOut`):
    - Fee % (no `name`, local state, `parseRate` + ≤ 100; a bad value: "Enter a % like 1.3");
    - Cash received is controlled: the typed text, or charged − `pct(charged, %)`;
    - typing in Cash received clears Fee %;
    - `FormChanged` after an auto change, so the preview follows;
    - the fee line, from the shown values: "· X% of ৳charged".
  - [x] CR-033.2 Cards (`src/lib/card-view.ts`, `src/components/cards/card-list.tsx`):
    - `CardRow.ownerId`;
    - `searchCards` and `groupByOwner` (pure);
    - a client list with the search box and the owner heading rows (desktop) or headings (phone);
    - no Owner column; phone rows show the card name only.
  - [x] CR-033.3 Avg unit price:
    - `avgUnit` in `money.ts`;
    - `SalesGroup` and `ModelRow` gain `avg` and `avgPieces` (lines that still stand; the sales
      loader passes `reversesId`, and the purchases loader selects `p.id`, `p.reverses_id`);
    - `piecesAt` (one phrase for phones and messages);
    - the column in the Sales report and Monthly pack (screen, PDF, Excel) and the statement By
      model (screen, PDF, Excel);
    - `piecesAt` in the sales, pack and statement messages.
  - **Tests:**
    - [x] U-CR-033.1 `avgUnit`:
      - exact cases;
      - .5 rounds up;
      - pieces ≤ 0 and total < 0 give null.
    - [x] U-CR-033.2 the cash-out % maths:
      - 2,80,000 @ 1.3 → fee 3,640, received 2,76,360;
      - 1,23,457 @ 1.15 → fee 1,419.76;
      - the shown % string.
    - [x] U-CR-033.3 `searchCards` and `groupByOwner`:
      - owner, bank and Type, in any case;
      - "1 of 6";
      - a card in credit nets; the heading Balance = the column's sum.
    - [x] U-CR-033.4 the sales avg:
      - no returns;
      - returns leave it at the sold price (the ৳65,000 example gives ৳20,000);
      - an in-period sale + its reversal are both left out;
      - a reversal of an earlier sale is ignored;
      - every other figure is unchanged.
    - [x] U-CR-033.5 `piecesAt` (× / · avg / no avg); the purchases avg with sent back and
      reversals.
    - [x] U-CR-033.6 the outputs agree: page, PDF, Excel and text have the same avg; PDF widths
      add up to 100%; the Total row is blank.
    - [x] I-CR-033.1 a cash-out saved with the auto value stores the same two amounts and nothing
      else.
    - [x] I-CR-033.2 the loaders' avg on seeded returns and a reversal; the Sales and statement
      Excel By model have the column.
    - [x] E-CR-033.1 Cash-out:
      - 280000 + 1.3 → 276360 and the fee line;
      - typing in Cash received clears the %;
      - Save, then Edit shows the same amounts (360 + 1280).
    - [x] E-CR-033.2 Cards:
      - search "City";
      - "1 of N cards";
      - the heading Balance;
      - phone rows without the owner.
    - [x] E-CR-033.3 Sales report and statement By model: the column on desktop, `×` / `· avg` on
      a phone; the PDF downloads.
    - [x] Update the existing specs:
      - [x] E4.6.2 (columns, phone text);
      - [x] E-CR-030.1;
      - [x] `card-page.spec`;
      - [x] E-CR-023.3 (unchanged; passes);
      - [x] a11y in 3 themes.
  - **Acceptance:**
    - Fee % fills Cash received, and what is saved is what is shown;
    - the Cards tab is searchable and grouped by owner;
    - every By model table shows the same Avg unit price on screen, in the PDF, the Excel and the
      message;
    - no stored figure changes; `src/lib/engine` is untouched;
    - screenshots (360 + 1280) are approved.
  - **Local result (2026-10-13):**
    - typecheck + lint clean; unit 623/623; integration 135/135.
    - E2E: `cr033.spec` 6/6 (360 + 1280); the updated `phase4`, `cr030` and `card-page` specs pass
      (14 passed, 1 skipped as before).
    - `git diff --stat src/lib/engine` is empty.
    - Full E2E (2026-10-13): 254 passed, 11 skipped, 4 failed.
      - `smoke.spec` (×2): the old failure from before CR-031; the local DB's short name is "SMS".
      - `a11y.spec` dark and night_owl on mobile: flaky; a re-run of `a11y.spec` passed 29/29.
    - Screenshots (360 + 1280) of the four screens: the user approved them and asked to tick it
      (2026-10-13).

- [x] **CR-034 A card reversal cancels its original on the bills** (2026-10-14)
  - **Source:** user feedback (2026-10-14, Arif · EBL Mastercard): a reversed ৳17,468 card
    payment left the Oct bill reading paid (the original still poured into it) and put the reversal
    as a new charge on the Nov bill, so the card read "Upcoming, next due 20 Nov" while ৳9,275.09
    was due 20 Oct. The user deleted the reversal; production data needs no fix.
  - **Production check (2026-10-14, read-only, with the user's OK):** 0 reversals in purchases,
    sales, returns and money entries, so no card's bills change on screen at the deploy. Nothing
    is stored from the bills (the close snapshot holds profit only); no migration or script.
  - **Decision:** D-058 (replaces D-021's reversal rule) · **Docs:** SRS §6 (items 4, 5), §8;
    UIDD §4.8; `.claude/rules/money-engine.md`.
  - **The user's choices (2026-10-14):**
    - Reverse means "cancel it fully": the pair drops out of the bills, for every card entry type;
    - both rows stay in Charges and credits, greyed (Reversed tag / "Reversal of …");
    - a reversed EMI purchase's plan is removed.
  - **An engine change** (exception to the v1.1 rule, user-approved): `engine/cards.ts` only;
    `postEntry`, SRS §5, the schema and stored data are unchanged.
  - [x] CR-034.1 Engine (`src/lib/engine/cards.ts`, `Posted` in `post.ts`, the books loader):
    - `Posted` carries `reversesId`;
    - in `summary`, a reversal dated ≤ `asOf` and its original are left out of `charged`,
      `credits` and `emiPlans`; the balance still sums both (so it is unchanged);
    - both still go in `moves`, flagged (`reversed` on the original, `reversal` on the other)
      with `billMonth: null`;
    - the header comment cites D-058, not D-021, for reversals.
  - [x] CR-034.2 Card page (`src/components/cards/card-detail.tsx`, `cards/[id]/page.tsx`):
    - the two rows greyed; the original's **Reversed** tag; the reversal's label "Reversal of
      {entry}" and "Cancels the original" (the Cash book's "Reversal of …" naming);
    - a reversed EMI purchase has no EMI label and no plan.
  - [x] CR-034.3 Card statement for a period (screen, `/pdf/card`, Excel, text): the reversal's
    line reads "Reversal of …"; amounts and running balance unchanged.
    - The user's choice (2026-10-14): every statement (customer, supplier, person too) names a
      reversal the same way, on screen and in the PDF, Excel and text; one helper shared with the
      Cash book.
  - [x] CR-034.4 Theme (D-059, found by E-CR-034.1's axe check): `--destructive-foreground` in
    the 3 themes (`globals.css`); the Overdue badge uses it, not `text-white`; the a11y spec
    checks every card status badge in the 3 themes.
  - [x] CR-034.5 When to reverse (the user's choice, 2026-10-15; D-058, UIDD §4.10): one line in
    the Reverse dialog for every entry type (`entry-detail.tsx`): "Only for an entry that
    shouldn't count at all: a mistake, or a payment that bounced. A phone returned or refunded?
    Enter a return instead."
  - **Tests:**
    - [x] U-CR-034.1 the user's case: opening Oct bill ৳9,275.09 + EMI 3 × ৳2,666.50, a card payment
      ৳17,468 on 10 Oct and its reversal → Oct bill unpaid, status Due within 7 days ৳9,275.09
      (as on 14 Oct), Nov ৳2,666.50, balance ৳17,274.59; the invariant.
    - [x] U-CR-034.2 a payment reversed after its due date → that bill is Overdue.
    - [x] U-CR-034.3 a reversed purchase leaves its own bill (an older bill is not paid by it); a
      bill month with only that purchase disappears.
    - [x] U-CR-034.4 a reversed EMI purchase: no instalments, no plan, Remaining EMI down by its
      remaining.
    - [x] U-CR-034.5 cash-out, card fee, cashback, purchase return to card, opening item: each
      pair drops out; the balance equals the sum of all moves.
    - [x] U-CR-034.6 as on a date before the reversal (a later-month reversal): the original counts
      as entered; on or after it, the pair is gone.
    - [x] U-CR-034.7 the reports agree after a reversal: card page, Cards list, Home alert, monthly
      pack, investor report and card statement read the same bills; credit split unchanged.
    - [x] U-CR-034.8 `reversalLabel`: a reversal reads "Reversal of {original}", any other row its
      own name (the Cash book and every statement use it).
    - [x] Replace U-CR-002.1 (`tests/engine/cards.test.ts`, the D-021 behaviour); U-CR-002.2 stays.
    - [x] I-CR-034.1 on local Supabase: reverse a card payment through the action → the card's
      bills as U-CR-034.1; delete the reversal → the original back on its bills.
    - [x] E-CR-034.1 card page (360 + 1280): the greyed pair, the Reversed tag, "Reversal of Card
      payment", the Oct bill with Pay; a11y in 3 themes; update `card-page.spec` as needed.
    - [x] E-CR-034.2 every screen and file that shows a reversal reads "Reversal of …" (360 +
      1280): card statement for a period (screen, PDF, Excel, WhatsApp text), customer, supplier
      and person statements, Cash book, Journal; a reversed EMI purchase (no EMI label, no plan);
      a later-month reversal read for an earlier period; deleting the reversal brings the bill
      back. Screenshots of each to the user.
    - [x] E-CR-034.3 a11y: every card status badge (Overdue included) in the 3 themes (D-059).
    - [x] E-CR-034.4 the Reverse dialog shows the "when to reverse" line (a card payment, a sale,
      a capital in); a11y of the open dialog in the 3 themes.
  - **Acceptance:**
    - reversing a card entry puts its bills back exactly as before it was entered;
    - the balance, cash, profit and every other account are unchanged; the books balance;
    - every report shows the same card bills;
    - screenshots (360 + 1280) are approved.

- [x] **CR-035 Capital out paid by card ("Personal spend")** (2026-10-15)
  - **Source:** user feedback (2026-10-15, Arif · City Amex): Sumon's personal Flexi Buy EMI
    (21 × ৳2,206.90 left, Oct 2026 → Jun 2028) is paid by the business with the card's bill and
    is his drawing. The app had no entry for it.
  - **Decision:** D-060 · **Docs:** PRD §4.1, §4.2; SRS §4 (Money), §5, §6 (item 3); UIDD §3,
    §4.6, §4.8, §4.17, §5.
  - **The user's choices (2026-10-15):**
    - any person (partner or investor), any card;
    - a confirm sheet on Save;
    - labels name the other side;
    - a card-page link "Personal spend";
    - report groups "Taken out (cash)" / "Taken out (card)".
  - **An engine change** (exception to the v1.1 rule, user-approved): one SRS §5 row in `postEntry`
    (`src/lib/engine/post.ts`). There's no schema change, migration or script; stored rows have
    `source = null`, which reads as cash.
  - 👤 **After the deploy (the user, in the app):**
    - Opening correction · card balance · Arif · City Amex −2.06 (the workbook's Cartup 256 was
      really 254, plus the 0.06 rounding);
    - City Amex limit 128,500;
    - each statement date, Personal spend · Sumon · 2,206.90 (36/36 = 2,206.89).
  - [x] CR-035.1 Rule:
    - `src/lib/validation/money-entry.ts`: `capital_out` leaves `personEntry` and takes `paidBy` +
      `needCard`, with source default cash;
    - `src/lib/engine/post.ts`: capital_out → card +A if `source = card`, else cash −A, and
      capital −A (null = cash; not `paid()`, which throws on null).
  - [x] CR-035.2 Form (`money-form.tsx`, `prefill.ts`, `help-text.ts`):
    - Paid by Cash / Card + card picker on Capital out only;
    - `TAKES.capital_out` + `cardId`, `capital_out` in `CARD_SOURCE`;
    - the ⓘ "Capital out: Paid by" and the About text from UIDD §3.
  - [x] CR-035.3 Confirm (`form-body.tsx` optional `confirm` prop, a bottom Sheet like
    `DuplicateDialog`; lines from a pure helper in `src/lib/preview.ts` using `postEntry` +
    `billMonthOf`):
    - shown only for capital_out by card, on add and edit;
    - Back keeps the form.
  - [x] CR-035.4 Card page link (`src/components/shell/nav.ts` `quickActions`): ⋯ More → New entry
    → **Personal spend** after Card fee and Purchase. It goes to `money("capital_out")` with the
    card and `from`.
  - [x] CR-035.5 Labels (`src/components/journal/labels.ts` + card page, person page,
    `messages.ts`), so the screens, PDFs, Excel and text agree:
    - card statements: "Capital out · {person}";
    - person statements: "Capital out · {card}";
    - Journal: "Capital out · Card".
  - [x] CR-035.6 Investor / Partner report (`src/lib/investor-report.ts`):
    - "Taken out" splits into "Taken out (cash)" / "Taken out (card)";
    - by card = the entry moved a card in `books.posted`;
    - the view, PDF, text and Excel follow `groups`.
  - **Tests:**
    - [x] U-CR-035.1 `postEntry`:
      - capital out by card: card +A, capital −A, no cash or profit;
      - source null = cash;
      - its reversal negates;
      - the invariant (shared helper).
    - [x] U-CR-035.2 validation:
      - Card without a card → "Pick a card";
      - Cash clears the card;
      - no source → cash;
      - capital_in takes no source.
    - [x] U-CR-035.3 card bills:
      - billed in the bill of its date (on the statement day → that bill);
      - paid / remaining and Charges include it;
      - a reversal drops the pair (D-058);
      - Remaining EMI unchanged.
    - [x] U-CR-035.4 confirm lines:
      - the card's owner is the person;
      - the owner is someone else (the statement line);
      - an investor (cash basis line);
      - Cash → no confirm.
    - [x] U-CR-035.5 prefill (card → Card picked) and `quickActions` (Personal spend with the
      card id and `from`).
    - [x] U-CR-035.6 labels:
      - card context "Capital out · {person}";
      - person context "Capital out · {card}";
      - Journal "Capital out · Card";
      - a cash Capital out unchanged;
      - "Reversal of …" in each.
    - [x] U-CR-035.7 investor report:
      - cash and card groups;
      - each hidden when 0;
      - closing unchanged;
      - a reversal nets in its own group;
      - the text and Excel show both;
      - the cash basis at close is the month-end capital.
    - [x] I-CR-035.1 on local Supabase:
      - save by card → stored `source` / `card_id`;
      - edit Card → Cash clears `card_id`;
      - a stored null-source capital out still posts as cash;
      - reverse;
      - the duplicate check by card;
      - a closed month rejects it.
    - [x] E-CR-035.1 (360 + 1280) card page:
      - ⋯ More → Personal spend → the form opens with the card and Card picked → Save → the
        confirm;
      - Back keeps the form; Save → toast + Undo → back on the card;
      - the bill shows "Capital out · {person}";
      - a11y of the confirm in 3 themes.
    - [x] E-CR-035.2 (360 + 1280):
      - New → More… → Capital in / out → Out → Card → confirm → saved;
      - the person page shows "Capital out · {card}";
      - the Investor report shows "Taken out (card)" (screen, PDF, Excel);
      - a cash Capital out saves with no confirm.
  - **Final check (2026-10-16, the user's request):** every plan item is built. Nothing else in
    the app reads Capital out by type except the report groups and the labels; profit, close,
    cash book and pack cash flow are unchanged.
    - The "Available ≈" ⓘ now reads "approximate — excludes personal spending not entered as
      Personal spend" (help-text test checks UIDD).
    - Production data the user fixed: City Amex bill days set to 28th / 12th (D-022). The app
      had 27th, which would have put an instalment dated the 28th on the next bill.
  - **Existing tests updated** (the new rule, not a regression):
    - U-CR-025.1: Sumon's cash capital out reads "Taken out (cash)";
    - U-CR-018.1 / E-CR-018.1: the card's ⋯ More lists Personal spend;
    - the ⓘ count is 15 (help-text test).
    - The E2E readers for Share PDF, Download Excel and the WhatsApp text moved from
      `reversal.spec` to `tests/e2e/report-files.ts`, shared with `cr035.spec` (DRY, the third
      use).
  - **The engine change** is one line in `post.ts`, the D-060 exception, so the Definition of
    Done's "`git diff --stat src/lib/engine` is empty" doesn't hold for this CR.
  - **Acceptance:**
    - a Capital out paid by card adds to that card's bill and lowers only that person's capital;
      cash and profit are unchanged; the books balance;
    - existing Capital out rows read as before;
    - every statement and report names it the same way;
    - screenshots (360 + 1280) are approved.

- [x] **CR-036 One row style for what an entry does: preview, four confirms, Journal** (2026-10-16)
  - **Source:** user feedback (2026-10-16): the user liked how CR-035's confirm lays out the math
    and asked whether every save should confirm, or whether "What this will do" should look the
    same. Mock-ups were shown in chat and the user chose.
  - **Decision:** D-061 · **Docs:** UIDD §3 (notes box), §4.6, §4.10, §5.
  - **The user's conditions:**
    - cosmetic only: no change to `src/lib/engine/**`, `src/server/actions/**` or `src/db/**`, and
      every row comes from `postEntry`;
    - no redundant code: one pure row builder, one confirm builder and one row component, in their
      own files, reused everywhere.
  - [x] CR-036.1 `src/lib/effect-rows.ts` (new, pure):
    - `effectRows(entry, effects, ctx) → { label, sub?, value }[]`;
    - `label()` / `signed()` move here from `preview.ts`;
    - nets one row per account;
    - card-charge sub "{Mon} bill" (`billMonthOf`; EMI "{n} bills from {Mon}"); profit sub = its
      month;
    - one "no change" row for untouched Cash / Profit;
    - missing ctx → no sub.
  - [x] CR-036.2 `src/components/forms/effect-rows.tsx` (new): `<EffectRows label rows />`, the
    `<dl>` taken out of `ConfirmDialog`. Used by `NotesBox`, `ConfirmDialog` and the Journal.
  - [x] CR-036.3 Preview: `previewEntry` returns rows; the money, sale, purchase and return forms
    pass ctx (names, cards, bill dates); `previewLines` is removed.
  - [x] CR-036.4 `src/lib/confirms.ts` (new): `entryConfirm(entry, ctx)`.
    - `capitalOutConfirm` moves here.
    - Adds card cash-out, opening correction, and profit paid / reinvested above the profit owed.
    - Rows always come from `effectRows`.
    - The money form passes `entryConfirm`.
  - [x] CR-036.5 Journal:
    - `entry-overlay.tsx` finds the entry in `loadBooksData()` (the existing row → entry mapping,
      read-only) and passes its effects with cards, bill dates and partners;
    - `entry-detail.tsx`: "What it did"; Delete shows the rows negated; Reverse shows the negated
      rows following its Date / For month (D-058); History changes as rows.
  - **Tests:**
    - [x] U-CR-036.1 `effectRows`:
      - for every posting type, the per-account totals equal `postEntry`'s summed effects;
      - netting (sale + Received now);
      - the bill and EMI subs, the profit month;
      - the no-change row;
      - negation;
      - missing ctx.
    - [x] U-CR-036.2 `entryConfirm`:
      - each type's title, lead, rows and notes;
      - profit paid / reinvested at or below owed → null;
      - capital out by cash, and other types → null;
      - the CR-035 cases still hold.
    - [x] U existing `preview.test.ts` / `prefill` updated to rows (same figures).
    - [x] I the integration suite is unchanged and green (no action changed).
    - [x] E-CR-036.1 (360 + 1280):
      - a sale with Received now shows the netted rows;
      - a card purchase shows the bill sub;
      - the cash-out, opening-correction and profit-above-owed confirms (Back keeps the form;
        Save saves); profit at owed → no confirm.
    - [x] E-CR-036.2 (360 + 1280) Journal:
      - "What it did" rows;
      - Delete rows;
      - Reverse rows change with the Date (card "drops out of …");
      - History rows;
      - a11y in 3 themes.
    - [x] E existing `phase3.spec` preview assertions and `cr035.spec` updated and green.
  - **Built as planned, plus:**
    - E-CR-036.1 saves nothing for the opening correction and the profit confirm (Back, then
      Cancel). A full run starts with no partner people (only `phase5.spec` seeds them), and a
      saved opening correction can't be split without them, so the books (and every later spec)
      would fail. Two stand-in partners exist only while the form is open, when none are active.
      Profit at or below owed saving with no confirm: `phase5.spec` (500 of 500) and U-CR-036.2.
    - A sale with Received now netting its customer row: `sale.spec` (E-CR-036.1 cites it).
    - The confirm sheet's title keeps clear of the ✕ (`pr-12`; a long card name ran under it).
    - The entry sheet's tab panel is focusable (`tabIndex={0}`): with "What it did" it scrolls on
      desktop, and axe flagged a scrolling region keyboard users couldn't reach.
    - **Existing tests updated** (the new rows and confirms, not a regression): the preview
      assertions in `cr033`, `cr035`, `money`, `purchase`, `return`, `sale`, `phase3`; a cash-out
      Save now confirms in `money`, `cr033`, `phase4`; `journal.spec` 3.8.1 (the name is also in
      a row) and 3.8.2 (History is a row); `cr035.test` calls `entryConfirm` (same expected
      sheets). A shared E2E helper `effectValue(scope, label)` reads a row.
    - **Found, not changed (outside a cosmetic CR):** the opening-correction action saves when
      no partner is active, and the books then throw "Missing partners for the opening
      difference" on every page. Production has partners, so it can't happen there today. The
      user chose not to add a guard (final check, 2026-10-16).
  - **Final check (2026-10-16, the user's request):** every plan item is built; no other screen,
    report, PDF, Excel or text uses the changed code.
    - A reversed card charge's "What it did" said "{Mon} bill" while the card page had taken the
      pair off it (D-058). It now reads "was on the {Mon} bill · reversed", and deleting a
      reversal "back on the {Mon} bill" (the user's choice; `Posting.reversed`, `BillOf.mode`).
      U-CR-036.1 and E-CR-036.2 cover both.
    - UIDD §5 now lists the cash-out rows in the sheet's order and the profit note's "(৳Y)".
  - **Acceptance:**
    - every figure shown equals what the books post; the books balance;
    - `git diff --stat src/lib/engine src/server/actions src/db` is empty;
    - screenshots (360 + 1280) are approved.

- [x] **CR-037 Desktop sidebar: an icon on every link, no More** (2026-10-16)
  - **Source:** user feedback (2026-10-16): six sidebar links had no icon; More repeats what the
    desktop already shows (the six screens in the sidebar, "Closing: …" and Sign out in the top
    bar).
  - **Decision:** D-062 · **Docs:** UIDD §3; AI.md §10 (+ an AI-2.3 note).
  - **The user's condition:** the phone UI doesn't change (bottom bar, hidden links, More sheet).
  - [x] CR-037.1 `src/components/shell/nav-bar.tsx`:
    - an `href → icon` map for the six `moreLinks` (CalendarDays, BookOpenText, ChartColumn,
      Bookmark, Wrench, Settings), rendered before each sidebar label;
    - the More trigger gets `lg:hidden`; `lg:font-normal` goes from its active class;
    - `nav.ts`, `nav-sheets.tsx` and `top-bar.tsx` are unchanged.
  - **Tests:**
    - [x] E-CR-037.1 (1280) every sidebar link has an icon; the Main nav has no More button;
      Closing and the user menu are in the top bar.
    - [x] E-CR-037.2 (360) the bottom bar is Home · New · Stock · Accounts · More; the six
      screens aren't in it; More opens the same sheet (six links, Closing, Sign out).
    - [x] E existing specs that opened More on desktop:
      - `shell.spec` (More → Journal) uses the sidebar on desktop;
      - `helpers.signOutViaMore` becomes `signOut`, which uses the user menu on desktop
        (`auth.spec`).
    - [x] U / I: no change (no logic touched); the suites stay green.
  - **Acceptance:**
    - desktop: ten sidebar links, each with an icon, and no More; Closing and Sign out still
      reachable from the top bar;
    - the phone looks and works exactly as before;
    - screenshots (360 + 1280) are approved.

- [x] **CR-038 Stock: an average cost per model** (2026-10-18)
  - **Source:** user feedback (2026-10-18): nowhere showed a model's average cost across all
    suppliers (D-056's averages are per supplier, or sales).
  - **Decision:** D-063 · **Docs:** PRD §4.3; UIDD §4.7; SRS §10.
  - **Display only:** no change to `src/lib/engine/**`, the actions, the schema or any posting
    rule.
  - [x] CR-038.1 `src/lib/stock-view.ts`: `ModelStock` gains:
    - `avg` = `avgUnit(value, units)`;
    - `bought` = Σ lot qty;
    - `boughtAvg` = `avgUnit(Σ unit cost × qty, bought)`, over the lots shown.
  - [x] CR-038.2 `src/components/stock/stock-list.tsx`:
    - **Phone:** the name with the muted line under it ("12 units · avg ৳X" / "12 left of 40 ·
      avg ৳X"); the value on the right.
    - **Desktop:** a header row (Model · Left · Avg cost · Value) and the matching columns.
    - **Both:** no horizontal scroll at 360px; `min-h-11` tap target.
  - [x] CR-038.3 `src/lib/export.ts` `stockSheet`: a Model avg cost column after Unit cost (each
    lot row = its group's `avg`); the Total row leaves it blank.
  - **Tests:**
    - [x] U-CR-038.1 the In stock avg = value ÷ units, half-up to whole taka (two costs; a ৳0.50
      tie).
    - [x] U-CR-038.2 All lots: `bought` / `boughtAvg` count sold-out lots; sales, returns and
      to-seller moves don't change them.
    - [x] U-CR-038.3 left ≤ 0 gives `avg` null.
    - [x] U-CR-038.4 a search narrows both averages.
    - [x] I-CR-038.1 (in `tests/integration/export.test.ts`, as the Stock sheet has no unit test)
      each lot row's Model avg cost = its model's avg cost of the units left; the Total row is blank
      there. No new server code.
    - [x] E-CR-038.1 (360) In stock "N units · avg ৳X"; All lots "N left of M · avg ৳Y"; no
      horizontal scroll.
    - [x] E-CR-038.2 (1280) the header row Model · Left · Avg cost · Value; the cells read `N` /
      `৳X`, then `N of M` / `৳Y` in All lots; the phone line is hidden.
  - **Acceptance:**
    - the In stock avg × units is within ৳1 a unit of the value;
    - the screen's In stock avg = the Excel Model avg cost for the same model;
    - `git diff --stat src/lib/engine src/server/actions src/db` is empty;
    - screenshots (360 + 1280) are approved.

  - **Results (2026-10-18):** typecheck and lint clean; unit 685/685; integration 142/142;
    `cr038.spec` E-CR-038.1 (360) and E-CR-038.2 (1280) passed; the touched screens' specs (a11y,
    back-close, export, phase4, ui-dark, cr038) 107 passed, 8 skipped (the other viewport).
    Done: the user approved the screenshots (360 + 1280, 2026-10-18) and asked to tick it. Also
    added to PRD §4.3 (the Stock view's row) after a final check.

- [x] **CR-039 Books balance: what we have, what we owe, net worth** (2026-10-22)
  - **Source:** user feedback (2026-10-22): no place shows the total business value; the first
    "Total" is net worth but isn't called that.
  - **Decision:** D-064 · **Docs:** UIDD §3, §4.17 (pack position); PRD §4.3.
  - **Display only:** no change to `src/lib/engine/**`, the actions, the schema or any posting
    rule.
  - [x] CR-039.1 `src/lib/dashboard.ts` `breakdown()` returns `{ haveLines, businessAssets,
    oweLines, oweTotal, equityLines, netAssets, equity, difference }`:
    - Card balances and We owe suppliers are negative in `oweLines`;
    - `businessAssets` = Σ `haveLines`; `netAssets` = `businessAssets` + `oweTotal`.
  - [x] CR-039.2 `src/components/shell/balance-chip.tsx`:
    - the Net worth block with the ✓ Balanced / ✗ Off by ৳X badge on top;
    - What we have → Business assets; What we owe → Total we owe → Net worth; Whose it is →
      Total;
    - the D-064 footer (balanced / off).
  - [x] CR-039.3 The pack position uses the same rows and labels: `pack-view.tsx`, `src/pdf/pack.ts`,
    `report-sheets.ts` (Excel), `report-text.ts` (WhatsApp); and the export's Cash sheet
    (`src/lib/export.ts`).
  - **Tests:**
    - [x] U-CR-039.1 Σ have = businessAssets; businessAssets + oweTotal = netAssets = invariant
      netAssets; the card line is negative; a supplier advance (negative dues) still adds up.
    - [x] U-CR-039.2 the pack text, Excel and PDF builders list Business assets, Total we owe and
      Net worth (update the existing `monthly-pack` / `report-outputs` tests).
    - [x] I-CR-039.1 `export.test` Cash sheet: the new rows and Net worth = equity.
    - [x] E-CR-039.1 (360 + 1280) the sheet shows Net worth with ✓ Balanced on top, What we have /
      Business assets / What we owe / Total we owe / Net worth / Whose it is / Total, and the
      footer; axe in the 3 themes.
  - **Acceptance:**
    - Net worth on top = the What we owe section's Net worth = Whose it is's Total;
    - the pack's position (screen, PDF, Excel, text) reads the same rows as the sheet;
    - screenshots (360 + 1280) are approved.

  - **Results (2026-10-22):** typecheck and lint clean; unit 688/688; integration 142/142;
    `cr039.spec` E-CR-039.1 passed (360 + 1280); the sheet's axe test (`a11y.spec`) passed in the 3
    themes on both viewports, after the Net worth label moved off muted grey (Light contrast). Full
    E2E: 306 passed, 15 skipped, 4 failed: `smoke.spec` ×2 (the old "SMS" short-name failure) and
    the new sheet axe test in Light ×2 (fixed; rerun green). `git diff --stat src/lib/engine
    src/server/actions src/db` is empty. One shared `positionSections()` (`dashboard.ts`) feeds the
    chip, the pack (screen, PDF, Excel, text) and the export's Cash sheet (`positionRows()`).
    Done: the user approved the screenshots (360 + 1280, 2026-10-22). Ships with the next deploy
    (no migration, no script).

- [x] **CR-040 Chart foundations: library, colours, period, the Charts page shell** (2026-10-22)
  - **Source:** user feedback (2026-10-22): graphical reports, mobile first, not cluttered.
  - **Decision:** D-064 · **Docs:** UIDD §2, §4.17 (Charts), §6; SRS §1, §3, §12.
  - [x] CR-040.1 `npx shadcn add chart` (Recharts) + `react-is` pinned to the React version.
    - Charts use `color: "var(--chart-n)"`, never the `.dark` theme keys (the app themes with
      `data-theme`).
    - Only `src/components/charts/**` imports Recharts.
  - [x] CR-040.2 `src/app/globals.css`: replace the greyscale `--chart-1..5` and add `--chart-6`
    (+ `--color-chart-6`) in all 3 themes:
    - Light `#2a78d6 #d4541f #14895f #6250d6 #b07800 #c94f7c`;
    - Dark `#3987e5 #d95926 #199e70 #9085e9 #c98500 #d55181`;
    - Night Owl `#82aaff #f78c6c #7fdbca #c792ea #addb67 #ff6b9d`.
  - [x] CR-040.3 `src/lib/money.ts`: `compact()` and `avgTaka()` (SRS §3).
  - [x] CR-040.4 `src/lib/charts/period.ts`: `chartPeriod(params, today, firstDate)` → key, from,
    to, view (day when ≤ 62 days), buckets, bucket ends (capped at today) and the previous
    window (null unless it lies wholly on or after the opening; D-064 clarified 2026-10-23). It
    reuses `parseRange` and `dates.ts`.
  - [x] CR-040.5 `src/lib/charts/kinds.ts`: `entryKinds(entries)` (entry id → sale, customer
    return, purchase, purchase return or money type) and `standing(entries, kind)` (not a
    reversal, not reversed).
  - [x] CR-040.6 `src/components/shell/segmented-nav.tsx`: the 3rd copy of the segmented links.
    `account-tabs.tsx` and the customer Statement / Bills toggle move onto it; their look stays
    the same.
  - [x] CR-040.7 `src/components/charts/`:
    - `period-chips.tsx` (Custom → the Report sheet with View on screen; the range chip);
    - `chart-card.tsx` (one link: title, headline, delta, an aria-hidden mini chart);
    - `charts.tsx` (Bars, SignedStack, LineSeries, StepTrend, HBars; animations off; `min-w-0` and
      fixed heights);
    - `readout.tsx` (a phone tap → the fixed line, `aria-live`; desktop hover → the tooltip, by
      `@media (hover)`);
    - `chart-table.tsx` (a list on a phone, `row-link.ts` table on desktop).
  - [x] CR-040.8 `/reports/charts` (tabs + period row, an empty state per tab) and the first
    Reports row "Charts · Profit, expenses, dues and more over time".
  - **Tests:**
    - [x] U-CR-040.1 `compact`: each unit's threshold, one decimal under 10, moving up a unit (৳99.96 L
      → ৳1 Cr), negatives, 0.
    - [x] U-CR-040.2 `avgTaka`: a .5 tie, a negative total.
    - [x] U-CR-040.3 `chartPeriod`: 6M, 12M, This year, custom; clipped at the opening and today;
      day view at ≤ 62 days; the previous window.
    - [x] U-CR-040.4 `entryKinds` / `standing` with a reversal and a reversed entry.
    - [x] E-CR-040.1 (360 + 1280) Reports' first row opens Charts; the tabs and chips change the
      URL and are `aria-current`; Custom opens the Report sheet; no horizontal scroll; 44px taps;
      axe in the 3 themes.
    - [x] E existing Accounts tabs and customer Statement / Bills specs stay green.
  - **Acceptance:**
    - `next build`: Home and the other pages don't load the Recharts chunk;
    - `git diff --stat src/lib/engine src/server/actions src/db` is empty;
    - screenshots (360 + 1280) are approved.
  - **Results (2026-10-24):** typecheck and lint clean; unit 697/697; integration 142/142;
    `cr040.spec` E-CR-040.1 passed at 360 and 1280; the a11y audit (now with `/reports/charts` and
    its Report sheet) passed in the 3 themes. Full E2E: 310 passed, 15 skipped, 2 failed
    (`smoke.spec` ×2, the old "SMS" short-name failure); the Accounts tabs, Statement / Bills and
    Reports specs are green. `git diff --stat src/lib/engine src/server/actions src/db` is empty.
    - recharts 3.8.0 (from `shadcn add chart`), `react-is` pinned 19.2.8; an ESLint
      `no-restricted-imports` rule keeps `recharts` and `ui/chart` inside `src/components/charts`.
    - Bundle: no JS chunk of the build contains Recharts (nothing imports `charts.tsx` until
      CR-041); only the global CSS holds `ui/chart.tsx`'s few Tailwind rules.
    - The user's answers (2026-10-23, D-064 clarified): 6M = this month + the 5 before; "vs prev"
      only when the whole earlier window is on or after the opening; an empty-state box per tab,
      and all CR-040.7 pieces built now (charts, readout and table are exercised from CR-041).
    - Done: the user approved the screenshots (360 + 1280, 2026-10-24) and asked to tick and
      commit it. Ships with the next deploy (no migration, no script).

- [x] **CR-041 Charts · Profit tab: net profit, sales & margin, expenses** (2026-10-22)
  - **Source:** user feedback (2026-10-22): profit by month or date range; expenses.
  - **Decision:** D-064 · **Docs:** UIDD §4.2, §4.17 (Charts).
  - **Clarified 2026-10-24 (the user's answers, D-064):**
    - the day view shows **Sales profit** by day, and Expenses still shows monthly bars;
    - Net profit and Expenses count whole months (a part month = the whole Months row, with a
      note); Sales & margin uses the exact dates.
  - [x] CR-041.1 `src/lib/charts/profit.ts`:
    - `netProfitSeries` (from `monthList`, as `/months`);
    - `salesProfitByDay` (profit effects sale + customer_return by date);
    - `salesSeries` (sales, cost, gross, `margin()` per bucket);
    - `profitsFor(months, snapshots, posted, today)`: a closed month's snapshot, else
      `monthProfit`. This is the 3rd copy, so the pack (`monthly-pack.ts` `profitOf`) and the
      month page move onto it;
    - `expenseSeries` and `categoryShares` (`EXPENSE_LABELS`; Card fees apart).
  - [x] CR-041.2 `src/server/months.ts` `loadSnapshots(months)` (one query); `src/server/charts.ts`
    loads only what the Profit tab needs.
  - [x] CR-041.3 The three cards and their detail pages (`/reports/charts/[chart]`); the readout's
    "See breakdown" shows `breakdownLines`; the day view's note.
  - [x] CR-041.4 Home's Profit tile → `/reports/charts?tab=profit`.
  - **Tests:**
    - [x] U-CR-041.1 net profit per month = the Months list rows (a closed month = Σ allocations).
    - [x] U-CR-041.2 Σ day sales profit = `salesReport().netProfit` for the range; a whole month =
      components sale + customer_return.
    - [x] U-CR-041.3 each month's categories + Card fees = −(expense + fee); a reversed expense nets
      in its own month.
    - [x] I-CR-041.1 a month's sales and margin = `loadSales(month)`; a closed month's expenses = its
      snapshot.
    - [x] E-CR-041.1 (360) tapping a bar shows the readout = the Months row; "See breakdown" lines
      = the month page. (1280) hovering shows the tooltip; the table is beside the chart.
  - **Acceptance:** each figure equals its screen (Months, month page, Sales report); screenshots
    (360 + 1280) are approved.
  - **Results (2026-10-24):**
    - Typecheck and lint are clean. Unit tests 703/703; integration 143/143.
    - `cr041.spec` E-CR-041.1 passed at 360 and 1280; cr040 + cr041 + a11y (now with the Net
      profit and Expenses detail pages, 3 themes) 85/85.
    - Full E2E: 312 passed, 15 skipped, 2 failed (`smoke.spec` ×2, the old "SMS" short-name
      failure). The Home spec now expects the Profit tile to open `/reports/charts?tab=profit`.
    - `git diff --stat src/lib/engine src/server/actions src/db` is empty.
    - Also: `loadSalesLines` is split out of `loadSales`, which behaves the same; the pack reads
      its snapshots through `loadSnapshots`; the margin line dots every point, so a lone month
      shows; bars are capped at 48 px wide.
    - Done: the user approved the screenshots (360 + 1280, 2026-10-24) and asked to commit it.
      Ships with the next deploy (no migration, no script).

- [x] **CR-042 Charts · Money tab: business value, cash, card debt, profit shares** (2026-10-22)
  - **Source:** user feedback (2026-10-22): the business value; the user's picks of 2026-10-22.
  - **Decision:** D-064 · **Docs:** UIDD §4.17 (Charts).
  - **Clarified 2026-10-24 (the user's answers, D-064):** Business value and Card debt by day in
    the day view; Cash's list = per bucket + Below zero; Profit shares count whole months; a
    position's delta is against the window's first day.
  - [x] CR-042.1 `src/lib/charts/position.ts`:
    - `positionAt(posted, ends)`: cash, stock, customer dues, card balances, supplier dues,
      business assets and net worth at each end, in one sorted pass (the same sums as
      `balance()`);
    - `dailyCash(posted, from, to)`: from `cashBook()`, carried over days without moves;
    - `profitShares(allocations, closed, months)`.
  - [x] CR-042.2 The four cards and detail pages; Card debt's Bills due next from `cardAlerts`.
  - **Tests:**
    - [x] U-CR-042.1 `positionAt` = `computeBooks(data, end)` at every month end, on a fixture with
      an opening, a reversal, a card EMI and a supplier advance.
    - [x] U-CR-042.2 the last `dailyCash` point = the Cash book closing; a negative day is marked.
    - [x] U-CR-042.3 profit shares Σ per closed month = its `MonthRow.profit`; a loss is negative;
      an open month is "not allocated yet".
    - [x] I-CR-042.1 today's point = `breakdown(books)`, and the invariant holds.
    - [x] E-CR-042.1 (360 + 1280) Business value's table today = the Books balance sheet; a
      negative cash day is marked.
  - **Acceptance:** today's figures equal the Books balance sheet; screenshots (360 + 1280) are
    approved.
  - **Results (2026-10-24):**
    - Typecheck and lint are clean. Unit tests 706/706; `charts.test.ts` 2/2.
    - E2E (Night Owl, 360 + 1280): `cr040`, `cr041`, `cr042` and `home` 11/11; the E-CR-042 axe
      test passed.
    - `git diff --stat src/lib/engine src/server/actions src/db` is empty.
    - Also:
      - `cr040.spec`'s "tab without charts yet" now uses Customers;
      - "‹ Charts" on a Money detail page keeps `tab=money`;
      - Home's `daysLeft` moved to `dashboard.ts`, so Bills due next reads the same as Home;
      - mini line charts have no dots;
      - `Bars` takes `stacked` (Profit shares).
    - The local E2E books have cash below 0 since 05 Aug, so Below zero runs long there. The user
      kept one row per day.
    - Done: the user approved the screenshots (360 + 1280, 2026-10-24). Ships with the next
      deploy (no migration, no script).

---

## Status history (the "Now" block until 2026-10-24)

- **Now:** **v1.1 is deployed** (2026-10-12): CR-015 … CR-029 are live on
  `https://business.example.com`.
  - All 6 migrations ran and the card rename was applied (CR-016 done).
  - A read-only check of production after the deploy passed:
    - the books balance (difference 0);
    - the opening import of 2026-10-09 is untouched: 38 money entries + 39 stock lots, all dated
      1 Oct, opening difference −19,380.72 as accepted;
    - 23 cards, each with a type and no type word left in its name;
    - one business profile with its logo.
  - No sales or payments exist yet, so INV-1 and MR-1 come next.
  - Phone checks passed.
- **CR-032** (on `dev`, 2026-10-13): Jamal · EBL Visa's flat opening is replaced by 11 rows (the
  billed amount + 10 EMI plans), using the card-opening fix script.
  - The script and tests are done and green (unit 610/610, integration 133/133).
  - **Done:** applied on production after a matching dry run. The final check is clean, the user
    approved, and it is committed (`f3984bd`).
- **CR-033** (done on `dev`, 2026-10-13): Cash-out Fee %, Cards search grouped by owner, Avg
  unit price in By model (D-056). Ships with the next deploy.
- **CR-034** (done on `dev`, 2026-10-15; D-058 + D-059): a card reversal cancels its original
  on the bills; every statement, PDF, Excel, text and the Cash book read "Reversal of …"; the
  Overdue badge's contrast fixed at the theme (`--destructive-foreground`).
  - All subtasks and tests done: typecheck, lint, unit 638/638, integration 136/136; full E2E 276
    passed, 11 skipped, 2 failed (`smoke.spec` ×2, the old "SMS" short-name failure); the CR-034
    specs ×3 (`--repeat-each=3`): 52/52 and 19/19 (a11y, 3 themes).
  - CR-034.5 (2026-10-15): the Reverse dialog's "when to reverse" line, on every entry type.
  - Screenshots (360 + 1280) approved by the user (2026-10-15). Ships with the next deploy (no
    migration, no script).
- **CR-035** (done on `dev`, 2026-10-16; D-060): Capital out paid by card ("Personal spend").
  - Built: the rule, the form's Paid by, the confirm sheet, the card's ⋯ Personal spend, the
    labels and the report groups.
  - Results: typecheck and lint clean; unit 667/667; integration 142/142; `cr035.spec` 5/5 (360 +
    1280).
  - The confirm sheet was redesigned at the user's request (2026-10-16): one sentence, label ·
    amount rows and small notes (UIDD §5, D-060). The user reviewed it live on local Supabase.
  - After the redesign: unit 667/667; integration 142/142; full E2E 286 passed, 11 skipped and
    2 failed (`smoke.spec` ×2, the old "SMS" short-name failure). An earlier run's flaky
    `reversal.spec` E-CR-034.2 passed here.
  - Done: the user approved (2026-10-16) and asked to tick and commit it.
  - Ships with the next deploy (no migration, no script). After the deploy, the 👤 steps are in
    the task.
- **CR-036** (done on `dev`, 2026-10-16; D-061): one row style for what an entry does (the
  forms' preview, the cash-out / opening-correction / profit-above-owed confirms, the Journal's
  "What it did", Delete, Reverse, History). Cosmetic only.
  - Results: typecheck and lint clean; unit 680/680; integration 142/142; full E2E 292 passed,
    11 skipped, 6 failed. The 6: `smoke.spec` ×2 (the old "SMS" short-name failure) and
    `journal.spec` 3.8.1 / 3.8.2 ×2, whose assertions met the new rows; updated, now 18/18.
  - Final check (the user's request): a reversed card charge reads "was on the {Mon} bill ·
    reversed"; deleting a reversal "back on the {Mon} bill". After it: unit 681/681, integration
    142/142; the CR-036, Journal, reversal and entry-sheet specs 34 passed (1 desktop-only skip);
    the form specs (money, purchase, sale, return, phase3, phase4, cr033, cr035) 41/41.
  - Done: the user approved the screenshots (360 + 1280, 2026-10-16). Ships with the next deploy
    (no migration, no script); the full E2E run is due before that deploy (D-047).
- **CR-037** (done on `dev`, 2026-10-16; D-062): the desktop sidebar has an icon on every link
  and no More; the phone is unchanged.
  - Results: typecheck and lint clean; unit 681/681; integration 142/142; full E2E 298 passed,
    13 skipped, 2 failed (`smoke.spec` ×2, the old "SMS" short-name failure). E-CR-037.1 passed
    at 1280 and E-CR-037.2 at 360.
  - Done: the user approved the screenshots (360 + 1280, 2026-10-16). Ships with the next deploy
    (no migration, no script).
- **CR-038** (done on `dev`, 2026-10-18; D-063): an average cost per model on the Stock page (In
  stock: of the units left; All lots: of everything bought, with "left of bought") and in the Excel
  Stock sheet. Display only.
  - Results: typecheck and lint clean; unit 685/685; integration 142/142; the touched screens'
    E2E 107 passed (8 skipped, the other viewport).
  - Done: the user approved the screenshots (360 + 1280, 2026-10-18). Ships with the next deploy
    (no migration, no script). The Excel Stock sheet's Value column moves from G to H.
- **CR-039** (done on `dev`, 2026-10-22; D-064): the Books balance sheet with Net worth on top, What
  we have → Business assets, What we owe → Total we owe → Net worth, Whose it is → Total; the pack's
  position and the export's Cash sheet use the same rows. Display only.
  - All subtasks and tests are green (unit 688/688, integration 142/142, the CR-039 E2E and axe
    tests); full E2E only the old `smoke.spec` ×2.
  - Done: the user approved the screenshots (360 + 1280, 2026-10-22). Ships with the next deploy
    (no migration, no script). Next: CR-040.
- **CR-040** (done on `dev`, 2026-10-24; D-064): the Charts page shell (tabs, period row, Custom
  → the Report sheet), the chart colours, `compact`/`avgTaka`, `chartPeriod`, `entryKinds`, the
  shared `SegmentedNav` and the chart pieces. All tests green (full E2E only the old `smoke.spec`
  ×2). Done: the user approved the screenshots (360 + 1280, 2026-10-24). Ships with the next
  deploy (no migration, no script). Next: CR-041.
- **CR-041** (done on `dev`, 2026-10-24; D-064 clarified 2026-10-24): the Profit tab's three
  cards (Net profit or, by day, Sales profit · Sales & margin · Expenses), their detail pages at
  `/reports/charts/[chart]`, "See breakdown" in the readout, and Home's Profit tile → the Profit
  tab.
  - All subtasks and tests are green (full E2E only the old `smoke.spec` ×2).
  - Done: the user approved the screenshots (360 + 1280, 2026-10-24). Ships with the next deploy
    (no migration, no script). Next: CR-042.
- **CR-042** (done on `dev`, 2026-10-24; D-064 clarified 2026-10-24): the Money tab's four cards
  (Business value, Cash, Card debt, Profit shares) and their detail pages. All tests green
  locally (D-065 gate). Done: the user approved the screenshots (360 + 1280, 2026-10-24); Below
  zero stays one row per day. Ships with the next deploy (no migration, no script). Next: CR-043.
- **D-065** (2026-10-24): per-task local tests (one theme), the full suites on GitHub CI on every
  push to `dev` (3 E2E shards), and a green full E2E run before a deploy.
  - Local check: typecheck, lint, unit 703/703; full E2E 320 passed, 15 skipped, 0 failed (the
    `smoke.spec` short-name failure is fixed).
  - A task's own E2E in one theme took 13 s and its a11y test 20 s.
  - The first CI run is due on the user's commit and push.
- **Next:**
  - 👤 the second partner sets up the fingerprint on their phone; then the card details are typed
    in (closes CR-026);
  - the Ops nightly backup;
  - the go-live checks 7.2–7.5;
  - a new CR for the CR-031 follow-up: card numbers unique across all cards (+ the open questions
    under CR-031).
- **Spec:** `docs/v1.1-plan.md` holds the approved details for every CR below (the user's decisions,
  the UI simplicity rules, edge cases from the review, WhatsApp message samples, what the user must
  still provide). Read the CR's section there before starting it; each CR still writes its D entry
  and doc edits first (the D numbers below are reserved, in order).
- **Build order:** CR-015 → **CR-016 (all v1.1 schema changes in ONE migration)** → CR-017 … CR-025
  → **CR-026 card details + fingerprint last**. CR-028 (lost same-page taps) is done (D-048). Each CR is committed once green locally; the
  deploy (and the phone check) happens once the whole v1.1 phase is complete (user, 2026-10-10).
  The Ops backup can be set up any time (best first).
- **Every CR:** no change to `src/lib/engine/**` or any posting rule; new figures tie out to
  `computeBooks` in tests; unit + integration + E2E (360 + 1280) green; 360/1280 screenshots shown
  to the user before ticking; ask the user rather than assume (they answer multi-choice questions).
  **Test scope (D-065, amends D-047):**
  - **Locally:** typecheck, lint, unit, the CR's own integration file(s), and the E2E specs of the
    CR and the screens it touches plus its a11y tests (`--grep <id>`). E2E runs in one theme
    (`E2E_THEMES=night_owl`) at 360 + 1280.
  - **On every push to `dev`:** CI runs the full suites (all themes).
  - **Before a deploy:** a green full E2E run (CI or local).
- Live: `https://business.example.com` (partners' VPS). Releases: `git pull && bash
  scripts/deploy.sh` in `~/Mobile-Business-Lite` (deploy/README.md).
- **Production DB:** `.env.local` points at production. Tests and experiments use local Supabase
  (127.0.0.1:54322). The opening is imported (2026-10-09) and is never re-imported. The only planned
  production read is CR-016's read-only list of card names + owners (no amounts), for the rename
  table the user approves.
- **Business (seed for CR-016):** Demo Business Shop · 01700000001, 01800000001 · logo: the user's
  file `C:\Users\arif\Downloads\Demo Business Shop Logo.png` (resize to 256 px; white
  background, so it sits on a white tile in the dark themes).
- **Blocked on:** —
