# Mobile Business Lite — Tasks (v1, archived)

*Task breakdown · 7 October 2026* — implements `docs/PRD.md`, `docs/SRS.md`, `docs/UIDD.md`.
Decisions: `docs/DECISIONS.md`.

## Now
- **v1 is complete and archived here (2026-10-10).** Active work continues in `docs/TASKS.md` (v1.1,
  CR-015 onwards).
- `https://business.example.com` is live on the partners' VPS (D-030, D-031); CR-013 and CR-014 are
  deployed and the dark-mode phone check passed. The opening (1 Oct 2026) was imported on production
  on 2026-10-09 (6.2, 7.1). Releases: `git pull && bash scripts/deploy.sh` in `~/Mobile-Business-Lite`
  (deploy/README.md).
- **Open from v1** (carried into the new TASKS.md): 7.2–7.5, the manual go-live checks.
- Readings to confirm with the partners (6.1–5.5, not D entries): "Closing:" = the month after the last
  closed one, else the first month with entries (the opening month); Card alerts include overdue bills
  (first, "N days overdue"); 4.3 statements are newest first, and a supplier's statement puts "we owe
  more" in Credit (accounting convention); "last activity" = the latest entry that moved the due; 4.4
  card statements are newest first, and card bill dates are not entries (no month lock, future dates
  allowed); 4.5: a person's "capital" excludes their opening difference (shown beside it until the net
  total is 0); "cards supplied" = the cards they own; "Paid and reinvested" lists every entry that moved
  their profit owed (incl. opening) without a running balance (allocations are not entries);
  "Allocated" counts closed months only. 5.1: the close screen lists active investors (plus inactive
  ones still holding capital at month end), each with a cash and a card line; the cash rate also
  defaults from last month; a profit share "stands" unless it is a reversal or reversed (for the
  reminder). 5.2: the confirm's lock-warning wording is drafted (UIDD gives none); the snapshot stores
  Profit(M) with its breakdown (the allocations are their own rows). UIDD §3 has no About text for the
  close screen (none added). 5.4: "since the close" = profit paid/reinvested entries *created* after the
  close (`created_at`), whatever their date; the re-open confirm's wording is drafted (UIDD gives none).
  5.5: the warning's wording is drafted ("This is more than the profit owed (৳X). It can still be
  saved."); on edit, the profit owed shown is before the entry itself (its own amount is added back).
