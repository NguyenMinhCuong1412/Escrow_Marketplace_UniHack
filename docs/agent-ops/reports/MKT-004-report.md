# MKT-004 Report — Shopee-Style Collectibles Marketplace UI

**Project:** `D:\Escrow_Marketplace_Demo`\
**Stage:** MKT-004 (Marketplace UI — Collectibles Storefront, Seller Studio, My Trades & Escrow Sync)\
**Date:** 2026-11-15\
**Base Reference:** MKT-001, MKT-002, MKT-003 (`docs/agent-ops/reports/MKT-003-report.md`)\
**Status:** COMPLETED — Ready for Project Owner review before `MKT-005`

---

## 1. Tóm tắt triển khai

MKT-004 nâng cấp giao diện Frontend thành sàn đồ sưu tầm phong cách Shopee chạy trên **Next.js App Router + Tailwind CSS**, dùng toàn bộ API Backend (MKT-002) qua Next.js BFF (MKT-003) và giữ trọng tâm ký quỹ **Escrow trên Avalanche Fuji (`43113`)**:

1. **Header & Điều hướng Marketplace (`frontend/components/Navbar.tsx`):**
   - Bổ sung thanh tìm kiếm sản phẩm lớn (tìm theo tên, mô tả hoặc mã SKU, đồng bộ query `?q=` trong `<Suspense>`), giữ logo **Escrow Marketplace**, bổ sung nút **Đăng bán** (`/sell`), **Giao dịch của tôi** (`/trades`), giữ **Escrow P2P** (`/trade/new`) và **Trọng tài Admin** (`/admin`, chỉ hiện cho owner).
   - Responsive đầy đủ với menu drawer di động, dropdown quản lý tài khoản và `LocalWalletManagerModal` hiện có.
2. **Trang chủ Chợ sưu tầm `/` (`frontend/app/page.tsx` + `ProductCard.tsx`):**
   - Hỗ trợ Guest xem chợ tự do (không redirect `/auth`).
   - Thanh danh mục `Tất cả`, `LEGO`, `Mô hình`, `Figure`, `Thẻ bài`, `Xu sưu tầm`, `Khác`; bộ lọc tình trạng, khoảng giá AVAX (zero-float `BigInt`), checkbox `Chỉ hiện còn hàng`, sắp xếp (`Mới nhất`, `Giá tăng dần`, `Giá giảm dần`) và phân trang qua `browseListings()`.
   - Hiển thị lưới `ProductCard` với ảnh chính, SKU, tình trạng, giá niêm yết AVAX, cọc tham chiếu 30%/bên, số lượng còn lại và ví người bán + uy tín; có skeleton loading, banner lỗi kèm nút `Thử tải lại`, và **empty state rõ ràng khi DB trống — không tự seed mock listing**.
3. **Trang chi tiết sản phẩm `/listings/[id]` (`frontend/app/listings/[id]/page.tsx`):**
   - Gallery nhiều ảnh với thumbnail strip, điều hướng trái/phải và badge `Ảnh chính đối chiếu AI`.
   - Hiển thị tách biệt **Đơn giá / Tổng giá trị đơn hàng** và **Cọc bảo vệ Escrow 30% mỗi bên**, ghi chú rõ cơ chế cọc AVAX + token kế toán CDU 1:1 không chuyển nhượng, **không có nút `"Mua ngay"`**.
   - Tích hợp điểm uy tín on-chain (`useReputation`), form chọn số lượng + `buyer_note` + nút `"Gửi yêu cầu mua"`, chặn người bán tự mua hoặc sản phẩm hết hàng/tạm ẩn; Guest thấy CTA chuyển hướng `/auth?returnUrl=/listings/[id]`.
