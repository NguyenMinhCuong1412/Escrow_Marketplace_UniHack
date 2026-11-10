# FRONTEND SPEC — Escrow Marketplace đồ sưu tầm (UniHack 2026)

> Tài liệu này đủ để một AI/dev khác code frontend **mà không cần hỏi lại**. Mọi tên hàm,
> trường dữ liệu, chuỗi lỗi bên dưới khớp đúng với code đã test trong repo
> (`contracts/src/Escrow.sol`, `backend/attest_service.py`). Nếu thấy mâu thuẫn, **code thắng spec**.

---

## 0. TL;DR cho người code

- Stack: **Next.js 14 (App Router) + TypeScript + Tailwind + wagmi v2 + viem v2 + @tanstack/react-query + RainbowKit**.
- Chain: **Avalanche Fuji (43113)** khi demo thật, **Anvil (31337)** khi dev local.
- Đọc/ghi contract trực tiếp bằng wagmi (`useReadContract`, `useWriteContract`, `useWaitForTransactionReceipt`).
- Backend AI chỉ có **3 endpoint cần dùng**: `GET /health`, `POST /verify-evidence`, `GET /report/{id}` (+ `GET /trade/{id}` tiện ích).
- Upload ảnh/video lên **IPFS qua Pinata** → được `ipfs://<CID>` → `evidenceHash = keccak256(toBytes(uri))` → gọi `submitEvidence`.
- Màn hình "wow" cho demo: **Explainable Evidence Report** (ảnh keypoint match, nonce OCR, điểm rủi ro, nút "Verify on-chain").

---

## 1. Cấu trúc thư mục đề xuất

```
frontend/
  app/
    layout.tsx                 # Providers (wagmi, react-query, rainbowkit), Navbar, Toaster
    page.tsx                   # Landing + danh sách giao dịch của tôi
    trade/new/page.tsx         # Tạo giao dịch
    trade/[id]/page.tsx        # Trang chi tiết giao dịch (state machine UI)
    trade/[id]/report/page.tsx # Explainable Evidence Report (có thể là tab trong trang chi tiết)
    profile/[address]/page.tsx # Hồ sơ reputation
    admin/page.tsx             # Arbiter (owner) xử lý dispute
    api/pin/route.ts           # Route handler server-side upload Pinata (giữ PINATA_JWT bí mật)
  lib/
    wagmi.ts                   # config chains + transports
    contracts.ts               # địa chỉ + ABI (import JSON)
    abi/Escrow.json            # copy từ backend/abi/Escrow.json
    abi/CollectibleToken.json  # copy từ backend/abi/CollectibleToken.json
    backend.ts                 # client gọi attest service
    ipfs.ts                    # upload qua /api/pin, đổi ipfs:// → gateway URL
    format.ts                  # formatAvax, shortAddr, countdown, stateLabel
    errors.ts                  # map revert string → thông báo tiếng Việt
  components/ ...              # xem mục 6
  hooks/ ...                   # xem mục 7
```

`.env.local`:
```
NEXT_PUBLIC_CHAIN_ID=43113                 # hoặc 31337
NEXT_PUBLIC_ESCROW_ADDRESS=0x...           # lấy từ contracts/deployments/<chainId>.json
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_DEPLOY_BLOCK=12345678          # deployBlock trong file deployments, dùng cho getLogs
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...   # RainbowKit cần; có thể dùng injected-only nếu không có
PINATA_JWT=...                             # CHỈ server-side, không có tiền tố NEXT_PUBLIC
```

Thư viện (pin version khi cài): `next@14`, `react@18`, `wagmi@2`, `viem@2`, `@tanstack/react-query@5`,
`@rainbow-me/rainbowkit@2`, `tailwindcss@3`, `sonner` (toast), `lucide-react` (icon), `clsx`.
Không cần state manager riêng (Redux/Zustand) — react-query + wagmi cache là đủ.

---

## 2. Kết nối ví & chain (lib/wagmi.ts)

