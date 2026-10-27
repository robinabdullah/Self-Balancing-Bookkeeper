# Mobile Business Lite — PRD (v1)

*Product requirements · 7 October 2026 · v1.1; scope extended 10 October 2026 (§4.8)* (changes: `docs/DECISIONS.md`)
Adapted from the original Excel-oriented PRD (R01–R49) after reviewing the real workbooks (not published, D-069),
whose figures here are fictional.

## 1. Purpose

A small, precise web app that replaces the Excel bookkeeping of a two-partner mobile-phone trading
business. The main pain in Excel: a mistyped number or name silently breaks the books. The app fixes
this by:

- **Typing each fact once.** People, cards, customers, suppliers and phone models are **picked from
  lists**, never typed as free text.
- **Calculating every balance from the entries.** No balance is ever typed or stored by hand.
- **Showing a books-balance check (✓/✗) at all times**, so an error shows up the moment it happens.

Currency is BDT (৳). The time zone is Asia/Dhaka. There is a single business (not multi-tenant).

## 2. Users

| Role | v1 | Access |
|---|---|---|
| Partner (2) | ✅ | Everything |
| Investor | later (v2) | Own position only (read-only) |
| Employee | later (v2) | Data entry without profit/investor data |

A role column exists from day 1 so the later roles need no redesign.

## 3. Business facts (from the PRD + real workbooks)

**The business:**
- **Partners:** **Arif** and **Sumon**. Profit after investors
  is split by each partner's **profit share %** (today **50/50**), regardless of how much each
  invested.
- **Investors:** at least 4 (Nadim, Jamal, Faruk, Shakil, …). Each gives **cash and/or credit cards**
  for the business to use.
  - Some investments are held **under Arif's name but belong to other people** (e.g. "Arif vai
    300,000", "Babul vai 900,000"). These are **investors, not Arif's partner capital**.
  - Each one becomes its own investor record (e.g. "Babul vai" is Arif's
    colleague), with a note saying it is managed by Arif. It gets its own monthly allocation, which Arif passes on.
- **Cards:** about 15+ cards, owned by partners and investors. They are used for phone purchases and
  for **cash-outs** (ATM/POS cash withdrawals). In Nadim's workbook, cash-outs are about 80% of all
  card charges.
- **Cash:** one combined business cash balance (bank accounts + cash + bKash together, PRD R03).

**Trading:**
- **Purchases:** from online shops (Daraz, Pickaboo, Othoba), individuals and B2B bulk.
  - Each purchase is paid by **one** source: cash, a card (possibly as **EMI**), supplier credit, or
    **against a customer's due** (buying phones from a customer such as Milon or Selim, offset
    against what they owe).
- **Sales:** mostly to mobile shops on credit. Customers pay over time against their overall
  balance.

**Milon (the largest customer, ~৳75L due):**
- The business keeps about **৳50L invested in Milon's shop**. This was delivered as goods sold on
  credit, plus some cash.
- His balance normally stays at ৳40–75L, and he pays back the part above 50L.
- Each month he also pays a **profit share** (40% of his shop's gross profit) on the 1st–5th of the
  next month. Sometimes he pays it in cash; sometimes it is added to his due.

**Each month:**
- **Monthly close (1st–5th of the next month):** the partners decide each investor's allocation
  (a % of an agreed cash basis and/or card basis), and the remainder is split between the partners
  (50/50 today).
- **Distributed profit:** each person's profit can be **paid**, **reinvested** (it becomes
  capital), or left as **profit owed**.

## 4. Scope — v1

### 4.1 Setup
- **People:** partner or investor, with an optional note (e.g. "managed by Arif"). Partners also
  have a **profit share %** (50/50 today; the partners' %s must total 100 before a month can be
  closed; Setup shows a warning until they do).
- **Cards:** owner, usual statement day, usual due day, and an optional **credit limit**. Each
  person's card is its own card with its own days, even for the same bank (e.g. Arif's and
  Babul's Brac Visa); the name is unique per owner. Shows the
  approximate available amount = limit − business balance. This is approximate because the owner's
  personal spending isn't tracked. Personal spending is tracked only when the business pays it:
  then it is a **Capital out paid by card** for that person (D-060).
