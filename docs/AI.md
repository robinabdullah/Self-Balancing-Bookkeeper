# Self-Balancing Bookkeeper — AI assistant (spec)

*Separate track · 13 October 2026 · D-057.* This file is the spec for the AI assistant: what it
does, its rules, its data and its screens. Tasks are in `docs/TASKS-AI.md`. Use PRD, SRS and UIDD
for everything else. This track changes none of their rules.

## 1. Scope and safety

- **What the AI does:** it reads, explains, drafts and flags. **It never works out a figure and
  never writes anything.**
- **What stays the same:** the engine (`src/lib/engine/**`) and the posting rules (SRS §5). Every
  figure still comes from `computeBooks()` and the report builders.
- **Who can use it:** partners only (`requirePartner()`).
  - v2 investor and employee roles get no access until a separate decision says so. An employee
    must never see profit.
- **Out of scope:**
  - saving entries automatically;
  - closing months;
  - investor allocations or the profit split;
  - forecasting (the history is too short, so forecasts would sound sure and be wrong).
- **Language:** the answer uses the question's language, English or Bangla. Chips always show the
  exact English label from the UI (§6).

## 2. Read-only guarantee

The AI cannot post, put or delete. Four independent layers enforce it.

1. **No write code can be reached.**
   - Tools are **pure functions** over data that is already loaded. They get no database handle.
   - An ESLint `no-restricted-imports` rule on `src/server/ai/**` bans these imports:
     - `@/server/actions/*`;
     - `@/server/action` (`runAction`);
     - `@/db`. The one exception is `src/server/ai/read.ts`.
2. **The database refuses writes.**
   - All AI data loading goes through `aiRead()` in `src/server/ai/read.ts`.
   - `aiRead()` opens a transaction on **the same single pool** (`src/db/index.ts`; no second pool,
     CR-030). It runs `SET TRANSACTION READ ONLY` first, so Postgres rejects any INSERT, UPDATE or
     DELETE.
   - `loadBooksData(q)` (`src/server/books.ts`) already accepts the transaction as its executor.
3. **Drafts are not writes.**
   - When the AI suggests a fix or an entry (§9, AI-5 onward), it returns a **draft object**.
   - The app opens the normal form pre-filled, with its preview and duplicate check. A partner
     presses Save under their own session.
   - The AI code path never calls a server action.
4. **Tests prove it:**
   - every tool runs, and afterwards every table's row count and `audit_log` are unchanged;
   - an INSERT inside `aiRead()` throws;
   - the lint rule fails on a planted import.

**Not a tool:** the router's own bookkeeping (usage counts and a key's `resting_until`) is app code.
The model can't trigger it.

## 3. Providers, models and keys

```
Adapter (code, 3)        google · anthropic · openai-compatible
 └─ Provider (Settings)  name, adapter, base URL (https only), tier free|cheap|premium,
       priority, active, daily_token_cap (paid providers)
       ├─ Model          model id, abilities {tools, pdf}, check score + date
       └─ Key            label, encrypted secret, last4, active, resting_until, last_error
```

- **Adapters:** there are only three, and they live in code.
  - `openai-compatible` covers ChatGPT and the cheap providers that use the same API: GLM (Z.ai),
    DeepSeek, Qwen, Kimi, OpenRouter, Groq and others. Each one is just a base URL plus a key.
- **Adding a provider** happens in Settings → AI (§10). It needs no code change.
- **Library:** the Vercel AI SDK: `ai`, `@ai-sdk/google`, `@ai-sdk/anthropic` and
  `@ai-sdk/openai-compatible`.
  - Exact versions are pinned and checked against Next.js 16 when AI-1.5 starts.
- **One entry point:** `ask(job, question, history)` in `src/server/ai/ask.ts`. Nothing outside
  `src/server/ai/` knows which provider answered.
- **Jobs and what each needs:**

| Job | Needs |
|---|---|
| `ask` (questions, explanations) | tools |
| `review` (pre-close) | tools |
| `statement` (card statement check) | tools + PDF |

## 4. Routing, limits and cost

1. **Order of choice:**
   1. Providers by `priority`. Skip inactive ones and paid providers already over today's
      `daily_token_cap`.
   2. Within a provider, a model that passed the check (§5) and has the job's abilities.
   3. Within the provider, the next ready key, in turn (a rotation).
2. **The start order is your choice:** free Gemini keys first (D-057). A paid provider is used only
   when Arif added it and switched it on.
3. **Limit reached** (HTTP 429 / `RESOURCE_EXHAUSTED`):
   - the key rests (`resting_until`):
     - until the provider's `retryDelay` if it gives one;
     - else until the daily reset for a per-day quota;
     - else about 60 s for a per-minute limit;
   - the same question then goes to the next key, then the next provider.
4. **Bad key** (invalid, revoked or unknown model): marked **Error** with the provider's message,
   with any key text stripped out. It is skipped until fixed or re-tested.
5. **Limits per question:**
   - at most 6 tool steps, and a capped output length;
   - a 30 s timeout per provider call and 60 s overall;
   - **a timeout doesn't rest the key.**
