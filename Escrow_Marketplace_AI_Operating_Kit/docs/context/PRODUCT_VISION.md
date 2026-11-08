# Product Vision

> Trạng thái: `CONFIRMED – đã xác nhận bởi Project Owner`

## Problem statement

- Giao dịch đồ sưu tầm P2P (collectibles) có rủi ro lừa đảo cao: buyer trả tiền nhưng seller không giao, hoặc giao hàng giả/sai.
- Escrow truyền thống cần broker thứ 3 (chậm, đắt, thiên vị).
- Các nền tảng escrow blockchain hiện tại (vd. TrustPact) vẫn dựa vào người duyệt thủ công cho dispute — không tự động, không explainable.

## Target users

- **Primary:** Collector/Trader — người mua bán đồ sưu tầm P2P (hai vai: Buyer và Seller)
- **Secondary:** AI Agent — bot tự động verify evidence và gọi `attest()`, không cần con người
- **Không có:** Human arbitrator — đây là differentiator chính

## Value proposition

> **Escrow marketplace không cần broker thứ 3 — bằng chứng được AI xác thực tự động (pHash + ORB keypoints + OCR nonce) thay vì người duyệt thủ công.**

Differentiator so với TrustPact: TrustPact mạnh về kiến trúc multi-chain (Aave V3, custom L1, Teleporter) nhưng chưa giải quyết automated evidence verification. Dự án này tập trung vào lỗ hổng đó.

## MVP outcomes

1. **Happy path end-to-end:** Tạo trade → deposit → nộp evidence (ảnh/video có nonce) → AI verify → giải ngân tự động
2. **Dispute path:** AI flag fraud → dispute → penalty 5% bên vi phạm → reputation giảm
3. **Explainable AI Report:** Keypoint match visualization (PNG), pHash similarity score, OCR nonce result — người dùng HIỂU tại sao AI quyết định

## Non-goals (trừ khi Owner duyệt bổ sung)

- ~~Tokenomics hoặc token riêng~~ — CollectibleToken chỉ là utility receipt (mint/burn 1:1)
- ~~DAO/governance~~
- ~~Oracle, cross-chain hoặc yield~~
- Dynamic deposit theo risk score (Vai 3) — **stretch goal**, spec tại `docs/VAI3_DYNAMIC_DEPOSIT_SPEC.md`
- Custom L1 Avalanche cho reputation — **stretch goal**, spec tại `docs/L1_MODULE_SPEC.md`
- AI tự giải ngân — AI chỉ attest, contract enforce

## Success criteria

- ✅ User journey hoàn chỉnh trên Fuji testnet (happy + dispute + timeout paths)
- ✅ Tích hợp Avalanche thật (smart contract deploy, AVAX custody, CollectibleToken)
- ✅ AI verification pipeline chạy end-to-end với explainable output
- ✅ Demo tái hiện được: ai giữ tiền, khi nào release/refund, AI quyết định thế nào và tại sao
- ⬜ Video demo 2–3 phút thể hiện rõ differentiator (nonce + OCR + keypoint match)

## Căn cứ pháp lý khi pitch

CollectibleToken = **"Ký Cược"** theo Điều 328 Bộ luật Dân sự 2015 — bảo đảm nghĩa vụ, không phải chứng khoán/đầu tư.
