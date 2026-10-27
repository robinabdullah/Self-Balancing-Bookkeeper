---
paths:
  - "src/lib/**"
  - "tests/**"
---

# Money and engine rules (SRS §3, §5, §6, §7)

- **Money = integer poisha** (`number`) in TS; `numeric(14,2)` in the DB.
  - Never use float arithmetic on money.
  - Convert only in `src/lib/money.ts` (`parse`/`format`) and at the DB boundary.
- **Rounding** is half-up and only inside `pct()`, `splitShares()`, `splitEven()` and `avgUnit()`
  (a display-only average to whole taka, D-056), plus the display-only `compact()` (chart axes)
  and `avgTaka()` (the Due trend's average), which round half away from zero (D-064).
  - `parse` rejects more than 2 decimals; it never rounds.
- **Lot cost** = `unit_cost × qty`. The user always types the unit cost.
- **The engine is pure:**
  - `src/lib/engine/*` has no I/O, no DB, no `Date.now()`; `asOf` is passed in;
  - plain arrays in, plain objects out.
- **Posting rules exist once:**
  - `postEntry(entry)` implements SRS §5 exactly; the engine and the form preview both call it;
  - a reversal = the same effects negated, in the reversal's own date/for_month;
  - on card bills (SRS §6.5, D-058) a reversed entry and its reversal both drop out once the
    reversal's date ≤ `asOf`; the balance still sums both.
- **Profit** counts in the month of sale (v1), or in its `for_month`. Don't build the v2
  "profit when the bill is paid" rule.
- **Tests:**
  - every posting rule and story S1–S18 has a test named with its TASKS.md id;
  - every scenario asserts the books-balance invariant through the one shared helper.
- **No real data** in this repo (D-069): every fixture and seed is fictional. Never `console.log`
  or snapshot real rows.
