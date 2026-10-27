---
name: next-phase
description: Run one migration session (S1–S10) from docs/TASKS-NEST.md, porting each step from the read-only reference repo, test-first, ending with the phase gate and a stop for review.
argument-hint: "S<n>, e.g. S3"
disable-model-invocation: true
---

# Run a migration session from docs/TASKS-NEST.md

Session: `$ARGUMENTS`. If it is empty, use the session of the first unticked `N-` step.

The reference implementation is `D:/Projects/Mobile-Business-Lite`. It is **read-only**: never
write, run `supabase start` or build inside it. Its behavior is the target unless a D entry says
otherwise (D-068).

1. **Check first.**
   - **CI (once the repo has a remote, from N-0.6):** run `gh run list --branch dev -L 1`.
     - **Failed:** stop. Show the user the failing tests (`gh run view <id> --log-failed`) and
       their screenshots (`gh run download <id>` into the scratchpad). Fix them first, as a
       separate `fix(...)` change the user reviews (and commits) before any step.
     - **Still running:** go on, and add that commit's specs to this session's gate.
   - **Hotfixes:** if an `HF-n` step in `docs/TASKS-NEST.md` is unticked, do it first
     (`/next-task HF-n`).
   - Read the **Now**, **How to use** and **Definition of Done** blocks of `docs/TASKS-NEST.md`,
     then only this session's section (Grep `### Session S<n>`, then Read with offset/limit).
2. **Work the steps in order.** A session that stopped halfway resumes at its first unticked
   step. For each step:
   1. Read only its **Ref** files in the reference and its target files here. Run
      `git diff --no-index <ref file> <new file>` to see exactly what moved. Look up the D
      entries it names by id with Grep.
   2. **Alignment check:** if the Ref behavior, the docs and the step disagree, or a rule is
      ambiguous, stop and tell the user (then `/change-request`). Never guess on a business
      rule; anything beyond PRD §4 needs the user's OK.
   3. **Tests first:** write or port the step's U/I/E tests, using its ids in the test titles.
      Engine and integration scenarios keep asserting the books-balance invariant.
   4. **Implement** the smallest port that passes (KISS/DRY/YAGNI; files ≤ 500 lines, hard cap
      1000). Keep the reference's names, messages and numbers.
   5. Run **that step's own tests** (`npx vitest run <file>`,
      `E2E_THEMES=night_owl npx playwright test <spec>`). Don't pass `--reporter`; show only the
      failure tail.
   6. Run the denylist check (`docs/TASKS-NEST.md` → How to use). It must print nothing.
   7. Tick the step's subtasks, tests and the step itself, and add its results (counts, notes)
      under it.
   8. **Don't commit.** Leave the step as uncommitted changes. The user reviews first, then
      either says to commit or commits themselves. When asked, use one commit per step:
      `<type>(<scope>): <desc> (N-x.y)`.
3. **Delegate independent pieces to subagents on Sonnet** (`model: "sonnet"`). Examples: spec
   cleanup per file group, the per-screen `/views` endpoints, porting one integration file to the
   facade.
   - Give each one the step, its Ref paths, its target paths and the rules it must keep.
   - Use Opus only for pieces that need judgement: the write runner, auth, the render memo, the
     packaging spike, anything about posting rules or money.
   - Review every subagent's diff yourself before accepting it.
   - Only one process runs local DB tests (integration or E2E) at a time, and never while
     another session runs them (D-065).
4. **Phase gate** (at the end of the session):
   - `npm run typecheck`, `npm run lint`, the full `npm test`;
   - the phase's integration files (`npx vitest run tests/integration/<file>`);
   - the phase's E2E specs: `E2E_THEMES=night_owl npx playwright test <specs>` (360 + 1280);
   - the parity dump against the baseline (from N-1.1).
   - Report failures with their output; never tick a failing step.
5. **Stop for the user's review** and present:
   - the session's screenshots from `docs/TASKS-NEST.md` (360 + 1280, one theme);
   - the parity report;
   - the test counts;
   - a short "what changed / why" for each step, with the files it touched;
   - anything that deviated from the plan or the reference.
   Update **Now** in `docs/TASKS-NEST.md` (the session, the next session, any blocker).
6. **After the user approves** (make the changes they ask for first): commit only if they say
   so (or they commit themselves), push only when they say so, and give the CI run's link (`gh run list --branch dev -L 1`). Don't wait for it;
   the next session checks it. Suggest starting the next session in a new conversation with
   `/next-phase S<n+1>`.
