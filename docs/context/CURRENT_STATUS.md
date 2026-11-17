# Current Project Status

> Last updated: 2026-11-17
> Verified against commit: `f6b909a575c6f7b45fdceb50d92ce33aa2101713` (`main`, PR #13)
> Status: `Code & bảo mật bản demo đã ổn định trên main (f6b909a); Trade #4 đã hoàn cọc timeout (Cancelled, Escrow = 0 AVAX), chuyển sang hoàn thiện slide, video demo Clean Flow + Dispute 5% và hồ sơ UniHack 2026`

## High-level

- [x] Repo folder structure + context docs consolidated.
- [x] Smart Contracts + AI Pipeline + Backend + Next.js 15 Frontend App Router (Local Wallet, Core Wallet, Quiet Fintech UI & BFF HMAC) hoàn thiện và hợp nhất trên `main` (`f6b909a`).
- [x] Deploy contracts to Avalanche Fuji testnet (`43113`) — xem [contracts/deployments/43113.json](../../contracts/deployments/43113.json).
- [x] AI Agent tự động quét nền (`AGENT_AUTO=true`, `DEC-013`) + QR Nonce trước / OCR dự phòng.
- [x] Bảo mật BFF & Marketplace cho triển khai thực tế: fail-closed `SESSION_SECRET` trên non-`31337`, `REQUIRE_PROXY_SIGNATURE=true`, CSRF `/api/verify` + `/api/uris` + `/api/pin`, magic bytes IPFS, `README.md` chuẩn hóa.
- [x] Kiểm chứng thực tế UI + Snowtrace trên Avalanche Fuji (`43113`): `Trade #1` & `#2` (`Cancelled`), `Trade #3` (`ResolvedDispute(address(0), 0)`), và `Trade #4` (`Cancelled` sau hoàn cọc timeout qua tx `0x82ab62...4bbd`, `Escrow balance = 0.000000 AVAX` — xem [FUJI-TRADE-4-QA.md](../test-evidence/FUJI-TRADE-4-QA.md)).
- [ ] **Hai luồng Fuji còn thiếu khi quay video demo (`ResolvedClean` & `ResolvedDispute` phạt 5%):** Thực hiện trực tiếp bằng Core Wallet khi quay video theo [SLIDE_AND_VIDEO_SCRIPT.md](../specs/SLIDE_AND_VIDEO_SCRIPT.md).
- [ ] Pitch Deck / Slide (Bắt buộc) + Video Demo 2–3p (Bắt buộc) trên [README.md](../../README.md) §5 (`PENDING-OWNER`; Live Fuji dApp URL là `OPTIONAL`).

## Module status

| Module | Folder | Status | Verification & Notes | Owner |
|---|---|---|---|---|
| Smart Contract | `contracts/src/` | ✅ DEPLOYED (`43113`) | `Escrow.sol`, `CollectibleToken.sol`; Foundry `forge test` trên `main (f6b909a)`: `80 passed, 0 failed, 0 skipped` (gồm 2 invariant `256 runs, 51,200 calls`) | Quốc |
| AI Pipeline | `ai-pipeline/` | ✅ IMPLEMENTED | pHash + ORB + QR/OCR nonce + video keyframe + CLIP optional (`pytest -rs` trên `main (f6b909a)`: `185 passed, 0 failed, 0 skipped`) | Quốc |
| Backend + Marketplace | `backend/` | ✅ HARDENED & READY (`43113`) | FastAPI + SQLite WAL (`marketplace.db`), HMAC + replay guard + `REQUIRE_PROXY_SIGNATURE=true`, `AGENT_AUTO=true` | Quốc |
| Frontend + BFF | `frontend/` | ✅ MERGED (`f6b909a`) | Next.js 15 App Router, BFF HMAC proxy, fail-closed `SESSION_SECRET`, CSRF `/api/verify` + `/api/uris`, Core/Local Wallet (`npm test`: `67 passed`, `tsc --noEmit` & `next build` pass) | Quốc |
| Deploy Fuji (`43113`) | `contracts/deployments/43113.json` | ✅ DEPLOYED | Escrow `0x19D053c84941411888f5b9e40c854365fdd4eb00`, CDU Token `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`, deploy block `60980241`, windows `600s/600s/90s` | Quốc |
| Fuji E2E & QA Evidence | `docs/test-evidence/` | 🟡 PARTIAL | Đã xác minh thực tế UI + Snowtrace `Trade #1..#4` ([FUJI-TRADE-4-QA.md](../test-evidence/FUJI-TRADE-4-QA.md)); `Trade #4` đã hoàn cọc về `0 AVAX`. Còn `ResolvedClean` & phạt `5%` quay lúc làm video | Quốc |
| Slide + Video + Links | `README.md`, `docs/specs/` | ⏳ `PENDING-OWNER` | Kịch bản 11 slide & video 2–3p sẵn sàng ([SLIDE_AND_VIDEO_SCRIPT.md](../specs/SLIDE_AND_VIDEO_SCRIPT.md)); `README.md` §5 chờ điền link Video/Slide (`Live Fuji dApp` là `OPTIONAL`) | Quốc |

## Test commands

```bash
# Smart contracts (Foundry)
cd contracts && forge test

# AI Pipeline + Backend + Integration (Python)
.\.venv\Scripts\python.exe -m pytest -rs

# Frontend Typecheck + Security/Unit tests + Production build
cd frontend && npx tsc --noEmit && npm test && npm run build
```

> Lưu ý `npm run lint`: ESLint chưa được cấu hình đầy đủ trên repo (`npm run lint` thất bại vì chưa có `.eslintrc`/interactive prompt).

## Blockers & Tồn đọng hiện tại (trước hạn nộp UniHack `21/11/2026 23:59 VN`)

- **Thiếu bằng chứng on-chain của 2 luồng chính khi quay demo:** Trên Fuji hiện có `Cancelled` (`Trade #1`, `#2`, `#4`) và `ResolvedDispute(address(0), 0)` (`Trade #3`); cần quay đủ 1 `ResolvedClean` và 1 `ResolvedDispute` phạt `5%` (`violator != address(0)`) trong video demo.
- **Link nộp bài bắt buộc trong `README.md` §5:** `Demo Video` và `Pitch Deck / Slide` đang ở trạng thái `PENDING-OWNER` (`Live Fuji dApp` là `OPTIONAL`). Mọi link nộp phải mở được ở chế độ ẩn danh không cần đăng nhập (GitHub public hoặc mời `tuantqse90`).
- **Quản trị quyết định & cấu hình còn mở:** `DEC-018..022` giữ trạng thái `PROPOSED` trong [DECISION_LOG.md](DECISION_LOG.md) chờ Owner duyệt chính thức; `npm run lint` (ESLint) chưa cấu hình; ví Agent (`0x579e...7081`) hiện còn `0.420000 AVAX` (khuyến nghị nạp thêm `>= 0.1 AVAX` Faucet nếu muốn đạt `>= 0.5 AVAX` trước Demo Day).

## Timeline

| Giai đoạn | Việc |
|---|---|
| **10–15/11** | Deploy Fuji (`43113`), nâng cấp Marketplace off-chain, bảo mật BFF & hợp nhất PR #13 vào `main` (`f6b909a`) |
| **17/11** | Kiểm thử Fuji `Trade #1..#4`, xác minh hoàn cọc `Trade #4` (`Cancelled`, `Escrow = 0 AVAX`) và hoàn thiện kịch bản 11 slide/video |
| **Kế tiếp (Owner)** | Quay video Clean Flow + Dispute 5% trên Fuji, xuất bản Slide/Video công khai và cập nhật `README.md` §5 |
| **Trước 21/11 23:59 VN** | Nộp hồ sơ UniHack tại `team1vn.xyz` (và dự phòng Builder Hub nếu cần); Demo Day `30/11/2026` |