```ts
import { avalancheFuji, anvil } from 'viem/chains'
// chains = NEXT_PUBLIC_CHAIN_ID === '31337' ? [anvil] : [avalancheFuji]
// transports: { [avalancheFuji.id]: http('https://api.avax-test.network/ext/bc/C/rpc'), [anvil.id]: http('http://127.0.0.1:8545') }
```
- Dùng `getDefaultConfig` của RainbowKit (`appName: 'Collectible Escrow'`, `ssr: true`).
- Nếu ví ở sai chain → hiện banner đỏ + nút `switchChain`. Mọi nút ghi giao dịch **disable** khi sai chain hoặc chưa kết nối.
- Trên Fuji, gợi ý link faucet `https://core.app/tools/testnet-faucet/` khi số dư < 0.05 AVAX.

---

## 3. Contract API (Escrow) — những gì frontend dùng

Địa chỉ: `NEXT_PUBLIC_ESCROW_ADDRESS`. ABI: `lib/abi/Escrow.json` (trường `abi`).

### 3.1 Enum `State` (uint8)
| giá trị | tên | nhãn hiển thị | màu badge |
|---|---|---|---|
| 0 | Created | Chờ nạp cọc | gray |
| 1 | AwaitingEvidence | Chờ bằng chứng | blue |
| 2 | Attested | AI đã xác thực | green (nếu !flagged) / orange (nếu flagged) |
| 3 | Disputed | Đang tranh chấp | red |
| 4 | Resolved | Hoàn tất | emerald |
| 5 | Cancelled | Đã huỷ | gray |

### 3.2 Đọc
| Hàm | Trả về | Dùng ở đâu |
|---|---|---|
| `getTrade(uint256 id)` | struct `Trade` (dưới) | trang chi tiết |
| `nextTradeId()` | uint256 (id kế tiếp; id hợp lệ = 1..next-1) | danh sách |
| `reputationOf(address)` | uint256 0–100 (ví mới = 50) | hồ sơ, card đối tác |
| `pendingWithdrawals(address)` | uint256 wei | banner "Bạn có tiền chờ rút" |
| `owner()` / `agent()` | address | ẩn/hiện trang admin |
| `EVIDENCE_WINDOW()` `ATTEST_WINDOW()` `DISPUTE_WINDOW()` | uint256 giây | đếm ngược |
| `MAX_DEPOSIT_BPS()` (3000) `PENALTY_BPS()` (500) | uint16 | hiển thị "cọc 30%", "phạt 5%" |

`Trade` (thứ tự trường đúng như ABI — viem trả object có tên trường):
```
seller address, buyer address, itemValue uint256, depositRequired uint256,
sellerDeposit uint256, buyerDeposit uint256, nonce bytes32,
sellerEvidenceHash bytes32, buyerEvidenceHash bytes32, reportHash bytes32,
riskScore uint8, flagged bool, createdAt uint64, evidenceDeadline uint64,
disputeDeadline uint64, state uint8
```
- **Nonce hiển thị cho người dùng = 8 ký tự hex đầu sau `0x`, viết thường** (`nonce.slice(2, 10)`). Backend đối chiếu đúng chuỗi này (cho phép 1 lỗi OCR).
- Trade không tồn tại ⇔ `seller === 0x000…0`.

### 3.3 Ghi
| Hàm | Ai gọi | Điều kiện (frontend nên check trước để disable nút) | `value` |
|---|---|---|---|
| `createTrade(address buyer, uint256 itemValue)` | seller | buyer ≠ 0, ≠ chính mình; `itemValue*3000/10000 > 0` | 0 |
| `deposit(uint256 id)` | seller hoặc buyer | state=Created, mình chưa nạp | **đúng** `depositRequired` |
| `cancelUnfunded(uint256 id)` | seller/buyer | state=Created | 0 |
| `submitEvidence(uint256 id, bytes32 h)` | seller/buyer | state=AwaitingEvidence, `now <= evidenceDeadline`, mình chưa nộp, h ≠ 0 | 0 |
| `resolveClean(uint256 id)` | **bất kỳ ai** | state=Attested, !flagged, `now > disputeDeadline` | 0 |
| `fileComplaint(uint256 id)` | seller/buyer (hoặc bất kỳ ai nếu flagged) | state=Attested; nếu !flagged thì `now <= disputeDeadline` | 0 |
| `cancelOnEvidenceTimeout(uint256 id)` | bất kỳ ai | state=AwaitingEvidence, `now > evidenceDeadline`, và (thiếu evidence **hoặc** `now > evidenceDeadline + ATTEST_WINDOW`) | 0 |
| `resolveDispute(uint256 id, address violator)` | **owner** | state=Disputed; violator ∈ {seller, buyer, 0x0 (không ai sai)} | 0 |
| `withdraw()` | ai có `pendingWithdrawals > 0` | | 0 |

