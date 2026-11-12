# TASK-003 — Backend: không mất report/pHash khi chờ receipt lỗi; lưu số lần thử của auto agent qua restart

## 1. Task Metadata

| Trường | Giá trị |
|---|---|
| Task ID | `TASK-003` |
| Title | Attest durability & agent retry persistence |
| Priority | **P2** |
| Affected module | `backend/` |
| Suggested agent role | Backend Engineer |
| Branch | `phase/4i-attest-durability` (từ `main` sau TASK-001 merge) |
| Dependencies | **TASK-001 merged** (cùng `backend/attest_service.py`, `backend/tests/*`). Nếu sau 16/11 cần **OD-10** |
| Related findings | NEW-01, FPA-05, TST-07 ([báo cáo thẩm định](../../audit/REPORT_VALIDATION_AND_REMEDIATION_PLAN.md) §5, §4) |
| Owner approval | Không cần quyết định nghiệp vụ. `Deploy authorized: No` |
| Security review required | **Yes** (đường dẫn tới `attest()`) |

## 2. Problem Description

**NEW-01: report và pHash có thể mất vĩnh viễn**

- [`backend/chain.py`](../../../backend/chain.py) L136-150: sau `send_raw_transaction` (L143), mọi lỗi của `wait_for_transaction_receipt(timeout=120)` (L146) đều bị bọc thành `ChainError`, dù tx có thể đã được mine.
- [`backend/attest_service.py`](../../../backend/attest_service.py) L568-572: `ChainError` → HTTP 502 **trước** khi chạy `store.add` (L573-574) và ghi report (L590-598).
- Lần verify sau nhận 409 vì state đã là `Attested` (L518-519). Auto agent đánh dấu `_done` (`backend/auto_agent.py` L166-168).
- Hệ quả:
  - (a) `GET /report/{id}` 404 vĩnh viễn dù `reportHash` đã neo on-chain;
  - (b) pHash của trade không vào `known_hashes.json`, nên tái sử dụng ảnh sau này không bị phát hiện.
- Tình huống tương tự xảy ra khi tiến trình dừng giữa lúc mine và lúc ghi file.

**FPA-05: số lần thử của auto agent nằm trong RAM**

- `auto_agent.py` L103 `self.status` và L106-107 `_cursor`, `_done` chỉ nằm trong RAM. Restart thì `attempts` về 0, nên một trade lỗi xác định (ví dụ CID hỏng) được thử lại thêm tối đa `MAX_ATTEMPTS=5` lần sau mỗi restart.
- Có backoff (L92-93, L181-183) nên **không** phải vòng lặp vô hạn như FULL audit mô tả. Quét lại cursor từ 1 chỉ tốn một lần `getTrade` cho mỗi trade đã kết thúc. Đó là chi phí chấp nhận được và không cần sửa.

**Root cause:** ghi trạng thái ngoài chuỗi sau tác dụng on-chain và không đối soát lại với chain (RC-3).

## 3. Expected Outcome

1. Report (đúng `report_json` canonical đã băm) và pHash được ghi bền **trước** khi broadcast `attest`, dưới dạng bản ghi "pending" gắn `report_hash`.
2. Khi receipt thành công: bản ghi trở thành report chính thức như hiện nay (định dạng `GET /report/{id}` không đổi, frontend không phải sửa).
3. Khi receipt lỗi hoặc tiến trình restart: hệ thống **đối soát** với chain. Chỉ khi `trade.state ∈ {Attested, Disputed, Resolved}` **và** `trade.report_hash == report_hash` của bản pending thì report được công bố và pHash được thêm vào kho. Nếu không khớp, bản pending không bao giờ được công bố.
4. Thời điểm đối soát do agent chọn, ví dụ: khi gọi `GET /report/{id}`, trong mỗi nhịp auto agent, hoặc lúc khởi động. Phải nêu lý do. Phải đảm bảo đối soát chạy được cả khi `AGENT_AUTO=false`.
5. Số lần thử của auto agent được lưu bền theo trade (file JSON trong `data_dir`, ghi nguyên tử như `UriRegistry` L68-71). Restart không reset `attempts`. Trade đã `failed` vẫn hiện đúng ở `GET /agent/status/{id}`.
6. Không đổi schema `POST /verify-evidence`, không đổi cách tính `report_hash`, không gửi `attest` lần hai cho cùng trade.

## 4. Scope

**Được sửa:**

- `backend/attest_service.py`
- `backend/chain.py` (chỉ để phân biệt "đã broadcast nhưng chưa có receipt", ví dụ trả hoặc gắn `tx_hash` vào exception)
- `backend/auto_agent.py`
- `backend/tests/test_service_unit.py`, `backend/tests/test_integration_anvil.py`, `backend/tests/conftest.py`
- `docs/agent-ops/reports/TASK-003-report.md`

**Phải đọc trước:** `KnownHashStore` (attest_service L137-165), `UriRegistry` (auto_agent L43-71), frontend `lib/backend.ts` `getReport`/`verifyReportOnChain` (L110, L133) để giữ tương thích.

