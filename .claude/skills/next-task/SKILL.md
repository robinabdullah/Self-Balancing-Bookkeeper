---
name: next-task
description: Implement the next task (or a given task id) from docs/TASKS.md, test-first, following the docs exactly.
argument-hint: "[task-id, e.g. 2.4]"
disable-model-invocation: true
---

# Implement a task from docs/TASKS.md

Task: `$ARGUMENTS` (if empty, use the first unchecked `[ ]` task in the earliest unfinished phase).

**AI track:** an id starting with `AI-` (e.g. `AI-1.2`) lives in `docs/TASKS-AI.md` and its spec
is `docs/AI.md`. Use those two files wherever the steps below say `docs/TASKS.md` or PRD/SRS/UIDD,
and also meet that file's own Definition of Done.

**Migration track (D-068):** an id starting with `HF-` or `N-`, or a CR added during the migration,
lives in `docs/TASKS-NEST.md`. Use that file wherever the steps below say `docs/TASKS.md`, and meet
its Definition of Done. Before any other task, do an unticked `HF-n` first. Its **Ref** is a commit
in the read-only reference repo (`git -C D:/Projects/Mobile-Business-Lite show <sha>`); never write
there. Whole sessions of `N-` steps run with `/next-phase S<n>`.

1. **Read the task (flow mode: targeted reads).**
   - **Check CI first (D-065):** `gh run list --branch dev -L 1`.
     - **Failed:** stop. Show the user the failing tests (`gh run view <id> --log-failed`) and their
       screenshots (`gh run download <id>` into the scratchpad). Fix them in a small `fix(...)`
       commit before this task's commit.
     - **Still running:** go on. If this task changes files the unchecked commit changed, also run
       that commit's specs in step 5.
   - Read the **Now** and **Definition of Done** blocks at the top of `docs/TASKS.md`.
   - Then read only this task's section: Grep for its id, then Read with offset/limit. It gives
     the subtasks, tests, acceptance and **Refs**.
   - Read only the cited PRD/SRS/UIDD sections the same way (Grep the heading, Read a range).
     Look up the D entries it names by id with Grep.
   - While in flow, don't read a whole spec, TASKS.md or DECISIONS.md. Finished v1.1 CRs are in
     `docs/TASKS-v1.1-done.md`; read one there only when it is cited.
   - Check the branch: work directly on `dev` (local `main` until N-0.6 creates `dev`).
2. **Alignment check — before writing code.** If something looks off, or a failure isn't
   obvious, switch to **investigation mode**:
   - read the full related docs (PRD/SRS/UIDD as needed, plus the DECISIONS.md index and every
     entry in the same area) and the related code;
   - then decide.
   Stop and report to the user (then use `/change-request`) if:
   - the cited docs contradict each other or the task;
   - a rule is ambiguous, or a needed rule is missing;
   - the existing code already differs from the docs;
   - the task would need something beyond PRD §4.
   Never guess on a business rule.
3. **Tests first:** write the task's listed U/I/E tests, using the ids from TASKS.md in the test
   names. Engine and integration scenarios must assert the books-balance invariant. Add them to
   the feature's file (named by feature, e.g. `charts-money.spec.ts`, never by CR or phase); the
   CR/test ids go in the test titles (D-066).
4. **Implement the smallest code that passes** (KISS/DRY/YAGNI; files ≤ 500 lines, hard cap
   1000). Reuse `money.ts`, `dates.ts`, `postEntry`, `guards.ts` and the action helper. Don't
   duplicate them.
5. **Verify:**
   - While working, run only this task's test files: `npx vitest run <file>` or
     `npx playwright test <spec>`. Don't pass `--reporter`: Vitest picks its compact agent
     reporter and the Playwright config picks `dot` under Claude Code; both print failures in full.
     Show only the failure tail.
   - Once per task, run its own E2E spec with `--reporter=list` to confirm each task test id ran
     (passed, not skipped) on both viewports. `dot` shows skips only as a count.
   - **Before ticking (the local gate, D-065):**
     - `npm run typecheck`, `npm run lint` and the full `npm test`;
     - the task's own integration file(s) (`npx vitest run tests/integration/<file>`), if it has
       any;
     - E2E in one theme, at both sizes: `E2E_THEMES=night_owl npx playwright test <the task's
       specs> <the touched screens' specs>`, plus its a11y tests with
       `tests/e2e/a11y.spec.ts --grep "<task id>"`.
       - A task that adds pages gives them their own a11y test named with its id.
       - A task that changes themes or globals also runs the theme specs in every theme
         (`ui-dark`, `shell`, `a11y`).
   - **Don't run the full suites per task;** CI runs them on each push. Run the full
     `npm run test:e2e` locally only when the user asks, or before a deploy when CI isn't green
     on that commit.
   - Never run local DB tests (integration or E2E) while another session runs them: they share one
     local DB.
   - Report failures with their output; never tick a failing task.
6. **Tick** the subtasks, tests and task `[x]` in `docs/TASKS.md` only when the Definition of
   Done and the acceptance criteria are met.
7. **Update Now** in `docs/TASKS.md` by its rule (TASKS → How to use): add the task to "On `dev`",
   set the next task and any blocker. Results go in the task, not in Now.
8. **Report:** what was built, the test results, anything that didn't align, and the next task.
   Suggest `/clear` before the next task. Don't commit unless the user asks.
   - On the user's "commit" for an approved task on `dev`: commit **and push** to `origin/dev`
     (D-065), then give the CI run's link (`gh run list --branch dev -L 1`). Don't wait for it;
     the next `/next-task` checks it.
