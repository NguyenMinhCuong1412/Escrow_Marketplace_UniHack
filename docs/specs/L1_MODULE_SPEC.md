# L1 MODULE — Reputation trên Avalanche L1 riêng (zero-gas) — SPEC, MẶC ĐỊNH BỎ QUA

> **Chỉ làm nếu dư thời gian sau 16/11** (CLAUDE.md mục 6). Không đấu kiến trúc multi-chain với
> TrustPact — module này chỉ để có câu chuyện "Avalanche Integration" sâu hơn nếu còn thời gian.
> Nếu không làm: trên slide trình bày như **roadmap**, không demo.

## 1. Ý tưởng

- Escrow (tiền thật) **ở lại C-Chain/Fuji** — thanh khoản, ví người dùng sẵn có.
- **Reputation registry** chuyển sang một Avalanche L1 riêng của dự án (tạo bằng Avalanche CLI),
  cấu hình **phí gas = 0** (hoặc native token tự phát, cấp miễn phí) ⇒ cập nhật uy tín, lưu lịch sử
  report hash, ghi log AI attestation **không tốn phí** cho người dùng.
- Đồng bộ C-Chain → L1 bằng **Avalanche Interchain Messaging (ICM/Teleporter)**: khi Escrow phát
  `ResolvedClean` / `ResolvedDispute`, gửi message sang L1 để `ReputationRegistry` cập nhật.

## 2. Thành phần

| Thành phần | Chain | Vai trò |
|---|---|---|
| `Escrow.sol` (hiện có) | Fuji C-Chain | Giữ cọc, state machine. Thêm lời gọi `ITeleporterMessenger.sendCrossChainMessage` ở `resolveClean`/`resolveDispute`. |
| `ReputationRegistry.sol` (mới) | L1 riêng | `mapping(address => uint256) score`, `mapping(address => bytes32[]) reportHashes`; implement `ITeleporterReceiver.receiveTeleporterMessage`, chỉ nhận message từ (blockchainID C-Chain, địa chỉ Escrow). |
| ICM relayer | off-chain | Dùng relayer chuẩn của Avalanche (`icm-relayer`) chạy local/VPS để chuyển message. |
| Backend | — | Đọc reputation từ L1 thay vì C-Chain (thêm `REPUTATION_RPC_URL`). |

Payload message (ABI-encoded): `(uint8 kind, uint256 tradeId, address seller, address buyer, address violator, bytes32 reportHash)`
với `kind`: 1 = clean, 2 = dispute.

## 3. Các bước

1. `avalanche blockchain create collectiblerep` → chọn Subnet-EVM, chain ID riêng (vd 77077), cấu hình
   `feeConfig` gas price tối thiểu = 0 hoặc dùng `txAllowList` + phí 0; bật ICM.
2. `avalanche blockchain deploy collectiblerep --fuji` (cần AVAX Fuji cho validator fee; theo ACP-77 cần nạp balance cho validator L1).
3. Deploy `ReputationRegistry` lên L1; deploy lại `Escrow` có hook Teleporter trên Fuji (địa chỉ TeleporterMessenger giống nhau trên mọi chain hỗ trợ ICM — lấy từ docs Avalanche hiện hành).
4. Chạy relayer, cấu hình nguồn = C-Chain Fuji, đích = L1.
5. Test: Foundry test cho `ReputationRegistry.receiveTeleporterMessage` (mock messenger, kiểm tra từ chối sender lạ); E2E thủ công: resolve trade trên Fuji → đợi relayer → `score()` trên L1 thay đổi.

## 4. Thay đổi cần thiết ở code hiện có

- `Escrow.sol`: thêm `address public teleporter; bytes32 public repChainId; address public repRegistry;`
  + setter `onlyOwner`; trong `resolveClean`/`resolveDispute` gọi `_notifyL1(...)` **sau** khi đã chuyển state
  và trong `try/catch` (lỗi ICM không được chặn giải ngân).
  Giữ reputation on-chain hiện có làm nguồn chính cho **cọc**, L1 là bản sao mở rộng (lịch sử, report hash) — tránh phụ thuộc relayer cho logic tiền.
- `backend`: tuỳ chọn đọc lịch sử report từ L1 để hiển thị ở trang profile.

## 5. Rủi ro / vì sao mặc định bỏ qua

- Dựng L1 + validator + relayer tốn ≥ 1–2 ngày và dễ hỏng trước demo; Fuji faucet giới hạn.
- Giám khảo chấm demo chạy được: một escrow + AI hoạt động chắc chắn > kiến trúc multi-chain dở dang.
- TrustPact đã làm L1 + Teleporter — làm theo không tạo khác biệt; điểm khác biệt của dự án là **AI xác thực bằng chứng + nonce OCR**.

## 6. Cách trình bày nếu không làm

Slide "Roadmap": "Giai đoạn 2 — Reputation Layer trên Avalanche L1 zero-gas, đồng bộ qua ICM; uy tín
di động giữa các marketplace khác trong hệ Avalanche." Kèm sơ đồ 2 khối C-Chain ↔ L1.