`attest()` chỉ ví agent (backend) gọi — **frontend không gọi**.

`createTrade` trả `tradeId` nhưng frontend lấy id từ **event `TradeCreated`** trong receipt
(`parseEventLogs({ abi, logs: receipt.logs, eventName: 'TradeCreated' })[0].args.tradeId`).

### 3.4 Event (dùng cho danh sách giao dịch & timeline)
```
TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, uint256 itemValue, bytes32 nonce)
Deposited(uint256 indexed tradeId, address indexed who, uint256 amount)
FullyFunded(uint256 indexed tradeId, uint64 evidenceDeadline)
EvidenceSubmitted(uint256 indexed tradeId, address indexed who, bytes32 evidenceHash)
Attested(uint256 indexed tradeId, uint8 riskScore, bool flagged, bytes32 reportHash)
ResolvedClean(uint256 indexed tradeId)
Disputed(uint256 indexed tradeId, address indexed filer)
ResolvedDispute(uint256 indexed tradeId, address indexed violator, uint256 penaltyAmount)
Cancelled(uint256 indexed tradeId, string reason)
ReputationChanged(address indexed who, uint256 newScore)
PayoutDeferred(address indexed to, uint256 amount)
Withdrawn(address indexed to, uint256 amount)
```
"Giao dịch của tôi" = `getLogs(TradeCreated, args: {seller: me})` ∪ `getLogs(TradeCreated, args: {buyer: me})`
từ `NEXT_PUBLIC_DEPLOY_BLOCK`. Fuji RPC công khai giới hạn ~2048 block/lần → chia khoảng block theo lô 2000.
Fallback nếu getLogs lỗi: duyệt `getTrade(1..nextTradeId-1)` bằng `useReadContracts` (multicall) và lọc theo địa chỉ (ổn với < 200 trade của demo).

### 3.5 Map lỗi revert → tiếng Việt (lib/errors.ts)
| revert string | thông báo |
|---|---|
| `invalid buyer` | Địa chỉ người mua không hợp lệ (trống hoặc trùng ví của bạn) |
| `itemValue too small` | Giá trị món hàng quá nhỏ |
| `not a party` | Ví của bạn không thuộc giao dịch này |
| `wrong state` | Giao dịch không ở bước cho phép thao tác này — tải lại trang |
| `wrong deposit amount` | Số tiền cọc phải đúng {depositRequired} AVAX |
| `already deposited` | Bạn đã nạp cọc rồi |
| `evidence window closed` | Đã quá hạn nộp bằng chứng |
| `empty evidence` / `evidence already submitted` | Bằng chứng trống / bạn đã nộp bằng chứng (mỗi bên chỉ nộp 1 lần) |
| `dispute window still open` | Chưa hết thời gian khiếu nại ({countdown}) |
| `dispute window closed` | Đã hết thời gian khiếu nại |
| `trade flagged, cannot auto-resolve` | AI đã gắn cờ — cần mở tranh chấp |
| `evidence window still open` / `awaiting agent attestation` | Chưa đến hạn huỷ |
| `caller is not owner` | Chỉ trọng tài (owner) làm được |
| `nothing to withdraw` | Không có khoản nào chờ rút |
| `User rejected` (viem `UserRejectedRequestError`) | Bạn đã huỷ giao dịch trong ví |
Lấy chuỗi revert: `err.shortMessage` / `err.cause?.reason` của viem `ContractFunctionRevertedError`.
**Luôn `simulateContract` trước `writeContract`** để báo lỗi trước khi mở ví.

