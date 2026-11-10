# Business Requirements – Escrow Marketplace cho đồ sưu tầm

> Trạng thái: `CONFIRMED – đã code và test, 04/11/2026`

## Actors

| Actor | Quyền/nhiệm vụ | Trạng thái |
|---|---|---|
| Seller | Tạo trade, deposit cọc (30% giá trị), nộp evidence (ảnh đóng gói có nonce) | CONFIRMED |
| Buyer | Deposit cọc (30% giá trị), nộp evidence (video unbox có nonce), mở dispute nếu cần | CONFIRMED |
| AI Agent | Chạy pipeline verify evidence (pHash+ORB+OCR), gọi `attest()` tự động. **Không có quyền chuyển tài sản trực tiếp** | CONFIRMED |
| Owner/Admin | Deploy contract, `setAgent()`, emergency. Quyền tối thiểu | CONFIRMED |
| Escrow Contract | Custody AVAX, enforce state transitions, penalty, reputation tracking | CONFIRMED |

## Luồng nghiệp vụ (đã code và test)

1. **Seller tạo trade** — đặt `itemValue`, mô tả món hàng.
2. **Contract sinh nonce** — nonce hex để in/viết trên giấy khi chụp ảnh bằng chứng.
3. **Hai bên nạp cọc** — mỗi bên ≤30% giá trị (`MAX_DEPOSIT_BPS = 3000`). `CollectibleToken` mint 1:1 khi deposit.
4. **Nộp hash bằng chứng** — `submitEvidence(id, keccak256(uri))`. Mỗi bên chỉ nộp 1 lần, không cho hash rỗng.
5. **AI Agent chạy pipeline** — backend nhận request, đọc nonce/evidence hash từ chain (không tin client), verify ảnh/video, gọi `attest()`.
6. **Giải ngân hoặc dispute:**
   - Sạch → `resolveClean()` — hoàn cọc + giải ngân, reputation +1
   - Có khiếu nại → `resolveDispute(id, violator)` — phạt 5% bên vi phạm (`PENALTY_BPS = 500`)
   - `resolveDispute(id, address(0))` — không ai sai (AI flag nhầm) → hoàn đủ cả hai bên
7. **Reputation cập nhật** — bắt đầu 50 điểm, trần 100. Chỉ `resolveClean` mới +1. Timeout/cancel không tăng.

## State machine (đã implement trong `Escrow.sol`)

```
Created
  ├─ SellerDeposited
  ├─ BuyerDeposited
  └─ FullyFunded
       └─ EvidenceSubmitted (1 hoặc cả 2 bên)
            ├─ Attested (agent gọi attest())
            │    ├─ Resolved (resolveClean / resolveDispute)
            │    └─ Disputed → Resolved
            └─ Cancelled (evidence timeout / attest timeout)
```

Thêm: `cancelUnfunded()` — chỉ 1 bên deposit, bên kia quá hạn → huỷ, hoàn cọc.

## Tham số đã chốt

| Tham số | Giá trị | Hằng số trong contract |
|---|---|---|
| Deposit | 30% giá trị món hàng | `MAX_DEPOSIT_BPS = 3000` |
| Penalty | 5% bên vi phạm | `PENALTY_BPS = 500` |
| Evidence window | 3 ngày (production) | `immutable`, truyền qua constructor |
| Dispute window | 2 ngày (production) | `immutable`, truyền qua constructor |
| Attest window | có (bảo vệ khi agent không phản hồi) | `ATTEST_WINDOW` immutable |
| Minimum itemValue | > 0 (đủ để deposit > 0 wei) | `require(depositRequired > 0)` |
| Token model | CollectibleToken — Soulbound, mint/burn 1:1 | `CollectibleToken.sol` |

## Business invariants (đã test, 81 tests pass)

- ✅ Reentrancy protection: CEI pattern + `ReentrancyGuard` (OpenZeppelin). Có test tấn công thật.
- ✅ Không double deposit/release: state check trước mỗi operation.
- ✅ DoS protection: chuyển AVAX thất bại → `pendingWithdrawals` + `withdraw()` (pull pattern).
- ✅ Reputation laundering fix: `reputationInitialized` mapping, không reset về 50 khi reputation = 0.
- ✅ Farm uy tín fix: chỉ `resolveClean` mới +1, cancel/timeout không tăng.
- ✅ Kẹt tiền fix: `cancelUnfunded()` khi chỉ 1 bên deposit + `ATTEST_WINDOW` khi agent không attest.
- ✅ Token Soulbound: `_update` override chặn transfer — không thể chuyển CDU sang ví khác.
- ✅ Tổng giải ngân/hoàn trả không vượt số dư escrow.
- ✅ `itemValue` 1–3 wei không gây deposit = 0.
