---
name: shoop-dev
description: Implement the next feature in the Shoop project backlog. Reads PLAN.md, identifies tasks, creates implementation plans, runs fresh-agent plan and code reviews, and manages state to survive session clears.
---

# Shoop Dev

Follow these steps exactly in order. Do not skip ahead. Do not combine steps.

---

## Story Classification

Before beginning any task, classify it as **Standard** or **Lightweight**. This determines which gate steps apply.

| Class           | When to use                                                                                                          | Gates skipped                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Standard**    | Feature work, data model changes, UI, routes, auth, integrations                                                     | None                                                    |
| **Lightweight** | Pure infrastructure, tooling config, dependency bumps, docs, assets, service worker / manifest changes with no logic | Steps 8, 9 (or run at `low` with no blocking threshold) |

State the classification and your reason at the end of Step 2 before proceeding to Step 3. If you are unsure, default to **Standard**.

---

## Task File Format

Every `tasks/active--*.md` file **must** begin with this frontmatter block. It is the single source of truth for resuming after a `/clear`.

```
---
step: <current step number, e.g. 6>
substep: <current substep number within the step, e.g. 3>
status: <one of: planning | plan_review | implementing | validating | security_review | code_review | final_checks>
class: <standard | lightweight>
e2e_required: <true | false>
clarifications: |
  <verbatim answers from the user to Step 3 questions, one per line>
---
```

**After completing each checkbox in Step 6, immediately write the updated file** with the new `substep` value. Do not batch updates — if the session clears, the last written state is the recovery point.

---

## Step 1 — Orient & Resume

1. Read `CLAUDE.md` to load project conventions.
2. Read `PLAN.md` to understand current project status.
3. Check `tasks/` for any existing `active--*.md` file.
    - **If an active task exists:** Surface it, ask the user if you should resume it. If approved, read the frontmatter to determine exactly which `step` and `substep` was last completed, and which `class` applies. Resume execution at the next logical substep, skipping any gates the class does not require.
    - **If no active task exists:** Proceed to Step 2.

---

## Step 2 — Identify the Next Task

1. Pick the **first uncompleted item** in the backlog from `PLAN.md`. State it clearly in one sentence.
2. Scan `docs/adr/` for ADRs relevant to this task's domain. Note any that will constrain the plan.
3. **Classify the task** as Standard or Lightweight using the table above. State the classification and your reason explicitly. Ask the user to confirm or override before continuing.

**Wait for the user's confirmation of the classification before proceeding.**

---

## Step 3 — Clarify Scope

Ask the user the minimum questions needed to avoid wasted work. Focus strictly on:

- Scope boundaries (what is explicitly OUT of scope)
- Unspecified UX/UI decisions
- Ambiguous integration points
- Whether additional documentation or ADRs are needed
- Whether this feature touches UI, routes, or canvas/gesture interaction (determines `e2e_required`)
- **Does this plan make any data model or API contract decisions that future stories will have to respect?** If yes, flag that an ADR will be drafted at wrap-up.

_For Lightweight tasks, these questions may be brief or skipped entirely if scope is unambiguous. State "Scope is unambiguous — no clarifications needed" and proceed._

**Wait for the user's answers (or acknowledgment that none are needed). Do not draft the plan yet.**

---

## Step 4 — Write the Plan

Using the user's answers and `CLAUDE.md`:

1. Identify any ADRs that constrain this feature. List them at the top of the plan under **Relevant ADRs**.
2. Use Context7 MCP to pull up-to-date docs **only for the specific library modules** you will touch. Do not re-fetch docs for libraries already loaded earlier in this session.
3. Draft a detailed implementation plan with a checkbox list.
    - **Standard tasks:** Include explicit, dedicated steps for unit/integration tests. If `e2e_required` is true, include a dedicated step for Playwright E2E tests.
    - **Lightweight tasks:** Include a smoke-test or manual verification step in place of full test coverage where automated testing is not applicable.
4. Save the plan to `tasks/active--<feature-name>.md`. The file must begin with the frontmatter block defined above, populated as follows:
    - `step: 4`
    - `substep: 4`
    - `status: planning`
    - `class:` set from Step 2 classification
    - `e2e_required:` set from the user's Step 3 answer
    - `clarifications:` verbatim answers from Step 3
5. Remove the feature from the backlog and add it to the active tasks list in `PLAN.md`.
6. Present a **3-bullet summary** to the user: what the plan covers, what's explicitly out of scope, and any open risks. For Standard tasks, also note any data model or API contract decisions spotted in Step 3 that will need an ADR at wrap-up.

**Wait for the user's reply before proceeding.**

---

## Step 5 — Plan Review

1. Review the implementation plan in `tasks/active--<feature-name>.md`. Find problems before code is written. Review for: missing edge cases, inadequate test coverage, risky assumptions, steps out of order, or silent failure points.
    - **Lightweight tasks:** Focus review on whether the change could silently break existing behavior or introduce config drift. Note if the task is truly isolated or if dependencies are understated.
    - Return a short, prioritized bulleted critique. If the plan is solid, say so explicitly.