---

## 4. Backend API (attest service)

Base URL `NEXT_PUBLIC_BACKEND_URL`. JSON. CORS mở (`CORS_ORIGINS`).

### 4.1 `GET /health`
```json
{ "ok": true, "embedding_backend": "hsv-histogram", "known_hashes": 12, "tesseract": true,
  "chain_id": 43113, "escrow": "0x…", "agent": "0x…", "agent_balance_wei": "123…",
  "agent_matches_contract": true }
```
Khi lỗi: `{ "ok": false, "error": "…" }`. Hiển thị chấm xanh/đỏ "AI Agent online" trên navbar (poll 30s).

### 4.2 `POST /verify-evidence`
Request:
```json
{
  "trade_id": 7,
  "listing_image_url": "ipfs://Qm…listing",
  "seller_evidence_url": "ipfs://Qm…packing",
  "buyer_evidence_url": "ipfs://Qm…unbox",
  "dry_run": false,
  "include_visual": true
}
```
- `seller_evidence_url` / `buyer_evidence_url` **phải đúng chuỗi** đã băm khi `submitEvidence` (backend kiểm tra `keccak256(utf8(url)) == hash on-chain`, sai → 422).
- `buyer_evidence_url` có thể là ảnh (jpg/png/webp) **hoặc video** (mp4/mov/webm) — backend tự trích keyframe.
- Backend tự đọc nonce, giá trị, reputation từ chain — **không gửi** các trường này.
- Thời gian xử lý: 2–15 s (ảnh), tới ~40 s (video). Timeout fetch phía client: **120 s**, hiện spinner có các bước giả lập tiến trình ("Tải bằng chứng → pHash → ORB → OCR nonce → Ký attest()").

Response 200:
```json
{
  "trade_id": 7,
  "report": {
    "trade_id": 7, "version": 1,
    "risk_score": 22, "flagged": false,
    "phash_reused": false, "phash_match_idx": null,
    "embedding_similarity": 0.4123,
    "identity_match_inliers": 214,
    "nonce_ok_seller": true, "nonce_ok_buyer": true,
    "notes": [],
    "details": {
      "embedding_backend": "hsv-histogram",
      "expected_nonce_short": "37a27ccc",
      "nonce_seller": {"expected": "37a27ccc", "found": true, "best_candidate": "37a27ccc", "edit_distance": 0},
      "nonce_buyer":  {"expected": "37a27ccc", "found": true, "best_candidate": "37a27ccc", "edit_distance": 0},
      "inliers_listing_seller": 214, "inliers_listing_buyer": 388,
      "buyer_evidence_kind": "image", "buyer_frames_checked": 1, "buyer_best_frame_index": 0,
      "phash_seller": "c3a1…", "phash_buyer": "c3b1…",
      "listing_reused_as_packing": false,
      "seller_reputation": 50, "buyer_reputation": 50, "item_value_wei": "1000000000000000000"
    }
  },
  "report_hash": "0x…32 bytes",
  "report_json": "{\"details\":{…},…}",
  "attested": true,
  "tx_hash": "0x…",
  "match_visual_png_b64": "iVBORw0KGgo…",
  "duration_ms": 3160
}
```
Lỗi (body `{ "detail": "…" }`):
| status | khi nào | UI |
|---|---|---|
| 404 | trade không tồn tại | toast lỗi |
| 409 | sai state (vd đã Attested), chưa đủ bằng chứng on-chain, hoặc đang xử lý | toast + refetch trade |
| 422 | URL bằng chứng không khớp hash on-chain / tải không được / file hỏng / quá 50MB | toast hiện `detail` |
| 502 | RPC lỗi hoặc `attest()` revert (vd ví agent sai) | toast "AI agent gặp sự cố, thử lại" |
| 503 | backend thiếu cấu hình | banner "AI agent offline" |

### 4.3 `GET /report/{trade_id}`
Trả đúng object của response 200 ở trên + `evidence: {listing_image_url, seller_evidence_url, buyer_evidence_url}`.
404 nếu chưa có. Đây là nguồn dữ liệu cho trang report khi người dùng quay lại sau.

