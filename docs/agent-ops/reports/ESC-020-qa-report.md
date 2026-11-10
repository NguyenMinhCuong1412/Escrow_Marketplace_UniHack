# QA Review Report — ESC-020 (Phase 4A)

**Task:** ESC-020 — Frontend Scaffold — Next.js + wagmi + RainbowKit  
**Reviewer:** Cowork (PM/QA)  
**Branch:** `phase/4a-scaffold`  
**Initial Commit:** `359f458`  
**Fix Commit:** `1a4dc3a`  
**Date:** 2026-11-08  

---

## Verdict: `ACCEPT` ✅

> Chuyển từ `CHANGES_REQUESTED` sau khi verify commit `1a4dc3a` đã fix toàn bộ 5 findings.

---

## 1. Scope Check

| Kiểm tra | Kết quả |
|---|---|
| Commit `359f458` chỉ chạm `frontend/` | ✅ PASS — 22 files, toàn bộ trong `frontend/` |
| Không sửa `backend/`, `contracts/`, `ai-pipeline/`, `docs/` | ✅ PASS |
| Không tạo API routes | ✅ PASS |
| Branch riêng, không merge vào main | ✅ PASS |

> **Lưu ý:** Branch `phase/4a-scaffold` *kế thừa* commit Phase 3A (`b238a41`) có diff ngoài scope (backend, root docs). Đây là lịch sử branch, không phải vi phạm scope của ESC-020.

---

## 2. Acceptance Criteria

| AC | Tiêu chí | Verdict | Chi tiết |
|---|---|---|---|
| AC-01 | `npm run dev` khởi động không lỗi | ✅ PASS | Report có evidence: `✓ Ready in 2.1s`. **NOT RE-RUN** bởi reviewer (không có Node env trên máy user). |
| AC-02 | `npm run build` pass | ✅ PASS | Report có build output đầy đủ, zero TS/ESLint errors. **NOT RE-RUN.** |
| AC-03 | Landing page có Navbar + Connect Wallet | ✅ PASS | Code review xác nhận: `Navbar.tsx` có `ConnectButton`, `page.tsx` có Hero + 3 feature cards. |
| AC-04 | Kết nối MetaMask → hiển thị địa chỉ rút gọn `0x1234...abcd` | ✅ PASS | Fix `1a4dc3a`: `accountStatus={{ smallScreen: 'avatar', largeScreen: 'address' }}` — desktop hiện address rút gọn trực tiếp trên Navbar. |
| AC-05 | Sai chain → banner đỏ + nút switch | ✅ PASS | `WrongChainBanner.tsx` dùng `useAccount()` + `useSwitchChain()`, logic `chain.id !== targetChain.id` đúng. |
| AC-06 | `lib/contracts.ts` đọc từ env, không hardcode | ✅ PASS | Address đọc từ `NEXT_PUBLIC_*`, ABI import JSON, có validation `isAddress()`. |
| AC-07 | `.env.local.example` có đủ biến | ✅ PASS | Đủ 8 biến: CHAIN_ID, ESCROW_ADDRESS, TOKEN_ADDRESS, DEPLOY_BLOCK, BACKEND_URL, IPFS_GATEWAY, WALLETCONNECT_PROJECT_ID, PINATA_JWT. Comment rõ ràng. |
| AC-08 | StateBadge (6 state), AddressDisplay, AvaxAmount render được | ✅ PASS | Code review xác nhận: `StateBadge` map đúng 6 state + flagged variant theo FRONTEND_SPEC §3.1. `AddressDisplay` có copy + Snowtrace link. `AvaxAmount` format đúng qua `viem.formatEther`. |

---

## 3. Findings

### Finding #1 — `ConnectButton` không hiển thị địa chỉ rút gọn trực tiếp (Severity: LOW)

- **File:** `frontend/components/Navbar.tsx`, line ~50
- **Mô tả:** `ConnectButton` cấu hình `accountStatus="avatar"` → sau khi connect, Navbar chỉ hiển thị avatar tròn, **không** hiển thị `0x1234...abcd` trực tiếp trên thanh nav như AC-04 yêu cầu. Địa chỉ chỉ hiện khi click vào avatar (modal RainbowKit).
- **Reproduction:** Connect MetaMask → Navbar hiện circle avatar, không hiện text address.
- **Expected fix:** Đổi `accountStatus="avatar"` → `accountStatus="address"` hoặc `accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}` để responsive.

