# Current Project Status

> Last updated: 2026-11-15
> Verified against commit: `bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5` (working tree gồm thay đổi MKT-001..MKT-005 chưa commit — cập nhật hash sau khi merge)
> Status: `MKT-005 Remediation (Security + Doc Sync) hoàn tất code, chờ Owner kiểm tra và thực hiện Avalanche Fuji Manual Verification (chưa FINAL FREEZE)`

## High-level

- [x] Repo folder structure + context docs consolidated (Phase 0).
- [x] Smart Contracts + AI Pipeline + Backend hardened (Phases 1–3A, ESC-080/090).
- [x] Frontend Next.js 15 App Router scaffold, pages, Local Wallet, Core Wallet & Quiet Fintech UI (ESC-020..ESC-100).
- [x] Deploy contracts to Avalanche Fuji testnet (`43113`) — xem `contracts/deployments/43113.json`.
- [x] AI Agent tự động quét nền (`AGENT_AUTO=true`, `DEC-013`) + QR Nonce trước / OCR dự phòng (`OD-09`).
- [x] Marketplace upgrade (`MKT-001..MKT-004`): SQLite WAL (`marketplace.db`), Listing/Purchase Request/TTL 30m/Bind Trade/Sync APIs, Next.js BFF HMAC + `/api/pin` magic bytes + auth session fail-closed, Shopee-style Marketplace UI (chỉ hiển thị listing thật, deposit-only 30% AVAX).
- [x] `MKT-005` QA & Final Remediation (Security P1 `SEC-01..SEC-04` + Doc sync): `SESSION_SECRET` tách biệt và fail-closed trên non-`31337`, `REQUIRE_PROXY_SIGNATURE=true` bắt buộc trên Fuji `43113`, CSRF validation cho `/api/verify` và `/api/uris`, đồng bộ `README.md`, `docs/context/*`, `RISK_REGISTER.md`.
- [ ] **Avalanche Fuji Manual Verification:** `NOT TESTED` end-to-end bản web đầy đủ trên Fuji thật (chờ Owner nạp AVAX ví agent >= 0.5 AVAX, cấu hình `backend/.env` và `frontend/.env.local`).
- [ ] Pitch Deck / Slide + Video Demo + Live Fuji dApp links (`PENDING-OWNER`).

## Module status

| Module | Folder | Status | Verification & Notes | Owner |
|---|---|---|---|---|
| Smart Contract | `contracts/src/` | ✅ DEPLOYED (`43113`) | `Escrow.sol`, `CollectibleToken.sol`; test bằng `cd contracts && forge test` (số liệu xem `MKT-005-remediation-report.md`) | Quốc |
| AI Pipeline | `ai-pipeline/` | ✅ IMPLEMENTED | pHash + ORB + QR/OCR nonce + video keyframe + CLIP optional (`pytest -rs`) | Quốc |
| Backend + Marketplace | `backend/` | ✅ HARDENED (`MKT-002`, `MKT-005`) | FastAPI + SQLite WAL (`DATA_DIR/marketplace.db`), HMAC + replay guard + fail-closed `43113` (`REQUIRE_PROXY_SIGNATURE=true`) | Quốc |
| Frontend + BFF | `frontend/` | ✅ CODED (`MKT-003`, `MKT-004`, `MKT-005`) | Next.js 15 App Router, BFF HMAC proxy, fail-closed `SESSION_SECRET`, CSRF `/api/verify` + `/api/uris`, Core/Local Wallet | Quốc |
| Deploy Fuji (`43113`) | `contracts/deployments/43113.json` | ✅ DEPLOYED | Escrow `0x19D053c84941411888f5b9e40c854365fdd4eb00`, CDU Token `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`, deploy block `60980241`, windows `600s/600s/90s` | Quốc |
| Slide + Video + Live URL | `README.md`, `docs/specs/` | ⏳ `PENDING-OWNER` | Cần link thật sau khi Owner triển khai và quay demo | Quốc |

## Test commands

```bash
# Smart contracts (Foundry)
cd contracts && forge test

# AI Pipeline + Backend + Integration (Python)
.\.venv\Scripts\python.exe -m pytest -rs

# Frontend Typecheck + Security/Unit tests + Production build
cd frontend && npx tsc --noEmit && npm test && npm run build
```

> Lưu ý `npm run lint`: ESLint (`eslint` / `.eslintrc`) chưa được cấu hình hoàn tất trên repo (`npm run lint` thất bại vì interactive prompt / thiếu package — ghi nhận tại `TST-03`).

## Blockers hiện tại (cần Owner xử lý trước khi Verify Fuji / Final Freeze)

- Ví AI Agent trên Fuji (`0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081`) mới ghi nhận số dư `0.05 AVAX` (< ngưỡng Release Gate `0.5 AVAX`) → cần Owner faucet thêm AVAX.
- Môi trường chạy Fuji thật chưa cấu hình đầy đủ bí mật cục bộ: thiếu `backend/.env` (`AGENT_PRIVATE_KEY`, `ATTEST_API_KEY`, `REQUIRE_PROXY_SIGNATURE=true`, `RPC_URL`, `ESCROW_ADDRESS`) và `frontend/.env.local` (`SESSION_SECRET`, `ATTEST_API_KEY`, `PINATA_JWT`, `REQUIRE_PROXY_SIGNATURE=true`).
- Chưa có E2E verification thật trên Fuji `43113` cho luồng Marketplace + IPFS Pinata + AI Agent + Browser UI.
- Các quyết định `DEC-018+` mới đề xuất ở trạng thái `PROPOSED` và các mục `BLOCKED-OWNER` trong `RISK_REGISTER.md` cần Owner rà soát/chốt.
- Demo Video, Pitch Deck, Live Fuji dApp URL đang ở trạng thái `PENDING-OWNER`.

## Timeline

| Giai đoạn | Việc |
|---|---|
| **10–11/11** | Tạo ví, faucet, deploy Fuji |
| 12–15/11 | Nâng cấp Marketplace (`MKT-001..MKT-004`), QA (`MKT-005`) và Security/Doc Remediation (`MKT-005`) |
| **Chờ Owner** | Cấu hình `.env` Fuji, faucet agent >= `0.5 AVAX`, chạy Avalanche Fuji Manual Verification |
| **Sau Manual QA** | Commit/Merge, Slide, Video demo, kiểm tra link công khai (Final Freeze & Submission) |
