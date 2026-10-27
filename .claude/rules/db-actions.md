---
paths:
  - "src/db/**"
  - "src/server/**"
  - "src/app/**"
  - "scripts/**"
---

# Database and server-action rules (SRS §2–§4, §7, §8, §11)

- **Security:**
  - RLS is enabled on every table, with **no policies**;
  - DB access is server-only through Drizzle (`import 'server-only'`);
  - never expose `DATABASE_URL` or a service key to the client or to `NEXT_PUBLIC_*`.
- **Every server action** goes through the one helper in `src/server/action.ts`:
  1. `requirePartner()` (session + `role = partner`);
  2. Zod;
  3. duplicate check;
  4. guards;
  5. transaction;
  6. audit row;
  7. `revalidatePath`.
- **Write safety:**
  - Ids are client-generated UUIDs; inserts use `on conflict (id) do nothing`.
  - Edit, delete and Undo send the `updated_at` the client saw; a mismatch → "changed by someone
    else — reload".
  - Lot quantities are checked inside the transaction with `SELECT … FOR UPDATE`.
- **Dates:**
  - future dates are rejected;
  - nothing before the opening date;
  - `for_month` ≤ the month of the date;
  - a new entry is rejected if its date or for_month is in a closed month.
- **Corrections:**
  - edit/delete only in open months, always with an audit row (before/after);
  - reverse = a linked entry (`reverses_id`), at most once, never a reversal of a reversal;
  - blocked while dependents exist.
- **Pick, don't type:** every person/card/customer/supplier/model is a foreign key; no free-text
  names.
- **Schema:** money columns are `numeric(14,2)` with the CHECKs in SRS §4. No stored balance
  columns, ever.
