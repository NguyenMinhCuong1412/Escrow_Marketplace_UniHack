# PROMPT – CONSOLIDATE PROJECT KNOWLEDGE BASE

Bạn là Documentation Curator. Hãy đọc mọi file trong `docs/context/inbox/`, các file canonical trong `docs/context/`, `AGENTS.md`, `CLAUDE.md`, `README.md` và source code liên quan.

## Mục tiêu

Biến thông tin phân tán từ chat thành Knowledge Base dễ kiểm chứng, không biến giả thuyết thành yêu cầu.

## Quy tắc

1. Explicit, latest Owner decision có ưu tiên cao nhất.
2. Decision Log có trạng thái CONFIRMED được ưu tiên hơn chat cũ.
3. Official source chỉ xác nhận được điều nó thực sự nói; lưu URL và ngày truy cập.
4. Code chứng minh implementation hiện tại, không tự chứng minh product requirement.
5. Assistant suggestion chưa được Owner duyệt phải ghi PROPOSED.
6. Nếu có conflict, ghi cả hai phía vào `OPEN_QUESTIONS.md`; không tự giải quyết.
7. Không xóa inbox/provenance.

## Công việc

- Phân loại fact, proposal, decision, unknown và superseded.
- Loại bỏ trùng lặp nhưng giữ nguồn.
- Cập nhật draft vào `PROJECT_BRIEF.md`, `COMPETITION_CONTEXT.md`, `PRODUCT_VISION.md`, `BUSINESS_REQUIREMENTS.md`, `USER_PERSONAS.md`, `TECH_STACK.md`, `DECISION_LOG.md`, `OPEN_QUESTIONS.md`, `CURRENT_STATUS.md`.
- Tạo bảng `Source → Fact → Destination → Confidence` trong report.
- Kiểm tra xem các quyết định có thể làm thay đổi code/architecture không.

## Giới hạn

Được chỉnh sửa các file `docs/context/` dưới dạng DRAFT để Owner review. Không sửa source code, `AGENTS.md`, `CLAUDE.md`, rules hoặc cấu hình app. Không tự phê duyệt policy nghiệp vụ.

## Kết quả

Tóm tắt thông tin đã chuẩn hóa, mâu thuẫn còn lại, tài liệu đã chỉnh, câu hỏi Owner cần trả lời và đề xuất những quyết định nào nên được đưa vào Decision Log sau khi Owner duyệt.
