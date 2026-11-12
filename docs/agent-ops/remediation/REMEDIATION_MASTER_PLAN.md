# REMEDIATION MASTER PLAN — Escrow Marketplace

| Mục | Giá trị |
|---|---|
| Ngày lập | 2026-11-12 |
| Lập bởi | Cowork (Technical Lead / Task Planner) |
| Nguồn | [docs/audit/REPORT_VALIDATION_AND_REMEDIATION_PLAN.md](../../audit/REPORT_VALIDATION_AND_REMEDIATION_PLAN.md) (thẩm định độc lập 2 báo cáo audit) |
| Baseline | `ops/esc-090-rules-update` @ `e5c2123`; code = `main` @ `e29487b` |
| Mốc | Feature freeze **16/11/2026** · Nộp bài **21/11/2026 23:59** · Demo Day 30/11/2026 |

> Task Spec trong thư mục này dùng định dạng 10 mục (Metadata → Completion Report), tương thích [TASK_TEMPLATE.md](../TASK_TEMPLATE.md). Không dispatch bất kỳ đề xuất `ESC-080..085` nào trong `FULL_PROJECT_AUDIT_REPORT.md`; mã đó trùng với ESC-080 thật và dựa trên code không tồn tại.

---

## 1. Executive summary

- Đã thẩm định **80 finding**: 49 từ AGENT_RULES audit, 25 từ FULL audit, 6 phát hiện mới.
  - 32 `VERIFIED`, 5 `PARTIALLY_VERIFIED`, 6 `FALSE_POSITIVE`, 13 `OUTDATED`, 11 `DUPLICATE`, 3 `BLOCKED`, 10 `NEEDS_OWNER_DECISION`.
- **FULL_PROJECT_AUDIT_REPORT không dùng được làm bằng chứng.** Nhiều đoạn code trích dẫn không tồn tại (xem mục 2 của báo cáo thẩm định). Các kết luận đúng của nó đều trùng với AGENT_RULES audit.
- **P0 duy nhất là SEC-01.** Đã có spec [ESC-080](../tasks/ESC-080.md) READY, chưa thực hiện, nên là **việc đầu tiên**.
- Bộ task tối thiểu gồm **8 Task Spec mới**:
  - 6 task code hoặc test (TASK-001..006);
  - 1 task tài liệu (TASK-007);
  - 1 task bị chặn chờ Owner (TASK-008).
- Không task nào đổi `contracts/src/`, nên **không cần redeploy contract**.

## 2. Sức khoẻ tổng thể

| Module | Mức | Ghi chú |
|---|---|---|
| Contracts | Tốt | Không phát hiện lỗi logic tiền. Rủi ro còn lại là thiết kế (PC-02, SEC-03/04), đang chờ Owner |
| Backend | Trung bình | SEC-01 (P0), fail-open (P1), lộ lỗi, độ bền report |
| AI pipeline | Trung bình | Kiểm tra tái sử dụng video; chưa có số đo |
| Frontend | Trung bình | Thiếu khôi phục URI; mock IPFS; 0 test |
| Docs/Process | Yếu → đang cải thiện | ESC-090 chờ QA; docs/context lỗi thời; claim pitch chờ Owner |

## 3. Finding hợp lệ cần hành động

| Finding | Mức | Module | Xử lý |
|---|---|---|---|
| SEC-01 | P0 | backend, frontend | ESC-080 |
| SEC-08 | P1 | backend, frontend | ESC-080 |
| SEC-02, SEC-06, SE-05 | P1/P2 | backend (+ proxy Next.js) | TASK-001 |
| NEW-02, SEC-05 | P1/P2 | frontend | TASK-002 |
| NEW-01, FPA-05, TST-07 | P2/P3 | backend | TASK-003 |
| FPA-06 | P2 | ai-pipeline | TASK-004 |
| TST-04 (+ ghi nhận SEC-04) | P2 | contracts/test | TASK-005 |
| TST-06 | P2 | ai-pipeline | TASK-006 |
| RA-03, PC-01, PC-04, PC-06, PC-07, PC-08, PC-09, SE-02, SE-06 | P2/P3 | docs | TASK-007 |
| PC-02, PC-03, PC-05 | P1 | docs, frontend copy | TASK-008 (BLOCKED) |
| TST-03 | P2 | frontend | `errors.ts` → ESC-080; lint/test → OD-08 |
| SE-01, TST-08, NEW-05 | P2/P3 | process | Cowork QA (không phải Antigravity) |

