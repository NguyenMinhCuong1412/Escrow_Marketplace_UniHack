# FUJI-TRADE-4-QA — Kiểm thử Trade #4 trên Avalanche Fuji (43113)

- **Dự án:** Escrow Marketplace (UniHack 2026)
- **Ngày cập nhật:** `2026-11-17 19:20 +07:00`
- **Nhánh / Commit:** `main` @ `f6b909a575c6f7b45fdceb50d92ce33aa2101713`
- **Mạng & Hợp đồng:** Avalanche Fuji (`Chain ID: 43113`) · `Escrow` `0x19D053c84941411888f5b9e40c854365fdd4eb00` · `CollectibleToken (CDU)` `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`
- **Trade ID:** `Trade #4` (`itemValue = 0.05 AVAX`, cọc mỗi bên `0.015 AVAX`)
- **Trạng thái tổng kết:** **CANCELLED ON TIMEOUT — Hoàn cọc thành công (`Escrow = 0 AVAX`)** *(Không phải `ResolvedClean PASS`. Trade #4 dừng ở bước upload bằng chứng khi vượt quá `evidenceDeadline`; sau đó Owner dùng Core Wallet gọi hàm công khai `cancelOnEvidenceTimeout(4)` để hủy giao dịch và hoàn đủ `0.015 AVAX` về mỗi ví thử nghiệm.)*

---

## 1. Các ví sử dụng & Trạng thái Fuji sau hoàn cọc (Block `61234291`)

| Vai trò | Loại ví | Địa chỉ công khai | AVAX hiện tại | CDU | Pending Withdraw | Ghi chú |
|---|---|---|---:|---:|---:|---|
| **Temp-Seller** | Local Wallet (`http://127.0.0.1:3000`) | `0x48eF20100E18f60A5e0E3b18488de87bDB6EBBB7` | `0.080000 AVAX` | `0.000000` | `0.000000` | Đã nhận hoàn `+0.015 AVAX`; `0.015 CDU` đã burn |
| **Temp-Buyer** | Local Wallet (`http://localhost:3000`) | `0x6b2D54Be25162630A59844b6587C06c68f4De778` | `0.070000 AVAX` | `0.000000` | `0.000000` | Đã nhận hoàn `+0.015 AVAX`; `0.015 CDU` đã burn |
| **Agent (`onlyAgent`)** | Backend Auto-Agent | `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081` | `0.420000 AVAX` | `0.000000` | `0.000000` | Chạy nền `AGENT_AUTO=true` (`rep=50`) |
| **Owner (`onlyOwner`)** | Core Wallet | `0xCa76cBE87902108712729A02F78C1F8cC20b39Eb` | `~0.100000 AVAX` | `0.000000` | `0.000000` | Gọi công khai `cancelOnEvidenceTimeout(4)` (`99999999288598563 wei`, chỉ tốn gas) |

- **Trạng thái hợp đồng cuối cùng (`getTrade(4)` tại block `61234291`):** `state = 5 (Cancelled)`, `ESCROW_BAL = 0.000000 AVAX` (`0 wei`), `nextTradeId = 5`, `sellerEvidenceHash = 0x000...000`, `buyerEvidenceHash = 0x000...000`, `nonce = 0xd555c456a7a1fa5d08076271e2723079a5f945e734723fcd3b7a899b76a2ad25` (short: `d555c456`), `reputation = 50` cho cả hai ví.
- **Sự kiện tx hoàn cọc (`0x82ab62...4bbd`, Block `61234002`, `TX_STATUS = 1` Success, `GAS_USED = 90599`, `Value = 0 AVAX`):**
  - `Transfer` (`CDU`): `0x48eF...BBB7 → 0x000...000`, `15000000000000000` (`0.015 CDU` burn)
  - `Transfer` (`CDU`): `0x6b2D...e778 → 0x000...000`, `15000000000000000` (`0.015 CDU` burn)
  - `Cancelled` (`Escrow`): `tradeId = 4`, `reason = "evidence timeout"`

---

## 2. Kết quả Từng Bước Trade #4

| Bước | Hành động | Expected | Actual | Kết quả | TX Hash & Snowtrace | Ảnh chụp |
|---|---|---|---|---|---|---|
| **0** | Chuẩn bị 2 phiên thử nghiệm `Local Wallet` trên Fuji | Tách biệt phiên Seller (`127.0.0.1`) & Buyer (`localhost`) | Tạo thành công 2 Local Wallet thử nghiệm phục vụ luồng UI trước bước upload | **PASS** | — | — |
| **1** | Seller đăng listing `0.05 AVAX` (`LEGO-CAFE-004`) | `POST /api/listings` `201`, ghim IPFS Pinata thật | `lst_f0d6b3d1ef684fd7b183`, `ipfs://QmdTzjqJcydHSYSA7VZifg1EpYdGe8hyXsGcArA1zWizvi` (`mock: false`) | **PASS** | Off-chain SQLite + Pinata | [02-listing-created.png](fuji-trades/trade-4/02-listing-created.png) |
| **2** | Buyer gửi yêu cầu mua | `POST /api/listings/.../requests` `201`, hiện cọc `0.015 AVAX` | `req_b08ff0df5f1b4c819aaf`, `status: PENDING` | **PASS** | Off-chain SQLite | [02b-buyer-purchase-request.png](fuji-trades/trade-4/02b-buyer-purchase-request.png) |
| **3A** | Seller xác nhận & giữ chỗ 30 phút | `req` chuyển `ACCEPTED`, listing `RESERVED` | `POST .../decision` `200 OK`, countdown `~30p` | **PASS** | Off-chain SQLite | [03-purchase-request-accepted.png](fuji-trades/trade-4/03-purchase-request-accepted.png) |
| **3B** | Seller gọi `createTrade(4)` + ký EIP-191 `UriRegistry` | `Trade #4` `Created`, `/api/uris` `200 OK` | `Trade #4` tạo thành công (blk `61216292`, gas `252292`), `/api/uris` `200` | **PASS** | [`0x15e053...1e14f`](https://testnet.snowtrace.io/tx/0x15e0539cedbcd257b4f4004d31ad2a31183f761be625d84a1a895ed49641e14f) | [04-trade4-created.png](fuji-trades/trade-4/04-trade4-created.png) |
| **4** | Seller nạp cọc `0.015 AVAX` (`deposit(4)`) | `sellerDeposit = 0.015 AVAX`, state giữ `Created` | Thành công trên blk `0x3a6169e`, `/api/trades/4/sync` `200` | **PASS** | [`0x6e9a00...1f637`](https://testnet.snowtrace.io/tx/0x6e9a004ba6f0577d02cff52002e3f2b9cd3b010ef264b168e7f5db087031f637) | [05a-seller-deposited.png](fuji-trades/trade-4/05a-seller-deposited.png) |
| **5** | Tiền kiểm cục bộ dữ liệu thử nghiệm ảnh QR *(trước khi Buyer nạp)* | Xác minh `analyze_evidence()` đọc được QR `d555c456` và khớp đối tượng | Tiền kiểm cục bộ đạt `risk_score=20`, `flagged=false`, `inliers=242` *(xem ghi chú trung thực bên dưới)* | **PASS** *(precheck cục bộ)* | Chưa upload / chưa gửi on-chain | — |
| **6** | Buyer nạp cọc `0.015 AVAX` (`deposit(4)`) | `AwaitingEvidence`, mở `NonceCard` (`d555c456` + QR) | Thành công trên blk `61216503`; UI hiện `Chờ bằng chứng` & QR `TP1:` | **PASS** | [`0x72d77e...566ca`](https://testnet.snowtrace.io/tx/0x72d77ed7361a1edf4e906f685bacb8a3fff8eca550d7c0d68804a777d25566ca) | [05b-both-deposited-and-noncecard.png](fuji-trades/trade-4/05b-both-deposited-and-noncecard.png) |
| **7–8** | Seller & Buyer upload ảnh & `submitEvidence(4, hash)` | Hai bên nộp hash bằng chứng trong `600s` | Chưa hoàn tất upload trong cửa sổ `600s` và quá `evidenceDeadline`; dừng upload đúng quy định | **BLOCKED** | N/A | [06-evidence-deadline-expired.png](fuji-trades/trade-4/06-evidence-deadline-expired.png) |
| **9–11** | Auto-Agent `attest()` → Verify Report → `resolveClean(4)` | `ResolvedClean`, hoàn cọc, uy tín `50 → 51` | Không thực hiện vì chưa có bằng chứng trước `evidenceDeadline` | **NOT RUN** *(không đạt Clean Flow)* | N/A | — |
| **12** | Hủy giao dịch quá hạn `cancelOnEvidenceTimeout(4)` | Trạng thái `Cancelled`, burn `CDU`, hoàn `0.015 AVAX` × 2, `Escrow = 0 AVAX` | Keystore Local Wallet đã khóa sau khi khởi động lại dịch vụ; Owner gọi hàm công khai `cancelOnEvidenceTimeout(4)` bằng Core Wallet (`Value = 0 AVAX`) trên Block `61234002` thành công, hoàn đủ `0.015 AVAX` về hai ví Temp, `pendingWithdrawals = 0` | **PASS** *(Core Wallet public cancel)* | [`0x82ab62...4bbd`](https://testnet.snowtrace.io/tx/0x82ab6274f1cbc55ed7dfc07ec397896e117c9fd7ebcc9daedd8e2f56aef54bbd) | [08-snowtrace-cancel-timeout-refund.png](fuji-trades/trade-4/08-snowtrace-cancel-timeout-refund.png) |

---

## 3. Ghi chú Trung thực & Tổng hợp Bằng chứng Fuji (`Trade #1..#4`)

1. **Dữ liệu thử nghiệm tổng hợp (không phải ảnh giao nhận thật):** Hai file ảnh `seller_packing_trade4.jpg` và `buyer_unbox_trade4.jpg` tạo tại bước 5 là **dữ liệu thử nghiệm tổng hợp** (ghép ảnh mẫu đồ sưu tầm `corner_cafe_brick_model_no_text_1794656149907.jpg` với ảnh QR thật của Trade #4 để tiền kiểm cục bộ pipeline AI). Hai ảnh này **chưa từng được upload lên Pinata hay gửi lên blockchain** và **không được mô tả là ảnh giao nhận hàng thật**.
2. **Hoàn tất thu hồi cọc & dọn sạch Escrow:** Giao dịch `cancelOnEvidenceTimeout(4)` hoàn trả trực tiếp `0.015 AVAX` cho `Temp-Seller` (`0x48eF...BBB7`) và `0.015 AVAX` cho `Temp-Buyer` (`0x6b2D...e778`), đưa `pendingWithdrawals` và số dư contract `Escrow` về `0.000000 AVAX`. Hai ví Local tạm trên không sử dụng tiếp trong quá trình quay demo (sẽ dùng 4 ví Core Wallet chính thức).
3. **Bằng chứng on-chain hiện có trên Fuji (`Trade #1..#4`):**
   - `Trade #1`: `Cancelled` (`cancelled before funded`).
   - `Trade #2`: `Cancelled` (`evidence timeout`) — [trade-2/01-trade2-cancelled-timeout.png](fuji-trades/trade-2/01-trade2-cancelled-timeout.png).
   - `Trade #3`: `Attested(risk=80, flagged=true)` → `Disputed` → `ResolvedDispute(violator=0x000...000, penaltyAmount=0)` — [trade-3/01-trade3-overview.png](fuji-trades/trade-3/01-trade3-overview.png), [trade-3/02-trade3-report-verified.png](fuji-trades/trade-3/02-trade3-report-verified.png), [trade-3/03-snowtrace-resolved-dispute-logs.png](fuji-trades/trade-3/03-snowtrace-resolved-dispute-logs.png).
   - `Trade #4`: `Cancelled` (`evidence timeout` — hoàn cọc `0.015 AVAX` × 2 qua [`0x82ab62...4bbd`](https://testnet.snowtrace.io/tx/0x82ab6274f1cbc55ed7dfc07ec397896e117c9fd7ebcc9daedd8e2f56aef54bbd)).
   - **Hai luồng chưa có bằng chứng on-chain trên Fuji (`ResolvedClean` và `ResolvedDispute` phạt 5% với `violator != address(0)`):** Sẽ được thực hiện trực tiếp bằng Core Wallet khi quay video demo theo [SLIDE_AND_VIDEO_SCRIPT.md](../specs/SLIDE_AND_VIDEO_SCRIPT.md).
