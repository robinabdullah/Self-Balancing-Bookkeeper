# Decisions log

Every business-rule or process decision, newest last. The rule itself lives in PRD/SRS/UIDD; this
log records **why** it changed and **where**. Write the entry first, then edit the docs, then the
code (see `docs/TASKS.md` → Workflow). v1's entries (D-001 … D-033) are in
`docs/DECISIONS-v1.md`; the index below lists all of them.

**Entry format** (≤ ~10 lines, D-066: the reason in short, the detail in the specs):

```
## D-NNN — Title (YYYY-MM-DD)
- **Source:** user feedback | misalignment found in <task> | review
- **Decision:** the rule and why, in 1–4 lines; the detail goes in the docs
- **Docs changed:** PRD §x, SRS §y, UIDD §z
- **Tasks:** P.T, CR-NNN
```

A later clarification is one line in the entry ("Clarified YYYY-MM-DD: … (UIDD §x)"), with the
detail written into the doc. Add the entry's row to the index; when it replaces or amends an
earlier decision, add its id to that row's "Later changed by".

## Index

| Id | Decision | Date | Later changed by |
|---|---|---|---|
| [D-001](DECISIONS-v1.md#d-001--testing-unit--integration--e2e-run-in-ci-2026-10-07) | Testing: unit + integration + E2E, run in CI | 2026-10-07 |  |
| [D-002](DECISIONS-v1.md#d-002--concrete-numbers-for-story-s6-2026-10-07) | Concrete numbers for story S6 | 2026-10-07 |  |
| [D-003](DECISIONS-v1.md#d-003--a-reversal-cant-be-reversed-2026-10-07) | A reversal can't be reversed | 2026-10-07 |  |
| [D-004](DECISIONS-v1.md#d-004--editing-a-sale-keeps-its-lots-2026-10-07) | Editing a sale keeps its lots | 2026-10-07 |  |
| [D-005](DECISIONS-v1.md#d-005--no-future-for_month-2026-10-07) | No future for_month | 2026-10-07 |  |
| [D-006](DECISIONS-v1.md#d-006--undo-after-a-sale-with-received-now-removes-both-entries-2026-10-07) | Undo after a sale with "Received now" removes both entries | 2026-10-07 |  |
| [D-007](DECISIONS-v1.md#d-007--no-write-off-as-discount-toast-2026-10-07) | No "write off as discount?" toast | 2026-10-07 |  |
| [D-008](DECISIONS-v1.md#d-008--an-entrys-type-is-fixed-on-edit-2026-10-07) | An entry's type is fixed on edit | 2026-10-07 |  |
| [D-009](DECISIONS-v1.md#d-009--walk-in-limits-2026-10-07) | Walk-in limits | 2026-10-07 |  |
| [D-010](DECISIONS-v1.md#d-010--delete-and-undo-check-updated_at-2026-10-07) | Delete and Undo check `updated_at` | 2026-10-07 |  |
| [D-011](DECISIONS-v1.md#d-011--refund-target-for-opening-correction-lots-2026-10-07) | Refund target for opening-correction lots | 2026-10-07 |  |
| [D-012](DECISIONS-v1.md#d-012--workflow-and-claude-code-setup-2026-10-07) | Workflow and Claude Code setup | 2026-10-07 |  |
| [D-013](DECISIONS-v1.md#d-013--principles-and-file-size-2026-10-07) | Principles and file size | 2026-10-07 |  |
| [D-014](DECISIONS-v1.md#d-014--real-workbooks-stay-in-the-private-repo-2026-10-07) | Real workbooks stay in the private repo | 2026-10-07 | D-069 |
| [D-015](DECISIONS-v1.md#d-015--money-display-decimals-only-when-non-zero-2026-10-07) | Money display: decimals only when non-zero | 2026-10-07 |  |
| [D-016](DECISIONS-v1.md#d-016--exceljs-is-the-excel-library-2026-10-07) | ExcelJS is the Excel library | 2026-10-07 |  |
| [D-017](DECISIONS-v1.md#d-017--the-last-export-time-comes-from-the-audit-log-2026-10-07) | The last export time comes from the audit log | 2026-10-07 |  |
| [D-018](DECISIONS-v1.md#d-018--the-cash-warning-uses-the-first-date-cash-went-negative-2026-10-07) | The cash warning uses the first date cash went negative | 2026-10-07 |  |
| [D-019](DECISIONS-v1.md#d-019--resume-point-and-token-efficient-task-workflow-2026-10-07) | Resume point and token-efficient task workflow | 2026-10-07 |  |
| [D-020](DECISIONS-v1.md#d-020--about-texts-for-every-setup-form-and-the-card-bill-dates-form-2026-10-07) | About texts for every Setup form and the card bill-dates form | 2026-10-07 |  |
| [D-021](DECISIONS-v1.md#d-021--card-reversals-bill-by-sign-next-due-skips-overdue-bills-2026-10-07) | Card reversals bill by sign; next due skips overdue bills | 2026-10-07 | D-058 |
| [D-022](DECISIONS-v1.md#d-022--card-names-are-unique-per-owner-city-cards-share-2812-2026-10-07) | Card names are unique per owner; City cards share 28/12 | 2026-10-07 | D-036, D-056 |
| [D-023](DECISIONS-v1.md#d-023--setup-the-partner--total-warns-walk-in-is-read-only-32-builds-the-form-shell-2026-10-07) | Setup: the partner % total warns, Walk-in is read-only, 3.2 builds the form shell | 2026-10-07 |  |
| [D-024](DECISIONS-v1.md#d-024---texts-for-the-entry-form-fields-the-card-payment-mockup-uses-owner--card-2026-10-07) | ⓘ texts for the entry-form fields; the card-payment mockup uses "Owner · Card" | 2026-10-07 |  |
| [D-025](DECISIONS-v1.md#d-025--purchase-return-refund-default-write-off-duplicates-2026-10-07) | Purchase-return refund default; write-off duplicates | 2026-10-07 |  |
| [D-026](DECISIONS-v1.md#d-026--a-reversed-entry-and-a-reversal-cant-be-edited-2026-10-07) | A reversed entry and a reversal can't be edited | 2026-10-07 |  |
| [D-027](DECISIONS-v1.md#d-027--stock-lots-show-customer-returns-and-returns-to-the-seller-apart-2026-10-07) | Stock lots show customer returns and returns to the seller apart | 2026-10-07 |  |
| [D-028](DECISIONS-v1.md#d-028--a-blank-investor-line-is-skipped-a-month-that-hasnt-started-cant-be-closed-2026-10-07) | A blank investor line is skipped; a month that hasn't started can't be closed | 2026-10-07 |  |
| [D-029](DECISIONS-v1.md#d-029--the-opening-templates-layout-and-how-the-workbooks-fill-it-2026-10-07) | The opening template's layout and how the workbooks fill it | 2026-10-07 | D-070 |
| [D-030](DECISIONS-v1.md#d-030--hosting-the-partners-own-vps-not-vercelnetlify-2026-10-08) | Hosting: the partners' own VPS, not Vercel/Netlify | 2026-10-08 |  |
| [D-031](DECISIONS-v1.md#d-031--releases-follow-the-vpss-pull-build-copy-convention-signed-in-pages-are-never-prerendered-2026-10-08) | Releases follow the VPS's pull-build-copy convention; signed-in pages are never prerendered | 2026-10-08 | D-071 |
| [D-032](DECISIONS-v1.md#d-032--ui-feedback-pass-dark-controls-entry-details-in-place-quick-actions-card-page-speed-2026-10-09) | UI feedback pass: dark controls, entry details in place, quick actions, card page, speed | 2026-10-09 | D-038 |
| [D-033](DECISIONS-v1.md#d-033--bank-badges-in-logo-colours-whole-table-rows-open-card-list-polish-2026-10-09) | Bank badges in logo colours; whole table rows open; card list polish | 2026-10-09 |  |
| D-034 | v1.1 scope: sharing, reports, settings; v1 tasks archived | 2026-10-10 | D-058, D-060, D-064 |
| D-035 | Back closes sheets; dd/mm/yyyy date fields; month dropdowns; more bank badges | 2026-10-10 |  |
| D-036 | One v1.1 migration: card type, invoice/receipt numbers, tables for later CRs | 2026-10-10 | D-049, D-053 |
| D-037 | Settings page, the More regroup, and per-user themes | 2026-10-10 |  |
| D-038 | Detail-page actions: 2 main buttons + ⋯ More; the Report sheet moves to CR-020 | 2026-10-10 |  |
| D-039 | Business profile, message templates, contacts and saved bank accounts | 2026-10-10 |  |
| D-040 | Statements by period, WhatsApp messages and reminders | 2026-10-10 |  |
| D-041 | PDF engine and the due statement PDF | 2026-10-11 | D-049 |
| D-042 | Invoice and money receipt | 2026-10-11 |  |
| D-043 | Reports page: Cash book (+ Cash count), Sales report, Backup | 2026-10-11 |  |
| D-044 | Profit view for any open month | 2026-10-11 |  |
| D-045 | Per-account reports, the Investor report and the monthly partner pack | 2026-10-11 |  |
| D-046 | Card details behind a fingerprint, with the CVV | 2026-10-12 | D-051, D-052, D-054 |
| D-047 | E2E runs on a production build with one login; per-CR E2E scope | 2026-10-11 | D-048, D-065 |
| D-048 | Next.js 16.4 (Turbopack build) fixes the lost same-page taps | 2026-10-11 |  |
| D-049 | Per-document PDF terms | 2026-10-11 |  |
| D-050 | PDF terms under "Terms & conditions" | 2026-10-11 |  |
| D-051 | Masked card details show only the last 4 digits | 2026-10-12 |  |
| D-052 | Card details: fingerprint only; no password reveal | 2026-10-12 |  |
| D-053 | Card badge without the Type; toasts above sheets; pickers open without the keyboard | 2026-10-12 |  |
| D-054 | Supplementary card numbers; one fingerprint reveals any card for 30 s | 2026-10-12 | D-067 |
| D-055 | A card's opening balance with missed EMI plans is replaced by a one-off script | 2026-10-13 | D-070 |
| D-056 | Cash-out Fee %, Cards search grouped by owner, Avg unit price in By model | 2026-10-13 |  |
| D-057 | AI assistant track: read-only, any provider, figures identical to the UI | 2026-10-13 |  |
| D-058 | A card reversal cancels its original on the bills | 2026-10-14 |  |
| D-059 | A colour used as a fill has its own text colour, per theme | 2026-10-15 |  |
| D-060 | Capital out can be paid by card: a person's personal spending on a business card | 2026-10-15 |  |
| D-061 | One row style for what an entry does: the preview, four confirms, the Journal | 2026-10-16 |  |
| D-062 | Desktop sidebar: an icon on every link, no More | 2026-10-16 |  |
| D-063 | Stock: an average cost per model | 2026-10-18 |  |
| D-064 | Charts, and the business value in the Books balance | 2026-10-22 |  |
| D-065 | Per-task local tests; the full suites on CI | 2026-10-24 |  |
| D-066 | Lighter docs, production keys out of the default env, tests named by feature | 2026-10-24 |  |
| D-067 | A card number is saved on one card only; the card form formats as you type | 2026-10-24 |  |
| D-068 | NestJS backend; Next.js stays the UI as a BFF over an internal API | 2026-10-27 |  |
| D-069 | A public MIT repo with fictional data (amends D-014) | 2026-10-27 |  |
| D-070 | The opening-import tools are deleted here; the cutover stays in the reference | 2026-10-27 |  |
| D-071 | The product is "Self-Balancing Bookkeeper"; the switch runs side by side (amends D-031) | 2026-10-28 | D-072 |
| D-072 | The new app is tried on its own subdomain (amends D-071) | 2026-10-29 |  |
| D-073 | One owner or several partners | 2026-10-30 |  |

---

## D-034 — v1.1 scope: sharing, reports, settings; v1 tasks archived (2026-10-10)
- **Source:** user feedback after go-live (the feature review of 2026-10-10).
- **Decision:** v1.1 = business profile, contacts, WhatsApp texts, PDFs, reports, saved bank
  accounts and card details, themes, Back-closes-sheets (PRD §4.8). **No calculation changes**:
  every new figure is read from the books and tied out in tests. One schema change for all of
  v1.1 (CR-016), so later features need no production migration. A feature that would clutter a
  page is redesigned before it is built (TASKS Principles). Not in v1.1: PRD §5. v1 tasks move to
  `docs/TASKS-v1.md`.
- **Docs changed:** PRD header, §4.8 (new), §5; `docs/TASKS.md` (new), `docs/TASKS-v1.md`; CLAUDE.md.
- **Tasks:** CR-015 … CR-026, Ops backup.

## D-035 — Back closes sheets; dd/mm/yyyy date fields; month dropdowns; more bank badges (2026-10-10)
- **Source:** user feedback (v1.1 review).
- **Decision** (UI only): on a phone, Back closes only the top sheet (each sheet adds a same-URL
  history entry); date fields are a typed `dd/mm/yyyy` box with a 📅 button, because a native date
  input follows the phone's language (the form still sends `YYYY-MM-DD`); month fields are
  dropdowns of the allowed months, and a default never switches silently; Journal filters line up;
  three more bank badges.
- **Docs changed:** UIDD §1, §2, §4.8.
- **Tasks:** CR-015.

## D-036 — One v1.1 migration: card type, invoice/receipt numbers, tables for later CRs (2026-10-10)
- **Source:** user feedback (v1.1 plan, CR-016).
- **Decision** (no calculation changes):
  - `cards.network` (visa | mastercard | amex | none); a card is unique on (owner, name, network),
    updating D-022. Existing cards are renamed by a dry-run-first script from a table the user
    approves (an audit row needs a user, so the migration itself renames nothing).
  - `invoice_no` / `receipt_no` come from sequences, assigned at save in code (reversals get none);
    never reused. Every table and column v1.1 needs is added now, so there is one production
    migration. Export never includes card secrets or passkeys.
- **Docs changed:** SRS §4, §8, §10; UIDD §3, §4.8, §4.11.
- **Tasks:** CR-016.

## D-037 — Settings page, the More regroup, and per-user themes (2026-10-10)
- **Source:** user feedback (CR-017) + misalignment: the plan mirrored the theme into a cookie
  that the `(app)` layout re-synced, but a Next.js layout can't write cookies.
- **Decision** (UI only): a Settings page (Theme, Form help); More regrouped; themes Light · Dark ·
  Night Owl (default), **saved per user** on `profiles.theme` through the action helper. **No
  cookie:** the root layout reads the user's theme on each full load and sets `<html data-theme>`,
  so the wrong theme never flashes. Edge cases (one save at a time, a change on another device):
  UIDD §4.13.
- **Docs changed:** SRS §12; UIDD §2, §3, §4.13 (new), §6.
- **Tasks:** CR-017.

## D-038 — Detail-page actions: 2 main buttons + ⋯ More; the Report sheet moves to CR-020 (2026-10-10)
- **Source:** user feedback (CR-018) + the user's answers of 2026-10-10.
- **Decision** (UI only): a detail page shows **2 main buttons + ⋯ More** (replacing D-032's row of
  buttons), and ⋯ opens one sheet grouped New entry · Reports & share · Manage; an empty group is
  left out. Links, pre-fill and the way back are unchanged. The shared Report sheet is built in
  CR-020 with its first real output, not before.
- **Docs changed:** UIDD §4.8; `docs/v1.1-plan.md` (CR-018 note).
- **Tasks:** CR-018, CR-020.

## D-039 — Business profile, message templates, contacts and saved bank accounts (2026-10-10)
- **Source:** user feedback (CR-019) + the user's answers of 2026-10-10.
- **Decision** (no calculation changes; tables from D-036): Settings → Business (Details · Logo ·
  Messages), partner-only and audited; the name is used in the top bar, title, login and export
  file name. The logo is served from a cached `/logo` route and never stored in audit rows. A
  Greeting + Sign-off per message type, with code defaults and placeholders. Contacts in Setup.
  Saved bank accounts for any owner, with copy/share; **the note is never shared** (it is for the
  partners). Deleting an owner deletes their accounts.
- **Docs changed:** SRS §4, §12; UIDD §3, §4.1, §4.8, §4.11, §4.13, §4.14 (new).
- **Tasks:** CR-019.

## D-040 — Statements by period, WhatsApp messages and reminders (2026-10-10)
- **Source:** user feedback (CR-020) + the user's answers of 2026-10-10.
- **Decision** (no calculation changes): a statement for any period on every account page
  (opening → entries oldest first with running balance → totals → closing); the Report sheet
  (period chips + outputs); one pure messages module for every message type, each starting with
  the greeting and ending with the sign-off; `toWords()`; the send preview (WhatsApp · Copy ·
  Share) and where Send appears. Times are the saved time in Asia/Dhaka, never the server clock.
- **Docs changed:** UIDD §4.8, §4.10, §4.15 (new), §5; `docs/v1.1-plan.md` (CR-020 note).
- **Tasks:** CR-020 (and CR-022: `toWords()` already exists).

## D-041 — PDF engine and the due statement PDF (2026-10-11)
- **Source:** user feedback (CR-021) + the user's answers of 2026-10-11.
- **Decision** (no calculation changes): `@react-pdf/renderer` in partner-only GET routes under
  `/pdf/*` (no audit row: a PDF changes nothing); embedded Noto fonts for ৳. One A4 layout for all
  PDFs. The terms close the document instead of sitting in the page footer, because a fixed footer
  can't grow and long terms would cover the table. The due statement uses the screen's
  `statementRange`; a customer document never has a cost or profit field. Share PDF uses the
  phone's share sheet, since WhatsApp links can't attach files.
- **Docs changed:** UIDD §4.8, §4.15, §4.16 (new); SRS §1, §12; `CLAUDE.md` (stack).
- **Tasks:** CR-021 (CR-022 and CR-025 reuse the engine and the layout).

## D-042 — Invoice and money receipt (2026-10-11)
- **Source:** user feedback (CR-022) + the user's answers and feedback of 2026-10-11.
- **Decision** (display only; numbers since D-036): `INV-0042` / `MR-0017` shown everywhere the
  entry is named. An invoice PDF (dues as a ruled sum, PAID / PARTLY PAID / DUE stamp) and a money
  receipt PDF laid out like a printed receipt book (amount in words, ruled sum, "Cleared N%"). No
  signature lines: the footer says it's computer-generated. A reversed sale or payment prints
  **CANCELLED** with no dues block, since those figures no longer hold; a reversal has no
  document.
- **Docs changed:** UIDD §4.8, §4.10, §4.15, §4.16; `docs/v1.1-plan.md` (CR-022 note).
- **Tasks:** CR-022.

## D-043 — Reports page: Cash book (+ Cash count), Sales report, Backup (2026-10-11)
- **Source:** user feedback (CR-023) + the user's answers of 2026-10-11.
- **Decision** (no calculation changes): `/reports` replaces Export and lists only what exists.
  The Cash book (a day, or a range of days with cash moves; closing = the books' cash; a reversal
  on the opposite side as "Reversal of …"), a Cash count that isn't saved, and the Sales report
  (totals, By model, By customer, all **net of returns** so each table totals the net sales
  profit; a reversal counts on its own date). Outputs go through the one Report sheet and its ⤴
  Share icon.
- **Docs changed:** UIDD §3, §4.2, §4.12, §4.17 (new).
- **Tasks:** CR-023.

## D-044 — Profit view for any open month (2026-10-11)
- **Source:** user feedback (CR-024) + the user's answers of 2026-10-11. Before, a later open month
  was "not found" and a quiet month had no row.
- **Decision** (no calculation or schema change; SRS §7 unchanged): the Months list has a row for
  every month from the opening month to this month. A later open month opens a read-only Profit
  breakdown with "Open · close {next month} first", and no close actions, because a month closes
  only after the one before it.
- **Docs changed:** UIDD §4.9.
- **Tasks:** CR-024.

## D-045 — Per-account reports, the Investor report and the monthly partner pack (2026-10-11)
- **Source:** user feedback (CR-025) + the user's answers of 2026-10-11, with a check of edge cases
  and of figures two reports could show differently.
- **Decision** (no calculation or schema change):
  - **One "as on" rule:** a period's report reads the books as on its last day; the only "now"
    figures are labelled "now".
  - **One model per report** (screen, PDF, Excel, text), and a figure shown in two reports comes
    from the same function (sales: Sales report; cash: Cash book; dues: statements; stock: books;
    allocations: stored rows). This is what keeps reports from disagreeing.
  - New: the Investor report, card / customer / supplier statement additions (By model), and the
    monthly pack. Known differences are labelled on screen.
- **Docs changed:** UIDD §4.8, §4.9, §4.16, §4.17; SRS §12.
- **Tasks:** CR-025.

## D-046 — Card details behind a fingerprint, with the CVV (2026-10-12)
- **Source:** user feedback (CR-026) + the user's answers of 2026-10-10 and 2026-10-12.
- **Decision** (no calculation changes): cardholder, number, expiry and CVV are stored per card,
  each AES-256-GCM encrypted with the card id bound in; only the last 4 digits are plain. The key
  is only on the server (and backed up in a password manager). Reveal shows one card for 30 s
  after a fingerprint (passkey) unlock; every reveal is audited with no values; never exported or
  logged. (The password fallback was removed by D-052, and the masked format changed in D-051 and
  D-054.)
- **Risk the user accepted:** the CVV is stored, though PCI DSS says it must not be, and the DB plus
  the server key together expose the cards. Mitigations: encryption, the key apart from the DB, the
  fingerprint gate, the 30 s reveal, audit rows, no export.
- **Docs changed:** SRS §4, §11, §12; UIDD §3, §4.8, §4.11, §4.13, §4.14; `deploy/README.md`.
- **Tasks:** CR-026.

## D-047 — E2E runs on a production build with one login; per-CR E2E scope (2026-10-11)
- **Source:** misalignment (CR-027: late-run desktop E2E timeouts) + the user's choices of 2026-10-11.
- **Why:** a traced run showed every failure was `next dev` recompiling evicted routes, as its
  memory grew from 0.15 GB to ~10 GB; no navigation was lost.
- **Decision** (test setup only): E2E builds the app into `.next-e2e` and runs `next start` (the
  build the VPS runs); one saved login per run. Per-CR E2E scope (amended by D-065). The Next 15.5
  same-page lost-tap race was deferred to CR-028; a re-tap helper was tried and dropped, because
  lost taps were lost again.
- **Docs changed:** `docs/TASKS.md` (Now, Every CR, CR-028); `.claude/skills/next-task/SKILL.md`.
- **Tasks:** CR-027, CR-028.

## D-048 — Next.js 16.4 (Turbopack build) fixes the lost same-page taps (2026-10-11)
- **Source:** misalignment (D-047's router race) + the user's choices of 2026-10-11.
- **Why:** in a throwaway-worktree spike, Next 16.4 lost 0 of 180 probe taps (15.5 lost about a
  third), and full E2E went from 10 failures in 20 min to 0–2 test-side failures in 11 min.
- **Decision** (no posting rule, calculation or screen change): Next.js 16.4.0 + React 19.2;
  Turbopack builds; `src/middleware.ts` → `src/proxy.ts`. The new react-hooks lint rules stay on,
  and the code is reworked to satisfy them instead of silencing them. E2E keeps single taps.
- **Docs changed:** `CLAUDE.md`, `README.md` (stack); SRS §1, §11; `docs/TASKS.md` (Now, CR-028).
- **Tasks:** CR-028 (and CR-027.4).

## D-049 — Per-document PDF terms (2026-10-11)
- **Source:** user feedback after CR-022 + the user's answers of 2026-10-11. D-041 printed the one
  `invoice_terms` (warranty, returns) on the statement and receipt too.
- **Decision** (no calculation changes): each PDF prints its own terms (invoice, receipt,
  statement); the footer line is on every PDF. Two new columns in a small second v1.1 migration,
  an exception to D-036 accepted because v1.1 wasn't deployed yet. Settings → Business gets a PDF
  terms row.
- **Docs changed:** SRS §4 (`business_profile`); UIDD §4.13, §4.16; `docs/v1.1-plan.md`.
- **Tasks:** CR-029.

## D-050 — PDF terms under "Terms & conditions" (2026-10-11)
- **Source:** user feedback on the CR-029 screenshots: the terms at the end of a PDF didn't say they
  come from the shop.
- **Decision** (layout only): each customer PDF's terms sit in a light box headed "Terms &
  conditions", numbered one per line; the footer line is centered below it. No terms, no box.
- **Docs changed:** UIDD §4.13, §4.16.
- **Tasks:** CR-029 (feedback item).

## D-051 — Masked card details show only the last 4 digits (2026-10-12)
- **Source:** user feedback on the CR-026 screenshots: the `· ••/•• · •••` placeholders looked
  unfriendly.
- **Decision** (display only): hidden details show only `•••• •••• •••• 7890`, with no expiry, CVV
  or cardholder placeholders; the revealed view is unchanged. Supersedes D-046's masked format.
- **Docs changed:** UIDD §4.14; `docs/v1.1-plan.md` (CR-026).
- **Tasks:** CR-026 (feedback item).

## D-052 — Card details: fingerprint only; no password reveal (2026-10-12)
- **Source:** user feedback on CR-026: the browser autofills the saved login password into "Use
  password instead", so anyone holding an unlocked, signed-in phone could reveal every card.
- **Decision** (replaces D-046's password fallback): reveal needs the fingerprint (a passkey; Windows
  Hello / Touch ID on a computer), and the reveal route refuses a password. Set-up still asks for
  the password, which is safe from autofill because registering also needs the device's own
  biometric or screen lock. **Accepted trade-off:** a computer without one can't reveal; use the
  phone. Messages: UIDD §4.14.
- **Docs changed:** PRD §4; SRS §11; UIDD §3, §4.13, §4.14; `docs/v1.1-plan.md` (CR-026).
- **Tasks:** CR-026 (feedback item).

## D-053 — Card badge without the Type; toasts above sheets; pickers open without the keyboard (2026-10-12)
- **Source:** user feedback after the v1.1 deploy (on a phone).
- **Decision** (display only): the card badge shows only the bank, since the text beside it already
  names the Type (supersedes D-036's badge); a toast sits above every sheet and dialog; on a phone a
  picker opens with its list visible, and the keyboard opens only on tapping Search.
- **Docs changed:** UIDD §1 (Pick, don't type), §4.8 (bank badge), §5 (toasts).
- **Tasks:** CR-030.

## D-054 — Supplementary card numbers; one fingerprint reveals any card for 30 s (2026-10-12)
- **Source:** user feedback + the user's answers of 2026-10-12: a card account can have
  supplementary cards, but a card held one number; revealing the wrong card cost a second scan.
- **Decision** (no calculation or posting change): several saved numbers per card, each tagged
  Primary / Supplementary. A supplementary card shares the bill, so it is **not** a Setup card. One
  fingerprint opens a 30 s window, held in a signed `httpOnly` cookie that can't be extended, in
  which any number reveals; one is shown at a time; Hide, background or focus loss ends it. Each
  reveal is still audited. Screenshots can't be blocked from a web page, so hiding on focus loss is
  the mitigation. Replaces D-046's "only that card".
- **Docs changed:** PRD §4; SRS §4, §11; UIDD §4.8, §4.11, §4.14; `docs/v1.1-plan.md` (CR-031).
- **Tasks:** CR-031.

## D-055 — A card's opening balance with missed EMI plans is replaced by a one-off script (2026-10-13)
- **Source:** user feedback + answers of 2026-10-13. One card's opening was imported flat, but the
  bank statement shows the billed amount plus EMI plans. The app can't fix it, since opening rows
  can't be edited and an opening correction has no EMI months.
- **Decision** (no engine or posting-rule change): a one-off script (run from the reference) replaces that
  card's opening rows by the CardBalances rule (SRS §9): an approved JSON plan, dry run first, one
  transaction, audit rows. A change in the total moves the partners' opening difference so the
  books still balance. The user chose the statement's exact figures. Early EMI settlement is a
  normal Card payment + Card fee, with no "Settle early" action (SRS §6).
- **Docs changed:** SRS §6 (EMI: early settlement), §9 (cutover checklist).
- **Tasks:** CR-032.

## D-056 — Cash-out Fee %, Cards search grouped by owner, Avg unit price in By model (2026-10-13)
- **Source:** user feedback + answers of 2026-10-13: cash-out fees are a %, so Cash received needed a
  calculator; the Cards tab was a long flat list; By model showed no unit price.
- **Decision** (display and input only; nothing new stored):
  - an optional **Fee %** fills Cash received (exact to the paisa); typing over it clears the %,
    and the % is never saved;
  - the Cards tab gets a search (never on card numbers) and owner groups with their balance;
  - every By model table gets an **Avg unit price** of what was sold or bought in the period. It
    is not Sales ÷ Pieces, because the rows are net of returns and that could show a nonsense
    price. It is rounded half-up to whole taka (`avgUnit`).
  - On a phone a Cards-list row drops the owner (it's the group's heading): an exception to
    D-022's "Owner · Card" for this list only.
- **Docs changed:** SRS §3; UIDD §4.6, §4.8, §4.17; `.claude/rules/money-engine.md` (rounding).
- **Tasks:** CR-033; touches CR-013/CR-014, CR-023, CR-025.

## D-057 — AI assistant track: read-only, any provider, figures identical to the UI (2026-10-13)
- **Source:** user request + answers of 2026-10-13: help understanding reports, catching mistakes
  before a close, and checking card statements.
- **Decision** (a separate track; no v1.1 or engine change): the AI reads, explains, drafts and
  flags. It never works out a figure or writes (four layers: pure tools, an ESLint import ban, a
  READ ONLY transaction, tests). Any provider through three adapters, keys rotated, models checked
  on fake books. The model writes placeholders only, and code renders them from the screens'
  view-models; a stray digit rejects the answer. Card secrets and contact details are never sent.
  Spec: `docs/AI.md`.
- **Docs changed:** `docs/AI.md`, `docs/TASKS-AI.md` (new); pointers in PRD §4, SRS §2, UIDD §3;
  `CLAUDE.md`; `.claude/rules/ai.md`; the `next-task` and `change-request` skills.
- **Tasks:** AI-0.1; AI-1.1 … AI-6.

## D-058 — A card reversal cancels its original on the bills (2026-10-14)
- **Source:** user feedback (2026-10-14): a reversed ৳17,468 card payment became a new charge on
  the next bill while the original still paid the old one, so the card's due bill and date were
  wrong (the balance was right). Production had no reversals, so there was nothing to fix there.
- **Decision** (replaces D-021's first bullet): a reversed card entry and its reversal both drop
  out of the card's bills once the reversal's date ≤ the "as on" date. The balance is unchanged;
  only the split into bills changes. A reversed EMI purchase's plan is removed. Both rows stay
  greyed. Every statement and the Cash book read "Reversal of …". A refund is a Purchase return,
  not a reverse (the Reverse dialog says so). **Accepted difference:** a reversed non-phone card
  expense leaves its old bill, while the bank lets the refund pay the oldest unpaid bill; the
  balance and the total due still agree. Safe because neither side can be edited (D-026) and
  one card engine feeds every screen (D-045). An approved engine exception to D-034 (`cards.ts`
  only; `postEntry` unchanged).
- **Docs changed:** SRS §6, §8; UIDD §4.8; `.claude/rules/money-engine.md`; `docs/TASKS.md`.
- **Tasks:** CR-034; replaces the tests U-CR-002.1.

## D-059 — A colour used as a fill has its own text colour, per theme (2026-10-15)
- **Source:** misalignment found in CR-034 (axe): white on `--destructive` was 2.8:1 in the dark
  themes, because `--destructive` is a *text* red, lightened for dark pages.
- **Decision** (the user's choice, inside CR-034): the theme gets `--destructive-foreground` per
  theme. A colour used as a fill takes its paired text colour from the theme; no component
  hard-codes white or black on a theme colour (text on `muted` is `foreground`). The a11y spec
  checks every card status badge in all three themes.
- **Docs changed:** UIDD §6.
- **Tasks:** CR-034 (CR-034.4).

## D-060 — Capital out can be paid by card: a person's personal spending on a business card (2026-10-15)
- **Source:** user feedback (2026-10-15, a partner's personal Flexi Buy EMI on a business card) +
  the user's answers. Capital out moved cash only, and PRD R22 left this untracked.
- **Decision:** Capital out gets **Paid by: Cash / Card**. With Card, the card balance goes up and
  the person's capital goes down; cash and profit don't change. It is billed like any charge.
  Personal spending is tracked only when the business pays it. Stored rows stay Cash, with no
  migration. A card page link "Personal spend"; a confirm on save; labels name the other side;
  the Investor report splits "Taken out (cash / card)". An approved engine exception to D-034: one
  new SRS §5 row in `postEntry`.
- **Docs changed:** PRD §4.1, §4.2; SRS §4, §5, §6; UIDD §3, §4.6, §4.8, §4.17, §5; `docs/TASKS.md`.
- **Tasks:** CR-035.

## D-061 — One row style for what an entry does: the preview, four confirms, the Journal (2026-10-16)
- **Source:** user feedback (2026-10-16): the user liked CR-035's confirm and asked whether every
  save should confirm.
- **Decision:** **no confirm on every save**, because entries are made many times a day and a sheet
  on each would be tapped through unread (Undo and Reverse cover routine mistakes). Instead, every
  form's "What this will do", the Journal's "What it did", Delete, Reverse and History use the
  confirm's label · amount rows. Confirms only where money moves somewhere the form's name doesn't
  say: card personal spend, cash-out, opening correction, profit paid above what's owed. Cosmetic
  only: every row comes from `postEntry`, and a test checks they add up. Not added (the user's
  choice): a server check refusing an opening correction while no partner is active.
- **Docs changed:** UIDD §3 (notes box), §4.6, §4.10, §5; `docs/TASKS.md` (CR-036).
- **Tasks:** CR-036.

## D-062 — Desktop sidebar: an icon on every link, no More (2026-10-16)
- **Source:** user feedback (2026-10-16): six sidebar links had no icon, and desktop doesn't need More.
- **Decision** (UI only): every sidebar link has an icon (Months calendar, Journal open book,
  Reports column chart, Saved details bookmark, Setup wrench, Settings gear). No More on desktop
  (≥ 1024px), since all its items are already on screen. The phone is unchanged. AI's Ask becomes
  its own sidebar link.
- **Docs changed:** UIDD §3; `docs/AI.md` §10; `docs/TASKS.md` (CR-037); `docs/TASKS-AI.md` (AI-2.3).
- **Tasks:** CR-037, AI-2.3.

## D-063 — Stock: an average cost per model (2026-10-18)
- **Source:** user feedback + answers of 2026-10-18: nothing showed a model's average cost across
  all suppliers (D-056's average is only in By model).
- **Decision** (display only; nothing stored): each Stock model row shows an average cost. In
  stock = of the units left (value ÷ units, so it always agrees with the value; it helps with
  pricing a sale). All lots = of everything bought, with "12 left of 40". Rounded with `avgUnit`.
  The Excel Stock sheet gets a Model avg cost column.
- **Docs changed:** PRD §4.3; UIDD §4.7; SRS §10.
- **Tasks:** CR-038; touches 4.2 and 6.4.1.

## D-064 — Charts, and the business value in the Books balance (2026-10-22)
- **Source:** user feedback + answers of 2026-10-22: no graphs (a customer's due over time, profit,
  expenses); the Books balance had no total business value. Charts move into scope (D-034 had them
  out), on Reports, not Home.
- **Decision** (display only; every figure has a tie-out test):
  - **Books balance:** Net worth on top; What we have → Business assets; What we owe → Total we
    owe → Net worth; Whose it is. The pack and the export use the same rows.
  - **Charts page** (`/reports/charts`): 4 tabs (Profit · Money · Customers · Stock), one period
    row, day view for ≤ 62 days, cards → detail pages with exact values; and a customer's Due trend.
    Recharts via shadcn Chart, loaded only on chart pages; `compact()` / `avgTaka()` for display.
  - **No two screens disagree:** each shared figure comes from the function of the screen that
    already shows it; differences are labelled.
  - Clarified 2026-10-23 / 2026-10-24 (CR-040 … CR-042): periods, "vs prev", whole months, the
    day view, position deltas (UIDD §4.17). 2026-10-24 (CR-043): Given = sales + cash given,
    Collected = payments, the rest is Other by kind; Top customers includes Walk-in; Last paid is
    the latest payment ever. CR-044: Stock age is always today's stock ("as of today"); an age's
    table row lists its models. 2026-10-27 (CR-046): Business value's table, tooltip and readout
    add Business assets (Cash + Stock + Customers owe, as the Books balance; not drawn, it is the
    bars' top), not assets ± card debt (card money is already in Stock/Cash; minus it is Net worth
    while suppliers are ৳0).
- **Docs changed:** PRD §4.3, §4.8; UIDD §2, §3, §4.2, §4.8, §4.17, §6; SRS §1, §3, §12; rules, CLAUDE.md.
- **Tasks:** CR-039 … CR-044, CR-046; AI-1.1 (note).

## D-065 — Per-task local tests; the full suites on CI (2026-10-24)
- **Source:** the user's request and choices of 2026-10-24. Amends D-047's per-CR E2E scope.
- **Why:** the full E2E took 23–25 min (312 tests, one worker; `a11y.spec` alone 12–13 min), each
  Playwright start rebuilt the app, and CI ran only on PRs, so it hadn't run since 2026-10-08.
- **Decision** (test process only): locally, a task runs typecheck, lint, unit, its own
  integration file(s), and its own + touched screens' E2E and a11y tests in one theme at 360 +
  1280. Every push to `dev` runs the full suites on CI (all themes, 3 E2E shards); "commit" means
  commit + push. A green full E2E before a deploy. Each `/next-task` checks CI first and fixes a
  failure first. No two sessions run local DB tests at once.
- **Docs changed:** `docs/TASKS.md` (Definition of Done); `.claude/skills/next-task/SKILL.md`;
  `CLAUDE.md`; `.github/workflows/ci.yml`.
- **Tasks:** none (test process).

## D-066 — Lighter docs, production keys out of the default env, tests named by feature (2026-10-24)
- **Source:** the project audit (§10) + the user's choices of 2026-10-24.
- **Why:** `.env.local` was production, so a plain `npm run dev` hit the live books; DECISIONS.md
  and TASKS.md had grown to ~1.7k lines each; tests were named by CR or phase.
- **Decision** (process only; no app or calculation change):
  - **Env:** `.env.local` = local Supabase; the production keys are in `.env.prod`, which Next
    never loads (the VPS keeps its own `.env.local`). The scripts refuse a non-local DB unless
    `CONFIRM_PROD=1` (`scripts/lib/script-db.ts`).
  - **Docs:** an index on top; v1 decisions in `docs/DECISIONS-v1.md`; an entry ≤ ~10 lines with
    the detail in the specs. TASKS' Now ≤ 5 bullets, reset at each deploy; finished CRs in
    `docs/TASKS-v1.1-done.md`.
  - **Tests** are named by feature, with the CR/test ids in the titles.
- **Docs changed:** `docs/DECISIONS-v1.md`, `docs/TASKS-v1.1-done.md` (new); `docs/TASKS.md`;
  UIDD §4.17, §6 (details moved from D-045, D-064); CLAUDE.md; the skills; `deploy/README.md`.
- **Tasks:** none (process).

## D-067 — A card number is saved on one card only; the card form formats as you type (2026-10-24)
- **Source:** user feedback after CR-031 (2026-10-12) + the user's answers of 2026-10-24.
- **Decision** (no calculation or posting change): a number already saved on any card (another
  card, or this card's other number) is refused, and the error names that card. The numbers are
  encrypted per card, so no DB index can check this: on save the server decrypts only the rows
  with the same `last4`. No order rule (a supplementary may come before the primary), no check
  against the card's Type, the holder stays optional. The form groups the number in fours and
  adds the "/" in MM/YY as you type (the numeric keypad has no "/"); a past expiry warns but
  saves. Amends D-054.
- **Docs changed:** SRS §4, §11; UIDD §4.14.
- **Tasks:** CR-045.

## D-068 — NestJS backend; Next.js stays the UI as a BFF over an internal API (2026-10-27)
- **Source:** user decision (the approved migration plan, 2026-10-27).
- **Decision:** a NestJS app owns all data, rules, crypto and files. Next.js keeps the same
  screens, URLs, cookies, messages and numbers, and calls Nest from its server only (127.0.0.1;
  nginx unchanged). Reads need a login; writes and files need `role=partner`. Nest verifies the
  Supabase token locally. Swagger at `/docs` runs in local dev only. Vitest stays the one test
  runner. The work happens in a new repo that ports from the old one, which stays the read-only
  reference until the production switch; each step cites its Ref files, and a parity harness
  compares the two builds.
- **Docs changed:** CLAUDE.md; `docs/TASKS-NEST.md` (new); the skills (`/next-phase` new);
  SRS §1/§2/§11–§13 and `docs/ARCHITECTURE.md` at N-6.2.
- **Tasks:** N-0.1 … N-7.2.

## D-069 — A public MIT repo with fictional data (amends D-014) (2026-10-27)
- **Source:** user decision (an open-source portfolio repo for interviewers, 2026-10-27).
- **Decision:** this repo starts from a cleaned copy with its own history and is published under
  MIT: private on GitHub first, public after the partners' consent. The real workbooks are never
  committed here (gitignored, deleted from disk in N-0.4). Real names, phones, the shop's details
  and the production domain become fictional ones or placeholders, and a synthetic card fixture
  with hand-checked balances replaces the real-workbook test. A gitignored denylist check, plus
  gitleaks before publishing, keeps them out. D-014's rule (no real rows in logs or tests) still
  holds.
- **Docs changed:** CLAUDE.md, `.gitignore`, `LICENSE`, `.env.example`, `docs/TASKS-NEST.md`;
  PRD §3/§7, SRS §6 and the other specs at N-0.4/N-0.5.
- **Tasks:** N-0.2 … N-0.6, N-6.3.

## D-070 — The opening-import tools are deleted here; the cutover stays in the reference (2026-10-27)
- **Source:** user decision in N-0.4 (S2).
- **Decision:** the template builder, the importer and `scripts/opening/*` (D-029), plus their two
  test files, are deleted here. Production already holds its opening rows, imported once from the
  reference, which keeps the tools. A fresh install starts empty, with no opening date and so no
  date floor. Opening entries, opening corrections and the opening difference are unchanged.
- **Docs changed:** SRS §1, §9, §12, §13; `docs/TASKS-NEST.md` (N-0.4).
- **Tasks:** CR-047.

## D-071 — The product is "Self-Balancing Bookkeeper"; the switch runs side by side (amends D-031) (2026-10-28)
- **Source:** user decision at the N-7.1 review (S10).
- **Decision:**
  - The product's name is **Self-Balancing Bookkeeper**: the docs, the passkey prompt, the
    fallback name before a business name is set, and the deploy names. The internal `@mbl/*`
    package names and the archived docs stay.
  - The production switch runs the new app **beside** the old one, on the same database. The old
    app is parked at `business-old.<domain>` (open, no extra password), and nginx switches the
    main subdomain with one port. Switching back is the same line reversed. The old app is removed
    after a week of watching. No database change: the migrations already ran.
  - So N-7.1's rollback to a single-app copy is dropped: the new app rolls back only to its own
    previous copy.
- **Docs changed:** CLAUDE.md, README, LICENSE, the titles of the living docs (PRD, SRS, UIDD,
  AI, the task files), ARCHITECTURE §8, `docs/v1.1-plan.md` (CR-019 fallback),
  `docs/TASKS-NEST.md` (N-7.1, N-7.2); `deploy/*` at CR-048.
- **Tasks:** CR-048.

## D-072 — The new app is tried on its own subdomain (amends D-071) (2026-10-29)
- **Source:** user request after the first production deploy (N-7.2).
- **Decision:** the new app is tried at `business2.<domain>` while the old one keeps the main
  host; nothing is parked at `business-old`. The pooler's Pool Size is 30 while both run: two
  pools of 10 don't fit in 15. No idle timeout, so D-032's speed is kept.
- **Docs changed:** `deploy/README.md`, ARCHITECTURE §8, `docs/TASKS-NEST.md` (N-7.2).
- **Tasks:** CR-049.

## D-073 — One owner or several partners (2026-10-30)
- **Source:** user request (the app should suit a business run by one owner, not only partners).
- **Decision:** a business has one or more partners whose profit shares total 100; a sole owner is
  one partner at 100%. The engine already allowed it (only zero partners is refused); CR-050 adds
  the tests and fixes the help texts that read as if there were always several. The demo and parity
  seeds keep two partners.
- **Docs changed:** PRD §4.1, SRS §4 (`people`), UIDD §3.
- **Tasks:** CR-050.
