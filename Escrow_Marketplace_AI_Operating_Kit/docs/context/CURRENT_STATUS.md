# Current Project Status

> Last updated: 2026-11-08  
> Status: `Phase 0 + 1 + 2 + 3A (Hardening) DONE — đang chuẩn bị Frontend & Deploy Fuji`

## High-level

- [x] Repo folder structure shared by Project Owner.
- [x] Cowork Project points to repo root.
- [x] Historical context consolidated into CLAUDE.md (nay chuyển sang KIT docs/context/).
- [x] Canonical context validated by Project Owner.
- [x] Phase 0 Project Assessment completed.
- [x] Phase 1 (AI Pipeline + Backend) completed with full test coverage.
- [x] Phase 2 (Spec documents) completed — FRONTEND_SPEC, VAI3_DYNAMIC_DEPOSIT_SPEC, L1_MODULE_SPEC, SLIDE_AND_VIDEO_SCRIPT.
- [x] Phase 3A (Backend Hardening: SSRF, API Key, Rate Limit, CORS, Listing Validation) completed — 42 backend unit tests PASS.
- [ ] Frontend coded (theo docs/FRONTEND_SPEC.md).
- [ ] Deploy lên Fuji testnet.
- [ ] Slide pitch + video demo hoàn thành.
- [ ] Nộp bài trước 21/11/2026 23:59.

## Module status

| Module | Folder | Audit status | Tests | Kết quả | Owner |
|---|---|---|---|---|---|
| Smart Contract | `contracts/src/` | ✅ AUDITED + FIXED | 81 Foundry tests (unit + fuzz + 2 invariant, 51.200 lời gọi ngẫu nhiên) | **ALL PASS** | Quốc |
| AI Pipeline | `ai-pipeline/` | ✅ AUDITED + FIXED | 59 unit tests (ảnh/video tổng hợp `tests/synth.py`) | **ALL PASS** — OCR nonce ~99% trên ảnh tổng hợp; CHƯA hiệu chỉnh ảnh viết tay thật | Quốc |
| Backend | `backend/` | ✅ AUDITED + HARDENED | 42 unit + 14 integration tests (anvil thật) | **ALL PASS** — SSRF protection, API key auth, rate limit, CORS lockdown | Quốc |
| Frontend/UI | chưa tồn tại | ❌ NOT STARTED | — | Spec tại `docs/FRONTEND_SPEC.md` | TBD |
| Deploy Fuji | — | ❌ NOT DONE | — | Chờ ví deployer/agent + AVAX faucet | Quốc |
| Docs (Phase 2 & 3A) | `docs/` | ✅ DONE | — | FRONTEND_SPEC, VAI3_DYNAMIC_DEPOSIT_SPEC, L1_MODULE_SPEC, SLIDE_AND_VIDEO_SCRIPT | Quốc |

## Test commands

```bash
# Smart contracts (Foundry)
cd contracts && forge test

# AI Pipeline + Backend (Python)
.venv/Scripts/python -m pytest backend/tests/test_service_unit.py -v
# (cần anvil chạy nền + Tesseract cài sẵn cho integration test)
```

## Toolchain đã cài trên máy

| Tool | Version | Đường dẫn |
|---|---|---|
| Foundry (forge, cast, anvil) | 1.5.1 | `~/.foundry/bin` |
| Python | 3.12 | `.venv` |
| Tesseract OCR | 5.4 | `C:\Program Files\Tesseract-OCR` |
| OpenZeppelin | v5.1.0 | `contracts/lib/` |
| forge-std | latest | `contracts/lib/` |

## Security Fixes Log

Nhật ký các bug bảo mật đã được kiểm tra, vá và có test kiểm chứng:

1. **Reentrancy on `resolveClean` / Fund Release**
   - *File ảnh hưởng:* `contracts/src/Escrow.sol`
   - *Cách sửa:* Áp dụng OpenZeppelin `ReentrancyGuard` (`nonReentrant` modifier) và tuân thủ mô hình Checks-Effects-Interactions (CEI). Trạng thái chuyển đổi trước khi chuyển AVAX ra ngoài.
   - *Test cover:* `contracts/test/Escrow.t.sol` (`test_ReentrancyOnResolveClean`).

2. **DoS Gas on Receiver Revert (Pull-over-Push Pattern)**
   - *File ảnh hưởng:* `contracts/src/Escrow.sol`
   - *Cách sửa:* Trong `resolveDispute()`, nếu lệnh `.call{value: ...}` tới ví người nhận bị revert (do cố tình từ chối nhận AVAX hoặc vượt gas limit), hợp đồng không revert toàn bộ giao dịch mà ghi nhận khoản tiền vào `pendingWithdrawals[recipient]` và emit sự kiện `PayoutDeferred`. Người nhận sau đó chủ động gọi `withdraw()`.
   - *Test cover:* `contracts/test/Escrow.t.sol` (`test_ResolveDispute_DeferredPayoutOnRevert`, `test_Withdraw_Success`).