### Finding #2 — Dependency `tailwind-merge` ngoài danh sách cho phép (Severity: LOW)

- **File:** `frontend/package.json`
- **Mô tả:** `tailwind-merge@^2.6.0` được thêm vào `dependencies` nhưng:
  1. **Không có trong danh sách dependency cho phép** của task spec (chỉ cho phép: next, react, wagmi, viem, @tanstack/react-query, @rainbow-me/rainbowkit, tailwindcss, sonner, lucide-react, clsx).
  2. **Không được import/sử dụng** ở bất kỳ source file nào trong commit.
- **Expected fix:** Xóa `tailwind-merge` khỏi `package.json` và chạy lại `npm install` để cập nhật lock file.

### Finding #3 — WalletConnect Project ID hardcoded làm fallback (Severity: INFO)

- **File:** `frontend/lib/wagmi.ts`, line ~23
- **Mô tả:** `projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '3a8170812b534d0ff9d794f19a901d64'`. Khi env var bị thiếu, ứng dụng âm thầm dùng project ID mặc định thay vì báo lỗi.
- **Rủi ro:** Project ID này có thể bị revoke hoặc rate-limited bất cứ lúc nào. Không phải blocker cho scaffold nhưng nên log warning khi fallback.
- **Expected fix:** Giữ fallback cho dev convenience nhưng thêm `console.warn` khi dùng fallback value.

### Finding #4 — Report mô tả sai state labels tại AC-08 (Severity: INFO)

- **Vị trí:** `docs/agent-ops/reports/ESC-020-report.md`, bảng AC-08
- **Mô tả:** Report viết "6 states (0: Chờ cọc, 1: Người mua đã cọc, 2: Đã khóa, 3: Đang giao, 4: Hoàn thành, 5: Khiếu nại)" — sai so với cả code lẫn FRONTEND_SPEC §3.1. Code thực tế có labels đúng: Chờ nạp cọc / Chờ bằng chứng / AI đã xác thực / Đang tranh chấp / Hoàn tất / Đã huỷ.
- **Ảnh hưởng:** Report misleading, code đúng. Nên sửa report cho chính xác.

### Finding #5 — Report claim `sonner@2.0.1` nhưng lock file là `sonner@1.7.4` (Severity: INFO)

- **Vị trí:** `docs/agent-ops/reports/ESC-020-report.md`, mục Preflight
- **Mô tả:** Report ghi `sonner@2.0.1` installed, nhưng `package-lock.json` resolve `sonner@1.7.4` (phù hợp với spec `^1.7.1` trong package.json). Không ảnh hưởng chức năng, nhưng report không chính xác.

---

## 4. Các kiểm tra khác

| Hạng mục | Kết quả |
|---|---|
| State transition / escrow logic | N/A — scaffold chưa có transaction logic |
| AI prompt injection / data risk | N/A — chưa có AI integration |
| Secret leak | ✅ — `PINATA_JWT` không có prefix `NEXT_PUBLIC_`, `.gitignore` có `.env.local` |
| ABI files copy từ backend/abi/ | ✅ — Cùng content (khác formatting whitespace) |
| TypeScript strict mode | ✅ — `tsconfig.json` có `"strict": true` |
| App Router only (không pages/) | ✅ — Chỉ dùng `app/` directory |
| Không Redux/Zustand | ✅ — Chỉ react-query + wagmi |

---

## 5. Tests chưa chạy (reviewer limitations)

- `npm run dev` / `npm run build`: **NOT RE-RUN** — reviewer không chạy trực tiếp trên user machine. Dựa vào evidence trong report (build output log).
- Manual MetaMask connection: **NOT RUN** — cần browser + MetaMask extension.
- Visual regression: **NOT RUN** — scaffold mới, không có baseline.

---

## 6. Tóm tắt

**2 findings cần fix trước merge** (Finding #1, #2 — cả hai đều nhỏ, ước tính < 5 phút):

1. Đổi `accountStatus="avatar"` → `"address"` trong Navbar.tsx
2. Xóa `tailwind-merge` khỏi package.json + chạy lại `npm install`

**3 findings thông tin** (Finding #3, #4, #5 — nên sửa report cho chính xác, WalletConnect fallback warning là nice-to-have).

Sau khi fix 2 items trên → re-verify AC-04 bằng cách chạy `npm run build` lại → chuyển sang **ACCEPT**.
