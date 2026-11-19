# Avalanche Fuji Demo Evidence (`43113`)

> **Phương pháp:** đọc trực tiếp từ chain qua RPC công khai `https://api.avax-test.network/ext/bc/C/rpc` (`eth_chainId`, `eth_call`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`) và Routescan/Snowtrace logs API, thực hiện ngày **2026-11-20** (GMT+7), head block **61,343,846**. Không có tx hash nào được tạo hay suy diễn — tất cả là dữ liệu chain thật, ai cũng tự kiểm lại được trên Snowtrace.
> **Phạm vi:** bằng chứng **lịch sử** của hợp đồng nhóm. Lần chạy E2E mới cho video demo (`ResolvedClean`, `ResolvedDispute` phạt 5%) **chưa thực hiện** — xem §4.

## 1. Cấu hình hợp đồng (đọc on-chain)

| Thuộc tính | Giá trị on-chain | Khớp `contracts/deployments/43113.json` |
|---|---|---|
| `eth_chainId` | `43113` | ✅ |
| Escrow | `0x19D053c84941411888f5b9e40c854365fdd4eb00` | ✅ |
| `agent()` | `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081` | ✅ |
| `owner()` | `0xCa76cBE87902108712729A02F78C1F8cC20b39Eb` | ✅ |
| `EVIDENCE_WINDOW / ATTEST_WINDOW / DISPUTE_WINDOW` | `600 / 600 / 90` giây | ✅ |
| `nextTradeId` | `5` (Trade #1..#4) | — |
| Số dư Escrow | `0 AVAX` (không còn cọc treo) | — |
| Số dư Agent / Owner | `0.4700 AVAX` / `0.5500 AVAX` | — |

## 2. Giao dịch Fuji đã kiểm chứng (Snowtrace: `https://testnet.snowtrace.io/tx/<hash>`)

| Trade | Bước | Event | Block | Tx hash | Ghi chú |
|---|---|---|---|---|---|
| #1 | `createTrade` | `TradeCreated` | 61000600 | `0x71341deb7955ef7ba002381618fb803e7ada8253a4ed25e9705ecfea91894a1a` | itemValue 0.0001 AVAX |
| #1 | `deposit` (seller) | `Deposited` | 61000622 | `0x25822d90aa7a96a153ba3e3bbdebb0c3658e542fc765b4f569820bd0cdbe38a1` | |
| #1 | `cancelUnfunded` | `Cancelled` | 61000645 | `0xda9a63342ed94a410eb1142b8a2091427dfd776f5e583b87d2a3300ada6b89eb` | hoàn cọc trước khi đủ |
| #2 | `createTrade` | `TradeCreated` | 61077054 | `0x3467de99004125d549d704389f6745685c10520d7c5b3ce4b1469ca3c44a5e12` | itemValue 0.1 AVAX, cọc 0.03/bên |
| #2 | `deposit` ×2 | `Deposited`, `FullyFunded` | 61077288 / 61077418 | `0xc4961804960c2e647ff014b1a68e692d6d00fa77bcda4b63b106448d60c1cb98` / `0xaf5de7e5bf0e2591bf0df390e7577b294065e86096d3caa27ad0e2ed8ed78ae9` | |
| #2 | `submitEvidence` (buyer) | `EvidenceSubmitted` | 61077590 | `0xe8e5b0182e570117ca8f4df52f58bdb49643966e6d72f7a6e8299a013da49562` | seller không nộp |
| #2 | `cancelOnEvidenceTimeout` | `Cancelled` | 61077924 | `0xd91cc7da3f7c58012b4e1f8b8e6f4aa4182d757a7d10c70a77e8af8592b8b22e` | timeout → hoàn 100% |
| #3 | `createTrade` | `TradeCreated` | 61098815 | `0x01860e6428179175a736f329c5aefbc871a41a4c1c87f1361bc9d5a793115e8e` | itemValue 0.1 AVAX |
| #3 | `deposit` ×2 | `Deposited`, `FullyFunded` | 61098907 / 61098956 | `0x009d5abb3d7fc590825661f60f0fac863f49d8459a4de219a6014bb5a970cdd1` / `0x5f2fb5838702e8c494815d29104cca395513ff5cc55e4112380b75250e2146af` | |
| #3 | `submitEvidence` ×2 | `EvidenceSubmitted` | 61099092 / 61099127 | `0x8d69eb2798e0623de487af5e6e7910e7310140f422f3a0463b664b3db95fee67` / `0x56fa16d034692c5fda6756ff156a716b00a591955b150ba38ea7064c4a02f4fc` | |
| #3 | **`attest` (AI Agent)** | `Attested` | 61099166 | `0x88abbc5b767ae2f8260764f3caa74964e95c712ae97bb51879cb46d6ab5ffe12` | **from = Agent `0x579e…7081`**, `riskScore=80`, `flagged=true`, `reportHash=0xa35dce38807acef70fabd991fb4977f32bd0d65deed9869683b0c2bbb282e133` |
| #3 | `fileComplaint` | `Disputed` | 61099829 | `0xd50434dcc0733dfcb8a7bd5daeeb7096f85b323503fc15036be8b714feab3475` | filer = Owner (cũng là seller của trade này) |
| #3 | **`resolveDispute` (Owner)** | `ResolvedDispute` | 61100053 | `0x384d45a94d85cc374d87cfd5a80eb1242ca5915d818b1d0af73174bd63d1e2cb` | from = Owner; **`violator = 0x0`, `penalty = 0`** (phán quyết không lỗi, hoàn cọc) |
| #4 | `createTrade` | `TradeCreated` | 61216292 | `0x15e0539cedbcd257b4f4004d31ad2a31183f761be625d84a1a895ed49641e14f` | seller/buyer khác Owner |
| #4 | `deposit` ×2 | `Deposited`, `FullyFunded` | 61216414 / 61216503 | `0x6e9a004ba6f0577d02cff52002e3f2b9cd3b010ef264b168e7f5db087031f637` / `0x72d77ed7361a1edf4e906f685bacb8a3fff8eca550d7c0d68804a777d25566ca` | |
| #4 | `cancelOnEvidenceTimeout` | `Cancelled` | 61234002 | `0x82ab6274f1cbc55ed7dfc07ec397896e117c9fd7ebcc9daedd8e2f56aef54bbd` | không ai nộp bằng chứng |

Trạng thái `getTrade()` hiện tại: #1 `Cancelled`, #2 `Cancelled`, #3 `Resolved` (`flagged=true`, `riskScore=80`), #4 `Cancelled`. Mọi ví tham gia: CDU `0` (đã burn), reputation `50` (giá trị khởi tạo — đúng thiết kế: huỷ/timeout và phán quyết không lỗi không đổi điểm).

## 3. Kết luận chức năng đã chứng minh trên Fuji

| Chức năng | Bằng chứng | Kết quả |
|---|---|---|
| `createTrade`, `deposit` 30%, `FullyFunded` | #2, #3, #4 | **PASS** |
| `submitEvidence` (hash bằng chứng neo on-chain) | #2, #3 | **PASS** |
| AI Agent ký `attest()` (chỉ ví Agent) | #3 — `from = 0x579e…7081` | **PASS** |
| `fileComplaint` → `Disputed` | #3 | **PASS** |
| Owner `resolveDispute` | #3 (`violator = 0x0`) | **PASS (nhánh không lỗi)** |
| `cancelUnfunded`, `cancelOnEvidenceTimeout` | #1, #2, #4 | **PASS** |
| `resolveClean` (+1 reputation) | — | **NOT RUN** (chưa từng xảy ra on-chain) |
| `resolveDispute` phạt 5% (`penalty > 0`, rep −10/+5) | — | **NOT RUN** |
| Luồng UI hai ví độc lập không trùng Owner | #4 (một phần) | **PARTIAL** |

## 4. Việc Owner cần làm để hoàn tất bằng chứng cho video (chỉ Owner ký được)

Chạy `docker compose up -d` với `.env` của **máy Owner** (`PINATA_JWT`, `AGENT_PRIVATE_KEY` của ví Agent, `AGENT_AUTO=true`). Seller/Buyer là hai ví test **khác** ví Owner.

1. **Trade A (clean):** listing → request → `createTrade` → deposit ×2 → evidence có QR nonce đúng ×2 → Agent `attest(flagged=false)` → chờ 90s → `resolveClean` ⇒ ghi tx `ResolvedClean`.
2. **Trade B (dispute 5%):** bằng chứng lỗi **thật** (thiếu QR nonce / sai vật thể — không sửa code/ngưỡng) → Agent `attest(flagged=true)` → bên bị hại `fileComplaint` → Owner `/admin` `resolveDispute(tradeId, violator)` ⇒ ghi tx `ResolvedDispute` có `penaltyAmount > 0`.
3. Dán tx hash vào README §5 và bảng §2; kiểm tra lại bằng Snowtrace.

Lưu ý gas: Agent hiện `0.47 AVAX`, đủ cho nhiều lần `attest` trên Fuji nhưng dưới ngưỡng Release Gate 0.5 AVAX — nạp thêm từ faucet.
