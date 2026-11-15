# MKT-005 — BÁO CÁO REMEDIATION BẢO MẬT P1 & ĐỒNG BỘ TÀI LIỆU

**Ngày lập báo cáo:** 2026-11-15\
**Repository:** `D:\Escrow_Marketplace_Demo`\
**Baseline commit:** `bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5` (+ thay đổi local `MKT-001..MKT-005` chưa commit)\
**Tham chiếu QA:** `docs/agent-ops/reports/MKT-005-qa-report.md`\
**Trạng thái bàn giao:** **CHƯA FINAL FREEZE / KHÔNG COMMIT / KHÔNG MERGE** — Chờ Project Owner nghiệm thu và thực hiện Avalanche Fuji Manual Verification.

---

## 1. Danh Sách Các Hạng Mục P1 Đã Khắc Phục (`SEC-01..SEC-04` & Doc Sync)

1. **`SEC-01` — Loại bỏ fallback Session Secret mặc định & fail-closed trên non-`31337`:**
   - Loại bỏ hoàn toàn fallback secret hardcoded (`'escrow-marketplace-fuji-session-secret-2026'`) trên Avalanche Fuji (`43113`) và mọi mạng khác `31337` trong `frontend/lib/auth-session.ts`.
   - Ưu tiên đọc `SESSION_SECRET` độc lập với `ATTEST_API_KEY`; từ chối token nếu sử dụng chuỗi fallback cũ trên cả `31337` và `43113`; chỉ cấp secret ngẫu nhiên theo tiến trình (`localDevEphemeralSecret = randomBytes(32).toString('hex')`) khi cả server chain và session chain đều là `31337` (local Anvil).
   - Cập nhật `POST /api/auth/session` bắt `SessionConfigError` và trả HTTP `503` (`error_code: "SESSION_MISCONFIGURED"`) thay vì ký cookie bằng secret yếu hoặc văng lỗi 500 thô.
2. **`SEC-02` — Bắt buộc `REQUIRE_PROXY_SIGNATURE=true` trên Fuji (`43113`) trong Backend:**
   - Đưa kiểm tra `require_proxy_signature` vào `insecure_reasons(settings, chain_id)` trong `backend/attest_service.py` để fail-closed `503 INSECURE_CONFIG` nếu triển khai trên mạng khác `31337` mà tắt chữ ký proxy.
   - Siết `authenticate_marketplace_actor` tại `backend/attest_service.py` theo điều kiện `settings.require_proxy_signature or chain_id != 31337 or has_sig_headers`: mọi request Marketplace ghi/riêng tư trên `43113` đều bắt buộc `X-Auth-Timestamp`, `X-Auth-Nonce`, `X-Auth-Signature` (HMAC-SHA256 dùng `hmac.compare_digest`) và kiểm tra chống replay `db.record_proxy_nonce(...)`, trong khi vẫn giữ tương thích local Anvil `31337`.
3. **`SEC-03` — Bảo vệ CSRF cho `/api/verify` và `/api/uris`:**
   - Bổ sung `validateCsrfRequest(request)` ở đầu hàm `POST` tại cả `frontend/app/api/verify/route.ts` và `frontend/app/api/uris/route.ts` bằng helper bảo mật dùng chung của BFF (`frontend/lib/marketplace-bff.ts`).
   - Không làm thay đổi logic xác minh hash bằng chứng on-chain, chữ ký seller hay ranh giới quyền gọi `attest()` của AI Agent.
4. **`SEC-04` — Đồng bộ template biến môi trường `frontend/.env.local.example` & `backend/.env.example`:**
   - Bổ sung đầy đủ các biến BFF server-only còn thiếu trong `frontend/.env.local.example`: `BACKEND_URL`, `SESSION_SECRET`, `ATTEST_API_KEY`, `REQUIRE_PROXY_SIGNATURE=true` và `# ALLOWED_ORIGINS=...` (không chứa bất kỳ secret thật nào).
   - Làm rõ chú thích bắt buộc `REQUIRE_PROXY_SIGNATURE=true` trên Fuji `43113` trong `backend/.env.example`.
