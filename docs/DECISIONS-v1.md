# Decisions log: v1 archive (D-001 … D-033)

The v1 build's decisions (2026-10-07 … 2026-10-09), moved here word for word by D-066. The index of
every decision is at the top of `docs/DECISIONS.md`; later entries there may supersede these.

---

## D-001 — Testing: unit + integration + E2E, run in CI (2026-10-07)
- **Source:** user feedback (task breakdown review).
- **Decision:**
  - **Unit:** Vitest for money, dates, engine, posting rules, guards and Zod.
  - **Integration:** Vitest calling server actions against a local Supabase (Docker,
    `supabase start`).
  - **E2E:** Playwright at 360px and 1280px, capped at about 5 golden flows.
  - **CI:** GitHub Actions runs all of them on PRs to `dev`/`main`.
  - A final manual phone pass stays.
- **Docs changed:** SRS §1, §12, §13 step 1, §14.
- **Tasks:** 1.2, 1.7, and every phase's I/E tests.

## D-002 — Concrete numbers for story S6 (2026-10-07)
- **Source:** review. S6 had no numbers, so it couldn't be tested.
- **Decision:** EBL Visa (statement 5th, due 20th).
  - Entries: 10 Sep card purchase 40,000; 25 Sep card payment 40,000; 28 Sep card purchase
    25,000.
  - Expected as of 30 Sep:
    - card balance 25,000;
    - Oct bill 65,000, paid 40,000, remaining 25,000;
    - next due 20 Oct · 25,000;
    - cash −40,000 (the payment only);
    - stock +65,000;
    - books balance ✓.
- **Docs changed:** PRD §6 S6.
- **Tasks:** 2.6.

## D-003 — A reversal can't be reversed (2026-10-07)
- **Source:** review.
- **Decision:** reversing a reversal is blocked. If a reversal was a mistake, delete it (open
  month) or enter the original again.
- **Docs changed:** PRD §4.5, SRS §8.
- **Tasks:** 2.9, 3.8.

## D-004 — Editing a sale keeps its lots (2026-10-07)
- **Source:** review.
- **Decision:** on edit, each existing line keeps its lot (treated as a manual choice). Only new
  lines, or lines whose model changes, are filled oldest-first. Costs don't shift silently.
- **Docs changed:** SRS §4 (lot picking), §8.
- **Tasks:** 3.5.

## D-005 — No future for_month (2026-10-07)
- **Source:** review.
- **Decision:** `for_month` ≤ the month of the entry's date. Prepaid costs are booked in the month
  they're paid.
- **Docs changed:** PRD §4.4, SRS §3.
- **Tasks:** 2.9, 3.7.

## D-006 — Undo after a sale with "Received now" removes both entries (2026-10-07)
- **Source:** review.
- **Decision:** one save, one Undo. The bill and the payment are still two separate entries in the
  Journal.
- **Docs changed:** UIDD §1.4, §4.4.
- **Tasks:** 3.5.

## D-007 — No "write off as discount?" toast (2026-10-07)
- **Source:** user feedback.
- **Decision:** the toast after a customer payment is removed. Discounts are entered from New →
  More… → Customer discount.
- **Docs changed:** UIDD §4.6.
- **Tasks:** 3.7.

## D-008 — An entry's type is fixed on edit (2026-10-07)
- **Source:** review.
- **Decision:** the type can't change on edit; delete the entry and enter the right type.
- **Docs changed:** SRS §8.
- **Tasks:** 3.8.

## D-009 — Walk-in limits (2026-10-07)
- **Source:** review.
- **Decision:** Walk-in can't be used for a purchase against a customer's due, a profit share or
  cash given.
- **Docs changed:** PRD §4.1, SRS §4 (customers).
- **Tasks:** 2.9, 3.4, 3.7.

## D-010 — Delete and Undo check `updated_at` (2026-10-07)
- **Source:** review.
- **Decision:** delete and Undo send the `updated_at` the client saw, the same as edit.
- **Docs changed:** SRS §3, UIDD §5.
- **Tasks:** 3.1, 3.8.

## D-011 — Refund target for opening-correction lots (2026-10-07)
- **Source:** review.
- **Decision:** an opening-correction lot works like an opening lot. A purchase return must pick
  the refund target, with no default.
