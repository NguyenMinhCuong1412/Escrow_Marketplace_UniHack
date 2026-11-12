---
trigger: model_decision
description: "Use when editing AI / Computer Vision pipeline, retrieval, evidence verification, or pipeline-assisted decisions."
---

# AI / Computer Vision Pipeline Rules

- **Phạm vi áp dụng**: `ai-pipeline/**`, `backend/auto_agent.py`, `backend/attest_service.py` (phần gọi pipeline).
- **Dữ liệu không tin cậy**: Ảnh/video/URI là dữ liệu không tin cậy; kiểm tra giới hạn kích thước, thời lượng video, timeout, và MIME theo magic bytes trước khi xử lý.
- **Input binding**: Tuân thủ `.agents/rules/55-ai-authority.md` — chỉ xử lý bằng chứng có hash khớp on-chain hoặc ảnh niêm yết có chữ ký seller trong `UriRegistry`.
- **Tái lập kết quả**: Báo cáo verify phải ghi rõ phiên bản pipeline, `embedding_backend` (mặc định HSV histogram, CLIP tuỳ chọn), các ngưỡng (`PHASH_REUSE_THRESHOLD`, `MIN_GOOD_INLIERS`, ngưỡng flag) và nguồn nonce (QR / OCR).
- **Đánh giá định lượng**: Đổi ngưỡng/trọng số điểm rủi ro ⇒ cần bằng chứng đánh giá (tập ảnh gắn nhãn, confusion matrix) + DEC mới; không công bố accuracy/FPR/FNR khi chưa đo thực nghiệm.
- **LLM Prompt Safety**: Nếu tích hợp LLM trong tương lai, bắt buộc tách instructions khỏi nội dung người dùng để chống prompt injection.
- Quyền hạn AI: Xem `.agents/rules/55-ai-authority.md` (AI chỉ ký duy nhất `attest()`).