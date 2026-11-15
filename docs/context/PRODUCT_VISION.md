# Product Vision

> Trạng thái: `UPDATED (MKT-005) – đồng bộ theo OD-01..OD-09 và DEC-013..017`
> Verified against commit: `bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5` (working tree gồm thay đổi MKT-001..MKT-005 chưa commit — cập nhật hash sau khi merge)

## Problem statement

- Giao dịch đồ sưu tầm P2P (LEGO, mô hình, figure, thẻ bài, xu sưu tầm) có rủi ro lừa đảo cao: các bên bùng giao dịch, tráo hàng hoặc gửi hàng khác mô tả.
- Escrow truyền thống cần bên trung gian duyệt thủ công mọi giao dịch (chậm, đắt, thiếu minh bạch).
- Nhiều nền tảng escrow blockchain vẫn thiếu lớp xác thực bằng chứng hình ảnh/video tự động với báo cáo giải thích được (explainable report) cho giao dịch bình thường.

## Target users

- **Primary:** Collector / Trader — người mua bán đồ sưu tầm P2P (Buyer & Seller) trên sàn Marketplace và khóa cọc 30% AVAX on-chain.
- **Secondary:** AI Agent (`onlyAgent`) — dịch vụ backend chạy nền tự động kiểm chứng bằng chứng đóng gói/mở hộp và gọi `attest()` trên `Escrow.sol`.
- **Trọng tài tranh chấp (Dispute Arbiter):** Trong bản demo hiện tại, **Owner** xử lý các giao dịch có cờ bất thường hoặc khiếu nại qua `resolveDispute()` (theo `OD-02`/`OD-03`; lộ trình tương lai chuyển sang trọng tài phi tập trung).

## Value proposition

> **Escrow Marketplace cho đồ sưu tầm: AI xử lý luồng sạch tự động (pHash + ORB keypoints + QR/OCR nonce) giúp hai bên nhận lại cọc nhanh chóng qua `resolveClean()` mà không cần trọng tài duyệt từng đơn; tranh chấp do trọng tài xử lý on-chain.**

- **Mô hình ký quỹ cọc 30% (`OD-01`):** Smart Contract chỉ giữ tiền cọc hai chiều 30% giá trị niêm yết bằng AVAX (hoàn cọc cả hai bên khi hoàn tất sạch), không giữ toàn bộ tiền mua hàng hóa.
- **Khác biệt kỹ thuật:** Tập trung vào automated computer-vision evidence verification (chống ảnh tái sử dụng bằng pHash, so khớp vật thể ORB/RANSAC, xác thực QR/OCR nonce chống gian lận thời gian thực) với bằng chứng hash neo on-chain, khác hướng với các giải pháp tập trung vào kiến trúc multi-chain / yield (chi tiết phân tích đối thủ xem `COMPETITION_CONTEXT.md`).

## MVP outcomes

1. **Marketplace + Happy path:** Đăng bán → Buyer gửi yêu cầu mua → Seller xác nhận (giữ chỗ 30 phút) → Tạo Escrow (`createTrade` + `bind-trade`) → Hai bên đặt cọc 30% AVAX → Nộp hash bằng chứng có QR/OCR nonce → AI `attest()` sạch → Hết `DISPUTE_WINDOW` gọi `resolveClean()` hoàn cọc và +1 reputation.
2. **Dispute path:** AI `attest(flagged=true)` hoặc một bên gọi `fileComplaint()` trong `DISPUTE_WINDOW` → Owner gọi `resolveDispute()`: phạt 5% tiền cọc bên vi phạm, chuyển phần phạt cho bên bị hại, cập nhật reputation `-10 / +5` (hoặc `violator = address(0)` hoàn đủ cả hai).
3. **Explainable AI Report:** Keypoint match visualization (PNG), pHash similarity score, kết quả QR/OCR nonce hiển thị tại `/trade/[id]/report` giúp người dùng hiểu lý do AI đánh giá rủi ro.

## Non-goals (trừ khi Owner duyệt bổ sung)

- ~~Tokenomics đầu cơ hoặc token thanh toán riêng~~ — `CollectibleToken` (CDU) chỉ là token kế toán Soulbound mint/burn 1:1 theo AVAX đang ký quỹ (`DEC-004`).
- ~~DAO/governance~~
- ~~Oracle, cross-chain hoặc yield~~
- Dynamic deposit theo risk score (Vai 3) — **stretch goal**, spec tại `docs/specs/VAI3_DYNAMIC_DEPOSIT_SPEC.md`
- Custom L1 Avalanche cho reputation — **stretch goal**, spec tại `docs/specs/L1_MODULE_SPEC.md`
- AI tự chuyển tài sản hoặc tự phân xử tranh chấp — AI chỉ `attest()`, contract enforce và Owner gọi `resolveDispute()`

## Success criteria

- ✅ Tích hợp Avalanche thật (contracts deployed trên Fuji `43113`, AVAX deposit 30% + CollectibleToken Soulbound 1:1).
- ✅ E2E luồng Marketplace + Escrow + AI verification chạy được trên môi trường local Anvil + bộ test tự động.
- ⬜ Manual E2E User journey hoàn chỉnh trên Fuji testnet (`NOT TESTED` — chờ Owner cấu hình `.env` Fuji & nạp AVAX agent).
- ✅ Explainable AI report + cảnh báo ảnh/video IPFS công khai hiển thị trên UI (`OD-05`).
- ⬜ Video demo 2–3 phút (`PENDING-OWNER`).

## Căn cứ pháp lý khi pitch

CollectibleToken = **"Ký Cược"** theo Điều 328 Bộ luật Dân sự 2015 — bảo đảm nghĩa vụ giao dịch, không phải chứng khoán hay công cụ đầu tư.