- **Docs changed:** SRS §4 (purchase returns), UIDD §4.5.
- **Tasks:** 3.6.

## D-012 — Workflow and Claude Code setup (2026-10-07)
- **Source:** user feedback.
- **Decision:**
  - `docs/TASKS.md` is the task list and `docs/DECISIONS.md` is this log.
  - Feedback or scope changes become a CR task; a rule change becomes a D entry first.
  - A misalignment stops the work and is reported to the user.
  - Lean `CLAUDE.md`; workflows live in `.claude/skills/` (`/next-task`, `/change-request`);
    domain rules live in path-scoped `.claude/rules/`.
- **Docs changed:** CLAUDE.md.
- **Tasks:** 0.3.

## D-013 — Principles and file size (2026-10-07)
- **Source:** user feedback.
- **Decision:**
  - Follow KISS, DRY (extract at the 3rd repeat) and YAGNI (nothing beyond PRD §4).
  - Source files aim for ≤ 500 lines, with a hard cap of 1000 enforced by ESLint `max-lines`.
    Generated files are exempt.
- **Docs changed:** CLAUDE.md, SRS §12.
- **Tasks:** 1.1, Definition of Done.

## D-014 — Real workbooks stay in the private repo (2026-10-07)
- **Source:** user answer. The repo is private.
- **Decision:** the real workbooks stay in git, and CI runs the card fixture test. Fixture
  tests compare totals and never print the real rows. Integration and E2E tests use synthetic
  data only.
- **Docs changed:** SRS §14, CLAUDE.md, `.claude/rules/money-engine.md`.
- **Tasks:** 2.6, 6.3.

## D-015 — Money display: decimals only when non-zero (2026-10-07)
- **Source:** misalignment found while writing TASKS.md. SRS §3 said `৳75,12,345.00`; UIDD §2 said
  `৳75,12,345`.
- **Decision:** the UIDD wins. `format()` shows ৳75,12,345 and ৳17,444.80. The Excel export writes
  plain numbers.
- **Docs changed:** SRS §3.
- **Tasks:** 2.1.

## D-016 — ExcelJS is the Excel library (2026-10-07)
- **Source:** misalignment found while writing TASKS.md. SRS §1 left "SheetJS or ExcelJS" open,
  and the card fixture needs it in Phase 2.
- **Decision:** ExcelJS for the fixture, template, import and export. The SheetJS npm package is
  outdated and has security advisories.
- **Docs changed:** SRS §1, CLAUDE.md.
- **Tasks:** 2.6, 6.1, 6.3, 6.4.

## D-017 — The last export time comes from the audit log (2026-10-07)
- **Source:** misalignment found while writing TASKS.md. UIDD §4.12 shows the last export time,
  but no table stored it.
- **Decision:** each export writes an `audit_log` row (`action = export`, no `row_id`). The Export
  page shows the latest one (time and who).
- **Docs changed:** SRS §4 (audit), §10; UIDD §4.12.
- **Tasks:** 1.3, 6.4.

## D-018 — The cash warning uses the first date cash went negative (2026-10-07)
- **Source:** misalignment found while writing TASKS.md. SRS §5 said "on any date"; UIDD §4.2 read
  like today's balance.
- **Decision:** the engine returns the first date running cash went below 0. The dashboard shows
  "Cash went negative on <date> — an entry is probably missing".
- **Docs changed:** SRS §5, UIDD §4.2.
- **Tasks:** 2.8, 4.1.

## D-019 — Resume point and token-efficient task workflow (2026-10-07)
- **Source:** user feedback.
- **Decision:**
  - A **Now** block at the top of `docs/TASKS.md` replaces a separate progress file.
    `/next-task` updates it at the end of each session.
  - **Flow mode** (normal task work): read only the task's section and its cited doc sections.
    Run only the task's tests, with compact output; the full suite runs once before ticking.
  - **Investigation mode** (something looks off, a non-obvious failure, a review, a change
    request): read the full related docs, DECISIONS.md and the related code before concluding.
- **Docs changed:** TASKS.md, `.claude/skills/next-task`, `.claude/skills/change-request`.
- **Tasks:** —