**Không được sửa:** `contracts/`, `ai-pipeline/`, `frontend/`, docs; không thêm dependency (không SQLite).

**Ngoài phạm vi:** fee bumping / thay tx kẹt; persistence của `_cursor`; đa tiến trình (nhiều worker uvicorn) — ghi Known Limitation.

## 5. Implementation Guidance

1. Bản ghi pending đặt trong `data_dir` (ví dụ `reports/pending/<trade>.json`), ghi kiểu `tmp` + `replace` như code hiện có.
2. Report chỉ là JSON nên chi phí ghi trước thấp. Không ghi pending cho `dry_run=true`.
3. Đối soát dùng `c.get_trade(trade_id).report_hash` (đã có trong `Trade`, `chain.py` L111). So sánh lowercase hex.
4. Agent retry: một file `agent_status.json` lưu `{trade_id: {attempts, phase, updated_at, detail}}`. Đọc lúc khởi tạo `AutoAgent`. Giữ khoá `threading.Lock` hiện có.
5. Thay đổi nhỏ nhất; không refactor `run_verification` ngoài phần cần thiết.

## 6. Test Requirements

**Unit** (fake client, không cần RPC):

| # | Trường hợp | Kỳ vọng |
|---|---|---|
| U1 | `send_attest` raise lỗi "sau broadcast"; `get_trade` sau đó trả `Attested` + `report_hash` khớp | `GET /report/{id}` → 200 đúng `report_json`; `known_hashes.json` có seller + buyer pHash của trade |
| U2 | Như U1 nhưng `report_hash` on-chain khác | 404; pHash **không** được thêm |
| U3 | `send_attest` raise "would revert" (trước broadcast) | Không công bố report; hành vi 502 giữ nguyên |
| U4 | Happy path | Report như cũ (hồi quy `test_report_served_from_disk`) |
| U5 | `dry_run=true` | Không tạo bản pending |
| U6 | AutoAgent: 2 lần thất bại → tạo instance mới cùng `data_dir` | `attempts == 2`; sau đủ `MAX_ATTEMPTS` vẫn là `failed` |
| U7 | File trạng thái agent hỏng | Khởi động với trạng thái rỗng, log warning (giống `UriRegistry` L50-54) |

**Integration** (anvil): `test_auto_agent_resumes_after_restart`, `test_auto_agent_retries_then_gives_up` (`test_integration_anvil.py` L401, L445) và mọi test hiện có pass không đổi kỳ vọng. Thêm 1 test: verify thủ công, giả lập lỗi khi chờ receipt (monkeypatch `wait_for_transaction_receipt` raise sau khi tx đã gửi) → đọc `GET /report/{id}` → 200 và hash khớp on-chain.

**Regression:** toàn bộ pytest.

## 7. Acceptance Criteria

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-01 | U1, U2 pass: report chỉ công bố khi `reportHash` on-chain khớp | pytest |
| AC-02 | U3–U5 pass (không hồi quy) | pytest |
| AC-03 | Integration test mới cho lỗi receipt pass, không skip | Dòng tổng kết pytest |
| AC-04 | U6, U7 pass; 2 test integration agent hiện có pass không sửa kỳ vọng | pytest |
| AC-05 | Không có đường nào gửi `attest` hai lần cho một trade | Đọc diff + U1 assert `send_attest` gọi 1 lần |
| AC-06 | Định dạng `GET /report/{id}` không đổi (frontend `verifyReportOnChain` dùng được) | U4 so khoá JSON |
| AC-07 | `git diff --name-only main...HEAD` ⊆ mục 4 | Output |

## 8. Verification Commands

```bash
python -m pytest -rs backend/tests/test_service_unit.py
python -m pytest -rs backend/tests/test_integration_anvil.py   # cần anvil + Tesseract + contracts/out
python -m pytest -rs
git diff --name-only main...HEAD
```

## 9. Risks and Rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Công bố report không tương ứng on-chain | Chỉ công bố khi hash khớp (AC-01) |
| File pending tích luỹ | Dọn khi đã đối soát; ghi Known Limitation cho trade bị huỷ |
| Đổi thứ tự `store.add` làm sai phát hiện tái sử dụng khi verify lại cùng trade | `hashes_excluding(trade_id)` (L148-152) đã loại trade hiện tại — kiểm bằng test hiện có `test_persist_and_exclude_same_trade` |

**Rollback:** revert branch. Dữ liệu `data_dir` mới (pending, agent_status) có thể xoá an toàn; định dạng file cũ không đổi.

## 10. Required Completion Report

`docs/agent-ops/reports/TASK-003-report.md` gồm:

- File thay đổi
- Tóm tắt implementation và lý do chọn thời điểm đối soát
- Test thêm/sửa
- Lệnh và output thật
- Dòng tổng kết pytest
- Test không chạy và lý do
- Hạn chế còn lại (đa worker, tx kẹt)
- Sai lệch so với spec
