# QA Review Report — ESC-030 (Phase 4B)

**Task:** ESC-030 — Frontend Core Pages — Trade Create, Detail, Profile, My Trades  
**Reviewer:** Cowork (PM/QA)  
**Branch:** `phase/4b-core-pages`  
**Commit:** `851a707`  
**Date:** 2026-11-08  

---

## Verdict: `ACCEPT` ✅

> Tất cả 9 AC pass. Scope tuân thủ. Không có dependency mới, không secret leak. 2 findings mức INFO (không block).

---

## 1. Scope Check

| Kiểm tra | Kết quả |
|---|---|
| Commit `851a707` chỉ chạm `frontend/` + `docs/agent-ops/reports/` | ✅ PASS — 16 files, toàn bộ trong scope |
| Không sửa `frontend/lib/wagmi.ts` (out of scope) | ✅ PASS |
| Không sửa `frontend/app/layout.tsx` (out of scope) | ✅ PASS |
| Không sửa `backend/`, `contracts/`, `ai-pipeline/` | ✅ PASS |
| Không thêm API route, IPFS upload logic, backend API client | ✅ PASS |
| Không thêm dependency mới vào `package.json` | ✅ PASS — `git diff 851a707^..851a707 -- frontend/package.json` trống |
| Branch riêng, không merge vào main | ✅ PASS |

> **Lưu ý:** Branch đặt tên `phase/4b-core-pages` thay vì `phase/4b-pages` như task spec ghi. Không ảnh hưởng chức năng — xem Finding #2.

---

## 2. Acceptance Criteria

| AC | Tiêu chí | Verdict | Chi tiết |
|---|---|---|---|
| AC-01 | `/trade/new` form tạo trade: gọi `createTrade(buyer, itemValue)`, tx confirm → redirect `/trade/[id]` | ✅ PASS | `trade/new/page.tsx`: form có buyer address + itemValue (AVAX). `writeContractAsync` gọi `createTrade` đúng signature `(address, uint256)` khớp FRONTEND_SPEC §3.3. `waitForTransactionReceipt` → parse `TradeCreated` event lấy tradeId từ `topics[1]` → `router.push(/trade/${id})`. Deposit preview tính live 30%. Validation: `isAddress`, buyer ≠ self, value > 0. |
| AC-02 | `/trade/[id]` detail page: hiện đủ thông tin trade, parties, state, flagged | ✅ PASS | `trade/[id]/page.tsx`: `useTrade(id)` đọc `getTrade(id)`, hiện seller/buyer (AddressDisplay), reputation, itemValue/depositRequired (AvaxAmount wei→AVAX), StateBadge (6 states + flagged), TradeTimeline stepper, deposit status, evidence status. Role detection: seller/buyer/viewer. |
| AC-03 | Nút deposit: gọi `deposit(id)` với `value = depositRequired` | ✅ PASS | `handleDeposit()` gọi `handleTx('deposit', [trade.id], trade.depositRequired, ...)`. Đúng: function name `deposit`, arg `[tradeId]`, value `depositRequired`. Button hiện `formatAvax(trade.depositRequired)` AVAX. Chỉ hiện khi role đúng (seller/buyer) và chưa deposit. |
| AC-04 | NonceCard: hiện nonce rõ, font ≥ 24px | ✅ PASS | `NonceCard.tsx`: nonce hiện 8 hex chars (`nonce.slice(2,10)`) theo FRONTEND_SPEC §3.2 + full 32-byte hash bên dưới text nhỏ. Font `text-3xl sm:text-4xl font-extrabold tracking-[0.25em]` (≥ 30px). Copy button sao chép 8 chars. Hướng dẫn viết nonce lên giấy rõ ràng. Chỉ hiện khi `state >= 1`. Xem Finding #1 về conflict task spec. |
| AC-05 | CountdownTimer: đếm ngược evidenceDeadline / disputeDeadline, cập nhật mỗi giây | ✅ PASS | `CountdownTimer.tsx`: `setInterval` 1 giây. `formatCountdown()` tính diff deadline vs `Date.now()/1000`, format `Xd Xh Xm` / `Xh Xm Xs` / `Xm Xs`. Hết hạn → "Hết hạn" đỏ. Urgent (< 1h) → amber + animate-pulse. Trade detail page gắn đúng: state=1 → evidenceDeadline, state=2 → disputeDeadline. |
| AC-06 | Trang chủ: danh sách "Giao Dịch Của Tôi" + TradeList component | ✅ PASS | `page.tsx`: `useMyTrades()` → `nextTradeId()` rồi batch `getTrade(i)` cho i=1..nextTradeId-1 (dùng `useReadContracts` multicall). Filter `seller/buyer === connectedAddress`. `TradeList` hiện table: #ID, vai trò, đối tác (AddressDisplay + link profile), giá trị (AvaxAmount), cọc, StateBadge, countdown, nút "Xem". Empty state → nút "Tạo giao dịch mới". Chưa kết nối ví → message yêu cầu kết nối. |
| AC-07 | `/profile/[address]` page: reputation gauge + trade history | ✅ PASS | `profile/[address]/page.tsx`: `useReputation(address)` → `reputationOf()`. SVG gauge hiện score/100. Tier labels: ≥70 emerald "Uy tín rất cao", <40 red "Cảnh báo rủi ro", else blue. Stats grid: tổng/hoàn tất/đang diễn ra. `useMyTrades(address)` → `TradeList` hiện history. Invalid address → error page + link home. |
| AC-08 | `npm run build` pass, zero TS/ESLint errors | ✅ PASS (from report) | Report evidence: `✓ Compiled successfully`, 5/5 static pages generated, 0 errors. **NOT RE-RUN** bởi reviewer — dựa vào build output trong report. |
| AC-09 | Action buttons disable khi ví chưa kết nối hoặc sai chain | ✅ PASS | `isActionDisabled = !isConnected \|\| isWrongChain \|\| isPendingTx`. Tất cả button deposit/cancel/resolve/complaint đều `disabled={isActionDisabled}`. Create form: `isSubmitDisabled` check tương tự + validate input. Warning banner hiện khi disconnected/wrong chain ở cả create form và detail page. |

