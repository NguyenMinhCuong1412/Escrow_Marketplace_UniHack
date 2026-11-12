---
trigger: always_on
description: "Use when adding/running tests, validating changes, reviewing regressions, or defining quality gates."
---

# Testing Rules

- Dùng test runner hiện có của repository: Foundry cho `contracts/`, `pytest` cho Python, `npm` cho `frontend/`. Không thêm framework thứ hai nếu chưa được phê duyệt.
- Cấu trúc rủi ro (Risk Tiers) theo `docs/agent-ops/TEST_MATRIX.md`:
  - **P0** (Critical): Tiền, phân quyền, state transitions on-chain (`contracts/`, integration backend-anvil).
  - **P1** (High): Quyết định AI, xác thực auth, luồng gọi `attest`, parity giữa các module.
  - **P2** (Medium/Low): Giao diện người dùng (build/typecheck frontend) và tài liệu quy trình.

## Standard Skip Policy (văn bản chuẩn)
Chạy pytest với `-rs`. Report phải dán dòng tổng kết `N passed, M failed, K skipped`. Test bị skip trong suite bắt buộc của module bị chạm ⇒ task `BLOCKED`, không được báo PASS.

## Báo Cáo Kết Quả Kiểm Thử
- Báo cáo phải ghi rõ: câu lệnh thực thi, môi trường chạy, kết quả từng suite, dòng tổng kết có số lượng passed/failed/skipped, và hạn chế đã biết.
- Số lượng test chỉ được trích xuất từ output lần chạy gần nhất có trong report; không ghi cứng số lượng test trong rules hoặc tài liệu quy trình.
- Không sửa giá trị kỳ vọng (expected output) chỉ để làm test pass.
- Báo cáo trạng thái theo: `PASS` / `FAIL` / `BLOCKED` / `NOT RUN`.