### 4.4 `GET /trade/{trade_id}` (tuỳ chọn, tiện debug)
Trade decode sẵn + `nonce_short`, `seller_reputation`, `buyer_reputation`. Wei trả dạng **string**.

---

## 5. Quy ước IPFS & evidence hash

1. File → `POST /api/pin` (route handler Next.js, multipart) → server gọi Pinata
   `POST https://api.pinata.cloud/pinning/pinFileToIPFS` với `Authorization: Bearer ${PINATA_JWT}` → trả `{ cid }`.
2. `uri = "ipfs://" + cid` (KHÔNG thêm tên file, KHÔNG dùng gateway URL).
3. `evidenceHash = keccak256(toBytes(uri))` (viem: `keccak256(stringToBytes(uri))`).
4. Gọi `submitEvidence(id, evidenceHash)`.
5. **Lưu `uri` lại** (localStorage key `evidence:{chainId}:{tradeId}:{seller|buyer}` **và** gửi kèm khi bấm verify). Vì chain chỉ có hash, bên còn lại cần biết URI → hiển thị ô "Dán link bằng chứng của đối tác" nếu localStorage không có, kiểm tra keccak khớp ngay ở client trước khi gửi backend.
   - Cách gọn cho demo: một người (seller) bấm "Chạy AI xác thực" sau khi cả 2 đã nộp, và cả 2 file đã được upload từ cùng trình duyệt demo — hoặc chia sẻ link qua ô dán.
6. Ảnh listing: upload khi tạo trade, lưu `listing:{chainId}:{tradeId}` = uri (không neo on-chain).
7. Hiển thị ảnh: `uri.replace('ipfs://', NEXT_PUBLIC_IPFS_GATEWAY)`.
Giới hạn client: ảnh ≤ 10 MB, video ≤ 50 MB; nén ảnh > 2000px về 2000px trước khi upload (canvas) để OCR nhanh.

---

## 6. Trang & component

### 6.1 `/` — Landing + "Giao dịch của tôi"
- Hero: 1 câu giá trị ("Mua bán đồ sưu tầm không cần trung gian — AI xác thực bằng chứng, hợp đồng tự giải ngân"), nút **Tạo giao dịch**.
- 3 card "Cách hoạt động": Cọc 30% hai bên → Chụp ảnh kèm mã nonce → AI kiểm tra & tự giải ngân.
- Bảng `TradeList` (khi đã kết nối ví): cột #id, vai trò (Bán/Mua), đối tác (shortAddr + reputation badge), giá trị, `StateBadge`, hạn kế tiếp (countdown), nút "Xem".
- Trống → empty state + nút tạo.

### 6.2 `/trade/new` — Tạo giao dịch (seller)
Form:
- `buyer` (address, validate `isAddress`, ≠ ví mình) — hiện reputation của buyer ngay khi nhập hợp lệ.
- `itemValue` (AVAX, decimal, > 0) → hiển thị live: "Mỗi bên cọc: {itemValue*0.3} AVAX".
- `title`, `description`, `category` (select: chỉ 1 category demo — để constant `DEMO_CATEGORY`), **ảnh listing** (bắt buộc, 1 ảnh, preview).
- Submit flow (stepper 3 bước hiển thị trạng thái từng bước):
  1. Upload ảnh listing → cid.
  2. `createTrade(buyer, parseEther(itemValue))` → chờ receipt → lấy `tradeId` từ event.
  3. Lưu metadata `{title, description, category, listingUri}` vào localStorage `meta:{chainId}:{tradeId}` → redirect `/trade/{id}`.
- Gợi ý nạp cọc luôn ở trang chi tiết.

### 6.3 `/trade/[id]` — Chi tiết (trang quan trọng nhất)
Layout 2 cột (mobile: 1 cột):
- **Trái**: ảnh listing, tiêu đề, giá trị, `PartyCard` seller & buyer (địa chỉ, reputation, ✓ đã cọc, ✓ đã nộp bằng chứng).
- **Phải**: `TradeTimeline` (6 bước theo State, bước hiện tại highlight) + `ActionPanel` (nội dung theo state × vai trò, bảng dưới) + `Countdown` hạn hiện tại.

