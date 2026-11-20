# Escrow Marketplace for Collectibles
Collectibles marketplace with on-chain 30% AVAX deposit-only escrow on Avalanche C-Chain (Fuji `43113` / Anvil `31337`) and AI evidence attestation.
Tech stack: Next.js 15 App Router (BFF HMAC + Local Wallet + Wagmi) · FastAPI + SQLite WAL (Python 3.12) · OpenCV, Tesseract OCR, pHash · Solidity (Foundry 1.5.1, OpenZeppelin v5.1) · Avalanche Fuji.

> **Người mới chạy thử trên máy cá nhân?** Xem hướng dẫn chi tiết từng bước (Windows / Ubuntu & Debian / Linux khác / macOS, chỉ cần Git + Docker): [**RUN_LOCAL_BEGINNER.md**](RUN_LOCAL_BEGINNER.md)

---

## 1. Giới thiệu sản phẩm

Escrow Marketplace là sàn giao dịch đồ sưu tầm nhiều người dùng (LEGO, mô hình, figure, thẻ bài, xu sưu tầm), trong đó danh mục niêm yết, giữ chỗ và yêu cầu mua được vận hành **off-chain (FastAPI + SQLite)**, kết hợp **hợp đồng thông minh Escrow ký quỹ cọc 30% AVAX** trên Avalanche C-Chain và **AI Agent** phân tích bằng chứng (ảnh & video) để neo hash bằng chứng và kết quả kiểm tra on-chain.

- **Ký quỹ 30% minh bạch:** Người mua và người bán mỗi bên đặt cọc đúng **30% giá trị niêm yết** bằng AVAX (`MAX_DEPOSIT_BPS = 3000`); token **CDU** (`CollectibleToken`) là token kế toán Soulbound 1:1 không chuyển nhượng. Hợp đồng chỉ giữ tiền cọc (không giữ toàn bộ giá mua hàng hóa).
- **Xác thực AI tự trị:** Pipeline thị giác máy tính kết hợp pHash (chống tái sử dụng ảnh), ORB/RANSAC (so khớp đặc trưng vật thể) và QR/OCR (nhận diện nonce chống giả mạo thời gian thực).
- **An toàn tài chính & quyền AI:** AI Agent (`onlyAgent`) chỉ được gửi duy nhất giao dịch `attest(tradeId, riskScore, flagged, reportHash)` khi trade ở trạng thái `AwaitingEvidence` để chứng thực điểm rủi ro và gắn cờ cảnh báo; AI không trực tiếp phân xử tiền cọc. `resolveClean()` chỉ hoàn cọc hai bên khi trade `Attested`, không bị gắn cờ (`!flagged`) và đã quá `disputeDeadline` (không thanh toán giá trị món hàng); mọi tranh chấp (`flagged=true` hoặc `fileComplaint()`) do **Owner / Arbiter (một ví EOA)** quyết định qua `resolveDispute()`.

## 2. Kiến trúc hệ thống

```text
[Frontend (Next.js 15 App Router + Wagmi + Local Wallet)]
       │
       ├──────────────────────────────────────────────┐
       ▼ (EVM Transactions)                           ▼ (BFF Proxy + HMAC + CSRF + Auth Session)
[Smart Contracts (Avalanche Fuji 43113 / Anvil)] ◄── [Backend Service (FastAPI + SQLite WAL)]
  - Escrow.sol (30% AVAX Collateral State Machine)     - Marketplace API & 30m TTL Reservation (`marketplace.db`)
  - CollectibleToken.sol (CDU Soulbound 1:1)           - SSRF/IP Guard, Replay Protection & /api/pin Magic Bytes
       ▲                                               - Keccak256 Evidence Hash Verification
       │ onlyAgent: attest(id, risk, flagged, hash)          │
       └─────────────────────────────────────────────────────┴──► [AI Pipeline (OpenCV / Tesseract OCR)]
```

### Nguyên tắc vận hành cốt lõi
- **Marketplace off-chain & Ký quỹ 30% AVAX (Deposit-only Escrow):** Danh mục niêm yết, yêu cầu mua và giữ chỗ 30 phút nằm trong backend **FastAPI + SQLite WAL** (thành phần tin cậy cùng Next.js BFF). Trên chain, `Escrow.sol` chỉ giữ tiền cọc **30% giá trị niêm yết** từ mỗi bên (`MAX_DEPOSIT_BPS = 3000`) và neo hash bằng chứng/báo cáo; hợp đồng không giữ và không thanh toán giá mua hàng hóa (thanh toán tiền hàng thực hiện P2P ngoài hợp đồng). Token **CDU** (`CollectibleToken.sol`) là token kế toán **Soulbound 1:1** theo lượng cọc đang ký quỹ, không chuyển nhượng.
- **Điều kiện hoàn cọc sạch (`resolveClean()`):** Chỉ chạy được khi trade ở trạng thái `Attested`, **không bị flag** (`!flagged`) và **đã quá `disputeDeadline`** mà không có khiếu nại; bất kỳ địa chỉ nào cũng có thể gọi để hoàn lại tiền cọc hai bên (+1 điểm uy tín), **không** thanh toán giá trị món hàng.
- **Giới hạn quyền AI Agent & Trọng tài (`onlyAgent` / `onlyOwner`):** AI Agent chỉ được gọi duy nhất giao dịch `attest(tradeId, riskScore, flagged, reportHash)` khi trade ở trạng thái `AwaitingEvidence` để ghi nhận kết quả kiểm tra và gắn cờ cảnh báo. Mọi tranh chấp (`flagged=true` hoặc khiếu nại qua `fileComplaint()`) do **Owner / Arbiter (một ví EOA)** xử lý on-chain qua `resolveDispute()`.

