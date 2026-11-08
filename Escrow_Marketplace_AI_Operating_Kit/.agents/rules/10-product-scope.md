---
trigger: model_decision
description: "Use for product requirements, user stories, MVP scope, feature prioritization, and product trade-offs."
---

# Product Scope Rules

- Chỉ implement yêu cầu có trong `PRODUCT_VISION.md`/`BUSINESS_REQUIREMENTS.md` ở trạng thái CONFIRMED hoặc được Owner chỉ định rõ trong task.
- Mỗi feature phải có actor, trigger, preconditions, success path, failure path và acceptance criteria.
- Ưu tiên luồng MVP hoàn chỉnh hơn số lượng feature.
- Không tự thêm tokenomics, DAO, reputation, oracle, cross-chain, yield hoặc admin features ngoài scope.
- Giả thuyết từ chat/AI phải gắn PROPOSED; đưa câu hỏi thiếu vào `OPEN_QUESTIONS.md`.
- Khi có xung đột scope, dừng và yêu cầu Owner quyết định.