5. **Doc Sync P1 — Đồng bộ `README.md`, `docs/context/*` và `docs/agent-ops/RISK_REGISTER.md`:**
   - Cập nhật đồng nhất theo `contracts/deployments/43113.json` (Escrow `0x19D053c84941411888f5b9e40c854365fdd4eb00`, CDU `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`, Agent `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081`, Owner `0xCa76cBE87902108712729A02F78C1F8cC20b39Eb`, deploy block `60980241`, windows `600s/600s/90s`), trạng thái `MKT-001..MKT-005`, mô hình **deposit-only 30% AVAX + CDU Soulbound 1:1**, và ranh giới quyền **AI Agent (`onlyAgent` `attest()` duy nhất)** vs **Owner/Arbiter (`resolveDispute`)**.
   - Bổ sung header `Verified against commit: bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5` (kèm ghi chú working tree chưa commit) vào toàn bộ tài liệu context và risk register; gỡ các con số test hardcode tĩnh dễ lệch (`SE-06`).
   - Cập nhật `DECISION_LOG.md`: đánh dấu `SUPERSEDED` cho `DEC-005` và `DEC-011` theo chỉ thị `OD-09` đã được Owner `CONFIRMED`; thêm `DEC-018..DEC-021` với trạng thái `PROPOSED` (không tự ý gắn `CONFIRMED`).
   - Cập nhật `RISK_REGISTER.md`: ghi nhận tiến độ `MITIGATED / IN_PROGRESS (MKT-005)` chờ QA & Owner merge, giữ nguyên toàn bộ các mục `BLOCKED-OWNER` (`PC-02`, `PC-03`, `PC-05`, `SEC-03`, `SEC-04`, `SEC-07`) theo đúng quy tắc quản trị (không tự đặt `ACCEPTED-BY-OWNER`).

---

## 2. Danh Sách Các File Đã Sửa / Bổ Sung & Nguyên Nhân Gốc Rễ

### A. Nhóm Bảo Mật & Regression Tests (`SEC-01..SEC-04`)

| File | Hành động | Nguyên nhân gốc rễ (Root Cause) & Thay đổi chính |
|---|---|---|
| `frontend/lib/auth-session.ts` | Sửa | `getSecretKey()` fallback sang chuỗi công khai `'escrow-marketplace-fuji-session-secret-2026'` khi thiếu env. Đã sửa fail-closed ném `SessionConfigError` trên non-`31337`, ưu tiên `SESSION_SECRET` độc lập `ATTEST_API_KEY`, dùng `timingSafeEqual` và chỉ sinh `localDevEphemeralSecret` khi cả server & token đều thuộc `31337`. |
| `frontend/app/api/auth/session/route.ts` | Sửa | `POST /api/auth/session` chưa bắt lỗi thiếu cấu hình secret. Đã bắt `SessionConfigError` và trả HTTP `503` (`error_code: "SESSION_MISCONFIGURED"`). |
| `frontend/app/api/verify/route.ts` | Sửa | Route legacy thiếu kiểm tra CSRF `Origin`/`Sec-Fetch-Site`/`Referer`/Content-Type. Đã gọi `validateCsrfRequest(request)` đầu hàm `POST`. |
| `frontend/app/api/uris/route.ts` | Sửa | Route legacy thiếu kiểm tra CSRF trước khi xác thực session và proxy URI sang backend. Đã gọi `validateCsrfRequest(request)` đầu hàm `POST`. |
| `frontend/.env.local.example` | Sửa | Thiếu khai báo mẫu cho các biến BFF (`BACKEND_URL`, `SESSION_SECRET`, `ATTEST_API_KEY`, `REQUIRE_PROXY_SIGNATURE`, `ALLOWED_ORIGINS`), khiến người triển khai dễ bỏ sót trên Fuji. |
| `backend/attest_service.py` | Sửa | `REQUIRE_PROXY_SIGNATURE` mặc định `False` chưa nằm trong `insecure_reasons(settings, chain_id)` và `authenticate_marketplace_actor` chỉ bật verify chữ ký khi flag `True` hoặc có sẵn header. Đã bắt buộc trên `chain_id != 31337` trong cả guard `503 INSECURE_CONFIG` và kiểm tra HMAC + replay nonce. |
| `backend/.env.example` | Sửa | Ghi chú rõ `REQUIRE_PROXY_SIGNATURE=false` chỉ dùng local `31337`; bắt buộc `true` trên Fuji `43113`. |
| `frontend/test/security-remediation.test.cjs` | Thêm mới | Bổ sung unit regression test cho `SEC-01` (thiếu secret `503`/throw, từ chối legacy default, ưu tiên `SESSION_SECRET`, tương thích `31337`) và `SEC-03` (chặn `Origin` lạ `403`, `Sec-Fetch-Site: cross-site` `403`, `Referer` lệch `403`, `text/plain` `415`, cho phép same-origin JSON + `X-API-Key`). |
| `backend/tests/test_service_unit.py` | Sửa | Cập nhật fixture `TestFreeze001BackendFailClosed` phù hợp guard mới và thêm `test_sec02_chain43113_requires_proxy_signature_fail_closed`. |
| `backend/tests/test_listings_unit.py` | Sửa | Thêm `test_sec02_fuji_requires_proxy_signature_and_enforces_hmac_replay` kiểm tra `REQUIRE_PROXY_SIGNATURE` bị bỏ qua trên `43113`, từ chối thiếu chữ ký và chặn replay nonce. |

