# Bước 8 – Duy trì hệ thống sau khi bắt đầu phát triển

## Sau mỗi task được nghiệm thu

1. Cập nhật `CURRENT_STATUS.md`.
2. Cập nhật `DECISION_LOG.md` nếu có quyết định kiến trúc/nghiệp vụ mới.
3. Cập nhật `OPEN_QUESTIONS.md` nếu xuất hiện câu hỏi mới hoặc câu hỏi đã được giải quyết.
4. Cập nhật `TECH_STACK.md` khi package/tool/version thay đổi và đã được duyệt.
5. Lưu report, test evidence và task result trong `docs/agent-ops/reports/`.
6. Chỉ ghi nhận một rule mới nếu đó là bài học lặp lại hoặc invariant thật sự; không biến một ý kiến nhất thời thành global rule.

## Hàng ngày hoặc trước mỗi phiên agent

- Đọc `CURRENT_STATUS.md` và task đang `READY`.
- Xác nhận branch/worktree đúng.
- Xem Git status trước khi giao việc.
- Nêu rõ task, file ownership, acceptance criteria và quyền thao tác.

## Khi thay đổi rules

- Sửa rule nhỏ nhất có thể.
- Dùng `model_decision` cho hướng dẫn chuyên môn dài; `always_on` chỉ cho invariant ngắn.
- Giữ các file `.agents/rules/*.md` ở đúng cấp thư mục và có frontmatter hợp lệ.
- Không tạo rule trùng lặp, mâu thuẫn với `AGENTS.md`.
- Với bài học chỉ áp dụng cho một workflow, cân nhắc đưa vào Skill thay vì rule luôn bật.

## Mỗi milestone

- Cowork cập nhật Product/Architecture/Status assessment.
- Engineering Lead chạy regression suite.
- Security Reviewer rà soát thay đổi mới.
- Owner duyệt demo flow và danh sách known limitations.
- Tạo release note ngắn: features, tests, limitations, known risks.

## Không tự động hóa quá sớm

Chỉ cân nhắc nối Cowork ↔ Antigravity qua MCP/CLI sau khi:
- Quy trình thủ công chạy ổn định qua ít nhất một vòng phát triển.
- Task schema và report schema đã thống nhất.
- Có quyền least-privilege, log, retry, timeout và cơ chế dừng.
- Có human approval trước merge, deploy, migration hoặc thao tác tài sản.
- Đã thử nghiệm trên branch/worktree test, không phải repo production.
