---
trigger: model_decision
description: "Use when adding/running tests, validating changes, reviewing regressions, or defining quality gates."
---

# Testing Rules

- Use the repository's existing test runner and documented commands; do not add a second framework without approval.
- For Python code, use pytest if confirmed by repository config.
- Cover happy path, invalid inputs, unauthorized access, failure handling and regression cases proportional to risk.
- Contract tests must cover state transitions and prohibited transitions, including duplicate release/refund where relevant.
- Integration tests must check API/contract/AI boundary assumptions.
- Avoid flaky tests, real external dependencies and real funds; use deterministic fixtures/mocks/local chain as suitable.
- Do not alter expected outputs merely to silence a failing test.
- Report exact command, environment, result, skipped tests and limitations. Use PASS/FAIL/BLOCKED/NOT RUN.
