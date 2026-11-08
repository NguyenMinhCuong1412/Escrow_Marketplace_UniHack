---
name: implement-task
description: Implements one approved Escrow Marketplace task with explicit file ownership, isolated worktree, narrow scope, tests, and a reviewable handoff.
---

# Implement Task Skill

## Use when

An approved Task Specification is ready and an implementation agent is authorized to modify code.

## Procedure

1. Read `AGENTS.md`, the Task Specification, current status, decisions and applicable rules.
2. Verify the task is READY; check branch/worktree and clean baseline.
3. Confirm allowed files, forbidden files, dependencies, acceptance criteria and test commands.
4. If a business/security/architecture decision is missing, stop as BLOCKED.
5. Implement the smallest change that satisfies the task; no unrelated refactor or new dependency.
6. Add/update tests within scope.
7. Run relevant checks and record exact command/output status.
8. Review `git diff --check`, `git diff --stat`, and the full diff.
9. Update docs/status only if required by the task.
10. Do not merge/deploy. Return a task report for independent review.

## Output

Changed files, behavior, tests, results, known limitations, risks, and any required Owner decision.
