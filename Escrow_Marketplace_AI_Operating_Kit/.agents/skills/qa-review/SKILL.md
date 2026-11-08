---
name: qa-review
description: Independently reviews a task diff and test evidence against acceptance criteria, including regression, escrow state, transaction and security edge cases.
---

# QA Review Skill

## Use when

A task is in IN_REVIEW or the Project Owner asks for independent acceptance review.

## Procedure

1. Read task requirements, acceptance criteria and relevant context/rules.
2. Inspect the exact branch/worktree and full diff.
3. Check scope ownership and unrelated changes.
4. Verify test evidence; rerun approved tests if appropriate.
5. Review happy path, negative path, authorization, error handling and regression risks.
6. For contracts, review state transitions, funds accounting, access control and duplicate actions.
7. For AI pipeline, review untrusted content boundaries and prohibited asset-moving authority.
8. Report findings with severity, path/line, impact and actionable remediation.
9. Return ACCEPT, CHANGES_REQUESTED or BLOCKED. Do not alter production code as reviewer.

## Output

Review scope, checks run, findings, tests not run, limitations, and decision.