### B. Nhóm Đồng Bộ Tài Liệu (`README.md`, `docs/context/*`, `RISK_REGISTER.md`, Report)

| File | Hành động | Nội dung đồng bộ chính |
|---|---|---|
| `README.md` | Sửa | Cập nhật sơ đồ kiến trúc `Next.js 15 BFF HMAC` ↔ `FastAPI + SQLite WAL`, mục chạy Frontend, lệnh test (không hardcode số cũ), nguyên tắc ký quỹ 30% AVAX + CDU 1:1 + AI `attest()`, địa chỉ Fuji từ `43113.json`, và `PENDING-OWNER` cho Video / Slide / Live dApp. |
| `docs/context/CURRENT_STATUS.md` | Sửa | Thêm `Verified against commit`, sửa địa chỉ Fuji Escrow sai từ `0x1F048...` sang `0x19D053c84941411888f5b9e40c854365fdd4eb00`, cập nhật tiến độ `MKT-001..MKT-005` và các blocker cấu hình Fuji. |
| `docs/context/TECH_STACK.md` | Sửa | Thêm `Verified against commit`, cập nhật SQLite WAL (`DATA_DIR/marketplace.db`), Next.js `15.5.29` App Router BFF HMAC, `node --test`, bỏ số liệu `177 tests` / `NOT STARTED` lỗi thời. |
| `docs/context/PROJECT_BRIEF.md` | Sửa | Thêm `Verified against commit`, chốt tên `Escrow Marketplace` (`DEC-017`), cập nhật cây thư mục thực tế có `frontend/`, `db.py`, `listings.py`, `auto_agent.py`. |
| `docs/context/PRODUCT_VISION.md` | Sửa | Thêm `Verified against commit`, thay tuyên bố `"Không có human arbitrator"` / `"giải ngân tự động"` bằng mô tả đúng `OD-01`/`OD-02` (AI xử lý luồng sạch `resolveClean`, tranh chấp do Owner `resolveDispute`, cọc 30% AVAX). |
| `docs/context/BUSINESS_REQUIREMENTS.md` | Sửa | Thêm `Verified against commit`, sửa state machine khớp 6 enum states của `Escrow.sol` (`Created`, `AwaitingEvidence`, `Attested`, `Disputed`, `Resolved`, `Cancelled`), bổ sung luồng Marketplace off-chain (`Listing`, `PurchaseRequest` TTL 30m), `cancelUnfunded()` gọi ngay ở `Created`, penalty 5% trên `violatorDeposit`, reputation `-10/+5` và Known Limitations (`OD-01..OD-05`). |
| `docs/context/USER_PERSONAS.md` | Sửa | Thêm `Verified against commit`, cập nhật đa danh mục Marketplace, mô tả đúng `resolveClean()` vs `resolveDispute()`, QR nonce trước OCR, và cảnh báo IPFS công khai (`OD-05`). |
| `docs/context/COMPETITION_CONTEXT.md` | Sửa | Thêm `Verified against commit` và ngày cập nhật mới nhất. |
| `docs/context/DECISION_LOG.md` | Sửa | Thêm `Verified against commit`, chuyển `DEC-005` & `DEC-011` sang `SUPERSEDED` (theo `OD-09`), giữ nguyên `OD-01..OD-10`, thêm `DEC-018..DEC-021` với trạng thái `PROPOSED`. |
| `docs/context/OPEN_QUESTIONS.md` | Sửa | Thêm `Verified against commit`, cập nhật `Q-001`, `Q-003`, `Q-004`, `Q-005`, `Q-009`, `Q-010`, `Q-011` (`Escrow Marketplace`), `Q-012` (đa danh mục), `Q-013` khớp trạng thái hiện tại. |
| `docs/agent-ops/RISK_REGISTER.md` | Sửa | Thêm `Verified against commit`, cập nhật trạng thái `MITIGATED / IN_PROGRESS (MKT-005)` cho các mã liên quan (`RA-01..04`, `PC-01/04/06/07/08`, `SEC-01/02/05/06/08`, `SE-05/06`, `TST-03/05`), ghi rõ `npm run lint` còn FAIL (`TST-03`) và giữ nguyên toàn bộ `BLOCKED-OWNER`. |
| `docs/agent-ops/reports/MKT-005-remediation-report.md` | Thêm mới | Báo cáo kết quả remediation bảo mật P1, đồng bộ tài liệu và kiểm thử sau chỉnh sửa cuối. |