6. **Limit per user:** at most 6 questions a minute, which catches repeated taps.
7. **Usage:** each answer adds its requests and input/output tokens to `ai_usage` for that key and
   day. Settings shows "Used today" and the cap.
8. **Nothing ready:** "AI is resting — next key ready at 2:00 PM. All reports work as usual."
9. **Kill switch:** Arif can turn all AI off (§8). Ask and the Explain items then disappear.

> ⚠️ **Gemini limits are per Google Cloud project, not per key.** Keys from one project share one
> limit. Spreading the load only helps with keys from different projects; check Google's terms.

## 5. Model check

A cheap model must pass before it is used. **Test** runs a fixed exam on **fake books** (never real
data). The exam has six checks:
1. it calls the right tool;
2. it writes only placeholders (§6) and no digits;
3. it answers in Bangla when asked in Bangla;
4. it says "I don't have that" instead of making something up;
5. it handles a two-step tool chain;
6. when a name matches two customers, it asks which one.

- The result is stored as **"Passed 6/6 · 13 Oct"**. Only models that pass all six are routed to.
- Changing a model's id clears its result.

## 6. Numbers and titles identical to the UI

The rule: **a figure in an answer is a chip that shows exactly what the linked screen shows: the
same label, the same sign, the same format.**

- **One label list.** UI labels move into `src/lib/labels.ts`. The screens, reports and AI all
  import from it.
  - Example: "Customers owe" is written today in both `src/lib/dashboard.ts` and
    `src/app/(app)/page.tsx`.
- **A fact belongs to one screen.** The same label can carry a different sign on different screens.
  - "We owe suppliers" is **+** on the Home tile (`books.supplierDues`).
  - It is **−** in the balance-chip breakdown (`breakdown()` in `src/lib/dashboard.ts`).
  - So each fact takes its value from **the view-model of the screen it links to**, never from raw
    `books`.
- **Fact shape:** `{ id, label, context, kind, value, href }`.
  - `kind`: money · count · pct · date · ref.
  - `context` names the scope, so two "Profit" figures can't be confused: "Oct 2026 · 1–13 Oct",
    "Rahman Telecom", "as of 13 Oct 14:32".
- **The model writes placeholders, never numbers:** "Customers owe {{F3}}, up {{F4}} since
  September."
  - Names, invoice and receipt numbers and dates are placeholders too (`{{E2}}`, `{{F7}}`). Model
    and shop names often contain digits ("Redmi 13 8/256").
- **Rendering:**
  - each placeholder becomes a chip showing the label and the value, formatted as the screen does;
  - money uses `format()` from `src/lib/money.ts`;
  - the chip links to `href`.
- **Guard:**
  - An answer is rejected if it has **any digit** (0–9 or ০–৯) outside a placeholder, or a
    placeholder that no tool returned.
  - Lists use bullets, never "1.".
  - On a rejection the model is asked once to fix it. If the second answer also fails, the figures
    are shown as a plain fact list with no AI wording.
- **Work done in code, never by the model:**
  - differences and percentages, with `money.ts` (`sub`, `pct`);
  - periods like "last week" and "this month", resolved in Asia/Dhaka with `src/lib/dates.ts`.
- **As of:** every answer shows when its figures were read. Asking again reloads them.
- **Ambiguous names are never guessed.**
  - "Rahman" shows chips: "Rahman Telecom (Karim)" / "Rahman Mobile". This keeps the rule
    "pick, don't type".
- **Bank PDF figures** (§9, card statements):
  - shown as **"Bank PDF says"**, apart from app figures;
  - the extracted rows must add up to the statement total, or the reading is rejected;
  - the comparison with the app's bill is worked out in code.

## 7. Tools

Every tool is read-only and pure (§2). Each one uses the same loader as the screen its facts link
to.

| Tool | Built on | Links to |
|---|---|---|
| `find` | Setup lists: names only, never contacts | the account |
| `books_summary` | `loadBooks` + the `dashboard.ts` view-model | Home, the balance chip |
| `month_compare` | `monthProfit` (`src/lib/engine/months.ts`) and `loadPack` (`src/server/pack.ts`) | Monthly pack, Months |
| `customer_statement` | `dueStatements` | customer / supplier |
| `card_bills` | `cardSummaries` | card |
| `stock` | `lotsRemaining` and the stock view | Stock |
| `sales` | `salesReport` | Sales report |
| `cash_book` | `cashBook` | Cash book |
| `journal_search` | the Journal query + `audit_log` | Journal entry |
| `pre_close_review` | plain TS rules (§9) | each flagged entry or account |

- **`month_compare` for the open month:** "same days" is the main comparison (1–13 Oct vs 1–13
  Sep). The previous month in full is shown for reference (D-057).
- **Never in any tool's output:**
  - card secrets;
  - passkeys;
  - AI keys;
  - saved bank accounts;
  - phone, WhatsApp or email of anyone.
  - `journal_search` leaves out audit rows of those tables.
