# Operational Task Report: ESC-030 (Phase 4B)

**Task ID:** `ESC-030`  
**Title:** Frontend Core Pages — Trade CRUD + Detail + Profile  
**Role:** Engineering Lead / Frontend Engineer  
**Branch:** `phase/4b-pages`  
**Date:** 2026-11-08  
**Status:** READY FOR QA REVIEW

---

## 1. Preflight Check

- **Scope Allowed:**
  - `frontend/app/` (thêm các pages mới)
  - `frontend/components/` (thêm các components UI)
  - `frontend/hooks/` (thêm custom hooks wagmi)
  - `frontend/lib/` (thêm format và error utilities)
- **Out of Scope (Preserved):**
  - `frontend/lib/wagmi.ts` — Giữ nguyên 100%, không refactor.
  - `frontend/app/layout.tsx` — Giữ nguyên 100%.
  - `backend/`, `contracts/`, `ai-pipeline/`, `docs/` — Tuyệt đối không can thiệp.
  - Chưa tích hợp IPFS upload logic hoặc backend AI client (để dành cho Phase 4C theo đúng spec).

---

## 2. Acceptance Criteria Verification

| ID | Tiêu chí (Acceptance Criteria) | Kết quả | Bằng chứng kiểm tra thực tế |
|---|---|---|---|
| **AC-01** | Trang `/trade/new`: form nhập tên, mô tả, địa chỉ buyer, giá trị AVAX → gọi `createTrade(buyer, itemValue)` → tx confirm → redirect `/trade/[id]` | ✅ PASS | Đã triển khai tại `frontend/app/trade/new/page.tsx`. Có live preview tiền cọc 30%, validation địa chỉ người mua (khác ví seller), gọi `createTrade` trên Smart Contract, chờ receipt, parse event `TradeCreated` để trích xuất `tradeId` và redirect tới `/trade/[id]`. |
| **AC-02** | Trang `/trade/[id]`: hiển thị state badge, seller/buyer address, itemValue, deposit amounts, nonce (khi FullyFunded+) | ✅ PASS | Đã triển khai tại `frontend/app/trade/[id]/page.tsx`. Đọc dữ liệu on-chain thời gian thực qua `useTrade`, hiển thị đầy đủ StateBadge, PartyCard của seller/buyer (kèm reputation score và trạng thái cọc), giá trị món hàng, số tiền cọc yêu cầu. |
| **AC-03** | Nút "Nạp cọc" (deposit) hoạt động cho seller/buyer, disable khi đã deposit hoặc sai vai trò | ✅ PASS | Nút "Nạp cọc" gọi `deposit(tradeId)` với `value = depositRequired`. Tự động ẩn/disable khi ví đã nạp cọc thành công hoặc khi người xem không phải người bán/người mua trong giao dịch. |
| **AC-04** | `NonceCard`: hiển thị nonce hex font to rõ (mono, ≥24px), chỉ hiện khi state ≥ AwaitingEvidence | ✅ PASS | Triển khai tại `frontend/components/NonceCard.tsx`. Sử dụng font `mono text-3xl sm:text-4xl tracking-[0.25em]`, hiển thị 8 ký tự nonce hex đầu (`nonce.slice(2, 10)`), nút copy, hướng dẫn ghi giấy trắng. Tự động ẩn khi state = 0 (`Created`), chỉ hiển thị khi state ≥ 1 (`AwaitingEvidence`). |
| **AC-05** | Countdown timers: evidence window, attest window, dispute window — đếm ngược đúng, hiện "Hết hạn" khi =0 | ✅ PASS | Triển khai tại `frontend/components/CountdownTimer.tsx`. Tự động đếm ngược theo giây trong thời gian thực, chuyển sang màu đỏ và hiển thị text "Hết hạn" khi thời gian còn lại ≤ 0. |
| **AC-06** | Trang `/` (landing) hiển thị danh sách trade của ví đang kết nối | ✅ PASS | Triển khai `useMyTrades` và tích hợp `TradeList` trong `frontend/app/page.tsx`. Duyệt qua `1..nextTradeId - 1`, lọc các giao dịch có địa chỉ người bán hoặc người mua trùng với ví kết nối, hiển thị đầy đủ bảng danh sách giao dịch. |
| **AC-07** | Trang `/profile/[address]` hiển thị reputation score (0–100) và danh sách trade liên quan | ✅ PASS | Triển khai tại `frontend/app/profile/[address]/page.tsx`. Đọc `reputationOf(address)` từ Smart Contract, hiển thị dạng gauge tròn trực quan (0–100) kèm phân hạng uy tín, thống kê tổng số giao dịch và tái sử dụng `TradeList` lọc theo địa chỉ ví. |
| **AC-08** | `npm run build` pass (zero TypeScript / ESLint errors) | ✅ PASS | Next.js 14 production build hoàn tất thành công với mã thoát 0: `✓ Compiled successfully`, `✓ Generating static pages (5/5)`, 0 lỗi TypeScript, 0 lỗi ESLint. |
| **AC-09** | Nút hành động disable khi ví chưa kết nối hoặc sai chain | ✅ PASS | Toàn bộ các nút hành động (Tạo giao dịch, Nạp cọc, Hủy giao dịch, Khiếu nại, Giải ngân) đều kiểm tra trạng thái `!isConnected || isWrongChain`, hiển thị banner cảnh báo và khóa nút. |