## 4. False positive và finding lỗi thời

- **FALSE_POSITIVE (6):**
  - FPA-13: video 0 khung không gây `IndexError`.
  - FPA-14: không có timeout 24h cho `cancelUnfunded`.
  - FPA-15: không có `claimExpiredEvidence`.
  - FPA-16: auto agent đã có exponential backoff.
  - FPA-21: thiếu `node_modules` là trạng thái môi trường, không phải lỗi.
  - FPA-23: đã có `WrongChainBanner`.
- **OUTDATED (13):** RA-01, RA-02, RA-06, RA-08, RA-09, SEC-10, TST-01, TST-02, QA-01..QA-05. Các finding này đã được sửa bằng DEC-014..017 trên `main` và ESC-090 trên nhánh. **Điều kiện:** ESC-090 phải qua QA và merge thì mới coi là đóng.
- **DUPLICATE (11):** FPA-01, 02, 03, 09, 10, 11, 12, 17, 19, 20, 25. Đã gộp vào finding gốc.

## 5. Phát hiện mới

| ID | Status | Mức | Tóm tắt | Xử lý |
|---|---|---|---|---|
| NEW-01 | VERIFIED | P2 | Report/pHash mất khi chờ receipt lỗi sau broadcast | TASK-003 |
| NEW-02 | VERIFIED | P1 | Không khôi phục được URI bằng chứng → trade kẹt `waiting_uris` | TASK-002 |
| NEW-03 | NEEDS_OWNER_DECISION | P2 | Listing không neo on-chain lúc tạo trade | OD-07 |
| NEW-04 | NEEDS_OWNER_DECISION | P3 | Farm reputation bằng self-trade ảnh hưởng điểm rủi ro AI | OD-04 |
| NEW-05 | VERIFIED | P3 | MASTER_DISPATCH ghi `contracts/` vào scope ESC-080 | Cowork sửa khi QA ESC-090 |
| NEW-06 | VERIFIED | P2 | FULL audit có bằng chứng không tồn tại + mã task trùng | Owner chú thích/superseded |

## 6. Phân nhóm theo ưu tiên

### P0 — Critical

| Mục | Nội dung |
|---|---|
| Finding | SEC-01 (+ SEC-08, TST-03 `errors.ts` đi kèm) |
| Module | `backend/attest_service.py`, `backend/auto_agent.py`, frontend (`VerifyProgress`, `AgentStatusCard`, `lib/backend.ts`, `lib/errors.ts`…) |
| Root cause | RC-1: input của AI không được neo |
| Dependency | Không |
| Thứ tự | 1 |
| Cần Owner | Đã duyệt (DEC-016, DEC-017) |
| Spec | [ESC-080](../tasks/ESC-080.md) |

### P1 — High

| Task | Finding | Module | Root cause | Dependency | Cần Owner |
|---|---|---|---|---|---|
| [TASK-001](TASK-001-backend-security-config-hardening.md) | SEC-02, SEC-06, SE-05 | backend + 2 proxy route | RC-2 | ESC-080 merged (cùng file `attest_service.py`, `backend/tests/*`) | Không |
| [TASK-002](TASK-002-frontend-evidence-uri-recovery.md) | NEW-02, SEC-05 | frontend | RC-3, RC-2 | ESC-080 merged (cùng `AgentStatusCard.tsx`) | Không |
| [TASK-008](TASK-008-pitch-claims-alignment.md) | PC-02, PC-03, PC-05 | docs + chuỗi hiển thị frontend | RC-6 | OD-01, OD-02, OD-04; TASK-007 (cùng file docs) | **Có — BLOCKED** |

### P2 — Medium