---

## 3. Findings

### Finding #1 — Task spec vs FRONTEND_SPEC conflict: nonce display (Severity: INFO)

- **Task spec ESC-030 line 71:** "Nonce từ contract là `bytes32` hex — hiện nguyên không cắt"
- **FRONTEND_SPEC §3.2 line 110:** "Nonce hiển thị cho người dùng = 8 ký tự hex đầu sau `0x`, viết thường (`nonce.slice(2, 10)`)"
- **Code thực tế (`NonceCard.tsx`):** Hiện 8 chars lớn + full 32-byte hash bên dưới text nhỏ ("Full 32-byte hash: {nonce}")
- **Đánh giá:** Code **tuân theo FRONTEND_SPEC** (source of truth theo AGENTS.md). Task spec constraint "hiện nguyên không cắt" mâu thuẫn với FRONTEND_SPEC. Vì FRONTEND_SPEC là tài liệu gốc, implementation đúng. Nên sửa lại task spec cho nhất quán.
- **Ảnh hưởng:** Không. Code đúng spec.

### Finding #2 — Branch name mismatch với task spec (Severity: INFO)

- **Task spec:** `phase/4b-pages`
- **Thực tế:** `phase/4b-core-pages`
- **Ảnh hưởng:** Thuần naming, không ảnh hưởng chức năng hay CI. Report và commit đều ghi đúng branch thực tế.

---

## 4. Các kiểm tra khác

| Hạng mục | Kết quả |
|---|---|
| State transition handling (6 states + flagged) | ✅ — Detail page render đúng UI cho mỗi state (0→5). Flagged variant ở state=2 hiện amber warning + complaint button. TradeTimeline stepper đúng progression. |
| Wei → AVAX conversion | ✅ — `formatAvax()` dùng `viem.formatEther()`. Tất cả `AvaxAmount` nhận `amountWei: bigint`. Deposit preview tính `val * 0.3`. |
| Escrow action safety | ✅ — Mỗi action check `isActionDisabled` trước khi gọi. Deposit gửi đúng `value = depositRequired`. Cancel/resolve/complaint gọi đúng contract function. `waitForTransactionReceipt` verify `receipt.status === 'success'`. |
| Error handling (errors.ts) | ✅ — `getReadableError()` map 14 contract revert messages sang tiếng Việt. User rejection, wrong state, wrong deposit, evidence window, dispute window covered. Fallback `shortMessage` hoặc cắt 160 chars. |
| AI / prompt injection risk | N/A — Chưa có AI integration ở phase này. EvidencePlaceholder chỉ là placeholder UI. |
| Secret leak | ✅ — Không hardcode private key, không expose `.env` values. `chainId` và `escrowAddress` đọc từ env qua `lib/contracts.ts` (đã verify ở ESC-020). |
| IPFS upload logic | ✅ ABSENT — EvidencePlaceholder chỉ hiện toast "Phase 4C" khi click. Không có IPFS/Pinata code. |
| TypeScript strict | ✅ — Type definitions rõ ràng: `TradeData` interface 17 fields, `TradeRole` union type. Hooks return typed objects. |
| wagmi v2 hooks | ✅ — Dùng đúng: `useReadContract`, `useReadContracts` (multicall), `useWriteContract`, `usePublicClient`, `useAccount`. Không dùng deprecated v1 APIs. |
| localStorage usage | ✅ — Chỉ dùng cho local metadata (title/description) — không phải state quan trọng. Wrapped trong try/catch. |
| `refetchInterval` | ✅ — `useTrade`: poll 4s khi state < 4, stop khi resolved/cancelled. `useMyTrades`: `nextTradeId` poll 5s. Hợp lý cho real-time UX. |

---

## 5. Tests chưa chạy (reviewer limitations)

- `npm run build`: **NOT RE-RUN** — dựa vào evidence từ agent report (build output log đầy đủ).
- Manual wallet connection + deposit flow: **NOT RUN** — cần browser + MetaMask + Fuji testnet.
- CountdownTimer visual test: **NOT RUN** — cần active trade với deadline.
- Multicall performance với nhiều trades: **NOT RUN** — cần deployment có nhiều trades.

---

## 6. Tóm tắt

**ACCEPT** — Tất cả 9 AC pass, scope tuân thủ nghiêm ngặt, không dependency mới, không secret leak, state machine UI đầy đủ 6 states + flagged variant. Code quality tốt: hooks tách biệt (useTrade, useMyTrades, useReputation), error messages tiếng Việt, responsive layout. 2 findings INFO (task spec nonce conflict + branch naming) không ảnh hưởng chức năng. ESC-030 sẵn sàng merge và unblock Phase 4C (ESC-040).