4. **Kênh Người Bán `/sell` (`frontend/app/sell/page.tsx` + `MultiImageUploader.tsx`):**
   - Bảo vệ bởi `AuthGuard`; hỗ trợ tạo tin đăng mới với `MultiImageUploader` (1–10 ảnh IPFS qua `/api/pin`, chọn ảnh chính AI, sắp xếp thứ tự, xóa ảnh, báo lỗi `401`/`413`/`415`/`503` rõ ràng).
   - Quản lý tin đăng theo trạng thái (lọc, chỉnh sửa đầy đủ, tạm ẩn/mở bán lại, hủy tin).
   - Xử lý yêu cầu mua đến (`Accept`/`Reject`), hiển thị bộ đếm TTL giữ chỗ 30 phút.
   - Quy trình tạo Escrow an toàn: chạy `publicClient.simulateContract()` -> `writeContractAsync('createTrade')` -> lưu `pendingBindTrade` (`txHash`) vào `localStorage` **ngay trước khi chờ receipt / gọi `bindRequestTrade`** -> trích xuất `tradeId` qua `extractTradeCreatedIdFromReceipt()` -> liên kết đơn -> nhắc Seller ký xác nhận ảnh niêm yết (`listingMessage()` + `registerUri()`). Khi lỗi API hoặc reload, khóa nút tạo trade mới và hiển thị **Thử liên kết lại (Retry Bind)** (kèm tùy chọn khôi phục `tx_hash` thủ công) để chống tạo trùng giao dịch on-chain.
5. **Giao dịch của tôi `/trades` & Tích hợp `/trade/[id]`:**
   - Tạo `/trades` với 3 tab (`Yêu cầu mua`, `Yêu cầu bán`, `Giao dịch Escrow`), hiển thị ảnh sản phẩm thật, SKU, tên sản phẩm từ BFF/context API và điều hướng sang `/trade/[id]`.
   - Nâng cấp `/trade/[id]/page.tsx`, `TradeList.tsx` và `EvidenceUploader.tsx` để tải context sản phẩm, tự đồng bộ `syncMarketplaceTrade()` sau các tx on-chain và attestation, phân biệt lỗi RPC (`useTrade().isError`) với trạng thái giao dịch không tồn tại, và cập nhật nút quay lại về `/trades`.
6. **Phân quyền Route Guest vs Authenticated (`frontend/lib/auth-routes.ts` + `AuthGuard.tsx`):**
   - Mở quyền truy cập Guest cho `/` và `/listings/[id]`; giữ bảo vệ `/sell`, `/trades`, `/trade/*`, `/admin`, `/profile/*` kèm `returnUrl` an toàn (chống open-redirect).

### Ràng buộc đã tuân thủ
- Không chỉnh sửa Smart Contract, ABI, Backend (`backend/*`), AI Pipeline (`ai-pipeline/*`), Wallet providers (`lib/wallet-providers.ts`, `lib/local-wallet/*`), Auth core (`app/auth/*`, `lib/auth-session.ts`, `hooks/useAuthSession.ts`, `app/api/auth/*`), `.env*`, hay `package.json`/lockfiles.
- Không dùng `parseFloat` để quy đổi giá AVAX/wei ở các màn Marketplace; không tự seed listing giả; không tự động gọi `attest()`; không mở rộng sang `MKT-005` và không commit/push git.

---

## 2. Danh sách file tạo mới và chỉnh sửa

