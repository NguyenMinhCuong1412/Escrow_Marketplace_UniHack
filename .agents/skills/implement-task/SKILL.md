---
name: implement-task
description: Implements one approved Escrow Marketplace task with explicit file ownership, isolated worktree, narrow scope, tests, and a reviewable handoff.
---

# Implement Task Skill

## Use when

Khi một Task Specification đã ở trạng thái `READY` và agent được phân công (Antigravity hoặc Claude Code) được cấp quyền chỉnh sửa mã nguồn theo Role Matrix (`AGENTS.md §2a`).

## Procedure

1. **Context Freshness Check (`AGENTS.md §1`)**:
   - Đọc `AGENTS.md`, Task Specification, và các tài liệu liên quan trong `docs/context/`.
   - Kiểm tra header `Verified against commit` của các file context đối chiếu với commit `HEAD` hiện tại.
   - Nếu file context có header khác `HEAD` hoặc không có header → coi là "chưa xác minh" (unverified context), bắt buộc phải đối chiếu các claim quan trọng với code thực tế (`contracts/`, `backend/`, `ai-pipeline/`, `frontend/`) trước khi dùng (WR-01).
2. **Pre-flight & Workspace Verification**:
   - Xác nhận task có trạng thái `READY`.
   - Kiểm tra bảng Active ownership trong `docs/agent-ops/MASTER_DISPATCH.md` để đảm bảo các file trong scope không bị xung đột với task khác (`90-git-docs.md`).
   - Thiết lập branch và worktree riêng biệt: `phase/<phase>-<slug>` cho tính năng, `ops/<task-id>-<slug>` cho quy trình/docs.
3. **Scope & Precedence Confirmation**:
   - Xác nhận danh sách Allowed Files, Forbidden Files, Acceptance Criteria, và các ràng buộc kỹ thuật.
   - Tuân thủ thứ tự ưu tiên nguồn sự thật theo `AGENTS.md §0`. Nếu gặp mâu thuẫn hoặc thiếu quyết định nghiệp vụ (Q1–Q12) ⇒ dừng lại và báo `BLOCKED`.
4. **Minimal Implementation**:
   - Thực hiện thay đổi nhỏ nhất đủ để thỏa mãn các Acceptance Criteria (KISS/YAGNI).
   - Tuyệt đối không tự ý refactor code ngoài scope, không đổi tên/di chuyển file, và không thêm dependency mới khi chưa có phê duyệt của Owner.
   - Nếu chạm vào luồng attest, đối chiếu nghiêm ngặt với `55-ai-authority.md`.
5. **Apply `TEST_MATRIX.md` Rows**:
   - Đọc các dòng kiểm thử được chỉ định trong mục `TEST_MATRIX rows applied` của Task Specification.
   - Thực thi đầy đủ các tầng kiểm thử tương ứng theo Risk Tier (P0/P1/P2) của module bị tác động:
     * `contracts/`: `cd contracts && forge test` (kèm fuzz/invariant nếu thay đổi logic tài chính/state).
     * `backend/` & `ai-pipeline/`: `pytest -rs` từ thư mục gốc repo.
     * `frontend/`: `npm run build` và `npx tsc --noEmit` trong `frontend/`.
6. **Execute Skip Policy (`.agents/rules/80-testing.md`)**:
   - Khi chạy kiểm thử Python, bắt buộc dùng cờ `-rs`: `pytest -rs`.
   - Bắt buộc dán dòng tổng kết `N passed, M failed, K skipped` vào task report.
   - Đảm bảo số lượng test bị skip trong suite bắt buộc của module bị chạm là 0 (`skipped=0`). Nếu có test bị skip ⇒ task bị `BLOCKED`, không được báo PASS.
7. **CRLF Line-Ending Review on Windows (`.agents/rules/90-git-docs.md`)**:
   - So sánh `git diff --stat` với `git diff --ignore-cr-at-eol --stat`.
   - Chỉ stage các file có thay đổi logic thực tế; tuyệt đối không commit file chỉ bị đổi ký tự xuống dòng CRLF/LF.
   - Kiểm tra `git diff --check` để loại bỏ khoảng trắng thừa.
8. **Documentation Synchronization ("Docs cần sync")**:
   - Nếu thay đổi code làm thay đổi API contract, ABI, state contract, hoặc cấu hình AI pipeline:
   - Cập nhật các file tài liệu nằm trong scope cho phép của task.
   - Đối với các tài liệu liên quan nằm ngoài scope (thuộc quyền sở hữu của task doc-sync): bắt buộc ghi rõ danh sách file cần cập nhật vào mục "Docs cần sync" trong task report theo bảng mapping của `90-git-docs.md`.
9. **Final Verification & Report**:
   - Không tự ý merge PR hoặc deploy testnet (trừ khi Task Spec ghi `Deploy authorized: Yes` và Owner xác nhận trong phiên).
   - Tạo báo cáo nghiệm thu task tại: `docs/agent-ops/reports/<TASK_ID>-report.md`.
   - Chuyển trạng thái task sang `IN_REVIEW` để Cowork tiến hành QA Review độc lập theo `.agents/skills/qa-review/SKILL.md`.

## Output

Báo cáo nghiệm thu task tại `docs/agent-ops/reports/<TASK_ID>-report.md` bao gồm:
- Danh sách file thay đổi và diff tóm tắt.
- Bằng chứng nghiệm thu từng Acceptance Criterion (5 cột).
- Kết quả chạy kiểm thử thực tế kèm dòng tổng kết `N passed, M failed, K skipped`.
- Kết quả kiểm tra CRLF và whitespace.
- Mục "Docs cần sync" (nếu có tài liệu ngoài scope cần đồng bộ).
- Known limitations và các vi phạm đã biết được chạm vào (RISK_REGISTER IDs).