> **Xác nhận phạm vi không chạm (`git diff --name-only -- contracts/ backend/abi/ frontend/lib/abi/ frontend/lib/local-wallet/`):** Trống — **0 thay đổi** đối với Smart Contracts, ABI, Core Wallet connector, Local Browser Wallet hay nghiệp vụ Escrow.

---

## 3. Kết Quả Regression Test Đầy Đủ Sau Chỉnh Sửa Cuối

Mọi lệnh dưới đây được thực thi trực tiếp sau khi hoàn tất toàn bộ chỉnh sửa code bảo mật và tài liệu:

| Hạng mục / Lệnh thực thi | Thư mục / Phạm vi | Trạng thái | Kết quả quan sát trực tiếp |
|---|---|---|---|
| `forge test -vv` | `D:\Escrow_Marketplace_Demo\contracts` | **PASS** | `Ran 7 test suites in 7.83s (8.39s CPU time): 80 tests passed, 0 failed, 0 skipped (80 total tests)` (`FORGE_EXIT=0`). |
| `.\.venv\Scripts\python.exe -m pytest -rs` | `D:\Escrow_Marketplace_Demo` | **PASS** | `185 passed in 105.37s (0:01:45)`, `0 failed`, `0 skipped` (`PYTEST_EXIT=0`; gồm AI Pipeline `test_evidence_check.py` + `test_qr_nonce.py`, Anvil `test_integration_anvil.py` + `test_listings_integration.py`, Unit `test_listings_unit.py` + `test_service_unit.py`). |
| `npx tsc --noEmit` | `D:\Escrow_Marketplace_Demo\frontend` | **PASS** | `TSC_EXIT=0` (0 lỗi TypeScript). |
| `npm test` (`node --test test/*.test.cjs`) | `D:\Escrow_Marketplace_Demo\frontend` | **PASS** | `ℹ tests 55 / ℹ pass 55 / ℹ fail 0 / ℹ skipped 0 / ℹ duration_ms 3363.8529` (`TEST_EXIT=0`). |
| `npm run build` (`next build`) | `D:\Escrow_Marketplace_Demo\frontend` | **PASS** | `✓ Compiled successfully in 6.2s`, build thành công toàn bộ 27 route (`BUILD_EXIT=0`). |
| `git check-ignore -v frontend/.env.local backend/.env .env` | `D:\Escrow_Marketplace_Demo` | **PASS** | `frontend/.gitignore:4:.env*.local` và `.gitignore:2:.env` loại trừ đúng các file chứa secret (`IGNORE_EXIT=0`). |
| Kiểm tra SQLite DB repo (`backend/data/marketplace.db`) | `D:\Escrow_Marketplace_Demo` | **PASS** | `{'listings': 0, 'listing_images': 0, 'purchase_requests': 0, 'listing_trades': 0}` (sạch, không có dữ liệu mẫu giả). |
| `"" \| npm run lint` (`next lint`) | `D:\Escrow_Marketplace_Demo\frontend` | **FAIL** | `LINT_EXIT=1`: `next lint` bật prompt cấu hình ESLint tương tác vì chưa cài/cấu hình ESLint (đã ghi nhận trong `TST-03`). |
| `docker info --format '{{.ServerVersion}}'` / `docker build` | `D:\Escrow_Marketplace_Demo` | **NOT TESTED** | `DOCKER_EXIT=1`: Docker Desktop daemon chưa chạy (`npipe:////./pipe/dockerDesktopLinuxEngine` not found). |
| **Live Avalanche Fuji (`43113`) E2E & Pinata upload thật (`PINATA_JWT`)** | Testnet Fuji (`43113`) | **NOT TESTED** | Chưa thực hiện giao dịch live trên Fuji thật và chưa upload Pinata thật vì chưa có `backend/.env` / `frontend/.env.local` với bí mật thực tế của Owner và ví AI Agent hiện mới có `0.05 AVAX` (< `0.5 AVAX`). |

