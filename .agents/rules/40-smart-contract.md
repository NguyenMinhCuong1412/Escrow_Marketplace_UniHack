---
trigger: model_decision
description: "Use when editing, reviewing, testing, or deploying smart contracts and blockchain integration."
---

# Smart Contract Rules

- Trước implementation, phải có state machine và role matrix được Owner xác nhận.
- Kiểm tra access control, invalid transition, input validation, reentrancy, unchecked external calls, DoS và logic errors.
- Áp dụng Checks-Effects-Interactions; xem mọi external call là boundary không tin cậy.
- Xử lý compiler warnings; giữ compiler/EVM target tương thích với network đã chọn.
- Ưu tiên audited/common libraries như OpenZeppelin khi phù hợp; kiểm tra đúng version và import path.
- Viết test cho unauthorized caller, double release/refund, amount boundary, zero address, duplicate request, timeout và dispute cases có trong spec.
- Không thêm upgradeability/oracle/token riêng nếu không có yêu cầu.
- Không chạy mainnet/real asset deployment; không dùng private key thật.
- Không tự chốt ai có quyền release/refund/dispute.
