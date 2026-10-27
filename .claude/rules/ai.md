---
paths:
  - "apps/web/src/server/ai/**"
  - "apps/web/src/app/(app)/ask/**"
  - "packages/domain/src/journal/labels.ts"
---

# AI assistant rules (docs/AI.md, D-057)

- **Read-only (§2):**
  - nothing under `apps/web/src/server/ai/**` imports `@/server/actions/*`, `@/server/action` or `@/db`
    (only `read.ts` may);
  - all AI data loading runs inside `aiRead()`, a READ ONLY transaction on the shared pool (never a
    second pool, CR-030);
  - tools are pure functions over loaded data; a suggested entry is a draft that opens the normal
    form.
- **No figure from the model (§6):**
  - every number, name and date in an answer is a `{{F#}}`/`{{E#}}` placeholder;
  - each fact's value comes from the view-model of the screen it links to (same label, sign and
    format), never raw `books`;
  - differences, % and periods are computed in code (`money.ts`, `dates.ts`, Asia/Dhaka);
  - the guard rejects any digit (0–9, ০–৯) outside a placeholder.
- **Privacy (§7, §8):**
  - never in tool output: card secrets, passkeys, AI keys, saved bank accounts, phone, WhatsApp or
    email;
  - keys are encrypted (`encryptField`, AAD `ai_key:<id>`) and never appear in props, logs, audit
    rows, errors or the export;
  - prompts, answers and PDFs are never logged or stored.
- **Keys and settings** are writable only by the `AI_ADMIN_EMAIL` user, through `runAction()`.
- **Tests** use the fake provider (`AI_FAKE=1`), never a real API.
