---
trigger: model_decision
description: "Use when editing or reviewing backend services, APIs, database access, authentication, or server-side business logic."
---

# Backend Rules

- Xác minh runtime/framework/database hiện tại trước khi code; không suy ra chỉ từ tên folder.
- Tách transport/controller, business logic và data access theo conventions hiện hữu.
- **Auth fail-closed**: Khi kết nối chain khác `31337` (anvil), backend phải từ chối khởi động nếu `ATTEST_API_KEY` rỗng. Proxy Next.js công khai không được coi là cơ chế xác thực người dùng.
- **Rate-limit**: Khoá theo định danh có ý nghĩa (trade/ví/IP thật qua proxy tin cậy), không theo IP của proxy.
- **Input binding**: Tuân thủ `.agents/rules/55-ai-authority.md` — không dùng giá trị client gửi thay cho dữ liệu đã neo on-chain hoặc đã ký ví.
- **Error model**: Chuẩn hóa error model và status codes; không trả `str(exception)` hay stack trace/secret cho client; trả `error_code` + thông điệp chuẩn, log chi tiết phía server.
- **Logging có thể kiểm chứng**: Log mỗi lượt verify/attest có `trade_id`, `phase`, `duration_ms`, `result`; không log secret, URL RPC chứa key, private data hoặc header auth.
- Dùng timeout, bounded retries và idempotency khi thao tác có thể được retry hoặc gửi lặp.
- Không xem request frontend là bằng chứng transaction đã confirm on-chain.
- Giữ cấu hình pytest hiện có; vi phạm hiện hữu (SEC-02, SE-05) được theo dõi trong `docs/agent-ops/RISK_REGISTER.md`.