## 3. Chạy Local Demo — Docker trên máy bạn + Avalanche Fuji `43113` (khuyến nghị)

Chỉ cần **Git**, **Docker** và **Core Wallet** (bật Testnet Mode). Không cần VPS, domain hay server công khai; chi phí 0 đồng (chỉ dùng test AVAX miễn phí, **không** dùng mainnet).

```bash
git clone https://github.com/NguyenMinhCuong1412/Escrow_Marketplace_UniHack.git
cd Escrow_Marketplace_UniHack
docker compose up --build -d
```

Mở `http://127.0.0.1:3000`. Frontend + Backend chạy local, mọi giao dịch Escrow là giao dịch **thật** trên Avalanche Fuji. `SESSION_SECRET` / `ATTEST_API_KEY` tự sinh trong Docker volume `runtime_secrets`; không cần file `.env` để khởi động.

**Hướng dẫn đầy đủ:** [docs/local-demo/LOCAL-DEMO-SETUP-GUIDE.md](docs/local-demo/LOCAL-DEMO-SETUP-GUIDE.md) — tạo 2 ví Seller/Buyer trong Core Wallet (khuyên dùng 2 browser profile), nhận test AVAX từ faucet, bật upload IPFS bằng Pinata miễn phí (`PINATA_JWT`), luồng giao dịch, kiểm tra tx trên Snowtrace, dừng Docker giữ dữ liệu SQLite. Cài Docker theo từng hệ điều hành: [RUN_LOCAL_BEGINNER.md](RUN_LOCAL_BEGINNER.md).

| Chế độ | Hợp đồng | Bạn tự làm được | Giới hạn |
|---|---|---|---|
| **Mode A** (mặc định) | Fuji của nhóm (§5) | `createTrade`, `deposit` 30%, `submitEvidence`, `fileComplaint`, `cancelUnfunded`, `cancelOnEvidenceTimeout`, `resolveClean` (khi trade đã được attest) | `attest()` chỉ ví **Agent** của nhóm ký; `resolveDispute()` chỉ ví **Owner** của nhóm ký. Không có khóa Agent, Verify AI trả `503` (fail-closed) và trade kết thúc bằng `cancelOnEvidenceTimeout` (hoàn 100% cọc) |
| **Mode B** (tuỳ chọn) | Bạn tự deploy bằng `contracts/script/Deploy.s.sol` | Toàn bộ, gồm Agent `attest` và Owner `resolveDispute` bằng ví testnet của chính bạn | Script đã kiểm thử trên Anvil; deploy Fuji theo Mode B chưa được nhóm kiểm thử end-to-end |

Dừng: `docker compose stop` / `docker compose down` (giữ volume dữ liệu). **Không** dùng `docker compose down -v` nếu muốn giữ `marketplace.db`.

### Dev: chạy thủ công từng dịch vụ với Anvil local (chỉ cho phát triển & test tự động — không phải bằng chứng Avalanche)

### Bước 1: Khởi động Local Blockchain (Anvil)
```bash
anvil --port 8545
```

### Bước 2: Deploy Contracts
```bash
cd contracts
forge build
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

### Bước 3: Cấu hình và chạy Backend
```bash
cd backend
cp .env.example .env
# Điền AGENT_PRIVATE_KEY, ESCROW_ADDRESS, ATTEST_API_KEY và bật REQUIRE_PROXY_SIGNATURE=true trên Fuji (43113)
pip install -r requirements.txt
uvicorn attest_service:app --host 0.0.0.0 --port 8000
```

### Bước 4: Chạy Frontend (Next.js 15 + BFF)
```bash
cd frontend
cp .env.local.example .env.local   # Cấu hình SESSION_SECRET, ATTEST_API_KEY, BACKEND_URL, REQUIRE_PROXY_SIGNATURE=true (trên Fuji)
npm install
npm run dev
```

## 4. Kiểm thử (Test Commands)

```bash
# Contract tests (Foundry unit, fuzz & invariant tests)
cd contracts && forge test

# Toàn bộ Backend + Marketplace + AI Pipeline + Integration tests
pytest -rs

