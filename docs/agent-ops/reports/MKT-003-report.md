# MKT-003 Report — Next.js BFF, IPFS Security & Marketplace API

**Project:** `D:\Escrow_Marketplace_Demo`\
**Stage:** MKT-003 (Next.js BFF, IPFS Hardening & Marketplace Client Library)\
**Date:** 2026-11-14\
**Base Commit:** `bdb1e13` (`merge: complete wallet authentication and frontend UI`, với các thay đổi local MKT-002 và Auth/Carousel được giữ nguyên vẹn)\
**Status:** COMPLETED — Ready for Project Owner review before `MKT-004`

---

## 1. Tóm tắt triển khai

MKT-003 hoàn thiện lớp Next.js App Router Backend-for-Frontend (BFF), bảo mật upload IPFS (`/api/pin`) và thư viện client TypeScript (`frontend/lib/marketplace.ts`) kết nối trực tiếp với hệ thống FastAPI MKT-002 trên Avalanche Fuji (`43113`) và local Anvil (`31337`):

1. **Next.js Marketplace BFF Routes (11 route mới):** Che phủ toàn bộ vòng đời listing, purchase request, bind-trade, sync và trade context với allowlist đường dẫn/field/query chặt chẽ (không phải generic proxy).
2. **Xác thực & Ký HMAC Server-to-Server:** Mọi route ghi và dữ liệu riêng tư đều xác minh cookie `escrow_auth_session` bằng `verifySessionFromRequest()`, từ chối payload giả mạo danh tính ví/mạng (`400 SPOOFED_IDENTITY_FORBIDDEN`), chống CSRF trên thao tác ghi và ký request gửi sang FastAPI khớp từng byte với `compute_proxy_signature()` trong `backend/listings.py`.
3. **Guest Support An Toàn:** Các route công khai (`GET /api/listings`, `GET /api/listings/[id]`, `GET /api/trades/[id]/context`) hỗ trợ khách chưa đăng nhập mà không gửi bất kỳ header nhận diện ví giả nào (`X-Authenticated-Wallet`, `X-Auth-*` đều không xuất hiện cho Guest); khi người dùng có session hợp lệ, BFF đính kèm chữ ký HMAC đầy đủ để tương thích chế độ `REQUIRE_PROXY_SIGNATURE=true`.
4. **IPFS Upload Hardening (`/api/pin`):** Nhận diện MIME hoàn toàn từ magic bytes (chỉ JPEG, PNG, WEBP, MP4), chặn file rỗng và vượt dung lượng (10 MB ảnh / 50 MB MP4), bọc lại `Blob` với tên file ngẫu nhiên trước khi đẩy lên Pinata, ẩn chi tiết lỗi upstream để không lộ token, và **fail-closed `503 IPFS_PROVIDER_UNCONFIGURED`** trên mạng `43113` (và mọi trường hợp khác local `31337`) khi thiếu `PINATA_JWT`.
5. **Client Library & Wei Precision (`frontend/lib/marketplace.ts`):** Toàn bộ helper giá AVAX↔wei và tính cọc 30% dùng `bigint` + `string` (`viem` `parseEther`/`formatEther`), chuẩn hóa đầy đủ mã lỗi HTTP (`401`, `403`, `409`, `502`, `503`) và mã lỗi nghiệp vụ MKT-002 (`CHAIN_UNVERIFIED_CANNOT_RELEASE`, `ONCHAIN_TRADE_ALREADY_EXISTS`, `INSUFFICIENT_STOCK_AFTER_EXPIRY`, `OUT_OF_STOCK_OR_RESERVED`), kèm tự động sinh/chuyển tiếp `Idempotency-Key`.

### Ràng buộc đã tuân thủ
- Không chỉnh sửa Smart Contract, ABI, Wallet (`frontend/lib/wallet-providers.ts`, `frontend/lib/local-wallet/*`), Auth (`frontend/lib/auth-session.ts`, `frontend/app/api/auth/*`, `frontend/lib/auth-challenge.ts`), AI Pipeline hoặc các trang UI (`/`, `/auth`, `/sell`, `/trades`, `/trade/[id]`).
- Không chỉnh sửa `.env*`, `package.json`, lockfile hay dữ liệu mock sản phẩm giả; giữ nguyên toàn bộ thay đổi local trước đó.
- Không commit/push git, chưa triển khai giao diện Shopee-style (thuộc `MKT-004`).

