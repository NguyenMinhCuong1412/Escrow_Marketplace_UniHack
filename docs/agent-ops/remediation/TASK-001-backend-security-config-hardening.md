# TASK-001 — Backend: fail-closed theo chain, chặn toggle nguy hiểm, chuẩn hoá lỗi, rate-limit theo client thật

## 1. Task Metadata

| Trường | Giá trị |
|---|---|
| Task ID | `TASK-001` |
| Title | Backend security config hardening |
| Priority | **P1** (Risk tier P1: auth/đường tới `attest`) |
| Affected module | `backend/` (+ 2 proxy route Next.js chỉ để chuyển tiếp IP client) |
| Suggested agent role | Backend Engineer (Antigravity hoặc Claude Code) |
| Branch | `phase/4g-backend-config-hardening` (từ `main` sau khi ESC-080 merge) |
| Dependencies | **ESC-080 merged** (cùng `backend/attest_service.py`, `backend/tests/*`); ESC-090 merged (rules 30/70 làm căn cứ) |
| Related findings | SEC-02, SEC-06, SE-05, FPA-10 ([báo cáo thẩm định](../../audit/REPORT_VALIDATION_AND_REMEDIATION_PLAN.md) §3.3, §3.4) |
| Owner approval | Không cần quyết định mới — hành vi theo rule 30/70 trong ESC-090 do Owner duyệt 12/11. `Deploy authorized: No` |
| Security review required | **Yes** |

## 2. Problem Description

- **Sai ở đâu (đã kiểm tra tĩnh tại `e5c2123`):**
  - Fail-open: [`backend/attest_service.py`](../../../backend/attest_service.py) `check_api_key` L467-472. Khi `ATTEST_API_KEY` rỗng, hàm chỉ ghi warning rồi cho qua, **trên mọi chain**.
  - Rate-limit dồn bucket: `check_rate_limit` L474-477 lấy khoá từ `request.client.host`. Mọi request đi qua proxy [`frontend/app/api/verify/route.ts`](../../../frontend/app/api/verify/route.ts) và [`frontend/app/api/uris/route.ts`](../../../frontend/app/api/uris/route.ts) mang IP của server Next.js, nên toàn bộ người dùng chung 10 req/phút cho `/verify-evidence`.
  - Toggle nguy hiểm không bị chặn: `ALLOW_LOCAL_HOSTS` (L115, tác dụng ở L204, L221) tắt toàn bộ kiểm tra IP. `ENFORCE_EVIDENCE_HASH=false` (L117, L525) bỏ ràng buộc URI↔hash on-chain. Không có kiểm tra nào theo chain.
  - Lộ exception ra client: `/health` L425 (`"RPC error: {e}"`); `HTTPException(502, str(e))` ở L435, L449, L515, L572; L559 (`Lỗi pipeline: {e}`). `ChainError` trong [`backend/chain.py`](../../../backend/chain.py) L105, L123, L135, L150 bọc nguyên văn lỗi web3, có thể chứa URL RPC (kể cả API key nhúng trong URL).
- **Root cause:** cấu hình mặc định fail-open (RC-2); không phân biệt môi trường; error model không tách thông điệp nội bộ với thông điệp cho client.
- **Tác động:**
  - Backend chạy trên Fuji mà quên key thì ai cũng gọi được `attest` path (tốn gas ví agent).
  - Một client spam là đủ khoá verify cho mọi người trong demo.
  - Lộ cấu hình hạ tầng qua thông báo lỗi.

## 3. Expected Outcome

Căn cứ: `.agents/rules/30-backend.md`, `.agents/rules/70-security.md` (ESC-090).

1. Khi chain đang kết nối **khác 31337** (anvil):
   - (a) `ATTEST_API_KEY` rỗng ⇒ các endpoint được bảo vệ (`POST /verify-evidence`, `POST /trade/{id}/uris`) **từ chối** với HTTP 503 và `error_code` cố định, không chạy pipeline, không gửi `attest`;
   - (b) `ALLOW_LOCAL_HOSTS=true` hoặc `ENFORCE_EVIDENCE_HASH=false` ⇒ cũng từ chối như (a).
   - Trên chain 31337 giữ nguyên hành vi hiện tại (có warning).
