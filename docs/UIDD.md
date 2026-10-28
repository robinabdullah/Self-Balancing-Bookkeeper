# Self-Balancing Bookkeeper — UI Description (v1)

*UI/UX description · 7 October 2026 · v1.1* — implements `docs/PRD.md`; the technical rules are in
`docs/SRS.md`.

## 1. Principles

1. **Mobile-first.** Partners enter data on a phone. The layout is single-column at ≤ 640px and
   adds a sidebar plus wider tables at ≥ 1024px. Tap targets are ≥ 44px. On a phone (360px wide
   and up):
   - **Modals, pickers and dialogs** slide up from the bottom (a modal form can fill the screen),
     so the keyboard never hides them.
   - **Forms** have a sticky footer (total + **Save**) that stays above the keyboard.
   - **Tables** show as stacked cards: 2–3 key fields plus a status badge; tap for the detail.
     Full tables appear only at ≥ 1024px.
   - **No hover-only info.** Explanations use an ⓘ that toggles a short inline note.
   - No horizontal page scroll.
   - **Back closes the top sheet** (D-035): with a sheet, picker or dialog open, the phone's Back
     closes it and stays on the page. A link inside a sheet replaces it in history, so Back from
     the new page returns to the page the sheet was on.
2. **Pick, don't type.** Every person, card, customer, supplier, model and lot comes from a
   searchable picker (combobox). Pickers have an inline **"+ Add new"** that opens a short form
   (a bottom sheet on mobile) and returns the new item already selected. On a phone a picker opens
   with its list visible; the keyboard comes up only when Search is tapped. On a computer Search
   has the cursor at once (D-053).
3. **The server is the calculator.** The UI shows what the server computes. Forms may show a
   *preview* (e.g. a line total), but saved numbers always come from the server.
4. **Mistakes are visible and fixable.** After saving, a toast offers **Undo**, which deletes the
   new entry (it is always in an open month), or both entries for a sale saved with "Received
   now". The books-balance chip is always visible.
5. **Plain language.** Labels in English for v1 (Bangla later), e.g. "Milon owes ৳75,12,345" rather
   than accounting jargon.

## 2. Formatting

- **Money:** `৳` + Indian grouping, e.g. **৳75,12,345**. Decimals show only when non-zero
  (৳17,444.80). Negative amounts are red with a minus sign.
  - **Due/credit wording:** "owes" / "we owe" / "credit".
  - **Chart axes only** (D-064): short amounts, `৳1.2 Cr` · `৳4.6 L` · `৳45K` · `৳850`. Every
    headline, readout and table keeps the full format.
- **Money input:** opens the numeric keypad (`inputmode="decimal"`).
- **Dates:** `06 Oct 2026` in lists. Inputs are typed as **`dd/mm/yyyy`** on the numeric keypad
  (the `/` is added as you type; `5/10/2026` is fine), whatever the phone's language, and default
  to today (Dhaka). A 📅 button opens the phone's calendar. A future or impossible date shows an
  inline error (D-035).
- **Month inputs** ("For month", "Bill month") are a dropdown of the allowed months as `Oct 2026`
  (For month newest first; Bill month in calendar order). Months that are closed show greyed
  "(closed)" and can't be picked (D-035).
  - Bill month: Auto, then the month before the purchase to 4 months after it. Picking the month
    before shows an amber note: "Earlier than the purchase month: only if the bank put this charge
    on last month's bill."
  - Native controls (date pickers, dropdown lists, checkboxes) follow the theme: light in Light,
    dark in Dark and Night Owl (`color-scheme`; D-032, D-037).
- **Months:** `Oct 2026`.
- **Quantities:** integers (numeric keypad, `inputmode="numeric"`); stock shows as "12 left of 50".

## 3. Layout & navigation

- **Top bar:**
  - the business logo (on a small white rounded tile) and short name, else its name; "Mobile
    Business Lite" only while neither is set (D-039);
  - **books-balance chip** (✓ Balanced / ✗ Off by ৳X → opens the **Books balance** sheet, D-064):
    - a highlighted **Net worth** with a ✓ Balanced (or ✗ Off by ৳X) badge on top;
    - **What we have:** Cash · Stock at cost · Customers owe → **Business assets**;
    - **What we owe:** Card balances · We owe suppliers (shown negative) → **Total we owe** →
      **Net worth**;
    - **Whose it is:** Capital · Opening difference · Profit owed · Undistributed profit →
      **Total**;
    - footer: "✓ Net worth matches "Whose it is": every taka is accounted for.", or in red "✗ Off
      by ৳X: net worth is ৳X more/less than "Whose it is". This is a data error, so tell the
      developer.";
  - next month to close (e.g. "Closing: Oct 2026");
  - user menu (sign out).
  - **On mobile** the top bar shows only the app name and the balance chip (icon + short text).
    "Closing: …" and sign-out move to **More**.