- **Allowed in tool output:** names, addresses and entry notes (D-057).
- **Tie-out test:** each tool's facts equal what its linked screen's loader returns.

## 8. Data and secrets

### Tables (one migration)

| Table | Columns |
|---|---|
| `ai_providers` | `name`, `adapter`, `base_url`, `tier`, `priority`, `active`, `daily_token_cap` |
| `ai_models` | `provider_id`, `model_id`, `can_tools`, `can_pdf`, `check_score`, `checked_at` |
| `ai_keys` | `provider_id`, `label`, `secret`, `last4`, `active`, `resting_until`, `last_error` |
| `ai_usage` | `key_id`, `day`, `requests`, `input_tokens`, `output_tokens` |

- **Plus** `business_profile.ai_enabled` (the kill switch).
- **Standard columns:** every table has the usual base columns. RLS stays on with no policies
  (SRS §2).

### Key secrets
- **Encryption:** AES-256-GCM through `encryptField` / `decryptField`
  (`src/server/card-crypto.ts`), with the associated data `"ai_key:<id>"`.
- **Where a key exists:** decrypted only in server memory at call time.
- **Where a key never appears:** client props, logs, audit rows, error messages or the Excel
  export. `TABLES` in `src/server/export.ts` never gets `ai_keys`.
- **Who manages keys:** writes go through `runAction()` and then require the user's email to equal
  the server-only env **`AI_ADMIN_EMAIL`**.
  - Only Arif manages providers, models, keys and the kill switch. Sumon sees them read-only.
  - Using the email means production never has to be read to find a user id.

### Not stored
- questions and answers (follow-ups live on the page only);
- prompts or business data in logs (D-014);
- uploaded PDFs and their passwords (read in memory, then dropped).

### Prompt injection
- **How it's handled:** notes, names and PDF text are passed to the model as data. The system
  prompt says never to follow instructions found in them.
- **Why the risk is low:** the AI is read-only, figures come only from facts, and the guard checks
  every answer. So a planted instruction can at worst produce odd wording.

### Tests
- **Fake provider:** turned on by `AI_FAKE=1` and refused in a production build.
- **Real providers:** a smoke test exists only as a manual script the user runs.

## 9. Features (with examples)

### Explain a month (AI-3)
> "Profit 1–13 Oct is {{F1}} vs {{F2}} for 1–13 Sep (September in full: {{F3}}). Sales profit is
> down {{F4}}; {{E1}} margin fell from {{F5}} to {{F6}}. Cash-out fees are up {{F7}}. {{E2}}'s
> profit share is not entered yet."

### Pre-close review (AI-4)
The rules are plain TS. The AI explains each finding and puts them in order. The rules:
- a sale below its lot cost;
- a cash-out fee % far from that card's usual rate;
- similar entries made by both partners;
- a customer profit share missing for the month;
- the first date cash went negative;
- a card on "Check dates".

### Cash-count difference (AI-4)
When the counted cash doesn't match the cash book, the AI points to likely causes:
- an entry exactly equal to the difference;
- a difference divisible by 9, which suggests swapped digits (32,000 ↔ 23,000);
- half the difference, which suggests an entry in the wrong direction.

### Ask the books (AI-2)
- dues, stock, card bills this week, spending by category;
- what-if: `computeBooks()` runs in memory with a draft entry checked by the same Zod schema. It is
  never saved.

### Explain an entry or a card bill (AI-3)
What the entry posted, which card bill it lands on, and its edit history.

### Card statement check (AI-5)
1. Upload the bank PDF, and enter its password when it has one.
2. See the differences between the bank and the app.
3. Open a pre-filled **draft** fix for each one.

### Later (AI-6)
- quick entry from text or voice;
- "What changed this week";
- investor and month-summary drafts (customer text never shows cost or profit);
- setup hygiene;
- "How do I record…?" help.

### What the books don't track
Questions about bKash or bank balances, or per-unit IMEI, get: "The app doesn't track that."

## 10. Screens (UIDD rules, D-034)

### More → Ask
(On desktop, which has no More (D-062), Ask is its own sidebar link with an icon.)
- a question box, with four starter questions as chips;
- answers with fact chips and an "as of" time;
- "Answered by Gemini · key 2" in small grey text;
- "Thinking…" while it works;
- the last few turns kept on the page for follow-ups.

### Settings → AI
- the **AI on/off** switch first, then the sections **Providers**, **Models** and **Keys**:
  - **Provider:** name, adapter, base URL, tier, priority (↑↓), active, daily token cap.
  - **Model:** model id, tools / PDF, **Test** (§5) with its result.
  - **Key:** label, last4 (`…a9F2`), status (Ready · Resting until 2:00 PM · Error), Used today,
    active, **Test**. After Save, a key is never shown again.
- Everything here is read-only for anyone but the `AI_ADMIN_EMAIL` user.

### "Explain…" items
- inside the existing ⋯ / Report sheets of: the Monthly pack, the Sales report, the Close screen,
  a card's bill and a Journal entry;
- **Home gets nothing new.**

### Help text
Every new form has its About text in `src/lib/help-text.ts`.