---

## 4. Các Phát Hiện P0 / P1 / P2 Còn Tồn Đọng

### P0 — Release-Gate Blockers (Vận hành bởi Project Owner)
1. **Chưa nạp đủ AVAX cho ví AI Agent & chưa cấu hình file secret chạy Fuji (`43113`):**
   - Theo quan sát từ kiểm tra Fuji trước remediation, ví AI Agent (`0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081`) chỉ có `0.05 AVAX` (dưới mức Release Gate tối thiểu `0.5 AVAX`), `backend/.env` chưa được tạo, và `PINATA_JWT` / `SESSION_SECRET` / `ATTEST_API_KEY` thật chỉ Owner được phép điền cục bộ.
   - **Hệ quả:** Toàn bộ luồng live End-to-End trên Fuji (`createTrade → bind-trade → deposit AVAX/CDU → Pinata → AI Auto-Agent attest → resolveClean`) hiện là **`NOT TESTED`**.

### P1 — Governance & Vận hành Trước Release Gate / Final Freeze
2. **Các mục chờ Owner trong tài liệu đã đồng bộ:**
   - `README.md`: Demo Video, Pitch Deck / Slide và Live Fuji dApp URL hiện là `PENDING-OWNER` (chỉ được điền sau khi có link công khai thật).
   - `DECISION_LOG.md`: `DEC-018`..`DEC-021` đang ở trạng thái `PROPOSED` (cần Owner rà soát chuyển `CONFIRMED`).
   - `RISK_REGISTER.md`: 6 mã `BLOCKED-OWNER` (`PC-02`, `PC-03`, `PC-05`, `SEC-03`, `SEC-04`, `SEC-07`) giữ nguyên `BLOCKED-OWNER` theo quy tắc 1.2 (chỉ Owner chuyển sang `ACCEPTED-BY-OWNER` / `FIXED`); các mã `MITIGATED / IN_PROGRESS (MKT-005)` chờ QA review & merge để chuyển `FIXED` và cập nhật lại commit hash `Verified against commit`.
