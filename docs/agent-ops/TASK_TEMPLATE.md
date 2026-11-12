# Task Specification

> Mỗi implementation task phải được điền đủ theo mẫu này trước khi dispatch cho Antigravity hoặc Claude Code.
> Nguồn quản trị quy trình: `.agents/AGENTS.md`, `.agents/rules/90-git-docs.md`, `docs/agent-ops/TEST_MATRIX.md`.

## Metadata

- **Task ID:** `ESC-XXX`
- **Title:**
- **Priority:** P0 / P1 / P2 / P3
- **Status:** DRAFT / READY / IN_PROGRESS / IN_REVIEW / ACCEPTED / MERGED *(Lưu ý: Trạng thái thực tế được quản lý và theo dõi tập trung tại `docs/agent-ops/MASTER_DISPATCH.md`)*
- **Deploy authorized:** Yes / No *(Bắt buộc; chỉ deploy testnet khi ghi Yes và được Owner xác nhận trong phiên)*
- **Risk tier:** P0 / P1 / P2 *(P0: tiền/quyền/state on-chain; P1: quyết định AI/auth/attest; P2: UI/docs theo TEST_MATRIX)*
- **Requested by:** Cowork / Project Owner
- **Assigned role:**
- **Branch/worktree:**
- **Related decision:** DEC-XXX hoặc N/A

## Context

Mô tả vấn đề và lý do cần thực hiện. Liên kết các tài liệu context/architecture liên quan.

## Goal

Kết quả quan sát và kiểm chứng được sau khi hoàn thành.

## Scope – allowed files/paths

- `path/allowed/`

## Out of scope – do not edit

- `path/not-allowed/`
- Không sửa application code ngoài các path được liệt kê ở Scope.
- Không thêm dependency/framework mới nếu chưa được phê duyệt.
- Không thay đổi public API/state transition ngoài yêu cầu đã phê duyệt.

## Dependencies

- Task/decision/module cần hoàn thành trước:

## Acceptance Criteria

| ID | Tiêu chí | Traces | Verification method | Evidence artifact |
|---|---|---|---|---|
| AC-01 | [Mô tả tiêu chí nghiệm thu rõ ràng, đo lường được] | [REQ-ID hoặc mục BR/DEC] | [Lệnh/script/phương pháp kiểm tra độc lập] | [File log, output test, diff artifact] |
| AC-02 | | | | |

## Test Requirements

- **TEST_MATRIX rows applied:** [Ghi rõ các dòng/module áp dụng từ `docs/agent-ops/TEST_MATRIX.md`]
- **Skip policy:** Bắt buộc tuân thủ `.agents/rules/80-testing.md`: chạy pytest với `-rs`; không cho phép bất kỳ test nào bị skip trong suite của module bị chạm (skip > 0 ⇒ task BLOCKED).
- **Unit:**
- **Integration:**
- **Contract/API / Golden-file Parity:**
- **Regression:**
- **Security review required?** Yes / No – Lý do: *(Bắt buộc **Yes** nếu task chạm vào `contracts/src/**`, `backend/attest_service.py`, `backend/auto_agent.py`, `backend/chain.py`, `frontend/app/api/**`, hoặc file cấu hình môi trường / env)*

## Implementation constraints

- Đọc `.agents/AGENTS.md`, `.agents/rules/55-ai-authority.md`, `.agents/rules/80-testing.md`, `.agents/rules/90-git-docs.md` và domain rules liên quan trước khi thực hiện.
- Phân định quyền sở hữu file: tham chiếu `.agents/rules/90-git-docs.md` (nguồn duy nhất).
- Thiết lập worktree/branch riêng cho mỗi task theo `.agents/rules/90-git-docs.md`.
- Không tự ý deploy; không sử dụng mainnet hoặc tiền thật (DEC-003).

## Deliverables

- **Files changed:** [Bảng ánh xạ từng file ↔ mục scope/tiêu chuẩn]
- **Diff/commit:**
- **Tests run (lệnh thực thi + output tổng kết passed/failed/skipped):**
- **Known violations touched (RISK_REGISTER IDs):** [Liệt kê ID finding từ `docs/agent-ops/RISK_REGISTER.md` bị chạm hoặc xử lý]
- **Docs cần sync:** [Liệt kê tài liệu context/specs cần cập nhật sau task nếu có]
- **Known limitations:**
- **Docs/status updated:** [Cập nhật tại `docs/agent-ops/MASTER_DISPATCH.md`]

## Review outcome

- **Reviewer:** Cowork (thực hiện theo `.agents/skills/qa-review/SKILL.md`)
- **Result:** ACCEPT / ACCEPT WITH LIMITATIONS / CHANGES_REQUESTED / BLOCKED
- **Commands rerun by reviewer:**
- **Findings:**
- **Owner approval:**
