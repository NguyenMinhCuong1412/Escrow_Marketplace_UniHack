# Project Agent Rules – Escrow Marketplace

This file contains short, always-on project constraints for Antigravity agents. Detailed domain rules live in `.agents/rules/`; repeatable procedures live in `.agents/skills/`.

## 1. Source of truth

1. Read `docs/context/PROJECT_BRIEF.md`, `PRODUCT_VISION.md`, `BUSINESS_REQUIREMENTS.md`, `TECH_STACK.md`, `DECISION_LOG.md`, `OPEN_QUESTIONS.md`, and `CURRENT_STATUS.md` before substantial work.
2. Treat an accepted decision in `DECISION_LOG.md` and explicit current instructions from the Project Owner as authoritative.
3. Distinguish `CONFIRMED`, `PROPOSED`, `UNKNOWN`, and `SUPERSEDED`. Never silently promote a proposal or inference into a requirement.
4. If sources conflict, stop and report the conflict; do not choose silently.

## 2. Scope and permissions

1. Default to read-only discovery. Modify application code only when a Task Specification explicitly authorizes implementation.
2. Do not broaden scope, redesign unrelated modules, rename/move large groups of files, or add dependencies without explaining the need and obtaining approval.
3. Do not delete files, rewrite Git history, force-push, reset another agent's work, or merge branches without explicit Project Owner approval.
4. Do not edit `README.md`, the existing `CLAUDE.md`, `.gitignore`, lockfiles, CI/deployment files, or environment configuration unless the task explicitly includes them.
5. Never read, print, copy, commit, or expose private keys, seed phrases, tokens, passwords, or `.env` values. Report the presence of a potential secret by file/path only; do not reproduce its value.

## 3. Engineering principles

- KISS and YAGNI first. Prefer the smallest maintainable solution that satisfies the approved requirement.
- Apply DRY and SOLID pragmatically; do not create abstractions without a demonstrated need.
- Preserve established conventions and dependencies. Inspect before introducing a framework, package, pattern, or new folder.
- Keep module boundaries explicit: `backend/`, `contracts/`, and `ai-pipeline/` must not become tightly coupled implementation details of one another.
- No fake success states. A UI, API, or report must not claim that a transaction or operation succeeded before its actual confirmation condition is met.

## 4. Parallel-agent safety

1. Every implementation task must declare owned files/directories and files that must not be edited.
2. Use isolated Git worktrees/branches for independent code-writing agents. Do not let multiple agents write into the same working tree concurrently.
3. Prefer one owner per module/task. A QA or security reviewer is read-only unless explicitly assigned test-file changes.
4. Do not merge merely because an agent says it is finished. Review the diff and verify the test evidence.

## 5. Escrow and blockchain safety

1. Do not use real funds, mainnet deployment, real private keys, or production credentials for development or demo work.
2. Use testnet/local-chain fixtures and clearly label simulated data.
3. AI output must never be the sole authority for releasing, refunding, or moving escrowed assets. AI may summarize evidence or assist a human reviewer; deterministic contract/business rules and authorized actors control financial state transitions.
4. Never assume a dispute, timeout, refund, fee, or arbitrator policy. Read the approved business requirements or raise an open question.
5. Treat wallet signatures, transaction submission, transaction confirmation, and indexed backend status as distinct states.

## 6. Verification and reporting

1. Before changes, inspect the current state and record the relevant baseline.
2. Run only relevant, documented checks. Do not install packages or change tool versions just to make a task run without approval.
3. Report exact commands, pass/fail/blocked/not-run status, and concise evidence. Never claim a test passed if it was not executed.
4. A task is not `DONE` until its acceptance criteria, tests, diff review, and documentation requirements are satisfied.
5. Update `CURRENT_STATUS.md`, `DECISION_LOG.md`, or `OPEN_QUESTIONS.md` only when the task changes those facts; retain provenance and dates.

## 7. Definition of Done

- Approved scope is implemented and no unrelated scope is included.
- Acceptance criteria are met with evidence.
- Relevant tests/checks pass, or unrun checks are explicitly listed as blockers.
- No known critical/high issue is silently left unresolved.
- Diff is reviewable and documentation/status is synchronized.
- Project Owner or explicitly delegated reviewer accepts the result.