2. `GET /health` có thêm khối `security_toggles` gồm các giá trị boolean: `api_key_set`, `allow_local_hosts`, `enforce_evidence_hash`, `ipfs_gateway_host`, và `insecure_for_chain` (true nếu cấu hình bị từ chối theo mục 1). **Không** in giá trị secret.
3. Client không bao giờ nhận chuỗi exception thô từ web3/requests. Lỗi 502/500 trả `{"detail": <thông điệp tiếng Việt chuẩn>, "error_code": <mã>}`; chi tiết chỉ ghi log server. Lỗi 4xx nghiệp vụ hiện có (404/409/422, thông điệp tự viết) giữ nguyên `detail` để không phá frontend (`frontend/lib/errors.ts`).
4. Rate-limit theo client thật:
   - Backend chỉ tin `X-Forwarded-For` khi `request.client.host` thuộc danh sách proxy tin cậy (biến môi trường mới, ví dụ `TRUSTED_PROXIES`; mặc định rỗng = hành vi cũ).
   - Hai proxy Next.js chuyển tiếp IP client vào `X-Forwarded-For`.
5. Integration test trên anvil (chain 31337) và luồng auto agent không đổi hành vi.

**Giả định cần ghi trong report:** chain ID chỉ biết được sau khi kết nối RPC (`get_client()` L381-399 khởi tạo lười). Agent tự chọn thời điểm áp dụng guard (lúc khởi tạo client, trong `lifespan`, hoặc mỗi request được bảo vệ) và nêu lý do.

## 4. Scope

**Được sửa:**

- `backend/attest_service.py`
- `backend/chain.py` (chỉ nếu cần tách thông điệp lỗi; không đổi logic gửi tx)
- `backend/.env.example` (thêm `TRUSTED_PROXIES`, ghi chú toggle)
- `backend/tests/test_service_unit.py`, `backend/tests/conftest.py`
- `frontend/app/api/verify/route.ts`, `frontend/app/api/uris/route.ts` (chỉ thêm header `X-Forwarded-For`)
- `docs/agent-ops/reports/TASK-001-report.md` (tạo mới)

**Phải đọc trước:** `backend/auto_agent.py` (agent gọi `run_verification` trực tiếp, không qua `check_api_key`); `backend/tests/test_integration_anvil.py` (dùng `ALLOW_LOCAL_HOSTS` trên 31337); `frontend/lib/backend.ts`, `frontend/lib/errors.ts` (cách frontend đọc `detail`).

**Không được sửa:** `contracts/`, `ai-pipeline/`, mọi file frontend khác, `docs/context/`, `docs/specs/`, `.agents/`; không thêm dependency.

**Ngoài phạm vi:** mô hình xác thực người dùng cuối cho proxy công khai; CORS; DNS rebinding (FPA-08); persistence (TASK-003).

## 5. Implementation Guidance

1. Viết một hàm thuần (ví dụ `insecure_reasons(settings, chain_id) -> list[str]`) để test được không cần RPC.
2. Áp dụng guard ở một điểm duy nhất cho các endpoint được bảo vệ. Không áp dụng cho `run_verification` khi agent gọi nội bộ **trừ khi** agent chọn chặn luôn agent trên cấu hình không an toàn. Nếu chặn agent, phải nêu rõ trong report và đảm bảo `/health` báo `agent_error`.
3. Error mapping: một bảng nhỏ `ChainError → ("CHAIN_UNAVAILABLE", "Không kết nối được blockchain")`, pipeline `RuntimeError → ("PIPELINE_ERROR", ...)`. Dùng `log.exception` cho chi tiết.
4. Rate-limit: tách hàm `client_key(request, trusted_proxies)`. Chỉ lấy địa chỉ **phải nhất chưa tin cậy** trong `X-Forwarded-For` (hoặc phần tử đầu, nếu chỉ có một proxy). Agent chọn và giải thích cách parse.
5. Proxy Next.js: lấy IP từ header của request đến (`x-forwarded-for` hoặc `x-real-ip` của nền tảng host). Thiếu thì không gửi header.
6. KISS: không thêm framework, không thêm middleware lớn.

## 6. Test Requirements

**Unit** (`backend/tests/test_service_unit.py`, dùng `create_app(settings, client=FakeClient)` như các test hiện có):