3. **Reputation Reset at Zero (Reputation Laundering Prevention)**
   - *File ảnh hưởng:* `contracts/src/Escrow.sol`
   - *Cách sửa:* Trước đây hàm khởi tạo ngầm `_ensureReputationInitialized` kiểm tra `reputation[user] == 0` để gán 50, dẫn tới lỗi nghiêm trọng: kẻ gian có điểm tín nhiệm tụt về 0 sẽ bị reset trở lại 50. Đã sửa bằng cách thêm mapping riêng `reputationInitialized[user]` để phân biệt điểm 0 thật với tài khoản mới.
   - *Test cover:* `contracts/test/Escrow.t.sol` (`test_Reputation_FloorAtZero_AndNoReset`).

4. **Stack-Too-Deep on `getTrade` Getter**
   - *File ảnh hưởng:* `contracts/src/Escrow.sol`
   - *Cách sửa:* `Trade` struct có nhiều trường dẫn tới lỗi Stack-Too-Deep khi biên dịch trên EVM. Đã gom nhóm và dùng memory struct return view chuẩn hóa để tránh tràn stack.
   - *Test cover:* `contracts/test/Escrow.t.sol` và `backend/tests/test_service_unit.py` (`test_state_enum_matches_contract_order`).

5. **SSRF (Server-Side Request Forgery) in Evidence Download**
   - *File ảnh hưởng:* `backend/attest_service.py`
   - *Cách sửa:* Đảo ngược logic allowlist (mặc định chỉ cho phép gateway host), cấm phân giải DNS ra các dải IP private/loopback/link-local/metadata (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `100.64.0.0/10`, `0.0.0.0/8`, `::1`, `fe80::/10`). Tái kiểm tra allowlist và IP sau mỗi redirect (giới hạn tối đa 3 redirects). Giới hạn `Content-Type` chỉ cho phép `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `application/octet-stream`.
   - *Test cover:* `backend/tests/test_service_unit.py` -> `TestSSRFProtection` (8 unit tests).

6. **Unauthenticated Attestation & API Abuse (API Key + Rate Limit + CORS Lockdown)**
   - *File ảnh hưởng:* `backend/attest_service.py`
   - *Cách sửa:* Yêu cầu header `X-API-Key` cho endpoint `POST /verify-evidence` (bỏ qua khi ở chế độ dev); bổ sung in-memory rate limiter 10 request/phút/IP với thread lock; chuyển cấu hình mặc định của CORS thành rỗng (không cho phép origin nào trừ khi được cấu hình rõ ràng).
   - *Test cover:* `backend/tests/test_service_unit.py` -> `TestAPIKeyAuth`, `TestRateLimiting`, `TestCORS` (7 unit tests).

7. **Listing Image Validation & Keccak256 Hash Logging**
   - *File ảnh hưởng:* `backend/attest_service.py`
   - *Cách sửa:* Bắt buộc `listing_image_url` phải có scheme `ipfs://`, từ chối URL http/https trực tiếp với mã HTTP 422. Tự động tính hash `keccak256` của file ảnh listing và lưu vào report JSON dưới key `listing_hash` để phục vụ đối chiếu minh bạch.
   - *Test cover:* `backend/tests/test_service_unit.py` -> `TestListingValidation` (4 unit tests).

8. **Các bug bảo mật khác (từ đợt audit trước)**
   - *Ghi chú:* Một số bug chi tiết khác về ràng buộc thời gian cửa sổ và kiểm tra tràn số biên độ nhỏ chưa truy lại được chi tiết commit cụ thể do git commit squash ban đầu, cần kiểm tra thêm khi audit tổng thể.

## Blockers hiện tại

- Cần ví deployer + ví agent riêng, xin AVAX Fuji faucet (Quốc tự làm)
- Cần người/AI code frontend theo `docs/FRONTEND_SPEC.md`
- Cần thu thập 40–60 cặp ảnh thật (có nhãn) để hiệu chỉnh ngưỡng AI

## Timeline

| Giai đoạn | Việc |
|---|---|
| Đến ~11/11 | Thu thập ảnh thật, bắt đầu frontend |
| 12–15/11 | Nối end-to-end trên Fuji, frontend tích hợp |
| **16/11** | **Đóng băng tính năng** |
| 17–20/11 | Slide, quay video, kiểm tra link ẩn danh |
| **21/11 23:59** | **Hạn chót nộp bài** |
| 30/11 | Final Demo Day (nếu vào Top 10) |

## Update log

| Date | Update | Source |
|---|---|---|
| 2026-11-04 | Phase 0+1+2 hoàn thành: 81 contract tests, 59 AI tests, 37 backend tests pass. 12 bug bảo mật đã sửa. | Claude Code audit |
| 2026-11-05 | Chuyển sang KIT structure, sync thông tin từ CLAUDE.md | Cowork session |
| 2026-11-08 | Phase 3A: Hoàn thành SSRF protection, API Key Auth, Rate Limiter, CORS Lockdown, Listing Image Validation. Tổng 42 backend unit tests PASS. | Engineering Lead |