3. **Ràng buộc triển khai Production/LAN HTTP cho Session Cookie & Nonce:**
   - `POST /api/auth/session` giữ `secure: NODE_ENV === 'production'` và `activeNonces` dùng `Map` trong bộ nhớ. Với bản demo chạy local/HTTPS (`http://localhost`, `http://127.0.0.1` hoặc `https://...`) và single worker Next.js thì hoạt động đúng; nếu triển khai multi-worker hoặc HTTP qua IP LAN khác `localhost` sẽ cần HTTPS reverse proxy hoặc store dùng chung.

### P2 — Tooling, Git Hygiene & UX Phụ Trợ
4. **ESLint chưa cấu hình (`TST-03`):** `npm run lint` trả `LINT_EXIT=1` vì chưa cài `eslint` / `eslint-config-next`.
5. **Secret scan git history (`SEC-09`):** Chưa chạy `gitleaks` trên toàn bộ lịch sử commit (cần Owner thực hiện trước khi public repo theo `0D-08`).
6. **Docker container build (`backend/Dockerfile`):** `NOT TESTED` vì Docker Desktop daemon chưa bật.
7. **Vệ sinh Git working tree & CRLF:** Còn tệp rác untracked `"ecurity and frontend UI\357\200\242"` (chưa xóa do ràng buộc không xóa file khi chưa có lệnh) và toàn bộ thay đổi `MKT-001..MKT-005` vẫn nằm ở working tree chưa commit/merge.
8. **UX phụ trợ tranh mua (`MKT05-P2-03`):** Nút xác nhận yêu cầu mua thứ 2 trên sản phẩm `quantity=1` vẫn bấm được trên UI trước khi bị backend chặn an toàn bằng HTTP `409 OUT_OF_STOCK_OR_RESERVED`.

---

## 5. Hướng Dẫn Cấu Hình Thủ Công Bắt Buộc Cho Project Owner

> **Nguyên tắc an toàn:** Agent tuyệt đối không đọc, in hoặc ghi secret thật. Project Owner tự thực hiện trực tiếp các bước sau trên máy triển khai:

1. **Nạp Faucet Fuji (`43113`):**
   - Nạp AVAX thử nghiệm qua core.app faucet cho ví AI Agent (`0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081`) đạt tối thiểu **`>= 0.5 AVAX`**.
   - Đảm bảo ví Owner (`0xCa76cBE87902108712729A02F78C1F8cC20b39Eb`) và 2 ví demo (Seller, Buyer) có đủ AVAX trả phí gas và tiền cọc 30%.
2. **Tạo và cấu hình `backend/.env` (từ `backend/.env.example`):**
   - `CHAIN_ID=43113`
   - `RPC_URL=https://api.avax-test.network/ext/bc/C/rpc`
   - `ESCROW_ADDRESS=0x19D053c84941411888f5b9e40c854365fdd4eb00`
   - `AGENT_PRIVATE_KEY=<private key ví agent khớp contract>`
   - `ATTEST_API_KEY=<chuỗi ngẫu nhiên >= 32 ký tự>`
   - `REQUIRE_PROXY_SIGNATURE=true` *(bắt buộc trên Fuji `43113`, nếu `false` backend trả `503 INSECURE_CONFIG`)*
   - `AGENT_AUTO=true`
   - `ALLOW_LOCAL_HOSTS=false`
   - `ENFORCE_EVIDENCE_HASH=true`
   - `VERIFY_CHAIN_BEFORE_TTL_RELEASE=true`
