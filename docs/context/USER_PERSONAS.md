# User Personas – Escrow Marketplace cho đồ sưu tầm

> Trạng thái: `UPDATED (MKT-005) – đồng bộ theo mô hình deposit-only 30%, OD-01..OD-09`
> Verified against commit: `bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5` (working tree gồm thay đổi MKT-001..MKT-005 chưa commit — cập nhật hash sau khi merge)

## Persona A — Buyer (Collector)

- **Hồ sơ:** Người mua đồ sưu tầm P2P (LEGO, mô hình, figure, thẻ bài, xu sưu tầm…)
- **Mục tiêu:** Mua được món hàng đúng như mô tả, có bằng chứng minh bạch để yên tâm giao dịch
- **Lo ngại:**
  - Seller gửi hàng sai/giả hoặc bùng giao dịch sau khi đã chốt đơn
  - Không có bằng chứng đối chiếu rõ ràng để khiếu nại
  - Không hiểu tại sao AI đánh dấu "sạch" hay "flagged"
  - Dữ liệu ảnh/video đưa lên IPFS mang tính công khai (`OD-05`)
- **Cần thấy trong UI:**
  - Bộ lọc/tìm kiếm Marketplace, mức cọc tham chiếu 30% AVAX (hiểu rõ contract chỉ giữ cọc bảo đảm nghĩa vụ, không giữ 100% giá mua)
  - Trạng thái yêu cầu mua (TTL 30 phút) & escrow (`Created`, `AwaitingEvidence`, `Attested`, `Disputed`, `Resolved`, `Cancelled`)
  - Mã QR / hex Nonce để đặt cạnh món hàng khi quay video unbox
  - Cảnh báo quyền riêng tư trước khi upload lên IPFS (`OD-05`)
  - Explainable AI Report — keypoint match visualization, pHash score, QR/OCR result
  - Nút khiếu nại (`fileComplaint`) trong `DISPUTE_WINDOW` nếu không đồng ý với AI attestation
  - Reputation score của seller

## Persona B — Seller (Collector)

- **Hồ sơ:** Người bán đồ sưu tầm P2P trên sàn Marketplace
- **Mục tiêu:** Đăng bán dễ dàng, khóa cọc minh bạch chống buyer bom đơn, hoàn cọc nhanh khi giao dịch sạch
- **Lo ngại:**
  - Buyer xác nhận mua rồi không cọc hoặc giữ chỗ quá lâu làm mất cơ hội bán (đã chặn bởi TTL 30 phút & atomic lock)
  - Dispute vô căn cứ → mất cọc oan
  - Phải chờ trọng tài duyệt thủ công cả những đơn sạch bình thường
- **Cần thấy trong UI:**
  - Quản lý danh mục tin đăng (ảnh IPFS, SKU, số lượng tồn, xác nhận/từ chối yêu cầu mua)
  - Buyer đã deposit cọc (`AwaitingEvidence` status)
  - Hướng dẫn chụp ảnh đóng gói kèm QR/OCR nonce (và cảnh báo IPFS công khai)
  - Hoàn cọc sạch qua `resolveClean()` sau AI `attest()` sạch + hết `DISPUTE_WINDOW` (không cần trọng tài duyệt đơn sạch; tranh chấp do Owner/Arbiter xử lý qua `resolveDispute()`)
  - `resolveDispute(id, address(0))` — bảo vệ hoàn đủ cọc nếu AI flag nhầm

## Persona C — AI Agent (Automated Verifier)

- **Hồ sơ:** Bot backend chạy nền (`AGENT_AUTO=true`) hoặc xử lý qua `/verify-evidence`
- **Mục tiêu:** Verify bằng chứng đã neo hash on-chain + ảnh niêm yết có chữ ký seller trong `UriRegistry`, rồi gọi `attest()` on-chain
- **Pipeline:**
  - QR Nonce (ưu tiên đọc mã QR từ `/trade/{id}/nonce-qr.png`) + OCR Nonce dự phòng
  - pHash (DCT) — phát hiện ảnh/khung video reuse
  - ORB keypoints — so sánh ảnh listing ↔ seller ↔ buyer (loại false match từ giấy nonce)
  - CLIP embeddings — semantic similarity check (tùy chọn)
- **Quyền hạn:** Chỉ gọi duy nhất `attest()` — **không có quyền chuyển AVAX hay xử lý tranh chấp trực tiếp (`55-ai-authority.md`)**
- **Bảo vệ:** `ATTEST_WINDOW` — nếu agent không phản hồi kịp, ai cũng gọi được `cancelOnEvidenceTimeout()` để hoàn cọc

## Lưu ý

Đây là giả thuyết khởi đầu dựa trên product vision đã xác nhận, chưa phải nghiên cứu người dùng thật. Cần validate bằng feedback thực tế khi chạy demo.
