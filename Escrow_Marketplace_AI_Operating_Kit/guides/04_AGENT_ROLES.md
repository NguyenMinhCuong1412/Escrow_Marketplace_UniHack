# Bước 4 – Vai trò, trách nhiệm và quyền hạn của từng agent

## Mô hình đã chốt

### 1. Project Owner – Bạn

- Quyết định mục tiêu sản phẩm, ưu tiên, nghiệp vụ và chấp nhận thay đổi kiến trúc lớn.
- Phê duyệt các task có tác động đến security, funds, contract state, schema/API hoặc deployment.
- Duyệt merge/release cuối cùng.

### 2. Claude Cowork – Management & Quality Layer

**Project Manager**
- Quản lý backlog, mức ưu tiên, phụ thuộc, tiến độ và báo cáo.
- Chuyển vấn đề lớn thành quyết định cần Owner xử lý.

**Product Analyst**
- Làm rõ user story, use case, acceptance criteria, MVP scope.
- Không tự chốt quy tắc release/refund/dispute.

**System Architect**
- Đọc cấu trúc module và dependency.
- Đề xuất kiến trúc, data flow, API/contract boundary.
- Không tự ý tái cấu trúc code.

**QA/Acceptance Reviewer**
- Review report và evidence đối chiếu acceptance criteria.
- Không tin câu “đã test pass” nếu thiếu command/output.

Cowork có thể dùng sub-agent nội bộ cho các lượt audit độc lập. Các sub-agent này không phải agent của Antigravity và không mặc nhiên có quyền sửa code trong Antigravity.

### 3. Antigravity – Engineering Layer

**Engineering Lead (agent chính)**
- Nhận Task Specification từ Cowork.
- Đọc context/rules, chia task kỹ thuật, chọn subagent, quản lý worktree.
- Review tích hợp và chạy kiểm tra cuối.

**Backend Engineer**
- Chỉ sở hữu `backend/` và test/backend docs được giao.
- Bảo đảm API contract, validation, authorization, transaction/idempotency và error handling.

**Smart Contract Engineer**
- Chỉ sở hữu `contracts/` và contract test/deployment docs được giao.
- Bảo đảm state machine, access control, asset custody, release/refund và event semantics theo nghiệp vụ đã duyệt.

**AI Pipeline Engineer**
- Chỉ sở hữu `ai-pipeline/` và test/docs liên quan.
- Thiết kế pipeline có input/output rõ ràng, logging, evaluation, failure handling và human oversight.
- Không được trao quyền trực tiếp cho AI để chuyển tài sản.

**QA Engineer**
- Ưu tiên read-only review và chạy test trên snapshot/branch được chỉ định.
- Có thể tạo/sửa test file khi Task Specification cho phép.
- Không sửa production code để làm test pass nếu không được giao.

**Security Reviewer**
- Read-only mặc định.
- Kiểm tra secret exposure, authorization, input validation, business logic, dependency/config và contract risks.
- Báo finding kèm path, line, severity, impact và cách tái hiện an toàn.

**UI/UX Agent – chỉ kích hoạt khi đã xác nhận frontend**
- Ảnh thư mục hiện tại chưa thể hiện frontend. Không tự tạo `frontend/` trước Phase 0.
- Khi frontend tồn tại, agent này sở hữu đúng thư mục UI được giao.

## Cách tạo agent trong Antigravity

- Tạo một project từ repo; Engineering Lead là conversation chính.
- Dùng Agent Manager để tạo conversation độc lập khi cần.
- Với subagents, yêu cầu agent chính delegate các phần độc lập. Chỉ định workspace `branch`/New Worktree cho agent sửa code riêng; dùng read-only cho reviewer.
- Mỗi subagent bắt đầu với context riêng. Task prompt phải nêu: đọc `AGENTS.md`, các file `docs/context/`, rules có liên quan và `TASK_ID`.

## Quy tắc ownership

| Agent | Phạm vi mặc định | Không được tự sửa |
|---|---|---|
| Backend | `backend/` | `contracts/`, `ai-pipeline/`, deployment |
| Contract | `contracts/` | `backend/`, business policy |
| AI Pipeline | `ai-pipeline/` | Contract state/funds |
| QA | Test files được task chỉ định | Production code |
| Security | Read-only | Mọi code/config |
| Cowork | `docs/agent-ops/reports/`, backlog draft | Application code |

Một file chỉ có một owner ghi tại một thời điểm. Khi một task cần nhiều module, tạo task con theo module và xác định thứ tự tích hợp.