# Hoặc chạy riêng unit tests Backend / Marketplace
pytest backend/tests/test_service_unit.py backend/tests/test_listings_unit.py -rs

# Frontend TypeScript check, unit/security tests & Next.js production build
cd frontend && npx tsc --noEmit && npm test && npm run build
```

## 5. Demo & Tài liệu (Avalanche Fuji Testnet — Chain ID `43113`)

- **Demo Video:** `PENDING-OWNER`
- **Pitch Deck / Slide:** `PENDING-OWNER`
- **Live Fuji dApp:** không có bản public — chạy Local Demo theo mục 3 (kết nối hợp đồng Fuji `43113` thật)
- **Fuji Evidence (kiểm chứng on-chain 2026-11-20):** [docs/test-evidence/AVALANCHE-FUJI-DEMO-EVIDENCE.md](docs/test-evidence/AVALANCHE-FUJI-DEMO-EVIDENCE.md) — Trade #1..#4: `createTrade`, `deposit` 30%, `submitEvidence`, AI Agent `attest` (`flagged=true`, [`0x88abbc…fe12`](https://testnet.snowtrace.io/tx/0x88abbc5b767ae2f8260764f3caa74964e95c712ae97bb51879cb46d6ab5ffe12)), `fileComplaint`, Owner `resolveDispute` ([`0x384d45…e2cb`](https://testnet.snowtrace.io/tx/0x384d45a94d85cc374d87cfd5a80eb1242ca5915d818b1d0af73174bd63d1e2cb), phán quyết không lỗi), `cancelOnEvidenceTimeout` ([`0x82ab62…4bbd`](https://testnet.snowtrace.io/tx/0x82ab6274f1cbc55ed7dfc07ec397896e117c9fd7ebcc9daedd8e2f56aef54bbd)). `ResolvedClean` và `ResolvedDispute` phạt 5% sẽ được bổ sung từ lần quay video demo.
- **Fuji Escrow Address (`43113`):** `0x19D053c84941411888f5b9e40c854365fdd4eb00` (block `60980241`, xem `contracts/deployments/43113.json`)
- **Fuji CollectibleToken (`CDU`) Address:** `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`
- **AI Agent Address (`onlyAgent`):** `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081`
- **Owner / Arbiter Address:** `0xCa76cBE87902108712729A02F78C1F8cC20b39Eb`
- **Window Parameters (`43113.json`):** `evidenceWindow=600s`, `attestWindow=600s`, `disputeWindow=90s`

## 6. Known Limitations

1. **Cơ chế deposit-only (`OD-01`):** Hợp đồng `Escrow.sol` chỉ giữ tiền cọc 30% giá trị món hàng từ mỗi bên (`MAX_DEPOSIT_BPS = 3000`), không giữ và không thanh toán giá trị món hàng; thanh toán tiền hàng hóa thực hiện P2P ngoài hợp đồng.
2. **Trọng tài tập trung (`OD-02` / `OD-03`):** Hệ thống chưa phải cơ chế trọng tài phi tập trung — một ví **Owner EOA** là trọng tài duy nhất cho `resolveDispute()`. Trạng thái `Disputed` chưa có timeout giải cứu tự động và hợp đồng không chặn Owner tham gia giao dịch.
3. **Marketplace vận hành off-chain:** Danh mục niêm yết, giữ chỗ 30 phút và đồng bộ trạng thái nằm trên backend `FastAPI + SQLite`. Backend và Next.js BFF là thành phần tin cậy ngoài chuỗi.
4. **Pipeline AI mang tính heuristic (`TST-06`):** Pipeline thị giác máy tính (pHash, ORB/RANSAC, QR/OCR) chưa có bộ đánh giá định lượng quy mô lớn và kết quả có thể sai lệch; do đó tranh chấp luôn do Owner quyết định.
5. **Tính công khai trên IPFS (`OD-05`):** Ảnh và video bằng chứng đưa lên IPFS là công khai và lưu trữ lâu dài.
6. **Rủi ro thao túng điểm uy tín (`OD-04`):** Điểm `reputation` on-chain có thể bị hai ví thông đồng tăng nhân tạo qua các giao dịch hoàn tất liên tiếp.
7. **Cảnh báo dependency npm (`SEC-01`):** `npm audit --omit=dev` ghi nhận **22 cảnh báo (13 High, 9 Moderate)**, đều là phụ thuộc gián tiếp của Next.js / wagmi / WalletConnect (`postcss`, `zod`, `uuid`…). Các bản vá chính thức yêu cầu nâng **major** (Next 16, wagmi 3), **chưa thực hiện trong thời gian hackathon**. Đánh giá sơ bộ: rủi ro thấp cho bản demo testnet.
8. **Chỉ dùng mạng thử nghiệm (`DEC-003`):** Hệ thống chỉ dùng cho **Avalanche Fuji testnet (`43113`)** và Anvil local (`31337`), không dùng tiền thật hay triển khai mainnet.
