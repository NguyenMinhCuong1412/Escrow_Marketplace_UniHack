# PROMPT – FINAL ACCEPTANCE / DEMO RELEASE GATE

Đánh giá bản build/demo Escrow Marketplace theo các điều kiện sau. Không thực hiện deployment hoặc giao dịch thật.

## Product

- Luồng demo phù hợp yêu cầu đã xác nhận.
- Buyer/Seller journey, escrow state, release/refund/dispute được giải thích rõ.
- Không hiển thị chức năng chưa implement như thể đã hoạt động.

## Engineering

- Backend, contract, AI pipeline và frontend (nếu có) tương thích.
- Config/environment được mô tả; không lộ secret.
- Test quan trọng pass; mọi NOT RUN/BLOCKED được ghi rõ.
- Build/demo steps có thể lặp lại.

## Security

- Không dùng mainnet/real funds.
- Không có secret trong repo/artifacts.
- Access control, state transitions, transaction confirmation và error handling đã review.
- AI không có quyền tự quyết định chuyển tài sản.
- Critical/High findings đã được xử lý hoặc Owner ghi nhận rủi ro và quyết định không phát hành.

## Demo reliability

- Có happy path end-to-end.
- Có ít nhất một failure/edge path phù hợp.
- Hiển thị pending/confirmed/failed chính xác.
- Có fallback khi RPC/wallet/service không khả dụng nếu phù hợp.

## Kết quả

Chỉ trả một trong: `ACCEPT FOR DEMO`, `ACCEPT WITH KNOWN LIMITATIONS`, `REJECT/BLOCKED`. Liệt kê evidence, known limitations, test status, owner decisions và bước tiếp theo. Không khẳng định production-ready hoặc security-audited nếu không có audit độc lập tương ứng.
