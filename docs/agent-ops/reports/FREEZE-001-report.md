# Operational Task Report: FREEZE-001

**Task ID:** `FREEZE-001`  
**Title:** Backend fail-closed trên chain ≠ 31337 (key rỗng hoặc toggle nguy hiểm) + `/health.security_toggles`  
**Priority:** P1 (auth / đường tới `attest`)  
**Role:** Backend Engineer (Antigravity)  
**Branch:** `freeze/001-backend-fail-closed`  
**Worktree:** `D:\wt-freeze-001`  
**Base Commit:** `2f87940` (Merge pull request #10 from NguyenMinhCuong1412/phase/4f-listing-binding)  
**Date:** 2026-11-12  
**Status:** READY FOR QA REVIEW  
**Commit:** `e3c8536`  

---

## 1. Preflight Check & Scope Compliance

### 1.1 Scope Allowed (Tuân thủ 100%)
- `backend/attest_service.py`:
  - Định nghĩa ngoại lệ `InsecureConfigError(HTTPException)` và hàm thuần `insecure_reasons(settings, chain_id) -> list[str]`.
  - Đăng ký exception handler trả status code 503 với cấu trúc chuẩn `{error_code: "INSECURE_CONFIG", detail: ..., reasons: [...]}`.
  - Thêm cơ chế lazy cache `chain_id` từ `EscrowClient` (`get_chain_id(c)`) và hàm guard tập trung `check_security_guard(c)`.
  - Đặt guard ở đầu `run_verification` và `register_uri`: khi chain ≠ 31337 và có toggle nguy hiểm (`ATTEST_API_KEY` rỗng, `ALLOW_LOCAL_HOSTS=True`, hoặc `ENFORCE_EVIDENCE_HASH=False`), lập tức ngắt với HTTP 503 `INSECURE_CONFIG`.
  - Cập nhật `agent_verify`: khi `run_verification` ném `InsecureConfigError`, cập nhật `agent.last_error = "INSECURE_CONFIG: ..."` và re-raise để ngăn agent gọi `send_attest`.
  - Cập nhật `GET /health`: bổ sung khối `security_toggles` gồm 5 trường `{api_key_set, allow_local_hosts, enforce_evidence_hash, ipfs_gateway_host, insecure_for_chain}` tuyệt đối không làm lộ giá trị secret key; cập nhật `agent_error` khi cấu hình không an toàn.
- `backend/.env.example`: Thêm chú thích rõ ràng về cơ chế fail-closed của guard cho `ATTEST_API_KEY`, `ALLOW_LOCAL_HOSTS`, và `ENFORCE_EVIDENCE_HASH` trên chain khác 31337.
- `backend/tests/test_service_unit.py`: Bổ sung test suite `TestFreeze001BackendFailClosed` gồm 7 unit test độc lập kiểm chứng toàn diện AC-01 đến AC-07.
- `docs/agent-ops/reports/FREEZE-001-report.md`: Tạo mới báo cáo này.

### 1.2 Out of Scope (Không chạm)
- `contracts/`, `ai-pipeline/`, `frontend/`: Giữ nguyên, không thay đổi.
- `backend/chain.py`: Giữ nguyên, sử dụng `chain_id()` sẵn có.
- `backend/auto_agent.py`: Giữ nguyên, guard được kiểm soát tập trung tại `run_verification` và `agent_verify` theo đúng chỉ dẫn của Task Spec.
- `docs/context/`, `.agents/`: Giữ nguyên.
- Không thêm dependency mới hay framework/middleware ngoài.

---

## 2. Acceptance Criteria Verification

| ID | Tiêu chí | Traces | Kết quả | Bằng chứng kiểm tra thực tế |
|---|---|---|---|---|
| **AC-01** | Có hàm thuần `insecure_reasons(settings, chain_id) -> list[str]`; trả `[]` khi `chain_id == 31337` | Rule 30/70 | ✅ PASS | Hàm thuần tại `backend/attest_service.py`. Khi `chain_id == 31337` luôn trả `[]`. Khi `chain_id != 31337` kiểm tra 3 điều kiện: key rỗng, allow_local_hosts, enforce_evidence_hash=False. Kiểm chứng qua `TestFreeze001BackendFailClosed::test_ac01_insecure_reasons_pure_function`. |
| **AC-02** | Chain 43113 + key rỗng → `POST /verify-evidence` trả 503, `error_code == "INSECURE_CONFIG"`; `send_attest` không được gọi | SEC-02 | ✅ PASS | `POST /verify-evidence` kích hoạt guard tại đầu `run_verification`, trả về HTTP 503 với body `{"error_code": "INSECURE_CONFIG", ...}`. Mock client xác nhận `attest_called is False`. Kiểm chứng qua `test_ac02_chain43113_empty_key_verify_evidence_returns_503`. |
| **AC-03** | Chain 43113 + `allow_local_hosts=True` → 503; chain 43113 + `enforce_evidence_hash=False` → 503 | SEC-06 | ✅ PASS | Cả hai cấu hình nguy hiểm trên chain 43113 đều bị guard chặn tại đầu `run_verification`, trả về HTTP 503 với `error_code == "INSECURE_CONFIG"`. Kiểm chứng qua `test_ac03_chain43113_unsafe_toggles_return_503`. |
| **AC-04** | Chain 43113 + key rỗng → `POST /trade/{id}/uris` trả 503 | SEC-02 | ✅ PASS | Guard tại đầu `register_uri` chặn ngay sau rate limit, trả về HTTP 503 `INSECURE_CONFIG` trước khi load trade hay ghi sổ. Kiểm chứng qua `test_ac04_chain43113_empty_key_uris_returns_503`. |
| **AC-05** | Chain 31337 + key rỗng → hành vi cũ (không 503 vì guard); chain 43113 + cấu hình đúng + key sai → vẫn 401 | Hồi quy | ✅ PASS | Trên chain 31337 key rỗng không bị 503 từ guard. Trên chain 43113 cấu hình đúng nhưng gửi sai key trả về đúng 401 `{"detail": "Invalid or missing API key"}`. Kiểm chứng qua `test_ac05_chain31337_regression_and_chain43113_wrong_key`. |
| **AC-06** | Auto agent trên cấu hình không an toàn không gọi `attest`; `/health.agent_error` chứa `INSECURE_CONFIG` | Rule 55 | ✅ PASS | Khi cấu hình không an toàn, `agent.tick()` gọi qua `agent_verify` bị guard chặn, `agent.last_error` ghi nhận `INSECURE_CONFIG`, không gọi `send_attest`. Endpoint `/health` trả `agent_error` chứa chuỗi `INSECURE_CONFIG`. Kiểm chứng qua `test_ac06_auto_agent_on_insecure_config`. |
| **AC-07** | `/health` có đủ 5 khoá trong `security_toggles`; body không chứa giá trị key | Rule 70 | ✅ PASS | `GET /health` trả đủ 5 trường: `api_key_set`, `allow_local_hosts`, `enforce_evidence_hash`, `ipfs_gateway_host`, `insecure_for_chain`. Secret key không xuất hiện trong toàn bộ body. Kiểm chứng qua `test_ac07_health_security_toggles_and_no_secret_leak`. |
| **AC-08** | Toàn bộ Python suite pass, **skip = 0** (anvil + Tesseract) | TEST_MATRIX | ✅ PASS | 153 tests toàn bộ repository chạy pass 100%, 0 failed, 0 skipped. |
| **AC-09** | `git diff --name-only main...HEAD` ⊆ Scope | Rule 90 | ✅ PASS | Chỉ chạm đúng 4 file nằm trong scope được cấp phép. |

---

## 3. Test Execution Results

### 3.1 Unit Test Suite (`backend/tests/test_service_unit.py`)
- **Lệnh thực thi:**
  ```powershell
  D:\Escrow_Marketplace_UniHack\.venv\Scripts\python.exe -m pytest -rs backend/tests/test_service_unit.py
  ```
- **Kết quả:**
  ```text
  ============================= test session starts =============================
  platform win32 -- Python 3.14.3, pytest-9.2.0, pluggy-1.7.0
  rootdir: D:\wt-freeze-001
  configfile: pytest.ini
  plugins: anyio-4.16.0
  collected 53 items

  backend\tests\test_service_unit.py ..................................... [ 69%]
  ................                                                         [100%]

  ============================= 53 passed in 9.33s ==============================
  ```
  *(53 passed, 0 failed, 0 skipped)*

### 3.2 Full Regression Test Suite (`ai-pipeline` + `backend`)
- **Lệnh thực thi:**
  ```powershell
  D:\Escrow_Marketplace_UniHack\.venv\Scripts\python.exe -m pytest -rs
  ```
- **Kết quả:**
  ```text
  ============================= test session starts =============================
  platform win32 -- Python 3.14.3, pytest-9.2.0, pluggy-1.7.0
  rootdir: D:\wt-freeze-001
  configfile: pytest.ini
  testpaths: ai-pipeline/tests, backend/tests
  plugins: anyio-4.16.0
  collected 153 items

  ai-pipeline\tests\test_evidence_check.py ............................... [ 20%]
  ............................                                             [ 38%]
  ai-pipeline\tests\test_qr_nonce.py ..................                    [ 50%]
  backend\tests\test_integration_anvil.py .......................          [ 65%]
  backend\tests\test_service_unit.py ..................................... [ 89%]
  ................                                                         [100%]

  ======================= 153 passed in 122.95s (0:02:02) =======================
  ```
  *(153 passed, 0 failed, 0 skipped — tuân thủ 100% skip policy theo Rule 80)*

---

## 4. Git Diff & Scope Check

- **Lệnh thực thi:**
  ```powershell
  git diff --name-only origin/main...HEAD
  ```
- **Danh sách file thay đổi:**
  ```text
  backend/.env.example
  backend/attest_service.py
  backend/tests/test_service_unit.py
  docs/agent-ops/reports/FREEZE-001-report.md
  ```
- **Kiểm tra CRLF (Rule 90):**
  `git diff --stat` và `git diff --ignore-cr-at-eol --stat` hoàn toàn đồng nhất, không có phantom CRLF diff.

---

## 5. Security & Architectural Considerations

1. **Fail-Closed by Design (Rule 30 & Rule 70):**
   - Loại bỏ hoàn toàn lỗ hổng fail-open: trên các môi trường testnet/public chain (như Avalanche Fuji `43113`), mọi request gọi verify evidence hoặc đăng ký URI đều bị chặn ngay lập tức nếu thiếu `ATTEST_API_KEY` hoặc bật toggle nguy hiểm.
   - Không cho phép attacker trigger AI pipeline tốn tài nguyên hoặc gọi `attest()` làm cạn kiệt gas của ví agent.
2. **AI Authority Boundary Preserved (Rule 55):**
   - Agent tự động dừng ngay lập tức khi phát hiện cấu hình không an toàn, không gửi bất kỳ giao dịch on-chain nào.
3. **No Secret Leaks (ASVS Level 1 / Rule 70):**
   - Khối `security_toggles` trong `/health` chỉ trả boolean `api_key_set` và host IPFS gateway, không chứa giá trị của bất kỳ secret hay private key nào.
4. **Performance & RPC Latency:**
   - Chain ID được lấy lười từ client và cache lại trong `state["chain_id"]`, tránh phát sinh request RPC eth_chainId lặp đi lặp lại trên mỗi request.

---

## 6. Remaining Limitations & Handoff

- **Phần còn lại ngoài freeze:** Việc giới hạn rate limit nâng cao theo identity và các hạng mục SE-05 thuộc về `TASK-001`, sẽ được triển khai sau khi hoàn tất freeze.
- **Tài liệu cần đồng bộ:** Cập nhật mục `GET /health` trong `docs/specs/FRONTEND_SPEC.md §4` để bổ sung đặc tả khối `security_toggles`.
- **Handoff:** Bàn giao cho Cowork QA Review theo `.agents/skills/qa-review/SKILL.md`.