| File | Trạng thái | Vai trò |
|---|---|---|
| `frontend/lib/auth-routes.ts` | Tạo mới | Helper `isPublicMarketplaceRoute`, `sanitizeReturnUrl`, `buildAuthRedirectUrl` cho phân quyền Guest & chống open-redirect. |
| `frontend/lib/marketplace-ui.ts` | Tạo mới | Nhãn danh mục/tình trạng/trạng thái, `buildSellableAvaxPreview`, `extractTradeCreatedIdFromReceipt`, helper `localStorage` cho `pendingBindTrade`. |
| `frontend/components/AuthGuard.tsx` | Cập nhật | Cho phép Guest xem `/` và `/listings/[id]`; bảo vệ route riêng tư kèm `returnUrl`. |
| `frontend/components/Navbar.tsx` | Cập nhật | Thanh tìm kiếm Marketplace (`<Suspense>`), link `Đăng bán`, `Giao dịch của tôi`, `Escrow P2P`, menu mobile responsive & kiểm soát ví. |
| `frontend/components/ProductCard.tsx` | Tạo mới | Card sản phẩm Shopee-style hiển thị ảnh, SKU, danh mục, tình trạng, giá AVAX, cọc 30%/bên, tồn kho và ví người bán. |
| `frontend/components/MultiImageUploader.tsx` | Tạo mới | Upload nhiều ảnh IPFS (1–10 ảnh), chọn ảnh chính AI, đảo thứ tự, xóa và hiển thị badge mock CID / lỗi `/api/pin`. |
| `frontend/app/page.tsx` | Cập nhật | Trang chủ Chợ đồ sưu tầm (`/`) dùng dữ liệu thật từ `browseListings()`, bộ lọc, sắp xếp, phân trang, skeleton & empty state thật. |
| `frontend/app/listings/[id]/page.tsx` | Tạo mới | Trang chi tiết sản phẩm nhiều ảnh, tách riêng giá & cọc 30%/bên, uy tín on-chain và form `Gửi yêu cầu mua`. |
| `frontend/app/sell/page.tsx` | Tạo mới | Seller Studio tạo/sửa/ẩn/hủy tin đăng, duyệt yêu cầu mua và tạo/liên kết/khôi phục Escrow an toàn. |
| `frontend/app/trades/page.tsx` | Tạo mới | Trang `Giao dịch của tôi` với 3 tab (`Yêu cầu mua`, `Yêu cầu bán`, `Giao dịch Escrow`) và đồng bộ BFF. |
| `frontend/app/trade/[id]/page.tsx` | Cập nhật | Tích hợp `getTradeMarketplaceContext`, auto-sync `syncMarketplaceTrade`, banner lỗi RPC từ `useTrade().isError` và link quay lại `/trades`. |
| `frontend/components/TradeList.tsx` | Cập nhật | Bổ sung cột/metadata sản phẩm (`contextsByTradeId`) và fallback `Escrow P2P trực tiếp`. |
| `frontend/components/EvidenceUploader.tsx` | Cập nhật | Gọi `syncMarketplaceTrade(tradeId)` best-effort sau khi `submitEvidence` xác nhận on-chain. |
| `frontend/hooks/useMyTrades.ts` | Cập nhật | Bổ sung `isError` và `error` từ wagmi `useReadContract` / `useReadContracts`. |
| `frontend/hooks/useReputation.ts` | Cập nhật | Bổ sung `hasOnChainData` phục vụ hiển thị điểm uy tín trên trang chi tiết. |
| `frontend/test/marketplace-ui.test.cjs` | Tạo mới | Unit & source-invariant tests cho `auth-routes`, `marketplace-ui`, receipt parsing, recovery state và zero-float/no-bypass checks. |
| `docs/agent-ops/reports/MKT-004-report.md` | Tạo mới | Báo cáo tổng kết và bằng chứng kiểm thử MKT-004. |

---

## 3. Kết quả kiểm thử (Verification Evidence)

Tất cả các kiểm tra dưới đây được thực thi **sau lần chỉnh sửa code ứng dụng cuối cùng**:

### 1) TypeScript, Unit Tests & Production Build (`D:\Escrow_Marketplace_Demo\frontend`)

| Kiểm tra | Lệnh thực thi | Kết quả | Chi tiết quan sát |
|---|---|---|---|
| TypeScript check | `npx tsc --noEmit` | **PASS** | Exit code `0`, không lỗi kiểu dữ liệu. |
| Frontend Test Suite | `npm test` (`node --test test/*.test.cjs`) | **PASS** | **`50 tests, 50 passed, 0 failed, 0 skipped`** (43 test hiện có từ Auth/Local Wallet/Wallet Providers/BFF/Pin + 7 test mới trong `test/marketplace-ui.test.cjs`). |
| Production Build | `npm run build` (`next build`, Next.js `15.5.29`) | **PASS** | Exit code `0`; compile thành công, lint & typecheck đạt, `Generating static pages (10/10)` — biên dịch sạch toàn bộ routes gồm `/`, `/listings/[id]`, `/sell`, `/trades`, `/trade/[id]`. |

### 2) Backend Regression Check (`D:\Escrow_Marketplace_Demo`)

| Suite | Lệnh thực thi | Kết quả | Tổng kết |
|---|---|---|---|
| Marketplace Backend Unit | `.\.venv\Scripts\python.exe -m pytest -rs backend/tests/test_listings_unit.py` | **PASS** | **`25 passed in 5.91s`** (`0 failed, 0 skipped`). |

### 3) Headless Browser End-to-End Smoke Verification