- **Customers:** these are mobile shops.
  - **Shop name** and **proprietor name** (e.g. Milon, Selim).
  - Contact details: phone, email, address — all optional.
  - Optional target balance (e.g. Milon's shop ৳50L).
  - Shop names are entered and updated in the app. The workbooks only have proprietor names.
  - Everywhere in the app a customer shows as "Shop name (Proprietor)", and pickers search both
    names.
  - A built-in **"Walk-in"** customer is used for one-off retail sales (usually paid at once).
    It can't be used for a purchase against a customer's due, a profit share or cash given. It is
    read-only in Setup.
- **Suppliers.**
- **Phone models:** clean canonical names.

### 4.2 Daily entries
| Entry | Notes |
|---|---|
| **Purchase** | Date, supplier (optional; required for supplier credit), source = cash / card / supplier credit / **against a customer's due** (stock goes up, that customer's due goes down). Card source can be EMI (n months). One or more lines; each line is a **lot**: model, qty, **unit cost** (always typed per phone; if an invoice total doesn't divide evenly, enter two lines, e.g. 2 @ x + 1 @ y), optional IMEI/note. |
| **Sale bill** | Date, customer, one or more lines: **model, qty, unit price**. The app takes units from the **oldest lot(s) first**, splitting across lots if needed. The user can override this and pick a specific lot. Only lots bought on or before the sale date can be used. A bill may mix models. Can't sell more than is in stock. |
| **Customer return** | Return units from a sale line. They go back to the same lot at its cost, and the customer's due drops. |
| **Purchase return / refund** | Units go back to the seller. The refund goes back to the original source (card/cash/supplier). Reason: **Returned to seller** or **Damaged / lost** (refund 0, see §5). |
| **Customer payment** | Reduces the customer's balance (not linked to a specific bill). Overpayment shows as customer credit. |
| **Customer discount / settlement** | Writes off a small leftover due (e.g. the customer pays 99,950 on 1,00,000 → 50 discount). Reduces the due and that month's profit. |
| **Cash given to customer** | e.g. cash to Milon for the 50L deal. Increases his due, with no profit. |
| **Customer profit share** | e.g. Milon's 40%. Has a "for month" and a choice: *received now* (cash in) or *added to due*. |
| **Supplier payment** | Paid from cash or a card. |
| **Card payment** | Business cash pays a card, including early payments before the statement. |
| **Card cash-out / POS** | Enter the *amount charged to the card* and the *cash received*. The difference is a business expense (fee). |
| **Card fee / interest** | A business expense charged to a card. This is the only way to record card fees and interest. |
| **Cashback** | Credited to a card (or to cash). It counts as business profit. |
| **Expense** | Categories: salary, delivery, POS/QR charges (fees on customer payments; cash-out fees come from the cash-out entry), rent, internet, other. Paid by cash or card. Has a "for month" (e.g. October salary paid on 2 November). |
| **Capital in / out** | Per person. Covers investments, extra money, returned capital and partner drawings (e.g. personal or Umrah expenses). Capital out is paid by cash or a **card**: a person's personal spending on a card the business pays (e.g. a partner's EMI) adds to that card's bill and comes off their capital (D-060). |
| **Profit paid / reinvested** | Per person, after a month is closed. |