## D-020 — About texts for every Setup form and the card bill-dates form (2026-10-07)
- **Source:** misalignment found in 1.6. UIDD §3 gave a Setup About text only for Card ("One
  line per list, e.g. Card: …"), but every form needs one and a test enforces it.
- **Decision:** the UIDD §3 table lists one row per Setup form (Person, Card, Customer, Supplier,
  Model) and a row for the card bill-dates edit modal. The texts are in the table.
- **Docs changed:** UIDD §3.
- **Tasks:** CR-001; 3.2, 3.3 (U3.3.1), 4.4.

## D-021 — Card reversals bill by sign; next due skips overdue bills (2026-10-07)
- **Source:** misalignment found in 2.6. SRS §6.5 listed credits as "card payments, card
  cashback, card-side refunds" with no rule for reversals; §6.6 "next unpaid due date" didn't
  say whether an overdue bill counts.
- **Decision:**
  - *(Replaced by D-058: a reversal and its original both drop out of the bills.)* A reversal is
    billed by the sign of its card effect. A reversed charge is a plain card credit,
    poured oldest-first like a refund. A reversed credit is a charge in the bill month of the
    reversal's own date (or its `bill_month_override`). The EMI schedule is not changed (as for a
    refund on an EMI purchase).
  - Next due = the earliest bill with remaining > 0 and due date ≥ today. Overdue bills show only
    in the overdue amount and the Overdue status.
- **Docs changed:** SRS §6.
- **Tasks:** 2.6, CR-002.

