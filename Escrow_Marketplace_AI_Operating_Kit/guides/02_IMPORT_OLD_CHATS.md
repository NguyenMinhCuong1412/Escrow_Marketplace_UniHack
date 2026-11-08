# Bước 2 – Đưa nội dung từ các đoạn chat cũ vào dự án

## Mục tiêu

Chuyển các trao đổi trước đây về cuộc thi, ý tưởng, sản phẩm, nghiệp vụ và quyết định kỹ thuật thành tài liệu có thể kiểm chứng. Không dựa hoàn toàn vào project memory hoặc việc AI tự nhớ.

## Nguyên tắc

- Một chat cũ là **nguồn thông tin**, không mặc nhiên là yêu cầu chính thức.
- Chỉ nội dung được chủ dự án xác nhận mới trở thành `CONFIRMED`.
- Phải giữ nguồn gốc: tên chat/ngày/nội dung hoặc trích đoạn.
- Chat mâu thuẫn nhau phải đưa vào `OPEN_QUESTIONS.md`, không tự chọn phiên bản thuận tiện.
- Không đưa private key, seed phrase, password, API key, token hoặc thông tin cá nhân nhạy cảm vào context.

## Cách làm cho từng chat

1. Mở một đoạn chat cũ trong Claude.
2. Gửi prompt trong `docs/agent-ops/CHAT_EXTRACTION_PROMPT.md`.
3. Kiểm tra phần AI trích xuất; sửa lại những câu AI hiểu sai.
4. Lưu kết quả thành file trong `docs/context/inbox/`, ví dụ `CHAT-2026-11-05-competition.md`.
5. Lặp lại cho các chat về product vision, escrow flow, stack, architecture, UI/UX, AI pipeline và cuộc thi.
6. Không gộp trực tiếp vào tài liệu chuẩn khi chưa đối chiếu.

## Nhóm chat nên ưu tiên

| Nhóm | Đích lưu |
|---|---|
| Thể lệ, timeline, tiêu chí chấm, yêu cầu Avalanche | `COMPETITION_CONTEXT.md` |
| Vấn đề người dùng, mục tiêu sản phẩm, khác biệt | `PRODUCT_VISION.md` |
| Buyer/Seller, tạo giao dịch, escrow, release/refund/dispute | `BUSINESS_REQUIREMENTS.md` |
| Công nghệ, phiên bản, thư viện, môi trường | `TECH_STACK.md` |
| Quyết định đã chốt, lý do, ngày chốt | `DECISION_LOG.md` |
| Ý tưởng chưa duyệt, mâu thuẫn, câu hỏi còn thiếu | `OPEN_QUESTIONS.md` |

## Gom nhiều chat thành một nguồn chuẩn

Sau khi đã thu thập các file inbox:

1. Mở Cowork Project.
2. Chạy `docs/agent-ops/CONTEXT_CONSOLIDATION_PROMPT.md`.
3. Yêu cầu Cowork đối chiếu inbox với code, tài liệu hiện hữu và lời xác nhận mới nhất của bạn.
4. Chỉ cập nhật các file `docs/context/` sau khi bạn duyệt các mâu thuẫn và phần chưa rõ.
5. Giữ các file inbox như provenance; không xóa chúng sau khi đã tổng hợp.

## Project memory không thay thế Knowledge Base

Cowork Projects có memory theo project, nhưng tài liệu chính thức cũng mô tả project context/instructions/files là các phần riêng. Vì vậy:

- Memory dùng để giữ mạch công việc và sở thích vận hành.
- `docs/context/` dùng làm nguồn sự thật có thể review, version-control và đưa cho cả Cowork lẫn Antigravity.
- Mỗi agent mới phải được hướng dẫn đọc các file canonical; không giả định subagent kế thừa toàn bộ lịch sử chat của agent cha.

## Tiêu chí hoàn thành bước 2

- [ ] Các chat quan trọng đã được trích xuất.
- [ ] Mỗi ghi chú inbox có nguồn gốc và nhãn độ tin cậy.
- [ ] Thông tin đã thống nhất được chuyển vào tài liệu canonical.
- [ ] Mâu thuẫn được ghi vào `OPEN_QUESTIONS.md`.
- [ ] Các quyết định chính thức được ghi vào `DECISION_LOG.md`.
- [ ] Cowork và Antigravity đều được hướng dẫn dùng cùng bộ context.
