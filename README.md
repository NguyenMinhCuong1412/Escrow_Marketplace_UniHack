# Escrow Marketplace for Collectibles
Decentralized collectibles marketplace on Avalanche C-Chain (Fuji `43113` / Anvil `31337`) with 30% AVAX deposit-only escrow and autonomous AI evidence attestation.
Tech stack: Next.js 15 App Router (BFF HMAC + Local Wallet + Wagmi) · FastAPI + SQLite WAL (Python 3.12) · OpenCV, Tesseract OCR, pHash · Solidity (Foundry 1.5.1, OpenZeppelin v5.1) · Avalanche Fuji.

---

## 1. Giới thiệu sản phẩm

Escrow Marketplace là sàn giao dịch đồ sưu tầm nhiều người dùng (LEGO, mô hình, figure, thẻ bài, xu sưu tầm) kết hợp ký quỹ phi tập trung trên Avalanche C-Chain. Người dùng duyệt, đăng bán và gửi yêu cầu mua off-chain, sau đó khóa giao dịch bằng **Escrow ký quỹ cọc 30% AVAX** và dùng **AI Agent** phân tích bằng chứng đóng gói / mở hộp (ảnh & video) để chứng thực rủi ro on-chain.

- **Ký quỹ 30% minh bạch:** Người mua và người bán mỗi bên đặt cọc đúng **30% giá trị niêm yết** bằng AVAX (`MAX_DEPOSIT_BPS = 3000`); token **CDU** (`CollectibleToken`) là token kế toán Soulbound 1:1 không chuyển nhượng. Hợp đồng chỉ giữ tiền cọc (không giữ toàn bộ giá mua hàng hóa).
- **Xác thực AI tự trị:** Pipeline thị giác máy tính kết hợp pHash (chống tái sử dụng ảnh), ORB/RANSAC (so khớp đặc trưng vật thể) và QR/OCR (nhận diện nonce chống giả mạo thời gian thực).
- **An toàn tài chính & quyền AI:** AI Agent (`onlyAgent`) chỉ được gửi duy nhất giao dịch `attest(tradeId, riskScore, flagged, reportHash)` khi trade ở trạng thái `AwaitingEvidence`. Hoàn cọc sạch thực hiện qua `resolveClean()`; mọi tranh chấp (`flagged=true` hoặc `fileComplaint()`) do **Owner / Arbiter** quyết định qua `resolveDispute()`.

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
- **Ký quỹ 30% AVAX (Deposit-only Escrow):** `Escrow.sol` giữ tiền cọc **30% giá trị niêm yết** từ mỗi bên (`MAX_DEPOSIT_BPS = 3000`), không giữ toàn bộ giá mua hàng hóa trên contract. Token **CDU** (`CollectibleToken.sol`) là token kế toán **Soulbound 1:1** theo lượng cọc đang ký quỹ, không chuyển nhượng.
- **Giới hạn quyền AI Agent (`onlyAgent`):** AI Agent chỉ được gọi duy nhất giao dịch `attest(tradeId, riskScore, flagged, reportHash)` khi trade ở trạng thái `AwaitingEvidence`. Mọi tranh chấp (`flagged=true` hoặc khiếu nại) do **Owner / Arbiter** xử lý on-chain qua `resolveDispute()`.

## 3. Hướng dẫn chạy môi trường Local

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
- **Live Fuji dApp:** `PENDING-OWNER`
- **Fuji Escrow Address (`43113`):** `0x19D053c84941411888f5b9e40c854365fdd4eb00` (block `60980241`, xem `contracts/deployments/43113.json`)
- **Fuji CollectibleToken (`CDU`) Address:** `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`
- **AI Agent Address (`onlyAgent`):** `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081`
- **Owner / Arbiter Address:** `0xCa76cBE87902108712729A02F78C1F8cC20b39Eb`
- **Window Parameters (`43113.json`):** `evidenceWindow=600s`, `attestWindow=600s`, `disputeWindow=90s`
