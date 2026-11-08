# Bước 3 – Hoàn thiện Project Knowledge Base

## Mục tiêu

Tạo một nguồn thông tin chuẩn duy nhất cho mọi phiên Cowork, Antigravity và subagent. Bộ tài liệu trong `docs/context/` là **source of truth** về sản phẩm; code là source of truth về implementation hiện tại.

## Các file canonical

| File | Nội dung | Ai cập nhật |
|---|---|---|
| `PROJECT_BRIEF.md` | Tổng quan, mục tiêu, phạm vi, trạng thái | Cowork đề xuất, Owner duyệt |
| `COMPETITION_CONTEXT.md` | Thể lệ, timeline, tiêu chí, bằng chứng nguồn | Cowork nghiên cứu, Owner xác nhận |
| `PRODUCT_VISION.md` | Problem, target users, value proposition, MVP | Owner quyết định |
| `BUSINESS_REQUIREMENTS.md` | Vai trò, use cases, state transitions, business rules | Owner quyết định, Cowork làm rõ |
| `USER_PERSONAS.md` | Persona và nhu cầu/hành vi | Cowork đề xuất, Owner duyệt |
| `TECH_STACK.md` | Framework, versions, libraries, tools, rationale | Engineering Lead xác minh, Owner duyệt đổi stack |
| `DECISION_LOG.md` | Các quyết định chính thức, lý do và trạng thái | Cowork cập nhật sau khi Owner duyệt |
| `OPEN_QUESTIONS.md` | Câu hỏi, mâu thuẫn, giả định chưa xác nhận | Tất cả agent có thể đề xuất; Owner quyết định |
| `CURRENT_STATUS.md` | Trạng thái module, task, test và blockers | Cowork/Engineering Lead cập nhật |

## Quy ước trạng thái thông tin

- `CONFIRMED`: Owner đã xác nhận hoặc nguồn chính thức đã được xác minh.
- `PROPOSED`: Đề xuất, chưa được chấp thuận.
- `UNKNOWN`: Chưa có đủ bằng chứng.
- `SUPERSEDED`: Quyết định cũ đã được thay thế; phải liên kết tới quyết định mới.

Mỗi fact có ảnh hưởng tới kiến trúc/logic nên có nguồn: `OWNER`, `CODE`, `OFFICIAL_SOURCE`, `CHAT:<id>` hoặc `TEST:<run-id>`.

## Cách duy trì

1. Khi có yêu cầu mới, Cowork xác định tài liệu canonical nào bị ảnh hưởng.
2. Nếu yêu cầu thay đổi một quyết định đã chốt, tạo mục đề xuất trong `DECISION_LOG.md`, chưa xóa lịch sử cũ.
3. Khi Owner duyệt, đánh dấu quyết định cũ `SUPERSEDED` và thêm quyết định mới `CONFIRMED`.
4. Nếu phát hiện code khác tài liệu, không tự giả định code đúng hoặc tài liệu đúng; tạo discrepancy và yêu cầu quyết định.
5. Sau mỗi milestone, cập nhật `CURRENT_STATUS.md` và các link tài liệu liên quan.

## Cấu trúc Escrow cần làm rõ trước implementation

- Tác nhân: Buyer, Seller, Arbitrator/Dispute Resolver, Admin, Smart Contract.
- Giao dịch: tạo deal, chấp nhận điều khoản, deposit/fund, xác nhận giao hàng/dịch vụ, release, refund, dispute, timeout, cancel.
- Tài sản: loại token, decimals, chain, fee, ai chịu phí.
- Trạng thái: state machine, trạng thái tx, trạng thái indexer/backend.
- Quyền: ai được gọi hàm nào, trong điều kiện nào.
- Tranh chấp: bằng chứng, thời hạn phản hồi, người ra quyết định, cách thực thi quyết định.
- An toàn: lỗi RPC, tx pending/reverted, chain mismatch, wallet disconnect, duplicate requests, event reorg/confirmation.
- AI Pipeline (nếu có): dữ liệu đầu vào, đầu ra, độ tin cậy, human review, giới hạn quyền.

Không được để AI tự quyết định chuyển tài sản hoặc release escrow.
