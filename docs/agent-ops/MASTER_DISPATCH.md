# MASTER DISPATCH — Antigravity Engineering Entry Point

> **Cách dùng:** Khi được yêu cầu thực hiện một Phase (ví dụ "PHASE 4F"), đọc file này → tìm Phase/Task tương ứng → kiểm tra bảng Active ownership → đọc các file được liệt kê → thực hiện theo `docs/agent-ops/TASK_DISPATCH_PROMPT.md` → ghi report theo `docs/agent-ops/TASK_TEMPLATE.md`.

---

## Bước khởi động (mỗi lần nhận task)

1. Đọc file `.agents/AGENTS.md` — thứ bậc ưu tiên nguồn sự thật và quy tắc bắt buộc cho mọi agent.
2. Đọc `.agents/rules/` — đặc biệt `.agents/rules/55-ai-authority.md` (ranh giới AI duy nhất) và `.agents/rules/90-git-docs.md` (nguồn duy nhất cho git & ownership).
3. Đọc `docs/agent-ops/TEST_MATRIX.md` — ma trận kiểm thử và lệnh chuẩn theo tier rủi ro (P0/P1/P2).
4. Đọc `docs/context/CURRENT_STATUS.md` — trạng thái code và test hiện tại.
5. Kiểm tra bảng **Active ownership** và **Phase Index** bên dưới để đảm bảo không trùng lặp quyền sở hữu file (theo .agents/rules/90-git-docs.md).
6. Đọc Task Specification tương ứng trong `docs/agent-ops/tasks/`.
7. Thực hiện theo `docs/agent-ops/TASK_DISPATCH_PROMPT.md`.
8. Khi xong, ghi report vào `docs/agent-ops/reports/<TASK_ID>-report.md`.

---

## Phase Index

| Phase | Task ID | Task Spec | Branch | Scope | Blocked by | Status |
|-------|---------|-----------|--------|-------|------------|--------|
| 3A | ESC-001..009 | *(completed)* | `add_ssrf_api_key_hardening` | `backend/` | — | MERGED (PR #1) |
| 4A | ESC-020 | `docs/agent-ops/tasks/ESC-020.md` | `phase/4a-frontend-scaffold` | `frontend/` (scaffold) | — | MERGED (PR #2) |
| 4B | ESC-030 | `docs/agent-ops/tasks/ESC-030.md` | `phase/4b-core-pages` | `frontend/app/` | ESC-020 | MERGED (PR #3) |
| 4C | ESC-040 | `docs/agent-ops/tasks/ESC-040.md` | `phase/4c-integration` | `frontend/` (integration) | ESC-030 | MERGED (PR #4) |
| 4D | — | — *(merged không có spec; QA hậu kiểm: pending)* | `phase/4d-auto-agent` | `backend/` | — | MERGED (PR #6) |
| 4E | — | — *(merged không có spec; QA hậu kiểm: pending)* | `phase/4e-qr-nonce` | `backend/`, `frontend/` | — | MERGED (PR #7) |
| 5 | ESC-050 | `docs/agent-ops/tasks/ESC-050.md` | `phase/5-deploy-fuji` | `contracts/script/` | — | MERGED (PR #5) |
| 4F | ESC-080 | `docs/agent-ops/tasks/ESC-080.md` | `phase/4f-listing-binding` | `backend/`, `contracts/`, `frontend/` | — | READY |
| 4F | ESC-090 | `docs/agent-ops/tasks/RULES_UPDATE_TASK_SPEC.md` | `ops/esc-090-rules-update` | `.agents/`, `CLAUDE.md`, `docs/agent-ops/` | — | IN_PROGRESS |
| 6 | ESC-060 | `docs/agent-ops/tasks/ESC-060.md` | *(read-only)* | READ-ONLY | Owner decisions (Q2, Q3) & ESC-080/090 | BLOCKED |
| 7 | ESC-070 | `docs/agent-ops/tasks/ESC-070.md` | `phase/7-submit` | `README.md`, docs | Phase 6 | BLOCKED |

---

## Active Ownership

| Task | Branch | Paths | Agent | Since |
|---|---|---|---|---|
| ESC-080 | phase/4f-listing-binding | backend/, contracts/, frontend/ | Claude Code / Antigravity | 2026-11-12 |
| ESC-090 | ops/esc-090-rules-update | .agents/**, CLAUDE.md, docs/agent-ops/** | Antigravity (Docs/Process) | 2026-11-12 |

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
| `docs/specs/FRONTEND_SPEC.md` | Frontend specification |
| `docs/specs/SLIDE_AND_VIDEO_SCRIPT.md` | Slide deck + video script (Phase 7) |

---

## Quy tắc quan trọng

- **Quy tắc Git & phân định quyền sở hữu:** Tham chiếu `.agents/rules/90-git-docs.md` (nguồn duy nhất). Mỗi writer có branch/worktree riêng; cấm sửa đè hoặc force-push.
- **Ranh giới quyền hạn AI:** Tham chiếu `.agents/rules/55-ai-authority.md` (nguồn duy nhất). AI Agent chỉ được phép ký và gửi giao dịch `attest()`.
- **Role matrix & Merge gate:** Tham chiếu `.agents/AGENTS.md §2a` và `§7`. Chỉ Project Owner có quyền merge PR (hoặc theo ngoại lệ fast-track đã duyệt).
- **Quy định Deploy:** Không deploy trừ khi Task Spec ghi `Deploy authorized: Yes` và Owner xác nhận trong phiên. Không bao giờ dùng mainnet hoặc tiền thật (DEC-003).
- **Không tự chốt quyết định PROPOSED:** Nếu gặp điểm chưa rõ hoặc quyết định mở (Q2–Q6, Q11, Q12) → chuyển trạng thái task sang `BLOCKED` và báo Owner.
- **Báo cáo kiểm thử chuẩn:** Tuân thủ `.agents/rules/80-testing.md`. Báo cáo test bắt buộc dán lệnh thực thi và dòng tổng kết có số lượng passed, failed, skipped. Test bị skip trong suite của module bị chạm ⇒ task `BLOCKED`.
- **Task Report bắt buộc:** Khi hoàn thành, tạo báo cáo tại `docs/agent-ops/reports/<TASK_ID>-report.md` theo định dạng chuẩn trong `docs/agent-ops/TASK_TEMPLATE.md`.

---

## Dependency Graph

```
Phase 3A (DONE) ────────────────────────────────────────────────────────┐
Phase 4A..4E (MERGED) ──────────────────────────────────────────────────┼──► Phase 4F (ESC-080 ∥ ESC-090) ──► Phase 6 (E2E) ──► Phase 7 (Submit)
Phase 5 (MERGED) ───────────────────────────────────────────────────────┘

Parallel OK: ESC-080 (code) ∥ ESC-090 (docs/rules) — scope hoàn toàn tách biệt
Sequential:  Phase 4F ──► Phase 6 (E2E integration & Release Gate) ──► Phase 7 (Final submit)
```

---

## Timeline & Milestones

- **Feature Freeze:** 16/11/2026 23:59 (giờ VN)
- **Nộp bài (Submission Deadline):** 21/11/2026 23:59 (giờ VN)
- **Demo Day:** 30/11/2026
