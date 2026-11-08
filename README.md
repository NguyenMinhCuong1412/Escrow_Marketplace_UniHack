# Escrow Marketplace for Collectibles
Trustless escrow marketplace on Avalanche C-Chain with autonomous AI-driven evidence attestation.
Tech stack: Solidity (Foundry 1.5.1, OpenZeppelin v5.1) · Python FastAPI (3.12) · OpenCV, Tesseract OCR, pHash · Avalanche Fuji.

---

## 1. Giới thiệu sản phẩm

Escrow Marketplace là giải pháp sàn giao dịch ký quỹ phi tập trung dành cho các tài sản sưu tầm vật lý giá trị cao (thẻ bài, mô hình, sneakers, đồ cổ). Thay vì phụ thuộc vào bên trung gian thứ ba tập trung tốn kém và chậm chễ, hệ thống sử dụng **AI Agent** tự động phân tích và chứng thực bằng chứng đóng gói / mở hộp (ảnh & video) trực tiếp on-chain.

- **Ký cược minh bạch:** Người mua và người bán đều đặt cọc (30%) theo cơ chế "Ký Cược" (Điều 328 BLDS 2015), bảo đảm thực hiện nghĩa vụ.
- **Xác thực AI tự trị:** Pipeline thị giác máy tính kết hợp pHash (chống tái sử dụng ảnh), ORB/RANSAC (so khớp đặc trưng vật thể) và OCR (nhận diện nonce viết tay chống giả mạo thời gian thực).
- **An toàn tài chính:** AI chỉ chứng thực rủi ro (`attest`), hợp đồng thông minh tự động thực thi giải ngân hoặc hoàn cọc theo luật xác định.

## 2. Kiến trúc hệ thống

```text
[Frontend (Next.js / Wagmi)]
       │
       ├─────────────────────────────────┐
       ▼ (EVM Transactions)              ▼ (Evidence Upload / Verification)
[Smart Contracts (Avalanche)]  ◄───  [Backend Attest Service (FastAPI)]
  - Escrow.sol (State Machine)          - SSRF & IP Validation
  - CollectibleToken.sol (CDU Token)    - API Key & Rate Limiting
       ▲                                - Keccak256 Hash Matching
       │ attest(id, risk, reportHash)         │
       └──────────────────────────────────────┴──► [AI Pipeline (OpenCV/OCR)]
```

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
# Điền AGENT_PRIVATE_KEY và ESCROW_ADDRESS (nếu cần) vào .env
pip install -r requirements.txt
uvicorn attest_service:app --host 0.0.0.0 --port 8000
```

### Bước 4: Chạy Frontend (Kế hoạch Phase 3B)
```bash
cd frontend
npm install
npm run dev
```

## 4. Kiểm thử (Test Commands)

```bash
# Contract tests (81 unit, fuzz & invariant tests)
cd contracts && forge test

# Backend & SSRF unit tests (42 unit tests)
cd backend && pytest tests/test_service_unit.py -v

# Integration tests (khi anvil & tesseract đang chạy)
cd backend && pytest tests/test_integration_anvil.py -v
```

## 5. Demo & Tài liệu

- **Demo Video:** `[TBD]`
- **Pitch Deck / Slide:** `[TBD]`
- **Live Fuji dApp:** `[TBD]`
- **Fuji Escrow Address:** `[TBD]`
