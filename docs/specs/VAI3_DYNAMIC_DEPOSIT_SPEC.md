# VAI 3 — Dynamic Deposit (cọc động theo rủi ro) — SPEC, CHƯA IMPLEMENT

> Stretch goal. Hiện `Escrow.sol` cố định cọc **30%** (`MAX_DEPOSIT_BPS = 3000`) cho cả hai bên.
> Spec này mô tả chính xác cần đổi gì nếu quyết định làm (chỉ trước mốc đóng băng 16/11).
> Nguyên tắc: **trần 30% giữ nguyên** (căn cứ pitch "Ký Cược" Điều 328 BLDS 2015 và rủi ro pháp lý),
> cọc động chỉ **giảm** cọc cho người uy tín, không bao giờ vượt 30%.

## 1. Mục tiêu

- Người bán/mua uy tín cao nạp ít cọc hơn → giảm rào cản vốn, khuyến khích giữ uy tín.
- Người mới hoặc uy tín thấp nạp tối đa 30% → bảo vệ đối tác.
- Công thức **deterministic, tính được on-chain**, không phụ thuộc AI lúc tạo trade (AI chỉ có
  thông tin sau khi có bằng chứng — không dùng `riskScore` để định cọc vì lúc tạo trade chưa có).

## 2. Công thức

Ký hiệu: `R` = `reputationOf(party)` ∈ [0, 100] (ví mới = 50). `V` = `itemValue` (wei).

```
MIN_DEPOSIT_BPS = 1000   // sàn 10%
MAX_DEPOSIT_BPS = 3000   // trần 30% (giữ nguyên)

// Uy tín ≤ 50 → trần 30%. Uy tín 50..100 → giảm tuyến tính về 10%.
if R <= 50:  bps(R) = 3000
else:        bps(R) = 3000 - (R - 50) * (3000 - 1000) / 50      // R=60→2600, R=75→2000, R=100→1000

// Phụ phí giá trị cao: món > HIGH_VALUE (mặc định 5 AVAX) cộng 500 bps nhưng vẫn kẹp trần.
if V > HIGH_VALUE: bps = min(bps + 500, 3000)

deposit(party) = V * bps(R_party) / 10000      // mỗi bên tính RIÊNG theo uy tín của chính mình
```

Bảng tra (V ≤ 5 AVAX):

| R | bps | cọc cho món 1 AVAX |
|---|---|---|
| 0–50 | 3000 | 0.30 |
| 60 | 2600 | 0.26 |
| 75 | 2000 | 0.20 |
| 90 | 1400 | 0.14 |
| 100 | 1000 | 0.10 |

Vì sao tuyến tính, không logistic: giải thích được trong 1 câu trên slide, tính bằng số nguyên trong Solidity, không cần thư viện fixed-point.

Chống lạm dụng:
- Reputation chỉ tăng +1 mỗi giao dịch sạch, nên lên 100 cần ≥ 50 giao dịch hoàn tất — farm bằng ví phụ tốn phí gas và thời gian (dispute window), và **cọc của chính mình** vẫn bị khoá mỗi lần.
- Cọc được **chốt tại thời điểm `createTrade`** (snapshot), không đổi nếu reputation thay đổi giữa chừng.

## 3. Thay đổi trong `contracts/src/Escrow.sol`

1. Hằng số mới:
   ```solidity
   uint16 public constant MIN_DEPOSIT_BPS = 1000;
   uint256 public constant HIGH_VALUE = 5 ether;
   uint16 public constant HIGH_VALUE_SURCHARGE_BPS = 500;
   ```
2. Struct `Trade`: thay `depositRequired` bằng hai trường:
   ```solidity
   uint256 sellerDepositRequired;
   uint256 buyerDepositRequired;
   ```
   (Đổi struct ⇒ ABI đổi ⇒ cập nhật `backend/chain.py::get_trade` (thứ tự tuple), `backend/abi/*.json`,
   `FRONTEND_SPEC.md` mục 3.2, và script `contracts/script/e2e_anvil.sh` (chuỗi `TRADE_T`).)
3. Hàm thuần mới:
   ```solidity
   function depositBpsFor(address who, uint256 itemValue) public view returns (uint16) {
       uint256 r = reputationInitialized[who] ? reputation[who] : INITIAL_REPUTATION;
       uint256 bps = r <= 50 ? MAX_DEPOSIT_BPS
                             : MAX_DEPOSIT_BPS - (r - 50) * (MAX_DEPOSIT_BPS - MIN_DEPOSIT_BPS) / 50;
       if (itemValue > HIGH_VALUE) bps += HIGH_VALUE_SURCHARGE_BPS;
       if (bps > MAX_DEPOSIT_BPS) bps = MAX_DEPOSIT_BPS;
       return uint16(bps);
   }
   ```
4. `createTrade`: tính và lưu
   `t.sellerDepositRequired = itemValue * depositBpsFor(msg.sender, itemValue) / 10000;`
   `t.buyerDepositRequired  = itemValue * depositBpsFor(buyer, itemValue) / 10000;`
   `require(both > 0, "itemValue too small")`. Gọi `_ensureReputationInitialized` **sau** khi tính (không ảnh hưởng vì mặc định 50 cả hai cách).
5. `deposit`: `require(msg.value == (msg.sender == t.seller ? t.sellerDepositRequired : t.buyerDepositRequired), "wrong deposit amount");`
6. `resolveDispute`: **không đổi** — phạt 5% tính trên cọc thực của bên vi phạm (`violatorDeposit`). Lưu ý: người uy tín cao cọc ít ⇒ tiền phạt tuyệt đối nhỏ hơn; chấp nhận được vì họ mất −10 uy tín, và uy tín thấp ⇒ cọc 30% lần sau.
7. Event `TradeCreated` thêm `uint256 sellerDeposit, uint256 buyerDeposit` (frontend hiển thị ngay).

## 4. Test cần thêm (`contracts/test/Escrow.t.sol`)

- `test_DepositBps_Table`: R ∈ {0, 50, 60, 75, 100} → {3000, 3000, 2600, 2000, 1000}.
- `test_DepositBps_HighValueSurchargeCapped`: R=100, V=6 ether → 1500; R=40, V=6 ether → 3000.
- `test_CreateTrade_SnapshotsDeposits`: hai bên khác uy tín ⇒ hai mức cọc khác nhau; đổi uy tín sau khi tạo không đổi mức đã chốt.
- `test_Deposit_RevertWrongAmountPerParty`.
- Fuzz: `depositBpsFor` luôn ∈ [1000, 3000]; `deposit ≤ 30% * V`.
- Invariant hiện có (`EscrowInvariant.t.sol`) phải vẫn pass (handler đổi `t.depositRequired` → mức theo vai).

## 5. Thay đổi ngoài contract

- **Backend**: `chain.py` đọc 2 trường mới; `risk_score` không đổi.
- **Frontend**: trang tạo trade gọi `depositBpsFor(seller, V)` và `depositBpsFor(buyer, V)` để hiện "Bạn cọc X (uy tín 75 → 20%) · Người mua cọc Y"; nút nạp cọc dùng đúng trường theo vai.
- **Slide**: thêm 1 bảng tra mục 2 vào slide "Cơ chế kinh tế".

## 6. Ước lượng

~1.5 giờ code + test cho người đã quen repo. Rủi ro chính: quên cập nhật thứ tự tuple trong `chain.py` / `e2e_anvil.sh` ⇒ chạy `forge test`, `pytest`, `bash script/e2e_anvil.sh` sau khi sửa.
