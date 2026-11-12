# TASK-007 — Docs: đồng bộ docs/context, docs/specs, README với code thực tế (không gồm các claim chờ Owner)

## 1. Task Metadata

| Trường | Giá trị |
|---|---|
| Task ID | `TASK-007` |
| Title | Docs/context & specs sync with implementation |
| Priority | **P2** (agent Phase 7 dùng các file này để viết slide/README) |
| Affected module | `docs/context/`, `docs/specs/`, `README.md` |
| Suggested agent role | Docs/Process Engineer |
| Branch | `ops/task-007-docs-sync` (từ `main` sau khi ESC-090 merge) |
| Dependencies | **ESC-090 merged** (rules precedence/doc-sync làm căn cứ). Song song được với ESC-080, TASK-004, TASK-005 vì không có file chung |
| Related findings | RA-03 (phần còn lại), PC-01, PC-04, PC-06, PC-07, PC-08, PC-09, SE-02, SE-06 ([báo cáo thẩm định](../../audit/REPORT_VALIDATION_AND_REMEDIATION_PLAN.md) §3.1, §3.2, §3.4) |
| Owner approval | Không cần cho phạm vi này. **Không được** đụng các nội dung chờ OD-01/02/04 (mục 4). `Deploy authorized: No` |
| Security review required | No |

## 2. Problem Description

Các claim dưới đây sai so với code tại `e5c2123` (đã kiểm từng claim):

| Finding | File:dòng | Hiện tại | Thực tế |
|---|---|---|---|
| PC-01 | [`docs/context/BUSINESS_REQUIREMENTS.md`](../../context/BUSINESS_REQUIREMENTS.md) L28-40 | State `SellerDeposited`/`FullyFunded`/`EvidenceSubmitted` | 6 state `Created, AwaitingEvidence, Attested, Disputed, Resolved, Cancelled` ([`contracts/src/Escrow.sol`](../../../contracts/src/Escrow.sol) L36-43) |
| PC-04 | `BUSINESS_REQUIREMENTS.md` (mục cancel) | "bên kia quá hạn → huỷ" | `cancelUnfunded`: `state == Created` và người gọi là seller/buyer, không có deadline (`Escrow.sol` L183-189) |
| PC-06 | [`docs/specs/SLIDE_AND_VIDEO_SCRIPT.md`](../../specs/SLIDE_AND_VIDEO_SCRIPT.md) L17, L41 | Nonce sinh "sau khi đủ cọc" | Sinh trong `createTrade` (`Escrow.sol` L140, L154) |
| PC-07 | [`docs/context/TECH_STACK.md`](../../context/TECH_STACK.md) L14, L39 | CLIP embeddings | Mặc định `hsv-histogram` (`evidence_check.embedding_backend()`); QR nonce (`evidence_check.py` L409-460) chưa được mô tả |
| PC-08 | BR "Tham số đã chốt" | Thiếu attest window, thiếu cấu hình demo | Production 3 ngày / 1 ngày / 2 ngày (`Escrow.sol` L30-34). Fuji: 600 / 600 / 90 s ([`contracts/deployments/43113.json`](../../../contracts/deployments/43113.json)) |
| PC-09 | [`docs/specs/FRONTEND_SPEC.md`](../../specs/FRONTEND_SPEC.md) L398 | "backend chấp nhận http URL" | Chỉ `ipfs://` ([`backend/attest_service.py`](../../../backend/attest_service.py) L504, L637) |
| SE-02 | `FRONTEND_SPEC.md` §4 | "3 endpoint" | Có thêm `GET /trade/{id}/nonce-qr.png`, `POST/GET /trade/{id}/uris`, `GET /agent/status/{id}`; `/health` có thêm trường agent (`attest_service.py` L405-669) |
| SE-06 | [`README.md`](../../../README.md) L66; `PROJECT_BRIEF.md` L63; `TECH_STACK.md` L45 | 42 / 177 tests | Không ghi số cứng; trỏ tới report test gần nhất |
| RA-03 | [`docs/context/OPEN_QUESTIONS.md`](../../context/OPEN_QUESTIONS.md) L9, L16, L19; `PROJECT_BRIEF.md`; `CURRENT_STATUS.md`; `README.md` mục Phase 3B; [`docs/specs/L1_MODULE_SPEC.md`](../../specs/L1_MODULE_SPEC.md) L3 | "Frontend CHƯA tồn tại", "chưa deploy Fuji", "Ai code frontend?", tham chiếu "CLAUDE.md mục 6" | Frontend đã có; đã deploy Fuji (`43113.json`); `CLAUDE.md` không có mục 6 |

**Root cause:** RC-5 — thay đổi code không kèm doc-sync.

## 3. Expected Outcome

1. Mọi dòng trong bảng mục 2 khớp code. Thông tin lấy từ code/deployments, không suy đoán.
2. Mỗi file `docs/context/*` được sửa có header `Status / Last verified / Verified against commit` (theo AGENTS §1).
3. Không còn số lượng test cứng trong file được sửa. Thay bằng "xem report test gần nhất" kèm đường dẫn.
4. Bảng tham số thời gian gồm 6 giá trị (3 production + 3 Fuji demo) và ghi rõ bản nộp bài chạy cấu hình demo.
5. `FRONTEND_SPEC.md` §4 mô tả đúng endpoint hiện có, theo API **sau ESC-080**. Nếu ESC-080 chưa merge khi bắt đầu, mô tả theo `main` và ghi "cần cập nhật lại sau ESC-080" trong report. TASK-001 sẽ tự ghi "Docs cần sync" cho error model.