`ActionPanel` theo state:
| State | Người xem là seller/buyer | Hiển thị |
|---|---|---|
| Created | chưa nạp | Nút **Nạp cọc {depositRequired} AVAX** (`deposit`, value = depositRequired) |
| Created | đã nạp | "Chờ đối tác nạp cọc" + nút phụ **Huỷ giao dịch** (`cancelUnfunded`) |
| AwaitingEvidence | chưa nộp | `NonceCard` (to, rõ) + `EvidenceUploader` (seller: "Ảnh đóng gói", buyer: "Video/ảnh mở hộp") |
| AwaitingEvidence | đã nộp, đối tác chưa | "Chờ đối tác nộp bằng chứng" + countdown `evidenceDeadline` |
| AwaitingEvidence | cả 2 đã nộp | Nút **Chạy AI xác thực** → `VerifyProgress` → khi xong chuyển sang Report |
| AwaitingEvidence | quá hạn (điều kiện mục 3.3) | Nút **Huỷ & hoàn cọc** (`cancelOnEvidenceTimeout`) — ai cũng bấm được |
| Attested, !flagged | trong dispute window | `RiskBadge` + link report + countdown + nút **Khiếu nại** (`fileComplaint`, confirm dialog: "Khiếu nại sai có thể bị phạt 5% cọc") |
| Attested, !flagged | hết window | Nút **Giải ngân** (`resolveClean`) — ai cũng bấm |
| Attested, flagged | bất kỳ | Cảnh báo cam + lý do (`report.notes`) + nút **Mở tranh chấp** (`fileComplaint`) |
| Disputed | | "Trọng tài đang xử lý" + link report |
| Resolved / Cancelled | | Kết quả: số tiền mỗi bên nhận (từ event `ResolvedDispute`/`ResolvedClean`/`Cancelled`), reputation thay đổi |
Người xem không phải party: chỉ xem, ẩn nút (trừ các nút "ai cũng bấm được").

`NonceCard`: hiển thị `nonce.slice(2,10)` font mono cỡ lớn, cách chữ (`tracking-[0.4em]`), nút copy, và hướng dẫn:
"Viết **8 ký tự này** bằng bút đen, chữ in, cách đều từng ký tự, trên giấy trắng; đặt **cạnh món hàng** trong cùng khung hình; chụp đủ sáng, không loá."
Minh hoạ ảnh mẫu đúng/sai (2 ảnh tĩnh trong `public/`).

`EvidenceUploader`: drag&drop, preview (ảnh hoặc `<video controls>`), nút **Nộp bằng chứng** → stepper: upload IPFS → `submitEvidence(keccak256(uri))` → lưu uri.

`VerifyProgress`: gọi `POST /verify-evidence` (include_visual=true). Trong lúc chờ: checklist animate lần lượt mỗi ~1.5s (Tải bằng chứng / Kiểm tra ảnh tái sử dụng (pHash) / Khớp vật thể (ORB+RANSAC) / Đọc nonce (OCR) / Tính điểm rủi ro / Ký attest() on-chain). Xong → toast có link explorer `tx_hash`, refetch `getTrade`.

### 6.4 `/trade/[id]/report` — Explainable Evidence Report (màn hình demo chính)
Nguồn: response verify vừa nhận (giữ trong react-query cache) hoặc `GET /report/{id}`.
Bố cục từ trên xuống:
1. **Header**: `RiskGauge` (0–100, xanh <40, vàng 40–69, đỏ ≥70) + nhãn "Sạch"/"Gắn cờ", thời gian xử lý.
2. **Checklist 4 dòng** (icon ✓/✗, mỗi dòng mở rộng được xem chi tiết):
   - *Nonce trong ảnh seller*: expected vs `best_candidate`, `edit_distance`.
   - *Nonce trong bằng chứng buyer*: như trên + "Đã quét {buyer_frames_checked} khung hình video" nếu video.
   - *Ảnh không tái sử dụng*: `phash_reused`, nếu true hiện "trùng ảnh trong kho #idx".
   - *Cùng một món hàng*: `inliers_listing_seller`, `inliers_listing_buyer` (ngưỡng 15), thanh tiến trình.