| # | Trường hợp | Kỳ vọng |
|---|---|---|
| U1 | chain 43113, key rỗng, POST `/verify-evidence` | 503 + `error_code`; `send_attest` không được gọi |
| U2 | chain 43113, `allow_local_hosts=True` | 503 |
| U3 | chain 43113, `enforce_evidence_hash=False` | 503 |
| U4 | chain 31337, key rỗng | hành vi cũ (không 503 do guard) |
| U5 | chain 43113, cấu hình đúng, key sai | 401 (giữ nguyên) |
| U6 | `/health` | có `security_toggles`, không chứa giá trị key |
| U7 | `get_trade` raise `ChainError("... https://rpc.example/SECRET123 ...")` | body response không chứa `SECRET123` hay `https://rpc.example` |
| U8 | 11 request cùng IP trực tiếp | request thứ 11 → 429 (hồi quy) |
| U9 | 2 client khác nhau qua proxy tin cậy (`X-Forwarded-For` khác nhau), mỗi client 10 request | không chặn nhau |
| U10 | `X-Forwarded-For` giả từ IP **không** tin cậy | bị bỏ qua, dùng `client.host` |
| U11 | `POST /trade/{id}/uris` chain 43113 key rỗng | 503 |

**Integration** (`test_integration_anvil.py`): không thêm test mới bắt buộc. **Toàn bộ test hiện có phải pass không đổi kỳ vọng** (anvil = 31337).

**Regression:** toàn bộ `pytest` từ gốc repo.

## 7. Acceptance Criteria

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-01 | U1–U3, U11 pass; không có `attest` nào được gửi trong các case bị từ chối | pytest + assert mock |
| AC-02 | U4, U5, U8 pass (không hồi quy) | pytest |
| AC-03 | `/health` có `security_toggles` đúng 5 khoá ở mục 3.2, không lộ secret | U6 |
| AC-04 | Không còn `str(e)` hoặc f-string chứa exception trong `HTTPException` hay JSON trả client | `grep -nE "HTTPException\([0-9]+, *str\(e\)\)|RPC error: \{e\}|Lỗi pipeline: \{e\}" backend/attest_service.py` → rỗng; U7 pass |
| AC-05 | U9, U10 pass; `TRUSTED_PROXIES` rỗng = hành vi cũ | pytest |
| AC-06 | Toàn bộ suite Python pass, skip = 0 trên máy có anvil + Tesseract | Dòng tổng kết pytest |
| AC-07 | `npm run build` trong `frontend/` pass | Output |
| AC-08 | `git diff --name-only main...HEAD` ⊆ mục 4 | Output |

## 8. Verification Commands

Chạy trong môi trường Python của dự án (cài từ `requirements-dev.txt`), từ gốc repo:

```bash
python -m pytest -rs backend/tests/test_service_unit.py
python -m pytest -rs                      # toàn bộ (pytest.ini: ai-pipeline/tests + backend/tests)
cd frontend && npm ci && npm run build && npx tsc --noEmit
git diff --name-only main...HEAD
```

Integration test cần `anvil` trong PATH, Tesseract, và `contracts/out` (chạy `forge build` trong `contracts/`).

## 9. Risks and Rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Backend demo trên Fuji bị khoá vì thiếu key | Release Gate kiểm `/health.security_toggles.insecure_for_chain == false` trước demo |
| Frontend phụ thuộc chuỗi `detail` cũ | Chỉ đổi lỗi 5xx; giữ nguyên 4xx |
| Parse `X-Forwarded-For` sai → bucket sai | Mặc định không tin header (`TRUSTED_PROXIES` rỗng) |

**Rollback:** revert commit của task (một branch, không có migration dữ liệu). Không có thay đổi on-chain.

## 10. Required Completion Report

`docs/agent-ops/reports/TASK-001-report.md` gồm:

- File thay đổi
- Tóm tắt implementation và lý do chọn điểm áp dụng guard
- Test thêm/sửa
- Lệnh đã chạy và output thật
- Dòng tổng kết pytest `N passed, M failed, K skipped`
- Test không chạy được và lý do
- Hạn chế còn lại
- Sai lệch so với spec
- "Docs cần sync": `docs/specs/FRONTEND_SPEC.md` §4 (error model, `/health`)