- **Done:**
  - 6.4: `server/export.ts` → `exportWorkbook(userId, asOf)`: one `repeatable read` transaction
    reads every table (a raw sheet each, named `<table> (raw)`: Excel sheet names ignore case, so
    "customers (raw)" stays apart from "Customers"), `loadBooksData` + `stockLots`, then writes the
    `export` audit row (`table = "export"`, no `row_id`, `after = {asOf}`). `lib/export.ts` builds
    the 7 summary sheets off `computeBooks` through the screens' helpers (`breakdown`,
    `stockByModel`, `accountRows`, `cardRows`), each ending in a Total row. Amounts are numbers
    (taka, 2 decimals, via `toDecimal`); dates are Excel dates; timestamps ISO (UTC) text; jsonb as
    JSON text. `POST /export/download` (route handler: `requirePartner`, 403 otherwise) returns
    `mobile-business-YYYY-MM-DD.xlsx`; `ExportButton` saves the blob and refreshes, so "Last export:
    10:42 by Arif" updates (`lastExport`). Readings to confirm (not D entries): the "cash" summary
    sheet is the balance breakdown (both sides of the invariant + the difference), not a cash
    ledger; the weekly note's wording is drafted (UIDD gives none). Tests: `tests/integration/
    export.test.ts` (I6.4.1), `tests/e2e/export.spec.ts` (E6.4.1, both viewports). Full E2E: 60
    passed, 2 viewport skips.
  - 6.3: the opening importer (a CLI script, later removed from this repo; in the reference implementation). Its template reader checks each sheet's header against
    `LAYOUT` and Zod-validates every row with the app's setup schemas and fields (`money("any")`
    added for signed balances); errors name sheet, row and column, never the value (D-014).
    The importer: names → ids (Stock models matched by the normaliser's key),
    duplicate setup rows, partners' % = 100, then one transaction: refuses a second import
    (any `opening` entry/lot) or a name already in the app; inserts people, cards, customers,
    suppliers, models, one opening purchase per Stock row, the `opening` money entries (0 = no
    entry); books the residual from `computeBooks` as `opening_difference` per partner
    (`splitShares`, partners by name); links `profiles.person_id` by name (1.4.3). Prints the
    balance check (totals only) and ✓/✗. Import rows have `created_by` null (no session). Readings
    (not D entries): a bad reference is caught before the transaction (nothing written); EMI
    months need an amount > 0; a 0 balance writes no entry. The real template is refused today
    (blank owners/days/persons to fill in 6.2). Tests: I6.3.1–4 (the importer's integration tests).
  - 6.1 + CR-010: the opening-template builder (a CLI, later removed from this repo) writes
    `opening-template.xlsx` (gitignored): the SRS §9 sheets from its layout (one source for 6.3), amber cells + an Issues row per flag; prints
    counts only. Its workbook reader reads the owners' Excel workbook (stock incl. the row below
    SUM, outside money → investors / card balances / "classify", Total cash, Milon's last Total
    Due + anomalies, Sheet6 C10/I9, the ৳12,400 gap); `normalise.ts` groups model names (trim,
    case, spaces) and flags near-identical ones (one edit apart or a prefix) and non-15-digit
    IMEIs. Nadim's 7 cards + unpaid bills come from `cardSummaries` over the investor card fixture, which
    now reads every dated Transactions row (still 26). Tests: U6.1.1 (synthetic strings). Today's build: 64 issues.
  - 5.6: `tests/e2e/phase5.spec.ts` (360px + 1280px). The next month to close depends on every
    entry in the DB, so the spec empties the tables first (`truncateAll`, as test:int does on the
    same local DB) and re-links the partner's profile (`linkPartner`, now exported from
    `global-setup.ts`). It seeds Arif/Sumon 50/50 and a 1,000 cashback in October 2025, then:
    close October (Arif ৳500 in the split) → its 3 entries show Locked in the Journal → profit
    paid ৳500 to Arif (picker shows "Profit owed ৳500", no warning; Home "Balanced") → re-open
    lists it in the warning → October is open, nothing locked. No app code changed. Full E2E: 58
    passed, 2 viewport skips (~5.6 min).
  - 5.5: `server/books.ts` → `moneyFormBalances` (customer dues + each person's profit owed, one
    `computeBooks`); the money pages pass `owed`. `money-form`: profit paid/reinvested's person
    picker shows "Profit owed ৳X"; `AboveOwed` shows an amber warning (never a block) when the
    amount exceeds it. The action already saved any amount. Tests: `tests/integration/
    profit-actions.test.ts` (I5.5.1: S10 through the action, and an amount above the profit owed
    saves; books-balance invariant in both). Checked at 360px + 1280px with a throwaway spec
    (deleted, its rows removed).
  - 5.4: `server/actions/months.ts` → `reopenMonth` through `runAction` (op `delete`, new
    `audit: "reopen"`): under `lock table month_closes`, only the latest closed month ("Only the
    latest closed month (X) can be re-opened"); deletes its `allocations` and `month_closes` row;
    the audit "before" = the close (with its snapshot) + its allocations. `server/months.ts` →
    `profitSinceClose` (profit paid/reinvested created after the close), `loadClose` also returns
    `id`/`updatedAt`. `components/months/reopen-month.tsx`: Re-open (latest closed month only) →
    a confirm with the amber "since the close" list → refresh to the close screen. Tests:
    `tests/integration/reopen-actions.test.ts` (I5.4.1, I5.4.2; books-balance invariant in both).
    Checked at 360px + 1280px with a throwaway spec (deleted, its rows removed).
  - 5.3: every create/edit/delete path (purchase, sale, return, money, reverse) already ran the
    2.9.2 date + lock guards through `runAction`; card bill dates and Setup rows are not entries
    (no lock). `runAction` now returns the lock error first for a locked row, so an entity guard's
    `form` message (e.g. a lot's) can't replace "… — reverse it instead". The Journal's 🔒 (3.8)
    already used `isLocked`. Tests: `tests/integration/lock-actions.test.ts` (I5.3.1: create /
    edit / delete of each entry type dated in, or for, a month closed through `closeMonth`;
    I5.3.2: S18 with the reverse dialog's default; books-balance invariant in both).
  - 5.2 + CR-009 (D-028): `server/actions/months.ts` → `closeMonth` through `runAction` (new
    `audit: "close"` option): under `lock table month_closes`, `closeErrors` (already closed /
    hasn't started / "Close X first") and the partner-% check (`partnerWarning`, D-023); investor
    lines must be distinct investors; Profit(M) is recomputed in the transaction
    (`loadBooksData(tx)`, now takes a transaction); investor rows via `readLine` (lines with no
    amount or basis 0 skipped), partner rows via `computeClose`; the `month_closes` row (snapshot
    = `MonthProfit`, close date = today Dhaka, `closed_by`) and the `close` audit row (after = the
    close + its allocations). `lib/months-view.ts` → `readLine` (shared by the form and the
    action); `lib/guards.ts` → `closeErrors`. `close-form`: Close month button (disabled while a
    line has an error) → confirm modal with the lock warning; server line errors show on their
    lines. `components/months/month-snapshot.tsx` (`Breakdown`, shared with the close screen;
    `ClosedAllocations`); `/months/[month]` shows a closed month read-only; `server/months.ts` →
    `loadClose`; the Months list links closed months. Tests: `tests/integration/
    close-actions.test.ts` (I5.2.1–3, I-CR-009.1–2, books-balance invariant in each), unit
    U-CR-009.1–3. Checked at 360px + 1280px with a throwaway spec (deleted, its rows removed).
  - 5.1: `lib/months-view.ts` (pure): `monthList` (newest first; the next month to close is
    always listed; "Open" / "Closed on dd Mon" from `month_closes.close_date`), `breakdownLines`
    (each profit component; expenses by category, only those used; the lines sum to Profit(M)),
    `parseRate` (≥ 0, ≤ 3 decimals), `investorLines` (cash basis = capital at month end via
    `computeBooks(data, month end)`; card basis and rates from the M−1 allocations, blank the
    first time; amount = `pct`), `shareReminders`, `closeScreen`. `EXPENSE_LABELS` moved to
    `validation/fields.ts` (the expense form and the breakdown share it). `server/months.ts` →
    `loadCloses`. `components/months/`: `month-list`, `close-form` (client: basis × rate % =
    amount, the amount follows until typed over; inline errors; total to investors; the partner
    split live through `computeClose`; a card per line at 360px, a table at ≥ 1024px; field
    names `allocations.N.*` ready for 5.2). Pages `/months`, `/months/[month]` (the next month to
    close only; else 404), with the Setup partner-% warning. Tests: `tests/engine/
    months-view.test.ts` (7, with the books-balance invariant). Checked at 360px + 1280px with a
    throwaway spec (deleted, its rows removed). No close button yet (5.2).
  - 4.6: `tests/e2e/phase4.spec.ts` (360px + 1280px). E4.6.1 reads the Home tiles, then runs
    purchase (supplier credit) → sale → customer return → payment in (7,000 of 12,000) → cash-out
    (20,000 charged / 19,600 received) → card payment (15,000) → expense (500 delivery, paid by
    the run's card) through the UI; Home then shows "Balanced" and each tile moved by exactly
    those entries (cash, stock + units, customers owe, we owe suppliers, card dues overdue / 7
    days via a seeded `card_bill_dates` row due in 3 days, this month's profit). E4.6.2 seeds one
    card per status (all 7 badges) and checks the stacked list at 360px and the 10-column table
    at 1280px. `playwright.config.ts` → `workers: 1` (one shared DB; Home totals every row). No
    app code changed. Full E2E: 56 passed, 2 viewport skips (~5.3 min).
  - 4.5: `engine/customers.ts` → `dueStatements` also takes `capital` and `profit_owed`.
    `lib/people-view.ts` (pure): `peopleRows` (Setup order; capital, profit owed,
    `openingDifferenceOf` = their share while unresolved), `personDetail` (capital history
    newest first; closed months' allocations; profit owed moves; `ProfitSummary` = allocated +
    opening − paid − reinvested = owed, split by the Journal's entry type).
    `components/accounts/statement.tsx` takes `kind="capital"` (In / Out) and an aria `label`.
    `components/people/`: `people-list` (stacked rows at 360px, table at ≥ 1024px; the Opening
    difference column only while one is unresolved), `people-detail` (cards supplied "Owner ·
    Card" with balance + status, allocations per month with basis × rate, profit moves). Pages
    `/people`, `/people/[id]`. `shell.spec.ts` checks `/people` at 360px and the People tab.
    Checked at 360px + 1280px with a throwaway spec (deleted, its rows removed).
  - 4.4: `engine/cards.ts` → each `CardSummary` also has `moves` (every card effect: + charge
    with its bill month, − credit) and `emiPlans` (total, months, billed, remaining;
    `remainingEmi` = Σ remaining). `lib/card-view.ts` (pure): `STATUS` (badge label + tone),
    `available`, `cardRows` (Setup order; credit limit parsed), `cardDetail` (newest first).
    `help-text.ts` → `viewHelp.available` (UIDD §4.8 ⓘ). `components/info-note.tsx` (a view ⓘ).
    `server/cards.ts` → `cardDetailData(id)` (bill-date rows with `updatedAt`; EMI items =
    the purchase's models). `server/actions/cards.ts` → `saveBillDates` (insert/edit through
    `runAction`, audit; a second row for the same bill → refused) and `deleteBillDates` (Undo).
    `components/cards/`: `card-list` (stacked cards at 360px, full table at ≥ 1024px,
    `StatusBadge`), `card-bills` (statements; a bill → the "Card bill dates" modal),
    `card-detail` (charges/credits, EMI plans). Pages `/cards`, `/cards/[id]`. The Accounts
    list pages got an sr-only `<h1>`; `shell.spec.ts` now matches headings exactly (its
    "Customers" check had been matching Home's "Customers owe"). Checked at 360px + 1280px
    with a throwaway spec (deleted, its rows removed); shell/smoke E2E green.
  - 4.3: `lib/accounts.ts` (pure): `accountRows` (balance + last activity off `dueStatements`,
    by name), `searchRows` (any term, any case), `statementLines` (newest first; `up`/`down`),
    `supplierDueText` ("We owe ৳X" / "Credit ৳X" / "No due"), `billProfit` (the bill's own
    `postEntry` profit effects). `server/accounts.ts` → `customerBills(id)` (sales, not
    reversals, newest first, with lines: model, qty, unit price, lot cost; `reversedBy`).
    `components/accounts/`: `account-list` (client search; Inactive badge), `statement`
    (phone rows / ≥ 1024px table: Date · Entry · Debit · Credit · Balance; a row → Journal),
    `bills` (lines, total, profit, "Reversed"), `account-header` (back, name, due, tel/mailto,
    address). Pages: `/customers`, `/customers/[id]` (`?tab=bills`; "Above target" green
    ≤ 0), `/suppliers`, `/suppliers/[id]`. Home's top dues link to the customer. Checked at
    360px + 1280px with a throwaway spec (deleted); shell/smoke E2E green.
  - 4.2 + CR-008 (D-027): `engine/stock.ts` → `lotsRemaining` is generic (keeps extra lot
    fields) and returns each lot's net `sold`, `returned` (customer) and `toSeller` (purchase
    returns), reversals negated. `server/stock.ts` → `stockLots` also returns `imeiNote`,
    `source` and `fromId` (card / customer / supplier of the purchase). `lib/stock-view.ts` →
    `stockByModel` (pure: drops a reversed purchase's lots; in stock = left ≠ 0; search model
    name or IMEI/note, any case; models by name, lots oldest first; units + value at cost over
    the lots shown). `components/stock/stock-list.tsx` + `app/(app)/stock/page.tsx`: search,
    In stock / All lots toggle, a `<details>` per model (open while searching); lots as cards on
    a phone ("5 left of 10", "Sold · Returned · To seller") and a table at ≥ 1024px. Journal
    `labels.ts` exports `DETAIL` (source labels). Tests: U-CR-008.1 (with the books-balance
    invariant and lot value = posted stock), `tests/engine/stock-view.test.ts`. Checked in the
    app at 360px + 1280px with a throwaway spec (deleted); sale/return/smoke E2E still green.
  - 4.1: `src/server/books.ts` → `loadBooksData()` (every fact table → `BooksData`: entries
    sorted by date, created_at; lines by created_at; money via `parse`; active partners by name,
    as the forms order them), `loadBooks(asOf = today)` and `customerDues()`. Engine:
    `months.ts` → `nextToClose(closed, firstDate, today)`; `dates.ts` → `daysBetween`.
    `src/lib/dashboard.ts` (pure): `cardAlerts` (unpaid bills by due date, overdue first),
    `cardDues`, `topDues` (owing only, with `aboveTarget`), `breakdown` (both invariant sides).
    Home (`app/(app)/page.tsx`): cash (red + "Cash went negative on …", D-018), stock (value +
    units from `stockLots`), customers owe, we owe suppliers, card dues (overdue / 7 days), this
    month's profit, opening difference while unresolved; lists: card alerts (5), top customer
    dues (5), recent 10 entries → `/journal?entry=`. `components/amount.tsx` (`Amount`: red when
    negative). `components/shell/balance-chip.tsx` (✓ Balanced / ✗ Off by ৳X → a sheet with both
    sides; reuses the now-exported `NavSheet`). The layout loads the books for the chip and
    "Closing: Mon YYYY". 4.1.5: `lib/setup.ts` → `dueText` ("Owes ৳X" / "Credit ৳X" / "No due");
    Purchase (Customer's due), Sale and Customer discount pickers show it (forms take `dues`).
    Tests: `tests/integration/books.test.ts` (I4.1.1–2: a synthetic scenario over every table
    incl. a closed month, EMI, write-off, reversal, opening correction), `tests/engine/
    dashboard.test.ts`; `shell.spec.ts` checks the real "Closing: …" label. Full E2E: 52 passed,
    2 viewport skips (`--workers=1`).
  - 3.9: `tests/e2e/phase3.spec.ts` (360px + 1280px). E3.9.1 runs purchase (supplier credit) →
    sale (the auto lot line shown) → customer return → payment in through the UI; for each, the
    form's "What this will do" lines equal `previewEntry` of the stored rows (read back from the
    DB), and the four entries balance with the customer's due back to 0. E3.9.2 purchase Save →
    Undo; E3.9.3 a second identical payment in → the duplicate dialog → Save anyway; E3.9.4 "Only
    12 left in this lot" (Choose lot), "Date can't be in the future", "Cash received can't exceed
    amount charged". No app code changed. Full E2E: 52 passed, 2 viewport skips (~4.3 min,
    `--workers=1`).
  - 3.8 + CR-007 (D-026): `src/server/actions/reverse.ts` → `reverseEntry({id, table,
    reversesId, date, forMonth?})`: copies the header and its lines (same lots / sale lines; a
    purchase reversal's lines are not lots) with `reverses_id`, on the chosen date (for_month
    only if the original has one). Guards: `reverseErrors` (a reversal, already reversed, live
    dependents: sales/returns that aren't reversals or reversed), a customer return's units
    sold again (stock ≥ 0), `reversalDateErrors`. `runAction` gained `isReversed(tx, table, id)`
    (the deletes use it) and runs `pairEditErrors` on every edit (D-026); `loadCalendar(db)`
    works outside a transaction. Deletes: `deleteSale` checks its lots stay ≥ 0 (a sale
    reversal's units sold again); `deleteReturn` does it for every kind and blocks a
    customer-return reversal once its bill was reversed. `engine/stock.ts` → `lotsRemaining`: a
    reversed lot = its live moves (normally 0), so a revived sale shows below 0. Journal:
    `src/server/journal.ts` → `loadJournal()` (the four tables, newest first: total,
    counterparty ids, `reversesId`/`reversedBy`, `locked`) and `loadEntry(id)` (+ lines, audit
    history, calendar). `src/server/entries.ts` → `editValues(table, id)` (the stored entry as the
    form's text: money via `plain()`, months "YYYY-MM"; purchase/sale `lines`, a return's line as
    `lines.0.*` + `saleId`). `lib/audit.ts` → `auditChanges(before, after, names)` (History: field
    old → new, lines summarised). `lib/setup.ts` → `setupNames(data)` (the forms use it);
    `money.ts` → `plain()`. Forms: `FormBody` takes `initial` → the `FormInitial` context, which
    `TextField`/`DateField`/`PickerField` start from; each form takes `edit?: EditValues` (title
    "Edit …", `updatedAt` in meta, no Undo, closes to `/journal?entry=<id>`; money: type fixed, no
    chips; return: kind fixed; sale: stored lines open with their lot chosen, no Received now).
    `returnOptions(exceptReturnId)`. Routes: `/purchases|sales|returns|money/[id]/edit`.
    `components/journal/`: `labels.ts` (`entryLabel`, `whoOf`, `editPath`, `isOpening`),
    `journal-list.tsx` (filters: type, counterparty, from/to, month; a bottom sheet on a phone;
    🔒 / Reversal / Reversed badges; "Reversed by …" / "Reverses …" links) and
    `entry-detail.tsx` (`/journal?entry=<id>`: Details · History; Edit (not locked, not paired,
    not opening) · Delete (not locked) · Reverse (not paired; date from `defaultReversal`)).
    Tests: `tests/integration/journal-actions.test.ts` (I3.8.1–4, I-CR-007.1–3, S18-style
    reversal), `tests/engine/audit.test.ts`, `guards.test.ts` (U-CR-007.1), `stock.test.ts`,
    `tests/e2e/journal.spec.ts` (filter → reverse, money edit + History + Delete, sale edit keeps
    its lot, purchase/return edit; 360px + 1280px). `src/db/index.ts` keeps one client on
    globalThis under `next dev`: each compiled route loaded its own pool, and the full E2E run
    hit "too many clients" (100). The full suite now passes with `--workers=1` in ~3 min.
  - 3.7: `src/server/actions/money.ts` → `saveMoneyEntry` (add, or edit with `updatedAt`; the
    type can't change; every column the type doesn't have is stored null) and `deleteMoneyEntry`
    (Undo; not with a reversal). Duplicate = same type, date, amount and customer/supplier/card/
    person. Walk-in is rejected for cash given and profit share (D-009). `components/money/`:
    `types.ts` (the form's types and labels; `isFormType` for `?type=`) and `money-form.tsx`
    (`MoneyForm`, a `FormModal` on `/money/new?type=…&supplierId=…`; no type → a type picker;
    Capital in/out and Profit paid/reinvested switch with chips; Cash/Card + card; For month
    (profit share: last month; expense: follows the date until changed); cash-out's live fee;
    opening correction: what was wrong → its target → signed change, preview per partner;
    "+ Add new" on the pickers). `Choice` (chip radios) moved from the return form to
    `forms/field.tsx`; a field's label now fills its 44px row (the shell's tap-target check).
    Deferred: the discount's customer due → 4.1.5; profit owed + its warning → 5.5.1. Tests:
    `tests/integration/money-actions.test.ts` (I3.7.1–4 + Walk-in, duplicate, edit, Undo),
    `tests/e2e/money.spec.ts` (cash-out, expense, supplier tip, capital chips + type picker;
    360px + 1280px). `shell.spec.ts` closes the money modal before navigating on.
  - 3.6 + CR-006: `src/server/actions/return.ts` → `saveReturn` (add, or edit with `updatedAt`;
    the kind can't change) and `deleteReturn` (Undo). Customer return: the bill lines and their
    sales are locked (`FOR UPDATE OF sl, s`) before the lots; each line must be the customer's,
    from a bill that isn't reversed (or a reversal), qty ≤ sold − returned ("Only N left to
    return on this line"), date ≥ the sale; the return line takes the sale line's lot. An edit
    to fewer, or Undo, can't leave a lot below 0 (units sold again). Purchase return: one
    purchase's lots, qty ≤ remaining ("Only N left in this lot"), date ≥ the purchase.
    Duplicate = same kind, counterparty, refund total and date; a write-off matches on the same
    lot + qty instead (D-025). `stockLots` gained `lotIds` and `exceptReturnId`.
    `src/server/returns.ts` → `returnOptions()` (bill lines of unreversed sales with `left`; lots
    with stock + their purchase's source/counterparty). `components/return/return-form.tsx`
    (`ReturnForm`: a `FormModal` on `/returns/new`, closing goes home; Customer: customer →
    bill → line → qty → refund (sale price); Purchase: reason chips → lot → qty → refund (lot
    cost, D-025; hidden 0 for damaged / lost) → refund goes to (the lot's source, none for
    opening lots) + its picker). Tests: `tests/integration/return-actions.test.ts` (I3.6.1–5 +
    duplicate, Undo, edit, sold-again), `tests/e2e/return.spec.ts` (both kinds, 360px + 1280px).
    Note: the full E2E suite is flaky in parallel (dev-server load: timeouts, ECONNRESET);
    `--workers=1` passes all 28.
  - 3.5: `src/server/actions/sale.ts` → `saveSale` (add, or edit with `updatedAt`) and
    `deleteSale` (Undo). The lots: `src/server/stock.ts` → `stockLots(q, {modelIds,
    exceptSaleId, lock})` (lots with `remaining`, via `lotsRemaining`; `lock` = `FOR UPDATE OF`
    the lots) and `lastSaleCustomerId()`. `engine/stock.ts` gained `planSale(lots, lines, date)`
    (chosen-lot lines first, then oldest first; each line from what the others left; errors
    "Only N left" / "Only N left in this lot" / "This lot was bought after the sale date" on
    `lines.i.qty|lotId`); the action and the form share it. A sale line may carry its stored `id`
    (edit: it keeps its lot, D-004); a line split over lots → one sale_line per lot. Edit guards:
    a returned line can't be removed, change lot or go below the returned qty; the date can't
    pass the bill's first return; Received now only on a new bill. "Received now" = a
    `customer_payment` with the client's `paymentId`, same date, same transaction, its own audit
    row; Undo sends `paymentId` and deletes both (the payment must still have the bill's
    `updatedAt`). Duplicate = same date, customer and bill total. `components/sale/sale-form.tsx`
    (`SaleForm`: customer defaults to the last used, model "· N in stock", lot preview, "Choose
    lot", line total/profit, footer total · profit, preview incl. the payment). `FormBody` now
    provides `FormValues` (the current fields) to its children; `Reread` and `LinesError` moved
    to `forms/field.tsx`. The customer balance under the picker moved to 4.1.5. Tests:
    `tests/integration/sale-actions.test.ts` (I3.5.1–5 + duplicate, flat input, returned-line
    edits), `tests/e2e/sale.spec.ts` (E3.5.6 + the form, Received now, Undo), `planSale` unit
    tests in `tests/engine/stock.test.ts`. The Edit UI comes with 3.8.
  - 3.4: `src/server/actions/purchase.ts` → `savePurchase` (add, or edit with `updatedAt`) and
    `deletePurchase` (Undo; 3.8 adds Journal delete/reverse). Input may be flat FormData
    (`lines.0.qty`): `nest()` in `validation/fields.ts` turns it into the schema's shape, and Zod
    error paths join back to the same field names. Duplicate = same date, source, counterparty
    and bill total. Guards: Walk-in for customer_offset (D-009); on edit, with the lots locked
    `FOR UPDATE`: a sold/returned lot can't be removed, its qty can't go below what was used,
    `lotEditErrors` for cost/qty, and a changed date can't pass its first sale/return.
    `runAction` gained `before(tx, current)`: the audit "before" with the lines (3.5/3.6 reuse
    it). `components/purchase/purchase-form.tsx` (`PurchaseForm`, mounted after hydration so the
    browser makes the ids; `Reread` refreshes the preview when fields mount/unmount; Opening
    correction + bill month under Advanced). Supplier-credit tip: a toggle that, after saving,
    goes to `/money/new?type=supplier_payment&supplierId=<id>` — 3.7 must read `supplierId`.
    Edit UI (initial values) comes with 3.8. Tests: `tests/integration/purchase-actions.test.ts`
    (I3.4.1–3 + flat input, duplicate, edit sync, Undo) and `tests/e2e/purchase.spec.ts`.
    Note: the dev server opens up to ~64 DB connections under E2E; a cold-compile run can hang
    a save (seen on model saves), a warm one passes.
  - 3.3 + CR-005: `components/forms/`:
    - `form-body.tsx` (`FormBody`, shared by `FormModal` and the new `FormPage`): props
      `preview(fields)` and `total(fields)` (fields = FormData + `meta`, re-read on every change;
      a picker reports through the `FormChanged` context), `undo({id, updatedAt})` for new
      entries, `onSaved`, `savedMessage`. It handles the duplicate dialog (View it →
      `/journal?entry=<id>`, which 3.8 must open; Save anyway resends with `confirmDuplicate:
      true`), "Not saved — tap Save again", and the toast.
    - `form-page.tsx`: full page with the sticky footer above the tab bar; it goes to `done`
      (default "/") after a save.
    - `notes-box.tsx`: About + "What this will do".
    - `toast.tsx`: `Toaster` in the `(app)` layout + `useToast()`. 8 s; Undo; it sits under
      open sheets.
    - `picker.tsx`: `PickerField` (bottom-sheet search, hidden input, option `hint`, `add` = an
      add form whose `onSaved` selects the new id).
    - `field.tsx`: `MoneyField`, `QtyField`, `DateField`.
  - `src/lib/preview.ts` → `previewEntry(entry | null, names, partners)` (null while postEntry is
    missing a pick) and `previewLines`. `Names` = id → display (`cardName`, `customerName`). The
    entry forms: Zod `safeParse` of the fields → `previewEntry`. `dates.ts` gained `formatStamp`.
    `help-text.ts` has the 14 entry-form ⓘ keys.
  - Also: `components/states.tsx` (`EmptyState`, `SkeletonRows`), `(app)/loading.tsx`. The Setup
    card owner is now a `PickerField` with "+ Add new" person. The Setup lists use `EmptyState`.
    E2E `setup.spec.ts` gained a 3.3 picker test.
  - 3.2 + CR-004: `src/server/actions/setup.ts` → `savePerson/Card/Customer/Supplier/Model`
    (add without `updatedAt`, edit with it), `setActive(kind, …)`, `removeRow(kind, …)`, all via
    `runAction`. Guards: uniqueness → a field error; Walk-in (`is_system`) → `BUILT_IN`; delete of a
    row any FK points at (found from the schema's foreign keys) → `USED` ("deactivate instead").
    No partner-total check on save. `src/server/setup.ts` → `loadSetup()` (lists with ISO
    `updatedAt`, `display`, `shopNameMissing`, `partnerWarning`). `src/lib/setup.ts` (pure):
    `customerName`, `cardName`, `partnerWarning`, `setupKinds`, `USED`, `BUILT_IN`. The form shell
    (3.2.6): `components/forms/form-modal.tsx` (`FormModal`: bottom sheet, About box per the
    Form-help setting, inline errors via the `FormErrors` context, Save spinner, "Not saved — tap
    Save again", `formErrorAction`) and `components/forms/field.tsx` (`Field` with ⓘ,
    `TextField`, `inputClass`). `help-text.ts` gained `fieldHelp` (Setup ⓘ, from the new UIDD §3
    table). Setup UI: `/setup?tab=person|card|customer|supplier|model` →
    `components/setup/setup-section.tsx` (list, badges, search, ⋯ menu, delete confirm) and
    `setup-forms.tsx`. The card owner is a native `<select>` for now; 3.3 brings the combobox.
    `tests/e2e/setup.spec.ts` (extra, not in the task list) covers the modal at 360px and 1280px.
  - 3.1: `src/server/action.ts` → `runAction(spec, input)`. `spec` = `op` (insert · reverse ·
    update · delete; Undo = delete), the header `table`, the Zod `schema` (`byId` for a delete),
    optional `duplicate(values) → SQL` (insert only), `guards` and `write`. Order: requirePartner
    → Zod → one transaction: lock the row by id (`FOR UPDATE`); edit/delete with a stale or
    missing `updatedAt` → `conflict`; insert of an existing id → `ok` (no-op) → duplicate (unless
    `confirmDuplicate`; `by` = the creator's profile name) → guards → write → audit row →
    `revalidatePath("/", "layout")`. The date guards (`dateErrors` on the new values,
    `editErrors` on the stored row) always run for dated rows; entity guards add the rest.
    `loadCalendar(tx)`: today (Dhaka), opening date = the earliest `opening` money entry or
    opening lot, last closed = max `month_closes.month`. Results: `ok {id, updatedAt}` ·
    `duplicate {id, by, at}` · `conflict {message}` · `invalid {errors}` (Zod path → message,
    "form" for whole-form). The audit `before` is the header row; header+lines actions (3.4–3.6)
    return lines in their `write` "after" and may need a fuller "before". `money.ts` gained
    `toDecimal(poisha)` (DB numeric text).
  - 2.10: `zod` v4 is a direct dependency. `src/lib/validation/`: `fields.ts` (input = form text,
    "" = empty; output = poisha via `money.parse`, "YYYY-MM-DD", "YYYY-MM", null; `money(sign)`,
    `int`, `pick`, `optional`, `EXPENSE_CATEGORIES`, `CARD_FEE_CATEGORY`), `money-entry.ts`
    (`moneyEntrySchema`, discriminated on `type`; unknown fields are dropped, a cash source
    drops the card; card_cash_out amount = card_charged; expense for_month defaults to the date's
    month; opening_correction keeps only its kind's target), `trade.ts` (`purchaseSchema`,
    `saleSchema` with `receivedNow`, `returnSchema` on `kind`; damaged/lost → refund 0, no
    target), `setup.ts` (person, card, customer, supplier, model, card bill date). `opening`
    (money type and purchase source) is not in the form schemas: only the import (SRS §9) writes
    it. The output + `table` feeds `postEntry` directly (the preview).
  - 2.9: `src/lib/guards.ts` (pure; each returns field → UIDD §5 message, `{}` = allowed; `form`
    = whole-form error). `Calendar = {today, openingDate, lastClosed}`. `dateErrors` (future,
    opening date/month, for_month ≤ date's month, closed month), `isLocked`, `editErrors`,
    `reverseErrors`, `defaultReversal`, `reversalDateErrors`, `deleteErrors`, `lotEditErrors`,
    `walkInErrors`. The action (3.1) reads the dependent facts (`reversed`, `hasDependents`,
    lot sale/return dates) from the DB and passes them in. `dates.ts` gained `formatMonth` /
    `formatDate` (UIDD §2).
  - 2.8: `src/lib/engine/balance.ts` → `balance(posted, profitBooks, asOf)` (totals, capital and
    opening difference per person + `resolved`, the invariant `{netAssets, equity, difference}`,
    `firstNegativeCash`). `src/lib/engine/index.ts` → `StoredEntry`, `BooksData`,
    `toPosted(entry, partners)` and `computeBooks(data, asOf)` (+ `posted`, customer/supplier
    statements, card summaries, months). The import's residual = `invariant.difference` before
    the opening difference is booked. Tests: `tests/engine/invariant.ts` has the one shared
    `expectBalanced` (via `balance`) and `posted` (via `toPosted`), used by every scenario test.
  - 2.7: `src/lib/engine/months.ts` → `monthProfit(posted, month, asOf)` (total, `components`,
    `expenses` by category), `profitBooks(posted, allocations, closed, asOf)` (Months list, owed
    per person, undistributed; closed months = stored allocations), `computeClose(profit,
    investorAllocations, partners)` → partner rows. Profit effects from `postEntry` now carry
    `component` (+ `category` for expenses). `computeBooks` reuses `profitBooks`.
  - CR-003: `cards` is unique on `(owner_person_id, name)` (migration
    `0002_cards_name_per_owner.sql`); the investor card fixture's City Amex uses 28/12.
  - 2.6 + CR-002: `src/lib/engine/cards.ts` → `cardSummaries(posted, cards, billDates, asOf)`.
    `Posted` has optional `billMonthOverride` / `emiMonths` (`toPosted` copies them from the
    entry); the card fixture then loaded the real workbook with ExcelJS (synthetic since N-0.4).
- **Blocked on:** —

## How to use

- `[ ]` = to do, `[x]` = done. A task is ticked only when all its subtasks, tests and acceptance
  criteria are done.
- **IDs:**
  - Task = `P.T` (phase.task); subtask = `P.T.S`.
  - Tests = `U` unit · `I` integration · `E` end-to-end · `M` manual, plus the task id (e.g.
    `U2.1.3`).
- Each task cites its doc sections (**Refs**). In normal flow, read only those. When something
  looks off, read the full related docs and code (D-019).
- `/next-task` updates **Now** at the end of each session, so a new session starts from there.
- 👤 = a step only the user can do (accounts, passwords, real data, hosting choice).
- Run a task with `/next-task [id]`. Record feedback or a change with `/change-request <text>`.

## Workflow (docs are the source of truth)

1. **Docs before code.** If the code needs to differ from PRD/SRS/UIDD, the docs change first.
2. **Feedback or a scope change** → a new **CR task** at the bottom of this file. If it changes a
   rule, add a **D entry** in `DECISIONS.md` first, then the docs, then the code.
3. **Misalignment** (the docs conflict, are ambiguous, or don't match reality) → **stop and tell
   the user**. Don't guess. The resolution is logged as a D entry, with Source = misalignment.
4. Anything beyond PRD §4 needs the user's explicit OK.

## Principles

- **KISS:**
  - plain functions, server components and server actions;
  - no state library, no caching, no repository/service layers, no generic form builder (beyond
    the one money-entry form the UIDD specifies).
- **DRY:**
  - one source per rule: `money.ts`, `dates.ts`, `postEntry`, `help-text.ts`, and the action
    helper;
  - extract a shared piece only at the **3rd** repetition.
- **YAGNI:** nothing beyond PRD §4. No v2 hooks except the role column the SRS already has.
- **Small files:**
  - aim for ≤ 500 lines, hard cap 1000 (ESLint `max-lines`);
  - generated files are exempt;
  - split by responsibility.

## Definition of Done (every task)

- [ ] The task's listed tests are written and green.
- [ ] Engine and integration scenarios assert the **books-balance invariant**.
- [ ] `npm run typecheck` and `npm run lint` are clean (incl. `max-lines`).
- [ ] Every form has its About text in `src/lib/help-text.ts` (UIDD §3).
- [ ] The docs still match the code. If not, a D entry is written and the docs are updated first.
- [ ] Real workbook data never appears in logs, test output or fixtures committed outside
  `docs/source` (D-014; removed from this public repo, D-069).

---

## Phase 0 — Docs & workflow

- [x] **0.1 Resolve spec gaps.** D-001…D-018 are recorded in `DECISIONS.md`.
- [x] **0.2 Apply the decisions to the docs.** PRD/SRS/UIDD are at v1.1.
- [x] **0.3 Claude Code setup (D-012).**
  - Lean `CLAUDE.md`.
  - `.claude/skills/next-task`, `.claude/skills/change-request`.
  - `.claude/rules/money-engine.md`, `.claude/rules/db-actions.md`.

---

## Phase 1 — Scaffold (SRS §13 step 1)

**Exit:** the app runs locally, login works for the 2 partners, every test command runs, and CI
is green.

- [x] **1.1 Next.js app**
  - **Refs:** SRS §1, §12; D-013.
  - [x] 1.1.1 Next.js 15 (App Router, TS strict), ESLint (with `max-lines`: 1000, skip blank lines
    and comments; generated files ignored), Prettier.
  - [x] 1.1.2 Tailwind + shadcn/ui init; dark theme follows the system (UIDD §6).
  - [x] 1.1.3 Folders as in SRS §12; npm scripts `dev`, `build`, `typecheck`, `lint`, `test`,
    `test:int`, `test:e2e`.
  - **Acceptance:** `npm run dev`, `build`, `typecheck` and `lint` succeed on an empty app.
- [x] **1.2 Test tooling**
  - **Refs:** SRS §1, §14; D-001.
  - [x] 1.2.1 Vitest with two projects: `unit` (`tests/engine`, no DB) and `integration`
    (`tests/integration`, local Supabase).
  - [x] 1.2.2 `supabase init`; `supabase start` gives local Postgres and Auth. The test setup
    migrates and truncates between files.
  - [x] 1.2.3 Playwright with `mobile` (360×740) and `desktop` (1280×800) projects; a test helper
    that logs in a seeded partner.
  - **Acceptance:** one sample test runs in each of `npm test`, `npm run test:int` and
    `npm run test:e2e`.
- [x] **1.3 Database schema**
  - **Refs:** SRS §4, §2.4; D-009, D-017.
  - **Note:** CR-003 (D-022) changes the `cards` name uniqueness to per owner.
  - [x] 1.3.1 `src/db/schema.ts`: every table in SRS §4.
    - Common columns: `id`, `created_at`, `updated_at`, `created_by`.
    - Money columns: `numeric(14,2)` with `CHECK > 0` (`≠ 0` for opening/opening_correction).
    - Unique constraints: names; customers `(proprietor_name, shop_name) NULLS NOT DISTINCT`;
      `card_bill_dates (card, bill_month)`; `month_closes.month`.
    - `audit_log.row_id` is nullable, and `action` includes `export`.
  - [x] 1.3.2 RLS enabled on every table, with no policies.
  - [x] 1.3.3 First migration (`drizzle-kit generate`), plus a seed for the Walk-in customer
    (`is_system = true`).
  - [x] 1.3.4 `src/db/index.ts`: a server-only Drizzle client (`import 'server-only'`).
  - **Tests:**
    - [x] I1.3.1 After the migration, every SRS §4 table exists.
    - [x] I1.3.2 CHECKs reject a 0 or negative amount, `qty ≤ 0`, and `statement_day` 32.
    - [x] I1.3.3 A second "Milon" with no shop name is rejected (NULLS NOT DISTINCT).
    - [x] I1.3.4 Using the anon key, `select`/`insert` on every table returns nothing or is denied
      (RLS).
    - [x] I1.3.5 The Walk-in exists after seeding.
  - **Acceptance:** the migration applies cleanly to a fresh local Supabase; the RLS test passes.
- [x] **1.4 👤 Supabase cloud project**
  - **Refs:** SRS §1, §11.
  - [x] 1.4.1 👤 Create the project in `ap-south-1` and turn sign-ups off.
  - [x] 1.4.2 👤 Create the 2 partner users (Arif, Sumon). Share `DATABASE_URL`,
    `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` via `.env.local` (never
    committed).
  - [x] 1.4.3 Migrate the cloud DB; insert the `profiles` rows (role = partner). Migrated (17
    tables, RLS on, no policies, Walk-in seeded); Arif's and Sumon's profiles added
    (`person_id` is set when the opening import creates the `people` rows).
  - **Acceptance:** both users can sign in to the cloud project. Arif ✓; Sumon ✓ (2026-10-08,
    in the production smoke test, M-CR-011.2).
- [x] **1.5 Auth**
  - **Refs:** SRS §11, §2.3; UIDD §4.1.
  - [x] 1.5.1 `@supabase/ssr` clients plus `middleware.ts` (refresh the session; send anonymous
    users to `/login`).
  - [x] 1.5.2 `/login` (email + password, no sign-up link); sign out.
  - [x] 1.5.3 `requirePartner()`: session + `profiles.role = partner`, otherwise an error. Every
    server action uses it.
  - **Tests:**
    - [x] I1.5.1 `requirePartner()` rejects no session and a non-partner role.
    - [x] E1.5.1 Anonymous `/` → `/login`.
    - [x] E1.5.2 Login → home; sign out → `/login`.
    - [x] E1.5.3 The session survives a reload (UIDD §4.1).
  - **Acceptance:** E1.5.1–E1.5.3 are green on mobile and desktop.
- [x] **1.6 App shell**
  - **Refs:** UIDD §1, §3.
  - [x] 1.6.1 Top bar: app name, a balance-chip slot, "Closing: …", user menu. On mobile: name +
    chip only.
  - [x] 1.6.2 Bottom tabs (mobile) / sidebar (≥ 1024px): Home · New · Stock · Accounts · More.
  - [x] 1.6.3 The New action sheet, in the UIDD order, with links to the forms (placeholders for
    now).
  - [x] 1.6.4 More: Months, Journal, Setup, Export, Closing, Form help (Expanded · Collapsed ·
    Off, saved in the browser), Sign out.
  - [x] 1.6.5 `src/lib/help-text.ts` with the About texts from the UIDD §3 table.
  - **Tests:**
    - [x] E1.6.1 At 360px: no horizontal scroll (`scrollWidth ≤ clientWidth`) and tap targets
      ≥ 44px.
    - [x] E1.6.2 The Form help setting persists across a reload.
  - **Acceptance:** navigation works on mobile and desktop.
- [x] **1.7 CI**
  - **Refs:** D-001.
  - [x] 1.7.1 `.github/workflows/ci.yml` on PRs to `dev`/`main`: install → typecheck → lint →
    unit → `supabase start` → migrate → integration → Playwright.
  - **Acceptance:** a PR shows all steps green.

---

## Phase 2 — Money, dates, engine (SRS §13 step 2)

**Exit:** `npm test` passes every posting rule, S1–S18 and the investor card fixture, with the invariant
asserted after each scenario.

Everything here is pure TypeScript with no I/O. The engine takes plain arrays and `asOf` and
returns plain objects.

- [x] **2.1 `src/lib/money.ts`**
  - **Refs:** SRS §3; UIDD §2; D-015.
  - [x] 2.1.1 `parse`, `format`, `add`/`sub`/`mul(qty)`, `pct`, `splitShares`, `splitEven`.
    Integer poisha only.
  - **Tests:**
    - [x] U2.1.1 `parse`:
      - `"1,00,000"` → 10,000,000 poisha;
      - `"17444.8"` → 1,744,480;
      - `"0.50"` → 50;
      - rejects `"abc"`, `""` and more than 2 decimals (`"1.005"`); there's no rounding in
        parse.
    - [x] U2.1.2 `format`:
      - 751,234,500 → `৳75,12,345`;
      - 1,744,480 → `৳17,444.80`;
      - 0 → `৳0`;
      - negative → `-৳…` (a minus sign);
      - `৳1,00,000` uses lakh grouping.
    - [x] U2.1.3 `pct` rounds half-up: `pct(1, 50%)` = 1 poisha; `pct(10,000,000, 2.5%)` =
      250,000; a 3-decimal rate (1.125%).
    - [x] U2.1.4 `splitShares`:
      - 100,000 @ 50/50 → 50,000 + 50,000;
      - 1 poisha @ 50/50 → sums to exactly 1 (residual to the first partner);
      - −12,000 → −6,000 each;
      - the sum always equals the total (property test over random totals and pcts).
    - [x] U2.1.5 `splitEven`: 60,000 / 6 → 10,000 × 6; 100.00 / 3 → 33.33, 33.33, 33.34
      (remainder last).
    - [x] U2.1.6 No float: `0.1 + 0.2`-style inputs give exact results.
  - **Acceptance:** all green; no money function returns a non-integer.
- [x] **2.2 `src/lib/dates.ts`**
  - **Refs:** SRS §3, §6.1.
  - [x] 2.2.1 Dhaka today, `YYYY-MM` helpers, month add/compare, clamp a day to the month end,
    `isFuture`.
  - **Tests:**
    - [x] U2.2.1 At 2026-10-06T18:30Z, Dhaka today is 2026-10-07; at 17:59Z it is 2026-10-06.
    - [x] U2.2.2 Clamp: day 31 in Feb 2026 → 28; day 31 in Apr → 30; Feb 2028 → 29.
    - [x] U2.2.3 Month math across the year end (2026-12 + 1 = 2027-01).
- [x] **2.3 Posting rules — `postEntry(entry) → effects`**
  - **Refs:** SRS §5; UIDD §3 (preview).
  - [x] 2.3.1 One function maps each entry type to its effects on Cash, Stock, Customer due,
    Supplier due, Card balance, Capital, Profit owed and Profit(month). The engine and the form
    preview both use it.
  - [x] 2.3.2 A reversal (`reverses_id`) = the same effects negated, landing in the reversal's own
    date/for_month.
  - **Tests:**
    - [x] U2.3.1 One test per SRS §5 row:
      - purchase: cash / card / supplier credit / customer offset;
      - sale; customer return; purchase return (cash / card / supplier / customer / damaged-lost);
      - customer payment; cash given; discount;
      - profit share received / added to due;
      - supplier payment (cash / card); card payment; cash-out; card fee; cashback (card / cash);
        expense (cash / card);
      - capital in / out; profit paid / reinvested;
      - opening items; opening correction (asset vs liability item).
    - [x] U2.3.2 For every type: reversal effects = −(original effects).
    - [x] U2.3.3 For every row: assets − liabilities change = equity change (each row balances).
  - **Acceptance:** every row of the SRS §5 table has a test.
- [x] **2.4 Stock — `engine/stock.ts`**
  - **Refs:** SRS §4 (lot picking, lot remaining); PRD §4.2.
  - [x] 2.4.1 Lot remaining = qty − sold + customer-returned − purchase-returned (reversals with
    the opposite sign).
  - [x] 2.4.2 `pickLots(lots, model, qty, saleDate, lotId?)`: oldest first (purchase date, then
    created_at); only lots dated ≤ the sale date; split across lots; a manual lot; not enough
    stock → an error.
  - **Tests:**
    - [x] U2.4.1 **S14:** lot A (2 @ 16,860) + B (10 @ 17,010), sell 3 → 2 from A + 1 from B,
      cost 50,730.
    - [x] U2.4.2 A lot bought after the sale date is skipped.
    - [x] U2.4.3 Asking for 13 when 12 are left → an error naming the shortage.
    - [x] U2.4.4 A manual lot dated after the sale → an error.
    - [x] U2.4.5 Remaining after a sale, a return and a reversal of the sale is correct.
- [x] **2.5 Customers & suppliers — `engine/customers.ts`**
  - **Refs:** SRS §5; PRD §4.3; UIDD §4.8.
  - [x] 2.5.1 Balance per customer/supplier; statement rows with a running balance; above target.
  - **Tests:**
    - [x] U2.5.1 **S1:** supplier-credit purchase 10 × 17,700, then a 100,000 payment → stock
      +177,000; supplier owed 77,000.
    - [x] U2.5.2 **S2:** sell 3 @ 18,000 → due +54,000, stock −53,100, profit +900 in the sale
      month.
    - [x] U2.5.3 **S3:** return 1 → due −18,000, stock +17,700, profit −300 in the return month.
    - [x] U2.5.4 **S13:** owes 100,000, pays 99,950, discount 50 → due 0, profit −50.
    - [x] U2.5.5 **S15:** buy 2 @ 15,000 against Selim's 100,000 due → stock +30,000, due 70,000,
      cash unchanged.
    - [x] U2.5.6 Overpayment → negative due shown as credit; above target = balance − target.
- [x] **2.6 Cards — `engine/cards.ts`**
  - **Refs:** SRS §6; PRD S4–S7; D-002, D-014, D-016, D-021 (CR-002: reversals, next due).
  - [x] 2.6.1 Statement date (actual or clamped); due date (first date after the statement whose
    day = due_day); bill month of a charge (override, or the earliest statement ≥ the charge
    date).
  - [x] 2.6.2 EMI: `splitEven(T, n)`, billed from the purchase's own bill month; the full T counts
    in the balance at once.
  - [x] 2.6.3 Credits are poured into bills oldest-first, regardless of the credit date; leftover
    = card credit.
  - [x] 2.6.4 Per-card output: balance, bills, next due, overdue, due within 7 days, unbilled,
    remaining EMI, status.
  - [x] 2.6.5 The card fixture: read the workbook's `Transactions` rows with ExcelJS and mapped
    them as in SRS §6 (now synthetic rows in `tests/fixtures/investor-cards.ts`, N-0.4).
  - **Tests:**
    - [x] U2.6.1 EBL (5/20): statement 5 Oct → due 20 Oct. Southeast (19/4): statement 19 Oct →
      due 4 Nov.
    - [x] U2.6.2 A charge on the statement date is in that bill; the day after goes to the next
      bill.
    - [x] U2.6.3 An actual date override changes the statement/due dates and marks them "actual".
    - [x] U2.6.4 **S4:** card purchase 20,000, cashback 1,000 a month later → balance 19,000;
      profit +1,000 in the cashback month; cash unchanged.
    - [x] U2.6.5 **S5:** cash-out charged 100,000, received 98,500 → card +100,000; cash +98,500;
      expense 1,500.
    - [x] U2.6.6 **S6 (D-002):** EBL; 10 Sep purchase 40,000; 25 Sep payment 40,000; 28 Sep
      purchase 25,000. As of 30 Sep: balance 25,000; Oct bill 65,000 / paid 40,000 / remaining
      25,000; next due 20 Oct · 25,000; cash −40,000; stock +65,000.
    - [x] U2.6.7 **S7:** EMI 60,000 × 6 → balance +60,000; 6 bills of 10,000 starting with the
      purchase's own bill.
    - [x] U2.6.8 Statuses: Check dates · Card credit · Clear · Overdue · Due today · Due within 7
      days · Upcoming. One case each.
    - [x] U2.6.9 **Investor card fixture as of 2026-10-06:**
      - balances and next dues for all 7 cards, as in the SRS §6 table;
      - total 645,751.25;
      - cash-outs 190,000 (6 entries);
      - cash invested 800,000;
      - City Visa status = due within 7 days; City Amex = Clear.
  - **Acceptance:** the investor card fixture matches to the poisha.
- [x] **2.7 Months — `engine/months.ts`**
  - **Refs:** SRS §7; PRD §4.4.
  - [x] 2.7.1 Profit(M) by date or for_month, as in the SRS §7 formula; a breakdown by component
    and expense category.
  - [x] 2.7.2 Closed months use the stored `allocations`. Profit owed = Σ allocations − paid −
    reinvested (+ opening). Undistributed = Σ Profit(open months).
  - [x] 2.7.3 `computeClose(M, investorAllocations, partners)` → partner rows via `splitShares`.
  - **Tests:**
    - [x] U2.7.1 **S8:** profit 100,000, investors 20,000 → each partner 40,000.
    - [x] U2.7.2 **S9:** loss −10,000, investors 2,000 → each partner −6,000.
    - [x] U2.7.3 **S10:** reinvest 30,000 → profit owed −30,000; capital +30,000; cash
      unchanged.
    - [x] U2.7.4 **S11:** profit share 284,675 for October, received 3 Nov → October profit
      +284,675; cash +284,675; due unchanged.
    - [x] U2.7.5 **S12:** the same, added to due → October profit +284,675; Milon's due +284,675.
    - [x] U2.7.6 **S18:** an October expense of 5,000 reversed on 3 Nov, with October closed →
      November profit +5,000; October allocations unchanged.
    - [x] U2.7.7 An expense dated 2 Nov for October counts in October.
- [x] **2.8 Balance — `engine/balance.ts` and `computeBooks()`**
  - **Refs:** SRS §5 (invariant, opening, cash warning); D-018.
  - [x] 2.8.1 `computeBooks(data, asOf)` returns: cash, stock, dues, cards, capital, profit owed,
    undistributed, the invariant (both sides + difference), opening difference (resolved or not),
    and the first negative-cash date.
  - **Tests:**
    - [x] U2.8.1 **S16:** the invariant holds after every story S1–S18 (one shared assert helper
      used by every scenario test).
    - [x] U2.8.2 **S17:** after closing October, an opening correction for a missed Selim due of
      20,000 → due +20,000; opening difference +20,000 (10,000 per partner); no month's profit
      changes.
    - [x] U2.8.3 An opening import with a residual books an opening difference; the invariant is
      ✓; "resolved" when its net total = 0.
    - [x] U2.8.4 Cash goes −5,000 on 12 Oct and recovers on 14 Oct → the first negative date is
      12 Oct.
- [x] **2.9 Guards — `src/lib/guards.ts` (pure)**
  - **Refs:** SRS §3, §7 (lock rule), §8; D-003, D-005, D-009.
  - [x] 2.9.1 Date checks: future; before the opening date; `for_month` before the opening month;
    `for_month` > the date's month.
  - [x] 2.9.2 Lock rule: locked if month(date) ≤ the last closed month or for_month ≤ the last
    closed month. A new entry is rejected in a closed month.
  - [x] 2.9.3 Reverse eligibility: not already reversed; not itself a reversal; no dependents.
    Default reversal date/for_month (the original's if open, else today).
  - [x] 2.9.4 Delete eligibility (dependents, has a reversal); lot cost/qty edit blocked when its
    sales/returns are in a closed month; Walk-in limits.
  - **Tests:** one U test per rule, both allowed and rejected (U2.9.1–U2.9.10), including:
    - a reversal of a reversal is rejected;
    - `for_month` 2026-11 on a 2026-10-28 expense is rejected;
    - a Walk-in profit share is rejected;
    - the reversal of a locked October entry defaults to today.
- [x] **2.10 Zod schemas — `src/lib/validation/`**
  - **Refs:** SRS §4 (allowed fields per type).
  - [x] 2.10.1 One schema per entry form (purchase, sale, return, money entry as a discriminated
    union on `type`, setup rows).
  - **Tests:**
    - [x] U2.10.1 Each money type accepts its required fields and rejects missing ones (e.g. a
      card-source expense without `card_id`; cash_received > card_charged).

---

## Phase 3 — Setup, entry forms, journal (SRS §13 step 3)

**Exit:** every PRD §4.2 entry can be created, edited, deleted, reversed and undone on a phone,
with an audit trail, and the invariant ✓ after each.

- [x] **3.1 Server-action helper — `src/server/action.ts`**
  - **Refs:** SRS §2.3, §3; D-010.
  - [x] 3.1.1 One plain function:
    1. `requirePartner()`;
    2. Zod parse;
    3. duplicate check (new entries only, unless `confirmDuplicate`);
    4. guards (2.9);
    5. a transaction with `insert … on conflict (id) do nothing`;
    6. an `updated_at` check on edit/delete/undo;
    7. an audit row;
    8. `revalidatePath`.
  - [x] 3.1.2 Typed results: `ok` · `duplicate {by, at, id}` · `conflict` · `invalid {field
    errors}`.
  - **Tests:**
    - [x] I3.1.1 The same id submitted twice → 1 row and 1 audit row.
    - [x] I3.1.2 A stale `updated_at` on edit, delete and undo → `conflict`.
    - [x] I3.1.3 Duplicate (same type, counterparty, amount, date) → a warning;
      `confirmDuplicate` saves it.
    - [x] I3.1.4 A future date, a closed month, a for_month after the date's month → `invalid`
      with the UIDD §5 message.
    - [x] I3.1.5 No session or a non-partner → rejected, nothing written.
- [x] **3.2 Setup screens**
  - **Refs:** PRD §4.1; SRS §4 (setup); UIDD §4.11, §3 (Setup About texts, D-020); D-023.
  - [x] 3.2.1 People: kind, note; partner profit share %. The save is allowed while the active
    partners don't total 100; the list warns "Partners total X% — must be 100 before closing"
    (D-023, was: rejected).
  - [x] 3.2.2 Cards: owner, statement/due day, credit limit.
  - [x] 3.2.3 Customers: shop name, proprietor, phone, email, address, target. Display "Shop
    (Proprietor)"; search both names. A "Shop name missing" flag.
  - [x] 3.2.4 Suppliers, Models.
  - [x] 3.2.5 Deactivate instead of delete once a row is used; Walk-in is read-only ("Built-in"
    badge; no edit, deactivate or delete, D-023). Deactivated rows are hidden in pickers.
  - [x] 3.2.6 The modal form shell (D-023): bottom sheet on mobile, About box, ⓘ, inline errors,
    Save spinner. 3.3 builds on it.
  - **Tests:**
    - [x] I3.2.1 Partner % ≠ 100 → the save is allowed and the warning total is reported (D-023,
      was: rejected).
    - [x] I3.2.2 Deleting a used card → rejected (deactivate offered).
    - [x] I3.2.3 Deleting, editing or deactivating Walk-in → rejected.
    - E3.2.1 moved to 3.5 as E3.5.6 (D-023): the sale form's picker doesn't exist until then.
- [x] **3.3 Shared form UI**
  - **Refs:** UIDD §1–§3, §5; D-022 (card pickers show "Owner · Card"); D-023 (the modal shell,
    About box and ⓘ come from 3.2.6; this task extends them).
  - [x] 3.3.1 Pickers (comboboxes) with "+ Add new"; inputs for money (`inputmode=decimal`), qty
    (`numeric`) and date (native, default Dhaka today).
  - [x] 3.3.2 Modal vs page per UIDD §3 (bottom sheet on mobile); sticky footer with total +
    Save.
  - [x] 3.3.3 Notes box: About (collapsible, follows the Form-help setting) + "What this will do"
    built from `postEntry` (2.3).
  - [x] 3.3.4 ⓘ field help for the fields listed in UIDD §3 (entry-form texts added by CR-005,
    D-024).
  - [x] 3.3.5 Toast "Saved · Undo" (8 s); duplicate dialog (View it · Save anyway · Cancel);
    inline errors; "Not saved — tap Save again"; empty states; skeletons.
  - **Tests:**
    - [x] U3.3.1 Every form in the UIDD §3 table has an About text in `help-text.ts` (incl. the
      Setup forms and card bill dates, D-020).
    - [x] U3.3.2 The preview lines for a card payment are "Cash −…, <card> −…, Profit: no change".
- [x] **3.4 Purchase**
  - **Refs:** PRD §4.2; SRS §4 (purchases), §5; UIDD §4.3; D-009.
  - [x] 3.4.1 A full-page form:
    - "paid by" Cash · Card (+ EMI months) · Supplier credit · Customer's due (Walk-in not
      allowed);
    - Advanced: bill-month override, Opening correction;
    - repeatable lines: model, qty, unit cost, IMEI/note;
    - the supplier-credit tip.
    - The Customer's-due picker's current due moved to 4.1.5 (it needs the 4.1 loader).
  - [x] 3.4.2 The action creates `purchases` + `purchase_lines`; supplier required for supplier
    credit; card required for card.
  - **Tests:**
    - [x] I3.4.1 Each source posts as in SRS §5; the invariant holds.
    - [x] I3.4.2 EMI months < 2 or a non-card source → rejected.
    - [x] I3.4.3 Editing a lot's unit cost when it has a sale in a closed month → rejected.
- [x] **3.5 Sale**
  - **Refs:** PRD §4.2; SRS §4 (sales, lot picking); UIDD §4.4; D-004, D-006.
  - [x] 3.5.1 A full-page form:
    - the customer picker shows the balance (defaults to the last used; Walk-in);
    - model picker "· N in stock"; qty capped at the stock;
    - the lot preview line; "Choose lot";
    - the line total/profit;
    - "Received now".
    - The customer picker's current balance moved to 4.1.5 (it needs the 4.1 loader).
  - [x] 3.5.2 The action:
    - `SELECT … FOR UPDATE` on candidate lots;
    - `pickLots` server-side;
    - splits lines across lots;
    - an optional customer payment in the same transaction.
  - [x] 3.5.3 Edit keeps the existing lots (D-004); Undo removes the bill and its "Received now"
    payment (D-006).
  - **Tests:**
    - [x] I3.5.1 S14 through the action → 2 sale_lines (A×2, B×1).
    - [x] I3.5.2 Two concurrent sales of the last unit → exactly one succeeds, and the other gets
      "Only 0 left".
    - [x] I3.5.3 Editing the price of a sale keeps the same lot_ids; adding a line auto-picks.
    - [x] I3.5.4 Undo of a sale with Received now → both rows deleted, 2 audit rows.
    - [x] I3.5.5 Selling a lot dated after the sale date → rejected.
    - [x] E3.5.6 Add a customer from the sale form's picker "+ Add new" → it comes back selected
      (was E3.2.1, D-023).
- [x] **3.6 Returns**
  - **Refs:** PRD §4.2; SRS §4 (returns); UIDD §4.5; D-011; D-025 (CR-006).
  - [x] 3.6.1 Customer return: customer → bill → line → qty (≤ sold − returned) → refund per unit
    (defaults to the sale price).
  - [x] 3.6.2 Purchase return:
    - reason chips (Returned / Damaged-lost = 0);
    - lot → qty (≤ remaining);
    - refund target defaults to the original source; opening and opening-correction lots must
      choose one;
    - one purchase per return.
  - **Tests:**
    - [x] I3.6.1 S3 through the action.
    - [x] I3.6.2 Returning more than sold − returned → rejected.
    - [x] I3.6.3 A purchase return of an opening lot with no target → rejected.
    - [x] I3.6.4 Damaged/lost → stock −cost, profit −cost, refund 0.
    - [x] I3.6.5 A return dated before its sale/purchase → rejected.
- [x] **3.7 Money entries**
  - **Refs:** PRD §4.2; SRS §4 (money_entries), §5; UIDD §4.6; D-005, D-007, D-009.
  - [x] 3.7.1 One modal form; fields follow the type. Includes:
    - cash-out (charged / received / live fee);
    - profit share (for_month defaults to last month; Received now / Add to due);
    - expense (category chips, cash/card, for_month);
    - capital in/out;
    - profit paid/reinvested (the owed amount and its warning are 5.5.1: they need the 4.1
      loader);
    - customer discount, cash given, supplier payment, card payment, card fee, cashback.
    - The customer discount's current due moved to 4.1.5 (it needs the 4.1 loader).
  - [x] 3.7.2 Opening correction: kind + target + signed change; the preview shows D per
    partner.
  - **Tests:**
    - [x] I3.7.1 One create per type posts as in SRS §5; the invariant holds.
    - [x] I3.7.2 cash_received > card_charged → rejected.
    - [x] I3.7.3 A future for_month → rejected.
    - [x] I3.7.4 Opening correction S17 through the action.
- [x] **3.8 Journal**
  - **Refs:** PRD §4.5; SRS §8; UIDD §4.10; D-003, D-008; D-026 (CR-007: no edit of a reversed
    entry or a reversal; reverse/delete keep stock ≥ 0).
  - [x] 3.8.1 Chronological list; filters (type, dates, counterparty, month; bottom sheet on
    mobile); 🔒 on locked rows; a "Reversed by …" link.
  - [x] 3.8.2 Detail: View · Edit (same form, type fixed) · Delete · Reverse (default date per
    2.9.3; never before the original); a History tab (audit before → after).
  - **Tests:**
    - [x] I3.8.1 Delete is blocked for a lot with sales, a sale line with returns, or an entry
      with a reversal.
    - [x] I3.8.2 Reverse is blocked for a sale with returns or a purchase with sales; a reversal
      can't be reversed.
    - [x] I3.8.3 Reversing a purchase removes its lot qty; reversing a sale restores it.
    - [x] I3.8.4 Editing writes an audit row with before/after.
- [x] **3.9 E2E for Phase 3** (mobile 360px)
  - [x] E3.9.1 Purchase (supplier credit) → sale with auto lots shown → customer return → payment
    in. The balances on the forms' previews match the saved results.
  - [x] E3.9.2 Save → Undo removes the entry.
  - [x] E3.9.3 The duplicate dialog appears; Save anyway saves.
  - [x] E3.9.4 Inline errors: "Only 12 left in this lot", a future date, "Cash received can't
    exceed amount charged".

---

## Phase 4 — Views & dashboard (SRS §13 step 4)

**Exit:** every PRD §4.3 view shows engine numbers; the dashboard chip is ✓.

- [x] **4.1 Data loader + dashboard**
  - **Refs:** PRD §4.3; SRS §2, §5; UIDD §3 (top bar), §4.2; D-018.
  - [x] 4.1.1 `src/server/books.ts`: load all fact rows → `computeBooks(data, today)`. This is
    the only path from the DB to the engine.
  - [x] 4.1.2 Dashboard cards:
    - cash (red with the first negative date);
    - stock;
    - customers owe; we owe suppliers;
    - card dues (overdue / 7 days);
    - this month's profit.
  - [x] 4.1.3 Dashboard lists: card alerts (next 5), top customer dues (above target), recent 10
    entries.
  - [x] 4.1.4 Balance chip (✓ / ✗ Off by ৳X → a breakdown of both sides) in the top bar; the
    "Closing: Mon YYYY" label.
  - [x] 4.1.5 The purchase form's Customer's-due picker, the sale form's customer picker and the
    customer discount's customer picker show the customer's current due (UIDD §4.3, §4.4, §4.6;
    moved here from 3.4, 3.5 and 3.7 because they need this loader).
  - **Tests:**
    - [x] I4.1.1 The loader returns every fact table's rows, mapped to engine types (money as
      poisha).
    - [x] I4.1.2 After a seeded scenario, `computeBooks` from the DB equals the same scenario run
      on the engine directly.
- [x] **4.2 Stock view**
  - **Refs:** UIDD §4.7.
  - [x] 4.2.1 Grouped by model (units, value at cost) → lots (date, source, unit cost,
    in/sold/returned/to seller/left — CR-008, D-027); filter in-stock/all; search model or
    IMEI/note.
- [x] **4.3 Customers & suppliers**
  - **Refs:** UIDD §4.8.
  - [x] 4.3.1 Customer list (search shop/proprietor/phone) → detail:
    - contact (tap to call);
    - balance + above target;
    - statement with running balance;
    - Bills tab with lines and profit.
  - [x] 4.3.2 Supplier list → detail statement.
  - **Tests:**
    - [x] U4.3.1–5 (`tests/engine/accounts.test.ts`): list balance + last activity, search,
      statement lines (newest first, running balance), supplier due text, bill profit = its
      `postEntry` profit; books-balance invariant.
    - [x] I4.3.1–2 (`tests/integration/accounts.test.ts`): a customer's bills with lines from
      the DB (a reversal is not a bill); each bill's profit off the books; the books balance.
- [x] **4.4 Cards**
  - **Refs:** PRD §4.3; SRS §6; UIDD §4.8; D-022 (rows show "Owner · Card").
  - [x] 4.4.1 Summary table (the Nadim columns; stacked cards on mobile); "Available ≈" with its
    ⓘ.
  - [x] 4.4.2 Detail:
    - statements (actual/est.);
    - tap a bill → edit its actual dates (a `card_bill_dates` upsert action with audit; About
      text "Card bill dates", D-020);
    - charges/credits;
    - EMI plans.
  - **Tests:**
    - [x] U4.4.1–3 (`tests/engine/card-view.test.ts`): summary rows (Available ≈ = limit −
      balance, blank without a limit), charges/credits with their bill month and EMI plans
      (billed / remaining), an actual due date moving the bill and the status; books-balance
      invariant.
    - [x] I4.4.1 Setting an actual due date moves that bill's due date and status.
- [x] **4.5 People**
  - **Refs:** UIDD §4.8.
  - [x] 4.5.1 List (name, kind, capital, profit owed) → detail: capital history, cards supplied,
    profit allocated / paid / reinvested / owed; opening difference shown until it is resolved.
  - **Tests:**
    - [x] U4.5.1–4 (`tests/engine/people-view.test.ts`): list rows (capital, profit owed, the
      unresolved opening difference), capital history (newest first, running balance), profit
      allocated per closed month / paid / reinvested / owed (a reversed payment nets out; an
      open month's allocations don't count), the opening difference hidden once resolved;
      books-balance invariant.
- [x] **4.6 E2E for Phase 4**
  - [x] E4.6.1 After E3.9.1-style data plus a card payment, a cash-out and an expense: the
    dashboard shows ✓ and the expected cash / stock / dues.
  - [x] E4.6.2 The card list shows the right status badges; stacked cards at 360px and a full
    table at 1280px.

---

## Phase 5 — Month close (SRS §13 step 5)

**Exit:** a month can be closed, locked, paid out and re-opened entirely in the app.

- [x] **5.1 Months list + close screen**
  - **Refs:** PRD §4.4; SRS §7; UIDD §4.9.
  - [x] 5.1.1 List: month, profit, status (Open / Closed on dd Mon).
  - [x] 5.1.2 Close screen:
    - the profit breakdown;
    - an investor allocation table (cash basis = capital at month end; card basis and rate =
      last month's values or blank; amount editable, ≥ 0);
    - the partner split (red if a loss);
    - the profit-share reminder (customers with a share for M−1 but none for M).
- [x] **5.2 Close action**
  - **Refs:** SRS §7, §4 (month close tables). Blank lines and future months: D-028, CR-009.
  - [x] 5.2.1 Checks:
    - M is the next month to close;
    - every earlier month with entries is closed;
    - the partners' % = 100 (Setup only warns, D-023).
  - [x] 5.2.2 Save the investor and partner `allocations`, the `month_closes` row with the
    snapshot, and the audit row (`close`), in one transaction.
  - **Tests:**
    - [x] I5.2.1 S8 and S9 through the action → stored rows; Σ allocations = Profit(M).
    - [x] I5.2.2 Closing out of order → rejected; closing twice → rejected.
    - [x] I5.2.3 The snapshot and allocations are unchanged after later entries in open months.
  - [x] 5.2.3 `/months/[month]` for a closed month: the read-only snapshot (stored breakdown,
    allocations, "Closed on dd Mon yyyy by X"); the Months list links closed months ("View").
- [x] **5.3 Locks everywhere**
  - **Refs:** SRS §7 (lock rule), §8.
  - [x] 5.3.1 Every create/edit/delete action uses the 2.9.2 lock guard; the Journal shows 🔒.
  - **Tests:**
    - [x] I5.3.1 Creating, editing or deleting an entry dated (or for) a closed month →
      rejected.
    - [x] I5.3.2 **S18** through the actions: reversing a locked October expense lands on today
      (November); November profit +5,000.
- [x] **5.4 Re-open**
  - **Refs:** PRD §4.4; SRS §7.
  - [x] 5.4.1 Only the latest closed month. It deletes its allocations and its `month_closes` row
    (both kept in the audit log, action `reopen`). The confirm dialog lists the profit
    paid/reinvested entries made since the close.
  - **Tests:**
    - [x] I5.4.1 Re-opening a non-latest month → rejected.
    - [x] I5.4.2 Re-open after a profit-paid entry → the warning lists it; the month is unlocked.
- [x] **5.5 Profit paid / reinvested**
  - **Refs:** PRD §4.2; SRS §5, §7.
  - [x] 5.5.1 Shows the profit owed per person; a warning (not a block) when the amount exceeds
    it.
  - **Tests:**
    - [x] I5.5.1 **S10** through the action.
- [x] **5.6 E2E for Phase 5**
  - [x] E5.6.1 Close October → its entries show 🔒 in the Journal → profit paid to Arif → re-open
    shows the warning.

---

## Phase 6 — Opening import, export, deploy (SRS §13 step 6)

**Exit:** the real opening balances are loaded with ✓ (or a visible opening difference); the
export works; the app is live.

- [x] **6.1 Opening template builder**
  - **Refs:** SRS §9 (1); PRD §4.6, §7; D-016, D-029 (layout and mapping, CR-010).
  - [x] 6.1.1 The opening-template builder (ExcelJS; a script, later removed from this repo) reads the owners' workbooks and writes
    `opening-template.xlsx` (gitignored).
    - Sheets: People, Cards, CardBalances, Customers, Suppliers, Models, Stock, Capital,
      ProfitOwed, Cash.
  - [x] 6.1.2 It flags the PRD §7 issues: the Honor X5c total, the Oppo row below SUM, the Honor
    X7d with no price, model-name variants, a truncated IMEI, the Milon sheet anomalies, and the
    ৳12,400 gap.
  - **Tests:**
    - [x] U6.1.1 The model-name normaliser groups "Honor x5c " / "honor x5c " / "Honor X5C " into
      one; a short IMEI is flagged. Uses synthetic strings only.
- [x] **6.2 👤 Partners correct the template** (done; imported 2026-10-09)
  - [x] 6.2.1 👤 Fix the flagged rows, add shop names if known, and confirm the investors managed
    by Arif.
  - [x] 6.2.2 👤 Close the month before go-live in Excel and fold the cutover items in (SRS §9
    checklist).
- [x] **6.3 Opening import**
  - **Refs:** SRS §9 (3–4); PRD §4.6; D-014; D-029 (reads the SRS §9 columns and the Settings
    opening date; ignores Issues).
  - [x] 6.3.1 The opening importer (a script, later removed from this repo): Zod-validate every sheet; refuse duplicates or a second
    import.
  - [x] 6.3.2 One transaction inserts:
    - the setup rows;
    - the opening lots (`source = opening`);
    - the `opening` money entries, dated the opening date.
  - [x] 6.3.3 Print the balance check; book any residual as `opening_difference` via
    `splitShares`.
  - **Tests** (synthetic template only, never real data):
    - [x] I6.3.1 A balanced template → ✓, with no opening difference.
    - [x] I6.3.2 An off-by-12,400 template → an opening difference of 6,200 per partner; ✓.
    - [x] I6.3.3 Re-running the import → refused, nothing written.
    - [x] I6.3.4 A bad row (unknown card owner) → the whole import is rolled back with a row
      error.
- [x] **6.4 Export**
  - **Refs:** PRD §4.7; SRS §10; UIDD §4.12; D-017.
  - [x] 6.4.1 `/export`: one sheet per table plus summary sheets (cash, stock, customers,
    suppliers, cards, people, months); amounts as numbers; an `audit_log` row (`export`).
  - [x] 6.4.2 The page shows the last export (time, who) and the weekly-download note.
  - **Tests:**
    - [x] I6.4.1 The workbook has every sheet; amounts are numeric; summary totals equal
      `computeBooks`.
    - [x] E6.4.1 Download works on mobile; the last export updates.
- [x] **6.5 Deploy**
  - **Refs:** SRS §1 (hosting), §11; D-030.
  - [x] 6.5.1 👤 Choose the host → the partners' Singapore VPS (D-030); built in CR-011.
  - [x] 6.5.2 Set the env vars (server-only `DATABASE_URL`); migrate production; smoke test
    login + one entry + a delete. (Done through CR-011.)
  - **Acceptance:** the production URL works on both partners' phones.

---

## Phase 7 — Go-live acceptance (PRD §8, SRS §14)

- [x] **7.1** 👤 Run the import on production (6.3) → ✓, or the opening difference is reviewed
  and accepted. (2026-10-09: opening date 1 Oct 2026; opening difference −19,380.72, accepted; the
  pending 12,500 cashback and 11,250 City refund are booked as opening corrections when they arrive.)
- [ ] **7.2** M7.2.1 SRS §14 manual pass on a phone as each partner: purchase → sale → return →
  payment → card payment → cash-out → expense → close month → profit paid. The dashboard stays ✓
  and the views match the export.
- [ ] **7.3** M7.3.1 Card dues and dates match the bank statements (and Nadim's workbook for his
  cards).
- [ ] **7.4** M7.4.1 The first real month is closed and its allocations paid/reinvested in the
  app.
- [ ] **7.5** M7.5.1 The partners stop using Excel for daily entry; a weekly export habit is
  agreed.

---

## Change requests

New feedback or scope changes go here **before** any code. Copy the template:

```
- [ ] **CR-NNN Title** (YYYY-MM-DD)
  - **Source:** user feedback | misalignment in <task>
  - **Decision:** D-NNN (only if a rule changed) · **Docs:** PRD/SRS/UIDD §…
  - [ ] subtasks…
  - **Tests:** [ ] U/I/E…
  - **Acceptance:** …