- **Môi trường:** Khởi chạy `uvicorn attest_service:app` cục bộ (`127.0.0.1:8124`, `CHAIN_ID=43113`, `REQUIRE_PROXY_SIGNATURE=true`, `INSPECT_LISTING_IMAGES=false`, SQLite tạm thời cô lập) + `next start` (`127.0.0.1:3124`). Sau kiểm thử đã dừng sạch cả 2 tiến trình và xóa thư mục DB tạm.
- **Pass 1 (Guest Mode, Empty DB, Auth Redirects, Responsive 1280px & 375px):**
  - `/` giữ nguyên URL (không redirect `/auth`), hiển thị empty state tiếng Việt sạch, 0 card giả, thanh tìm kiếm & danh mục đầy đủ, 0 console error, `/api/listings?...` trả `200 OK`.
  - Mobile `375x812`: `360px <= 375px`, 0 tràn ngang, nút menu mobile đóng/mở hoạt động tốt.
  - `/sell` -> redirect sang `/auth?returnUrl=%2Fsell`; `/trades` -> redirect sang `/auth?returnUrl=%2Ftrades`.
- **Pass 2 (Live Seeded Listings, Search/Filter/Sort, Gallery, Local Wallet Return & Buyer Request):**
  - Seed 2 tin thật (`LEGO-10305` giá `2.5 AVAX` cọc `0.75 AVAX`, `GUNDAM-PG-01` giá `1.2 AVAX` cọc `0.36 AVAX`) qua Backend có chữ ký HMAC.
  - Trên `/`: cả 2 thẻ hiển thị đúng, lọc danh mục `LEGO`, tìm kiếm `GUNDAM-PG-01`, nút `Xóa bộ lọc`, sắp xếp `Giá tăng dần` đều hoạt động chính xác.
  - Trên `/listings/lst_5b2a8318eb7241c180b1`: gallery đổi ảnh `1 / 2` ↔ `2 / 2` và badge `Ảnh chính đối chiếu AI`, đơn giá `2.5 AVAX` và cọc 30% `0.75 AVAX / bên` hiển thị tách biệt, không có nút `"Mua ngay"`, mobile `375x812` không tràn ngang.
  - Bấm `Kết nối & xác thực ví` -> `/auth?returnUrl=%2Flistings%2Flst_5b2a8318eb7241c180b1` -> tạo ví trình duyệt trên `/auth/local` -> redirect tự động quay đúng `/listings/lst_5b2a8318eb7241c180b1` -> gửi yêu cầu mua -> mở `/trades?tab=buyer` thấy đơn `Chờ xác nhận` + nút `Hủy yêu cầu`, chuyển tab `/trades` (`Yêu cầu bán`, `Giao dịch Escrow`) và `/sell` (`Đăng sản phẩm mới` kiểm tra tự in hoa SKU `LEGO-999` và tính cọc `0.96 AVAX` cho `3.2 AVAX`), 0 tràn ngang ở `1280x800` và `375x812`, 0 lỗi JS/API.

### Phần chưa kiểm thử live trong phiên (Honest Scope Limitations)
- **Giao dịch on-chain thật trên Avalanche Fuji (`43113`) từ nút `Tạo Escrow on-chain & Liên kết`:** Không gửi giao dịch thật bằng ví có AVAX trong phiên (tuân thủ quy tắc bảo mật key/testnet); luồng `simulateContract` -> `createTrade` -> `pendingBindTrade` -> `bind-trade` -> `listingMessage` được kiểm chứng qua `tsc --noEmit`, unit tests (`extractTradeCreatedIdFromReceipt`, `pendingBindTrade`) và kiểm tra build thực tế.
- **Upload ảnh IPFS thật tới Pinata từ trình duyệt trên `/sell`:** Không dùng credential `PINATA_JWT` thật trong môi trường test; cơ chế magic bytes, fail-closed `503` khi thiếu `PINATA_JWT` và xử lý phản hồi Pinata đã được kiểm thử tại `test/pin-hardening.test.cjs`.

---

## 4. Rủi ro còn lại & Lưu ý vận hành

1. **Cấu hình môi trường staging/Fuji (`43113`):** Đảm bảo cùng giá trị `ATTEST_API_KEY`, `REQUIRE_PROXY_SIGNATURE=true` giữa Next.js server và FastAPI Backend, và cấp `PINATA_JWT` hợp lệ phía server Next.js để người bán upload ảnh thật trên `/sell`.
2. **Đồng bộ sau `createTrade` khi mạng không ổn định:** Cơ chế lưu `txHash` tạm ở `localStorage` (`mkt:pending-bind:<chainId>:<requestId>`) bảo vệ người bán ngay trên cùng trình duyệt khỏi bấm tạo giao dịch thứ 2; trường hợp người bán chuyển thiết bị khác, nút `"Khôi phục bằng tx_hash có sẵn"` cho phép dán trực tiếp mã giao dịch đã gửi để liên kết lại.
