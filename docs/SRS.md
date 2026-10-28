# Self-Balancing Bookkeeper — SRS (v1)

*Technical specification · 7 October 2026 · v1.1* — implements `docs/PRD.md`.

## 1. Stack (decided)

| Layer | Choice |
|---|---|
| UI | **Next.js 16** (D-048; App Router, TypeScript, React Server Components). It is the UI and a backend-for-frontend: pages read one `/views/*` endpoint each, and every write is a **server action** that forwards to the api (D-068) |
| API | **NestJS 11** (D-068): the data, the writes (one runner), the crypto and the files. Bundled by webpack + swc into one `dist/main.js` with the PDF fonts; listens on `127.0.0.1` only |
| DB + login | **Supabase**: Postgres + Supabase Auth (email/password). Region **Mumbai (`ap-south-1`)**. The api verifies sign-in tokens itself (the project's JWKS) |
| DB access | **Drizzle ORM** (schema in TypeScript, SQL migrations via `drizzle-kit`, `packages/db`), in the api only, through `DATABASE_URL` |
| Shared code | `packages/domain`: the pure engine, money, dates, guards and Zod schemas, used by both apps |
| UI kit | Tailwind CSS + shadcn/ui · React Hook Form + Zod · charts: the shadcn/ui Chart component (Recharts), loaded only by the chart pages (D-064) |
| Tests | **Unit:** Vitest (money, dates, engine, posting rules, guards, Zod, PDF and sheet text, the boundary lint). **Integration:** Vitest + supertest, the api in-process against a **local Supabase** (Docker, `supabase start`) with real tokens. **E2E:** Playwright (360px and 1280px, 3 themes) on both built apps. **Parity:** a harness comparing this build with the pre-migration one (`docs/TASKS-NEST.md`). **CI:** GitHub Actions on every push to `dev`. Plus a final manual phone pass (§14) |
| Excel | **ExcelJS** for the export and the reports' Excel files, in the api (the SheetJS npm package is outdated) |
| PDF | **`@react-pdf/renderer`** in the api (`/files/pdf/*`, forwarded by web's `/pdf/*`), with embedded Noto Sans + Noto Sans Bengali for ৳ (D-041) |
| Hosting | The partners' own **Linux VPS in Singapore** (D-030, D-031): two systemd services on one VPS, web (a Next.js **standalone** `server.js`) and the api (`127.0.0.1` only), behind the existing **nginx** (HTTPS via Let's Encrypt) on their own subdomain. No Docker. Releases run `scripts/deploy.sh` in the VPS's clone of the repo: both apps are built, copied into one folder and swapped together, the api is started before web, and each is checked with curl (N-7.1). Supabase stays for the DB and login |

**Why Supabase:** Postgres gives exact `numeric` money, foreign keys (no misspelled names), `CHECK`
constraints, transactions, SQL reports, and an easy export. Firebase/Firestore was rejected (float
numbers, no joins).

## 2. Architecture

```
Browser (mobile-first UI)
   │  pages, server actions, file URLs
Next.js (apps/web) ── HTTP on 127.0.0.1, the user's token ──► NestJS (apps/api) ──► Drizzle ──► Supabase Postgres
                                                                   │                (entries only, no stored balances)
                                                                   └─► computeBooks(data, asOf)  ← packages/domain, pure, unit-tested
```

`docs/ARCHITECTURE.md` describes a read, a write and a file request step by step.

1. **Only facts are stored.** Every balance is derived by the engine from the entries on each
   request. The data is small (<20k rows/yr), so recomputing is cheap; within one page render the
   api loads the books once (its render memo, D-068). The signed-in pages are never prerendered
   (`dynamic = "force-dynamic"` on the `(app)` layout, D-031), so a build never calls the api.
2. **The engine is pure.** It has no I/O: the input is plain arrays of rows, the output is plain
   objects. This makes it testable without a database.
3. **Writes go through server actions**, which keep their names and forward the input to the
   api. There, one runner does this:
   1. Check the session and `role = partner`.
   2. Validate with Zod.
   3. **Duplicate check** (new entries only): if a row exists with the same type, same
      counterparty (customer/supplier/card/person), same amount (or bill total) and same date, return
      a warning ("A similar entry exists (by X, time) — save anyway?"). The client resubmits with
      `confirmDuplicate: true`. It never blocks. A Damaged / lost write-off has no counterparty
      and refunds 0, so it matches on the same lot and qty and the same date instead (D-025).
   4. Run the DB transaction.
   5. Write an audit row.
   6. Return the `Result` (200 ok, 409, 422); on ok, web revalidates the pages.
4. **Security:** RLS is **enabled with no policies** on every table, so the public anon key can
   read or write nothing. All database access is in the api, through Drizzle on the DB connection
   string; web has no database URL and no card key, and a lint rule keeps database, crypto and
   file code out of it (D-068). The service key is never sent to the browser.
5. **AI assistant** (D-057): a separate, read-only track, specified in `docs/AI.md` (READ ONLY
   transaction, pure tools, no server-action imports; figures rendered from the screens' view-models).

## 3. Money, dates, ids

- **Money storage:** DB `numeric(14,2)`. In TypeScript, amounts are **integer poisha** (`number`;
  safe to ~9×10¹³ taka).
  - `src/lib/money.ts` provides: `parse(str) → poisha`, `format(poisha)` (`৳` + en-IN lakh grouping,
    decimals only when non-zero, e.g. ৳75,12,345 and ৳17,444.80; see UIDD §2),
    `add`/`sub`/`mul(qty)`, `pct(basis, ratePct)` (half-up),
    `splitShares(total, pcts) → amounts[]` (each = pct of |total| rounded half-up, sign applied;
    the first partner takes the residual, so the amounts sum exactly to total, losses included),
    `splitEven(total, n)` (EMI: equal parts, remainder in the last), `avgUnit(total, pieces)` (a
    display-only average price, half-up to whole taka; null when pieces ≤ 0; D-056),
    `compact(poisha)` (chart axes only: `৳1.2 Cr` / `৳4.6 L` / `৳45K` / `৳850`; one decimal under
    10 units, rounded half away from zero, moving up a unit when it rounds to the next one; D-064),
    `avgTaka(total, n)` (a display-only average to whole taka, half away from zero, so a negative
    total works; the Due trend's average; D-064).
  - **Never** use JS float arithmetic on money.
- **Lot cost** is stored as `unit_cost`. A line's cost = `unit_cost × qty`, which is always exact.
  The user always types the unit cost; there is no line-total input. (If an invoice total doesn't
  divide evenly, the user enters two lines.)
- **Dates:** a `date` column (no time), interpreted in Asia/Dhaka. "Today" = the current Dhaka date.
  **Future dates are rejected.** A month is `YYYY-MM`.
  - Apart from opening items, nothing may be dated before the opening date, or have a `for_month`
    before the opening month.
  - `for_month` ≤ the month of the entry's date (no booking ahead).
- **Ids:** UUIDs generated by the client form. Insert uses `on conflict (id) do nothing`, so a
  double-submit is a no-op.
- **Concurrency:** edits, deletes and Undo send the `updated_at` the client saw. If it doesn't
  match, the server returns a "changed by someone else — reload" error.

## 4. Data model (`packages/db/src/schema.ts`)

All tables: `id uuid pk`, `created_at`, `updated_at`, `created_by` (auth user id). Money columns
are `numeric(14,2)` with a `CHECK (> 0)` unless stated otherwise.

### Setup
| Table | Columns |
|---|---|
| `profiles` | `user_id` (auth.users), `name`, `role` ∈ partner \| investor \| employee (v1: partner only), `person_id?`, `theme` ∈ light \| dark \| night_owl (default night_owl, D-036) |
| `people` | `name` unique, `kind` ∈ partner \| investor, `profit_share_pct?` numeric(6,3) (partners only; 50 each today; active partners must total 100, checked at close and import; a Setup save is allowed while they don't, and Setup shows a warning, D-023), `note?` (e.g. "managed by Arif"), `phone?`, `whatsapp?`, `email?`, `active` |
| `cards` | `name` (e.g. "Brac"), `network` ∈ visa \| mastercard \| amex \| none (the Type, default none), `owner_person_id` — unique `(owner_person_id, name, network)`, shown as "Owner · Name Type" ("Arif · Brac Visa"; the type isn't repeated if the name holds it; D-022, D-036), `statement_day` 1–31, `due_day` 1–31, `credit_limit?` (approx. available = limit − business balance), `active` |
| `card_bill_dates` | `card_id`, `bill_month` (date = 1st of month), `actual_statement_date?`, `actual_due_date?` — unique (card, bill_month); overrides only |
| `customers` | `shop_name?` (filled in later in the app; unique when set), `proprietor_name` (required, e.g. Milon, Selim), `phone?`, `whatsapp?`, `email?`, `address?`, `target_balance?` (e.g. Milon 5,000,000), `active`. Display = `shop_name (proprietor_name)`, or `proprietor_name` while no shop name is set. Unique on `(proprietor_name, shop_name)` **`NULLS NOT DISTINCT`** (so two "Milon" rows without a shop name are rejected). A built-in **Walk-in** customer is seeded (`is_system = true`; read-only in Setup: it can't be edited, deactivated or deleted, D-023). Walk-in can't be used for `customer_offset` purchases, `customer_profit_share` or `customer_cash_given` |
| `suppliers` | `name` unique, `phone?`, `whatsapp?`, `email?`, `active` |
| `models` | `name` unique (canonical, e.g. "Vivo Y05 4/64"), `active` |

### Business and saved details (D-036; filled in by CR-019 and CR-026)
| Table | Columns |
|---|---|
| `business_profile` | One row (seeded: Demo Business Shop, its phones, the logo). `name`, `short_name?`, `address?`, `phones?`, `whatsapp?`, `email?`, `trade_licence?`, `tin?`, `bin?`, `invoice_terms?`, `receipt_terms?`, `statement_terms?` (each printed on its own PDF; D-049), `footer?`, `logo?` (a 256 px image as a data URL, served by the public `/logo` route and never written to the audit log), `templates` jsonb `{ <type>: { greeting, signOff } }` for sale, payment, return, discount, profit_share, reminder, statement, investor (defaults in code; `{name}`, `{shop}`, `{phone}`; D-039) |
| `bank_accounts` | `person_id?`, `customer_id?`, `supplier_id?` (at most one set; none = the business), `bank_name`, `branch?`, `account_name`, `account_number`, `routing_number?` (9 digits), `note`, `active`. Deleted with their owner; they don't make the owner "used" |
| `card_secrets` | `card_id` (several per card: the primary + supplementary numbers, D-054), `supplementary` bool (default false; at most one primary per card: unique `card_id` where not `supplementary`), `number` / `holder?` / `expiry?` / `cvv?` (each AES-256-GCM ciphertext; the key is only on the server), `last4` (plain). A number is saved on one card only (D-067, §11). Deleted with the card; never exported, audited with values or logged |
| `passkeys` | `user_id` (auth.users), `credential_id` unique, `public_key`, `counter`, `transports?`, `device_name?`. Never exported |
| `passkey_challenges` | `user_id`, `challenge`, `expires_at`: one-time WebAuthn challenges, deleted on use. Never exported |

### Trade
| Table | Columns |
|---|---|
| `purchases` | `date`, `supplier_id?` (required when source = supplier_credit), `source` ∈ cash \| card \| supplier_credit \| customer_offset \| opening \| opening_correction, `card_id?` (source = card), `customer_id?` (source = customer_offset), `emi_months?` (≥ 2, card only), `bill_month_override?`, `reverses_id?`, `note` |
| `purchase_lines` (= **lots**) | `purchase_id`, `model_id`, `qty` int > 0, `unit_cost`, `imei_note?` |
| `sales` | `date`, `customer_id`, `invoice_no?` (unique; see Numbers below), `reverses_id?`, `note` |
| `sale_lines` | `sale_id`, `lot_id`, `qty` int > 0, `unit_price` (≥ 0; a loss is allowed) |

**Numbers (D-036):** `sales.invoice_no` and `money_entries.receipt_no` (customer payments only)
are one running series each, from the sequences `sales_invoice_no_seq` / `money_entries_receipt_no_seq`.
They are assigned **at save, in code**, to new sales and customer payments (including "Received
now") that aren't reversals; a reversal has none (`CHECK`). An edit keeps its number. Undo or delete
leaves a gap; a number is never reused. Shown as `INV-0001` / `MR-0001` (CR-022).

**Lot picking on sale (oldest first):**
- The form sends lines of *(model, qty, unit_price, lot_id?)*.
- **No lot_id:** the server takes units from that model's lots with remaining > 0 and purchase date
  ≤ the sale date, **oldest first** (by purchase date, then created_at). It splits the line into
  several `sale_lines` if needed, all at the same unit_price.
- **lot_id given:** that lot is used (a manual override). Its purchase date must also be ≤ the sale
  date.
- The same date check applies when a purchase or sale date is edited.
- **Editing a sale:** each existing line keeps its lot (treated as a manual choice), so nothing
  moves unless the user changes it. Only new lines, or lines whose model changes, are filled
  oldest-first.
- The form previews the chosen lots before saving.

| Table | Columns |
|---|---|
| `returns` | `kind` ∈ customer \| purchase, `date` (≥ the date of the sale/purchase it returns), `customer_id?`, `card_id?`, `supplier_id?`, `refund_to?` ∈ cash \| card \| supplier \| customer, `reason?` ∈ returned \| damaged_lost (purchase returns only), `reverses_id?`, `note` |
| `return_lines` | `return_id`, `sale_line_id?` (customer), `lot_id`, `qty`, `unit_amount` (refund price per unit, ≥ 0; for a customer return this defaults to the sale line's `unit_price`) |

**Purchase returns:**
- One purchase return covers lots from a single purchase.
- `refund_to` and its target (`card_id` / `supplier_id` / `customer_id`) default to the original
  purchase's source. A customer_offset purchase refunds to that customer's due. An opening or
  opening-correction lot has no source, so the target must be chosen (no default).
- `refund_to = supplier` requires `supplier_id`; `card` requires `card_id`.
- `reason = damaged_lost` is the v1 write-off (refund 0).

**Lot remaining** = `qty − Σ sold + Σ customer-returned − Σ purchase-returned`, where reversed sale
and return lines count with the opposite sign.
- It must stay ≥ 0. This is checked in the write transaction with `SELECT … FOR UPDATE` on the
  affected lots.
- A customer return qty must also be ≤ (sale-line qty − already returned).

### Money
**`money_entries`** — one table for every single-amount entry.

**Columns:** `type`, `date`, `amount`, `for_month?`, `customer_id?`, `supplier_id?`, `card_id?`,
`person_id?`, `source?` ∈ cash \| card, `category?`, `card_charged?`, `cash_received?`,
`settle_mode?` ∈ received \| added_to_due, `bill_month_override?`, `emi_months?`, `opening_kind?`,
`receipt_no?` (customer_payment only, unique; see Numbers above), `reverses_id?`, `note`.

**Allowed fields per type** are validated by Zod (the source of truth) plus DB `CHECK`s for the
critical ones:

| `type` | Required |
|---|---|
| `customer_payment` | customer, amount |
| `customer_cash_given` | customer, amount |
| `customer_discount` | customer, amount (writes off a small leftover due) |
| `customer_profit_share` | customer, amount, for_month, settle_mode |
| `supplier_payment` | supplier, amount, source (+card if card) |
| `card_payment` | card, amount |
| `card_cash_out` | card, card_charged, cash_received (≤ charged); amount = card_charged |
| `card_fee` | card, amount, category = card fee/interest |
| `cashback` | amount, source (card → card_id; or cash) |
| `expense` | amount, category, source (+card), for_month (default = month of date) |
| `capital_in` / `capital_out` | person, amount; `capital_out` also source (+card if card; default cash, and a stored null = cash, D-060) |
| `profit_paid` / `profit_reinvested` | person, amount |
| `opening` | opening_kind ∈ cash \| customer_due \| supplier_due \| card_balance \| capital \| profit_owed \| opening_difference, plus its target id (`opening_difference` targets a partner person), amount (`CHECK ≠ 0`; customer_due, supplier_due and card_balance may be negative = credit/advance). card_balance also uses bill_month_override and emi_months |
| `opening_correction` | Same kinds and targets as `opening` (except opening_difference), signed amount (`CHECK ≠ 0`), dated in an open month. A missed stock lot uses `purchases.source = opening_correction` instead |

### Month close
| Table | Columns |
|---|---|
| `month_closes` | `month` (unique), `close_date`, `snapshot` jsonb (engine output for that month, for display), `closed_by`. A row exists only while the month is closed; re-open deletes it (kept in the audit log) |
| `allocations` | `month`, `person_id`, `kind` ∈ cash \| card \| partner, `basis?`, `rate_pct?` numeric(6,3), `amount`. **cash/card** (investors): basis (> 0) and rate required, amount defaults to `pct(basis, rate)`, editable, ≥ 0. **partner**: one row per partner from `splitShares(R, profit_share_pct)`, may be negative. Σ amount for a month = Profit(M) at close. These rows are the stored facts for closed months |

### Audit
`audit_log`: `table`, `row_id?`, `action` ∈ insert \| update \| delete \| reverse \| close \| reopen \|
export \| reveal (a card's details shown, never the values; CR-026), `before` jsonb, `after` jsonb, `user_id`, `at`. An export writes one row with no `row_id`; the
Export page shows the latest one.

## 5. Posting rules (precision contract)

Each entry moves both sides of the books. The engine implements exactly this table, and each row
has a unit test. **Reverse** = the same effects, all negated.

The forms' **"What this will do"** preview (UIDD §3, Forms) calls the same engine posting-rule
function on the unsaved entry. It never has its own copy of these rules.

| Entry | Cash | Stock@cost | Cust. due | Supplier due | Card bal. | Capital | Profit owed | Profit(month) |
|---|---|---|---|---|---|---|---|---|
| Purchase, cash (T = Σ qty×unit_cost) | −T | +T | | | | | | |
| Purchase, card (incl. EMI) | | +T | | | +T | | | |
| Purchase, supplier credit | | +T | | +T | | | | |
| Purchase against customer's due (customer_offset) | | +T | −T | | | | | |
| Sale (P = Σ qty×price, C = Σ qty×unit_cost) | | −C | +P | | | | | +(P−C) @sale month |
| Customer return (Pr, Cr) | | +Cr | −Pr | | | | | −(Pr−Cr) @return month |
| Purchase return (R refund, Cr cost) | +R if cash | −Cr | +R if customer | −R if supplier | −R if card | | | +(R−Cr) |
| Customer payment | +A | | −A | | | | | |
| Cash given to customer | −A | | +A | | | | | |
| Customer discount / settlement | | | −A | | | | | −A |
| Profit share, received | +A | | | | | | | +A @for_month |
| Profit share, added to due | | | +A | | | | | +A @for_month |
| Supplier payment | −A if cash | | | −A | +A if card | | | |
| Card payment | −A | | | | −A | | | |
| Card cash-out (ch, rc) | +rc | | | | +ch | | | −(ch−rc) |
| Card fee / interest | | | | | +A | | | −A |
| Cashback | +A if cash | | | | −A if card | | | +A |
| Expense | −A if cash | | | | +A if card | | | −A @for_month |
| Capital in / out | ±A | | | | | ±A | | |
| Capital out, by card (D-060) | | | | | +A | −A | | |
| **Month close M** (investor alloc. Iᵢ, remainder R = Profit(M) − ΣI, partner shares Pⱼ = `splitShares(R, pct)`) | | | | | | | +Iᵢ, +Pⱼ | −Profit(M) (moves to owed) |
| Profit paid | −A | | | | | | −A | |
| Profit reinvested | | | | | | +A | −A | |
| Opening items (one-sided, see below) | per kind | lots via `purchases.source=opening` | ± | ± | ± (billed per bill month) | + (incl. opening difference) | + | |
| Opening correction (the item changes by signed X; D = opening difference, see below) | X if cash | +T if lot | X if due | X if supplier due | X if card | X if capital; **+D** | X if profit owed | |

**Books-balance invariant** (must hold after every entry; it is shown on the dashboard):

```
Cash + Stock@cost + Σ customer dues − Σ card balances − Σ supplier dues
  = Σ capital (all people, incl. opening difference) + Σ profit owed + Undistributed profit
```

All terms are **signed**:
- a negative customer due = customer credit;
- a negative card balance = card credit;
- a negative supplier due = an advance paid to the supplier.

Undistributed profit = Σ Profit(M) over months not yet closed. Profit owed comes from the stored
`allocations` rows (§7), so a closed month never depends on recomputing its profit.

**Opening entries are one-sided by nature.** Each states one balance as of the opening date. The
import therefore books the residual (assets − liabilities − capital − profit owed) as
`opening_difference`: one capital entry per partner, created by `splitShares`. After that the
invariant holds. Opening difference is shown separately on the dashboard and the person page until
it is resolved (its net total, including corrections, is 0).

**Opening correction:** D keeps the row balanced: D = +X for an asset item (cash, customer due, a
lot = T), −X for a liability item (supplier due, card balance), and −X for capital or profit
owed. D is booked as opening difference split between the partners by `splitShares`. Profit is
never touched. Example: a missed customer due of 20,000 → due +20,000, D = +20,000.

**Cash warning:** if running Cash < 0 on any date, the dashboard warns that an entry is probably
missing and shows the first such date. The engine returns that date (or none).

Every row of the table moves both sides equally, so the identity holds by construction. A ✗ means
there is an engine bug or an opening data error. The test suite asserts it after every scenario.

## 6. Card statements (port of Nadim's "Billing Dates" sheet)

Everything here is computed on the fly; no rows are stored except the `card_bill_dates` overrides.

1. **Statement date** for card c and bill month m = `actual_statement_date` if set, otherwise
   `m` with day `statement_day`, clamped to the month end.
2. **Due date** = `actual_due_date` if set, otherwise the first date **after** the statement date
   whose day = `due_day` (clamped to the month end).
   - EBL: statement 5th, due 20th → the same month.
   - Southeast: statement 19th, due 4th → the next month.
3. **Bill month of a charge** (card purchases, cash-outs, fees, expenses, supplier payments or
   capital out paid by card):
   - `bill_month_override` if set;
   - otherwise the **earliest bill month whose statement date ≥ the charge date** (a charge *on* the
     statement date is in that bill).
4. **EMI** (`emi_months = n`): `splitEven(T, n)`. Installment k (k = 0 … n−1) is billed in bill
   month m₀ + k, where m₀ = the purchase's bill month (so the first installment is in the
   purchase's own bill, as in S7). The full T counts in the card balance immediately.
   - The remainder goes in the last installment; a bank may round differently by a few poisha.
   - A refund on an EMI purchase is a plain card credit (§6.5). The installment schedule is not
     changed. A **reversed** EMI purchase bills nothing and its plan is gone (§6.5, D-058).
   - An early settlement is a card payment (+ a card fee for any foreclosure charge). It pays bills
     oldest first, including EMI months not yet billed. The schedule and remaining EMI are not
     changed (D-055).
5. **Bill amount** = Σ charges in that bill. **Credits** (card payments, card cashback, card-side
   refunds) are poured into bills **oldest bill month first, regardless of the credit's date**.
   Leftover credit is card credit and covers later bills.
   - **Reversals** (D-058, replacing D-021's rule): a reversed card entry and its reversal both
     **drop out of the bills**, whatever the type (payment, purchase, EMI purchase, cash-out, fee,
     cashback, refund, opening item). The bills, paid / remaining and Remaining EMI read as if
     neither was entered; a bill month left with no charges disappears. The balance is unchanged
     (the pair nets to 0).
     - The pair drops out only when the reversal's date ≤ the "as on" date; before that the
       original counts as entered.
     - A real refund is not a reversal: a refund to the card (purchase return) is a credit poured
       oldest first, as above.
6. **Per card output:**
   - balance = Σ charges − Σ credits;
   - for each bill: statement date, due date, amount, paid, remaining, and whether the dates are
     actual or estimated;
   - next due date + amount = the earliest bill with remaining > 0 and due ≥ today (D-021);
     overdue bills show only in the overdue amount and status;
   - overdue amount (due < today, remaining > 0);
   - due within 7 days;
   - unbilled amount (statement date > today);
   - remaining EMI;
   - **status:** Check dates (statement not in its month, or due ≤ statement) / Card credit /
     Clear / Overdue / Due today / Due within 7 days / Upcoming.

### Regression fixture (must pass)
`tests/fixtures/investor-cards.ts`: 18 fictional rows in an investor's card-sheet shape (date,
card, type, amount, cash-out?), posted in sheet order (D-069).

**Mapping:**
- `Card purchase` + `Cash-out?=Yes` → `card_cash_out` (charged = received = amount).
- `Card purchase` + `No`/blank → a card charge (a purchase line, or a test-only raw charge).
- `Card payment` → `card_payment`.
- `Cash invested` → `capital_in`.

**Card usual days** (statement/due):

| Card | Statement / due |
|---|---|
| Kite Visa | 19/4 |
| Lotus Visa | 20/3 |
| Delta Visa | 5/20 |
| Harbor Visa | 23/14 |
| Summit Visa | 10/25 |
| River Amex | 28/12 (D-022: shares River Visa's days) |
| River Visa | 28/12 |

**Expected values as of 2026-10-06:**

| Card | Balance | Next due | Amount |
|---|---|---|---|
| Kite Visa | 35,500.50 | 2026-11-04 | 35,500.50 (Sep bill 65,000 fully paid; Oct bill 50,500.50 − 15,000) |
| Lotus Visa | 250,000.00 | 2026-11-03 | 250,000.00 |
| Delta Visa | 65,250.75 | 2026-10-20 | 65,250.75 (incl. a cash-out on the statement day) |
| Harbor Visa | 180,000.00 | 2026-11-14 | 180,000.00 |
| Summit Visa | 25,000.00 | 2026-10-25 | 25,000.00 |
| River Amex | 0.00 | — | Clear |
| River Visa | 90,000.00 | 2026-10-12 | 90,000.00 (status: due within 7 days) |
| **Total** | **645,751.25** | | |

Also from the same fixture: cash-outs total 190,000 (6 entries), and cash invested is 800,000.

## 7. Month close

- **`Profit(M)`** = Σ sale profit (sale date ∈ M) − Σ returned profit (return date ∈ M)
  − Σ customer discounts (date ∈ M) + Σ profit share (for_month = M) + Σ cashback (date ∈ M)
  − Σ expenses (for_month = M) − Σ card fees and cash-out fees (date ∈ M)
  + Σ purchase-return differences (date ∈ M).
- **Close M** (a server action, in one transaction):
  1. Require that every earlier month with entries is closed, that M is not already closed, and
     that M is not after today's month (a month that hasn't started can't be closed, D-028).
  2. Save the investor `allocations` (kind cash/card). Form defaults: the cash basis = the
     investor's capital at month end; the card basis and the rate default to that investor's
     values from the previous month (blank the first time). A line is saved only with basis > 0,
     a rate and an amount; a line with no amount (basis or rate blank) or basis 0 is skipped and
     counts as 0; an amount without both a basis and a rate is an error (D-028). **Either
     partner** may close; `closed_by` is recorded.
  3. Compute R = Profit(M) − ΣI and save one `partner` allocation row per partner from
     `splitShares(R, profit_share_pct)` (negative allowed).
  4. Store the snapshot.
  5. Write the audit row.
- **Reminder on the close screen** (never blocks): customers with a `customer_profit_share` for
  M−1 but none for M.
- **Lock rule:** an existing entry is locked if month(date) ≤ the last closed month, **or** its
  for_month ≤ the last closed month. Locked rows can't be edited or deleted; they can be reversed
  (§8). A new entry (including a reversal) is rejected if its date **or** its for_month is in a
  closed month.
- **Re-open:** only the latest closed month. It deletes that month's `allocations` rows, its
  `month_closes` row and snapshot (all kept in the audit log), and unlocks the month. If profit
  paid or reinvested entries exist after the close, the confirm dialog lists them as a warning.
- **Profit owed per person** = Σ `allocations` rows (closed months) − profit paid − profit
  reinvested (+ opening profit owed).

## 8. Edits, deletes, reversals

- **Open-month rows:** edit or delete. Lines are edited with their header in one transaction. An
  audit row is written with the before/after values.
  - An entry's type can't change on edit; delete it and enter the right type instead.
  - An entry with a reversal, and a reversal itself, can't be edited, so the pair always cancels.
    Delete the reversal first (D-026).
  - Sale edits keep the existing lots (§4, lot picking).
- **Reverse:**
  - Creates a new entry with `reverses_id` and the same content (but no invoice/receipt number,
    D-036). The engine negates it.
  - An entry can be reversed at most once. A reversal itself can't be reversed (delete it if its
    month is open, or enter the original again).
  - The reversal always lands in an open month, so closed months never change:
    - if the original's month (date and for_month) is still open, the reversal defaults to the
      original's date and for_month, so both cancel in the same month;
    - otherwise it defaults to today, with for_month = today's month.
    - The user may choose another open-month date, but never one before the original's date.
  - Its profit effect lands in the reversal's own date/for_month.
  - On a card's bills, the pair cancels where the original sits: both drop out (§6.5, D-058).
  - A reversed sale or purchase restores (or removes) the lot quantities.
  - **Blocked if anything depends on the row:** a sale with returns, or a purchase whose lots have
    sales or returns. Reverse the dependents first; a reversed dependent no longer blocks.
  - **Stock stays ≥ 0 (§4):** reversing a customer return is blocked if those units were sold
    again (D-026).
- **Editing a lot's `unit_cost` or `qty` is blocked** if any of its sales or returns fall in a
  closed month, because that would change a closed month's profit.
- **Delete is blocked if anything depends on the row:** a lot with sales or returns, a sale line
  with returns, or an entry with a reversal. Deleting a sale reversal or a purchase-return
  reversal is blocked if the units it gave back were sold again (stock ≥ 0, D-026).

## 9. Opening balances (cutover)

The go-live opening (the 1st of the go-live month) was imported once, with the reference repo's
template builder and importer (D-029, D-055). This repo has no import tools (D-070).

- **Production** keeps the imported opening rows: the setup rows, the opening lots
  (`purchases.source=opening`) and the `opening` money entries, all dated the opening date.
- **A fresh install** starts empty. Without opening items there is no opening date, so no date
  floor (§3).
- **Later fixes** to opening items use `opening_correction` (§4, §5).

## 10. Export

`/export` produces an `.xlsx` with one sheet per table (raw entries) plus summary sheets (cash,
stock, customers, suppliers, cards, people, months). The amounts are written as numbers. Each
export writes an `audit_log` row (`action = export`). `business_profile` is exported without its
`logo` (Excel's 32,767-character cell limit); `card_secrets`, `passkeys` and `passkey_challenges`
are never exported (D-036). The Stock summary sheet has a **Model avg cost** column (each lot row
carries its model's avg cost of the units left, as the Stock screen's In stock view; the Total row
leaves it blank; D-063).

## 11. Auth

- **Login:** Supabase Auth email/password. Sign-ups are disabled in Supabase; the 2 partner users
  are created manually and linked in `profiles`.
- **Session check:** `proxy.ts` (Next 16's middleware, D-048) refreshes the session and redirects
  anonymous users to `/login` (on the public host from `X-Forwarded-Host`/`-Proto` behind nginx,
  D-031). Web sends the session's access token to the api, which verifies it locally (D-068).
  Reads need a signed-in user; every write and file needs `role = partner`, read from `profiles`
  on each request. After a sign-out a copied token still works against the api until it expires
  (at most 1 h); the api listens on `127.0.0.1` only.
- **Card details** (D-046):
  - **Encryption:**
    - `card_secrets` fields are AES-256-GCM ciphertext (`node:crypto`, the card id as extra
      data);
    - the key is `CARD_SECRET_KEY` (32 bytes, base64) in the api's env only;
    - with no key, saving and revealing are refused.
    - a number is saved once across all cards (D-067): on save the server decrypts the rows with
      the same `last4` (not this row) and refuses a match, naming that card.
  - **Reveal** is `POST /cards/<id>/reveal` (`Cache-Control: no-store`; web forwards it to the
    api with only the `card_reveal` cookie, and relays its `Set-Cookie`). It needs a **passkey**
    assertion (`@simplewebauthn/server`) that answers a one-time challenge from
    `passkey_challenges` (2 minutes; deleted on use; the user's own); the signature counter is
    updated. A password is never accepted here (D-052).
  - The body names the saved number (`secretId`, which must belong to card `<id>`). The reveal
    returns only that number's fields and writes one `reveal` audit row without values
    (`{ card, via }`).
  - **Reveal window** (D-054): a fingerprint reveal also sets the cookie `card_reveal`
    (`httpOnly`, `Secure` on https, `SameSite=Strict`, `Path=/cards`, 30 s) = user id + end time +
    an HMAC-SHA256 with a key derived from `CARD_SECRET_KEY`. Until that end time,
    `{ window: true }` instead of a passkey reveals any saved number (`via: window`) and sets no new
    cookie, so the end never moves; an expired, tampered or other user's cookie → 401. The page
    counts its own 30 s from the fingerprint and asks for it again after that.
  - **Edit / remove** of a saved number are allowed only within 10 minutes of the user's own
    reveal of that number (read from `audit_log`). Adding a number needs no reveal.
  - **Passkey set-up** needs the **login password** first, checked by a session-less Supabase
    client; 5 wrong tries lock it for 15 minutes per user (in memory). The passkey's site (rpID) and origin are the
    public host (`X-Forwarded-Host`/`-Proto`).

## 12. Project structure

```
apps/
  web/            (Next.js: the UI)
    src/app/      (routes: /, /login, /purchases, /sales, /returns, /money, /stock, /customers,
                   /suppliers, /cards, /people, /months, /journal, /setup, /export, /settings,
                   /saved (bank accounts, card details), /reports (D-043, D-045; /reports/charts,
                   D-064), /customers/<id>/trend (D-064); the forwarders /logo (public, cached),
                   /pdf/[kind], /reports/*/xlsx, /export/download, /cards/<id>/reveal (D-046))
    src/components/ (ui/ = shadcn, forms/, tables/, charts/ = the only importers of Recharts)
    src/api/      client.ts (the api calls), files.ts (the file forwarder), contract.ts (wire types)
    src/server/actions/ (one thin proxy per entity; auth.ts signs in and out)
    src/proxy.ts  (the session refresh and the /login redirect)
  api/            (NestJS: data, rules, crypto, files)
    src/<area>/   one service (and controller) per area: books, journal, setup, sale, purchase,
                  return, money, reverse, months, cards, card-secrets, passkeys, business, ...
    src/action/   runner.ts (the one write path)
    src/auth/     jwt.guard.ts, auth.service.ts, context.ts (per-request state), memo.ts
    src/views/    the /views/* reads, one per data-loading page or overlay
    src/files/    the /files/* routes (PDFs, Excel, the export, the logo)
    src/pdf/      the shared A4 layout, each document, fonts/ (D-041)
packages/
  domain/src/     money.ts, dates.ts, engine/ (computeBooks, stock, customers, cards, months,
                  balance), charts/ (D-064: pure series), validation/ (Zod per entry type), view
                  helpers, export.ts (the sheets)
  db/             src/schema.ts, src/client.ts, migrations/
scripts/          deploy.sh (VPS release, D-031), parity/ (the parity harness), seed-demo.ts
tests/            engine/*.test.ts, fixtures/, integration/*.test.ts (the api vs local Supabase),
                  e2e/*.spec.ts (Playwright)
supabase/         config.toml (local Supabase for integration/E2E tests)
.github/workflows/ ci.yml
docs/             PRD.md, SRS.md, UIDD.md, ARCHITECTURE.md, TASKS*.md, DECISIONS*.md
```

**File size:** aim for ≤ 500 lines per source file, hard cap 1000 (ESLint `max-lines`, blank
lines and comments not counted). Generated files (migrations, `components/ui`) are exempt. Split
by responsibility, as in `engine/`.

## 13. Build order

v1 was built in this order; the NestJS migration (D-068) then moved it to two apps in sessions
S1–S10 (`docs/TASKS-NEST.md`).

| # | Step | Est. |
|---|---|---|
| 1 | Scaffold: Next.js, Tailwind/shadcn, Supabase project, Drizzle schema + first migration, auth (2 users), app shell, test tooling (Vitest, Playwright, local Supabase) + CI | 0.5–1 d |
| 2 | `money.ts`, `dates.ts`, engine + Vitest: every posting rule, the PRD stories S1–S18, the investor card fixture, the balance invariant | 1 d |
| 3 | Setup screens; Purchase / Sale / Return / Money-entry forms + server actions; Journal (edit / delete / reverse + audit) | 2 d |
| 4 | Card statements + EMI UI; Stock / Customers / Suppliers / Cards / People views; Dashboard | 1.5–2 d |
| 5 | Month close + allocations + profit paid/reinvested + locks + re-open | 1 d |
| 6 | Opening template + import + reconciliation (done once in the reference, D-070); Excel export; deploy | 1–1.5 d |
| 7 | The migration (D-068): monorepo and parity harness; the Nest api; writes, then reads, then files through it; web's server code removed; the two-unit deploy | S1–S10 |

## 14. Verification
- **`npm test`:** every posting rule, S1–S18 (PRD §6), the investor card fixture (§6), and the balance
  invariant after each scenario.
  - Fixture tests compare totals.
- **`npm run test:int`:** the api (in-process, real tokens) against local Supabase. Covers RLS, the session/role
  check, idempotent inserts, the `updated_at` conflict, `FOR UPDATE` on lots, date and lock
  guards, the duplicate warning, audit rows, and the invariant after each scenario. Uses synthetic
  data only.
- **`npm run test:e2e`:** about 5 Playwright golden flows at 360px and 1280px:
  1. login;
  2. purchase → sale → return → payment;
  3. card payment / cash-out / expense + dashboard ✓;
  4. close → lock → profit paid → re-open;
  5. export.
- **CI:** GitHub Actions runs typecheck, lint, unit, integration and E2E on PRs to `dev`/`main`.
- **Manual:** on a phone-sized browser as each partner, run purchase → sale → return → payment →
  card payment → cash-out → expense → close month → profit paid. The dashboard must be ✓, and the
  views must match the export.