---

## 2. Danh sách file tạo mới và chỉnh sửa

| File | Trạng thái | Vai trò |
|---|---|---|
| `frontend/lib/pin-security.ts` | Tạo mới | Kiểm tra magic bytes JPEG/PNG/WEBP/MP4, đối chiếu MIME, giới hạn 10 MB / 50 MB, chính sách fail-closed khi thiếu `PINATA_JWT` ngoài chain `31337`. |
| `frontend/app/api/pin/route.ts` | Cập nhật | Thêm kiểm tra CSRF, empty-file & size cap trước/sau khi đọc buffer, kiểm tra magic bytes, đóng gói lại `Blob` sạch gửi Pinata với timeout 30s và fail-closed `503` trên Fuji. |
| `frontend/lib/marketplace-bff.ts` | Tạo mới | Helper server-only BFF: `computeProxySignature`, `buildSignedProxyHeaders`, `validateCsrfRequest`, `parseJsonBodyStrict`, `extractAllowedQuery`, `validateIdempotencyKeyHeader`, `forwardPublicMarketplaceGet`, `forwardAuthenticatedMarketplaceRequest`. |
| `frontend/lib/marketplace.ts` | Tạo mới | DTO TypeScript khớp `backend/listings.py`, helper BigInt/string AVAX↔wei & deposit 30%, chuẩn hóa lỗi (`MarketplaceApiError`) và 13 API client helpers gọi `/api/*`. |
| `frontend/app/api/listings/route.ts` | Tạo mới | `GET` (public browse allowlisted query) và `POST` (tạo listing, auth + HMAC + CSRF + `Idempotency-Key`). |
| `frontend/app/api/listings/mine/route.ts` | Tạo mới | `GET` tin đăng của seller đang đăng nhập; ép `seller = session.address.toLowerCase()` và mặc định `status=ALL`. |
| `frontend/app/api/listings/[id]/route.ts` | Tạo mới | `GET` chi tiết listing công khai (`isValidResourceId`) và `PATCH` cập nhật listing (auth + HMAC + CSRF). |
| `frontend/app/api/listings/[id]/requests/route.ts` | Tạo mới | `POST` tạo yêu cầu mua hàng từ buyer (auth + HMAC + CSRF + `Idempotency-Key`). |
| `frontend/app/api/requests/route.ts` | Tạo mới | `GET` danh sách purchase request của user đang đăng nhập (`role`, `status`, `page`, `limit`). |
| `frontend/app/api/requests/[id]/route.ts` | Tạo mới | `GET` chi tiết 1 purchase request (auth + HMAC). |
| `frontend/app/api/requests/[id]/decision/route.ts` | Tạo mới | `POST` seller accept/reject purchase request (auth + HMAC + CSRF + `Idempotency-Key`). |
| `frontend/app/api/requests/[id]/cancel/route.ts` | Tạo mới | `POST` buyer/seller hủy purchase request khi hợp lệ (`allowEmptyBody: true`, auth + HMAC + CSRF + `Idempotency-Key`). |
| `frontend/app/api/requests/[id]/bind-trade/route.ts` | Tạo mới | `POST` gắn/khôi phục giao dịch Escrow on-chain vào request (`tx_hash`, `trade_id`, auth + HMAC + CSRF + `Idempotency-Key`). |
| `frontend/app/api/trades/[id]/sync/route.ts` | Tạo mới | `POST` đồng bộ trạng thái Escrow & tồn kho (`isValidPositiveIntId`, `allowedBodyFields: []`, `allowEmptyBody: true`, auth + HMAC + CSRF + `Idempotency-Key`). |
| `frontend/app/api/trades/[id]/context/route.ts` | Tạo mới | `GET` metadata sản phẩm gắn với `tradeId` (`isValidPositiveIntId`, hỗ trợ Guest). |
| `frontend/test/pin-hardening.test.cjs` | Tạo mới | Unit & route tests bảo mật `/api/pin` và `pin-security.ts`. |
| `frontend/test/marketplace-bff.test.cjs` | Tạo mới | Unit & route tests BFF HMAC, CSRF, chống spoof, `marketplace.ts` BigInt & error normalization. |
| `docs/agent-ops/reports/MKT-003-report.md` | Tạo mới | Báo cáo hoàn thành giai đoạn MKT-003. |