3. **Tạo / cập nhật `frontend/.env.local` (từ `frontend/.env.local.example`):**
   - `NEXT_PUBLIC_CHAIN_ID=43113`
   - `NEXT_PUBLIC_ESCROW_ADDRESS=0x19D053c84941411888f5b9e40c854365fdd4eb00`
   - `NEXT_PUBLIC_TOKEN_ADDRESS=0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`
   - `NEXT_PUBLIC_DEPLOY_BLOCK=60980241`
   - `BACKEND_URL=http://127.0.0.1:8000`
   - `PINATA_JWT=<JWT Pinata thật>` *(không có prefix `NEXT_PUBLIC_`)*
   - `SESSION_SECRET=<chuỗi ngẫu nhiên >= 32 ký tự, ĐỘC LẬP với ATTEST_API_KEY>` *(bắt buộc trên Fuji `43113`, nếu trống `/api/auth/session` trả `503 SESSION_MISCONFIGURED`)*
   - `ATTEST_API_KEY=<giá trị trùng khớp với backend ATTEST_API_KEY>`
   - `REQUIRE_PROXY_SIGNATURE=true`
   - Sau khi lưu `frontend/.env.local`, chạy lại `npm run build && npm start` trước khi test.
4. **Kiểm tra khởi động & chạy Manual Fuji Verification:**
   - Gọi `GET /health` xác nhận `ok: true`, `chain_id: 43113`, `agent_auto: true`, `security_toggles.insecure_for_chain: false`.
   - Thực hiện kiểm thử tay toàn bộ luồng Core Wallet + Pinata thật + 2 Buyer tranh `quantity=1` + `createTrade`/`bind-trade` + cọc 30% AVAX/CDU + QR Nonce + Auto-Agent `attest` + `resolveClean` theo checklist Mục 6 của `docs/agent-ops/reports/MKT-005-qa-report.md`.
5. **Hoàn thiện thủ tục sau Manual QA (trước Final Freeze):**
   - Điền link công khai thật (Demo Video, Pitch Deck, Live Fuji dApp) vào `README.md`.
   - Phê duyệt các mục `DEC-018..DEC-021` (`CONFIRMED`) trong `docs/context/DECISION_LOG.md` và cập nhật trạng thái các mục `BLOCKED-OWNER` trong `docs/agent-ops/RISK_REGISTER.md`.
   - Chạy `gitleaks` quét lịch sử git (`SEC-09`), dọn tệp rác untracked `"ecurity and frontend UI..."`, thực hiện commit/merge sạch và cập nhật hash commit mới vào trường `Verified against commit:` của `docs/context/*` và `RISK_REGISTER.md`.

---

## 6. Kết Luận Mức Độ Sẵn Sàng Chuyển Sang Avalanche Fuji Manual Verification

**Kết luận:** **`READY FOR MANUAL FUJI VERIFICATION` (ĐÃ ĐỦ ĐIỀU KIỆN BƯỚC VÀO KIỂM THỬ THỦ CÔNG TRÊN FUJI `43113`; CHƯA `FINAL FREEZE` / CHƯA `DEMO-READY`).**

- Toàn bộ 4 hạng mục vá bảo mật P1 (`SEC-01..SEC-04`) và đợt đồng bộ tài liệu (`README.md`, `docs/context/*`, `RISK_REGISTER.md`) đã được triển khai đúng phạm vi (không đụng chạm Smart Contract, ABI, Local Wallet hoặc nghiệp vụ Escrow).
- Sau lần chỉnh sửa cuối cùng, toàn bộ bộ kiểm thử tự động đều vượt qua với `0 failed` và `0 skipped`: `forge test -vv` (`80 passed`), `pytest -rs` (`185 passed`), `tsc --noEmit` (`exit 0`), `npm test` (`55 passed`), và `npm run build` (`27 routes` thành công).
- Rào cản duy nhất để thực hiện **Avalanche Fuji Manual Verification** và đạt trạng thái `DEMO-READY` là các cấu hình bí mật cục bộ (`.env`, `.env.local`) và nạp đủ gas AVAX cho ví Agent do Project Owner trực tiếp thực hiện theo hướng dẫn tại Mục 5.
