---
trigger: model_decision
description: "Use when editing, reviewing, testing, or deploying smart contracts and blockchain integration."
---

# Smart Contract Rules

- Trước implementation, phải có state machine và role matrix được Owner xác nhận.
- Áp dụng Checks-Effects-Interactions; xem mọi external call là boundary không tin cậy.
- Xử lý compiler warnings; giữ compiler/EVM target tương thích với network đã chọn.
- Ưu tiên common libraries như OpenZeppelin; kiểm tra đúng version và import path.
- Không thêm upgradeability/oracle/token riêng nếu không có yêu cầu.
- Không chạy mainnet/real asset deployment; không dùng private key thật.
- Quyền hạn release/refund/dispute: tuân thủ `.agents/rules/55-ai-authority.md` và BR; không tự chốt quyền.
- Deploy/redeploy: Chỉ khi Task Spec ghi `Deploy authorized: Yes`; sau feature freeze 16/11/2026 cần Owner xác nhận lại.

## Contract Review Checklist (bắt buộc khi chạm `contracts/src/**`)
1. **Centralization**: Mọi quyền của `owner`/`agent` được liệt kê trong report và khớp `55-ai-authority.md`.
2. **Liveness**: Mọi state không kết thúc có lối thoát, hoặc ghi Known Limitation trong `docs/agent-ops/RISK_REGISTER.md` (hiện: `Disputed` — chờ Owner Q4).
3. **`setAgent`**: Ghi rõ ảnh hưởng tới trade đang mở.
4. **Randomness**: `block.prevrandao` trong nonce là dự đoán được, không dùng cho bảo mật.
5. **Test**: Fuzz + invariant bắt buộc khi đổi logic tiền/trạng thái (`docs/agent-ops/TEST_MATRIX.md`).
6. **Static analysis (Slither)**: Tuỳ chọn, chỉ khi Owner duyệt cài đặt.