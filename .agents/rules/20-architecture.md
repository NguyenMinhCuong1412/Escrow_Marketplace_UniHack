---
trigger: model_decision
description: "Use when designing modules, changing dependencies, APIs, data flows, schemas, or system boundaries."
---

# Architecture Rules

- Đọc implementation trước khi đề xuất kiến trúc mới.
- Bốn module: `contracts/`, `backend/`, `ai-pipeline/`, `frontend/`. `backend` import `ai-pipeline` qua `sys.path` (`backend/attest_service.py`) là boundary đã chấp nhận; không thêm đường import chéo khác.
- On-chain contract là nơi thực thi state transition được định nghĩa on-chain; backend/indexer không được giả mạo final state.
- **API contract**: Đổi endpoint/request/response backend ⇒ cập nhật mô tả API trong `docs/specs/FRONTEND_SPEC.md §4` trong cùng PR (file do task doc-sync sở hữu; nếu ngoài scope Task Spec ⇒ ghi vào report mục "Docs cần sync").
- **ABI sync**: Đổi ABI contract ⇒ cập nhật đồng thời `backend/abi/Escrow.json` và `frontend/lib/abi/Escrow.json` trong cùng PR.
- **Parity strings**: `listing_message` (Python) ↔ `listingMessage` (TS), canonical JSON report hash (Python ↔ viem) phải đổi đồng thời hai phía; khi có parity test thì test là nguồn kiểm chứng.
- API, events, DB schema và AI pipeline contracts phải có schema/version rõ ràng khi giao tiếp giữa module.
- Tránh circular dependency, shared mutable state không cần thiết và logic nghiệp vụ duplicate.
- Ưu tiên thay đổi nhỏ, reversible. Kiến trúc mới cần ADR/Decision Log và approval.
- Không migrate framework/database/protocol ngoài task.