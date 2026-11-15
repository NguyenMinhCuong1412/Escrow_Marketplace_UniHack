# MKT-005 — BÁO CÁO KIỂM THỬ TOÀN DIỆN (FINAL QA) & XÁC MINH AVALANCHE FUJI

**Ngày thực hiện:** 2026-11-15\
**Repository:** `D:\Escrow_Marketplace_Demo`\
**Nhánh / Commit kiểm thử:** `main` (`bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5` + thay đổi local MKT-001..MKT-004 chưa commit)\
**Phạm vi:** Kiểm thử độc lập toàn diện trước khi freeze code UniHack (`MKT-001` → `MKT-004`, Smart Contract, Backend, AI Pipeline, Frontend UI, Bảo mật, Release Gate & Avalanche Fuji `43113`)\
**Nguyên tắc thực thi:** QA read-only; **không sửa code**, không commit/push/deploy, không đọc/in giá trị secret `.env*`, không gửi giao dịch Fuji thật, không để lại dữ liệu sản phẩm giả trong DB thật.

---

## 1. Tóm Tắt Điều Hành & Kết Luận (Executive Summary & Verdict)

**Verdict QA (Codebase MKT-001..004): `CONDITIONAL GO`** *(Đủ điều kiện đóng băng phần logic phần mềm đã kiểm thử, nhưng **`NO-GO` cho Release Gate `DEMO-READY` trên Avalanche Fuji** cho tới khi Project Owner xử lý các hạng mục chặn về vận hành, secret config và đồng bộ tài liệu ở Mục 7).*

### Điểm Đạt Nổi Bật
1. **Toàn bộ test tự động cốt lõi đạt 100% với `0 skipped`:**
   - Smart Contracts (`forge test -vv`): **80/80 PASS**, `0 failed`, `0 skipped` (gồm fuzz 512 runs và `EscrowInvariantTest` 256 runs / 51,200 calls / 0 reverts).
   - Backend + AI Pipeline + Anvil E2E (`pytest -rs`): **183/183 PASS**, `0 failed`, `0 skipped` (bao gồm 5 kịch bản tích hợp Marketplace-to-Escrow-to-AI trong `test_listings_integration.py` và 23 kịch bản `test_integration_anvil.py`).
   - Frontend (`tsc --noEmit`, `npm test`, `npm run build`): TypeScript pass (`exit 0`), **50/50 unit/security/wallet tests PASS** (`0 skipped`), Next.js production build **PASS** (27 routes).
2. **Logic Marketplace & Chống Oversell hoạt động chính xác trên trình duyệt thật:**
   - Đã chạy kiểm thử end-to-end trên `next start` (`127.0.0.1:3125`) + FastAPI (`127.0.0.1:8125`) cô lập với DB tạm trên disk: Browse Guest, tìm kiếm `"LEGO"`, lọc danh mục/tình trạng/giá, sắp xếp, phân trang (`Trang 1/2` → `Trang 2/2`), responsive Desktop `1280x800` & Mobile `375x812` (`scrollWidth=360 <= 375`), navigation bàn phím `Tab`, bảo vệ route `/sell` → `/auth?returnUrl=%2Fsell`, khôi phục Local Wallet → redirect lại `/sell`, Edit/Pause/Resume/Reject, và **hai Buyer cùng tranh món `quantity=1`** chặn Buyer thứ hai bằng **HTTP `409 OUT_OF_STOCK_OR_RESERVED`** kèm toast tiếng Việt rõ ràng.
3. **Tính toàn vẹn kiến trúc Escrow & AI Authority Boundary được giữ vững:**
   - ABI giữa `contracts/out/`, `backend/abi/`, `frontend/lib/abi/` khớp SHA-256 từng byte.
   - `backend/chain.py` chỉ có duy nhất giao dịch `attest(...)`; không có hàm giao dịch nào khác của AI agent.
   - Tiền hàng thanh toán P2P off-chain (`Cọc 30% AVAX` mỗi bên, `CDU` Soulbound mint/burn 1:1) được giữ nguyên vẹn; không có chuỗi `"TrustPact"` trong mã nguồn.

