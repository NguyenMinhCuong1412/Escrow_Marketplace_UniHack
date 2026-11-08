---
trigger: model_decision
description: "Use when designing modules, changing dependencies, APIs, data flows, schemas, or system boundaries."
---

# Architecture Rules

- Đọc implementation trước khi đề xuất kiến trúc mới.
- Giữ boundary `backend/`, `contracts/`, `ai-pipeline/` rõ ràng; frontend chỉ khi xác nhận tồn tại.
- On-chain contract là nơi thực thi state transition được định nghĩa on-chain; backend/indexer không được giả mạo final state.
- API, events, DB schema và AI pipeline contracts phải có schema/version rõ khi giao tiếp giữa module.
- Tránh circular dependency, shared mutable state không cần thiết và business logic duplicate.
- Ưu tiên thay đổi nhỏ, reversible. Kiến trúc mới cần ADR/Decision Log và approval.
- Không migrate framework/database/protocol ngoài task.
