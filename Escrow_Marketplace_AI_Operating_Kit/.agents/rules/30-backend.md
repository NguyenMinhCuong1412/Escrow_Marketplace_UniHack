---
trigger: model_decision
description: "Use when editing or reviewing backend services, APIs, database access, authentication, or server-side business logic."
---

# Backend Rules

- Xác minh runtime/framework/database hiện tại trước khi code; không suy ra chỉ từ tên folder.
- Tách transport/controller, business logic và data access theo conventions hiện hữu; không ép layer nếu project nhỏ không cần.
- Validate input tại boundary; authorization luôn kiểm tra phía server.
- Chuẩn hóa error model và status codes; không trả stack trace/secret cho client.
- Dùng timeout, bounded retries và idempotency khi thao tác có thể được retry hoặc gửi lặp.
- Không xem request frontend là bằng chứng transaction đã confirm.
- Không log secret, token, private data hoặc raw authorization header.
- Nếu Python/pytest đang được dùng, giữ cấu hình pytest hiện có và thêm test theo conventions repo.
