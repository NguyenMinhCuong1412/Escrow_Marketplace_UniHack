---
trigger: model_decision
description: "Use for product requirements, user stories, MVP scope, feature prioritization, and product trade-offs."
---

# Product Scope Rules

- Chỉ implement yêu cầu có trong `PRODUCT_VISION.md`/`BUSINESS_REQUIREMENTS.md` ở trạng thái CONFIRMED hoặc được Owner chỉ định rõ trong task.
- Mỗi feature phải có actor, trigger, preconditions, success path, failure path và acceptance criteria.
- Ưu tiên luồng MVP hoàn chỉnh hơn số lượng feature.
- Không tự thêm tokenomics, DAO, oracle, cross-chain, yield. Reputation và trang admin chỉ trong phạm vi BR/DEC đã CONFIRMED; mở rộng cần Owner.
- Giả thuyết từ chat/AI phải gắn PROPOSED; đưa câu hỏi thiếu vào `OPEN_QUESTIONS.md`.
- Khi có xung đột scope, xử lý theo 7 bậc precedence trong `AGENTS.md §0`; dừng và yêu cầu Owner quyết định nếu có xung đột chặn task.