## 4. Scope

**Được sửa:**

- `docs/context/BUSINESS_REQUIREMENTS.md` (chỉ state machine, `cancelUnfunded`, bảng tham số thời gian)
- `docs/context/TECH_STACK.md`
- `docs/context/OPEN_QUESTIONS.md` (chỉ cập nhật câu trả lời Q-003, Q-010, Q-013 theo sự kiện đã xảy ra)
- `docs/context/PROJECT_BRIEF.md`
- `docs/context/CURRENT_STATUS.md`
- `docs/specs/FRONTEND_SPEC.md` (§4 endpoints, L398)
- `docs/specs/SLIDE_AND_VIDEO_SCRIPT.md` (chỉ PC-06 và số test)
- `docs/specs/L1_MODULE_SPEC.md` (chỉ tham chiếu L3)
- `README.md` (chỉ mục chạy frontend "Phase 3B" và số test)
- `docs/agent-ops/reports/TASK-007-report.md`

**Không được sửa (chờ Owner — TASK-008):**

- Mọi câu về "giải ngân", mô hình thanh toán (OD-01);
- "không có human arbitrator" / Q-004 (OD-02);
- tham số reputation −10/+5 (OD-04);
- `PRODUCT_VISION.md`, `USER_PERSONAS.md`, `COMPETITION_CONTEXT.md`.

**Không được sửa (khác):** `docs/context/DECISION_LOG.md` (chỉ Owner); README phần link `[TBD]` (thuộc ESC-070); `.agents/`, `CLAUDE.md`, mọi code.

## 5. Implementation Guidance

1. Với mỗi dòng sửa, ghi trong report cặp "trước → sau" và nguồn (`file:Lx` của code).
2. State machine: liệt kê transition kèm tên hàm và điều kiện `require` lấy từ `Escrow.sol`.
3. Gặp mâu thuẫn ngoài danh sách → **không tự sửa**, ghi vào mục "Docs cần quyết định" của report.

## 6. Test Requirements

Không có test tự động (chỉ docs). Kiểm chứng bằng grep (mục 8) và Cowork đối chiếu ngẫu nhiên ≥ 5 claim với code.

## 7. Acceptance Criteria

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-01 | BR liệt kê đúng 6 state của `Escrow.sol` L36-43; không còn `SellerDeposited` | `grep -n "SellerDeposited" docs/context/BUSINESS_REQUIREMENTS.md` → rỗng |
| AC-02 | Không còn "CLIP embeddings" như thành phần mặc định; có QR nonce | `grep -n "CLIP" docs/context/TECH_STACK.md` chỉ còn ngữ cảnh "tuỳ chọn" |
| AC-03 | Slide script không còn "sau khi đủ cọc"/"Khi đủ cọc" gắn với sinh nonce | grep |
| AC-04 | Không còn "Frontend CHƯA tồn tại", "chưa deploy lên Fuji", "backend chấp nhận http URL", "CLAUDE.md mục 6" | `grep -rn "CHƯA tồn tại\|chưa deploy lên Fuji\|chấp nhận http URL\|CLAUDE.md mục 6" docs/context docs/specs` → rỗng |
| AC-05 | Không còn số test cứng trong các file được sửa | `grep -n "177 tests\|42 unit\|96 test" README.md docs/context/*.md docs/specs/*.md` chỉ còn `DECISION_LOG.md` (ngoài scope) |
| AC-06 | File context được sửa có header độ tươi với commit hiện tại | Đọc file |
| AC-07 | Nội dung chờ OD-01/02/04 không đổi | `git diff main...HEAD` không chạm câu chứa "giải ngân", "arbitrator", "−10", "+5" |
| AC-08 | `git diff --name-only main...HEAD` ⊆ mục 4 | Output |

## 8. Verification Commands

```bash
grep -n "SellerDeposited" docs/context/BUSINESS_REQUIREMENTS.md
grep -rn "CHƯA tồn tại\|chưa deploy lên Fuji\|chấp nhận http URL\|CLAUDE.md mục 6" docs/context docs/specs
grep -n "177 tests\|42 unit\|96 test" README.md docs/context/*.md docs/specs/*.md
git diff --name-only main...HEAD
git diff --ignore-cr-at-eol --stat main...HEAD
```

## 9. Risks and Rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Vô tình chốt một claim kinh doanh | Mục 4 cấm; AC-07 |
| Lệch lại sau ESC-080 / TASK-001 | Ghi "Docs cần sync" trong report của các task đó |

**Rollback:** revert branch.

## 10. Required Completion Report

`docs/agent-ops/reports/TASK-007-report.md` gồm:

- File thay đổi
- Bảng "trước → sau → nguồn code"
- Output các lệnh grep
- Mâu thuẫn phát hiện thêm (chưa sửa)
- Sai lệch so với spec
