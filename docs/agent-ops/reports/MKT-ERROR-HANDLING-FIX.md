# MKT-ERROR-HANDLING-FIX — Frontend Error Handling Remediation Report

**Task:** `TASK: MKT-ERROR-HANDLING-FIX (P2/P3)`\
**Project:** `D:\Escrow_Marketplace_Demo`\
**Scope:** Frontend ONLY (`frontend/`). Không thay đổi Smart Contracts, Backend, ABI, business logic, secrets hoặc git history. Các thay đổi chưa commit trước đó (`MKT-*`, `FIX-ADMIN-CANCELLED-STATE`) được giữ nguyên.

---

## 1. Phân tích nguyên nhân gốc (Root Cause Analysis)

### Lỗi 1 — P2: Runtime `BigInt` crash trên URL route parameter không hợp lệ
- **Vị trí chính:** [`frontend/app/trade/[id]/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/trade/%5Bid%5D/page.tsx) trước khi sửa thực thi trực tiếp `BigInt(tradeIdStr || '0')` ngay trong body render mà không kiểm tra định dạng chuỗi. Khi truy cập URL không hợp lệ như `/trade/2**`, JavaScript ném `SyntaxError: Cannot convert 2** to a BigInt`, gây sập trang với Next.js Runtime Error.
- **Vị trí tương tự được phát hiện & xử lý đồng bộ:**
  1. [`frontend/app/trade/[id]/report/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/trade/%5Bid%5D/report/page.tsx): gọi trực tiếp `BigInt(tradeIdStr)` và truyền vào `getReport(tradeId)` / `useTrade(tradeId)` ngay cả khi parameter không phải số nguyên dương hợp lệ.
  2. [`frontend/hooks/useTrade.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/hooks/useTrade.ts): gọi trực tiếp `BigInt(tradeId || 0)`, có nguy cơ ném `SyntaxError` nếu caller truyền chuỗi không hợp lệ hoặc số âm/số thực.
- **Các vị trí `BigInt` / `useParams` khác đã rà soát:**
  - `app/listings/[id]/page.tsx`: dùng string ID với `decodeURIComponent(params.id)`, không ép `BigInt`.
  - `app/profile/[address]/page.tsx`: đã kiểm tra `isAddress(addressParam)` trước khi dùng.
  - `app/trade/new/page.tsx`: bọc `BigInt(log.topics[1])` trong `try/catch`.
  - `app/admin/page.tsx`, `app/sell/page.tsx`, `app/page.tsx`, `hooks/useMyTrades.ts`, `components/PendingWithdrawalBanner.tsx`: chỉ chuyển đổi giá trị từ contract/DTO/biểu mẫu số hợp lệ.

### Lỗi 2 — P3: Wallet Rejection (`User rejected the request`) gây Runtime Error overlay & thiếu phân loại lỗi
- **Trigger console/overlay trong Next.js 15:** Các handler gọi `writeContractAsync` / `signMessageAsync` (gồm `handleTx` tại [`frontend/app/trade/[id]/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/trade/%5Bid%5D/page.tsx) và các component/page anh em như `EvidenceUploader.tsx`, `PendingWithdrawalBanner.tsx`, `AgentStatusCard.tsx`, `app/trade/new/page.tsx`, `app/admin/page.tsx`) gọi `console.error(..., err)` trong khối `catch` kể cả khi người dùng chủ động từ chối ký trên Core Wallet. Trong chế độ dev của Next.js 15, `console.error` với instance `Error` (`ContractFunctionExecutionError: User rejected the request`) kích hoạt Next.js Runtime Error overlay (`1 Issue`).
- **Khoảng trống phân loại trong [`frontend/lib/errors.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/lib/errors.ts):** `getReadableError` trước đây chỉ kiểm tra phẳng `error?.shortMessage || error?.message` với regex `/user rejected|action rejected/i`, bỏ sót:
  - chuỗi lồng `.cause` của Viem (`ContractFunctionExecutionError` bọc `UserRejectedRequestError`);
  - mã chuẩn EIP-1193 (`code: 4001`, `ACTION_REJECTED`);
  - thông điệp provider khác (`details`, `User denied`, `Transaction declined`, `canceled by user`, ...);
  - phân biệt rạch ròi 4 nhóm `user_rejected`, `contract_revert`, `rpc` (lỗi mạng/HTTP/timeout/insufficient funds/nonce/chain mismatch/-32002 pending), và `unknown`.
- **Riêng tại [`frontend/app/sell/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/sell/page.tsx):** khối `catch` kiểm tra `!err.message.includes('User rejected')` theo chữ hoa/thường cứng và hiển thị nguyên văn `err.message` thô trong nhiều biến thể từ chối của ví.
- **Cơ chế retry:** Rà soát `wallet-providers.ts` (`withRetry` chỉ bọc `isAuthorized()` đọc `eth_accounts`), `lib/local-wallet/connector.ts`, và các caller `writeContractAsync` xác nhận không tự động gửi lại giao dịch (`eth_sendTransaction`) khi người dùng từ chối; trạng thái pending button (`setIsPendingTx(false)` / loading lock) đều được reset trong `finally`.

