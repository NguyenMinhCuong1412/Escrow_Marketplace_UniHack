# MKT-FINAL-QA-ANTIGRAVITY — Pre-Freeze Audit & Release Gate Report

- **Task ID:** `MKT-FINAL-QA`
- **Project:** `D:\Escrow_Marketplace_Demo`
- **Role:** Independent Final QA Auditor (Read-only Audit — không chỉnh sửa source code, contracts, ABI, dependencies, `.env`, hay gửi giao dịch blockchain)
- **Git Baseline (`HEAD` / `origin/main`):** `bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5`
- **Target Network:** Avalanche Fuji Testnet (`chainId: 43113`) · Local Anvil (`31337`)
- **Deployed Escrow (`contracts/deployments/43113.json`):** `0x19D053c84941411888f5b9e40c854365fdd4eb00` (deploy block `60980241`, `CollectibleToken` CDU `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`, windows `600s / 600s / 90s`)
- **Audit Scope:** Toàn bộ thay đổi chưa commit của `MKT-001`..`MKT-005`, `MKT-005 Final Remediation`, `FIX-ADMIN-CANCELLED-STATE`, `MKT-ERROR-HANDLING-FIX`, `MKT-PREFREEZE-WHITESPACE-FIX`, cùng Smart Contracts, Backend, AI Pipeline, Next.js BFF/UI, Security, Git & Deployment Readiness.

---

## 1. Executive Summary

Về mặt **mã nguồn và kiểm thử tự động**, hệ thống **Escrow Marketplace** đạt chất lượng kỹ thuật tốt sau loạt vá lỗi bảo mật P1 và ổn định giao diện:
- Toàn bộ test tự động cốt lõi đều **PASS với 0 test bị skip**: Foundry Smart Contracts (`80 passed, 0 failed, 0 skipped` gồm fuzz 512 runs & invariant 256 runs / 51,200 calls), Python Backend + AI Pipeline + Anvil Integration (`185 passed, 0 failed, 0 skipped`), Frontend TypeScript (`0 errors`), Frontend Unit & Security Tests (`61 passed, 0 failed, 0 skipped`), Production Build (`next build` PASS), và `git diff --check` (exit `0`).
- Cả 3 remediation gần nhất (`FIX-ADMIN-CANCELLED-STATE`, `MKT-ERROR-HANDLING-FIX`, `MKT-PREFREEZE-WHITESPACE-FIX`), ranh giới quyền AI (`55-ai-authority.md`), ABI parity (`contracts/out/` = `backend/abi/` = `frontend/lib/abi/`), bảo mật BFF HMAC, magic-bytes `/api/pin`, fail-closed `SESSION_SECRET`, và chống oversell SQLite WAL + on-chain verify trước TTL release đều đã được xác minh trực tiếp trong mã nguồn.

