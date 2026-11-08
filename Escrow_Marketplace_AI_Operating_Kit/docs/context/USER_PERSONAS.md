# User Personas – Escrow Marketplace cho đồ sưu tầm

> Trạng thái: `REFINED DRAFT – dựa trên product vision đã xác nhận, chưa có user research thật`

## Persona A — Buyer (Collector)

- **Hồ sơ:** Người mua đồ sưu tầm P2P (trading cards, sneakers, figure, đồ cổ…)
- **Mục tiêu:** Mua được món hàng đúng như mô tả, không bị lừa
- **Lo ngại:**
  - Seller không giao hàng sau khi nhận tiền
  - Hàng giao sai/giả (khác ảnh listing)
  - Không có bằng chứng để dispute
  - Không hiểu tại sao AI quyết định "sạch" hay "fraud"
- **Cần thấy trong UI:**
  - Trạng thái escrow rõ ràng (deposit ✓, evidence ✓, AI verified ✓)
  - Nonce để ghi trên giấy khi quay video unbox
  - Explainable AI Report — keypoint match visualization, pHash score, OCR result
  - Nút dispute nếu không đồng ý với AI attestation
  - Reputation score của seller

## Persona B — Seller (Collector)

- **Hồ sơ:** Người bán đồ sưu tầm P2P
- **Mục tiêu:** Bán hàng an toàn, được giải ngân nhanh sau khi giao đúng
- **Lo ngại:**
  - Buyer nhận hàng nhưng không xác nhận → kẹt tiền
  - Dispute vô căn cứ → mất cọc oan
  - Phải chờ người duyệt thủ công (chậm, thiên vị)
- **Cần thấy trong UI:**
  - Buyer đã deposit cọc (FullyFunded status)
  - Hướng dẫn chụp ảnh đóng gói có nonce
  - Giải ngân tự động sau AI attest (không cần chờ approval thủ công)
  - `resolveDispute(id, address(0))` — bảo vệ nếu AI flag nhầm

## Persona C — AI Agent (Automated Verifier)

- **Hồ sơ:** Bot backend chạy pipeline verification
- **Mục tiêu:** Verify evidence tự động, gọi `attest()` on-chain
- **Pipeline:**
  - pHash (DCT) — phát hiện ảnh reuse
  - ORB keypoints — so sánh ảnh listing ↔ evidence (loại false match từ giấy nonce)
  - OCR nonce — đọc nonce hex trên giấy trong ảnh/video
  - CLIP embeddings — semantic similarity check
- **Quyền hạn:** Chỉ gọi `attest()` — **không có quyền chuyển AVAX trực tiếp**
- **Bảo vệ:** Attest window — nếu agent không phản hồi, ai cũng cancel được trade

## Lưu ý

Đây là giả thuyết khởi đầu dựa trên product vision đã xác nhận, chưa phải nghiên cứu người dùng thật. Cần validate bằng user interview hoặc feedback từ demo.