```

- [x] **CR-001 About texts for the Setup and card bill-dates forms** (2026-10-07)
  - **Source:** misalignment in 1.6
  - **Decision:** D-020 · **Docs:** UIDD §3
  - [x] CR-001.1 `src/lib/help-text.ts`: add `setup_person`, `setup_customer`, `setup_supplier`,
    `setup_model` and `card_bill_dates`, copied from the UIDD §3 table (`setup_card` exists).
  - **Tests:**
    - [x] U-CR-001.1 Every row of the UIDD §3 About table has a non-empty entry in
      `help-text.ts` (an early version of U3.3.1).
  - **Acceptance:** `help-text.ts` matches the UIDD §3 table word for word; `npm test`, typecheck
    and lint are green.

- [x] **CR-002 Card reversals bill by sign; next due skips overdue bills** (2026-10-07)
  - **Source:** misalignment in 2.6
  - **Decision:** D-021 · **Docs:** SRS §6
  - [x] CR-002.1 `engine/cards.ts` (built in 2.6): charge vs credit by the sign of the card
    effect, reversals included; next due = earliest bill with remaining > 0 and due ≥ today.
  - **Tests:**
    - [x] U-CR-002.1 A reversed card purchase is a credit poured oldest-first (it pays the oldest
      bill, not the original's); a reversed card payment is a charge in the reversal date's bill.
    - [x] U-CR-002.2 With an overdue bill and a later unpaid bill, next due = the later bill;
      overdue = the older bill's remaining; status = Overdue.
  - **Acceptance:** SRS §6 (D-021) holds; the books balance; done together with 2.6.

- [x] **CR-003 Card names unique per owner; City cards 28/12** (2026-10-07)
  - **Source:** user feedback
  - **Decision:** D-022 · **Docs:** PRD §4 (cards), SRS §4 (`cards`), SRS §6 (fixture table)
  - [x] CR-003.1 `src/db/schema.ts`: drop `cards.name` unique; add unique `(owner_person_id, name)`;
    `npx drizzle-kit generate` → a new migration.
  - [x] CR-003.2 `tests/fixtures/investor-cards.ts`: City Amex days 28/12.
  - **Tests:**
    - [x] I-CR-003.1 Two owners can each have a "Brac Visa" with different days; the same owner
      can't have two.
    - [x] U2.6.9 still passes with City Amex at 28/12 (City Amex = Clear; total unchanged).
  - **Acceptance:** the migration applies on local Supabase; `npm test`, `npm run test:int`,
    typecheck and lint are green.

- [x] **CR-004 Setup: partner % warns, Walk-in read-only, 3.2 builds the form shell** (2026-10-07)
  - **Source:** misalignment in 3.2
  - **Decision:** D-023 · **Docs:** PRD §4.1, SRS §4 (`people`, `customers`), UIDD §3 (Setup ⓘ
    texts), UIDD §4.11
  - [x] CR-004.1 The person action doesn't check the partner total; the Setup People list shows
    "Partners total X% — must be 100 before closing" when the active partners ≠ 100.
  - [x] CR-004.2 Walk-in (`is_system`): edit, deactivate and delete are rejected by the actions
    and hidden in the list, which shows a "Built-in" badge.
  - [x] CR-004.3 3.2.6 (the modal form shell); 3.3 builds on it; E3.2.1 → E3.5.6.
  - **Tests:** I3.2.1 and I3.2.3 as reworded in 3.2.
  - **Acceptance:** done together with 3.2; the docs above match the code.

- [x] **CR-005 ⓘ texts for the entry-form fields; "Owner · Card" in the preview** (2026-10-07)
  - **Source:** misalignment in 3.3
  - **Decision:** D-024 · **Docs:** UIDD §3 (entry-form ⓘ table, card-payment mockup)
  - [x] CR-005.1 `src/lib/help-text.ts` → `fieldHelp`: add the 14 entry-form ⓘ texts, copied from
    the UIDD §3 "Field (entry forms)" table word for word.
  - [x] CR-005.2 The "What this will do" preview (3.3.3) names a card with `cardName` ("Owner ·
    Card").
  - **Tests:**
    - [x] U-CR-005.1 Every row of the UIDD §3 entry-form ⓘ table has its text in `fieldHelp`
      (part of U3.3.1).
    - [x] U3.3.2 uses "Arif · City Visa" style card names.
  - **Acceptance:** done together with 3.3; `help-text.ts` matches both UIDD §3 ⓘ tables word for
    word; `npm test`, typecheck and lint are green.
- [x] **CR-006 Purchase-return refund default; write-off duplicates** (2026-10-07)
  - **Source:** misalignment in 3.6 (user-confirmed)
  - **Decision:** D-025 · **Docs:** SRS §2.3; UIDD §3 (Return: Refund per unit ⓘ), §4.5
  - [x] CR-006.1 The return form: a purchase return's Refund per unit starts at the lot's unit
    cost; `help-text.ts` gets the new ⓘ text.
  - [x] CR-006.2 `saveReturn`'s duplicate check: a Damaged / lost write-off matches a same-date
    write-off of the same lot and qty.
  - **Tests:**
    - [x] I3.6.4 (extended): a repeat write-off of the same lot and qty → `duplicate`; another qty
      saves.
    - [x] `tests/e2e/return.spec.ts` 3.6.2: the refund starts at the lot's cost.
  - **Acceptance:** done together with 3.6; typecheck, lint, `npm test` and `npm run test:int`
    are green.

- [x] **CR-007 A reversed entry and a reversal can't be edited; reverse/delete keep stock ≥ 0**
  (2026-10-07)
  - **Source:** misalignment in 3.8 (user-confirmed)
  - **Decision:** D-026 · **Docs:** PRD §4.5, SRS §8, UIDD §4.10
  - [x] CR-007.1 `src/lib/guards.ts` → `pairEditErrors` ("A reversed entry can't be edited —
    delete the reversal first" / "A reversal can't be edited — delete it and reverse again");
    `runAction` runs it on every edit of a table with `reverses_id` (one place for the four).
  - [x] CR-007.2 Reverse: a purchase/sale is blocked only by live dependents (not reversed, not
    reversals); a customer return's reversal can't leave a lot below 0.
  - [x] CR-007.3 Delete: a sale reversal or purchase-return reversal can't leave a lot below 0
    (`lotsRemaining`: a reversed lot keeps its live moves, so a revived sale shows below 0); a
    customer-return reversal can't be deleted once its bill was reversed.
  - [x] CR-007.4 The Journal detail hides Edit on a reversed entry and on a reversal.
  - **Tests:**
    - [x] U-CR-007.1 `pairEditErrors` messages (`tests/engine/guards.test.ts`).
    - [x] I-CR-007.1 Editing a reversed entry, or a reversal → `invalid` with that message.
    - [x] I-CR-007.2 A purchase whose sale was reversed can be reversed (in I3.8.3).
    - [x] I-CR-007.3 A customer return whose units were sold again can't be reversed; a sale
      reversal whose units were sold again can't be deleted.
  - **Acceptance:** done together with 3.8; typecheck, lint, `npm test` and `npm run test:int`
    are green.

- [x] **CR-008 Stock lots: Returned and To seller apart** (2026-10-07)
  - **Source:** misalignment in 4.2 (user-confirmed)
  - **Decision:** D-027 · **Docs:** UIDD §4.7
  - [x] CR-008.1 `engine/stock.ts` → `lotsRemaining` also returns each lot's net `sold`,
    `returned` (customer) and `toSeller` (purchase returns), reversals counted negated.
  - [x] CR-008.2 The Stock view's lot rows show In · Sold · Returned · To seller · Left; a
    reversed purchase's lots are left out.
  - **Tests:**
    - [x] U-CR-008.1 A lot with a sale, a customer return, a purchase return and a reversed sale
      → the right sold/returned/toSeller, and in − sold + returned − toSeller = remaining.
  - **Acceptance:** done together with 4.2; typecheck, lint and `npm test` are green.

- [x] **CR-009 Blank investor lines are skipped; no close of a month that hasn't started**
  (2026-10-07)
  - **Source:** misalignment in 5.2 (user-confirmed)
  - **Decision:** D-028 · **Docs:** SRS §4 (`allocations`), §7; UIDD §4.9
  - [x] CR-009.1 The close action stores an investor line only with basis > 0, a rate and an
    amount; a line with no amount or basis 0 is skipped; an amount without basis and rate →
    inline error. The close form shows the same errors.
  - [x] CR-009.2 The close action rejects a month after today's month.
  - **Tests:**
    - [x] I-CR-009.1 A blank card line and a 0-capital cash line → no rows for them; the partners
      get the rest; Σ allocations = Profit(M).
    - [x] I-CR-009.2 An amount with no basis/rate → `invalid`; closing next month (not started) →
      `invalid`.
    - [x] U-CR-009.1–2 `readLine` (`tests/engine/months-view.test.ts`); U-CR-009.3 `closeErrors`
      (`tests/engine/guards.test.ts`).
  - **Acceptance:** done together with 5.2; typecheck, lint, `npm test` and `npm run test:int`
    are green.

- [x] **CR-010 The opening template's layout and how the workbooks fill it** (2026-10-07)
  - **Source:** misalignment in 6.1 (user-confirmed)
  - **Decision:** D-029 · **Docs:** SRS §9 (step 1), PRD §3
  - [x] CR-010.1 The builder writes the SRS §9 sheets and columns, plus Settings (`--opening`,
    default the 1st of next month) and Issues; flagged cells are amber.
  - [x] CR-010.2 It fills them as SRS §9 says: outside-money rows → investor Capital, card
    balances or "classify"; Babul vai and "Arif vai" managed by Arif; Nadim's cards and unpaid
    bill months from his Transactions via `cardSummaries` (the "Nadim vai card" difference
    flagged); customers from "Total cash" + Milon's sheet; partner capital from Sheet6.
  - **Tests:** covered by U6.1.1 (synthetic strings only; the real workbook is never printed).
  - **Acceptance:** done together with 6.1; the template opens in Excel with every SRS §9 sheet;
    typecheck, lint and `npm test` are green.

- [x] **CR-011 Deploy to the partners' VPS** (2026-10-08)
  - **Source:** user feedback (6.5.1)
  - **Decision:** D-030 · **Docs:** SRS §1 (Hosting), §12
  - **Note (D-031):** CR-011.1–.2 (release folders, `next start`) are replaced by CR-012
    (pull-build-copy, standalone). CR-011.3 and the M tests use CR-012's script and README.
  - [x] CR-011.1 `scripts/deploy.sh` (bash, `set -euo pipefail`): clone `main` into
    `releases/<timestamp>`, link `shared/.env.local`, `npm ci`, `nice -n 19 npm run build`,
    `npx drizzle-kit migrate`, switch `current`, `systemctl restart`, keep the last 3 releases.
    A failed step leaves `current` and the running app as they were. `--rollback` points
    `current` at the previous release and restarts.
  - [x] CR-011.2 `deploy/mobile-business.service` (systemd: `next start` from `current` on
    `127.0.0.1:<port>`, `NODE_ENV=production`, restart on failure, a non-root user) and
    `deploy/nginx.conf` (proxy to that port; certbot adds HTTPS). `deploy/README.md`: the
    one-time VPS setup (user, folders, deploy key, `.env.local`, service, nginx, certbot) and
    how to release and roll back.
  - [x] CR-011.3 👤 One-time setup on the VPS (the README's steps: domain DNS, deploy key,
    secrets), then the first `deploy.sh`. (2026-10-08: `business.example.com` is live; HTTPS set
    up with the VPS's nginx UI; `DATABASE_URL` is the session pooler, as the direct host is
    IPv6-only and the VPS has no IPv6.)
  - **Tests:**
    - [x] M-CR-011.1 `bash -n` and `shellcheck` pass on `deploy.sh`; a failed build leaves the
      previous release serving. (2026-10-08: locally by M-CR-012.2; on the VPS, a branch with a
      type error stopped at the build and the live copy kept serving.)
    - [x] M-CR-011.2 Production smoke test (= 6.5.2): HTTPS works; an anonymous visit goes to
      `/login`; login, one entry and a delete work; the other apps on the VPS still run.
  - **Acceptance:** the production URL works on both partners' phones (6.5); typecheck and lint
    are green.

- [x] **CR-012 Releases follow the VPS convention; signed-in pages are always dynamic** (2026-10-08)
  - **Source:** user feedback (CR-011) and misalignment in CR-011 (the VPS build timed out
    prerendering the `(app)` pages)
  - **Decision:** D-031 · **Docs:** SRS §1 (Hosting), §2 (item 1), §11, §12
  - [x] CR-012.1 `src/app/(app)/layout.tsx`: `export const dynamic = "force-dynamic"`. The build
    lists every `(app)` route as dynamic (ƒ) and finishes with an unreachable `DATABASE_URL`.
  - [x] CR-012.2 `next.config.ts`: `output: "standalone"`.
  - [x] CR-012.3 `scripts/deploy.sh` (bash, `set -Eeuo pipefail`), run in the clone on `main`:
    `npm ci`, `nice -n 19 npm run build`, `npx drizzle-kit migrate`, copy `.next/standalone` +
    `.next/static` + `public` + `.env.local` to `/var/www/mobile-business-new`, swap it with the
    live folder (the old one → `/var/www/mobile-business-old`), `systemctl restart`. A failed
    build or migration leaves `/var/www` untouched; a failed start moves the old copy back.
    `--rollback` swaps the live and `-old` folders and restarts.
  - [x] CR-012.4 `deploy/mobile-business.service`: `node server.js` in `/var/www/mobile-business`,
    `PORT=4005`, `HOSTNAME=127.0.0.1`, user `ubuntu`, nvm's node path. `deploy/README.md`: the
    one-time setup and the release/rollback steps for this layout. `deploy/nginx.conf` unchanged.
  - [x] CR-012.5 (found in M-CR-012.3) `src/middleware.ts`: build the redirect URL from
    `X-Forwarded-Host`/`-Proto` (else `Host` and the request's own URL), not `request.url`.
  - **Tests:**
    - [x] U-CR-012.1 Behind the proxy, an anonymous visit redirects to
      `https://business.example.com/login`; without a proxy, to the request's own host.
    - [x] M-CR-012.1 A local `next build` with an unreachable `DATABASE_URL` finishes, and every
      `(app)` route is ƒ.
    - [x] M-CR-012.2 `bash -n` and `shellcheck` pass on `deploy.sh`; a container run with stubbed
      `sudo`/`systemctl` covers: first deploy, failed build (live folder untouched), failed start
      (old copy back), rollback.
    - [x] M-CR-012.3 The standalone server starts from a copied folder, loads its `.env.local`, and
      `/login` answers; with nginx's headers, `/stock` redirects to the public `/login`.
  - **Acceptance:** typecheck, lint, `npm test` and `npm run test:int` are green; then CR-011.3 and
    its M tests run on the VPS with this script.