---

## 3. Bảng ánh xạ Next.js BFF ↔ FastAPI Backend

| Next.js BFF Route | Method | FastAPI Upstream | Xác thực Session | Ký HMAC Server-to-Server | CSRF Check | `Idempotency-Key` | Allowlist Query / Body Fields |
|---|---|---|---|---|---|---|---|
| `/api/listings` | `GET` | `GET /listings` | Không bắt buộc (hỗ trợ Guest) | Ký nếu có session; Guest không gắn header ví | Không | Không | Query: `q`, `category`, `condition`, `status`, `seller`, `min_price_wei`, `max_price_wei`, `in_stock_only`, `sort`, `page`, `limit` |
| `/api/listings` | `POST` | `POST /listings` | Bắt buộc (`401`) | Bắt buộc | Bắt buộc (`403`/`415`) | Có | Body: `sku`, `category`, `title`, `description`, `price_wei`, `condition`, `quantity_total`, `images` |
| `/api/listings/mine` | `GET` | `GET /listings` | Bắt buộc (`401`) | Bắt buộc | Không | Không | Ép `seller = session.address`, mặc định `status = ALL`; Query: `q`, `category`, `condition`, `status`, `min_price_wei`, `max_price_wei`, `in_stock_only`, `sort`, `page`, `limit` |
| `/api/listings/[id]` | `GET` | `GET /listings/{id}` | Không bắt buộc (hỗ trợ Guest) | Ký nếu có session; Guest không gắn header ví | Không | Không | Path param `[id]` khớp `^[A-Za-z0-9_-]{3,80}$` |
| `/api/listings/[id]` | `PATCH` | `PATCH /listings/{id}` | Bắt buộc (`401`) | Bắt buộc | Bắt buộc (`403`/`415`) | Không | Body: `sku`, `category`, `title`, `description`, `price_wei`, `condition`, `quantity_total`, `images`, `status` |
| `/api/listings/[id]/requests` | `POST` | `POST /listings/{id}/requests` | Bắt buộc (`401`) | Bắt buộc | Bắt buộc (`403`/`415`) | Có | Body: `quantity`, `buyer_note` |
| `/api/requests` | `GET` | `GET /requests` | Bắt buộc (`401`) | Bắt buộc | Không | Không | Query: `role`, `status`, `page`, `limit` |
| `/api/requests/[id]` | `GET` | `GET /requests/{id}` | Bắt buộc (`401`) | Bắt buộc | Không | Không | Path param `[id]` khớp `^[A-Za-z0-9_-]{3,80}$` |
| `/api/requests/[id]/decision` | `POST` | `POST /requests/{id}/decision` | Bắt buộc (`401`) | Bắt buộc | Bắt buộc (`403`/`415`) | Có | Body: `action`, `seller_note` |
| `/api/requests/[id]/cancel` | `POST` | `POST /requests/{id}/cancel` | Bắt buộc (`401`) | Bắt buộc | Bắt buộc (`403`/`415`) | Có | Body: `reason` (`allowEmptyBody: true`) |
| `/api/requests/[id]/bind-trade` | `POST` | `POST /requests/{id}/bind-trade` | Bắt buộc (`401`) | Bắt buộc | Bắt buộc (`403`/`415`) | Có | Body: `tx_hash`, `trade_id` |
| `/api/trades/[id]/sync` | `POST` | `POST /trades/{id}/sync` | Bắt buộc (`401`) | Bắt buộc | Bắt buộc (`403`/`415`) | Có | Path `[id]` khớp `^[1-9]\d{0,18}$`; `allowedBodyFields: []` (`allowEmptyBody: true`, vẫn chặn field giả danh tính) |
| `/api/trades/[id]/context` | `GET` | `GET /trades/{id}/context` | Không bắt buộc (hỗ trợ Guest) | Ký nếu có session; Guest không gắn header ví | Không | Không | Path `[id]` khớp `^[1-9]\d{0,18}$` |
| `/api/pin` | `POST` | Pinata `pinFileToIPFS` (hoặc mock trên `31337`) | Bắt buộc (`401`) | N/A | Bắt buộc (`403`/`415`) | N/A | Multipart field `file` kiểm tra magic bytes (JPEG/PNG/WEBP/MP4) |