- **Bottom tab bar (mobile):** **Home · New · Stock · Accounts · More**. The desktop sidebar has
  no More (D-062; below).
  - **New** opens an action sheet, ordered by how often each is used: Sale, Payment in, Purchase,
    Card payment, Expense, Cash-out, Return, More… (supplier payment, profit share, customer
    discount, cash given to customer, card fee, cashback, capital in/out, profit
    paid/reinvested, opening correction).
  - Tapping a type opens its form with the type already set; the user never picks it twice.
  - **Accounts** has tabs: Customers · Suppliers · Cards · People.
  - **More:** Months, Journal, Reports, Saved details, Setup, Settings, "Closing: …" (opens that
    month's close screen), Sign out (D-037, D-039). Export lives in Reports as "Backup all data"
    (D-043).
  - **AI assistant** (D-057, spec in `docs/AI.md` §10): **More → Ask**, **Settings → AI**, and
    "Explain…" items inside existing ⋯ / Report sheets. Home gets nothing new.
  - On a phone, More stays highlighted on its screens and on `/export` (D-032, D-043).
  - **Desktop sidebar:** Home · New · Stock · Accounts · Months · Journal · Reports · Saved
    details · Setup · Settings, each with an icon. There is no More: its screens are listed
    directly, and "Closing: …" and Sign out are in the top bar. The current page's link is
    highlighted (D-062).
- **Entry details open in place** (D-032): a row that opens an entry (Home, Journal, card,
  customer, supplier, person) shows the entry sheet (§4.10) over the current page
  (`?entry=<id>`). Closing it (✕, a tap outside, Esc or Back) stays on that page.
- **Return path:** a form opened from a page (a quick action, or Edit in an entry sheet) goes
  back to that page after Save or Cancel. Otherwise new entries go to Home.
- **Modals on desktop** are centred; on a phone they slide up from the bottom (§1).

### Forms (create & edit)
Create and Edit use the same form.

- **Modal or page:**
  - A form with fewer than 10 fields opens as a **modal** over the current screen: every money
    entry (§4.6), Return (§4.5), Setup add/edit (§4.11), "+ Add new" from a picker, and editing a
    card bill's dates.
  - **Purchase** and **Sale** have repeatable lines, so they open as a **full page**.
- **ⓘ field help:** only non-obvious fields get an ⓘ. Tapping it shows one or two plain sentences
  under the field. Obvious fields (date, qty, amount, note, names) get none. Fields with an ⓘ:
  - Purchase: Paid by, EMI, Bill month, Unit cost.
  - Sale: Choose lot, Received now.
  - Return: Refund per unit, Refund goes to, Damaged / lost.
  - Money entries: Charged to card / Cash received, For month, Received now / Add to his due,
    Opening correction "what was wrong" and its change, Capital out: Paid by (D-060).
  - Setup: Statement day, Due day, Credit limit, Target balance, Profit share %.
- **Notes box** (just above **Save**). It has two parts:
  - **About this form:** a fixed sentence or two saying what the form is for (table below).
    - It has a ▾ button to collapse or expand it on the spot.
    - A setting in **Settings** → **Form help: Expanded · Collapsed · Off** sets how it starts on
      every form (default Expanded; D-037). "Off" hides it. The choice is saved in the browser, per device.
    - All About and ⓘ texts live in one file in the code (`src/lib/help-text.ts`), copied from this
      document. When a form or rule changes, its text changes in the same commit. A test fails if a
      form has no About text.
  - **What this will do:** updates as the user types. One row for each balance that changes,
    following SRS §5. On Edit it describes the entry as it will be after saving. It is a preview
    only; the server does the real calculation. It is built from the same posting-rule code as
    the books (not separate preview code), so it can't drift. It is always shown.
    - **Rows** (D-061; the same rows as the confirms in §5 and the Journal in §4.10): label left,
      signed amount right, and a muted sub-line under the label for a card charge's bill month
      ("Nov 2026 bill"; an EMI "5 bills from Nov 2026") and the profit's month.
    - One row per account: a sale with Received now shows the customer once, netted. Cash and
      Profit, when untouched, share one "no change" row ("Cash and profit", "Cash", "Profit").

```
┌ Card payment ────────────────────── ✕ ┐
│ Date      07/10/2026                  │
│ Card      Arif · City Visa       ▾   │
│ Amount    33,720                      │
│ Note      ____________________        │
│                                       │
│ ┌ About this form ──────────────────┐ │
│ │ Business cash paid into a card    │ │
│ │ bill.                             │ │
│ ├ What this will do ────────────────┤ │
│ │ Cash                   -৳33,720   │ │
│ │ Arif · City Visa      -৳33,720   │ │
│ │ Profit                 no change  │ │
│ └───────────────────────────────────┘ │
│                  [ Cancel ]  [ Save ] │
└───────────────────────────────────────┘
```

| Form | About this form |
|---|---|
| Sale | A bill for phones sold to a customer. Cost comes from the oldest stock first; the profit counts in this month. |
| Purchase | Phones bought for stock. Each line becomes a stock lot at its unit cost. |
| Customer return | Phones a customer gives back from one of their bills. |
| Purchase return | Phones sent back to the seller, or written off as damaged / lost. |
| Payment in | Money a customer paid us. It lowers what they owe. |
| Cash given to customer | Cash we gave a customer (e.g. for a deal). It raises what they owe; no profit. |
| Customer discount | Writes off a small leftover that a customer owes. It lowers this month's profit. |
| Profit share | A customer's share of their shop profit for a month. Received in cash, or added to their due. |
| Supplier payment | Money we paid a supplier we owe, from cash or a card. |
| Card payment | Business cash paid into a card bill. |
| Card cash-out | Cash taken out through a card. The difference is a fee (business expense). |
| Card fee | A fee or interest charged on a card. It is a business expense. |
| Cashback | Cashback received on a card or in cash. It counts as profit. |
| Expense | A business cost (salary, rent, delivery …) for a month. |
| Capital in / out | Money a person puts into, or takes out of, the business. Out can be paid by a card: the person's own spending that the business pays with the card's bill. |
| Profit paid / reinvested | Profit owed to a person, paid in cash or kept in the business as capital. |
| Opening correction | Fixes an opening balance entered wrongly at go-live. |
| Setup: Person | A partner or investor in the business. Partners also have a profit share %; the partners' shares must total 100. |
| Setup: Card | A card used for business purchases, named by its bank ("EBL") with its Type (Visa, Mastercard, Amex). Statement and due days set the bill dates. |
| Setup: Customer | A mobile shop we sell to, shown as "Shop name (Proprietor)". Contact details and target balance are optional. |
| Setup: Supplier | A seller we buy phones from. We owe them when we buy on supplier credit. |
| Setup: Model | A phone model with one clean name (e.g. "Vivo Y05 4/64"). Purchases and sales pick from this list. |
| Card bill dates | The real statement or due date for one month, when the bank moved it. Other months keep the card's usual days. |
| Card details | The card's number, expiry and CVV, saved encrypted: its primary card or a supplementary card on the same bill. They show only after your fingerprint, for 30 seconds. |
| Fingerprint unlock | Lets this device reveal saved card details with your fingerprint. Your login password is checked first. |

| Field (Setup) | ⓘ text (D-023) |
|---|---|
| Statement day | The day each month the bank makes this card's bill. A charge on or before it goes on that bill. |
| Due day | The day the bill must be paid: the first such day after the statement date. |
| Credit limit | Optional. Used only to show roughly how much is still available on the card. |
| Target balance | Optional. The due we want this shop to stay within (e.g. ৳60L). Their page shows how far above it they are. |
| Profit share % | This partner's share of the profit left after investors are paid. The partners' shares must total 100 before a month can be closed. |

| Field (entry forms) | ⓘ text (D-024) |
|---|---|
| Purchase: Paid by | How the phones were paid for. Cash leaves the cash box; Card adds to that card's bill; Supplier credit means we owe the supplier; Customer's due lowers what that customer owes us. |
| Purchase: EMI | The bank splits this card purchase into equal monthly parts (2 or more). The full amount counts at once; each month's bill gets one part. |
| Purchase: Bill month | Optional. The card bill this charge goes on, when the bank put it on a different bill than its date suggests. |
| Purchase: Unit cost | The cost of one phone, not the line total. The stock lot keeps this cost to work out profit. |
| Capital out: Paid by | Cash leaves the cash box. Card: the person's own spending on a card that the business pays with its bill; it adds to that card's bill and comes off their capital. |
| Sale: Choose lot | The app takes the oldest stock first. Pick one lot only when you know which phones were sold. |
| Sale: Received now | Optional. Cash the customer paid with this bill. It is saved as a separate payment on the same date. |
| Return: Refund per unit | What is given back for each phone. A customer return starts at the sale price, a purchase return at the lot's cost; Damaged / lost is always 0. |
| Return: Refund goes to | Where the refund comes back: cash, the card, less owed to the supplier, or the customer's due. It starts as the way the lot was paid for; an opening lot has none, so pick one. |
| Return: Damaged / lost | Phones that can't be sold or sent back. Stock goes down by their cost, and that cost is a loss this month; no refund. |
| Card cash-out: Charged to card / Cash received | Charged to card is the full amount on the card bill; Cash received is what came into hand. The difference is a fee (business expense). |
| Expense, Profit share: For month | The month this belongs to; it can be before the date (e.g. September salary paid on 5 Oct). Its profit counts in that month. |
| Profit share: Received now / Add to his due | Received now: the customer paid the share in cash. Add to his due: it is added to what they owe us. |
| Opening correction: what was wrong | The opening balance that was entered wrongly at go-live, and whose it is (customer, supplier, card or person). |
| Opening correction: change | How much to add (+) or take off (−). The partners' opening difference changes to keep the books balanced. |

## 4. Screens

### 4.1 Login
Email + password. There is no sign-up link; partner accounts are created by an admin. Partners
stay signed in on their phone until they sign out, so they don't log in for every entry. The page
shows the business logo and name (D-039).

### 4.2 Home (dashboard)
**Cards (2-column grid on mobile):**
- Cash. If running cash went below 0 on any date, it turns red with "Cash went negative on
  12 Oct 2026 — an entry is probably missing" (the first such date).
- Stock (units · value at cost).
- Customers owe.
- We owe suppliers.
- Card dues: overdue (red) · due in 7 days (amber).
- This month's profit so far.

**Lists:**
- Each tile opens its page: Cash → Cash book (§4.17, D-043), Stock → Stock, Customers owe →
  Charts · Customers tab, We owe suppliers → Suppliers, Card dues → Cards, Profit → Charts ·
  Profit tab (§4.17; D-032, D-064).
- **Card alerts:** one row per card for its earliest unpaid bill (bank badge, card, owner, amount,
  days left). Overdue bills come first, then the rest by due date; the first 5 are shown. A row
  opens that card (D-032).
- **Top customer dues**, with "above target" for Milon.
- **Recent entries:** the last 10, tap to open.

### 4.3 Purchase form
- **Header:** date, supplier (optional picker), **paid by** (segmented control: Cash · Card ·
  Supplier credit · Customer's due).
  - If Customer's due is chosen, a customer picker appears and shows the current due.
  - If Card is chosen, a card picker appears, plus an optional **Bill month** override and an
    **EMI** toggle → number of months.
    - With EMI on, a preview line shows "5 × ৳4,347.33 · first in Nov 2026 bill" (D-032). It uses
      the same bill-month rule as the engine (SRS §6).
- **Lines** (repeatable): model picker, qty, unit cost (always per phone), optional IMEI/note.
  - Each line is a compact card with a remove (✕) button; **+ Add line** sits below the last one.
  - Hint under the lines: "Invoice total doesn't divide evenly? Use two lines, e.g. 2 @ x + 1 @ y."
- Supplier is required when Supplier credit is chosen.
- After the lines: note, then the notes box.
- **Footer** (sticky): total (preview) and **Save**.
- **Supplier-credit tip:** "Paid something now? Add a supplier payment after saving" (button).

### 4.4 Sale bill form
- **Header:**
  - date;
  - customer picker, which shows the current balance under the name and defaults to the last
    customer used;
  - a **Walk-in** option for one-off retail.
- **Lines:**
  - **Model picker**, showing "Vivo Y05 4/64 · 37 in stock", then qty (capped at the stock) and
    unit price.
  - The app fills each line from the **oldest lot first** (only lots bought on or before the sale
    date) and shows it under the line, e.g.
    "2 from lot 01 Oct @16,860 + 1 from lot 05 Oct @17,010".
  - A **"Choose lot"** link lets the user override it with one specific lot.
  - A line preview shows the line total and profit (green, or red if a loss).
  - Lines are compact cards with ✕ and **+ Add line**, as in the Purchase form.
- After the lines: note, an optional **"Received now"** amount (it creates a customer payment
  with the same date, in the same save), then the notes box.
  - **Undo** on the save toast removes both the bill and that payment. In the Journal they are
    two separate entries.
- **Footer** (sticky): bill total, bill profit, **Save**.

### 4.5 Return form
- A segmented control: **Customer return** / **Purchase return**.
  - **Customer:** pick the customer → pick the bill → pick a line → qty (≤ sold − returned) → the
    refund price per unit (defaults to the sale price).
  - **Purchase:** reason chips (**Returned to seller** · **Damaged / lost**) → pick the lot → qty
    (≤ remaining) → refund per unit (defaults to the lot's unit cost; Damaged / lost sets it to 0)
    → refund goes to (defaults to the original source; required, with no default, for opening and
    opening-correction lots).
- The notes box shows the stock change, the refund and the profit effect.

### 4.6 Money entry form (one form for all single-amount types)
- **Type** is set by the New sheet and shown as the form title. A type picker appears only when
  the form is opened without a type. The fields change with the type, as in SRS §4 Money.
  - **Card cash-out:** "Charged to card" + "Cash received", with a live "Fee (business expense):
    ৳X · Y% of ৳charged" (D-056).
    - Between them, an optional **Fee %** with the hint "Type the agent's fee % and Cash
      received fills in." A % fills Cash received with charged − the % (exact to the paisa).
    - Cash received can still be typed over; typing in it clears Fee %.
    - Fee % is not saved, so on edit it starts empty.
  - **Profit share:** customer, for month (defaults to the previous month), and **Received now /
    Add to his due**.
  - **Customer discount:** customer (shows the current due), amount, reason. Typical use: a payment
    leaves a small leftover, which the user writes off from New → More… → Customer discount.
  - **Expense:** category chips (Salary · Delivery · POS/QR · Rent · Internet · Other), paid by
    Cash / Card, for month (defaults to the month of the date). Card fees and interest use the
    separate **Card fee** type.
  - **Capital in/out, profit paid/reinvested:** person picker. Profit paid/reinvested shows the
    current **profit owed** and warns if the amount exceeds it.
    - **Capital out** also has **Paid by: Cash / Card** (default Cash) and, for Card, the card
      picker, as on Expense (D-060). Capital in has neither.
    - Saving a Capital out paid by Card (add or edit) first opens the **"{person}'s personal
      spend"** confirm (§5).
    - Saving a Profit paid / reinvested above the profit owed first opens its confirm (§5,
      D-061). At or below it, there's no confirm.
  - **Card cash-out** and **Opening correction** always confirm on Save (add or edit, §5, D-061).
  - **Opening correction:** pick what was wrong at opening (cash, customer due, supplier due, card
    balance, capital, profit owed) and its target, then the signed change. The notes box shows the
    matching Opening difference change per partner. A missed stock lot is added from the Purchase
    form with "Paid by: Opening correction" (under "Advanced").

### 4.7 Stock
- A list grouped by model: total units left and value at cost. Expanding a model shows its lots
  (date, source, unit cost, qty in · sold · returned · to seller · left; D-027). **Returned** =
  back from customers (+); **To seller** = purchase returns, incl. Damaged / lost (−). A reversed
  purchase's lots are not shown.
- Filter: in stock only (default) or all. Search by model, or by IMEI/note.
- **Avg cost per model** (D-063), over the lots shown, rounded half-up to whole taka (`avgUnit`):
  - **In stock:** the avg cost of the units left (value ÷ units).
  - **All lots:** the avg cost of everything bought, Σ(unit cost × qty) ÷ Σ qty, sold or not; the
    row also shows the bought count.
  - No avg when there is nothing to average (left ≤ 0): the phone line drops "· avg …"; desktop
    shows "—".
  - **Phone:** the model name with a muted line under it, "12 units · avg ৳15,700" (In stock) or
    "12 left of 40 · avg ৳15,450" (All lots); the value on the right.
  - **Desktop (≥ 1024px):** aligned columns under a header row: Model · Left ("12", or "12 of 40")
    · Avg cost · Value.

### 4.8 Accounts
- **Customers:** list ("Shop name (Proprietor)", owes, last activity; search by shop name,
  proprietor name or phone) → detail:
  - contact block: phone (tap to call), email, address;
  - header with the balance and, if a target is set, "**Above target: ৳X**" (green when ≤ 0);
  - a **statement** table: date, entry, debit, credit, running balance (on mobile: one row per
    entry with date + entry on the left, the signed amount and running balance on the right);
  - a Bills tab with each bill's lines and profit.
- **Suppliers:** list → detail statement.
- **Cards:** a summary table that mirrors Nadim's Summary, **grouped by owner** (D-056):

  | Card | Stmt day | Due day | Balance | Available ≈ | Next due | Amount | Overdue | Status |
  |---|---|---|---|---|---|---|---|---|

  - **Search owner or card** above the list matches the owner, the card name and the Type, in
    any case (never card numbers). Nothing found: "No card matches this search."
  - Each owner opens with a heading row, in Setup's order: "Arif · 6 cards" (under a search,
    "Arif · 1 of 6 cards") and the Balance of the cards shown, added up (a card in credit
    reduces it; below 0 it reads "Credit ৳X").

  "Available ≈" = credit limit − business balance. It is blank if no limit is set. An ⓘ next to
  it shows "approximate — excludes personal spending not entered as Personal spend" (D-060).

  Status is a coloured badge. **On mobile** each owner heading reads "Arif · 6 cards" with
  "Balance ৳X" on the right. Each card under it is a stacked card: card name (no owner; D-056),
  next due date and amount, status badge; tap for the full row and the detail.

  Every card shows a **bank badge**: the bank's short name (EBL, SCB, City, BRAC …) in its logo's
  colours, read from the card name (D-032, D-033). The badge doesn't repeat the Type: the text
  beside it says it (D-053). Card text everywhere reads "Owner · Name Type" ("Arif · EBL Visa");
  the Cards list, grouped under owner headings, shows "Name Type" ("EBL Visa"; D-056).
  - The current banks:
    - EBL: yellow;
    - Southeast: blue | magenta;
    - MTB: a pink → green gradient;
    - Prime: red | green | blue;
    - City and UCB: red;
    - BRAC: blue;
    - SCB: blue with green;
    - Meghna (MBL): purple; Bank Asia: blue; LankaBangla: green with orange (D-035).
  - In the table, a click anywhere on a row opens the card. A negative balance reads
    "Credit ৳X".

  The card detail shows:
  - **Facts:** "Statement 5th · Due 20th", credit limit, available, next due, overdue, unbilled,
    remaining EMI.
  - **Statements** list: bill month, statement date (actual/est.), due date (actual/est.), amount,
    paid, remaining.
    - By default it shows the unpaid bills whose statement is out, plus the next bill. "Show all N
      bills" reveals the paid bills and the future EMI bills.
    - Tapping a bill (✎ Set dates) edits its actual dates.
    - The oldest unpaid bill has **Pay ৳remaining**: Card payment with the card and amount filled
      in. The amount stays editable for split payments. Only the oldest bill gets it, because a
      payment always pays the oldest bill first (SRS §6.5).
  - Charges and credits list. An EMI charge reads "EMI 5 × ৳4,347.33 · from Nov 2026".
    - A reversed entry and its reversal (D-058) stay in the list, **greyed** and on no bill: the
      original keeps its name and "Credit" / "Charge" with a **Reversed** tag; the reversal reads
      "Reversal of {entry}" · "Cancels the original". Each still opens its entry sheet.
  - **EMI plans:** item, total, n months, billed so far, remaining. A reversed EMI purchase's plan
    is not listed (D-058).
- **Quick actions** (every detail page, D-032, D-038): **2 main buttons + ⋯ More**. Each opens the
  form with this row already picked and returns here after Save or Cancel. ⋯ More opens one sheet
  (bottom on a phone, centred on desktop) grouped as **New entry · Reports & share · Manage**; an
  empty group is left out, and Back closes it.
  - Card: Pay card · Cash-out; ⋯ Card fee · Purchase · Personal spend | See in Journal | Edit ·
    Card details. **Personal spend** (D-060) opens Capital out with this card and Paid by Card
    picked; only the person and amount are left.
  - Customer: Payment in · Sale; ⋯ Profit share · Discount | See in Journal | Edit · Bank
    accounts.
  - Supplier: Supplier payment · Purchase; ⋯ See in Journal | Edit · Bank accounts.
  - Person: Capital in / out · Profit paid / reinvested; ⋯ Investor report · Statement · See in
    Journal | Edit · Bank accounts (Investor report opens `/reports/investor?person=`, D-045).
  - **Bank accounts** (D-039) opens a sheet over the page (`?bank=1`) with that owner's saved
    accounts and Add (§4.14).
  - **Card details** (D-046) opens a sheet over the card's page (`?secret=1`) with that card's
    saved numbers (the primary and any supplementary ones, D-054), masked, and **Add card
    details** (§4.14).
  - The built-in Walk-in: Sale; ⋯ See in Journal (no due, no Setup edit; D-009, D-023).
  - **Reports & share** (D-040) also has **Statement** on customers, suppliers, cards and people
    (not Walk-in), and **Remind on WhatsApp** on a customer who owes (§4.15). A customer (not
    Walk-in) also has **Due trend** (§4.17 Charts, D-064).
  - Inactive rows have no main buttons, only ⋯ (See in Journal | Edit, and Bank accounts where
    the kind has them). Edit opens that row in Setup.
- **Statement for a period** (D-040): ⋯ → Statement opens the **Report sheet** (`?report=1`):
  Period chips (This month · Last month · a month ▾ · Custom From/To, dd/mm/yyyy) and **View on
  screen** · **WhatsApp message** · on customers and suppliers **Share PDF** (§4.16, D-041). On a
  customer, when the business has saved accounts, an **Add How to pay** switch (off) sits under
  Share PDF; on, the accounts appear as chips (the only one picked for you) and go into the PDF.
  View sets `?from=&to=`: a chip "1 Oct – 31 Oct 2026 ✕" (✕
  clears it) and the statement reads oldest first: **Opening balance**, the entries in the range
  with their running balance, the period **Totals**, **Closing balance**. The card page shows it in
  place of Charges & credits; the person page uses it for the capital history and profit moves.
  On every statement (customer, supplier, card, person) a reversal's line reads "Reversal of
  {entry}" (as the Cash book, D-043; D-058), on screen and in the PDF, Excel and text.
  A Capital out paid by card (D-060) names the other side: on the card's page and statement
  "Capital out · Sumon" (the person); on the person's page and statement "Capital out · Arif ·
  City Amex" (the card). The Journal reads "Capital out · Card".
  - **Card** (D-045): with a period, Statements lists only the bills whose statement date falls in
    it, read as on the period's last day; the totals split credits into Card payments and Refunds
    & cashback. The Report sheet adds **Share PDF** (`/pdf/card`: facts, bills, charges & credits,
    the EMI schedule) and **Download Excel**.
  - **Customer / supplier** (D-045): with a period, a **By model** table (Model · Pieces · Avg
    unit price · Amount; no profit; Avg unit price per D-056, §4.17) follows the statement: a customer's sales net of returns, plus **Bought from you**
    when we bought from them; a supplier's purchases (any payment) at the price paid less the
    phones sent back at the refund amount (Damaged / lost is not sent back). It is in the PDF and
    the message too; the Report sheet adds **Download Excel** (Statement · By model).
- **Bills tab:** each bill shows its invoice number (`INV-0042`, D-042) after the date; each bill
  that isn't reversed has **Send ▸** (§4.15).
- **People:** list (name, kind, capital, profit owed) → detail:
  - capital in/out history and current capital;
  - cards supplied (with business balances);
  - profit allocated per month / paid / reinvested / **owed**.

### 4.9 Months
- **List:** month, profit, status (Open / Closed on dd Mon). Every month from the opening month to
  this month has a row (a quiet month shows ৳0) and opens its page: the next month to close → the
  close screen, a closed month → its snapshot, a later open month → its read-only view (D-044). A
  month after this month (only through a for-month) is listed with no link.
- **⤴ Share** (D-045) in the title row opens the Report sheet for the **Monthly pack** (one month:
  This month · Last month · a month ▾); its outputs open the pack (§4.17).
- **A later open month** (D-044): the month as the title, the grey note "Open · close {next month}
  first", then the profit breakdown so far (step 1 below, read-only). No allocations, partner
  split, reminder or Close. A month after this month, or before the opening month, is "not found".
- **Close screen (the next month to close):**
  1. **Profit breakdown:** sale profit, returns, profit share, cashback, expenses by category,
     fees → **Month profit**.
  2. **Investor allocations table:** one row per investor × (cash | card) with basis, rate %,
     amount (auto = basis × rate, editable), and a total. On mobile each row is a card: investor
     · cash/card, then basis × rate % = amount (editable). A row left without an amount (or with
     basis 0) is skipped and gives that investor nothing for that part (D-028).
  3. **Partners:** remainder split by profit share % → Arif 50% ৳X / Sumon 50% ৳Y (a loss shows
     in red).
  4. **Reminder** (amber, doesn't block): "Milon: no profit share for Oct 2026" for any customer
     who had a profit share last month but none for this month.
  5. **Close month** button → a confirm dialog that shows the lock warning. Afterwards, the screen
     is a read-only snapshot. The latest closed month has a **Re-open** action (with confirm; the
     dialog lists any profit paid/reinvested since the close).

### 4.10 Journal
- A chronological list of every entry. On mobile the filters open in a bottom sheet. **Filters**
  (D-032; kept in the URL, so a page can link to a filtered Journal):
  - **Type**.
  - **Who:** a searchable picker of customers, suppliers, cards and people.
  - **Period:** All time · This month · Last month · each month back to the opening · Custom
    range (From / To). A month also includes entries marked "for" that month (ⓘ).
  - **Search:** note, who, type.
  - **Clear**.
  - With exactly one type filtered, the count line shows the shown entries' total.
  - Changing a filter updates the URL in place, with no server round trip.
- **Row actions:** View · Edit · Delete (open months) · Reverse (dated in the original's month if
  it's still open, otherwise today). On mobile, tapping a row opens its detail, where these
  actions are buttons. Edit is the main button and Delete is red.
  - Reversed rows show a "Reversed by …" link.
  - A reversed entry and a reversal have no Edit (D-026); a reversal links back to its original.
  - The Reverse dialog (every entry type, D-058) adds one line under "Adds a linked entry that
    cancels this one": "Only for an entry that shouldn't count at all: a mistake, or a payment
    that bounced. A phone returned or refunded? Enter a return instead."
  - Locked rows show a 🔒 icon.
- **Numbers** (D-042): a Sale and a customer Payment in show their number after the name
  ("Sale INV-0042", "Payment in MR-0017") on the row and in the entry sheet's title; the search
  matches it.
- **Send ▸** (D-040) in the entry sheet of a Sale, Payment in, Return, Discount or Profit share
  (not reversed, not a reversal) opens the send preview on that customer's page (§4.15).
- A **reversed** Sale or Payment in has **Share PDF** in its entry sheet instead: the cancelled
  invoice / receipt (§4.16, D-042).
- **History** tab: the audit log for the entry (who, when, which fields changed old → new). Each
  change is a row: the field left, "old → new" right (D-061).
- **What it did** (D-061): the entry sheet shows the entry's rows (§3) under its lines, as saved.
  A reversed card charge reads "was on the {Mon YYYY} bill · reversed", since the pair is off its
  bill (D-058).
  - The **Delete** dialog shows the same rows, negated: what deleting takes back. Deleting a
    reversal puts its original's charge "back on the {Mon YYYY} bill".
  - The **Reverse** dialog shows the reversal's rows. They follow its Date and For month: the
    profit row's month, and a card entry's "drops out of the {Mon YYYY} bill" (D-058).

### 4.11 Setup
- CRUD lists (add/edit in a modal) for:
  - People (kind, note, e.g. "managed by Arif", phone, WhatsApp, email; partners also have a
    profit share %, which must
    total 100 before closing). A save is allowed while the active partners don't total 100; the
    list then shows "Partners total X% — must be 100 before closing";
  - Cards (name, Type chip Visa · Mastercard · Amex · None, owner, statement day, due day, credit
    limit). While the name still holds the chosen type's word ("EBL Visa" + Visa), an inline note
    says "Remove 'Visa' from the name — it's the Type" (D-036);
  - Customers (shop name, proprietor name, phone, WhatsApp, email, address, target balance;
    Walk-in is built in, shown with a "Built-in" badge, and read-only: no edit, deactivate or
    delete);
  - Suppliers (name, phone, WhatsApp, email);
  - Models.
- Customers imported at opening have only a proprietor name. The list flags "Shop name missing"
  until it is filled in.
- Contacts (phone, WhatsApp, email) are optional. Messages go to the WhatsApp number, else the
  phone (D-039).
- A row can be deactivated but not deleted once it is used. Saved bank accounts and card details
  don't count as "used": they are deleted with their owner, and the confirm says so ("Also deletes
  2 saved bank accounts"; "Also deletes the saved card details" or "Also deletes 3 saved card numbers"; D-036, D-039,
  D-046, D-054).
- `?tab=<kind>&edit=<id>` opens that row's edit modal (the detail pages' Edit, D-032).

### 4.12 Export
- Reached from Reports → **Backup all data** (D-043; the address stays `/export`).
- One button: "Download all data (.xlsx)". It shows the last export (time and who, from the audit
  log) and a note recommending a weekly download.

### 4.13 Settings
- Opened from **More → Settings** (D-037). Small sections, each saved the moment it changes (no
  Save button):
  - **Theme:** Light · Dark · Night Owl (default Night Owl). Saved to the user's account, so it
    follows them to every device on its next page load. The login page uses Night Owl. If it was
    changed on another device since Settings opened, a tap is undone with "Your theme was changed
    on another device — reload the page".
  - **Form help:** Expanded · Collapsed · Off (§3 Forms). Saved on this device.
  - **Business** (D-039): four rows, each opening a small sheet with its own Save (audited):
    - **Details:** name, short name, address, phones, WhatsApp, email, trade licence, TIN, BIN.
    - **Logo:** the current logo on a white rounded tile; Choose image (resized on the phone to
      ≤ 256 px) · Remove.
    - **Messages:** the 8 message types (Sale, Payment in, Return, Discount, Profit share, Due
      reminder, Statement, Investor report); each opens Greeting + Sign-off with the
      placeholders `{name}`, `{shop}`, `{phone}` explained. An unsaved type shows its default.
    - **PDF terms** (D-049): Invoice terms · Receipt terms · Statement terms · Footer line, each a
      multi-line box (≤ 1,000 characters; each line of the terms prints as a numbered term
      under "Terms & conditions", the footer line centered below them, D-050), blank with an
      example as the hint ("7-day replacement for a manufacturing defect, box and accessories
      intact" · "Cheque payments are subject to clearance" · "Please report any difference
      within 7 days" · "Thank you for your business").
  - **Fingerprint unlock** (D-046): the devices set up for this user (name and date added, each
    with **Remove** and a confirm) and **Set up on this device**, which asks for the login
    password, then the phone's fingerprint (Windows Hello / Touch ID on a computer). A browser
    without passkeys shows "This browser can't use fingerprint unlock" instead. Card details
    can be revealed only with a fingerprint set up here (D-052).

### 4.14 Saved details
- Opened from **More → Saved details** (D-039). Two tabs (D-046): **Bank accounts · Cards**
  (`?tab=cards`; Bank accounts by default).
- **Bank accounts:** every saved bank account, grouped by owner (the
  business first, then people, customers, suppliers), with a search (owner, bank, account name or
  number). **+ Add** asks for the owner (The business by default, or a person, customer or
  supplier from a picker), then bank, branch, account name, account number, routing number
  (9 digits) and a note.
- Each account is a card: every field with a ⧉ copy button ("Copied" toast), **Copy all**,
  **Share** (the phone's share sheet; on a computer, WhatsApp Web), **Edit** and **Delete** (with
  confirm). Copy all and Share leave the note out.
- The same card list opens as a sheet from an owner's page (⋯ → Manage → Bank accounts, §4.8),
  showing only that owner's accounts; Add there needs no owner.
- **Cards** (D-046): the cards that have saved details, by card name ("Arif · EBL" + the network
  badge), with a search (card, owner or last 4 digits). **+ Add card details** picks any active
  card (D-054: one that already has numbers too), then **Primary / Supplementary** (chips; Primary
  for a card's first number, else Supplementary; one Primary per card), Cardholder name, Card
  number, Expiry (MM/YY) and CVV.
  - As you type (D-067), the number shows in groups of four ("4111 1111 1111 1111"; saved as
    digits) and Expiry adds the "/" after MM ("1226" → "12/26"). An expiry before this month
    shows "This card expired in Sep 2026. It can still be saved." (a warning, never a block).
  - A number already saved on any card is refused under Card number: "This number is already
    saved on Shakil · EBL Visa". There is no order rule (a supplementary may come first), no
    check against the card's Type, and the cardholder name is optional.
  - Each card is listed once, with its saved numbers under it, Primary first (D-054). Each number
    is masked as its tag and the last 4 digits, "Primary · •••• •••• •••• 1234" or "Supplementary
    · •••• •••• •••• 5678" (no expiry or CVV placeholders, D-051), with **Reveal**. A
    supplementary card is never added as a card in Setup: it shares the primary's bill.
  - **Reveal** asks for the fingerprint; there is no password reveal (D-052: a saved password
    could be autofilled):
    - when this user has no fingerprint set up, or the browser can't use one: "Set up fingerprint
      unlock to see card details", with a link to Settings → Fingerprint unlock;
    - when the fingerprint is cancelled or not accepted: "Fingerprint not accepted — try again",
      with the same link (this device may not be set up). Reveal stays.
  - Revealed: each field with a ⧉ copy button (the number is copied without spaces), **Copy
    all**, **Hide**, **Edit**, **Remove** and "Hides in 30 s". There is no Share.
  - **One fingerprint, 30 s** (D-054): for 30 s after the fingerprint, Reveal on any other number
    shows it at once, without a new fingerprint, and masks the one shown before (one at a time).
    The countdown runs from the fingerprint and never restarts. When it ends, or on Hide, or when
    the app goes to the background or the window loses focus, the number masks and the next
    Reveal asks for the fingerprint again. (Screenshots can't be blocked from a web page.)
  - **Edit** and **Remove** (with a confirm) are there only while revealed; Edit opens the form
    filled in (its tag too). Saving masks the number again. Remove removes that number only.
  - The same card opens as a sheet from the card's page (⋯ → Manage → Card details, §4.8).

### 4.15 Send preview (WhatsApp)
- One sheet (`?send=` on the account page; D-040), opened from the Saved toast, the entry sheet,
  the Bills tab, ⋯ → Remind on WhatsApp and the Report sheet's WhatsApp message.
- **To:** the name and number. The number is the WhatsApp number, else the phone (the first one;
  `01…`, `+880…` or `880…`). With none, "No WhatsApp number — Share opens the share sheet".
- **Greeting:** from Settings → Business → Messages, `{name}` filled in, editable, with a **Save
  greeting as default** tick (saved when the message is sent or copied).
- **Add How to pay:** a switch, off by default. On: the business's bank accounts as chips (the
  only one is picked for you); changing it rebuilds the message.
- **Message:** the body and the sign-off, editable.
- **Send on WhatsApp** (opens `wa.me/880…` with the text) · **Copy** ("Copied") · **Share** when
  there is no number. Over 1,500 characters: **Copy** + **Open chat** instead.
- On a customer's or supplier's statement, a Sale (the invoice) and a Payment in (the money
  receipt), **Share PDF** sits beside Copy (§4.16); it uses the How to pay choice above.
- A note: "Undo can't recall a message you've sent."

### 4.16 PDF documents (D-041)
- Made on the server (A4), shared with **Share PDF**: on a phone the share sheet opens (pick
  WhatsApp → the contact); on a computer, or if sharing is refused, the file downloads. While it
  is being made the button reads "Making PDF…"; a failure shows "Couldn't make the PDF".
- **Every PDF:** a centered header (the logo beside the text) with the logo, the business name, address, phones and trade licence /
  TIN / BIN (only those filled in); on every page a footer with "Generated 11 Oct 2026, 3:45 PM
  · Computer-generated, no signature required" (user feedback 2026-10-11) and "Page x / y". After the body: **How to pay** (the picked business accounts) only when
  switched on, then **that document's terms** (invoice → invoice terms, money receipt → receipt
  terms, customer or supplier statement → statement terms; D-049) in a light box headed
  **"Terms & conditions"**, numbered 1, 2, 3 …, and the **footer line** apart, centered below the
  box (D-050). No terms → no box; the footer line still prints, centered. Customer documents
  never show cost or profit.
- **Due statement** (customer or supplier): "Statement of account", the account's name and the
  period; a table Date · Entry · Debit · Credit · Balance with an **Opening** row, the entries
  oldest first (with their INV-/MR- numbers), **Totals** and **Closing**; then the closing line in
  bold: customer "Please pay ৳X" / "Advance ৳X" / "No due"; supplier "Balance due to you: ৳X" /
  "Advance paid ৳X" / "No due".
- **Invoice** (a sale; D-042): "Invoice INV-0042" with the date and time saved on the right;
  "Bill to" the customer (+ phone · address when saved) and a stamp **PAID** (green) / **PARTLY
  PAID** (amber) / **DUE** (red) from this bill's Received now payment; a table SL · Model · Qty ·
  Price · Total (a line split over lots shown once); **Total** and pieces, the total in words; then
  (not Walk-in) a ruled sum: Previous due, This bill, Paid now when paid, a rule, **Current due**
  (+ "Due today" when newer entries moved it). Walk-in shows "Paid" instead. Below 0 reads
  "Advance". No stamp when cancelled.
- **Money receipt** (a Payment in; like a receipt book): "Money receipt MR-0017" with the date on
  the right; "Received with thanks from" the customer (+ phone · address when saved); the amount
  and **in words** ("Taka Fifty Thousand Only") in a shaded box; then (not Walk-in) a ruled sum:
  Previous due, "Bill INV-0042 +৳X" when paid with that sale, Received −৳X, a rule, **Due now**
  (+ "Due today"); a bar "Cleared N% of the due" while some is left; a green stamp **PAID IN
  FULL** (Due now ৳0) or **ADVANCE ৳X** (below 0).
- **Reports** (D-043, D-045; no terms, no How to pay): the Sales report, the **Investor report**,
  the **card statement** and the **Monthly pack**, each with its title, the period and the same
  sections as on screen (tables with a Total row).
- **Cancelled:** a reversed sale or payment prints **CANCELLED** and "Reversed on 12 Oct 2026",
  the lines / amount as they were and no dues.

### 4.17 Reports (D-043)
- **List** (`/reports`, from More / the sidebar): **Charts** · Cash book · Sales report · Monthly
  pack · Investor report · Backup all data (.xlsx) (→ §4.12).
- **As on** (D-045): a report for a period reads the books as on its last day (today when it runs
  to today). Only the Investor report's paid / reinvested and "Profit owed now" are as of now.
  An open month's report shows the grey note "Open month — figures can still change". A pack made
  before its month's close shows "Undistributed profit" where one made after shows "Profit owed"
  (same total). Card owners and share % are today's (Setup keeps no history).
- **⤴ Share:** the Cash book and the Sales report have one Share icon in the title row; it opens
  the Report sheet (§4.8) with only the outputs that page has.
- **Cash book** (`/reports/cash`; Home's Cash tile):
  - Today by default; a **‹ day ›** stepper (not past today, not before the first entry).
  - Each day: **Opening**, then each entry that moved cash, in the order it was saved: Entry
    (with its INV-/MR- number) · Who · In · Out · Balance, then **Closing**. A reversal sits on
    the opposite side as "Reversal of …". A row opens the entry sheet in place. On a phone each
    row is a list item; on desktop a table.
  - **A range** (the Report sheet's View on screen): a chip "1 Oct – 31 Oct 2026 ✕" (✕ goes back
    to today), the range's Opening and Closing, then each day that has cash moves.
  - **Count cash** (today only): a link that opens a small box "Counted cash"; it shows "Matches
    ✓", "Short by ৳X" (red) or "Over by ৳X". Nothing is saved.
  - Report sheet: a chip for the day on screen (selected) + the usual periods; View on screen ·
    WhatsApp message (the day book).
- **Sales report** (`/reports/sales`; this month by default; the range chip as above):
  - **Totals:** Bills · Pieces · Sales · Cost · Gross profit · Margin % · Returns (pieces ·
    amount · profit effect) · **Net sales profit**.
  - **By model** and **By customer:** Pieces · Sales · Profit, net of returns, largest sales
    first; each table's total = Net sales profit. Walk-in is "Walk-in".
  - **Avg unit price** (D-056; By model only, here and wherever a By model table appears):
    - placed between Pieces and Sales, with the Total row blank;
    - the average price of the period's sales that still stand (returns, reversal lines and
      sales reversed in the period are left out), half-up to whole taka; "—" when nothing was
      sold;
    - Pieces × avg can differ from Sales by under ৳1 a piece;
    - the PDF and Excel have it as a column; on a phone and in messages the pieces read "30 pcs
      × ৳15,700", or "29 pcs · avg ৳15,700" when returns or reversals changed the pieces.
  - Report sheet: View on screen · WhatsApp message · Share PDF · Download Excel.
- **Investor report** (`/reports/investor`, D-045):
  - Without a person: a list of investors and partners (Name · Kind · Capital · Profit owed); a
    row opens `?person=`. None: "No investors or partners yet".
  - A person (title "Investor report — Nadim" / "Partner report — Arif", ‹ Investor report back
    link; this month by default, whole months only; the range chip):
    - **Capital:** Opening, then Added · Reinvested · Taken out (cash) · Taken out (card) ·
      Opening & corrections (those not zero), **Closing** (D-060: a Capital out paid by card is
      "Taken out (card)");
    - **Card investment:** each card they supply (balance · next due · status · remaining EMI) as
      on the period end, then "Card payments made in {period}";
    - **Allocations:** each month of the period: a closed month's cash / card rows (basis × rate =
      amount) or a partner's amount, "nothing allocated", or "not allocated yet" (open); grey
      "basis set at close" when the cash basis isn't the month-end capital;
    - **Profit:** Owed before {from} · + allocated (each month) · + later months · ± opening &
      corrections · − Paid (dated) · − Reinvested (dated) · **= Profit owed now**;
    - a partner: Share % and the opening difference while unresolved.
  - Report sheet (months only: This month · Last month · a month ▾ · Custom = From month / To
    month): View on screen · WhatsApp message (to the person, §4.15) · Share PDF · Download Excel.
- **Monthly pack** (`/reports/pack?month=`, D-045; the latest closed month by default, else last
  month; the month in the title, "Monthly pack — Oct 2026"):
  1. **Profit & loss:** the breakdown lines, this month beside last month ("—" before the opening);
  2. **Position at month end:** as the Books balance sheet (§3, D-064): What we have → Business
     assets, What we owe → Net worth, Whose it is → Total, and ✓;
  3. **Allocations:** investors (basis × rate = amount) and partners, then profit owed per person
     at month end; open: "not allocated yet";
  4. **Sales:** By model (with Avg unit price, D-056) and the top 5 customers (Pieces · Sales ·
     Profit);
  5. **Stock movement:** per model Opening · Bought · Sold · Returned in · Back to seller · Written
     off · (Corrections) · Closing · Value; on a phone one row per model ("Redmi 13 · 108 left ·
     ৳16,20,000" over the moves);
  6. **Dues and their change:** Customers, then Suppliers: Start · End · Change (rows not zero);
  7. **Card bills:** due next month and overdue at month end (Card · Due date · Amount ·
     Remaining), then remaining EMI per card;
  8. **Cash flow by entry type:** Opening, each type's In and Out, Closing.
  - Report sheet (one month): View on screen · WhatsApp message · Share PDF · Download Excel.
- **Report messages:** the send preview (§4.15) without To, Greeting or How to pay: the text, then
  Copy · Share (the Investor report's goes to the person, with To and Greeting).
- **Charts** (`/reports/charts`, D-064; on screen only, no ⤴ Share):
  - **Top:** tabs **Profit · Money · Customers · Stock** (`?tab=`, Profit first), then one
    period row: **6M** (default) · 12M · This year · Custom. Custom opens the Report sheet (View on
    screen); a custom range shows the range chip.
    - **6M / 12M** = this month and the 5 (11) before it: from the 1st of that month to today, so
      this month is a partial last bar.
    - A window never starts before the opening date or ends after today.
    - ≤ 62 days are drawn by day, longer windows by month.
    - A flow's "vs prev 6M" compares with the same length right before the window, and shows only
      when that whole earlier period is on or after the opening date; otherwise there is no delta.
  - **Cards** (one column on a phone; 2–3 on desktop): title · headline · a muted delta with an
    arrow ("▲ ৳20,100 vs prev 6M" for flows, "since 01 May" for positions) · a mini chart
    without text. The whole card opens its detail page.

    | Tab | Card (headline) | Detail (`/reports/charts/<chart>`) |
    |---|---|---|
    | Profit | Net profit (the window's total) | Monthly signed bars (whole months, each = the Months row); the readout's "See breakdown" shows the month's breakdown lines (as §4.9). By day: titled **Sales profit**, sales profit per day, with the note "Expenses are counted by month" |
    | Profit | Sales & margin (sales · margin %) | Sales bars above a small margin % line on the same buckets (exact dates, as the Sales report) |
    | Profit | Expenses (the total; the largest category's share) | Monthly bars (whole months, in the day view too, with "Expenses are counted by month"); categories (Amount · Share · Change), Card fees last; a category filters the bars |
    | Money | Business value (net worth now) | Month-end (by day: day-end) Cash · Stock · Customers owe above 0, Card balances · Suppliers below 0, a Net worth line; Business assets (the bars' top, not drawn) after Customers owe in the tooltip and the table, the readout "{bucket}: Business assets ৳… · Net worth ৳…"; table: one row per bucket; note "Net worth's change isn't the profit: capital in or out and profit paid move it too" |
    | Money | Cash (now) | Daily running cash; negative days marked red; list: one row per bucket (month-end, or each day), then **Below zero** (date · cash) |
    | Money | Card debt (card balances now) | Month-end (by day: day-end) bars of all cards; note "Card balances include bills not due yet, so they differ from Home's Card dues"; then Bills due next, as of today (as Home's card alerts) |
    | Money | Profit shares (the window's total) | Whole months: closed months stacked by person (Setup order; an investor's cash and card allocations are one figure), open months "not allocated yet"; by day "Profit shares are counted by month" |
    | Customers | Customers owe (now) | Total dues line; then customers by **Lowest due** in the window (Lowest · Now), only those with lowest > 0, Walk-in left out; a row opens their Due trend |
    | Customers | Given vs collected (net change) | Per bucket: Given · Collected bars and Other; table Given · Collected · Other · Change; Other listed by kind |
    | Customers | Top customers (top 1) | Top 10 bars, Sales / Profit toggle; the Sales report's By customer (Walk-in included), the rest as "Other customers" in the table |
    | Stock | Stock age (the 90+ value; "as of today") | Four bars 0–30 · 31–60 · 61–90 · 90+ days (value at cost, units); table Age · Units · Value, a row lists its models; note "Opening stock counts from {date}" |
    | Stock | Top models sold (top 1: "{model} · {n} pcs") | Top 10 bars, Pieces / Profit toggle; the Sales report's By model, the rest as "Other models" in the table (Pieces · Sales · Profit) |

  - **Given vs collected** (clarified 2026-10-24): **Given** = sales + cash given; **Collected** =
    customer payments; **Other** = every other change to a due, by kind (returns, discounts, profit
    share added to due, purchases against due, refunds to the customer, opening and its
    corrections, and Walk-in's net). A reversal counts under its original's kind, negated, on its
    own date (as the Sales report). Given − Collected + Other = the change in total dues.

  - **Stock age** (clarified 2026-10-24): always today's stock (the period row changes only Top
    models sold), so the card's muted line is "as of today". A lot's age = today − its purchase
    date: 0–30 · 31–60 · 61–90 · 90+ (91 days and more). Tapping an age's table row (`?age=`)
    lists its models below the table (Model · Units · Value, as the Stock page), with **All ages**
    to clear it. The opening note shows only while stock from the opening is left. Σ the ages'
    value = the Stock page's value = the books' stock.

  - **Whole months** (D-064, clarified 2026-10-24): Net profit, Expenses and Profit shares count
    whole months; a custom range that starts or ends mid-month notes "Net profit and expenses
    count whole months" ("Net profit and profit shares count whole months" on Profit shares).
  - **Positions' delta** ("since 01 May"): now − the position as on the window's first day.
    Their "vs prev" is the same number of whole months before, shown only when all of them are
    on or after the opening month.
  - **Readout:** on a phone, tapping a bar or point shows "{bucket}: {values}" in a fixed line above
    the chart (the latest bucket until then). On desktop, hovering shows a tooltip instead.
  - **Table:** under every detail chart (beside it on desktop when it's narrow), the exact values;
    on a phone a list.
  - **Due trend** (`/customers/<id>/trend`; ⋯ → Due trend, or a Customers owe row): "{name} · Due
    trend", the period row, then:
    - a step line of the due at the end of each day, with dashed **Lowest** and **Average** lines;
    - **Now · Average · Lowest (always kept) · Highest · Last paid {date} ({n} days ago)**:
      Now = today's due (the customer page's); Average = the end-of-day dues' mean to whole taka
      (`avgTaka`); Lowest / Highest = the lowest / highest end-of-day due; Last paid = the latest
      payment ever that isn't reversed (as the reminder), "Last paid —" when none (clarified
      2026-10-24);
    - the window's statement rows.
    - Walk-in has no Due trend.
  - **Empty:** a chart with nothing in the window shows "Nothing in this period".


## 5. Feedback & states

- **Saving:** the button shows a spinner and is disabled, preventing a double submit.
- **Success:** a toast "Saved · Undo". It stays 8 seconds and sits above the bottom tab bar.
  Every toast is drawn above any open sheet or dialog (D-053).
  After a Sale, Payment in, Return, Discount or Profit share it also has **Send ▸**, which opens
  the send preview on that customer's page (§4.15, D-040).
  Undo uses the same "changed by someone else" check as edit.
- **Network error:** the form stays filled and shows "Not saved — tap Save again".
- **Validation:** inline errors under the fields. Examples: "Only 12 left in this lot", "Date is in
  a closed month (Sep 2026)", "Cash received can't exceed amount charged".
- **Concurrency conflict:** "Someone else changed this entry — reload".
- **Possible duplicate:** a dialog "A similar entry exists (by Sumon, 10:42) — save anyway?" with
  **View it** · **Save anyway** · **Cancel**. It never blocks.
- **Capital out by card** (D-060; layout chosen by the user, 2026-10-16): Save first opens a bottom
  sheet with **Back** · **Save** (Back keeps the form as typed):

  ```
  Sumon's personal spend
  The business pays this with Arif · City Amex's bill. It comes
  off Sumon's capital; it isn't a business cost.
  ┌───────────────────────────────────────────┐
  │ Arif · City Amex             +৳2,206.90  │
  │ Oct 2026 bill                             │
  │ Sumon's capital              -৳2,206.90  │
  │ Cash and profit                no change  │
  └───────────────────────────────────────────┘
  Shows on Arif's card statement as "Capital out · Sumon".
                                     [Back] [Save]
  ```

  - The small muted notes under the figures appear only when they apply: the owner's statement
    line when the card is someone else's; "It lowers Nadim's cash basis at the month's close."
    for an investor.
- **Other confirms** (D-061): the same sheet (title, one sentence, the §3 rows, notes), only where
  the money goes somewhere the form's name doesn't say. Not on every save: Undo and Reverse cover
  routine mistakes.
  - **Card cash-out** (always): "Cash-out on {card}" · "৳51,000 goes on the card and ৳50,000
    comes in as cash. The ৳1,000 difference is a fee, a business expense." Rows: Cash, the card
    (bill month), Profit (month · fee Y%).
  - **Opening correction** (always): "Correct the opening" · "{What} at opening was wrong. The fix
    goes to the partners' opening difference, not this month's profit." Rows: the item, each
    partner's opening difference, the no-change row.
  - **Profit paid / reinvested** (only above the profit owed): "Pay {person}'s profit" / "{person}
    reinvests profit" · one sentence · rows · note "This is ৳X more than {person}'s profit owed (৳Y)."
- **Empty states:** a short hint with a primary action button.
- **Loading:** skeleton rows.

## 6. Accessibility
- Labels are tied to inputs, with visible focus rings. Colour is never the only signal (badges have
  text).
- Contrast meets WCAG AA in all three themes: Light, Dark and Night Owl. The user picks the theme
  in Settings; the phone's system setting doesn't (D-037).
  - A colour used as a fill takes its paired text colour from the theme (`primary-foreground`,
    `destructive-foreground`; `foreground` on `muted`); white or black text is never hard-coded
    on a theme colour (D-059).
- **Charts** (D-064):
  - six `--chart-*` colours per theme, ≥ 3:1 on the card and distinguishable with colour
    blindness;
  - a colour stands for the same account or person on every chart: Cash 1 · Stock 2 · Customers
    owe 3 · Card debt 4 (all cards, one total) · Suppliers 5 · Net worth 6; people in Setup order
    on 1–6 in turn;
  - no text is drawn on a fill;
  - mini charts are hidden from screen readers (the card link says what it is);
  - a detail chart has a one-line label, and its table is the exact, readable source;
  - animations are off.
