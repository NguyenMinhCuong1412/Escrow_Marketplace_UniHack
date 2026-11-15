# Technical Stack Register

> Trạng thái: `UPDATED (MKT-001..MKT-005) – đồng bộ theo codebase hiện tại`
> Verified against commit: `bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5` (working tree gồm thay đổi MKT-001..MKT-005 chưa commit — cập nhật hash sau khi merge)

## Stack đã xác nhận

| Layer | Tool/Framework | Version / Chi tiết | Có sẵn? | Test command | Ghi chú |
|---|---|---|---|---|---|
| Frontend & BFF | Next.js App Router + React + TypeScript | Next `15.5.29`, React `^18.3.1`, TS `^5.4.5` | ✅ | `cd frontend && npx tsc --noEmit && npm test && npm run build` | Pages `/`, `/listings/[id]`, `/sell`, `/trades`, `/trade/new`, `/trade/[id]`, `/auth`, `/auth/local`, `/admin`, `/profile/[address]` |
| UI & Web3 Client | Tailwind CSS + Wagmi + Viem + RainbowKit + Sonner | Tailwind `^3.4.1`, Wagmi `^2.14.9`, Viem `^2.21.58`, RainbowKit `^2.2.1` | ✅ | `npm test` (`node --test test/*.test.cjs`) | Hỗ trợ Core Wallet (EIP-1193) + Local Browser Wallet (`frontend/lib/local-wallet/`) |
| BFF Security | HMAC-SHA256 Proxy + Session Cookie + CSRF | Node `crypto.timingSafeEqual` | ✅ | `cd frontend && npm test` | BFF ký request sang FastAPI, xác thực `escrow_auth_session` (fail-closed `SESSION_SECRET` trên non-`31337`), `validateCsrfRequest()`, `/api/pin` magic-bytes check |
| Backend API | FastAPI (Python 3.12 / `.venv`) | `fastapi>=0.110`, `uvicorn>=0.29`, `web3>=6.15` | ✅ | `pytest -rs` | `/health`, `/trade/{id}`, `/trade/{id}/uris`, `/trade/{id}/nonce-qr.png`, `/verify-evidence`, `/report/{id}`, `/agent/status/{id}`, `/listings/*`, `/requests/*`, `/trades/{id}/sync`, `/trades/{id}/context` |
| Database | SQLite (chế độ WAL) + JSON store | `DATA_DIR/marketplace.db` (`backend/db.py`, `backend/listings.py`) | ✅ | `pytest backend/tests/test_listings_unit.py backend/tests/test_listings_integration.py -rs` | Bảng Marketplace (`listings`, `listing_images`, `purchase_requests`, `listing_trades`), giữ chỗ `BEGIN IMMEDIATE` TTL 30 phút; pHash/URI/Report store dùng JSON |
| Contracts | Solidity + Foundry | Foundry `1.5.1`, OpenZeppelin `v5.1.0` | ✅ | `cd contracts && forge test` | `Escrow.sol` (deposit-only 30% AVAX), `CollectibleToken.sol` (CDU Soulbound 1:1) |
| AI Pipeline | OpenCV, NumPy, Tesseract OCR | Tesseract `5.4`, pHash, ORB, QR + OCR | ✅ | `pytest ai-pipeline/ -rs` | QR nonce ưu tiên trước, OCR fallback; `CLIP` tùy chọn; `draw_match_visual()` tạo PNG giải thích |
| Chain | Avalanche C-Chain Fuji / Local Anvil | Chain `43113` (Fuji) / `31337` (Anvil) | ✅ | — | Contract `43113.json`: Escrow `0x19D053c84941411888f5b9e40c854365fdd4eb00` |
| CI & Lint | GitHub Actions / ESLint | — | ❌ | `npm run lint` (`FAIL` — chưa cấu hình ESLint) | Chấp nhận hoãn CI/Vitest theo `0D-08`; ESLint ghi nhận tại `TST-03` |
| Docker | `backend/Dockerfile` | Container build backend | ✅ | `docker build` (chưa chạy ở MKT-005) | Dùng để triển khai backend FastAPI |

## Avalanche test environment

| Mục | Giá trị |
|---|---|
| Network | Avalanche Fuji C-Chain (testnet) |
| Chain ID | `43113` (dev local dùng Anvil `31337`) |
| RPC | `https://api.avax-test.network/ext/bc/C/rpc` |
| Deployed Contracts (`43113.json`) | Escrow `0x19D053c84941411888f5b9e40c854365fdd4eb00` · CDU `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78` (block `60980241`) |
| Faucet | core.app faucet (cần Owner tự xin cho ví Agent `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081`) |
| Explorer | testnet.snowtrace.io |

**Lưu ý:**
- Không rải chain ID/RPC hoặc secret thành literal trong source — dùng biến môi trường tập trung (`backend/.env`, `frontend/.env.local`).
- Trên Fuji (`43113`), các cờ nới lỏng local (`ALLOW_LOCAL_HOSTS=true`, `ENFORCE_EVIDENCE_HASH=false`, thiếu `ATTEST_API_KEY`, thiếu `PINATA_JWT`, `REQUIRE_PROXY_SIGNATURE=false`, fallback `SESSION_SECRET`) đều bị fail-closed.

## AI Pipeline chi tiết

| Thành phần | Mô tả |
|---|---|
| pHash (DCT) | Perceptual hash — phát hiện ảnh/khung hình tái sử dụng, bền với nén lại |
| ORB keypoints | Keypoint matching — so sánh ảnh listing ↔ seller ↔ buyer, loại false match từ giấy nonce |
| QR + OCR nonce | Ưu tiên đọc mã QR nonce (`/trade/{id}/nonce-qr.png`), fallback sang Tesseract OCR nhận diện hex viết tay |
| CLIP embeddings | Semantic similarity (tùy chọn, dùng `lru_cache` nếu bật) |
| Video support | Trích keyframe từ video unbox của Buyer, kiểm tra reuse và match nonce trên khung hình |
| Explainable Report | `draw_match_visual()` — PNG keypoint và điểm rủi ro cho frontend hiển thị tại `/trade/[id]/report` |

## Nguyên tắc lựa chọn stack

1. Giữ framework đang chạy ổn và kiểm chứng đầy đủ trước khi bàn giao; báo cáo số lượng test trích trực tiếp từ lần chạy mới nhất (không ghi cứng số lượng test trong tài liệu tĩnh — `SE-06`).
2. Chỉ nâng cấp vì security, compatibility, bug hoặc requirement có bằng chứng.
3. Không chạy đồng thời nhiều framework test gây xung đột runner; dùng `forge test`, `pytest -rs`, `node --test`.
4. Không đưa RPC URL có key, private key, `SESSION_SECRET` hoặc `ATTEST_API_KEY` vào Git.
5. Mỗi thay đổi kiến trúc/stack cần ghi nhận vào `DECISION_LOG.md`.