## D-022 — Card names are unique per owner; City cards share 28/12 (2026-10-07)
- **Source:** user feedback. Different people hold the same bank's card with different days
  (Arif's Brac due ≈ 7th–9th; Babul's Brac statement ≈ 4th, due 20th), but SRS §4 made the card
  `name` unique across everyone. Also, City Visa and City Amex share the same billing days, while
  the SRS §6 fixture table (from the investor's sheet) had City Amex at 23/7.
- **Decision:**
  - A card's name is unique per owner: `(owner_person_id, name)`. Each person's card is its own
    row with its own usual statement/due days. Pickers and lists show "Owner · Card".
  - Days that move from month to month stay as the usual day + that month's actual date
    (`card_bill_dates`). A month-end statement (e.g. Bank Asia) is statement day 31, clamped. No
    extra form hint.
  - City Visa and City Amex both use statement 28 / due 12, each with its own bills and balance.
    The card fixture's expected values don't change (City Amex is Clear either way).
- **Docs changed:** PRD §4 (cards), SRS §4 (`cards`), SRS §6 (fixture table).
- **Tasks:** CR-003; affects 1.3 (schema), 3.3/4.4 (card pickers and Setup), U2.6.9.

## D-023 — Setup: the partner % total warns, Walk-in is read-only, 3.2 builds the form shell (2026-10-07)
- **Source:** misalignment found in 3.2.
  - SRS §4 checks "active partners must total 100" at close and import, but TASKS I3.2.1 rejected
    a Setup save. People are saved one at a time, so a strict check would block every change of
    the split (50/50 → 60/40) and adding a second partner.
  - SRS §4 only said Walk-in "can't be deleted"; edit and deactivate were open.
  - 3.2's modal forms need the shell listed in 3.3, and E3.2.1 tests the sale form's picker (3.3,
    3.5).
- **Decision:**
  - A person save is allowed while the active partners' %s don't total 100. The People list in
    Setup shows "Partners total X% — must be 100 before closing". Close and import still reject
    it (SRS §7, §9).
  - Walk-in is read-only in Setup: listed with a "Built-in" badge; no edit, deactivate or delete.
  - 3.2 builds the modal form shell it needs (bottom sheet on mobile, About box, ⓘ, inline errors,
    Save spinner). 3.3 adds pickers with "+ Add new", money/date inputs, the preview, the toast and
    the duplicate dialog on top of it. E3.2.1 moves to 3.5 (as E3.5.6), where the sale form exists.
  - UIDD §3 listed the Setup fields with an ⓘ but not their texts; the texts are added to UIDD §3
    (drafted in 3.2, for the partners to review).
- **Docs changed:** PRD §4.1, SRS §4 (`people`, `customers`), UIDD §3 (Setup ⓘ texts), UIDD §4.11.
- **Tasks:** CR-004; 3.2, 3.3, 3.5, 5.2.

## D-024 — ⓘ texts for the entry-form fields; the card-payment mockup uses "Owner · Card" (2026-10-07)
- **Source:** misalignment found in 3.3.
  - UIDD §3 listed the Purchase, Sale, Return and Money-entry fields that get an ⓘ, but gave no
    texts, while `help-text.ts` must copy every ⓘ text from the UIDD (3.3.4).
  - The UIDD §3 card-payment mockup showed the preview line "City Visa (Arif)", but D-022 shows
    cards as "Owner · Card"; and it showed "Card ⓘ", but Card isn't in the ⓘ field list.
- **Decision:**
  - The entry-form ⓘ texts are added to UIDD §3 as a second table (drafted in 3.3, approved by
    the user, for the partners to review like D-023).
  - The preview names a card "Owner · Card" too ("Arif · City Visa: −৳33,720"); the Card field
    has no ⓘ.
- **Docs changed:** UIDD §3.
- **Tasks:** CR-005; 3.3 (3.3.3, 3.3.4, U3.3.1, U3.3.2).

## D-025 — Purchase-return refund default; write-off duplicates (2026-10-07)
- **Source:** misalignment found in 3.6 (user-confirmed).
  - UIDD §4.5 gave the customer return's refund default (the sale price) and Damaged / lost = 0,
    but no default for a purchase return "Returned to seller".
  - SRS §2.3's duplicate rule (same counterparty, amount, date) would flag every second
    Damaged / lost write-off of a day: it has no counterparty and its refund is always 0.
- **Decision:**
  - A purchase return's refund per unit starts at the lot's unit cost (the user can change it).
  - A Damaged / lost write-off is a possible duplicate when a write-off of the same lot and qty
    exists on the same date. Other returns keep counterparty + refund total + date.
- **Docs changed:** SRS §2.3; UIDD §3 (Return: Refund per unit ⓘ), §4.5.
- **Tasks:** CR-006; 3.6.

## D-026 — A reversed entry and a reversal can't be edited (2026-10-07)
- **Source:** misalignment found in 3.8 (user-confirmed). SRS §8 said "Open-month rows: edit or
  delete" and that a reversal has "the same content", with no rule on editing either side of the
  pair. Editing one would leave a pair that no longer cancels.
- **Decision:**
  - An entry with a reversal, and a reversal itself, can't be edited. To fix one: delete the
    reversal (open month), then edit the original, or enter it again.
  - Reverse and delete follow the stock rule of SRS §4 (lot remaining ≥ 0): reversing a customer
    return, or deleting a sale reversal or a purchase-return reversal, is blocked if those units
    were sold again.
  - A dependent that is already reversed no longer blocks a reverse ("reverse the dependents
    first"). Delete stays blocked by any dependent row, reversed or not.
- **Docs changed:** PRD §4.5, SRS §8, UIDD §4.10.
- **Tasks:** CR-007; 3.8.

## D-027 — Stock lots show customer returns and returns to the seller apart (2026-10-07)
- **Source:** misalignment found in 4.2 (user-confirmed). UIDD §4.7 listed one "returned" column
  ("qty in/sold/returned/left"), but SRS §4 has two returns of opposite sign: lot remaining =
  `qty − Σ sold + Σ customer-returned − Σ purchase-returned`. One column can't hold both and
  still add up.
- **Decision:**
  - Each lot shows **In · Sold · Returned · To seller · Left**, so Left = In − Sold + Returned −
    To seller.
    - **Returned** = units customers brought back (customer returns).
    - **To seller** = units sent back to the seller or written off as Damaged / lost (purchase
      returns).
  - Each count is net of its reversals (a reversed line counts with the opposite sign, SRS §4).
  - A reversed purchase's lots are not shown (their qty is gone, SRS §8).
- **Docs changed:** UIDD §4.7.
- **Tasks:** CR-008; 4.2.

## D-028 — A blank investor line is skipped; a month that hasn't started can't be closed (2026-10-07)
- **Source:** misalignment found in 5.2 (user-confirmed).
  - SRS §4 stores an investor (cash/card) allocation only with a basis and a rate (the schema also
    requires basis > 0), but SRS §7 leaves the card basis and the rates blank the first time, and
    an investor's cash basis can be 0. The rule for a line left blank was missing.
  - PRD §4.4 lets the close button be used on any day, so once the current month is closed the
    next month to close hasn't started yet. Closing it would lock it before anything is entered.
- **Decision:**
  - An investor line is saved only when it has basis > 0, a rate and an amount. A line with no
    amount (its basis or rate left blank) or with basis 0 is skipped: no row, it counts as 0, and
    next month's defaults for it are blank. An amount typed without both a basis and a rate is an
    inline error.
  - A month after today's month (Dhaka) can't be closed ("Nov 2026 hasn't started"). The current
    month can still be closed on any day.
- **Docs changed:** SRS §4 (`allocations`), SRS §7 (Close M steps 1–2), UIDD §4.9.
- **Tasks:** CR-009; 5.2.

## D-029 — The opening template's layout and how the workbooks fill it (2026-10-07)
- **Source:** misalignment found in 6.1 (user-confirmed). SRS §9 named the template's sheets but
  not their columns, the opening date, or how the workbook rows map to them. Several mappings are
  business calls: "Investment From Another Side" mixes investor cash and card debts in one list;
  Nadim's card balance is one line there (2,31,640) but his own workbook has every card
  transaction; the customer dues appear in three snapshots.
- **Decision:**
  - The template's sheets and columns are fixed in SRS §9 (plus Settings with the opening date,
    and an Issues sheet the import ignores). The builder fills a **best guess and flags** anything
    unsure (amber cell + an Issues row). The partners fix it in 6.2; a blank required cell fails
    the import (6.3).
  - **Opening date:** `--opening YYYY-MM-01` (default: the 1st of next month, Dhaka), written to
    Settings, where the partners can change it.
  - **Outside money:** rows naming a person become investor Capital (Nadim, Jamal, Faruk, Shakil;
    "Arif vai" with the note "managed by Arif"). "Babul vai" is the colleague:
    an investor with the note "managed by Arif". Bank-named rows (UCB, SCB, MTB, Bank
    Asia, Brac, Meghna, City, Prime, Lanka Bangla, EBL) become CardBalances, with the owner (when
    the row names one), days and bill month left for the partners. Unclear rows (Bag, the unnamed
    256, Nadim Pos) get a blank person, flagged "classify".
  - **Nadim's cards:** his 7 cards (owner Nadim, SRS §6 days) and their unpaid bill months at the
    day before the opening date are computed from his Transactions with the engine's card logic.
    The "Nadim card" line is dropped, and its difference is flagged.
  - **Customers:** Tanvir and Habib from "Total cash"; Milon from the last total on his own sheet,
    flagged against 75,40,000 (beside it) and 72,40,000 ("Total cash"). Sheet6's older list is not
    used.
  - **Partner capital:** each partner's own Sheet6 summary (PRD §4.6); Arif and Sumon 50/50.
- **Docs changed:** SRS §9 (step 1); PRD §3 (the "managed by Arif" example).
- **Tasks:** CR-010; 6.1, 6.2, 6.3.

## D-030 — Hosting: the partners' own VPS, not Vercel/Netlify (2026-10-08)
- **Source:** user feedback (6.5.1). SRS §1 named Vercel Pro or Netlify. Vercel's free Hobby plan
  is non-commercial only and Pro costs about $20/month; Netlify Free runs functions far from
  Mumbai. The partners already run a Linux VPS in Singapore (1 core, 6 GB, shared with other
  production apps; Node.js, Docker and nginx installed).
- **Decision:**
  - The Next.js app runs on that VPS: `next start` (Node 20+) as a **systemd** service bound to
    `127.0.0.1`, behind the **existing nginx** (reverse proxy, HTTPS via Let's Encrypt/certbot)
    on the partners' own subdomain. **No Docker** (the shared core and RAM are kept for the other
    apps).
  - **Supabase stays** for Postgres + Auth (ap-south-1). The VPS's own Postgres is not used.
  - **Releases:** `scripts/deploy.sh`, run by hand on the VPS over SSH: clone `main` into a new
    release folder → `npm ci` → build at low CPU priority (`nice`) → `drizzle-kit migrate` →
    switch the `current` symlink → restart the service. The running app is untouched while it
    builds; the last 3 releases are kept for rollback.
  - Secrets live only on the VPS (`shared/.env.local`, mode 600), never in git.
- **Docs changed:** SRS §1 (Hosting), §12 (`scripts/deploy.sh`).
- **Tasks:** 6.5, CR-011.

## D-031 — Releases follow the VPS's pull-build-copy convention; signed-in pages are never prerendered (2026-10-08)
- **Source:** user feedback and a misalignment found in CR-011.
  - D-030 cloned `main` into a new `releases/<timestamp>` folder for every release. The partners'
    other apps on the VPS already follow one convention: a clone in `/home/ubuntu/<repo>` is
    pulled and built, its output is copied to `/var/www/<app>` (the old copy kept), and the
    service restarts. The user asked for that convention.
  - The first build on the VPS failed: `next build` tried to prerender the `(app)` pages, which
    query the database, and each one timed out after 60 s ("took more than 60 seconds"). The same
    hang was reproduced locally with an unreachable `DATABASE_URL`. SRS §2.1 derives every balance
    on each request, so these pages must never be built ahead of time.
- **Decision:**
  - **Build:** Next.js `output: "standalone"`. The service runs `node server.js` from
    `/var/www/mobile-business` with `PORT=4005` and `HOSTNAME=127.0.0.1`, as `ubuntu` (the same
    shape as the VPS's QurbaniBazar service). No `releases/`, no `current` symlink.
  - **Release** (`scripts/deploy.sh`, run in the clone `/home/ubuntu/Mobile-Business-Lite` on
    `main` after `git pull`): `npm ci` → build at low CPU priority (`nice`) → `drizzle-kit
    migrate` → copy the standalone output (+ `.next/static`, `public`, `.env.local`) to
    `/var/www/mobile-business-new` → move the live folder to `/var/www/mobile-business-old` and the
    new one into place → restart. If the build or migration fails, `/var/www` is untouched. If the
    new copy doesn't start, the old one is moved back. `--rollback` swaps the live and `-old`
    folders and restarts. **One** previous copy is kept (not 3).
  - **Secrets:** `.env.local` (mode 600) lives in the clone (git-ignored), where the build needs
    the `NEXT_PUBLIC_*` values and the migration needs `DATABASE_URL`. Each release copies it next
    to `server.js`, which loads it at start. Never in git.
  - **Signed-in pages are always dynamic:** the `(app)` layout sets `dynamic = "force-dynamic"`,
    so `next build` never renders them or touches the database.
  - **Redirects use the public host** (found while testing CR-012): behind nginx, Next's
    `request.url` is the server's own `localhost:<port>`, so the middleware's `/login` redirect
    pointed at `https://localhost:4005/login`. It now builds the URL from `X-Forwarded-Host` /
    `X-Forwarded-Proto` (falling back to `Host` and the request's own URL).
- **Docs changed:** SRS §1 (Hosting), §2 (item 1), §11 (session check), §12 (`deploy.sh`).
- **Tasks:** CR-012 (replaces CR-011.1–.2); CR-011.3, 6.5.

## D-032 — UI feedback pass: dark controls, entry details in place, quick actions, card page, speed (2026-10-09)
- **Source:** user feedback after go-live (CR-011).
  - In dark mode, native dropdowns show white options and date fields look dead: `color-scheme`
    was never set.
  - Tapping a card charge or EMI row jumps to the Journal's entry sheet, and closing it stays on
    the Journal.
  - Card alerts open the card list.
  - Detail pages have no actions, and banks can't be told apart.
  - The Statements list is long and rarely needed.
  - Pages take 250 ms–1.5 s.
- **Decision** (UI only; the engine and SRS §5/§6 rules are unchanged):
  - **Dark mode:** `color-scheme` follows the theme. Clicking a date/month field anywhere opens
    its picker. Modals are centred on desktop.
  - **Entry details open in place:** any page whose rows open an entry (Home, Journal, card,
    customer, supplier, person) takes `?entry=<id>` and shows the same sheet over itself; closing
    stays on that page. In the sheet, Edit is the main button and Delete is red.
  - **Pre-fill and return path:** new-entry forms accept pre-filled ids (customer, supplier, card,
    person) and an amount, plus `from` (an internal path to return to after Save or Cancel). The
    server ignores inactive or unknown ids. The pre-filled amount stays editable (split payments).
  - **Quick actions:** each account detail page has a row of quick actions (UIDD §4.8). Setup
    accepts `?edit=<id>`.
  - **Bank badge:** a coloured monogram plus the card network, derived from the card name. No new
    column.
  - **Card page:**
    - Statements show unpaid billed bills plus the next one; the rest sit behind "Show all".
    - The oldest unpaid bill gets **Pay ৳remaining**. A payment pays the oldest bill first (SRS
      §6.5), so a button on a later bill would pay the wrong one.
    - EMI charges read "EMI n × ৳x · from Mon YYYY".
  - **Journal:**
    - One **Period** filter (All time · This month · Last month · each month · Custom range)
      replaces From/To/Month. A month still includes entries marked "for" it.
    - **Who** is a searchable picker.
    - A search box covers the note, who and type.
    - Filters live in the URL.
    - With one type filtered, the list shows its total.
    - Filters update the URL with `history.replaceState`, not a router navigation: no server round
      trip per change (found in E-CR-013.6).
  - **Home:**
    - Card alerts: one row (the earliest unpaid bill) per card, linking to the card.
    - Tiles link to their pages.
  - **Purchase form:** the EMI preview ("n × ৳x · first in Mon YYYY bill"); Bill month sits next
    to the Card picker.
  - **Desktop sidebar:** lists Months/Journal/Setup/Export directly.
  - **Speed, safe only (no behaviour change):**
    - the books, setup lists, entry and user are loaded once per request (React `cache`);
    - the calendar queries run in parallel;
    - the entry detail reuses its calendar;
    - DB connections aren't recycled on a timer.
  - **Not done:**
    - a local JWT check in the middleware (a revoked session would stay valid up to an hour);
    - a client router cache (the other partner's saves would show up to 30 s late).
- **Found while testing (fixed, UI only):** axe (E-CR-013.2) found light-mode contrast below 4.5:1 on
  the grey tab labels of four segmented controls (Accounts, customer Statement/Bills, Setup, the
  entry sheet's Details/History), and on the first red Delete style; they now use darker text.
- **Docs changed:** UIDD §1, §2, §3, §4.2, §4.3, §4.8, §4.10, §4.11.
- **Tasks:** CR-013.

## D-033 — Bank badges in logo colours; whole table rows open; card list polish (2026-10-09)
- **Source:** user feedback on CR-013 (the Cards table).
- **Decision** (UI only; no calculation changes):
  - **Bank badge colours follow each bank's logo.** The partners chose them from the logos:
    - EBL: brand yellow with dark text;
    - Southeast: a blue S and a magenta B (two halves);
    - MTB: its 2025 logo gradient (pink → purple → teal → green);
    - Prime: red, green and blue bands (its triangle);
    - City: red; UCB: red; BRAC: blue; SCB: blue with a green accent.

    White or dark text is chosen by contrast where the text sits; white text on a multi-colour
    badge gets a soft shadow. A badge is a logo (WCAG 1.4.3 exempts logotypes), but the test still
    keeps ≥ 4.5:1 on one colour and ≥ 3:1 on several.
  - **Desktop tables** (Cards, People, statements): a click anywhere on a row opens it. The row's
    one link is stretched over the row, so keyboard and screen-reader users still meet one link.
  - **Cards list:**
    - a status badge never wraps ("Card credit" on one line);
    - a negative card balance reads "Credit ৳X" (sky blue), like the card page, not a red minus;
    - on a phone the badge sits beside the name;
    - no stray "—" when nothing is due.
  - **Journal:** the four filter labels line up. An ⓘ no longer makes its label's line taller.
- **Docs changed:** UIDD §4.8, §4.10.
- **Tasks:** CR-014.