---

## 3. Build & Test Evidence

### Production Build (`npm run build`)
```text
> collectible-escrow-frontend@0.1.0 build
> next build

  ▲ Next.js 14.2.35
  - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/5) ...
   Generating static pages (1/5) 
   Generating static pages (2/5) 
   Generating static pages (3/5) 
 ✓ Generating static pages (5/5)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                              Size     First Load JS
┌ ○ /                                    3.74 kB         326 kB
├ ○ /_not-found                          880 B          90.9 kB
├ ƒ /profile/[address]                   2.96 kB         159 kB
├ ƒ /trade/[id]                          9.19 kB         340 kB
└ ○ /trade/new                           6.09 kB         324 kB
+ First Load JS shared by all            90 kB
  ├ chunks/2117-b59cc24b9d9324e7.js      31.9 kB
  ├ chunks/fd9d1056-d87032f735ffd154.js  53.6 kB
  └ other shared chunks (total)          4.44 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

### Dev Server Start (`npm run dev`)
```text
> collectible-escrow-frontend@0.1.0 dev
> next dev

  ▲ Next.js 14.2.35
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Starting...
 ✓ Ready in 2.5s
```

---

## 4. File Changes Summary

- `frontend/app/page.tsx`: Thêm mục "Giao Dịch Của Tôi" (My Trades).
- `frontend/app/trade/new/page.tsx`: Trang tạo giao dịch mới (`createTrade`).
- `frontend/app/trade/[id]/page.tsx`: Trang chi tiết giao dịch (state machine UI, nạp cọc, giải ngân, khiếu nại).
- `frontend/app/profile/[address]/page.tsx`: Trang hồ sơ reputation và lịch sử giao dịch.
- `frontend/components/CountdownTimer.tsx`: Component đếm ngược thời gian thực.
- `frontend/components/EvidencePlaceholder.tsx`: Component placeholder cho nộp bằng chứng (Phase 4C).
- `frontend/components/NonceCard.tsx`: Component hiển thị mã nonce lớn (font ≥24px).
- `frontend/components/TradeList.tsx`: Component danh sách giao dịch.
- `frontend/components/TradeTimeline.tsx`: Component tiến trình giao dịch (timeline stepper).
- `frontend/hooks/useTrade.ts`: Hook đọc chi tiết giao dịch và vai trò người dùng.
- `frontend/hooks/useReputation.ts`: Hook đọc điểm uy tín on-chain.
- `frontend/hooks/useMyTrades.ts`: Hook batch multicall đọc danh sách giao dịch.
- `frontend/lib/errors.ts`: Bộ giải mã lỗi revert từ Smart Contract sang tiếng Việt.
- `frontend/lib/format.ts`: Bổ sung các hàm format countdown, nonce short, date-time.
- `frontend/types/trade.ts`: Khai báo kiểu dữ liệu TypeScript cho Trade.

---

## 5. Handoff & Branch Status

- Branch hiện tại: `phase/4b-pages`
- Sẵn sàng bàn giao cho QA Review.
- Không tự ý merge vào `main` theo đúng chỉ thị của Project Owner.