---

## 2. Các thay đổi đã triển khai

1. **Validate & parse Trade ID an toàn — [`frontend/lib/trade-id.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/lib/trade-id.ts) (mới)**
   - `parseTradeIdParam(raw)`: giải mã URI an toàn trong `try/catch`, chỉ chấp nhận chuỗi số nguyên dương chính tắc `/^[1-9]\d*$/` (như `'2'`), trả về `null` cho `'2**'`, `'2%2A%2A'`, `'0'`, `'02'`, `'-1'`, `'1.5'`, `'0x2'`, `'abc'`, `''`, `%` hỏng hoặc mảng nhiều phần tử.
   - `safeParseTradeId(value)`: chuẩn hóa `bigint | number | string | null | undefined` về `bigint >= 0n` không bao giờ ném exception.

2. **Chặn crash & render 404 thân thiện cho URL không hợp lệ**
   - [`frontend/app/trade/[id]/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/trade/%5Bid%5D/page.tsx): thay `BigInt(tradeIdStr || '0')` bằng `parseTradeIdParam(params?.id)`; vô hiệu hóa query `useTrade(0n)`, `localStorage`, và marketplace sync khi ID không hợp lệ; render giao diện **Mã giao dịch không hợp lệ** thân thiện với nút quay về `/trades` và `/` trước bước loading/error.
   - [`frontend/app/trade/[id]/report/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/trade/%5Bid%5D/report/page.tsx): áp dụng `parseTradeIdParam`, bỏ qua `getReport` trong `useEffect`, và render màn hình **Mã giao dịch không hợp lệ** kèm liên kết quay lại `/trades`.
   - [`frontend/hooks/useTrade.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/hooks/useTrade.ts): dùng `safeParseTradeId(tradeId)` thay cho `BigInt(tradeId || 0)`.