### Các Hạng Mục Chặn / Tồn Đọng Chính
- **[P0 / Release-Gate Blocker] Hạ tầng chạy live Fuji (`43113`) chưa sẵn sàng:** Ví AI agent trên Fuji (`0x579e...D081`) chỉ còn **`0.05 AVAX`** (dưới ngưỡng tối thiểu `0.5 AVAX` của Release Gate Tier 1 #5), `backend/.env` chưa được tạo (`GET /health` báo `ok: False, Thiếu cấu hình: AGENT_PRIVATE_KEY`), nên luồng giao dịch live trên Avalanche Fuji và upload Pinata thật với `PINATA_JWT` **chưa thể kiểm thử (`BLOCKED / NOT TESTED`)**.
- **[P1 / Security Config] Fallback secret hardcoded trong `frontend/lib/auth-session.ts` & thiếu guard `REQUIRE_PROXY_SIGNATURE`:** `auth-session.ts:L10` fallback về `'escrow-marketplace-fuji-session-secret-2026'` khi thiếu `SESSION_SECRET`/`ATTEST_API_KEY`; `frontend/.env.local.example` không khai báo `SESSION_SECRET`, `ATTEST_API_KEY`, `REQUIRE_PROXY_SIGNATURE`; `backend/attest_service.py` để `REQUIRE_PROXY_SIGNATURE=false` mặc định và `insecure_reasons(43113)` chưa bắt buộc cờ này; `/api/verify` và `/api/uris` chưa gọi `validateCsrfRequest`.
- **[P1 / Docs & Release Gate] Tài liệu & `README.md` lệch nghiêm trọng:** `README.md` còn 4 `[TBD]` ở mục Demo & Tài liệu và mục Frontend lỗi thời; `docs/context/CURRENT_STATUS.md:L32` ghi sai địa chỉ Fuji Escrow cũ (`0x1F048...` thay vì `0x19D053...`); toàn bộ `docs/context/*` lỗi thời so với MKT-001..004.
- **[P2 / Tooling & Repo Hygiene]:** `npm run lint` thất bại (`exit 1`, chưa cấu hình ESLint); Docker daemon chưa chạy (`NOT TESTED`); có file rác untracked `"ecurity and frontend UI\357\200\242"` trên working tree và các thay đổi MKT-001..004 chưa được commit/cleanup CRLF.

---

## 2. Ma Trận Xác Minh (Verification Matrix)

| Nhóm | Hạng mục kiểm thử | Trạng thái | Ghi chú / Bằng chứng ngắn |
|---|---|---|---|
| **A. Marketplace UI** | DB thật trống (`0` listing giả) & Empty state | **PASS** | `backend/data/marketplace.db` = 0 rows; `GET /api/listings` lúc DB rỗng trả `total: 0`. |
| **A. Marketplace UI** | Guest browse `/` (`1280x800` & `375x812`), search, filter, sort, pagination | **PASS** | Tìm `"LEGO"`, lọc danh mục/tình trạng/giá, chuyển Trang 1/2 ↔ 2/2, `360px <= 375px` (no overflow), 0 lỗi JS/React. |
| **A. Marketplace UI** | Chi tiết `/listings/[id]`: gallery 3 ảnh, SKU, cọc 30% mỗi bên, Guest prompt | **PASS** | Hiển thị `1 / 3`, `SKU: LEGO-10305-QA01`, giá `2 AVAX`, cọc `0.6 AVAX` Seller + `0.6 AVAX` Buyer. |
| **A. Marketplace UI** | Seller `/sell`: Edit, Pause (`Tạm ẩn`), Resume (`Mở bán lại`), Reject | **PASS** | Chỉnh sửa tiêu đề + chuyển trạng thái `ACTIVE ↔ PAUSED` + từ chối request (`REJECTED`) cập nhật tức thời trên UI. |
| **A. Marketplace UI** | Seller `/sell`: Tạo tin đăng mới qua upload ảnh IPFS trên cấu hình Fuji thiếu `PINATA_JWT` | **PARTIAL / BLOCKED** | UI upload qua `/api/pin` fail-closed `503 IPFS_PROVIDER_UNCONFIGURED` trên `43113` khi thiếu `PINATA_JWT` (đúng thiết kế bảo mật); upload thành công với Pinata thật chưa test (`BLOCKED`). Creation flow API `POST /api/listings` test trực tiếp HTTP `201` PASS. |
| **A. Marketplace UI** | Hai Buyer cùng yêu cầu sản phẩm `quantity=1` (chống oversell) | **PASS** | Buyer 1 accept → `ACCEPTED` + TTL countdown; Buyer 2 accept trên UI → BFF/Backend trả `409 OUT_OF_STOCK_OR_RESERVED` + toast lỗi, không oversell. |
| **A. Marketplace UI** | Accessibility (`Tab` focus, `alt`, button labels) & Console error | **PASS** | `Tab` di chuyển focus rõ ràng; ảnh có `alt`; chỉ có `ERR_BLOCKED_BY_ORB` cho URL gateway `gateway.pinata.cloud` của CID placeholder, 0 lỗi JS/React/API nội bộ. |
| **B. Wallet & Auth** | Bảo vệ route (`/sell` Guest → `/auth?returnUrl=%2Fsell`) & redirect lại | **PASS** | Khôi phục Local Wallet → đăng nhập thành công → tự redirect về `/sell` đúng `returnUrl`. |
| **B. Wallet & Auth** | Local Wallet: Tạo, khôi phục mnemonic, mã hoá AES-GCM, khóa ví | **PASS** | Khôi phục trực tiếp trên `/auth/local` + 7 test mã hoá/tamper trong `npm test` PASS. |
| **B. Wallet & Auth** | Core Wallet & modal 5 ví: chọn ví, báo lỗi, thoát modal reset thanh ban đầu | **PARTIAL** | Test trên trình duyệt: modal đủ 5 ví, click `Core` (không extension) báo `"Chưa phát hiện ví Core"`, đóng modal nút reset về `"Kết nối ví"`. Logic `-32002` / `4001` reject PASS trong `wallet-providers.test.cjs`. Extension Core Wallet thật chưa có trong Chromium headless (`NOT TESTED`). |
| **B. Wallet & Auth** | Ngắt kết nối & kiểm tra không lộ secret ở client | **PASS** | Navbar "Ngắt kết nối" xoá phiên + chuyển `/auth`; DOM scan & `escrow_auth_session` `HttpOnly` không lộ mnemonic, private key, `SESSION_SECRET`, `ATTEST_API_KEY`. |
| **C. Avalanche Escrow** | Smart contract suite (`Escrow.sol`, `CollectibleToken.sol`) | **PASS** | `forge test -vv`: 7 suites, **80 passed, 0 failed, 0 skipped** (512 fuzz + 51,200 invariant calls). |
| **C. Avalanche Escrow** | Tích hợp Anvil: `createTrade → bind-trade → deposit AVAX/CDU → evidence → attest → resolveClean` + retry/TTL/oversell/cancel | **PASS** | `pytest -rs`: `test_integration_anvil.py` (23 tests) + `test_listings_integration.py` (5 tests) đều **PASS**, 0 skipped. |
| **C. Avalanche Escrow** | Quyền hạn AI Agent & mô hình AVAX/CDU | **PASS** | `rg "functions\.\w*\(" backend/` chỉ gọi tx `attest`; `MAX_DEPOSIT_BPS=3000`, `PENALTY_BPS=500`, CDU mint/burn 1:1 non-transferable đã kiểm chứng on-chain & test. |
| **D. Fuji & IPFS Config** | Đối chiếu địa chỉ contract, ABI parity & tham số `43113` trên RPC Fuji | **PASS** | Escrow `0x19D0...4eb00`, Token `0xD0c9...1F78`, Agent `0x579e...D081`, Owner `0xCa76...39Eb`, `nextTradeId=2`, windows `600/600/90` khớp 100% `43113.json`; ABI SHA-256 trùng khớp 3 nơi. |
| **D. Fuji & IPFS Config** | Cấu hình runtime Fuji: `PINATA_JWT`, `backend/.env`, số dư gas ví Agent >= 0.5 AVAX | **FAIL / BLOCKED** | Thiếu `backend/.env` (`/health` báo `ok: False`); ví Agent Fuji chỉ có **`0.05 AVAX`** (< `0.5 AVAX`); `/api/pin` trên `43113` trả fail-closed `503` khi thiếu `PINATA_JWT`. |
| **D. Fuji & IPFS Config** | Giao dịch E2E live trên Avalanche Fuji (`43113`) & IPFS Pinata thật | **BLOCKED / NOT TESTED** | Không có private key test & `PINATA_JWT` hợp lệ trên môi trường QA và ví Agent thiếu gas (chỉ Owner thực hiện theo checklist Mục 6). |
| **D. Tooling & Docs** | Frontend `tsc --noEmit`, `npm test`, `npm run build` | **PASS** | `TSC_EXIT=0`, `50/50` pass, `BUILD_EXIT=0` (27 routes). |
| **D. Tooling & Docs** | Frontend `npm run lint` | **FAIL** | `LINT_EXIT=1`: `next lint` prompt cấu hình ESLint tương tác vì chưa cài/cấu hình ESLint. |
| **D. Tooling & Docs** | Docker build (`backend/Dockerfile`) | **NOT TESTED** | Docker Desktop daemon chưa chạy (`dockerDesktopLinuxEngine` pipe not found). |
| **D. Tooling & Docs** | `README.md` & `docs/context/*` parity & hygiene | **FAIL** | `README.md` còn 4 `[TBD]`; `CURRENT_STATUS.md` sai địa chỉ Escrow; file rác untracked trên git tree. |

---

## 3. Bằng Chứng Kiểm Thử, Lệnh Đã Chạy & Môi Trường

### Môi trường thực thi
- **OS:** Windows (`powershell`)
- **Python venv:** `D:\Escrow_Marketplace_Demo\.venv\Scripts\python.exe` (Python `3.14.3`, `pytest-9.2.0`)
- **Foundry:** `forge test` trên Windows
- **Node / Next.js:** Next.js `15.5.29`, `node --test`
- **Browser kiểm thử:** Headless Chromium thông qua `browser` subagent (`http://127.0.0.1:3125`) kết nối tới `next start` + `uvicorn` cô lập (`DATA_DIR` tạm trong `%TEMP%`, đã xóa sạch sau QA).

### Kết quả chi tiết các lệnh

| Lệnh thực thi | Thư mục / Bối cảnh | Kết quả | Tổng kết quan sát trực tiếp |
|---|---|---|---|
| `forge test -vv` | `D:\Escrow_Marketplace_Demo\contracts` | **PASS** | `Ran 7 test suites in 8.30s (8.88s CPU time): 80 passed, 0 failed, 0 skipped` (`EscrowDeployTest` 6, `CollectibleTokenTest` 11 w/ 512 fuzz, `EscrowAdversarialTest` 4, `EscrowEvidenceAttestTest` 16, `EscrowCreateDepositTest` 18 w/ 512 fuzz, `EscrowResolveTest` 24 w/ 512 fuzz, `EscrowInvariantTest` 1 w/ 256 runs & 51,200 calls). |
| `.\.venv\Scripts\python.exe -m pytest -rs` | `D:\Escrow_Marketplace_Demo` | **PASS** | `183 passed in 115.91s (0:01:55)`, 0 failed, 0 skipped (gồm `ai-pipeline/tests/test_evidence_check.py`, `test_qr_nonce.py`, `backend/tests/test_integration_anvil.py`, `test_listings_integration.py`, `test_listings_unit.py`, `test_service_unit.py`). |
| `npx tsc --noEmit` | `D:\Escrow_Marketplace_Demo\frontend` | **PASS** | `TSC_EXIT=0` (0 lỗi TypeScript). |
| `npm test` | `D:\Escrow_Marketplace_Demo\frontend` | **PASS** | `ℹ tests 50 / ℹ pass 50 / ℹ fail 0 / ℹ skipped 0 / ℹ duration_ms 3561.1152` (`NPM_TEST_EXIT=0`). |
| `npm run build` | `D:\Escrow_Marketplace_Demo\frontend` | **PASS** | `BUILD_EXIT=0`, biên dịch thành công 27 route (`✓ Compiled successfully in 5.4s`). |
| `"" \| npm run lint` (`CI=true`) | `D:\Escrow_Marketplace_Demo\frontend` | **FAIL** | `LINT_EXIT=1`: `next lint` hiện prompt cài đặt ESLint tương tác do chưa cấu hình ESLint. |
| `docker info --format '{{.ServerVersion}}'` | `D:\Escrow_Marketplace_Demo` | **NOT TESTED** | Docker CLI `29.8.1`, `DOCKER_INFO_EXIT=1` (`npipe:////./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`). |
| ABI SHA-256 Parity Script (Python) | `D:\Escrow_Marketplace_Demo` | **PASS** | `Escrow.json`: canonical SHA-256 `192ceacc4204f4d2`, file SHA-256 `4e7cc05ccb532119` (`EXACT_FILE_EQ: True`). `CollectibleToken.json`: canonical SHA-256 `cd457b3ecf34520a`, file SHA-256 `c91be5d66cb19e5d` (`EXACT_FILE_EQ: True`). |
| Fuji Read-Only RPC Check (`web3`) | `https://api.avax-test.network/ext/bc/C/rpc` | **PASS (Read)** / **FAIL (Gas)** | Block `61072641`, `escrow_code_len=9466`, `token_code_len=2869`, `nextTradeId=2`, windows `600/600/90`, bps `3000/500`, `Collectible Deposit Unit (CDU)`. **Balance:** `agent=0.05 AVAX`, `owner=0.04999999945013616 AVAX`. |
| Fuji Fail-Closed Guard Test (`TestClient` + live HTTP BFF) | `%TEMP%\mkt005_live_qa` (đã xóa) | **PASS** | `insecure_reasons(43113)` bắt đủ `ATTEST_API_KEY is empty`, `ALLOW_LOCAL_HOSTS is True`, `ENFORCE_EVIDENCE_HASH is False`. `POST /api/pin` (session `43113`, không `PINATA_JWT`) trả `503 IPFS_PROVIDER_UNCONFIGURED`. |
| Interactive Browser QA (`browser` subagent) | `http://127.0.0.1:3125` + `:8125` (đã dừng & xóa DB tạm) | **PASS** | Xem Mục 2 và bằng chứng ảnh `browser_evidence/.../final_step_51.png`; xác nhận `Set-Cookie Secure?: True` hoạt động qua `127.0.0.1` trên Chromium; `409 OUT_OF_STOCK_OR_RESERVED` chặn Buyer 2 khi `qty=1` đã giữ chỗ. |
| Repo DB Check (`sqlite3` RO) | `D:\Escrow_Marketplace_Demo\backend\data\marketplace.db` | **PASS** | `listings=0`, `listing_images=0`, `purchase_requests=0`, `listing_trades=0`. Không có dữ liệu giả tồn đọng. |

---

## 4. Danh Sách Phát Hiện Lỗi (P0 / P1 / P2 Findings) & Đề Xuất Sửa Tối Thiểu

> **Lưu ý:** Theo yêu cầu QA-first, chưa áp dụng bất kỳ bản vá code nào. Các đề xuất dưới đây chỉ là phương án tối thiểu để Owner phê duyệt trước khi sửa.

### P0 — Critical / Release-Gate Blockers

1. **MKT05-P0-01: Ví AI Agent trên Fuji thiếu gas (`0.05 AVAX < 0.5 AVAX`) và thiếu `backend/.env` cho runtime live Fuji (`43113`)**
   - **Tái hiện:**
     1. Truy vấn số dư trên RPC Fuji (`43113`) với `agent` = `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081` → kết quả `0.05 AVAX` (và `owner` = `0xCa76...39Eb` có `0.05 AVAX`). Tiêu chí Release Gate Tier 1 #5 yêu cầu ví agent có tối thiểu `0.5 AVAX`.
     2. Kiểm tra file cấu hình chỉ thấy `backend/.env.example`, không có `backend/.env`; khởi động Backend mặc định và gọi `GET /health` trả `ok: False, error: "Thiếu cấu hình: AGENT_PRIVATE_KEY..."`.
   - **Tác động:** AI Auto-Agent không thể chạy live trên Fuji; luồng E2E thật trên `43113` chưa thể kiểm chứng.
   - **Đề xuất sửa:** Owner nạp faucet Fuji cho ví agent lên `>= 0.5 AVAX` (và ví owner/demo buyer/seller), tạo `backend/.env` từ `backend/.env.example` với cấu hình production-safe cho Fuji (`AGENT_AUTO=true`, `ALLOW_LOCAL_HOSTS=false`, `ENFORCE_EVIDENCE_HASH=true`, `ATTEST_API_KEY` mạnh, `REQUIRE_PROXY_SIGNATURE=true`, `VERIFY_CHAIN_BEFORE_TTL_RELEASE=true`), và cấu hình `PINATA_JWT` + các biến BFF trong `frontend/.env.local`.

### P1 — High

2. **MKT05-P1-01: Hardcoded fallback HMAC session secret trong `frontend/lib/auth-session.ts` & thiếu khai báo env BFF trong `frontend/.env.local.example`**
   - **Vị trí:** `frontend/lib/auth-session.ts:L9-11`, `frontend/.env.local.example:L1-21`.
   - **Tái hiện / Phân tích:** `getSecretKey()` dùng `process.env.SESSION_SECRET || process.env.ATTEST_API_KEY || 'escrow-marketplace-fuji-session-secret-2026'`. Nếu người vận hành triển khai chỉ dựa vào `frontend/.env.local.example` (vốn **không liệt kê** `SESSION_SECRET`, `ATTEST_API_KEY`, `REQUIRE_PROXY_SIGNATURE`, `BACKEND_URL`), Next.js sẽ âm thầm ký cookie `escrow_auth_session` bằng chuỗi công khai trên Git — cho phép bất kỳ ai giả mạo session cookie của mọi Seller/Buyer ngay cả khi `chainId=43113`.
   - **Đề xuất sửa tối thiểu:** Từ chối tạo/xác thực session (`throw` / trả `503` hoặc reject token) khi `configuredChainId !== 31337` mà cả `SESSION_SECRET` và `ATTEST_API_KEY` đều rỗng; đồng thời bổ sung các biến `SESSION_SECRET`, `ATTEST_API_KEY`, `REQUIRE_PROXY_SIGNATURE=true`, `BACKEND_URL` vào `frontend/.env.local.example`. *(Lưu ý thêm: `app/api/auth/session/route.ts:L127` dùng `secure: NODE_ENV === 'production'` và `activeNonces` `Map` in-memory — nếu demo bằng HTTP qua LAN IP không phải `localhost`/`127.0.0.1` hoặc chạy multi-worker, cần HTTPS reverse proxy hoặc điều chỉnh flag/store tương ứng).*

3. **MKT05-P1-02: `REQUIRE_PROXY_SIGNATURE` mặc định `False` và chưa nằm trong guard `insecure_reasons(43113)`; `/api/verify` & `/api/uris` thiếu CSRF origin check**
   - **Vị trí:** `backend/attest_service.py:L148, L182-196`; `frontend/app/api/verify/route.ts:L21-60`; `frontend/app/api/uris/route.ts:L18-55`.
   - **Tái hiện / Phân tích:** Khi chạy trên chain `43113`, `insecure_reasons()` kiểm tra `ATTEST_API_KEY`, `ALLOW_LOCAL_HOSTS`, `ENFORCE_EVIDENCE_HASH`, `VERIFY_CHAIN_BEFORE_TTL_RELEASE` nhưng chưa chặn khi `REQUIRE_PROXY_SIGNATURE=false`. Ngoài ra, các route MKT-003 đều gọi `validateCsrfRequest`, riêng `/api/verify` và `/api/uris` (tạo từ phase trước) chưa gọi `validateCsrfRequest` và chưa fail-closed nếu thiếu `ATTEST_API_KEY` ở BFF.
   - **Đề xuất sửa tối thiểu:** Bổ sung `validateCsrfRequest(request)` vào `/api/verify` và `/api/uris`; cân nhắc bật `REQUIRE_PROXY_SIGNATURE=true` bắt buộc trên `chain_id != 31337` trong `insecure_reasons()` (sau khi xác nhận đồng bộ `.env` giữa FE BFF và BE).

4. **MKT05-P1-03: Sai lệch địa chỉ Escrow Fuji & lỗi thời nghiêm trọng trong `docs/context/*` và `README.md` (`[TBD]` chưa điền)**
   - **Vị trí:** `README.md:L53, L75-78`; `docs/context/CURRENT_STATUS.md:L32`; toàn bộ `docs/context/*.md`.
   - **Tái hiện:** `CURRENT_STATUS.md:L32` ghi địa chỉ Escrow `0x1F048Bc735CF0277FeFd3fAaA3dA7d8d2c4cCbCf`, trái ngược với contract thật trong `contracts/deployments/43113.json` (`0x19D053c84941411888f5b9e40c854365fdd4eb00`). `README.md:L75-78` vẫn còn `[TBD]`. Điều này vi phạm Release Gate Tier 1 #2 và #3.
   - **Đề xuất sửa tối thiểu:** Cập nhật đồng bộ theo đề xuất tại Mục 8.

### P2 — Medium / Low

5. **MKT05-P2-01: `npm run lint` thất bại do chưa cài/cấu hình ESLint**
   - **Vị trí:** `frontend/package.json` (`"lint": "next lint"`, không có devDependency `eslint` / `eslint-config-next` hoặc file cấu hình ESLint).
   - **Tái hiện:** Chạy `npm run lint` → thoát mã lỗi `1` và hỏi cài đặt tương tác. (Khớp với `DECISION_LOG.md` `0D-08` đã cho phép cài ESLint và `TST-03` trong `RISK_REGISTER.md`).
   - **Đề xuất sửa tối thiểu:** Cài và cấu hình ESLint non-interactive (`eslint`, `eslint-config-next`) nếu Owner chấp thuận thêm devDependency trước hoặc ngay sau freeze (theo `OD-10` sửa P1/P2 tới 19/11).

6. **MKT05-P2-02: Vệ sinh Git working tree (file untracked tên lỗi & CRLF warnings)**
   - **Tái hiện:** `git status -s` trên `D:\Escrow_Marketplace_Demo` xuất hiện tệp rác 0-tác-dụng `"ecurity and frontend UI\357\200\242"`, cảnh báo CRLF trên `frontend/app/api/pin/route.ts`, `frontend/app/page.tsx`, `frontend/components/Navbar.tsx`, và toàn bộ ~39 file MKT-001..004 vẫn chưa được commit vào lịch sử sạch.
   - **Đề xuất sửa tối thiểu:** Kiểm tra nội dung và xóa tệp rác `"ecurity and frontend UI..."` (với sự đồng ý của Owner theo Rule 2.3), chuẩn hóa line ending (`.gitattributes` đã ghi nhận ở `SE-08`), và tạo commit/PR sạch sau khi fix P0/P1.

7. **MKT05-P2-03: Nút `"Xác nhận & Giữ chỗ (30p)"` trên yêu cầu mua thứ 2 của sản phẩm đã hết hàng vẫn cho bấm trước khi trả 409**
   - **Tái hiện:** Khi hai Buyer yêu cầu cùng sản phẩm `quantity=1`, sau khi Seller accept Buyer 1, nút Accept của Buyer 2 vẫn bấm được và chỉ bị chặn khi server trả `HTTP 409 OUT_OF_STOCK_OR_RESERVED` (xử lý an toàn, không crash, không oversell).
   - **Đề xuất UX (không bắt buộc trước freeze):** Hiển thị nhãn/disable phụ trợ nếu `listing.quantity_available < req.quantity` trên danh sách request, vẫn giữ server enforcement `409` làm lớp khóa cuối cùng.

---

## 5. Kiểm Tra AI Authority Boundary, AVAX/CDU & Bảo Mật

1. **AI Authority Boundary (`.agents/rules/55-ai-authority.md` / DEC-013, DEC-014, DEC-016):**
   - **ĐẠT:** `rg -n "functions\.\w*\(" backend/` cho thấy trong `backend/chain.py`, hàm giao dịch (`.build_transaction`) duy nhất là `self.escrow.functions.attest(trade_id, risk_score, flagged, report_hash)` (dòng 234). Các hàm còn lại (`agent()` L130, `getTrade()` L134, `reputationOf()` L148, `nextTradeId()` L152) đều là `.call()` chỉ đọc.
   - Không có `resolveClean`, `resolveDispute`, `fileComplaint`, `cancel*`, `withdraw`, `setAgent`, `deposit`, `submitEvidence`, hay `createTrade` nào do AI backend tự ký gửi.
   - `listings.py` sync tồn kho và trade hoàn toàn chỉ đọc (`read-only RPC reconciliation`), tách biệt với AI pipeline.
2. **Mô hình AVAX & CDU (`CollectibleToken`):**
   - **ĐẠT:** Xác minh trực tiếp trên hợp đồng Fuji `0x19D053c84941411888f5b9e40c854365fdd4eb00` & `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`: `MAX_DEPOSIT_BPS = 3000` (30% AVAX mỗi bên), `PENALTY_BPS = 500` (5%), `CollectibleToken (CDU)` trỏ `escrow()` đúng về hợp đồng Escrow. Không có token thanh toán mới; tiền hàng thanh toán trực tiếp P2P; UI hiển thị rõ ràng `"Cọc 30% / bên"`.
3. **Bảo mật, Secrets & Chống giả mạo (OWASP ASVS Level 1 / `.agents/rules/70-security.md`):**
   - **Git tracked secret files (`git ls-files`):** Chỉ có `backend/.env.example` và `frontend/.env.local.example` (không track `.env` / `.env.local` / `.pem` / `.key`).
   - **Code secret literal scan:** `0` JWT (`eyJhbGci`), `0` PEM private key, `0` Hardhat/Anvil key trong `contracts/src`, `backend/` (trừ tests/scripts), `ai-pipeline/`, `frontend/{app,components,lib}`. (Lưu ý P1 `MKT05-P1-01` về fallback `SESSION_SECRET` và `MKT05-P1-02` về `REQUIRE_PROXY_SIGNATURE`).
   - **Fail-closed trên Fuji (`43113`):** Đã xác minh trực tiếp `/api/pin` trả `503` nếu thiếu `PINATA_JWT`, `insecure_reasons(43113)` phát hiện đủ các toggle nguy hiểm (`ATTEST_API_KEY` rỗng, `ALLOW_LOCAL_HOSTS=true`, `ENFORCE_EVIDENCE_HASH=false`, `VERIFY_CHAIN_BEFORE_TTL_RELEASE=false`).
   - **Secret Scan Git History (Release Gate):** Chưa chạy công cụ quét toàn bộ lịch sử commit như `gitleaks` (đã cho phép cài theo `DECISION_LOG.md` `0D-08`, Risk `SEC-09` còn `OPEN`) — **khuyến nghị chạy trước khi công khai repo**.
   - **Rủi ro đã biết còn `OPEN` / `BLOCKED-OWNER` trong `docs/agent-ops/RISK_REGISTER.md`:** Cần Owner đối chiếu trước Release Gate gồm `SEC-02` (`High` — rate-limit theo IP & key auth), `SEC-03` & `SEC-04` (`High` `BLOCKED-OWNER` — quyền tập trung ở Owner EOA & chưa có timeout trạng thái `Disputed`), `PC-02`/`PC-03` (`Critical`/`High` `BLOCKED-OWNER`), `TST-01..03`, `QA-01..02`.

---

## 6. Checklist Kiểm Thử Thủ Công Trên Avalanche Fuji (`43113`) Cho Project Owner

Vì môi trường QA agent không được phép đọc/xuất private key, `PINATA_JWT` hay gửi giao dịch Fuji thật, Project Owner vui lòng tự thực hiện checklist sau trước khi đóng băng demo:

1. **Chuẩn bị ví & cấu hình Fuji:**
   - [ ] Nạp Faucet Fuji sao cho ví AI Agent (`0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081`) có **`>= 0.5 AVAX`** (hiện tại là `0.05 AVAX`), ví Owner (`0xCa76...39Eb`) và 2 ví demo (Seller, Buyer) mỗi ví có ít nhất `>= 0.3 AVAX` + đủ giá trị cọc 30% cho món hàng demo.
   - [ ] Tạo `backend/.env` (từ `.env.example`): đặt `CHAIN_ID=43113`, `RPC_URL=https://api.avax-test.network/ext/bc/C/rpc`, `ESCROW_ADDRESS=0x19D053c84941411888f5b9e40c854365fdd4eb00`, `AGENT_PRIVATE_KEY=<ví agent>`, `ATTEST_API_KEY=<chuỗi random >=32 ký tự>`, `REQUIRE_PROXY_SIGNATURE=true`, `AGENT_AUTO=true`, `ALLOW_LOCAL_HOSTS=false`, `ENFORCE_EVIDENCE_HASH=true`, `VERIFY_CHAIN_BEFORE_TTL_RELEASE=true`.
   - [ ] Cập nhật `frontend/.env.local`: `NEXT_PUBLIC_CHAIN_ID=43113`, `NEXT_PUBLIC_ESCROW_ADDRESS=0x19D053c84941411888f5b9e40c854365fdd4eb00`, `NEXT_PUBLIC_TOKEN_ADDRESS=0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`, `NEXT_PUBLIC_DEPLOY_BLOCK=60980241`, `PINATA_JWT=<JWT Pinata thật>`, `ATTEST_API_KEY=<trùng backend>`, `SESSION_SECRET=<chuỗi random >=32 ký tự khác ATTEST_API_KEY>`, `REQUIRE_PROXY_SIGNATURE=true`.
2. **Kiểm tra khởi động sạch & Health Check:**
   - [ ] Khởi động Backend & `npm run build && npm start` (rebuild lại nếu vừa đổi `NEXT_PUBLIC_*` trong `.env.local`!).
   - [ ] Gọi `GET /health`: xác nhận `ok: true`, `chain_id: 43113`, `agent_matches_contract: true`, `agent_auto: true`, `agent_running: true`, `security_toggles.insecure_for_chain: false`.
   - [ ] Mở trình duyệt ẩn danh → `/` xác nhận DB trống sạch (`0` listing giả).
3. **Kiểm thử Core Wallet & Extension thật (Fuji 43113):**
   - [ ] Kết nối bằng Core Wallet extension: thử **từ chối** ký trong popup Core (bước connect & bước sign auth) → xác nhận hiện thông báo hủy và thoát modal quay về trạng thái ban đầu gọn gàng.
   - [ ] Thử nối ví ở mạng khác Fuji (vd Ethereum Mainnet / Avalanche Mainnet) → xác nhận banner chuyển mạng về Avalanche Fuji (`43113`) hoạt động.
4. **Kiểm thử Luồng Live End-to-End Trên Fuji (`43113`) + Pinata thật:**
   - [ ] Seller đăng 1 sản phẩm đồ sưu tầm (`quantity=1`, upload 2–3 ảnh thật lên Pinata qua `/api/pin`, xác nhận ảnh load qua Pinata gateway không vỡ).
   - [ ] Buyer 1 & Buyer 2 cùng bấm gửi yêu cầu mua; Seller bấm **Chấp nhận** Buyer 1 → kiểm tra Buyer 2 bị chặn `409`.
   - [ ] Seller bấm **Tạo Escrow (`createTrade`)** bằng Core Wallet → xác nhận event `TradeCreated`, `bind-trade` lưu `tradeId` thành công (và thử kịch bản ngắt mạng lúc bind / reload trang `/sell` để xác nhận nút khôi phục `pendingBindTrade` gắn lại `tradeId` đúng).
   - [ ] Seller & Buyer 1 cùng **Đặt cọc (`deposit`)** 30% AVAX → xác nhận số dư `CDU` tăng đúng 1:1 on-chain trên Snowtrace Fuji.
   - [ ] Cả 2 bên upload ảnh/video có mã **QR Nonce** lên Pinata → `submitEvidence` on-chain → xác nhận AI Auto-Agent tự động chạy (`AGENT_AUTO=true`) và ký giao dịch **`attest()`** thành công trên Fuji (`nextTradeId` tăng, xem Explainable AI Report tại `/trade/[id]/report`).
   - [ ] Hết `DISPUTE_WINDOW` (`90s` trên contract Fuji hiện tại) → gọi **`resolveClean`** → xác nhận AVAX cọc được hoàn lại cho hai bên, `CDU` bị burn về `0`, điểm reputation tăng `+1`, và trạng thái listing/request trên Marketplace đồng bộ thành `COMPLETED` / `SOLD`.
   - [ ] *(Tùy chọn)* Thử thêm 1 trade khác để test `cancelUnfunded()` hoặc `fileComplaint` + `/admin` `resolveDispute` bằng ví Owner (`0xCa76...39Eb`).
5. **Dọn dữ liệu test & Ghi hình dự phòng:**
   - [ ] Nếu muốn trình diễn chợ sạch hoặc chỉ giữ sản phẩm mẫu thực tế hợp lệ do team tự đăng, xóa `backend/data/marketplace.db` thử nghiệm trước khi quay video cuối.
   - [ ] Quay sẵn **video demo dự phòng (`<= 3 phút`)** chạy mượt luồng Fuji thật theo Release Gate Tier 1 #8.

---

## 7. Danh Sách Hành Động Cuối Trước Freeze Code (Final Pre-Freeze Action List)

| Thứ tự | Mức độ | Hành động cụ thể | Người phụ trách | Trạng thái bắt buộc trước Freeze / Gate |
|---|---|---|---|---|
| **1** | **P0** | Nạp Faucet Fuji cho ví AI Agent (`0x579e...D081`) đạt **`>= 0.5 AVAX`** + ví Owner/Demo đủ gas | Project Owner | **BẮT BUỘC** (Release Gate #5) |
| **2** | **P0** | Thiết lập `backend/.env` & `frontend/.env.local` chuẩn Fuji (`AGENT_AUTO=true`, `PINATA_JWT`, `ATTEST_API_KEY`, `SESSION_SECRET`, `REQUIRE_PROXY_SIGNATURE=true`), chạy & chụp/ghi lại 1 luồng E2E live trên Fuji (Mục 6) | Project Owner | **BẮT BUỘC** (Release Gate #4, #6, #7) |
| **3** | **P1** | Vá `frontend/lib/auth-session.ts` bỏ fallback secret công khai trên chain `43113`; cập nhật `frontend/.env.local.example`; thêm `validateCsrfRequest` cho `/api/verify` & `/api/uris`; cân nhắc đưa `require_proxy_signature` vào `insecure_reasons(43113)` | Antigravity (khi Owner duyệt sửa) | **KHUYẾN NGHỊ MẠNH TRƯỚC FREEZE** |
| **4** | **P1** | Điền hết 4 `[TBD]` trong `README.md` (Link Video, Slide, Live dApp, Fuji Escrow `0x19D0...4eb00`) & cập nhật `docs/context/*` theo Mục 8 | Owner / Cowork / Antigravity | **BẮT BUỘC** (Release Gate #2, #3) |
| **5** | **P2** | Dọn file untracked tên lỗi `"ecurity and frontend UI..."`, cấu hình ESLint (`npm run lint`), xử lý CRLF & chạy `gitleaks` trên git history (`SEC-09`), sau đó commit/PR/QA review | Antigravity + Owner | Theo `OD-08` & `OD-10` |
| **6** | **P1** | Cập nhật trạng thái các rủi ro `BLOCKED-OWNER` (`PC-02`, `PC-03`, `SEC-03`, `SEC-04`, `PC-05`, `SEC-07`) trong `docs/agent-ops/RISK_REGISTER.md` theo `DECISION_LOG.md` (`OD-01..OD-07`) | Owner / Cowork | **BẮT BUỘC** (Release Gate Tier 1 #10) |

---

## 8. Đề Xuất Cập Nhật Tài Liệu Lỗi Thời (`docs/context/*` & Tài Liệu Kỹ Thuật)

Toàn bộ các file dưới đây hiện **chưa có header `Verified against commit:`** và đang mâu thuẫn với trạng thái thực tế của mã nguồn `MKT-001`..`MKT-004` + `contracts/deployments/43113.json`:

1. **`docs/context/CURRENT_STATUS.md`:**
   - **Sai lệch:** Dòng 32 ghi địa chỉ Fuji Escrow cũ `0x1F048Bc735CF0277FeFd3fAaA3dA7d8d2c4cCbCf`; bảng trạng thái dừng ở `11/11/2026` (chưa phản ánh `MKT-001..005`, `test_listings_*`, `frontend` Marketplace Shopee-style, 80 Foundry tests / 183 pytest / 50 frontend tests).
   - **Đề xuất:** Cập nhật Escrow Fuji chính xác là `0x19D053c84941411888f5b9e40c854365fdd4eb00` (Token `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`, block `60980241`), bổ sung tiến độ `MKT-001` → `MKT-005` và ngày cập nhật mới nhất.
2. **`docs/context/TECH_STACK.md`:**
   - **Sai lệch:** Dòng 10 ghi `Database: Không dùng DB`; dòng 15 ghi `Frontend: NOT STARTED`; dòng 14/45 còn số cũ (Python 3.12 / 177 tests).
   - **Đề xuất:** Cập nhật `Database: SQLite WAL (DATA_DIR/marketplace.db)` cho dữ liệu off-chain Marketplace; cập nhật `Frontend: Next.js 15 App Router + TypeScript + TailwindCSS + wagmi/viem + RainbowKit + Local Wallet` + BFF HMAC proxy + `node --test`.
3. **`docs/context/DECISION_LOG.md`:**
   - **Sai lệch:** Các dòng `OD-01..OD-10` nằm lẫn ở cuối bảng, `DEC-005` và `DEC-011` chưa đổi trạng thái sang `SUPERSEDED` dù `OD-09` đã xác nhận thay thế; các quyết định kiến trúc mới của Marketplace (SQLite WAL `marketplace.db`, giữ chỗ 30 phút atomic `BEGIN IMMEDIATE`, BFF HMAC chống replay, `REQUIRE_PROXY_SIGNATURE`, không thanh toán tiền hàng qua contract) chưa được ghi thành dòng `DEC-018+`.
   - **Đề xuất:** Đổi `DEC-005` & `DEC-011` thành `SUPERSEDED` (do `DEC-013` và việc hoàn thiện Frontend `ESC-020..MKT-004`), thêm DEC xác nhận cho QR Nonce (`OD-09`) và đề xuất các DEC `PROPOSED` cho kiến trúc Marketplace `MKT-001..003` trình Owner duyệt `CONFIRMED`.
4. **`docs/context/PROJECT_BRIEF.md`, `PRODUCT_VISION.md`, `BUSINESS_REQUIREMENTS.md`, `OPEN_QUESTIONS.md`:**
   - **Sai lệch:**
     - `PROJECT_BRIEF.md`: Vẫn ghi `"tên chính thức chưa chốt (Q-011)"`, `"Đang chuẩn bị frontend + deploy Fuji"`, cây thư mục thiếu `frontend/`, `backend/db.py`, `backend/listings.py`, `backend/auto_agent.py`.
     - `PRODUCT_VISION.md`: Vẫn còn tuyên bố `"Không có: Human arbitrator"` (đối lập `OD-02` & `resolveDispute`), `"giải ngân tự động"` (đối lập `OD-01`), và dùng ví dụ đối thủ cũ `"TrustPact"`.
     - `BUSINESS_REQUIREMENTS.md`: Sơ đồ state machine (dòng 30–40) vẫn cần đồng bộ 100% với 6 enum trong `Escrow.sol` (`PC-01`) và bổ sung mô tả hai giai đoạn off-chain (`Listing` → `PurchaseRequest` + TTL 30p) trước khi vào `createTrade` on-chain (`MKT-001..004`).
     - `OPEN_QUESTIONS.md`: Các câu `Q-001`, `Q-003`, `Q-004`, `Q-010`, `Q-011`, `Q-012`, `Q-013` vẫn giữ đáp án cũ (`không dùng DB`, `Frontend CHƯA tồn tại`, `Chưa chốt tên`, `chưa deploy lên Fuji`, `Chọn 1 category...`).
   - **Đề xuất:** Thêm header `Verified against commit: <commit-hash>` sau khi merge và đồng bộ lại toàn bộ theo `OD-01..OD-10`, `DEC-013..DEC-017` và `MKT-001..MKT-004`.
5. **`README.md` & `docs/agent-ops/RISK_REGISTER.md`:**
   - **Đề xuất:** Điền các link submission và Fuji Escrow address `0x19D053c84941411888f5b9e40c854365fdd4eb00` vào `README.md`, sửa mục `Bước 4: Chạy Frontend`, và đồng bộ `RISK_REGISTER.md` cho các rủi ro đã xử lý một phần hoặc chuyển trạng thái theo quyết định `OD-01..OD-10` của Owner (chỉ Owner duyệt `ACCEPTED-BY-OWNER`).
