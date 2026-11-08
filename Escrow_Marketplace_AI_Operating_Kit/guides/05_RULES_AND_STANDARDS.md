# Bước 5 – Bộ quy tắc và tiêu chuẩn kỹ thuật chính thức

## Cách bộ quy tắc được nạp

- `AGENTS.md`: các ràng buộc ngắn, luôn bật trong Antigravity.
- `.agents/rules/*.md`: quy tắc chuyên môn. Mỗi file có YAML frontmatter với `trigger` hợp lệ. Bộ kit dùng `model_decision` cho các hướng dẫn chuyên môn dài để tránh nạp toàn bộ vào mọi lượt.
- `.agents/skills/<name>/SKILL.md`: quy trình nhiều bước, được phát hiện và đọc khi phù hợp.
- Cowork Project instructions: phải được dán thủ công từ `docs/agent-ops/COWORK_PROJECT_INSTRUCTIONS.md`; đừng giả định Cowork tự đọc mọi file chỉ vì có `AGENTS.md`.
- `CLAUDE.md` hiện có: giữ nguyên trong Phase 0; audit nội dung và chỉ hợp nhất sau khi so sánh. `CLAUDE.md` không thay thế cấu hình Project Instructions của Cowork.

**Lưu ý:** Antigravity quét trực tiếp các file `.md` ngay trong `.agents/rules/`; không đặt rule vào thư mục con sâu hơn nếu chưa cấu hình registry. Mọi rule trong folder này phải có `trigger` đúng chuẩn, nếu không có thể bị bỏ qua.

## Bộ tiêu chuẩn được chọn

### Product & scope

- MVP-first; mỗi tính năng phải giải quyết một vấn đề cụ thể.
- User story có acceptance criteria và failure path.
- Không overbuild: không tạo marketplace admin, token, ranking, DAO hoặc oracle nếu chưa thuộc phạm vi được duyệt.
- Không biến ý tưởng từ chat thành requirement nếu Owner chưa xác nhận.

### Architecture

- Separation of Concerns, low coupling/high cohesion.
- Contract là nguồn thực thi trạng thái on-chain; backend/indexer là nguồn dữ liệu phụ trợ, không được tự giả mạo finality.
- API/contract boundary phải có schema và error semantics rõ.
- Không thêm abstraction hoặc service nếu chưa có lý do thực tế.
- Mỗi quyết định kiến trúc quan trọng phải ghi ADR/Decision Log.

### Backend

- Giữ framework và conventions hiện tại sau khi xác minh.
- Dùng pytest nếu code Python và cấu hình repo xác nhận; không tạo một framework test thứ hai.
- Validate dữ liệu ở boundary; authorization ở server-side; không tin dữ liệu frontend.
- Chuẩn hóa error response, structured logging, timeout/retry có giới hạn.
- Các thao tác gọi lặp lại có thể gây side effect cần idempotency phù hợp.
- Không log token, private data hay secret.

### Smart Contract

- Thiết kế state machine trước khi viết hàm.
- Phân tích access control, state transition, input validation, external calls, reentrancy, DoS và business logic.
- Áp dụng Checks-Effects-Interactions; compiler warnings phải được xử lý hoặc giải trình.
- Ưu tiên thư viện đã được kiểm chứng như OpenZeppelin khi phù hợp; không tự viết lại primitive bảo mật.
- Test happy path, unauthorized caller, invalid transition, duplicate action, timeout, refund/release và edge cases liên quan.
- Không dùng contract upgradeability, oracle hoặc token riêng nếu chưa có yêu cầu rõ.
- Giữ framework đang dùng; chỉ đề xuất Foundry nếu chưa có framework phù hợp và Owner duyệt.

### AI Pipeline

- Mỗi pipeline step phải có input/output schema, timeout, error path và logging.
- Phân biệt dữ liệu người dùng, nguồn bên ngoài và chỉ dẫn hệ thống; chống prompt injection bằng cách coi dữ liệu nhập vào là untrusted.
- Đánh giá output bằng test set/criteria; không tuyên bố độ chính xác nếu chưa đo.
- AI chỉ gợi ý/tóm tắt/triage; không được tự ký giao dịch, thay đổi quyền, giải ngân hoặc refund.
- Có human review cho kết quả ảnh hưởng tới dispute hoặc tài sản.

### UI/UX (chỉ khi có frontend)

- Ưu tiên hierarchy rõ, typography đọc được, màu tiết chế, component nhất quán.
- Có Loading, Empty, Error, Success, Pending/Confirming states.
- Phân biệt “đã ký”, “đã gửi”, “đang xác nhận”, “đã xác nhận”, “thất bại”.
- Hiển thị chain, địa chỉ rút gọn có thể copy, token/amount/fee và nội dung giao dịch trước khi người dùng xác nhận.
- Không dùng màu sắc/animation để che trạng thái lỗi hoặc pending.
- Dùng WCAG 2.2 làm baseline accessibility; hướng tới mức AA cho giao diện MVP nếu khả thi.
- Không tạo frontend mới khi Phase 0 chưa xác nhận kiến trúc và thư mục cần thiết.

### Security

- Web/API: dùng OWASP ASVS 5.0 làm checklist kiểm chứng; OWASP Top 10:2025 làm awareness baseline.
- Smart contract: dùng OWASP Smart Contract Top 10:2025 làm threat checklist.
- Secrets: `.env` không commit; key chỉ ở local secret store; test key và mainnet key không dùng chung.
- Least privilege cho user, admin, service account và agent.
- Không cho Cowork/Antigravity chạy lệnh không hiểu rõ hoặc có tác động irreversible nếu chưa review.
- Testnet/local only; không deploy mainnet, không sử dụng tài sản thật trong vòng phát triển/demo.

### Testing & quality

- Unit test cho logic cục bộ; integration test cho ranh giới module; end-to-end test cho luồng demo trọng yếu.
- Contract test phải kiểm tra cả người dùng không có quyền và state transition không hợp lệ.
- Regression test cho bug đã sửa nếu có thể.
- Không sửa test kỳ vọng chỉ để test pass khi behavior sai.
- Không đặt mục tiêu coverage 100% máy móc; ưu tiên coverage cho luồng tiền, quyền và lỗi quan trọng.
- Báo cáo test: command, environment, result, skipped/blocked và log/error liên quan.

### Git, structure & documentation

- Một task code = một branch/worktree; không dùng chung working tree cho nhiều writer.
- Mỗi task có file ownership và explicit non-goals.
- Không thêm thư mục/file nếu không có nhu cầu đã nêu.
- Không xóa/di chuyển file, format hàng loạt hoặc cập nhật lockfile ngoài scope.
- Không commit `.venv/`, `.env`, cache, build output, key, wallet file.
- Diff nhỏ, dễ review; commit message mô tả intent.
- Cập nhật docs khi API, state machine, setup, decision hoặc behavior thay đổi.

## Khi quy tắc mâu thuẫn với hiện trạng code

Không tự sửa toàn bộ code để “đúng chuẩn”. Hãy báo discrepancy, nêu rủi ro, ước lượng tác động và đề xuất một task migration riêng. Project Owner duyệt trước khi thay đổi lớn.
