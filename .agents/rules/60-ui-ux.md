---
trigger: model_decision
description: "Use when designing, implementing, or reviewing frontend components and user-facing interactions."
---

# UI/UX Rules

- Frontend: `frontend/` (Next.js 14, wagmi/viem). Không tạo frontend thứ hai.
- Có đầy đủ các trạng thái: Loading, Empty, Error, Success, Pending/Confirming và Rejected.
- Với blockchain transaction, phân biệt: wallet signature, transaction submitted, pending, confirmed và failed; không giả vờ thành công trước khi có confirmation.
- Trước khi gửi giao dịch: hiển thị rõ chain, token, amount, fee, recipient/contract và gọi `simulateContract` trước `writeContract` (theo `docs/specs/FRONTEND_SPEC.md`).
- **Tên hiển thị & thương hiệu**: Sử dụng tên chính thức "Escrow Marketplace" theo `.agents/rules/70-security.md`.

## 5 Kiểm Tra Đo Được (Measurable Accessibility & Responsive)
1. **Contrast**: Tương phản màu text thường ≥ 4.5:1 (text lớn ≥ 3:1) theo WCAG 2.1 AA.
2. **Focus**: Focus indicator nhìn thấy rõ ràng trên mọi interactive element.
3. **Labels**: Mọi trường input phải có semantic `<label>` hoặc `aria-label` tương ứng.
4. **Keyboard**: Hoàn thành toàn bộ luồng giao dịch chính chỉ bằng bàn phím.
5. **Responsive**: Viewport 375px hiển thị đầy đủ, không xuất hiện cuộn ngang (horizontal scroll).

## Build & Quality Verification
- Thay đổi frontend bắt buộc pass `npm run build` và `npx tsc --noEmit` trong thư mục `frontend/`.
- Lint chỉ bắt buộc khi ESLint đã được cài đặt (chờ Owner Q12); không được ghi "0 lỗi ESLint" khi chưa chạy lint thực tế.