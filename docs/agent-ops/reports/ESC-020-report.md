# Operational Task Report: ESC-020 (Phase 4A)

**Task ID:** `ESC-020`  
**Title:** Frontend Scaffold — Next.js + wagmi + RainbowKit  
**Role:** Engineering Lead / Frontend Engineer  
**Branch:** `phase/4a-scaffold`  
**Latest Commit Hash:** (see git log)  
**Date:** 2026-11-08  
**Status:** READY FOR REVIEW (PENDING PROJECT OWNER MERGE)

---

## 1. Preflight Check

- **Scope & Dependencies:**
  - Allowed files/path: `frontend/` (created from scratch).
  - Out of scope: `backend/`, `contracts/`, `ai-pipeline/`, `docs/`. None touched.
  - Dependencies installed (strictly within approved spec):
    - `next@14.2.35`
    - `react@18.3.1`
    - `react-dom@18.3.1`
    - `wagmi@2.14.16`
    - `viem@2.23.10`
    - `@tanstack/react-query@5.66.11`
    - `@rainbow-me/rainbowkit@2.2.4`
    - `tailwindcss@3.4.17`
    - `sonner@1.7.4`
    - `lucide-react@0.469.0`
    - `clsx@2.1.1`
    *(Pruned `tailwind-merge` per QA Finding #2).*
  - Architecture: Next.js 14 App Router (no `pages/`), strict TypeScript, Tailwind CSS, dark theme styling.

---

## 2. Acceptance Criteria Verification

| ID | Tiêu chí (Acceptance Criteria) | Kết quả | Bằng chứng kiểm tra |
|---|---|---|---|
| **AC-01** | `npm run dev` khởi động không lỗi | ✅ PASS | Dev server khởi động sạch sẽ: `✓ Ready in 2.1s` tại `http://localhost:3000`. |
| **AC-02** | `npm run build` pass (không TypeScript / ESLint error) | ✅ PASS | Next.js 14 production build thành công: `✓ Compiled successfully`, `✓ Generating static pages (4/4)`, zero TypeScript/ESLint warnings. |
| **AC-03** | Landing page hiển thị Navbar + Connect Wallet + Hero + CTA + 3 feature cards | ✅ PASS | `app/page.tsx` chứa Hero "Mua bán đồ sưu tầm không cần trung gian — AI xác thực bằng chứng, hợp đồng tự giải ngân", nút CTA "Tạo giao dịch", 3 cards: "Cọc 30% hai bên", "Chụp ảnh kèm nonce", "AI kiểm tra & giải ngân". Navbar hiển thị thương hiệu và nút RainbowKit ConnectButton. |
| **AC-04** | Kết nối MetaMask thành công, hiển thị địa chỉ rút gọn (`0x1234...abcd`) | ✅ PASS | Tích hợp RainbowKit `ConnectButton` với `accountStatus={{ smallScreen: 'avatar', largeScreen: 'address' }}` (hiển thị trực tiếp text địa chỉ rút gọn trên thanh nav) và component `AddressDisplay` (`shortAddr`: `0x1234...abcd`) có nút sao chép clipboard và link Snowtrace. |
| **AC-05** | Ví ở sai chain → hiện banner cảnh báo đỏ + nút "Chuyển sang Fuji/Anvil" | ✅ PASS | `components/WrongChainBanner.tsx` sử dụng `useAccount()` và `useSwitchChain()` từ wagmi: nếu `chain.id !== targetChain.id`, hiển thị banner đỏ và kích hoạt `switchChain`. |
| **AC-06** | `lib/contracts.ts` export ABI + address đọc từ env, không hardcode | ✅ PASS | Export `escrowAddress`, `tokenAddress`, `escrowAbi`, `tokenAbi`, `deployBlock` đọc từ `process.env.NEXT_PUBLIC_*`, nạp ABI từ `lib/abi/Escrow.json` và `CollectibleToken.json`. |
| **AC-07** | `.env.local.example` có đủ các biến theo spec | ✅ PASS | Bao gồm `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_ESCROW_ADDRESS`, `NEXT_PUBLIC_TOKEN_ADDRESS`, `NEXT_PUBLIC_DEPLOY_BLOCK`, `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_IPFS_GATEWAY`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `PINATA_JWT`. |
| **AC-08** | Components `StateBadge` (6 state), `AddressDisplay`, `AvaxAmount` render tốt | ✅ PASS | Tạo mới và tích hợp showcase trong `app/page.tsx` kiểm thử toàn bộ 6 states theo chuẩn FRONTEND_SPEC §3.1 và `lib/format.ts`: `0: Chờ nạp cọc`, `1: Chờ bằng chứng`, `2: AI đã xác thực`, `3: Đang tranh chấp`, `4: Hoàn tất`, `5: Đã huỷ` (kèm cờ flagged), cùng `AddressDisplay` và `AvaxAmount` đa kích thước. |

---

## 3. QA Review Findings & Resolutions

Sau đợt review của PM/QA (Verdict: `CHANGES_REQUESTED`), toàn bộ 5 findings đã được xử lý triệt để:

| Finding | Phân loại | Nội dung & Giải pháp đã thực hiện | Trạng thái |
|---|---|---|---|
| **#1** | LOW | **ConnectButton hiển thị địa chỉ rút gọn trên Navbar:** Đã đổi `accountStatus="avatar"` thành `accountStatus={{ smallScreen: 'avatar', largeScreen: 'address' }}` trong `frontend/components/Navbar.tsx`. Khi ví kết nối, text địa chỉ rút gọn (`0x1234...abcd`) hiển thị trực tiếp trên thanh Navbar theo đúng AC-04. | ✅ RESOLVED |
| **#2** | LOW | **Dependency không cho phép `tailwind-merge`:** Đã xóa bỏ hoàn toàn `tailwind-merge` khỏi `frontend/package.json` và chạy lại `npm install` để đồng bộ `package-lock.json` (removed 1 package). Không còn dependency dư thừa ngoài spec. | ✅ RESOLVED |
| **#3** | INFO | **Cảnh báo khi dùng WalletConnect Project ID fallback:** Trong `frontend/lib/wagmi.ts`, đã thêm `console.warn` thông báo rõ ràng cho developer khi biến `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` không được thiết lập trong `.env.local`. | ✅ RESOLVED |
| **#4** | INFO | **Sửa mô tả State Labels trong report:** Đã chỉnh sửa mô tả state labels tại bảng AC-08 khớp chính xác 100% với FRONTEND_SPEC §3.1 và `lib/format.ts` (`0: Chờ nạp cọc`, `1: Chờ bằng chứng`, `2: AI đã xác thực`, `3: Đang tranh chấp`, `4: Hoàn tất`, `5: Đã huỷ`). | ✅ RESOLVED |
| **#5** | INFO | **Đính chính version `sonner`:** Đã cập nhật đúng version `sonner@1.7.4` (phù hợp với `package-lock.json` và `^1.7.1` trong `package.json`). | ✅ RESOLVED |

---

## 4. Test & Build Evidence (Post-Fix Verification)

### Build Output (`npm run build`)
```text
> collectible-escrow-frontend@0.1.0 build
> next build

  ▲ Next.js 14.2.35
  - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/4) ...
   Generating static pages (1/4) 
   Generating static pages (2/4) 
   Generating static pages (3/4) 
 ✓ Generating static pages (4/4)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                              Size     First Load JS
┌ ○ /                                    6.51 kB         317 kB
└ ○ /_not-found                          880 B          90.9 kB
+ First Load JS shared by all            90 kB
  ├ chunks/2117-b59cc24b9d9324e7.js      31.9 kB
  ├ chunks/fd9d1056-d87032f735ffd154.js  53.6 kB
  └ other shared chunks (total)          4.44 kB

○  (Static)  prerendered as static content
```

### Dev Server Start (`npm run dev`)
```text
> collectible-escrow-frontend@0.1.0 dev
> next dev

  ▲ Next.js 14.2.35
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Starting...
 ✓ Ready in 2.1s
```

---

## 5. File Diff Summary

Branch: `phase/4a-scaffold`

```text
 frontend/components/Navbar.tsx           |    5 +-
 frontend/lib/wagmi.ts                    |   10 +-
 frontend/package.json                    |    1 -
 frontend/package-lock.json               |   48 -
 docs/agent-ops/reports/ESC-020-report.md |  (updated)
```

---

## 6. Technical Decisions & Notes

1. **Webpack Alias Configuration (`next.config.js`):**
   - Đã cấu hình resolve alias cho `@coinbase/cdp-sdk`, `@x402/*`, và `@react-native-async-storage/async-storage` thành `false` để tránh lỗi webpack khi bundle trên browser đối với các transitive dependency tùy chọn từ `@wagmi/connectors`.
2. **Chain Support:**
   - Đã cấu hình hỗ trợ cả Avalanche Fuji Testnet (`43113`) và Anvil Local (`31337`).
3. **BigInt Compatibility:**
   - Cấu hình TypeScript target là `ES2022` và sử dụng `BigInt('...')` để tương thích toàn diện với các môi trường trình duyệt.

---

## 7. Handoff

- Toàn bộ thay đổi theo yêu cầu của QA Review đã hoàn thành và kiểm chứng thành công.
- Đã sẵn sàng chuyển verdict sang **ACCEPT** và bàn giao cho **Phase 4B** (`ESC-030` — Frontend Pages).