3. **Keypoint match**: `<img src={"data:image/png;base64,"+match_visual_png_b64}>` (listing trái ↔ ảnh seller phải, đường xanh là keypoint khớp) — zoom được (click mở modal).
4. **Công thức điểm** (minh bạch, khớp `risk_score()` ở `ai-pipeline/evidence_check.py`):
   `0.4 × (100 − rep_trung_bình) + 0.4 × (100 − 2×min(inliers,50)) + 0.2 × (5×min(giá_trị_AVAX,10))`; có cờ cứng ⇒ tối thiểu 80; flagged nếu cờ cứng hoặc ≥ 70.
   Hiển thị từng hạng tử bằng số thật từ `details`.
5. **Ghi chú AI**: `report.notes` (list).
6. **Verify on-chain** (nút): tính `keccak256(stringToBytes(report_json))` ở client, so với `getTrade(id).reportHash` → hiện "✓ Report này đúng là bản đã neo on-chain tại tx …" hoặc "✗ Không khớp". Đây là điểm nhấn "không ai sửa được report".
7. Raw JSON (collapsible).

### 6.5 `/profile/[address]` — Hồ sơ reputation
- `reputationOf(address)` dạng gauge 0–100, nhãn: ≥70 "Uy tín cao", 40–69 "Bình thường", <40 "Cảnh báo".
- Lịch sử: events `ReputationChanged(who=address)` (điểm theo thời gian, line chart đơn giản bằng SVG hoặc `recharts`), số giao dịch hoàn tất (`ResolvedClean` liên quan), số tranh chấp thua (`ResolvedDispute` với violator = address).
- Danh sách trade của địa chỉ đó (tái dùng `TradeList`).

### 6.6 `/admin` — Trọng tài (chỉ hiện link khi `address === owner()`)
- Danh sách trade state=Disputed.
- Mỗi trade: link report, ảnh bằng chứng 2 bên (nếu có URI), 3 nút: **Buyer vi phạm** / **Seller vi phạm** / **Không ai sai (hoàn đủ)** → `resolveDispute(id, buyer|seller|0x000…0)`, confirm dialog nêu số tiền từng bên sẽ nhận:
  violator nhận `deposit − 5%`, bên kia nhận `deposit + 5%` (lấy `depositRequired`, `PENALTY_BPS`).

### 6.7 Thành phần chung
`Navbar` (logo, link Tạo/Giao dịch/Hồ sơ/Admin, `AgentStatusDot`, `ConnectButton`), `WrongChainBanner`,
`PendingWithdrawalBanner` (nếu `pendingWithdrawals(me) > 0` → nút `withdraw()`), `TxButton` (bọc simulate → write → wait receipt, trạng thái loading/success/error, toast + link explorer `https://testnet.snowtrace.io/tx/{hash}` trên Fuji), `StateBadge`, `RiskBadge`, `Countdown` (dùng `block.timestamp`-style unix giây; tính từ `Date.now()/1000`, cảnh báo đỏ khi < 1 giờ), `AddressChip` (shortAddr + copy + link profile).

---

## 7. Hooks đề xuất

| hook | làm gì |
|---|---|
| `useTrade(id)` | `useReadContract(getTrade)`, `refetchInterval: 5000` khi state ∈ {0,1,2,3}; trả thêm `role: 'seller'|'buyer'|'viewer'`, `nonceShort`, `exists` |
| `useEscrowConfig()` | đọc 1 lần windows, BPS, owner, agent (multicall, `staleTime: Infinity`) |
| `useMyTrades()` | getLogs TradeCreated theo seller/buyer (mục 3.4), sắp xếp id giảm dần |
| `useReputation(addr)` | `reputationOf` |
| `useTx()` | simulate + write + wait, map lỗi qua `lib/errors.ts` |
| `useVerifyEvidence()` | `useMutation` gọi backend, onSuccess: setQueryData `['report', id]`, invalidate trade |
| `useReport(id)` | `useQuery(['report', id], GET /report/{id})`, `retry: false` khi 404 |
| `useAgentHealth()` | poll `/health` 30s |

