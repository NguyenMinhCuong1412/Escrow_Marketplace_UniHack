# Operational Task Report: ESC-020 (Phase 4A)

**Task ID:** `ESC-020`  
**Title:** Frontend Scaffold — Next.js + wagmi + RainbowKit  
**Role:** Engineering Lead / Frontend Engineer  
**Branch:** `phase/4a-scaffold`  
**Commit Hash:** `359f458007e0e939e962a0099dd0e3e411e895a3`  
**Date:** 2026-11-08  
**Status:** READY FOR REVIEW (PENDING PROJECT OWNER MERGE)

---

## 1. Preflight Check

- **Scope & Dependencies:**
  - Allowed files/path: `frontend/` (created from scratch).
  - Out of scope: `backend/`, `contracts/`, `ai-pipeline/`, `docs/`. None touched.
  - Dependencies installed: `next@14.2.35`, `react@18.3.1`, `react-dom@18.3.1`, `wagmi@2.14.16`, `viem@2.23.10`, `@tanstack/react-query@5.66.11`, `@rainbow-me/rainbowkit@2.2.4`, `tailwindcss@3.4.17`, `sonner@2.0.1`, `lucide-react@1.16.0`, `clsx@2.1.1`.
  - Architecture: Next.js 14 App Router (no `pages/`), strict TypeScript, Tailwind CSS, dark theme styling.

---

## 2. Acceptance Criteria Verification

| ID | Tiêu chí (Acceptance Criteria) | Kết quả | Bằng chứng kiểm tra |
|---|---|---|---|
| **AC-01** | `npm run dev` khởi động không lỗi | ✅ PASS | Dev server khởi động sạch sẽ: `✓ Ready in 2.1s` tại `http://localhost:3000`. |
| **AC-02** | `npm run build` pass (không TypeScript / ESLint error) | ✅ PASS | Next.js 14 production build thành công: `✓ Compiled successfully`, `✓ Generating static pages (4/4)`, zero TypeScript/ESLint warnings. |
| **AC-03** | Landing page hiển thị Navbar + Connect Wallet + Hero + CTA + 3 feature cards | ✅ PASS | `app/page.tsx` chứa Hero "Mua bán đồ sưu tầm không cần trung gian — AI xác thực bằng chứng, hợp đồng tự giải ngân", nút CTA "Tạo giao dịch", 3 cards: "Cọc 30% hai bên", "Chụp ảnh kèm nonce", "AI kiểm tra & giải ngân". Navbar hiển thị thương hiệu và nút RainbowKit ConnectButton. |
| **AC-04** | Kết nối MetaMask thành công, hiển thị địa chỉ rút gọn (`0x1234...abcd`) | ✅ PASS | Tích hợp RainbowKit `ConnectButton` và component `AddressDisplay` (`shortAddr`: `0x1234...abcd`) có nút sao chép clipboard và link Snowtrace. |
| **AC-05** | Ví ở sai chain → hiện banner cảnh báo đỏ + nút "Chuyển sang Fuji/Anvil" | ✅ PASS | `components/WrongChainBanner.tsx` sử dụng `useAccount()` và `useSwitchChain()` từ wagmi: nếu `chain.id !== targetChain.id`, hiển thị banner đỏ và kích hoạt `switchChain`. |
| **AC-06** | `lib/contracts.ts` export ABI + address đọc từ env, không hardcode | ✅ PASS | Export `escrowAddress`, `tokenAddress`, `escrowAbi`, `tokenAbi`, `deployBlock` đọc từ `process.env.NEXT_PUBLIC_*`, nạp ABI từ `lib/abi/Escrow.json` và `CollectibleToken.json`. |
| **AC-07** | `.env.local.example` có đủ các biến theo spec | ✅ PASS | Bao gồm `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_ESCROW_ADDRESS`, `NEXT_PUBLIC_TOKEN_ADDRESS`, `NEXT_PUBLIC_DEPLOY_BLOCK`, `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_IPFS_GATEWAY`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `PINATA_JWT`. |
| **AC-08** | Components `StateBadge` (6 state), `AddressDisplay`, `AvaxAmount` render tốt | ✅ PASS | Tạo mới và tích hợp showcase trong `app/page.tsx` kiểm thử toàn bộ 6 states (0: Chờ cọc, 1: Người mua đã cọc, 2: Đã khóa, 3: Đang giao, 4: Hoàn thành, 5: Khiếu nại), `AddressDisplay` và `AvaxAmount` đa kích thước. |

---

## 3. Test & Build Evidence

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
┌ ○ /                                    6.39 kB         317 kB
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

## 4. File Diff Summary

Branch: `phase/4a-scaffold` (Commit `359f458`)  
Total: 22 files created, 10,699 insertions

```text
 frontend/.env.local.example              |   21 +
 frontend/.gitignore                      |    7 +
 frontend/app/globals.css                 |   17 +
 frontend/app/layout.tsx                  |   35 +
 frontend/app/page.tsx                    |  191 +
 frontend/app/providers.tsx               |   37 +
 frontend/components/AddressDisplay.tsx   |   68 +
 frontend/components/AvaxAmount.tsx       |   36 +
 frontend/components/Navbar.tsx           |   56 +
 frontend/components/StateBadge.tsx       |   29 +
 frontend/components/WrongChainBanner.tsx |   41 +
 frontend/lib/abi/CollectibleToken.json   |  466 ++
 frontend/lib/abi/Escrow.json             |  816 +++
 frontend/lib/contracts.ts                |   20 +
 frontend/lib/format.ts                   |   85 +
 frontend/lib/wagmi.ts                    |   29 +
 frontend/next.config.js                  |   24 +
 frontend/package-lock.json               | 8643 ++++++++++++++++++++++++++++++
 frontend/package.json                    |   33 +
 frontend/postcss.config.js               |    6 +
 frontend/tailwind.config.js              |   12 +
 frontend/tsconfig.json                   |   27 +
```

---

## 5. Technical Decisions & Notes

1. **Webpack Alias Configuration (`next.config.js`):**
   - Đã cấu hình resolve alias cho `@coinbase/cdp-sdk`, `@x402/*`, và `@react-native-async-storage/async-storage` thành `false` để tránh lỗi webpack khi bundle trên browser đối với các transitive dependency tùy chọn từ `@wagmi/connectors`.
2. **Chain Support:**
   - Đã cấu hình hỗ trợ cả Avalanche Fuji Testnet (`43113`) và Anvil Local (`31337`).
3. **BigInt Compatibility:**
   - Cấu hình TypeScript target là `ES2022` và sử dụng `BigInt('...')` để tương thích toàn diện với các môi trường trình duyệt.

---

## 6. Handoff

- Sẵn sàng bàn giao cho **Phase 4B** (`ESC-030` — Frontend Pages: Create Trade, Trade Detail, Review Evidence).
- Tuân thủ quy định: Không tự merge branch vào main, không deploy, chờ Project Owner review và phê duyệt.