- [x] **CR-013 UI feedback pass: dark controls, entry details in place, quick actions, card page,
  speed** (2026-10-09)
  - **Source:** user feedback after go-live (CR-011)
  - **Decision:** D-032 · **Docs:** UIDD §1, §2, §3, §4.2, §4.3, §4.8, §4.10, §4.11
  - **No business calculation changes:** `src/lib/engine/**` is not edited.
  - [x] CR-013.1 Speed (no behaviour change):
    - `cache()` on `loadBooks`, `loadSetup`, `loadEntry` and `getUser`;
    - `loadCalendar` in parallel;
    - `loadEntry` reuses its calendar;
    - postgres-js `max_lifetime: null` and `fetch_types: false`.
  - [x] CR-013.2 Dark controls:
    - `color-scheme` per theme and `option` colours;
    - date/month fields open their picker on click;
    - a darker sheet overlay;
    - modals centred on desktop.
  - [x] CR-013.3 `src/lib/href.ts` (`withQuery`, `entryHref`, `safeFrom`). `EntryOverlay` on Home,
    Journal and the card, customer, supplier and person pages. `EntryDetail` takes `closeHref`,
    closes at once, and shows Edit primary / Delete destructive. Page modals close at once.
  - [x] CR-013.4 Pre-fill and `from` (`src/lib/prefill.ts`):
    - `money/new`, `sales/new` and `purchases/new`;
    - the 4 edit pages;
    - Setup `?edit=`.
  - [x] CR-013.5 Quick actions (`quickActions` in `nav.ts`, `accounts/quick-actions.tsx`) on the
    4 detail pages.
  - [x] CR-013.6 Card page:
    - `src/lib/banks.ts` + the bank badge (card list, detail, Home alerts, person's cards);
    - Statements collapsed (`visibleBills`), with ✎ Set dates and Pay ৳remaining;
    - the EMI charge label;
    - "Statement 5th · Due 20th".
  - [x] CR-013.7 Journal (`src/lib/journal-filter.ts`): URL filters, the Who picker, Period,
    search, Clear, the single-type total; "See in Journal" links.
  - [x] CR-013.8 Home: one card alert per card, linking to the card; tiles link to their pages.
  - [x] CR-013.9 Purchase form: the EMI preview (`emiPreview`, built on the engine's
    `billMonthOf` + `splitEven`); Bill month next to the Card picker.
  - [x] CR-013.10 Navigation: the desktop sidebar lists the More links; More is active on them;
    "Closing" → the month; the top bar truncates; wide tables scroll.
  - **Tests:**
    - [x] U-CR-013.1 `href`: `withQuery`, `entryHref`; `safeFrom` rejects `//`, `/\`, URLs,
      arrays, empty and too long.
    - [x] U-CR-013.2 `banks`: the real card names map to their bank and network; unknown → initials;
      every colour has ≥ 4.5:1 contrast.
    - [x] U-CR-013.3 `journal-filter`:
      - a Period month includes "for" entries;
      - This/Last month across a year boundary;
      - a custom range is inclusive, and From > To flags an error;
      - Who, search, and the parse/serialise round-trip;
      - the total only for a single type.
    - [x] U-CR-013.4 `card-view`: `visibleBills`, `payable`, `emiLabel` (even and uneven),
      `ordinal`.
    - [x] U-CR-013.5 `cardAlerts`: one row per card, overdue first, top 5, the bill's remaining.
    - [x] U-CR-013.6 `emiPreview` equals `computeBooks` for the same purchase: before, on and
      after the statement day; a 31st clamp; an override; actual dates.
    - [x] U-CR-013.7 `cleanPrefill`: invalid, unknown and inactive ids; Walk-in rules; amount
      parsing; card → source; `from`.
    - [x] U-CR-013.8 `quickActions`: per kind; Walk-in gets only Sale + Journal; inactive → none; `from` is
      encoded.
    - [x] U-CR-013.9 `loadBooks`, `loadSetup`, `loadEntry` and `getUser` go through React
      `cache`.
    - [x] I-CR-013.1 Query counts (the speed guard):
      - `loadBooksData` 12, `loadSetup` 5;
      - `loadCalendar` 3, issued together;
      - `loadEntry` loads the calendar once;
      - `loadJournal` 1 + 3.
    - [x] I-CR-013.2 `loadEntry().calendar` equals `loadCalendar()`.
    - [x] I-CR-013.3 DB options: numeric, date, jsonb and timestamptz round-trip; a stale
      `updatedAt` is still rejected.
    - [x] I-CR-013.4 `cleanPrefill` against real Setup rows (inactive card/customer, Walk-in,
      unknown id).
    - [x] I-CR-013.5 An EMI card purchase saved by the action → one card alert; `visibleBills`
      hides the future installments.
    - [x] E-CR-013.1 Dark mode:
      - `color-scheme`; select/option contrast ≥ 4.5;
      - a click on a date field calls `showPicker`;
      - overlay alpha ≥ 0.4;
      - modals centred at 1280 px.
    - [x] E-CR-013.2 axe: no serious/critical violations on the main pages, light and dark.
    - [x] E-CR-013.3 Entry sheet in place:
      - on card, customer (+ Bills), supplier, person and Home: open → close by ✕, Esc, outside
        and Back stays on the page;
      - Reversed by stays;
      - Delete returns to the page;
      - Edit → Save returns;
      - a locked entry has only Reverse (checked inside E5.6.1, while its month is closed);
      - an unknown entry → a note.
    - [x] E-CR-013.4 Quick actions:
      - pre-fill on each page; Save/Cancel return to `from`;
      - Walk-in limited; inactive → none; Setup edit opens;
      - tampered `from`/ids/amount are ignored.
    - [x] E-CR-013.5 Card page:
      - collapsed statements and Show all;
      - badge, EMI label and facts;
      - Pay ৳remaining as a split payment, then the rest;
      - Set dates → actual.
    - [x] E-CR-013.6 Journal:
      - Who picker; Period (this month, a "for" month, a custom range);
      - the URL survives a reload;
      - See in Journal; search; single-type total; Clear.
    - [x] E-CR-013.7 Home: an alert → its card; an EMI card shows once; the tiles' links.
    - [x] E-CR-013.8 Purchase: the EMI preview equals the saved card bills; Bill month next to the
      Card picker.
    - [x] E-CR-013.9 Shell: the desktop sidebar links; More is active; Closing → month; no
      horizontal scroll at 360 px.
  - **Acceptance:**
    - typecheck, lint, `npm test`, `npm run test:int` and `npm run test:e2e` (360 + 1280) are
      green;
    - `git diff --stat src/lib/engine` is empty;
    - a manual dark-mode check on a phone.
  - **Result (2026-10-09):** typecheck and lint clean; `npm test` 434 passed; `npm run test:int` 22
    files, 87 tests passed; `npm run test:e2e` 104 passed, 4 skipped (viewport-only), 0 failed.
    Deployed with CR-014; the manual dark-mode check on a phone passed (2026-10-10).
  - **Test notes:** long E2E runs on `next dev` recompile pages that have gone idle, so tests that
    click to another page wait for its URL, and multi-page tests are `test.slow()`.

- [x] **CR-014 Bank badges in logo colours; whole table rows open; card list polish** (2026-10-09)
  - **Source:** user feedback on CR-013
  - **Decision:** D-033 · **Docs:** UIDD §4.8, §4.10
  - [x] CR-014.1 `src/lib/banks.ts`: the logo colours (one colour, split or gradient) and the text
    chosen by contrast; `bank-badge.tsx` draws them.
  - [x] CR-014.2 `src/components/tables/row-link.ts`: a stretched row link on the Cards, People
    and statement tables.
  - [x] CR-014.3 Cards list:
    - the status badge doesn't wrap;
    - "Credit ৳X" for a negative balance;
    - the phone badge sits beside the name;
    - no stray "—".
  - [x] CR-014.4 Journal filter labels line up; InfoNote keeps a 44px tap target without a taller
    line.
  - **Tests:**
    - [x] U-CR-014.1 (in `banks.test.ts`) the current banks' colours; the text reads ≥ 4.5:1 on
      one colour and ≥ 3:1 on several.
    - [x] E-CR-014.1 a click on a non-link cell opens the card (Cards table) and the entry
      (Capital history); the status badge is `nowrap`.
  - **Acceptance:** typecheck, lint, unit and the affected E2E specs are green; a full E2E run
    before deploy.
