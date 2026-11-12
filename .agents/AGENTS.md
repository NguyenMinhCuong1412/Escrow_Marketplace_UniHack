# Project Agent Rules – Escrow Marketplace

This file contains short, always-on project constraints for Antigravity agents. Detailed domain rules live in `.agents/rules/`; repeatable procedures live in `.agents/skills/`.

## 0. Precedence

1. Chỉ thị hiện tại của Project Owner (quyết định bền vững phải được ghi thành DEC).
2. `docs/context/DECISION_LOG.md` — dòng `CONFIRMED`.
3. Contract đã deploy (`contracts/deployments/43113.json`) và code trên `main` — cho câu hỏi "hệ thống đang làm gì".
4. `docs/context/BUSINESS_REQUIREMENTS.md` → `docs/context/PRODUCT_VISION.md` → `docs/context/TECH_STACK.md`.
5. `docs/specs/*`. 6. Task Spec (`docs/agent-ops/tasks/*`). 7. Reports (`docs/agent-ops/reports/*`) (chỉ là bằng chứng, không phải yêu cầu).
- Khi (3) lệch (2)/(4): **báo lệch trong report, không tự sửa** docs nghiệp vụ hay code để "khớp". Nếu lệch chặn được task → `BLOCKED`.

## 1. Source of truth

1. Read `docs/context/PROJECT_BRIEF.md`, `PRODUCT_VISION.md`, `BUSINESS_REQUIREMENTS.md`, `TECH_STACK.md`, `DECISION_LOG.md`, `OPEN_QUESTIONS.md`, and `CURRENT_STATUS.md` before substantial work.
2. Treat an accepted decision in `DECISION_LOG.md` and explicit current instructions from the Project Owner as authoritative.
3. Distinguish `CONFIRMED`, `PROPOSED`, `UNKNOWN`, and `SUPERSEDED`. Never silently promote a proposal or inference into a requirement.
4. If sources conflict, stop and report the conflict; do not choose silently.
5. Context freshness: Nếu file context có header `Verified against commit` khác `HEAD` hoặc không có header → coi là "chưa xác minh", đối chiếu claim quan trọng với code trước khi dùng (WR-01).
6. Decision governance: Agent chỉ được đề xuất DEC với status `PROPOSED`. DEC tạo trong cùng commit với code phải là `PROPOSED`; chỉ Owner được duyệt `CONFIRMED`/`SUPERSEDED` (MR-16).

## 2. Scope and permissions

1. Default to read-only discovery. Modify application code only when a Task Specification explicitly authorizes implementation.
2. Do not broaden scope, redesign unrelated modules, rename/move large groups of files, or add dependencies without explaining the need and obtaining approval.
3. Do not delete files, rewrite Git history, force-push, reset another agent's work, or merge branches without explicit Project Owner approval.
4. Do not edit `README.md`, `CLAUDE.md`, `.gitignore`, lockfiles, CI/deployment files, or environment configuration unless the task explicitly includes them.
5. Never read, print, copy, commit, or expose private keys, seed phrases, tokens, passwords, or `.env` values. Report the presence of a potential secret by file/path only; do not reproduce its value.

## 2a. Role matrix

| Hành động | Project Owner | Antigravity | Claude Code | Cowork |
|---|---|---|---|---|
| Đọc repo | ✓ | ✓ | ✓ | ✓ |
| Sửa application code | ✓ | ✓ khi có Task Spec `READY` | ✓ khi có Task Spec `READY` | ✗ |
| Viết Task Spec, QA report, Release Gate report | ✓ | ✗ | ✗ | ✓ |
| Sửa `.agents/**`, `CLAUDE.md` | ✓ | ✓ chỉ khi Task Spec có trong scope | ✓ chỉ khi Task Spec có trong scope | ✗ (chỉ đề xuất) |
| Sửa `docs/context/**` (trừ Decision Log) | ✓ | ✓ chỉ khi Task Spec có trong scope | ✓ chỉ khi Task Spec có trong scope | ✗ |
| Ghi dòng `CONFIRMED`/`SUPERSEDED` trong `DECISION_LOG.md` | ✓ duy nhất | ✗ (chỉ thêm dòng `PROPOSED`) | ✗ (chỉ thêm dòng `PROPOSED`) | ✗ |
| Merge PR | ✓ duy nhất | ✗ | ✗ | ✗ |
| Deploy testnet | ✓ | chỉ khi Spec ghi `Deploy authorized: Yes` và Owner xác nhận trong phiên | như Antigravity | ✗ |
| Mainnet / tiền thật | ✗ (DEC-003) | ✗ | ✗ | ✗ |

## 3. Engineering principles

- KISS and YAGNI first. Prefer the smallest maintainable solution that satisfies the approved requirement.
- Apply DRY and SOLID pragmatically; do not create abstractions without a demonstrated need.
- Preserve established conventions and dependencies. Inspect before introducing a framework, package, pattern, or new folder.
- Keep module boundaries explicit: `backend/`, `contracts/`, `ai-pipeline/`, and `frontend/` must not become tightly coupled.
- No fake success states. An API or report must not claim that an operation succeeded before its actual confirmation condition is met.

## 4. Parallel-agent safety

Quy tắc an toàn làm việc song song, git worktree và phân định quyền sở hữu: xem `.agents/rules/90-git-docs.md` (nguồn duy nhất).

## 5. Escrow and blockchain safety

1. Do not use real funds, mainnet deployment, real private keys, or production credentials for development or demo work.
2. Use testnet/local-chain fixtures and clearly label simulated data.
3. Quyền hạn của AI Agent trên escrow: xem `.agents/rules/55-ai-authority.md` (nguồn duy nhất).
4. Never assume a dispute, timeout, refund, fee, or arbitrator policy. Read the approved business requirements or raise an open question.
5. Treat wallet signatures, transaction submission, transaction confirmation, and indexed backend status as distinct states.

## 6. Verification and reporting

1. Before changes, inspect current state and record baseline. Run only relevant, documented checks. Do not change tool versions without approval.
2. Report exact commands, pass/fail/blocked/not-run status, and concise evidence. Never claim a test passed if not executed.
3. Skip policy: xem `.agents/rules/80-testing.md`.
4. Vi phạm đã biết: Vi phạm có sẵn trong code được ghi ở `docs/agent-ops/RISK_REGISTER.md` không làm task khác bị BLOCKED nếu task không có scope sửa nó, nhưng task không được làm vi phạm đó tệ hơn.
5. A task is not DONE until acceptance criteria, tests, diff review, and documentation requirements are satisfied.
6. Update `CURRENT_STATUS.md`, `DECISION_LOG.md`, or `OPEN_QUESTIONS.md` only when the task changes those facts; retain provenance and dates.

## 7. Definition of Done

- Approved scope is implemented and no unrelated scope is included.
- Acceptance criteria are met with evidence; relevant tests pass, or unrun checks are explicitly listed as blockers.
- No known critical/high issue is silently left unresolved. Diff is reviewable and documentation is synchronized.
- Merge gate: Không merge khi chưa có `docs/agent-ops/reports/<TASK_ID>-qa-report.md` với verdict `ACCEPT` hoặc `ACCEPT WITH LIMITATIONS`. Ngoại lệ fast-track: PR ghi `Fast-track approved by Owner`, và QA report hậu kiểm phải có trong 24 giờ sau merge.