2. Update the active plan file based on the review findings.
3. Update frontmatter: `step: 5`, `substep: 3`, `status: plan_review`.
4. Append to the plan body: `**Review**: Approved by fresh session. Ready to implement.`
5. Present the review output to the user and ask: "Does this updated plan look good to implement?"

**Wait for explicit approval before proceeding.**

---

## Step 6 — Implement

1. Execute the steps in `tasks/active--<feature-name>.md` in exact order.
2. **After completing each checkbox**, immediately update the file: check it off, and update frontmatter `substep` to match. Do not batch these writes.
3. Follow all `CLAUDE.md` conventions strictly.
4. If any migrations were added, pause and ask the user to run them before proceeding.
5. Once all implementation checkboxes are done, update frontmatter: `step: 6`, `status: validating`. Append to plan body: `**Status**: Implementation done. Ready for validation.`
6. Ask "Implementation complete. Are you ready to validate?"

**Wait for the user's reply before proceeding.**

---

## Step 7 — Validate

1. Run `npm run typecheck && npm run lint` as well as any individual tests written or updated during implementation. Fix all errors before continuing.
    - **Lightweight tasks:** If no automated tests apply, perform and document the manual verification step defined in the plan instead.
2. Once clean, update frontmatter: `step: 7`, `status: security_review`. Append to plan body: `**Status**: Validation passed. Ready for security review.`
3. Ask "Validation complete. Are you ready for the security review?"
    - **Lightweight tasks:** Append instead: "Validation complete. Lightweight task — skipping security and code review gates. Reply 'final checks' to proceed." Then jump directly to Step 10.

**Wait for the user's reply before proceeding.**

---

## Step 8 — Security Review _(Standard tasks only)_

1. Run `/security-review`. Fix any issues found.
2. Update frontmatter: `step: 8`, `status: security_review`.
3. Append to plan body: `**Status**: Security review done. Ready for code review.`
4. Say: "Security review complete. Reply 'code review' to proceed."

**Wait for the user's reply before proceeding.**

---

## Step 9 — Code Review _(Standard tasks only; Lightweight tasks run at `low` with no blocking threshold)_

1. Ask the user at what level `/code-review` should be run. Include a recommendation based on the scope of changes.

    | Option    | When to choose                                 |
    | --------- | ---------------------------------------------- |
    | `low`     | Trivial changes, config only                   |
    | `medium`  | Standard feature work                          |
    | `high`    | Core logic, data layer, auth                   |
    | `ultra`   | Security-critical or architecture-wide changes |
    | No review | Docs or assets only                            |

    For **Lightweight tasks**, default to `low` and note that no finding is blocking unless it reveals the task was misclassified as Lightweight.

    **Wait for the user's answer. Then** write `code_review_level: <chosen level>` to frontmatter before running the review. This ensures the level survives a `/clear` mid-step.

2. Unless "No review" was selected, run `/code-review [level]` on the working-tree diff.
3. Present the review output to the user.
4. **Standard tasks:** If blocking issues are found, fix them and restart from Step 8. The `step` frontmatter does not regress — note the re-review as an iteration in the plan body (e.g. `**Iteration 2**: Re-reviewed after fixes.`).
   **Lightweight tasks:** If any finding suggests the task actually touches logic, data models, or auth, re-classify as Standard, revert to Step 8, and note the reclassification in the plan body.
5. If clean, update frontmatter: `step: 9`, `status: code_review`.
6. Ask the user: "Implementation and reviews complete. Do you want to move on to final checks?"

**Wait for the user's reply before proceeding.**

---

## Step 10 — Final Checks

1. Ask the user if they want to proceed with a validation; if no, skip steps 2-4 and continue on step 5 (update frontmatter).
2. Run `npm run validate` (covers typecheck + lint + Vitest; does **not** run Playwright E2E).
3. If `e2e_required: true` in frontmatter, run the E2E suite: `npm run db:start` then `npm run test:e2e --workspace web-app`. Fix any failures.
4. If errors are found, fix them and repeat Step 9 (or Step 7 for Lightweight tasks).
5. If clean, update frontmatter: `step: 10`, `status: final_checks`. Say: "Final checks passed. Reply 'wrap up' to finalize."

**Wait for the user's reply before proceeding.**

---

## Step 11 — Wrap Up

1. **ADR check:** Review the completed diff. Ask whether this task introduced or settled any of the following:
    - A new library or third-party dependency
    - A pattern that will be reused (data fetching, error handling, component structure)
    - A deliberate rejection of an obvious alternative
    - A constraint future stories must respect (data model shape, API contract, naming convention)
    - For **greenfield projects specifically:** any decision in this task that locks in assumptions the next 3+ stories will inherit

    If yes, draft a new ADR in `docs/adr/ADR-NNN-<slug>.md` and present it to the user for approval before saving. If uncertain whether an ADR is warranted, ask the user. If no, state "No new ADR needed" and move on.

2. Update `PLAN.md`:
    - Delete anything currently under **Current Status**.
    - Add a one-line Conventional Commits message under **Current Status** that the user can copy.
    - Replace the Active task with `None.`

3. Rename `tasks/active--<feature-name>.md` → `tasks/complete--<feature-name>.md`.