### 4.3 Views
| View | Shows |
|---|---|
| Dashboard | Cash (a warning if it goes negative, which means an entry is missing), stock (units + cost), customer dues, supplier dues, card alerts (overdue / due in 7 days), this month's profit so far, books-balance ✓/✗ |
| Stock | Lots by model: remaining qty, unit cost, value at cost; avg cost per model (D-063) |
| Customer | Statement with running balance, bills, payments, returns; "above target" (Milon) |
| Supplier | Purchases, payments, amount owed |
| Card | Owner, credit limit + approximate available amount, business charges and credits, balance, each statement (statement date, due date, amount, paid, remaining), EMI plans, status |
| Person | Capital in/out, current capital, cards supplied (with balances), profit allocated / paid / reinvested / owed |
| Month | Profit breakdown, investor allocations, partner split, close status |
| Journal | Every entry with filters, edit / delete / reverse, and change history |
| Books balance | What we have (→ Business assets), what we owe (→ Net worth), whose it is, ✓/✗ (D-064) |
| Charts | Profit, sales & margin, expenses; business value, cash, card debt, profit shares; customers owe (and each customer's due trend), given vs collected, top customers; stock age, top models (D-064) |

### 4.4 Month close
- **Profit for month M** = sale profit (sale date in M) − returned profit − customer discounts +
  customer profit share (for M) + cashback − expenses − card fees (including cash-out fees)
  + purchase-return differences (refund − cost; negative for a write-off).
  - Each item counts in its **for month**, or in its date's month if no for month is set.
  - A for month can't be later than the entry's own month (no booking ahead).
- **Sale profit counts in the month of sale** (v1 decision). The PRD's "share only when the bill is
  fully paid" rule (R30–R32, R36–R37) moves to v2. It needs no new data, because v1 already stores
  bills, lines and dated payments.
- **Closing month M:**
  - The close button can be used on any day (normally the 1st–5th of M+1).
  - Months close in order.
  - The partners enter the investor allocations (basis × rate, editable; cash and card parts kept
    separately). The remainder is split by the partners' profit share % (50/50 today).
    - The cash basis defaults to the investor's capital at month end.
    - The card basis and the rates default to last month's values for that investor (blank the
      first time). The partners confirm or change them each month (PRD R39–R43).
  - Milon's profit share for M arrives on the 1st–5th of M+1 and is booked **for M**, so enter it
    before closing M. The close screen shows a reminder (it doesn't block) for any customer who
    had a profit share last month but none for M. If the Milon deal ends, just stop entering
    shares and clear his target.
  - **Either partner** can close a month. The close is logged with who did it.
  - **A loss is split the same way** (the partners' shares go negative).
  - The investor and partner allocations are saved as records, so a closed month's numbers never
    change later.
- **After close:** entries dated in M (or for M) are **locked**. Only the latest closed month can be
  re-opened, and the re-open is logged. If profit was already paid or reinvested after the close,
  the re-open shows a warning listing those entries.

### 4.5 Corrections
- **In an open month:** any entry can be **edited or deleted**. Every change is logged (who, when,
  before/after).
- **Any time:** **Reverse** creates a linked cancelling entry. The partners choose which way to fix
  a mistake.
  - The reversal always lands in an open month: in the original's month if that month is still
    open, otherwise today.
  - A sale with returns, or a purchase with sales or returns, can't be reversed until those are
    reversed first.
  - A reversal itself can't be reversed. If it was a mistake, delete it (open month) or enter the
    original again.
  - A reversed entry and its reversal can't be edited: delete the reversal first (D-026).
- **Closed months:** read-only. Fixes go in as reversals in an open month, or as an **opening
  correction** (see §4.6).
- **Duplicates:** both partners enter data. If a similar entry exists (same type, same
  customer/supplier/card/person, same amount, same date), the app warns "A similar entry exists —
  save anyway?". It never blocks.

### 4.6 Opening balances & cutover
- Go live as soon as v1 is ready. The **opening date is the 1st of the go-live month**, using
  balances as of the previous month-end. The running month is then backfilled.
- **Opening items:** cash, unsold stock lots, customer dues, supplier dues, card balances per
  statement (+ running EMI plans), each person's capital and profit owed.
- **Loading:** a pre-filled Excel template, built from the workbooks and corrected by the partners,
  is loaded by a one-time import (done once, in the reference).
- **Partner capital** is taken from each partner's own summary (Sheet6), updated to the cutover
  date. Investments held under Arif's name for other people are investors (see §3).
- **The month before go-live is closed in Excel first** (investor allocations and partner split
  done). Its allocations are in the imported profit owed. Nothing may be dated, or be "for", a
  month before the opening date. Items that belong to that month but settle after it are folded
  into the opening balances:
  - a profit share for that month not yet received → added to that customer's opening due (enter
    the later receipt as a normal customer payment);
  - an expense for that month paid in the go-live month → treated as paid on the last day:
    subtract it from opening cash, and don't enter it in the app.
- **If the books don't balance after import:** the difference (the workbook is currently off by
  ৳12,400) is investigated, or booked as a visible **Opening difference** split between the
  partners by profit share %. It stays visible until it is resolved.