3. **Phân loại lỗi giao dịch & xử lý từ chối ví thân thiện**
   - [`frontend/lib/errors.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/lib/errors.ts):
     - Duyệt đồ thị `.cause` / `.data` / `.info.error` (tối đa depth 10, chống vòng lặp) qua `collectErrorSignals`.
     - Xuất `TxErrorCategory`, `ClassifiedTxError`, `isTxUserRejected(error)`, `classifyContractError(error)`, giữ tương thích ngược `getReadableError(error)`.
     - Phân biệt rõ:
       - `user_rejected`: mã `4001` / `ACTION_REJECTED`, `UserRejectedRequestError`, hoặc các mẫu từ chối chuẩn ví (Core, MetaMask, WalletConnect, Local Wallet) → `'Bạn đã từ chối ký giao dịch trên ví. Giao dịch chưa được gửi đi.'`
       - `contract_revert`: toàn bộ 16 mã lỗi contract Escrow + `ContractFunctionRevertedError` / `execution reverted`.
       - `rpc`: lỗi `-32002` (pending wallet request), sai mạng (`chain mismatch`), thiếu số dư gas (`insufficient funds`), xung đột `nonce`, và lỗi kết nối/HTTP/timeout (`HttpRequestError`, `TimeoutError`, `RpcRequestError`, `429/502/503/504`, `-32603/-32000/-32005`).
   - [`frontend/lib/wallet-toast.ts`](file:///D:/Escrow_Marketplace_Demo/frontend/lib/wallet-toast.ts) (mới): hàm dùng chung `notifyWalletActionError(...)` — khi `classified.isUserRejected === true` chỉ gọi `toast.info(...)` và **không** gọi `console.error` hay tự động retry; các lỗi `contract_revert`/`rpc`/`unknown` gọi `console.warn(...)` (tránh Runtime Error overlay giả cho lỗi đã catch) và hiển thị `toast.error(...)` tiếng Việt dễ hiểu.
   - Cập nhật đồng bộ toàn bộ điểm gọi ví:
     - [`frontend/app/trade/[id]/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/trade/%5Bid%5D/page.tsx) (`handleTx` — gồm `deposit`, `cancelUnfunded`, `resolveClean`, `fileComplaint`, `cancelOnEvidenceTimeout`)
     - [`frontend/components/EvidenceUploader.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/components/EvidenceUploader.tsx)
     - [`frontend/components/PendingWithdrawalBanner.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/components/PendingWithdrawalBanner.tsx)
     - [`frontend/components/AgentStatusCard.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/components/AgentStatusCard.tsx)
     - [`frontend/app/trade/new/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/trade/new/page.tsx)
     - [`frontend/app/sell/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/sell/page.tsx) (`handleCreateOnChainAndBind` và `handleRetryBind`)
     - [`frontend/app/admin/page.tsx`](file:///D:/Escrow_Marketplace_Demo/frontend/app/admin/page.tsx) (`handleResolveDispute` và `handleFileComplaint`; giữ nguyên nhánh `trade.state === 5` của `FIX-ADMIN-CANCELLED-STATE`)

4. **Regression tests — [`frontend/test/mkt-error-handling.test.cjs`](file:///D:/Escrow_Marketplace_Demo/frontend/test/mkt-error-handling.test.cjs) (mới, 6 test cases)**
   - Kiểm tra `parseTradeIdParam` (valid `'2'`/`'1'`/`'999999999999'` và invalid `'2**'`/`'2%2A%2A'`/`'0'`/`'-1'`/`'abc'`/`''`/`'%E0%A4%A'`).
   - Kiểm tra `safeParseTradeId` với dữ liệu lỗi/âm/NaN/Infinity.
   - Kiểm tra `classifyContractError` với `ContractFunctionExecutionError` bọc `UserRejectedRequestError` trên `deposit(2)`, EIP-1193 `4001`, Core Wallet `Transaction declined`, contract revert (`wrong deposit amount`, `ContractFunctionRevertedError`), và RPC (`HttpRequestError` 503, `insufficient funds`).
   - Kiểm tra `notifyWalletActionError` xác nhận `toast.info` + `0` `console.error` / `0` `toast.error` khi user từ chối ví, và `toast.error` có prefix khi revert.
   - Kiểm tra hồi quy tĩnh xác nhận các trang/component giao dịch đều dùng `parseTradeIdParam` / `safeParseTradeId` / `notifyWalletActionError` và không gọi `console.error(`.

---

## 3. Kết quả kiểm thử (chạy sau chỉnh sửa cuối cùng)

Thực thi trong thư mục `D:\Escrow_Marketplace_Demo\frontend`:

| Lệnh | Trạng thái | Tóm tắt quan sát thực tế |
|---|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) | Không có lỗi TypeScript toàn dự án frontend |
| `npm test` (`node --test test/*.test.cjs`) | **PASS** (exit 0) | `61 tests, 61 pass, 0 fail, 0 cancelled, 0 skipped` (gồm 6 test mới trong `test/mkt-error-handling.test.cjs`) |
| `npm run build` (`next build`) | **PASS** (exit 0) | `Compiled successfully in 5.3s`, linting & type validity passed, prerender `10/10` static pages & dynamic routes (`/trade/[id]`, `/trade/[id]/report`, `/admin`, `/sell`, `/trade/new`, ...) sạch lỗi |

---

## 4. Thống kê thay đổi (`git status` / `git diff --stat`)

- **File mới (`??` thuộc task này):**
  - `frontend/lib/trade-id.ts`
  - `frontend/lib/wallet-toast.ts`
  - `frontend/test/mkt-error-handling.test.cjs`
- **File được cập nhật thuộc task này (tracked & untracked trước đó):**
  - `frontend/lib/errors.ts`
  - `frontend/hooks/useTrade.ts`
  - `frontend/app/trade/[id]/page.tsx` *(diff tổng so với `HEAD` gồm cả thay đổi `MKT-004` có sẵn trước đó)*
  - `frontend/app/trade/[id]/report/page.tsx`
  - `frontend/components/EvidenceUploader.tsx`
  - `frontend/components/PendingWithdrawalBanner.tsx`
  - `frontend/components/AgentStatusCard.tsx`
  - `frontend/app/trade/new/page.tsx`
  - `frontend/app/sell/page.tsx` *(file mới chưa track từ `MKT-004`, được giữ nguyên ngoài 2 khối `catch` sửa cho P3)*
  - `frontend/app/admin/page.tsx` *(diff tổng so với `HEAD` gồm cả nhánh `trade.state === 5` của `FIX-ADMIN-CANCELLED-STATE` được giữ nguyên)*
