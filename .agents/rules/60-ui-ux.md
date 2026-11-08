---
trigger: model_decision
description: "Use when designing, implementing, or reviewing an existing frontend and user-facing interaction."
---

# UI/UX Rules

- Chỉ áp dụng trong frontend đã được xác nhận; không tự tạo frontend mới.
- Ưu tiên rõ ràng, dễ đọc, nhất quán; dùng màu tiết chế và typography đủ lớn.
- Có Loading, Empty, Error, Success, Pending/Confirming và Rejected states.
- Với blockchain transaction, phân biệt wallet signature, transaction submitted, pending, confirmed và failed.
- Trước ký giao dịch, hiển thị rõ chain, token, amount, fee, recipient/contract và hành động.
- Không giả vờ giao dịch thành công trước khi có confirmation phù hợp.
- Responsive, keyboard navigation, focus visibility, semantic labels và sufficient contrast.
- Dùng WCAG 2.2 làm baseline; hướng tới AA cho MVP khi khả thi.
- Animation/decoration không được cản trở task completion hoặc che lỗi.