| Task | Finding | Module | Root cause | Dependency | Cần Owner |
|---|---|---|---|---|---|
| [TASK-003](TASK-003-backend-attest-durability.md) | NEW-01, FPA-05, TST-07 | backend | RC-3 | TASK-001 merged (cùng file) | Không |
| [TASK-004](TASK-004-ai-buyer-video-reuse-check.md) | FPA-06 | ai-pipeline | RC-4 | Không (song song ESC-080) | Không |
| [TASK-005](TASK-005-contract-invariant-boundary-tests.md) | TST-04, ghi nhận SEC-04 | contracts/test | Thiếu phủ test | Không | Không |
| [TASK-006](TASK-006-ai-evaluation-harness.md) | TST-06 | ai-pipeline (thư mục mới `eval/`) | RC-4 | TASK-004 merged; **bộ dữ liệu do Owner cung cấp** | Cung cấp dữ liệu |
| [TASK-007](TASK-007-docs-context-sync.md) | RA-03, PC-01/04/06/07/08/09, SE-02, SE-06 | docs/context, docs/specs, README | RC-5 | ESC-090 merged (rules làm căn cứ) | Không |

### P3 — Low (không tạo task trước nộp bài)

FPA-04 (`TP1:`), FPA-08 (DNS rebinding), FPA-18, RA-05, RA-07, SE-03, SE-07, simulateContract (TST-03 phần còn lại). Ghi vào `RISK_REGISTER.md` dưới dạng Known Limitation khi Cowork cập nhật sau QA.

## 7. Dependency và xung đột file

```text
ESC-080 (P0) ──┬──► TASK-001 (backend) ──► TASK-003 (backend)
               └──► TASK-002 (frontend)
ESC-090 QA+merge ──► TASK-007 (docs) ──► TASK-008 (BLOCKED: OD-01/02/04)
TASK-004 (ai-pipeline) ──► TASK-006 (ai eval, cần dataset)
TASK-005 (contracts/test) — độc lập
```

| File/nhóm file | Task sở hữu (theo thứ tự) | Ghi chú |
|---|---|---|
| `backend/attest_service.py`, `backend/tests/test_service_unit.py`, `backend/tests/test_integration_anvil.py` | ESC-080 → TASK-001 → TASK-003 | Tuần tự, không song song |
| `backend/auto_agent.py` | ESC-080 (chỉ chuỗi) → TASK-003 | |
| `backend/chain.py` | TASK-003 | |
| `frontend/components/AgentStatusCard.tsx`, `frontend/components/VerifyProgress.tsx` | ESC-080 → TASK-002 | |
| `frontend/components/EvidenceUploader.tsx`, `frontend/lib/ipfs.ts`, `frontend/app/api/pin/route.ts` | TASK-002 | |
| `frontend/app/api/verify/route.ts`, `frontend/app/api/uris/route.ts` | TASK-001 | TASK-002 không chạm |
| `frontend/app/trade/[id]/page.tsx` | TASK-002 → TASK-008 | TASK-008 chỉ đổi chuỗi hiển thị |
| `ai-pipeline/evidence_check.py`, `ai-pipeline/tests/*` | TASK-004 → TASK-006 (không sửa `evidence_check.py`) | |
| `contracts/test/*` | TASK-005 | Không chạm `contracts/src/` |
| `docs/context/*` (trừ `DECISION_LOG.md`), `docs/specs/*`, `README.md` | TASK-007 → TASK-008 | `DECISION_LOG.md` chỉ Owner sửa |

**Song song an toàn trong đợt 1:** ESC-080 ∥ TASK-004 ∥ TASK-005 ∥ TASK-007 (sau ESC-090 merge). Bốn task này không có file chung.

## 8. Lịch đề xuất

| Đợt | Ngày | Antigravity / Claude Code | Cowork | Owner |
|---|---|---|---|---|
| 0 | 12–13/11 | — | QA ESC-090 (sửa NEW-05 trong lúc QA) | Trả lời OD-01..OD-10 (ưu tiên OD-01, 02, 08, 10); chú thích FULL audit (NEW-06); merge ESC-090 |
| 1 | 13–14/11 | **ESC-080** ∥ TASK-004 ∥ TASK-005 ∥ TASK-007 | QA từng task khi có report | Merge sau QA ACCEPT |
| 2 | 15–16/11 | TASK-001 ∥ TASK-002 | QA; QA hậu kiểm 4D/4E/ESC-050 (SE-01) | Merge trước freeze |
| 3 | 17–19/11 | TASK-003, TASK-006, TASK-008 — chỉ khi OD-10 = A hoặc đã có quyết định tương ứng | Viết lại ESC-060; **Release Gate** (DEMO-READY) ≤ 20/11 | Duyệt Release Gate |
| 4 | 20–21/11 | Chỉ sửa lỗi chặn Release Gate | Kiểm link ẩn danh | **Nộp bài 21/11 23:59** |

