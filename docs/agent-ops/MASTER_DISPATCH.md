# MASTER DISPATCH — Antigravity Engineering Entry Point

> **Cách dùng:** Khi được yêu cầu thực hiện một Phase (ví dụ "PHASE 4A"), đọc file này → tìm Phase tương ứng → đọc các file được liệt kê → thực hiện theo TASK_DISPATCH_PROMPT.md → ghi report.

---

## Bước khởi động (mỗi lần nhận task)

1. Đọc file `.agents/AGENTS.md` — quy tắc bắt buộc cho mọi agent.
2. Đọc `.agents/rules/` — domain rules chi tiết.
3. Đọc `docs/context/CURRENT_STATUS.md` — trạng thái hiện tại.
4. Tìm Phase được yêu cầu trong bảng bên dưới.
5. Đọc Task Specification tương ứng.
6. Thực hiện theo `docs/agent-ops/TASK_DISPATCH_PROMPT.md`.
7. Khi xong, ghi report vào `docs/agent-ops/reports/<TASK_ID>-report.md`.

---

## Phase Index

| Phase | Task ID | Task Spec | Branch | Scope | Blocked by | Status |
|-------|---------|-----------|--------|-------|------------|--------|
| 3A | ESC-001..009 | *(completed)* | `add_ssrf_api_key_hardening` | `backend/` | — | ✅ DONE |
| 4A | ESC-020 | `docs/agent-ops/tasks/ESC-020.md` | `phase/4a-scaffold` | `frontend/` (tạo mới) | — | READY |
| 4B | ESC-030 | `docs/agent-ops/tasks/ESC-030.md` | `phase/4b-pages` | `frontend/app/` | ESC-020 | BLOCKED |
| 4C | ESC-040 | `docs/agent-ops/tasks/ESC-040.md` | `phase/4c-integration` | `frontend/` (integration) | ESC-030 | BLOCKED |
| 5 | ESC-050 | `docs/agent-ops/tasks/ESC-050.md` | `phase/5-deploy-fuji` | `contracts/script/` | — | READY |
| 6 | ESC-060 | `docs/agent-ops/tasks/ESC-060.md` | *(read-only)* | READ-ONLY | 3A + 4C + 5 | BLOCKED |
| 7 | ESC-070 | `docs/agent-ops/tasks/ESC-070.md` | `phase/7-submit` | `README.md`, docs | Phase 6 | BLOCKED |

---

## Context files (đọc khi cần)

| File | Nội dung |
|------|----------|
| `docs/context/PROJECT_BRIEF.md` | Tổng quan dự án, team, timeline |
| `docs/context/BUSINESS_REQUIREMENTS.md` | Actors, luồng nghiệp vụ, state machine |
| `docs/context/TECH_STACK.md` | Framework, versions, test commands |
| `docs/context/CURRENT_STATUS.md` | Trạng thái code + test hiện tại |
| `docs/context/DECISION_LOG.md` | Quyết định kiến trúc (CONFIRMED/PROPOSED) |
| `docs/context/OPEN_QUESTIONS.md` | Câu hỏi còn mở |
| `docs/context/COMPETITION_CONTEXT.md` | Thể lệ cuộc thi, deadline, rubric |
| `docs/specs/FRONTEND_SPEC.md` | Frontend specification (Phase 4A/4B/4C) |
| `docs/specs/SLIDE_AND_VIDEO_SCRIPT.md` | Slide deck + video script (Phase 7) |

---

## Quy tắc quan trọng

- **1 file = 1 owner.** Không có 2 agent sửa cùng 1 file.
- **Không merge.** Chỉ commit trên branch của task. Project Owner merge.
- **Không deploy.** Phase 5 chuẩn bị script, Project Owner chạy deploy.
- **Không tự chốt quyết định PROPOSED.** Nếu gặp quyết định mở → BLOCKED + hỏi.
- **Report bắt buộc:** Khi hoàn thành, ghi `docs/agent-ops/reports/<TASK_ID>-report.md` với:
  - Preflight check (scope, dependencies)
  - Kết quả từng acceptance criterion
  - Test evidence (full output)
  - File diff summary
  - Các quyết định PROPOSED (nếu có)

---

## Dependency Graph

```
Phase 3A ──────────────────────────────────────┐
  (DONE)                                       │
                                               ▼
Phase 4A ──► Phase 4B ──► Phase 4C ──────► Phase 6 ──► Phase 7
(scaffold)   (pages)      (integration)    (E2E test)   (submit)
                                               ▲
Phase 5 ──────────────────────────────────────┘
(deploy)

Parallel OK: 4A ∥ 5 (khác module hoàn toàn)
Sequential:  4A → 4B → 4C (cùng frontend/)
```

---

## Deadline

- **Nộp bài: 21/11/2026 23:59 (giờ VN)**
- **Demo Day: 30/11/2026**
- Còn **13 ngày** tính từ 08/11/2026.