---

## 8. Flow người dùng đầy đủ (kịch bản demo)

1. Seller kết nối ví (Fuji) → **Tạo giao dịch**: nhập ví buyer, giá 1 AVAX, ảnh listing → ký `createTrade`.
2. Seller **Nạp cọc 0.3 AVAX**. Buyer mở link `/trade/{id}`, kết nối ví → **Nạp cọc 0.3 AVAX** → state AwaitingEvidence, hiện NonceCard.
3. Seller viết nonce lên giấy, chụp ảnh đóng gói (món hàng + giấy) → **Nộp bằng chứng**.
4. Buyer nhận hàng, quay video mở hộp có giấy nonce (hoặc ảnh) → **Nộp bằng chứng**.
5. Một bên bấm **Chạy AI xác thực** → ~5–30 s → chuyển sang Report: risk 22, 4 dấu ✓, ảnh keypoint, **Verify on-chain ✓**.
6. Hết dispute window (bản demo deploy windows ngắn, xem mục 10) → bấm **Giải ngân** → cọc hoàn cả hai, reputation +1.
7. Kịch bản gian lận: buyer nộp video không có nonce / seller gửi ảnh cũ → Report đỏ, flagged → **Mở tranh chấp** → Admin chọn bên vi phạm → phạt 5%, reputation −10 / +5.

---

## 9. Ràng buộc kỹ thuật & chất lượng

- Mọi số tiền dùng `bigint` (viem), hiển thị bằng `formatEther` tối đa 4 chữ số thập phân. **Không dùng `number` cho wei.**
- Mọi giao dịch: `simulateContract` → `writeContract` → `waitForTransactionReceipt` → invalidate queries liên quan (`trade`, `myTrades`, `reputation`).
- Thời gian: deadline on-chain là unix seconds (`bigint`) → `Number()` an toàn.
- Responsive tới 375px; dark mode theo `prefers-color-scheme` (Tailwind `dark:`).
- Không lưu private key, không gửi seed; chỉ ví trình duyệt (Core Wallet / MetaMask).
- Không gọi `attest()` từ frontend. Không tự tính risk ở client (chỉ hiển thị lại công thức với số từ backend).
- Lỗi mạng backend không làm vỡ trang chi tiết (report là tuỳ chọn; trạng thái on-chain luôn hiển thị được).
- Accessibility: nút có `aria-label`, badge có text (không chỉ màu).

## 10. Chạy local cùng backend (cho người code frontend)

```
anvil                                                    # terminal 1
cd contracts && EVIDENCE_WINDOW_SECS=300 ATTEST_WINDOW_SECS=300 DISPUTE_WINDOW_SECS=120 \
  PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  AGENT_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  forge script script/Deploy.s.sol --rpc-url anvil --broadcast      # terminal 2 → contracts/deployments/31337.json
cd backend && uvicorn attest_service:app --port 8000      # terminal 3 (.env: RPC_URL anvil, AGENT_PRIVATE_KEY = anvil #1)
```
Import anvil account #2 (seller) và #3 (buyer) vào MetaMask (key công khai của anvil) để thử 2 vai.
Ảnh test có thể sinh bằng `python ai-pipeline/tests/synth.py out_dir <nonce>`; khi chạy local không có Pinata,
cho `lib/ipfs.ts` một chế độ `NEXT_PUBLIC_IPFS_MODE=local` lưu file vào `public/uploads/` và trả URL `http://localhost:3000/uploads/<file>` (backend chấp nhận http URL).

## 11. Tiêu chí nghiệm thu

- [ ] Chạy trọn mục 8 bước 1→6 trên anvil không lỗi console.
- [ ] Kịch bản gian lận (bước 7) hiển thị report đỏ và admin xử lý được.
- [ ] Nút Verify on-chain ra ✓ với report thật.
- [ ] Sai chain / chưa kết nối ví / backend offline đều có thông báo rõ, không crash.
- [ ] Mở được trên mobile 375px.
- [ ] Không file nào chứa private key / PINATA_JWT ở phía client.