Nếu OD-10 = B (đóng băng cứng), task chưa merge trước 16/11 sẽ được chuyển thành Known Limitation trong `RISK_REGISTER.md` và Release Gate.

## 9. Owner decisions

Chi tiết xung đột, phương án và hệ quả ở mục 6 của [báo cáo thẩm định](../../audit/REPORT_VALIDATION_AND_REMEDIATION_PLAN.md).

| ID | Câu hỏi | Chặn |
|---|---|---|
| OD-01 | Chỉ giữ cọc hay giữ cả tiền hàng (Q2) | TASK-008 |
| OD-02 | Claim về trọng tài (Q3) | TASK-008 |
| OD-03 | Chấp nhận tập trung quyền owner + liveness `Disputed` (Q4) | Release Gate |
| OD-04 | Tham số reputation + farm (Q5, NEW-04) | TASK-008 (phần reputation) |
| OD-05 | Privacy bằng chứng (Q6) | Dòng cảnh báo tuỳ chọn trong TASK-002 |
| OD-06 | Listing dùng lại làm ảnh đóng gói có phải cờ đỏ | Task AI tương lai |
| OD-07 | Neo listing on-chain | — |
| OD-08 | Duyệt công cụ/dependency (eslint, vitest, gitleaks, lock, `.gitattributes`, CI) | TST-03/05, SEC-09 |
| OD-09 | Vệ sinh Decision Log (DEC-005/011, DEC QR nonce) | — |
| OD-10 | Ngoại lệ feature freeze cho fix P1/P2 | Đợt 3 |

## 10. Việc QA độc lập (không giao cho agent implement)

| QA | Người làm | Chuẩn | Ghi chú |
|---|---|---|---|
| QA mỗi ESC/TASK | Cowork | `.agents/skills/qa-review/SKILL.md` | Bắt buộc rerun lệnh kiểm chứng. Không rerun được → tối đa `ACCEPT WITH LIMITATIONS`. Task P0/P1 thêm security review + regression toàn module |
| QA ESC-090 | Cowork | Như trên | Sửa NEW-05; xác minh bằng chứng trigger (RA-07) |
| QA hậu kiểm 4D/4E/ESC-050 | Cowork | Như trên | SE-01 |
| Viết lại ESC-060 (E2E) | Cowork | TASK_TEMPLATE | Sau ESC-080; sửa AC-03 theo PC-04 |
| Release Gate | Cowork | `.agents/skills/release-gate/SKILL.md` | ≤ 20/11; gồm kiểm link ẩn danh |

## 11. Danh sách Task Spec

| ID | Tiêu đề | Ưu tiên | Trạng thái |
|---|---|---|---|
| [ESC-080](../tasks/ESC-080.md) | Ràng buộc listing ký bởi seller + tên dự án + `errors.ts` | P0 | READY (có sẵn) |
| [TASK-001](TASK-001-backend-security-config-hardening.md) | Backend fail-closed, guard toggle, chuẩn hoá lỗi, rate-limit theo client | P1 | READY sau ESC-080 |
| [TASK-002](TASK-002-frontend-evidence-uri-recovery.md) | Khôi phục đăng ký URI bằng chứng + chặn mock IPFS ngoài anvil | P1 | READY sau ESC-080 |
| [TASK-003](TASK-003-backend-attest-durability.md) | Độ bền report/pHash khi lỗi receipt + lưu số lần thử của agent | P2 | READY sau TASK-001 |
| [TASK-004](TASK-004-ai-buyer-video-reuse-check.md) | Kiểm tra tái sử dụng video buyer trên mọi khung có thông tin | P2 | READY |
| [TASK-005](TASK-005-contract-invariant-boundary-tests.md) | Invariant `withdraw` + test biên/liveness cho contract | P2 | READY |
| [TASK-006](TASK-006-ai-evaluation-harness.md) | Harness đánh giá AI + confusion matrix | P2 | READY khi có dataset + TASK-004 |
| [TASK-007](TASK-007-docs-context-sync.md) | Đồng bộ docs/context, specs, README với code | P2 | READY sau ESC-090 merge |
| [TASK-008](TASK-008-pitch-claims-alignment.md) | Căn chỉnh claim pitch (escrow model, trọng tài, reputation) | P1 | **BLOCKED** (OD-01/02/04) |