- **Opening corrections:** a wrong or missed opening item found later (e.g. a forgotten customer
  due or stock lot) is fixed with an **opening correction** dated in an open month. It changes
  that item, and the other side goes to the Opening difference. Profit is not affected. The
  Opening difference is resolved when its net total is 0.

### 4.7 Export
- **Download everything as `.xlsx`.** This is both the backup (the Supabase free tier has no
  backups) and a way to keep sharing numbers in Excel.

### 4.8 Sharing, reports and settings (v1.1, D-034)
- **Business profile:** the shop's name, contacts, logo, licence/TIN/BIN, terms and message
  templates, shown in the app and on everything shared.
- **Contacts:** phone, WhatsApp and email on people, customers and suppliers.
- **WhatsApp messages** to customers after a sale, payment in, return, discount or profit share, a
  due reminder, and copyable texts for statements, month summaries, investor reports and the day
  book. Each opens in an editable preview first.
- **PDFs** (shared through the phone's share sheet): the due statement for a date range, the sale
  invoice (`INV-0001`) and the money receipt (`MR-0001`). Customer documents never show cost or
  profit.
- **Reports:** a Cash book (day book, with a cash count check), a Sales report, statements for a
  date range, per-account reports (card, investor, partner, customer, supplier) and a monthly
  partner pack, as PDF, Excel or WhatsApp text. **Charts** of the same figures over time, on
  screen only (D-064).
- **Saved details:** bank accounts of the business and of anyone in the app, to copy and share;
  card details (encrypted, revealed with a fingerprint; a card can hold its primary and
  supplementary numbers, D-054).
- **Look:** Light, Dark and Night Owl themes per user; every sheet closes on the phone's Back.
- None of this changes a posting rule or a calculation (§1): every figure is read from the books.

### 4.9 AI assistant (separate track, D-057)
- Spec: `docs/AI.md`; tasks: `docs/TASKS-AI.md`. Read-only: it explains the books and drafts
  entries for a partner to save, and never posts or works out a figure itself.

## 5. Out of scope for v1 (v2 candidates)
- Profit released only when a bill is fully paid, with payments applied to the oldest bill first.
  The data is already stored, but v2 must decide:
  - a **switch date** (bills before it keep month-of-sale profit, so nothing counts twice);
  - how non-bill debits are treated (opening dues, cash given, profit share added to due);
  - Milon: his balance stays ~৳50L, so his newest ~৳50L of bills would always be unpaid and their
    profit deferred indefinitely.
- Separate bank / bKash / cash accounts.
- Investor and employee logins.
- "Paid personally by a partner/investor": business costs are always paid from business cash or a
  card.
- Stock adjustment / write-off.
  - Workaround for a damaged or lost unit: a *purchase return with refund 0* and reason
    **Damaged / lost**. It reduces stock at cost and reduces profit by the same amount.
- Returns of phones sold before go-live (there is no bill or lot in the app).
  - Workaround: record a *purchase against the customer's due* at the refund price. If the phone
    then goes back to the supplier at cost, that purchase return reverses the old profit.
- Bangla UI (v1 is English only).
- Per-unit IMEI tracking (v1 keeps an optional IMEI/note text on each lot).
- Advance selling (selling stock not yet purchased).
- Bad-debt write-off.
- Multi-currency.

## 6. Key stories (acceptance examples)

| # | Scenario | Expected |
|---|---|---|
| S1 | Purchase 10 × Vivo Y05 at 17,700 on supplier credit; pay 100,000 now | Stock +177,000; supplier owed 77,000 |
| S2 | Sell 3 of them to Milon at 18,000 | Milon due +54,000; stock −53,100; profit +900 in the sale month |
| S3 | Milon returns 1 unit | Milon due −18,000; stock +17,700; profit −300 in the return month |
| S4 | Card purchase 20,000; cashback 1,000 a month later (PRD Story 6) | Card balance 19,000; profit +1,000 in the cashback month; cash unchanged |
| S5 | Cash-out: 100,000 charged, 98,500 received (POS) | Card +100,000; cash +98,500; expense 1,500 |
| S6 | Early card payment before the statement, then a new purchase (Story 5). EBL Visa (statement 5th, due 20th): 10 Sep card purchase 40,000; 25 Sep card payment 40,000; 28 Sep card purchase 25,000 | As of 30 Sep: card balance 25,000; Oct bill 65,000, paid 40,000, remaining 25,000; next due 20 Oct · 25,000; cash −40,000 (the payment only); stock +65,000 |
| S7 | EMI purchase 60,000 over 6 months | Card balance +60,000; 6 statements, starting with the purchase's own, bill 10,000 each |
| S8 | Month profit 100,000; investor allocations 20,000 (Story 13) | Each partner is allocated 40,000 |
| S9 | Month loss −10,000; investor allocations 2,000 | Each partner −6,000 |
| S10 | Partner reinvests 30,000 of profit owed (Story 14) | Profit owed −30,000; capital +30,000; cash unchanged |
| S11 | Milon profit share 284,675 for October, paid 3 Nov in cash | October profit +284,675; cash +284,675 on 3 Nov; due unchanged |
| S12 | Same, but added to his due | October profit +284,675; Milon due +284,675 |
| S13 | Customer owes 1,00,000 and pays 99,950; 50 recorded as a discount | Due 0; profit −50 in that month |
| S14 | Lot A (Vivo Y05, 2 left at 16,860) and newer lot B (10 left at 17,010); sell 3 | Auto-picks 2 from A + 1 from B; cost 50,730 |
| S15 | Buy 2 phones at 15,000 from Selim against his due of 1,00,000 | Stock +30,000; Selim due 70,000; cash unchanged |
| S16 | Any of these stories (S1–S18) | Books-balance check stays ✓ |
| S17 | October is closed; in November a missed opening due of 20,000 for Selim is found → opening correction | Selim due +20,000; Opening difference +20,000 (10,000 per partner); no month's profit changes |
| S18 | An October expense of 5,000 (for October) is reversed on 3 Nov after October is closed | November profit +5,000; October's closed numbers unchanged |

## 7. Data-quality issues found in the current workbooks (to fix at cutover)

**The main business workbook (figures here are fictional):**
- **Books off by ৳12,400:** assets 14,250,000 − outside money 7,500,000 = 6,750,000, but the
  partner summaries total 6,762,400.
- **Stock sheet:**
  - Honor X5c line: 1 × 14,500 but total 14,000.
  - Oppo A6c 17,500 sits below the SUM row, so it is not counted.
  - Honor X7d line has no unit price.
- **Model names:** the same model is spelled several ways (e.g. "Honor x5c " / "honor x5c " /
  "Honor X5C "; "Realme 100i" vs "Realme C100i").
- **IMEIs:** stored as numbers; one is truncated (`351234567`).
- **Milon sheet:**
  - A return is dated 27 *June* among September rows.
  - A subtotal row is labelled "Payment".
  - Rows are out of date order.
  - The final due is shown as both 7,840,000 and 7,540,000.
  - The "Total cash" sheet shows Milon as 7,240,000 (an older snapshot).

## 8. Success criteria
- The partners stop using Excel for daily entry within ~2 weeks of starting the build.
- The books-balance check is ✓ after opening and after every entry.
- The card due amounts and dates match the bank statements (and Nadim's workbook for his cards).
- A month can be closed, and its allocations paid or reinvested, entirely in the app.
