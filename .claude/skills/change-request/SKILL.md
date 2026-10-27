---
name: change-request
description: Record user feedback, a scope change, or a doc/code misalignment BEFORE changing any code. Use whenever the user gives feedback on behaviour or rules, asks for something new, or implementation reveals that the docs (PRD/SRS/UIDD) conflict, are ambiguous, or don't match reality.
argument-hint: "<what changed or what doesn't align>"
---

# Change request: docs first, then code

Input: `$ARGUMENTS`

1. **Investigate fully first (investigation mode).** Read the full affected docs (PRD/SRS/UIDD),
   the index at the top of `docs/DECISIONS.md` and every entry in the same area (by its title and
   Docs column; v1's are in `docs/DECISIONS-v1.md`), to catch conflicts with earlier decisions,
   and the related code.
   Then **restate** the change or misalignment in one or two sentences. Name the exact doc sections
   involved and quote the conflicting lines.
2. **Ask** the user clarifying questions until the rule is unambiguous. Give a recommended option.
   Never decide a business rule alone. Anything beyond PRD §4 needs the user's explicit OK.
3. **If a rule or decision changes:**
   1. Append `## D-NNN — Title (YYYY-MM-DD)` to `docs/DECISIONS.md` (next number; Source,
      Decision, Docs changed, Tasks), using the format at the top of that file: ≤ ~10 lines, the
      reason in short, the detail in the docs. Add its row to the index, and its id to the "Later
      changed by" of any decision it replaces or amends.
   2. Edit PRD/SRS/UIDD to state the new rule in their existing style. Keep the edits minimal.
4. **Add a task** `CR-NNN` under "Change requests" in `docs/TASKS.md`, using the template there:
   subtasks, U/I/E tests, acceptance, and a link to the D-NNN. If existing tasks are affected,
   note it in them (don't silently rewrite ticked tasks).
   **Migration track** (while `docs/TASKS-NEST.md` has unticked steps): add the `CR-NNN` task
   under "Change requests" in `docs/TASKS-NEST.md` instead, continuing TASKS.md's numbering.
   **AI track** (anything about the AI assistant): edit `docs/AI.md` instead of PRD/SRS/UIDD,
   and add an `AI-x.y` task to `docs/TASKS-AI.md` instead of a CR task.
5. **Stop and summarise** for the user: the D entry, the doc edits and the CR task. Implement
   only after that, via `/next-task CR-NNN`.
