# Business Requirements – Escrow Marketplace cho đồ sưu tầm

> Trạng thái: `UPDATED (MKT-005) – đồng bộ theo Escrow.sol, MKT-001..004 và OD-01..OD-09`
> Baseline: `origin/main` @ `532686f3c3d9a2429e4a35cce3c6d1f811755caa` (PR #23 — Local Docker + Avalanche Fuji). Chỉ cập nhật tham chiếu baseline theo `CL-03` (FINAL-CLEANUP-002); nội dung bên dưới không thay đổi.

## Actors

| Actor | Quyền/nhiệm vụ | Trạng thái |
|---|---|---|
| Seller | Đăng/sửa/ẩn tin bán off-chain, xác nhận yêu cầu mua (giữ chỗ 30 phút), `createTrade()`, `bind-trade`, đặt cọc 30% AVAX, nộp ảnh đóng gói có QR/OCR nonce, khiếu nại nếu cần | CONFIRMED |
| Buyer | Duyệt chợ, gửi yêu cầu mua, đặt cọc 30% AVAX, nộp video/ảnh mở hộp có QR/OCR nonce, khiếu nại nếu cần | CONFIRMED |
| AI Agent | Đọc state on-chain, tải bằng chứng khớp hash + ảnh niêm yết có chữ ký seller, chạy pipeline (pHash+ORB+QR/OCR) và gọi duy nhất `attest()`. **Không có quyền chuyển tiền hay xử lý dispute** | CONFIRMED (`DEC-013`, `DEC-014`) |
| Owner / Arbiter | Deploy contract, `setAgent()`, phân xử tranh chấp on-chain qua `resolveDispute(tradeId, violator)`. *(Known Limitation `OD-03`: Owner là trọng tài duy nhất cho demo)* | CONFIRMED (`OD-02`, `OD-03`) |
| Escrow Contract | Custody tiền cọc 30% AVAX hai bên, enforce 6 trạng thái state machine, penalty, pull-withdraw, reputation tracking | CONFIRMED |

## Luồng nghiệp vụ (Marketplace off-chain + Escrow on-chain)

1. **Đăng bán & Giữ chỗ Marketplace (Off-chain SQLite WAL — `MKT-002`):**
   - Seller đăng sản phẩm (`listings`, `listing_images` trên IPFS kèm cảnh báo dữ liệu công khai).
   - Buyer gửi yêu cầu mua (`purchase_requests`). Khi Seller chấp nhận (`ACCEPTED`), tồn kho được khóa giữ chỗ nguyên tử bằng `BEGIN IMMEDIATE` với **TTL mặc định 30 phút** để chống oversell; quá hạn tự giải phóng nếu chưa liên kết giao dịch on-chain hợp lệ.
2. **Tạo Trade & Liên kết (`createTrade` + `bind-trade`):**
   - Seller gọi `Escrow.createTrade(buyer, itemValue)` on-chain; hợp đồng tính `depositRequired = 30% itemValue` và tự sinh `nonce` ngay tại `createTrade`.
   - Frontend/BFF gọi `POST /requests/{id}/bind-trade` xác minh receipt, event `TradeCreated` và `getTrade()` từ chain rồi liên kết `listing_trades`.
3. **Hai bên nạp cọc 30% AVAX (`OD-01` Deposit-only):**
   - Seller và Buyer mỗi bên gọi `deposit(tradeId)` gửi đúng `depositRequired` (= 30% `itemValue`) bằng AVAX; `CollectibleToken` (CDU) mint Soulbound 1:1.
   - Hợp đồng **chỉ giữ tiền cọc hai chiều** để bảo đảm nghĩa vụ; việc thanh toán tiền hàng thực hiện P2P ngoài hợp đồng theo thỏa thuận.
   - Khi chưa đủ cả hai cọc (vẫn ở `Created`), một bên có thể gọi `cancelUnfunded()` **ngay lập tức** để hủy và hoàn cọc cho bên đã nạp (`PC-04`).
4. **Nộp bằng chứng & Neo hash:**
   - Khi đủ hai cọc, contract chuyển sang `AwaitingEvidence` và mở `EVIDENCE_WINDOW`.
   - Hai bên nộp `submitEvidence(id, keccak256(uri))` (mỗi bên 1 lần, không cho hash rỗng) và đăng ký URI qua `/trade/{id}/uris` (ảnh listing có chữ ký ví seller).
5. **AI Agent chạy pipeline & Attest:**
   - Auto Agent (hoặc `/verify-evidence` dự phòng) kiểm tra hash bằng chứng khớp on-chain + ảnh niêm yết đã ký trong `UriRegistry`, giải mã **QR nonce trước** rồi OCR dự phòng, kiểm tra pHash/ORB/video rồi gọi duy nhất `attest(id, riskScore, flagged, reportHash)`.
6. **Hoàn cọc sạch hoặc Phân xử tranh chấp:**
   - **Sạch (`!flagged` và không ai `fileComplaint` trong `DISPUTE_WINDOW`):** Ai cũng gọi được `resolveClean()` → hoàn đủ 30% cọc cho cả Seller & Buyer, burn CDU 1:1, cộng `+1` reputation mỗi bên.
   - **Tranh chấp (`flagged=true` hoặc một bên gọi `fileComplaint()` trong `DISPUTE_WINDOW`):** Chuyển sang `Disputed`; **Owner / Arbiter** gọi `resolveDispute(id, violator)`:
     - Nếu `violator != address(0)`: phạt `5%` **trên tiền cọc của bên vi phạm** (`violatorDeposit * 500 / 10000`) chuyển cho bên bị hại, hoàn phần còn lại, cập nhật reputation **bên vi phạm `-10`, bên bị hại `+5`** (`OD-04`).
     - Nếu `violator == address(0)` (ví dụ AI flag nhầm): hoàn đủ cọc cho cả hai bên, giữ nguyên reputation.
7. **Timeout khi chờ bằng chứng / chờ AI:**
   - Hết `EVIDENCE_WINDOW` mà còn bên chưa nộp bằng chứng, hoặc đã đủ bằng chứng nhưng quá `EVIDENCE_WINDOW + ATTEST_WINDOW` mà Agent chưa `attest()` → ai cũng gọi được `cancelOnEvidenceTimeout()` → chuyển `Cancelled`, hoàn cọc hai bên, không cộng reputation.

## State machine (đã implement chính xác trong `Escrow.sol`)

### On-chain `Escrow.State` (6 trạng thái enum)
```text
Created
  ├─ cancelUnfunded() (gọi được ngay bởi Seller/Buyer khi chưa đủ 2 cọc) ──► Cancelled (hoàn cọc đã nạp)
  └─ deposit() đủ cả Seller & Buyer ──► AwaitingEvidence
       ├─ cancelOnEvidenceTimeout() (quá EVIDENCE_WINDOW hoặc + ATTEST_WINDOW) ──► Cancelled (hoàn cọc cả hai)
       └─ attest(riskScore, flagged, reportHash) (onlyAgent) ──► Attested
            ├─ resolveClean() (hết DISPUTE_WINDOW & !flagged) ──► Resolved (hoàn cọc +1 rep)
            └─ fileComplaint() (trong DISPUTE_WINDOW, hoặc bất kỳ ai nếu flagged) ──► Disputed
                 └─ resolveDispute(violator) (onlyOwner) ──► Resolved
```

### Off-chain Marketplace lifecycle (`backend/listings.py`)
```text
Listing:         ACTIVE ⇄ PAUSED | (hết available_qty) SOLD | CANCELLED
PurchaseRequest: PENDING ──(Seller accept, 30m TTL)──► ACCEPTED ──(bind-trade verified)──► ESCROW_CREATED ──(sync Resolved/Cancelled)──► COMPLETED / CANCELLED
                    └─(Reject / Cancel / TTL Expiry không có trade on-chain)───────────────► REJECTED / CANCELLED / EXPIRED (trả available_qty)
```

## Tham số đã chốt

| Tham số | Giá trị | Nguồn / Hằng số |
|---|---|---|
| Deposit | 30% giá trị món hàng (hai bên, deposit-only) | `MAX_DEPOSIT_BPS = 3000` (`OD-01`) |
| Penalty | 5% **tiền cọc bên vi phạm** | `PENALTY_BPS = 500` (`Escrow.sol`) |
| Reputation | Khởi tạo `50`, trần `100`; `resolveClean` `+1`; `resolveDispute` `-10 / +5` | `INITIAL_REPUTATION=50`, `MAX_REPUTATION=100` (`OD-04`) |
| Production Windows | Evidence 3 ngày, Dispute 2 ngày (`immutable`, ≤ 365 ngày) | `DEC-008` |
| Fuji Demo Windows (`43113`) | `evidenceWindow=600s`, `attestWindow=600s`, `disputeWindow=90s` | `contracts/deployments/43113.json` (`PC-08`) |
| TTL giữ chỗ Marketplace | Mặc định 30 phút (`1800s`) trước khi `bind-trade` | `MKT-002` (`listings.py`) |
| Token model | CollectibleToken (`CDU`) — Soulbound, mint/burn 1:1 với AVAX deposit | `CollectibleToken.sol` (`DEC-004`) |

## Known Limitations (đã xác nhận theo `OD-01`..`OD-05`)

- **Deposit-only model (`OD-01`):** Contract giữ cọc bảo đảm nghĩa vụ, không escrow toàn bộ tiền hàng.
- **Single-Owner Arbiter & No Disputed Timeout (`OD-02`, `OD-03`):** Owner EOA là trọng tài duy nhất cho `resolveDispute()`; trạng thái `Disputed` hiện chưa có timeout thoát khẩn cấp trên contract.
- **Public IPFS Media (`OD-05`):** Ảnh/video nộp lên IPFS có tính công khai; UI hiển thị cảnh báo rõ trước khi người dùng tải lên.
- **Reputation Farming (`OD-04`):** Dù giao dịch hủy không tăng điểm, việc hai ví thông đồng tự giao dịch sạch lặp lại vẫn là hạn chế đã biết ở bản demo.

## Business invariants (kiểm chứng bằng Foundry — số liệu xem report)

- ✅ Reentrancy protection: CEI pattern + `ReentrancyGuard` (OpenZeppelin).
- ✅ Không double deposit/release: state check trước mỗi operation.
- ✅ DoS protection: chuyển AVAX thất bại → `pendingWithdrawals` + `withdraw()` (pull pattern).
- ✅ Reputation laundering fix: `reputationInitialized` mapping, không reset về 50 khi reputation = 0.
- ✅ Farm uy tín khi hủy fix: chỉ `resolveClean` (+1) và `resolveDispute` (-10/+5) thay đổi điểm; cancel/timeout không tăng.
- ✅ Kẹt tiền khi thiếu cọc/AI chậm fix: `cancelUnfunded()` khi ở `Created` + `ATTEST_WINDOW` trên `cancelOnEvidenceTimeout()`.
- ✅ Token Soulbound: `_update` override chặn transfer — không thể chuyển CDU sang ví khác.
- ✅ Tổng giải ngân/hoàn trả không vượt số dư escrow; `require(depositRequired > 0)` chặn `itemValue` quá nhỏ.