Tuy nhiên, xét theo tiêu chuẩn **Release Gate Tier 1 (DEMO-READY)** và quy trình **Pre-Freeze**, dự án **CHƯA ĐỦ ĐIỀU KIỆN FREEZE / PUBLIC DEMO** vì còn các điểm chặn vận hành & quản trị cấp **P0/P1**:
1. **[P0 — Gas Ví Agent Fuji quá thấp]:** Ví AI Agent (`0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081`) trên Avalanche Fuji (`43113`) hiện chỉ có **`0.05 AVAX`** (thấp hơn ngưỡng tối thiểu **`0.5 AVAX`** của Release Gate Tier 1).
2. **[P0 — Thiếu bằng chứng Fuji E2E cho AI Attest & Settlement]:** Trạng thái on-chain thực tế trên Fuji (`block 61079768`, `nextTradeId = 3`) chỉ mới có `Trade #1` (`Cancelled`, thiếu cọc) và `Trade #2` (`Cancelled` sau khi hai bên nạp cọc `0.03 AVAX`, buyer nộp bằng chứng, nhưng `sellerEvidenceHash = 0x00..00` và hết hạn). **Luồng live Fuji `submitEvidence` đủ 2 bên → AI AutoAgent `attest()` → `resolveClean()` / `fileComplaint()` / `resolveDispute()` CHƯA ĐƯỢC KIỂM CHỨNG TRÊN FUJI THẬT**.
3. **[P1 — Git Working Tree & Governance chưa chốt]:** Repo có **91 tệp thay đổi chưa commit/merge** (`45` tracked modified + `46` untracked) trên nền `bdb1e13`, `README.md` vẫn còn `PENDING-OWNER` (Demo Video, Pitch Deck, Live Fuji dApp), và `DEC-018..021` trong [`docs/context/DECISION_LOG.md`](file:///D:/Escrow_Marketplace_Demo/docs/context/DECISION_LOG.md) vẫn ở trạng thái `PROPOSED`.

> **Verdict Tổng Thể (Release Gate):** **`NO-GO`** cho **Final Freeze & Public Demo** ở thời điểm hiện tại (mã nguồn đạt **`CONDITIONAL GO`** nội bộ sau khi hoàn tất các bước vận hành của Owner ở Mục 4 & Mục 7).

---

## 2. Test Matrix (`PASS` / `FAIL` / `NOT TESTED`)

### 2.1. Kiểm thử tự động & kiểm tra tĩnh (Chạy trực tiếp trên workspace hiện tại)

| Hạng mục | Lệnh thực thi | Trạng thái | Kết quả định lượng / Quan sát thực tế |
|---|---|---|---|
| **Smart Contracts & Invariants (Foundry)** | `cd contracts && forge test -vv` | **PASS** | **`80 passed, 0 failed, 0 skipped`** (7 suites trong `10.93s`: `EscrowAdversarialTest`: 4, `EscrowDeployTest`: 6, `EscrowCreateDepositTest`: 18 @ 512 fuzz runs, `CollectibleTokenTest`: 11 @ 512 fuzz runs, `EscrowEvidenceAttestTest`: 16, `EscrowResolveTest`: 24 @ 512 fuzz runs, `EscrowInvariantTest`: 1 @ 256 runs / 51,200 calls / 0 reverts). |
| **Backend + AI Pipeline + Anvil Integration** | `.\.venv\Scripts\python.exe -m pytest -rs --strict-markers` | **PASS** | **`185 passed, 0 failed, 0 skipped`** trong `126.89s (0:02:06)` trên cả 6 suite (`test_evidence_check.py`, `test_qr_nonce.py`, `test_integration_anvil.py`, `test_listings_integration.py`, `test_listings_unit.py`, `test_service_unit.py`). |
| **Frontend Typecheck** | `cd frontend && npx tsc --noEmit` | **PASS** | Exit `0`, không có lỗi TypeScript. |
| **Frontend Unit & Security Tests** | `cd frontend && npm test` (`node --test test/*.test.cjs`) | **PASS** | **`61 tests, 61 pass, 0 fail, 0 cancelled, 0 skipped`** trong `3511.7575ms` (bao gồm `marketplace-bff`, `pin-hardening`, `security-remediation`, `marketplace-ui`, `mkt-error-handling`, `wallet-providers`, `local-wallet`). |
| **Frontend Production Build** | `cd frontend && npm run build` (`next build`) | **PASS** | Exit `0` (compile trong `5.8s`, type & lint validity đạt, tạo `10/10` static pages & `27` App Router routes). |
| **Frontend ESLint (`next lint`)** | `cd frontend && "" \| npm run lint` | **FAIL** | **`LINT_EXIT=1`** — thất bại với prompt cấu hình ESLint tương tác vì chưa cài đặt/cấu hình ESLint (đã ghi nhận tại [`RISK_REGISTER.md`](file:///D:/Escrow_Marketplace_Demo/docs/agent-ops/RISK_REGISTER.md) `TST-03`). |
| **Git Whitespace & Diff Hygiene** | `git diff --check` | **PASS** | Exit `0` (`DIFF_CHECK=0`, 0 lỗi trailing whitespace; Git cảnh báo 3 file LF-in-working-copy: `frontend/app/api/pin/route.ts`, `frontend/app/page.tsx`, `frontend/components/Navbar.tsx`). |
| **Dependency Security Audit (Prod)** | `cd frontend && npm audit --omit=dev` | **FAIL (Cảnh báo)** | **`NPM_AUDIT_EXIT=1`** — **`22 vulnerabilities (9 moderate, 13 high)`** trong `postcss`, `uuid`, `zod` (xem Finding `P2-04`). |
| **Secret Pattern Scan (Repo Files)** | Quét 979 file non-`.env` / non-ignored bằng Python regex | **PASS** | `0` Pinata JWT / PEM key / `LEGACY_INSECURE_SECRET` / real private key. `11` match duy nhất là khóa test mặc định của Anvil trong test/script và [`FRONTEND_SPEC.md`](file:///D:/Escrow_Marketplace_Demo/docs/specs/FRONTEND_SPEC.md#L391). |
| **ABI Parity Check** | So sánh SHA-256 canonical JSON ABI | **PASS** | `Escrow.json` (`192ceacc4204f4d2`) và `CollectibleToken.json` (`cd457b3ecf34520a`) khớp 100% giữa `contracts/out/`, `backend/abi/`, `frontend/lib/abi/`. |
| **AI Authority Boundary Grep** | `Select-String "functions\.\w*\(" backend\*.py` | **PASS** | Chỉ duy nhất `self.escrow.functions.attest(...)` ([`backend/chain.py`](file:///D:/Escrow_Marketplace_Demo/backend/chain.py#L234)) gửi giao dịch ghi on-chain; mọi lời gọi contract khác đều là `.call()`. |

### 2.2. Bằng chứng Avalanche Fuji E2E thực tế vs Các luồng chưa kiểm thử

Phân biệt rõ dựa trên truy vấn **chỉ đọc RPC Fuji (`https://api.avax-test.network/ext/bc/C/rpc`, `block 61079768`)** và kiểm tra dữ liệu local tại [`backend/data/`](file:///D:/Escrow_Marketplace_Demo/backend/attest_service.py#L446-L450):

| Nhóm kiểm thử | Nguồn bằng chứng quan sát | Trạng thái | Chi tiết thực tế quan sát được |
|---|---|---|---|
| **Triển khai Contract & Thông số Fuji (`43113`)** | Read-only RPC + [`43113.json`](file:///D:/Escrow_Marketplace_Demo/contracts/deployments/43113.json) | **PASS** | `nextTradeId = 3`, `agent = 0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081`, `owner = 0xCa76cBE87902108712729A02F78C1F8cC20b39Eb` khớp 100%. |
| **Ví Owner & Ví AI Agent gas trên Fuji** | `eth_getBalance` qua Fuji RPC | **FAIL (Agent)** / **PASS (Owner)** | Owner: `~0.55 AVAX` (`0.5499999993817376`). **Agent: `0.05 AVAX`** (dưới ngưỡng tối thiểu `0.5 AVAX`). |
| **Fuji E2E phần đầu: Pinata + Listing + Request + `createTrade` + `bind-trade` + `deposit(30%)` + `listing` sig + `cancelOnEvidenceTimeout`** | Fuji RPC (`Trade #1`, `Trade #2`) + `marketplace.db` & `trade_uris.json` | **PASS (Một phần)** | `Trade #2` (`0.1 AVAX`): đã tạo listing `MODEL-BLUE-001` với IPFS thật (`ipfs://QmcLXa5ZS...`), `bind-trade` thành công (`tx 0x3467de99...`), cả Seller & Buyer đã nạp cọc `0.03 AVAX`, Seller ký URI `listing`, Buyer nộp bằng chứng (`buyerEvidenceHash != 0x0`), sau đó hết hạn chuyển `Cancelled` và đồng bộ DB về `TRADE_CANCELLED`. (`Trade #1` hủy sớm do thiếu cọc Buyer). |
| **Fuji E2E phần hoàn tất: Seller+Buyer đủ bằng chứng → AI `attest()` → `resolveClean()` / `fileComplaint()` / `resolveDispute()` / `withdraw()`** | Fuji RPC (`nextTradeId = 3`, `Trade #1` & `#2` đều `state=5 Cancelled`, `reportHash=0x00..00`) | **NOT TESTED** | **Chưa từng có giao dịch nào trên Fuji đi tới `Attested (2)`, `Disputed (3)`, hay `Resolved (4)`**. |
| **Browser UI Smoke E2E trên local (`MKT-004` / `MKT-005`)** | Báo cáo `MKT-004` / `MKT-005 QA` (trên local server + seeded/empty SQLite trước error-handling fix) | **PASS (Bản trước fix P2/P3)** | Chưa chạy lại headless browser interactive flow sau 2 bản vá cuối (`FIX-ADMIN-CANCELLED-STATE`, `MKT-ERROR-HANDLING-FIX`); logic sửa đã được kiểm chứng qua `tsc`, `npm run build` và 6 regression tests mới trong [`mkt-error-handling.test.cjs`](file:///D:/Escrow_Marketplace_Demo/frontend/test/mkt-error-handling.test.cjs). |
| **Core Browser Extension thật (Chrome) sau khi sửa Wallet Rejection** | — | **NOT TESTED** | Chưa kiểm chứng thủ công với Core Extension thật sau `MKT-ERROR-HANDLING-FIX` (mới test qua mock provider & unit test). |
| **Docker Backend Build (`docker build -f backend/Dockerfile`)** | `docker info` (`DOCKER_EXIT=1`) | **NOT TESTED** | Docker Desktop daemon không chạy trên máy dev (`//./pipe/dockerDesktopLinuxEngine` không tìm thấy). |
| **Git History Secret Scan (`gitleaks` / `trufflehog`)** | — | **NOT TESTED** | Chưa chạy quét toàn bộ lịch sử commit Git bằng công cụ chuyên dụng do chưa cấu hình trên môi trường này (`70-security.md`). |

---

## 3. Findings (`P0` / `P1` / `P2` / `P3`)

### P0 — Critical / Blocker

1. **[P0-01] Ví AI Agent trên Avalanche Fuji (`43113`) thiếu gas (`0.05 AVAX < 0.5 AVAX`)**
   - **Bằng chứng:** Read-only RPC Fuji (`block 61079768`) ghi nhận số dư của `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081` chỉ còn **`0.05 AVAX`** (vi phạm Release Gate Tier 1 #5 yêu cầu `>= 0.5 AVAX`; cũng được ghi nhận trong [`CURRENT_STATUS.md`](file:///D:/Escrow_Marketplace_Demo/docs/context/CURRENT_STATUS.md#L47)).
   - **Tác động:** Khi chạy demo công khai, nếu nhiều giao dịch diễn ra hoặc phí gas tăng, ví Agent có nguy cơ cạn AVAX và giao dịch `attest()` sẽ thất bại/treo tới `ATTEST_WINDOW` timeout.

2. **[P0-02] Chưa có bằng chứng E2E sống trên Fuji (`43113`) cho chu trình AI `attest()` → `resolveClean()` / `resolveDispute()`**
   - **Bằng chứng:** Trên Fuji hiện tại `nextTradeId = 3`: `Trade #1` kết thúc `state=5 (Cancelled)`, `Trade #2` cũng kết thúc `state=5 (Cancelled)` với `sellerEvidenceHash = 0x00..00` và `reportHash = 0x00..00`. Dù luồng tạo listing IPFS thật, `createTrade`, `bind-trade`, `deposit`, chữ ký URI và `cancelOnEvidenceTimeout` đã chạy thực tế ở `Trade #2`, phần cốt lõi nhất cho giám khảo (AutoAgent tải 3 file từ Pinata thật trên Fuji, đọc QR/OCR nonce, gọi `attest()`, và người dùng/admin gọi `resolveClean()` hoặc `resolveDispute()`) vẫn ở trạng thái **`NOT TESTED`** trên testnet thật.
   - **Tác động:** Nếu có lỗi tích hợp thực tế trên Fuji (gateway Pinata bị throttle/429 khi tải video MP4 thật, tốc độ RPC Fuji khi AutoAgent đối soát, hiển thị Explainable Report từ HTTPS backend thật), lỗi sẽ chỉ phát lộ ngay lúc demo/chấm giải.

### P1 — High

3. **[P1-01] Working tree có 91 tệp thay đổi chưa commit/merge và liên kết nộp bài còn `PENDING-OWNER`**
   - **Bằng chứng:** `git diff --name-only` báo **`45`** tệp tracked bị sửa và `git ls-files --others --exclude-standard` báo **`46`** tệp untracked chưa commit trên nhánh `main` (`bdb1e13`, trùng `origin/main`). [`README.md`](file:///D:/Escrow_Marketplace_Demo/README.md#L83-L85) vẫn để `PENDING-OWNER` tại mục `Demo Video`, `Pitch Deck / Slide` và `Live Fuji dApp`. Ngoài ra còn tồn tại nhánh phụ `ui/esc-100-auth-two-pages` (`96e323a`).
   - **Tác động:** Không thể Freeze hoặc nộp link công khai khi toàn bộ `MKT-001`..`MKT-005` + các bản vá chưa được review/commit sạch vào Git, và `Verified against commit` trong `docs/context/*.md` đang trỏ về `bdb1e13` cũ.

4. **[P1-02] Các quyết định kiến trúc mới (`DEC-018..021`) vẫn ở trạng thái `PROPOSED` & tài liệu script có thông tin lỗi thời**
   - **Bằng chứng:** Theo `AGENTS.md §0 & §1`, chỉ Project Owner mới được chuyển dòng `DEC` sang `CONFIRMED`, hiện [`DECISION_LOG.md`](file:///D:/Escrow_Marketplace_Demo/docs/context/DECISION_LOG.md) còn `DEC-018..021` là `PROPOSED`. Tài liệu [`docs/agent-ops/RISK_REGISTER.md`](file:///D:/Escrow_Marketplace_Demo/docs/agent-ops/RISK_REGISTER.md) vẫn ghi `6` mục `BLOCKED-OWNER` (`PC-02`, `PC-03`, `PC-05`, `SEC-03`, `SEC-04`, `SEC-07`). Đồng thời `docs/specs/SLIDE_AND_VIDEO_SCRIPT.md` còn câu sai mô tả hợp đồng `"Nonce sinh on-chain sau khi đủ cọc"` (đã ghi nhận tại `PC-06` trong `RISK_REGISTER.md`, thực tế `nonce` sinh ngay trong `createTrade()`).
   - **Tác động:** Thuyết trình hoặc người review tài liệu dễ trình bày sai cơ chế sinh nonce so với Smart Contract triển khai.

5. **[P1-03] Hạ tầng triển khai công khai (Public Demo): 4 đường gọi trình duyệt tới FastAPI chưa đi qua Next.js BFF**
   - **Bằng chứng:** [`frontend/lib/backend.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/lib/backend.ts#L82-L85), [`L110-L127`](file:///D:/Escrow_Marketplace_Demo/frontend/lib/backend.ts#L110-L127), [`L219-L231`](file:///D:/Escrow_Marketplace_Demo/frontend/lib/backend.ts#L219-L231) gọi trực tiếp `${NEXT_PUBLIC_BACKEND_URL}` từ trình duyệt cho `GET /report/{id}`, `GET /health`, `GET /agent/status/{id}` và `GET /trade/{id}/uris` (mặc định fallback `http://127.0.0.1:8000`).
   - **Tác động:** Nếu triển khai Demo công khai qua HTTPS (`Vercel` / tunnel / reverse proxy), trình duyệt người dùng sẽ bị chặn **Mixed Content** hoặc **CORS** nếu `NEXT_PUBLIC_BACKEND_URL` còn là `http://127.0.0.1:8000` hoặc `CORS_ORIGINS` phía FastAPI chưa khai báo origin công khai của Frontend.

### P2 — Medium

6. **[P2-01] `POST /api/auth/session` ném lỗi HTTP 500 với `address` sai định dạng + GET hardcode `targetChainId: 43113`**
   - **Bằng chứng:** Tại [`frontend/app/api/auth/session/route.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/app/api/auth/session/route.ts#L96), `getAddress(address)` được gọi **bên ngoài** khối `try/catch` kiểm tra chữ ký, khiến chuỗi `address` bất kỳ không hợp lệ làm Viem ném `InvalidAddressError` (HTTP `500` thay vì `400`). Ngoài ra dòng 54 của cùng file hardcode `targetChainId: 43113` thay vì đọc cấu hình `NEXT_PUBLIC_CHAIN_ID`, `activeNonces` lưu bằng `Map` trong RAM (chỉ chạy đúng trên 1 instance Node), và cookie `secure: isProd` chặn lưu cookie nếu thử chạy `next start` qua HTTP LAN IP (không phải HTTPS hoặc localhost).
   - **Tác động:** Gây 500 log giả khi nhận request fuzz/sai schema; giới hạn kiến trúc auth session về single-instance Node + HTTPS/localhost.

7. **[P2-02] Rò rỉ raw exception `str(e)` ở một số endpoint FastAPI cũ (`SE-05`) & chưa rate-limit `GET /trade/{id}/uris`**
   - **Bằng chứng:** Các route Marketplace mới dùng `MarketplaceError` đã chuẩn hóa thông điệp sạch, nhưng các endpoint legacy trong [`backend/attest_service.py`](file:///D:/Escrow_Marketplace_Demo/backend/attest_service.py#L545-L589) (`health()` dòng 546, `get_trade()` dòng 574, `nonce_qr()` dòng 588, `verify_evidence()` dòng 875/878/891, `load_trade()` dòng 956) vẫn trả thẳng `str(e)` / `{e}` qua `HTTPException`. Ngoài ra `GET /trade/{trade_id}/uris` và `GET /agent/status/{trade_id}` ([`attest_service.py`](file:///D:/Escrow_Marketplace_Demo/backend/attest_service.py#L999-L1006)) chưa gắn `check_rate_limit` hay auth (`SEC-07`/`OD-05`).
   - **Tác động:** Nếu `RPC_URL` dùng dịch vụ trả phí chứa API key trong URL và RPC lỗi, chi tiết exception có thể làm lộ URL RPC trong response HTTP; thông tin URI IPFS của trade có thể bị dò theo `trade_id` tuần tự. *(Mức rủi ro với Fuji công khai `api.avax-test.network` hiện ở mức trung bình/thấp do RPC URL mặc định là public không chứa secret.)*

8. **[P2-03] Database local `backend/data/marketplace.db` & `trade_uris.json` đang chứa dữ liệu test thủ công**
   - **Bằng chứng:** Kiểm tra tệp `backend/data/marketplace.db` (bị `.gitignore` bỏ qua, không có nguy cơ commit) cho thấy hiện còn 1 listing `ACTIVE` (`lst_f9c5bddd8749456ab961`, `SKU: MODEL-BLUE-001`, `"Mô hình robot xanh vàng"`), `2` purchase requests (`CANCELLED`, `TRADE_CANCELLED`), `1` `listing_trades` (`trade_id=2`), `20` proxy nonces và `6` idempotency records; `trade_uris.json` chứa key `'2'`.
   - **Tác động:** Nếu khởi động môi trường demo bằng chính thư mục `backend/data/` này mà không dọn sạch, người xem demo sẽ thấy dữ liệu thử nghiệm cũ thay vì sàn sạch (hoặc nếu cố tình giữ làm dữ liệu mẫu thì lưu ý `Trade #2` gắn với nó đã `Cancelled`).

9. **[P2-04] 22 lỗ hổng npm dependencies (`9 moderate, 13 high`) & thiếu ESLint setup (`TST-03`)**
   - **Bằng chứng:** `npm audit --omit=dev` báo `22 vulnerabilities (9 moderate, 13 high)` ở các gói bắc cầu `postcss <=8.5.22`, `uuid <11.1.1`, `zod <4.6.6` (phụ thuộc `next@15.5.29`, `@rainbow-me/rainbowkit`, `wagmi@2.14.9`, `@walletconnect/ethereum-provider` — nâng cấp sửa triệt để đòi hỏi major breaking upgrade lên `next@16.4.6` / `wagmi@3.7.11`). Song song đó `npm run lint` thất bại (`LINT_EXIT=1`) do chưa cài `eslint` / `.eslintrc*`. Bên phía Python (`backend/requirements.txt`, `ai-pipeline/requirements.txt`) vẫn dùng lower-bound `>=` thay vì lockfile cố định phiên bản (`SE-04`).
   - **Tác động:** Chấp nhận được cho bản demo hackathon, nhưng là nợ kỹ thuật cần xử lý trước production.

10. **[P2-05] Thiếu kiểm tra `ATTEST_API_KEY` fail-closed tại BFF wrapper cho 2 route legacy `/api/verify` và `/api/uris`**
    - **Bằng chứng:** [`frontend/app/api/verify/route.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/app/api/verify/route.ts#L60-L62) và [`frontend/app/api/uris/route.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/app/api/uris/route.ts#L57-L59) chỉ đính kèm `X-API-Key` nếu `ATTEST_API_KEY` khác rỗng (`if (apiKey) headers['X-API-Key'] = apiKey;`), không trả `503 BFF_MISCONFIGURED` sớm như [`marketplace-bff.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/lib/marketplace-bff.ts). Tuy nhiên Backend trên `43113` vẫn chặn `503`/`401` nên lỗi không vượt qua lớp backend.
    - **Tác động:** Nhẹ — trả `401`/`503` từ backend thay vì fail-fast `503` ngay tại BFF khi thiếu env.

### P3 — Low / Hygiene

11. **[P3-01] Rủi ro nhỏ về line-ending CRLF/LF và mẫu `.gitignore` cho file `.env.*.example`**
    - **Bằng chứng:** `git diff --check` thoát mã `0` nhưng cảnh báo 3 file có LF (`frontend/app/api/pin/route.ts`, `frontend/app/page.tsx`, `frontend/components/Navbar.tsx`). Ngoài ra [`.gitignore`](file:///D:/Escrow_Marketplace_Demo/.gitignore) chặn `.env.*` và mới chỉ mở ngoại lệ `!.env.example` (chưa ghi `!.env.*.example` tường minh cho trường hợp tạo file example mới tương tự `.env.local.example`).
12. **[P3-02] Trùng lặp logic `returnUrl` trong `auth/page.tsx` & `auth/local/page.tsx`**
    - **Bằng chứng:** [`frontend/app/auth/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/auth/page.tsx#L17-L20) và [`frontend/app/auth/local/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/auth/local/page.tsx#L38-L41) vẫn tự viết inline `rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//') && !rawReturnUrl.startsWith('/auth')` thay vì tái sử dụng `sanitizeReturnUrl` ở [`frontend/lib/auth-routes.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/lib/auth-routes.ts#L18-L29). Rủi ro thực tế rất thấp vì chỉ truyền vào `router.push` / `<Link>` nội bộ Next.js.
13. **[P3-03] `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` mẫu trong [`frontend/.env.local.example`](file:///D:/Escrow_Marketplace_Demo/frontend/.env.local.example#L18)**
    - **Bằng chứng:** Giá trị `3a8170812b534d0ff9d794f19a901d64` là sample ID công khai đi kèm ví dụ; nếu triển khai demo công khai có quét QR WalletConnect nên dùng Project ID của nhóm để tránh rate-limit chung.

### Xác minh các Remediation gần đây

- **`FIX-ADMIN-CANCELLED-STATE` (`PASS`):** Đã kiểm chứng trực tiếp tại [`frontend/app/admin/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/admin/page.tsx#L584-L599) — giữ nguyên nhánh `trade.state === 4` (Resolved), thêm đúng nhánh `trade.state === 5` hiển thị `"Giao dịch đã hủy (Cancelled). Không còn ở trạng thái đang tiến hành."` trước nhánh mặc định, giữ nguyên toàn bộ nhánh Disputed / AI Flagged và phân quyền trọng tài.
- **`MKT-ERROR-HANDLING-FIX` (`PASS`):** Đã kiểm chứng tại [`frontend/lib/trade-id.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/lib/trade-id.ts), [`frontend/lib/errors.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/lib/errors.ts), [`frontend/app/trade/[id]/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/trade/%5Bid%5D/page.tsx#L53-L69) & [`L242-L260`](file:///D:/Escrow_Marketplace_Demo/frontend/app/trade/%5Bid%5D/page.tsx#L242-L260), và [`frontend/app/trade/[id]/report/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/trade/%5Bid%5D/report/page.tsx#L33-L138):
  - URL sai như `/trade/2**` không còn gây `SyntaxError: BigInt`, hiển thị giao diện báo mã giao dịch không hợp lệ thân thiện; `/trade/2` giữ nguyên hoạt động.
  - `classifyContractError` duyệt cây `.cause`/`.data`/`.info.error` tách rạch ròi `user_rejected` (EIP-1193 `4001`, `ACTION_REJECTED`, `UserRejectedRequestError`) khỏi `contract_revert` và `rpc`; `notifyWalletActionError` không gọi `console.error` hay retry giao dịch khi user từ chối.
- **`MKT-PREFREEZE-WHITESPACE-FIX` (`PASS`):** `git diff --check` thoát mã `0` (0 lỗi trailing whitespace trên toàn bộ các tệp tài liệu đã sửa).

---

## 4. Danh sách lỗi bắt buộc sửa trước Freeze

### Bắt buộc tuyệt đối (Hard Blockers cho Final Freeze & Public Demo)
1. **Nạp AVAX cho ví AI Agent trên Fuji (`P0-01`):** Faucet/nạp tối thiểu `>= 0.5 AVAX` cho ví Agent `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081` (hiện chỉ có `0.05 AVAX`).
2. **Chạy trọn vẹn tối thiểu 1 chu trình E2E sống trên Avalanche Fuji (`P0-02`):** Thực hiện giao dịch thật từ UI: Đăng sản phẩm ảnh Pinata thật → Buyer gửi yêu cầu → Seller chấp nhận → `createTrade` + `bind-trade` → hai bên nạp cọc 30% AVAX → Seller ký URI niêm yết + nộp ảnh đóng gói có QR nonce → Buyer nộp ảnh/video mở hộp có QR nonce → xác nhận **AI AutoAgent tự gọi `attest()` thành công** → xác nhận `resolveClean()` (hoặc kiểm tra cả `fileComplaint()` + `resolveDispute()` nếu có trade thứ hai) + kiểm tra trang `/trade/[id]/report` verify hash khớp on-chain.
3. **Làm sạch cấu hình Public Demo & Test DB (`P1-03`, `P2-03`):**
   - Cấu hình `NEXT_PUBLIC_BACKEND_URL` trỏ tới HTTPS endpoint thật của FastAPI (không để mặc định `http://127.0.0.1:8000` nếu frontend public), đồng thời set `CORS_ORIGINS` trên backend.
   - Đảm bảo `backend/.env` trên môi trường Fuji bật `REQUIRE_PROXY_SIGNATURE=true`, `ALLOW_LOCAL_HOSTS=false`, `ENFORCE_EVIDENCE_HASH=true`, `VERIFY_CHAIN_BEFORE_TTL_RELEASE=true`, có `ATTEST_API_KEY` mạnh và `AGENT_PRIVATE_KEY` tách biệt; `frontend/.env.local` có `SESSION_SECRET` độc lập với `ATTEST_API_KEY`, cùng `PINATA_JWT`.
   - Quyết định xóa/reset `backend/data/marketplace.db` & `trade_uris.json` để loại bỏ dữ liệu thử nghiệm cũ `MODEL-BLUE-001` / `Trade #2 Cancelled` trước khi ghi hình demo hoặc public (nếu không chủ ý giữ).
4. **Hoàn tất Git Commit/Merge & Tài liệu Governance (`P1-01`, `P1-02`):**
   - Rà soát và commit gọn 91 tệp hiện tại (loại bỏ/dọn nhánh dư `ui/esc-100-auth-two-pages` nếu không dùng nữa).
   - Project Owner duyệt chuyển trạng thái `DEC-018..021` trong `DECISION_LOG.md`, xem xét 6 mục `BLOCKED-OWNER` trong `RISK_REGISTER.md`, cập nhật `Verified against commit:` sang hash commit sau merge.
   - Sửa câu mô tả sai trong `docs/specs/SLIDE_AND_VIDEO_SCRIPT.md` (`"Nonce sinh on-chain sau khi đủ cọc"` → sinh tại `createTrade`).
   - Điền đủ liên kết thật thay thế `PENDING-OWNER` trong [`README.md`](file:///D:/Escrow_Marketplace_Demo/README.md#L83-L85).

### Nên cân nhắc xử lý trước hoặc ngay trong đợt chốt (Khuyến nghị mạnh)
- Bọc `getAddress(address)` trong `try/catch` trả `400` tại [`frontend/app/api/auth/session/route.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/app/api/auth/session/route.ts#L96) (`P2-01`).
- Chuẩn hóa `str(e)` thành thông báo lỗi an toàn trên các endpoint legacy của `backend/attest_service.py` (`P2-02`) nếu RPC URL trong production/demo chứa provider key.

---

## 5. Rủi ro được chấp nhận & kiểm thử còn thiếu

### Rủi ro được chấp nhận ở mức DEMO-READY (Tier 1) — Bắt buộc xử lý nếu lên Production (Tier 2)
- **Single-Owner Arbiter & Không có timeout cho trạng thái `Disputed` (`OD-02`, `OD-03`):** Trọng tài duy nhất là ví `Owner`; nếu tranh chấp kéo dài, chỉ `Owner` mở được khóa via `resolveDispute`.
- **Single-process Architecture (`SE-01`, `P2-01`):** SQLite WAL + `AutoAgent` RAM status + `rate_limit_records` yêu cầu chạy Backend **đúng 1 Uvicorn worker** (`--workers 1`); Next.js `activeNonces` lưu bằng `Map` trong RAM yêu cầu **1 instance Node** (chưa phù hợp multi-region/serverless không shared store).
- **Dependencies & Lint (`P2-04`, `TST-03`):** Chấp nhận tạm thời 22 cảnh báo `npm audit` (do nâng Next 16 / Wagmi 3 là breaking change lớn sát freeze), chưa có ESLint config (`npm run lint` FAIL), và `requirements.txt` dùng `>=` thay vì `requirements.lock` (`SE-04`).
- **Quyền riêng tư & Endpoint `/uris` (`SEC-07`, `OD-05`, `P2-02`):** Ảnh/video trên IPFS là công khai vĩnh viễn (UI đã hiển thị cảnh báo); `GET /trade/{id}/uris` và `GET /agent/status/{id}` chưa giới hạn rate-limit/auth.
- **Reputation Farming (`OD-04`):** Giao dịch hủy không tăng điểm, nhưng hai ví thông đồng giao dịch sạch liên tiếp vẫn có thể tăng điểm uy tín.

### Kiểm thử còn thiếu (`NOT TESTED`)
1. **Live Fuji E2E:** `submitEvidence` đủ 2 bên -> `AutoAgent` tự gọi `attest()` -> `resolveClean()`, `fileComplaint()` -> `resolveDispute()` và `withdraw()` (fallback pull-payout).
2. **Real Core Wallet Browser Extension E2E (sau `MKT-ERROR-HANDLING-FIX`):** Kiểm tra thực tế popup Core Wallet xác nhận/từ chối giao dịch `createTrade`, `deposit`, `submitEvidence`, `resolveClean` và kiểm tra Console không có lỗi 4xx/5xx bất thường.
3. **Frontend Interactive Browser Smoke Re-run sau `MKT-ERROR-HANDLING-FIX` & `FIX-ADMIN-CANCELLED-STATE`:** Truy cập trực tiếp `/trade/2**`, `/trade/2/report`, `/admin` (với trade `Cancelled`), `/sell` trên bản build thực tế.
4. **Docker Container Build (`backend/Dockerfile`):** Kiểm tra build + run container FastAPI + Tesseract + OpenCV thực tế khi Docker daemon sẵn sàng.
5. **Full Git History Secret Scan (`gitleaks` / `trufflehog`):** Cần chạy trên toàn bộ lịch sử commit trước khi công khai repository (`70-security.md`).

---

## 6. Đánh giá Git Readiness & Deployment Readiness

| Khía cạnh | Trạng thái | Đánh giá chi tiết |
|---|---|---|
| **Git Tree Hygiene** | **CHƯA SẴN SÀNG** | `main` và `origin/main` đang ở `bdb1e13`, còn working directory chứa **45 modified + 46 untracked files** chưa được phân tách/commit. Tuy nhiên **0 secret** (`.env`, `.env.local`, `backend/data/`) bị track — `.gitignore` bảo vệ đúng các tệp nhạy cảm hiện tại (`backend/.env` & `frontend/.env.local` đều đang ignored). |
| **Contracts / ABI Freeze Safety** | **SẴN SÀNG** | `git diff --name-only origin/main -- contracts/ backend/abi/ frontend/lib/abi/ frontend/lib/local-wallet/` **rỗng** (không sửa contract đang deploy `43113.json` hay local wallet). |
| **Backend Deployment Readiness** | **SẴN SÀNG CÓ ĐIỀU KIỆN** | `backend/Dockerfile` đã sửa (ở `MKT-002`) để copy đủ `backend/*.py`, nhưng **`docker build` chưa test** do thiếu daemon. Bắt buộc deploy kiểu **1 container / 1 worker Uvicorn (`--workers 1`)** gắn persistent volume `DATA_DIR` (để giữ `marketplace.db`, `trade_uris.json`, `known_hashes.json`, `reports/`), đặt `CORS_ORIGINS` khớp domain Frontend nếu browser gọi trực tiếp `/health`, `/report/*`, `/agent/status/*`, `/trade/*/uris`. |
| **Frontend Deployment Readiness** | **SẴN SÀNG CÓ ĐIỀU KIỆN** | `tsc` và `next build` đạt `0` lỗi. Vì [`/api/auth/session`](file:///D:/Escrow_Marketplace_Demo/frontend/app/api/auth/session/route.ts#L19) lưu `activeNonces` trong bộ nhớ RAM, **khuyến nghị deploy Next.js trên 1 instance stateful Node (`next start`)** (VPS/Railway/Render/EC2) kèm HTTPS (để cookie `Secure` hoạt động), thay vì serverless multi-instance khiến nonce auth có xác suất `NONCE_MISMATCH` giữa `GET` và `POST`. |
| **Fuji Runtime Preconditions** | **CHƯA ĐẠT** | Ví Agent chỉ có `0.05 AVAX` (`< 0.5 AVAX`); dữ liệu test cũ còn nằm trong `backend/data/marketplace.db`; link submission trong `README.md` chưa điền. |

---

## 7. Release Gate & Khuyến nghị cho Project Owner

### Phán quyết Release Gate

- **Final Freeze & Public Demo Release Gate:** **`NO-GO`** (tương đương `REJECT / BLOCKED` theo [`release-gate/SKILL.md`](file:///D:/Escrow_Marketplace_Demo/.agents/skills/release-gate/SKILL.md) Tier 1 ở thời điểm hiện tại do chưa đạt tiêu chí #1 Link submission, #5 Gas ví Agent `>= 0.5 AVAX`, và chưa chứng minh được live Fuji `attest()` -> `resolveClean()` / `resolveDispute()`).
- **Codebase Implementation Verdict:** **`CONDITIONAL GO`** — Nếu bỏ qua các blocker vận hành/Fuji/Git nói trên, bản thân mã nguồn sau các task `MKT-001..005` + `FIX-ADMIN-CANCELLED-STATE` + `MKT-ERROR-HANDLING-FIX` + `MKT-PREFREEZE-WHITESPACE-FIX` vượt qua toàn bộ automated suites (Foundry 80/80, Pytest 185/185, Frontend 61/61, Build PASS, 0 skipped, 0 secret leak).

### Checklist hành động khuyến nghị cho Project Owner theo thứ tự ưu tiên

1. **[Ưu tiên 1 — Mở khóa Fuji]** Faucet ví AI Agent `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081` lên tối thiểu **`0.5–1.0 AVAX`**; kiểm tra kỹ `backend/.env` & `frontend/.env.local` (bảo đảm `REQUIRE_PROXY_SIGNATURE=true`, `SESSION_SECRET` riêng, `PINATA_JWT` hoạt động, `NEXT_PUBLIC_BACKEND_URL` trỏ đúng HTTPS URL public và `CORS_ORIGINS` đã bật nếu deploy public).
2. **[Ưu tiên 2 — Chạy Live Fuji E2E & Quay Demo]** Dọn sạch `backend/data/marketplace.db` & `trade_uris.json` (nếu muốn bắt đầu demo sạch), dùng Core Wallet thật + Pinata thật chạy hoàn chỉnh **ít nhất 1 giao dịch `Resolved (Clean)`** qua AutoAgent `attest()` và kiểm chứng trang `/trade/[id]/report` + `/admin` (và tùy chọn 1 case `Disputed -> resolveDispute`). Kiểm tra nhanh URL `/trade/2**` và tình huống từ chối ví trên trình duyệt thật.
3. **[Ưu tiên 3 — Sửa nhanh trước tag (tùy chọn nhỏ nhưng sạch)]** Cân nhắc xử lý nhanh `P2-01` (`try/catch getAddress` trong `/api/auth/session/route.ts`) và `P1-02` (chỉnh lại câu `"Nonce sinh on-chain sau khi đủ cọc"` trong `SLIDE_AND_VIDEO_SCRIPT.md`).
4. **[Ưu tiên 4 — Commit, Governance & Final Freeze]** Commit gọn working tree hiện tại lên nhánh review/PR, Owner xác nhận `DEC-018..021` và rà soát `RISK_REGISTER.md`, cập nhật `Verified against commit:` trong `docs/context/*.md`, điền link **Live Fuji dApp / Demo Video / Pitch Deck** vào `README.md`, chạy quét lịch sử Git (`gitleaks`) trước khi public repo, rồi chính thức gắn tag **Final Freeze (`GO`)**.
