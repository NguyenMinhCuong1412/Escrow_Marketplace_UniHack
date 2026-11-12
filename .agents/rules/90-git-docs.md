---
trigger: model_decision
description: "Use for Git operations, folder structure, refactors, dependency changes, commits, and project documentation."
---

# Git, Structure and Documentation Rules

- **Nguồn Duy Nhất Cho Worktree & Single-Writer**:
  - Mỗi tác vụ viết code phải sử dụng branch và Git worktree độc lập.
  - Mỗi file tại một thời điểm chỉ do một agent duy nhất sở hữu (1 file = 1 writer).
  - Tuyệt đối không reset, force-push, rewrite history, xoá branch/worktree, hoặc merge PR khi chưa có phê duyệt của Project Owner.
- **Branch Naming**:
  - Tuân thủ chính xác tên trong Task Spec: `phase/<phase>-<slug>` cho tính năng nghiệp vụ, `ops/<task-id>-<slug>` cho quy trình/docs.
- **Active Ownership**:
  - Trước khi bắt đầu, agent phải kiểm tra bảng Active ownership trong `docs/agent-ops/MASTER_DISPATCH.md`. Nếu bất kỳ đường dẫn nào trong scope đang thuộc sở hữu của task khác ⇒ dừng `BLOCKED`.
- **Line Endings (CRLF Discipline on Windows)**:
  - So sánh `git diff --stat` với `git diff --ignore-cr-at-eol --stat`; chỉ stage file có thay đổi nội dung logic thực tế; tuyệt đối không commit file chỉ đổi CRLF.

## Doc-Sync Mapping Table
Khi thay đổi hệ thống, file tương ứng phải được cập nhật đồng thời trong PR (hoặc ghi vào report mục "Docs cần sync" nếu nằm ngoài scope Task Spec):

| Thay đổi | File phải cập nhật đồng thời |
|---|---|
| Endpoint, request, response backend | `docs/specs/FRONTEND_SPEC.md §4` |
| State transition, tham số contract | `docs/context/BUSINESS_REQUIREMENTS.md` + DEC |
| Thành phần AI pipeline, ngưỡng rủi ro | `docs/context/TECH_STACK.md` + DEC |
| Quyết định nghiệp vụ mới phát sinh | `docs/context/DECISION_LOG.md` (dòng `PROPOSED`) |
| Trạng thái tiến độ task | `docs/agent-ops/MASTER_DISPATCH.md` |