---

## 4. Thiết kế bảo mật chi tiết

### A. HMAC Server-to-Server & Chống giả danh tính
- **Chữ ký đồng bộ từng byte với Backend (`backend/listings.py`):**\
  `computeProxySignature(secret, method, path, wallet, chainId, timestamp, nonce)` băm HMAC-SHA256 chuỗi:
  ```text
  <METHOD_UPPER>\n<UPSTREAM_PATH_NO_QUERY>\n<WALLET_LOWER>\n<CHAIN_ID>\n<TIMESTAMP>\n<NONCE>
  ```
- **Headers gửi sang FastAPI:** `X-API-Key`, `X-Authenticated-Wallet`, `X-Authenticated-Chain-Id`, `X-Auth-Timestamp`, `X-Auth-Nonce` (16 random bytes hex), `X-Auth-Signature` và `Idempotency-Key` (khi có).
- **Fail-closed nếu thiếu cấu hình:** Nếu `ATTEST_API_KEY` trống khi `REQUIRE_PROXY_SIGNATURE=true` hoặc khi `session.chainId !== 31337` hay `configuredChainId !== 31337`, BFF trả ngay `503 BFF_MISCONFIGURED` trước khi gọi upstream.
- **Chống client spoofing:** `parseJsonBodyStrict` từ chối ngay HTTP `400 SPOOFED_IDENTITY_FORBIDDEN` nếu payload chứa bất kỳ khóa nào trong `{ seller_wallet, buyer_wallet, actor_wallet, wallet, chain_id, chainId, escrow_address, escrowAddress }`, kể cả trên endpoint `POST /api/trades/[id]/sync`. Các trường lạ khác bị lược bỏ hoàn toàn khỏi JSON gửi upstream.
- **Bảo mật CSRF cho thao tác ghi:** Kết hợp cookie `HttpOnly + SameSite=Lax` với `validateCsrfRequest()` — chặn `Sec-Fetch-Site: cross-site`, kiểm tra `Origin` (hoặc fallback `Referer`) khớp host/`ALLOWED_ORIGINS`, và chặn các `<form>` `Content-Type` (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`) trên API JSON.
- **Tách biệt secret:** `ATTEST_API_KEY` và `PINATA_JWT` chỉ đọc ở server (`process.env.*`), không bao giờ dùng tiền tố `NEXT_PUBLIC_*` hay trả về trong response. (Các route cũ `/api/uris` và `/api/verify` không nằm trong phạm vi thay đổi của MKT-003 và được giữ nguyên.)

### B. Bảo mật IPFS Upload (`/api/pin` + `pin-security.ts`)
- **Magic-byte inspection thực sự:** `detectMediaMimeFromBytes()` bỏ qua `file.type` do trình duyệt tự khai báo khi quyết định loại tệp thực; chỉ chấp nhận:
  - JPEG (`FF D8 FF <marker>`), PNG (`89 50 4E 47 0D 0A 1A 0A`), WEBP (`RIFF....WEBP`) -> giới hạn `10 MB` (`MAX_IMAGE_BYTES`)
  - MP4 (`ftyp` box với độ dài hợp lệ trong buffer và major brand thuộc danh sách cho phép `isom`, `iso2`..`iso6`, `mp41`, `mp42`, `avc1`, `hvc1`, `hev1`, `M4V `, `mp4v`, `dash`, `f4v `, `MSNV`) -> giới hạn `50 MB` (`MAX_VIDEO_BYTES`)
- **Chặn giả mạo & rò rỉ:** File rỗng (`400 EMPTY_FILE`), file HTML/SVG/EXE/GIF giả đuôi `.jpg` (`415 UNSUPPORTED_MEDIA_TYPE`), hoặc nội dung PNG nhưng header MIME là `image/jpeg` (`415 MIME_MISMATCH`) bị chặn trước khi gọi Pinata. Khi gọi Pinata, dữ liệu được bọc lại trong `Blob` sạch với tên file ngẫu nhiên `marketplace-<hex>.<ext>` và `type = check.mime`; lỗi upstream từ Pinata bị sanitize thành `502 IPFS_PROVIDER_ERROR`.
- **Không mock ngoài `31337`:** Mock CID (`mock<sha256>`) chỉ được phép khi cả `CHAIN_ID`/`NEXT_PUBLIC_CHAIN_ID` lẫn `session.chainId` đều bằng `31337`. Trên Fuji (`43113`), thiếu `PINATA_JWT` luôn trả `503 IPFS_PROVIDER_UNCONFIGURED`.

---

## 5. Kết quả kiểm thử (Verification Evidence)

Tất cả các lần kiểm thử dưới đây đều được thực thi sau lần chỉnh sửa code ứng dụng cuối cùng:

### 1) Frontend Typecheck, Unit/Security Tests & Production Build (`D:\Escrow_Marketplace_Demo\frontend`)

| Kiểm tra | Lệnh thực thi | Kết quả | Chi tiết quan sát |
|---|---|---|---|
| TypeScript strict check | `npx tsc --noEmit` | **PASS** | Exit code `0`, không lỗi kiểu dữ liệu. |
| Frontend Test Suite | `npm test` (`node --test test/*.test.cjs`, Node `v26.13.0`) | **PASS** | **`43 passed, 0 failed, 0 skipped`**: gồm 33 test hiện có (Auth session, Local keystore, Wallet providers, Core pending/rejection, API auth) + 4 test `pin-hardening.test.cjs` + 6 test `marketplace-bff.test.cjs`. |
| Production Build | `npm run build` (`next build`, Next.js `15.5.29`) | **PASS** | Exit code `0`; biên dịch và kiểm tra kiểu thành công toàn bộ routes gồm `/api/pin`, `/api/listings`, `/api/listings/mine`, `/api/listings/[id]`, `/api/listings/[id]/requests`, `/api/requests`, `/api/requests/[id]`, `/api/requests/[id]/decision`, `/api/requests/[id]/cancel`, `/api/requests/[id]/bind-trade`, `/api/trades/[id]/sync`, `/api/trades/[id]/context` (`ƒ Dynamic`). |

### 2) Live Integration Test: Real Next.js BFF ↔ Live FastAPI (`REQUIRE_PROXY_SIGNATURE=true`)

- **Môi trường:** Subprocess `uvicorn attest_service:app` chạy bằng `.venv\Scripts\python.exe` trên cổng local động với `REQUIRE_PROXY_SIGNATURE=true`, `ATTEST_API_KEY` ngẫu nhiên theo phiên, `DATA_DIR` tạm thời (SQLite WAL sạch) và mock IPFS image HTTP local (`CHAIN_ID=31337`, `RPC_URL=""`). Kiểm tra thêm xác thực cấu hình `CHAIN_ID=43113` + `ALLOW_LOCAL_HOSTS=true` khiến FastAPI fail-closed HTTP `503`.
- **Kết quả:** Exit code `0` — tất cả **13** assertion thực tế đều **PASS**:
  1. `GET /api/listings` (Guest) -> `200 OK`, không gửi header ví.
  2. `POST /api/listings` (Seller HMAC-signed) -> `201 Created`, listing `lst_d0b0813cc7464f9e9352`.
  3. `GET /api/listings/mine` (Seller HMAC-signed) -> `200 OK`.
  4. `GET /api/listings` & `GET /api/listings/[id]` (Authenticated Buyer HMAC-signed) -> `200 OK` dưới `REQUIRE_PROXY_SIGNATURE=true`.
  5. `GET /api/listings/[id]` (Guest) -> `200 OK`.
  6. `POST /api/listings/[id]/requests` (Buyer HMAC-signed) -> `201 Created`, request `PENDING` và request `req_b8bacf9f86e741adabc6`.
  7. `POST /api/requests/[id]/cancel` khi `PENDING` (Buyer HMAC-signed) -> `200 OK` (`CANCELLED`).
  8. `POST /api/requests/[id]/decision` (`accept`, Seller HMAC-signed) -> `200 OK` (`ACCEPTED`, `quantity_available=1`, `quantity_reserved=1`); thử cancel khi đang giữ chỗ nhận đúng `409 RESERVATION_STILL_ACTIVE`.
  9. `GET /api/trades/999/context` (Guest) -> `200 OK` (`bound: false`).
  10. Gọi trực tiếp FastAPI thiếu signature -> `401 MISSING_PROXY_SIGNATURE`.
  11. Gọi trực tiếp FastAPI sai HMAC -> `401 INVALID_PROXY_SIGNATURE`.
  12. Replay lại cùng `X-Auth-Nonce` -> lần 1 `200 OK`, lần 2 `401 REPLAY_DETECTED`.
  13. Gửi `X-Auth-Timestamp` quá hạn (kể cả ký hợp lệ bằng secret đúng) -> `401 EXPIRED_PROXY_REQUEST`.

### 3) Backend Compatibility Checks (`D:\Escrow_Marketplace_Demo`)

| Suite | Lệnh thực thi | Kết quả | Dòng tổng kết quan sát |
|---|---|---|---|
| Marketplace Backend Unit | `.\.venv\Scripts\python.exe -m pytest -rs backend/tests/test_listings_unit.py` | **PASS** | `25 passed in 5.78s` (`0 failed, 0 skipped`) |
| Marketplace + Anvil Integration | `.\.venv\Scripts\python.exe -m pytest -rs backend/tests/test_listings_integration.py` | **PASS** | `5 passed in 15.83s` (`0 failed, 0 skipped`) |

### Không kiểm thử trực tiếp (Out-of-scope / Môi trường)
- **Live Pinata Cloud API upload (`https://api.pinata.cloud/pinning/pinFileToIPFS`):** Chưa gọi thật qua Internet vì môi trường task không được sửa `.env` hay dùng credential thật; toàn bộ luồng đóng gói `FormData`, header `Authorization`, kiểm tra MIME/magic bytes và sanitize lỗi upstream `401`/`502` đã được kiểm thử đầy đủ qua mock `global.fetch` trong `pin-hardening.test.cjs`.
- **Full end-to-end trình duyệt UI (`/sell`, `/`, `/trade/[id]`):** Chưa tồn tại vì giao diện Marketplace thuộc `MKT-004`.

---

## 6. Rủi ro còn lại & Bàn giao sang MKT-004

1. **Đồng bộ biến môi trường triển khai Fuji (`43113`):** Trước khi bật staging/demo Fuji, Owner cần cấu hình cùng một `ATTEST_API_KEY` (không dùng tiền tố `NEXT_PUBLIC_*`) ở cả Next.js server và FastAPI Backend, đặt `REQUIRE_PROXY_SIGNATURE=true` ở cả hai bên, và thiết lập `PINATA_JWT` ở server Next.js (nếu thiếu, `/api/pin` sẽ fail-closed `503` như thiết kế).
2. **`ALLOWED_ORIGINS` sau Reverse Proxy:** Nếu Next.js chạy sau domain proxy có host khác `Host` / `X-Forwarded-Host` nội bộ, cần khai báo `ALLOWED_ORIGINS` trong server env để `validateCsrfRequest` không từ chối nhầm request hợp lệ cùng trang.
3. **Sẵn sàng cho MKT-004:** Giao diện Shopee-style ở MKT-004 có thể import trực tiếp DTO, BigInt wei/deposit helpers và 13 BFF client functions từ `frontend/lib/marketplace.ts`, upload ảnh/video qua `POST /api/pin`, mà không cần chạm vào FastAPI hay Smart Contract.
