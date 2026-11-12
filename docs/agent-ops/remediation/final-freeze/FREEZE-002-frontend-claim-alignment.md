# Task Specification — FREEZE-002

## Metadata

- **Task ID:** `FREEZE-002`
- **Title:** Sửa chuỗi hiển thị trên frontend cho khớp mô hình "escrow chỉ giữ cọc" và "tranh chấp do trọng tài"
- **Priority:** P1
- **Status:** READY (sau khi FZ-01 xong và OD-01/OD-02 được ghi thành DEC theo OD-13)
- **Deploy authorized:** No
- **Risk tier:** P2 (chỉ đổi UI copy, không đổi logic)
- **Requested by:** Cowork (Final Pre-Freeze Audit, finding FZ-03)
- **Assigned role:** Frontend Engineer
- **Branch/worktree:** `freeze/002-frontend-claims`, tạo từ `main` sau khi ESC-080 merge
- **Related decision:** OD-01 = A ("chỉ giữ cọc, sửa câu chữ, không đổi contract"); OD-02 = A ("AI xử lý luồng sạch, tranh chấp do trọng tài"). Đây là phần **code** của TASK-008; phần docs và slide vẫn thuộc TASK-007/008

## Context

`Escrow.sol` chỉ nhận cọc (`L136`, `L159-180`) và chỉ hoàn hoặc phạt cọc (`L338-345`, `L262-291`). Tiền hàng thanh toán ngoài chuỗi. Các chuỗi UI sau nói sai mô hình (kiểm chứng tại `5b02f5b`):

| File:dòng | Chuỗi hiện tại (rút gọn) | Vấn đề |
|---|---|---|
| `frontend/app/trade/[id]/page.tsx:L157-158` | "Đang ký giải ngân giao dịch…", "Giải ngân thành công! Tiền hàng và cọc đã được chuyển." | Contract không chuyển tiền hàng |
| `frontend/app/trade/[id]/page.tsx:L646` | "Giải ngân thanh toán & Hoàn cọc (Resolve Clean)" | Không có thanh toán |
| `frontend/app/trade/[id]/page.tsx:L675` | "Tiền hàng và tiền cọc đã được giải ngân…" | Sai |
| `frontend/app/page.tsx:L40`, `L45`, `L96` | "không cần trung gian", "hợp đồng tự giải ngân", "AI kiểm tra & giải ngân" | Trái OD-01/OD-02 |
| `frontend/app/layout.tsx:L10` | metadata description như trên | Như trên |
| `frontend/components/TradeTimeline.tsx:L21` | "Giải ngân & Hoàn tất" | Nên ghi "Hoàn cọc & Hoàn tất" |
| `frontend/components/PendingWithdrawalBanner.tsx:L69` | "…hoàn cọc hoặc giải ngân" | Nên ghi "hoàn cọc hoặc tiền bồi thường (phạt)" |
| `frontend/app/admin/page.tsx:L289`, `L591` | "giải ngân phán quyết", "đã được giải ngân" | Nên ghi "thực thi phán quyết", "đã hoàn/phân bổ cọc" |

## Goal

Mọi chuỗi người dùng nhìn thấy đều mô tả đúng ba điểm:

1. Escrow giữ **cọc hai bên**; tiền hàng thanh toán ngoài chuỗi.
2. Luồng sạch **hoàn cọc**: AI ghi nhận kết quả bằng `attest`, `DISPUTE_WINDOW` đã kết thúc, giao dịch không bị gắn cờ, không có khiếu nại (trạng thái vẫn là `Attested`), và bất kỳ địa chỉ nào cũng có thể gọi `resolveClean`.
3. Tranh chấp do **trọng tài (owner hợp đồng)** xử lý.

Câu chữ cụ thể do agent đề xuất trong report, giọng văn giữ nguyên, tiếng Việt.

## Scope – allowed files/paths

Chỉ được sửa **literal chuỗi** (text JSX, toast, metadata) trong:

- `frontend/app/page.tsx`
- `frontend/app/layout.tsx`
- `frontend/app/trade/[id]/page.tsx`
- `frontend/app/admin/page.tsx`
- `frontend/components/TradeTimeline.tsx`
- `frontend/components/PendingWithdrawalBanner.tsx`
- `docs/agent-ops/reports/FREEZE-002-report.md` (tạo mới)
- `docs/agent-ops/remediation/final-freeze/FREEZE-002-frontend-claim-alignment.md` (cập nhật Goal, Scope và Change Log theo phê duyệt của Project Owner trong quá trình remediation N-01/N-02)

## Out of scope – do not edit

- Mọi logic, hook, ABI, gọi contract, cấu trúc component, className, các file khác.
- `contracts/`, `backend/`, `ai-pipeline/`, `docs/context/`, `docs/specs/`, README (thuộc TASK-007/008 sau freeze).
- Không thêm câu cảnh báo privacy (OD-05 thuộc TASK-002).
- Không thêm dependency.

## Dependencies

- FZ-01 xong (ESC-080 đã merge; `trade/new/page.tsx` và `layout.tsx` đã bị ESC-080 chạm).
- OD-13: OD-01/OD-02 được ghi thành DEC chính thức.
- Chạy song song được với FREEZE-001.

## Acceptance Criteria

| ID | Tiêu chí | Traces | Verification method | Evidence artifact |
|---|---|---|---|---|
| AC-01 | Không còn chuỗi khẳng định chuyển hay giải ngân **tiền hàng** | OD-01 | `git grep -n -i "tiền hàng" -- frontend/app frontend/components` → chỉ còn câu nói rõ "thanh toán ngoài chuỗi" (nếu có) | Output grep |
| AC-02 | Không còn "giải ngân" trong `frontend/app` và `frontend/components` | OD-01 | `git grep -n -i "giải ngân" -- frontend/app frontend/components` → rỗng | Output grep |
| AC-03 | Không còn "không cần trung gian" và "Trustless" trong UI | OD-02 | `git grep -n -i -e "không cần trung gian" -e "trustless" -- frontend/app frontend/components` → rỗng | Output grep |
| AC-04 | Trang chủ và metadata nêu rõ: cọc hai bên, AI xử lý luồng sạch, tranh chấp do trọng tài | OD-01/02 | Đọc diff | Diff |
| AC-05 | Diff chỉ đổi literal chuỗi, không đổi logic | Scope | `git diff main...HEAD -- frontend` để reviewer đọc | Diff |
| AC-06 | `npx tsc --noEmit` và `npm run build` pass | TEST_MATRIX `frontend/` | Lệnh | Output |
| AC-07 | `git diff --name-only main...HEAD` ⊆ Scope | Rule 90 | Lệnh | Output |

## Test Requirements

- **TEST_MATRIX rows applied:** `frontend/` P2 (build + type check).
- **Unit / Integration:** không có (repo chưa có test runner TS theo OD-08).
- **Regression:** `tsc`, `next build`; reviewer xem nhanh `/`, `/trade/[id]` và `/admin` trên anvil hoặc Fuji.
- **Security review required?** No, vì task không chạm `app/api/**`, env hay `backend`.

## Implementation constraints

- Chỉ đổi text; giữ nguyên key, điều kiện render và tên hàm.
- Liệt kê từng chuỗi cũ → mới trong report để Owner duyệt câu chữ.
- Đọc `.agents/rules/60-ui-ux.md`, `90-git-docs.md`.

## Verification commands

```powershell
cd frontend; npx tsc --noEmit -p .; npm run build
git grep -n -i -e "giải ngân" -e "tiền hàng" -e "không cần trung gian" -e "trustless" -- frontend/app frontend/components
git diff --name-only main...HEAD
```

## Regression risks

- Sửa nhầm logic trong JSX: giảm thiểu bằng AC-05 (reviewer đọc diff).
- Chuỗi trong toast trùng regex của `lib/errors.ts`: không áp dụng, vì `errors.ts` không nằm trong scope và chỉ match lỗi contract.

**Rollback:** revert branch.

## Deliverables

- Bảng chuỗi cũ → mới, output lệnh.
- **Known violations touched:** PC-02, PC-03 (phần UI).
- **Docs cần sync:** README, `PRODUCT_VISION.md`, `SLIDE_AND_VIDEO_SCRIPT.md` (TASK-007/008).

## Review outcome

- **Reviewer:** Cowork (`qa-review`)
- **Result:** —

## Change Log

- **2026-11-12 (Project Owner Approved):**
  - Cập nhật Goal mục 2 để ghi nhận đầy đủ 4 điều kiện của `resolveClean`: AI `attest`, `DISPUTE_WINDOW` kết thúc, `!flagged`, và không có khiếu nại (trạng thái vẫn là `Attested`).
  - Bổ sung chính file Task Spec này vào Scope được phép sửa nhằm đáp ứng yêu cầu quản trị của Project Owner và giải quyết dứt điểm các phát hiện N-01, N-02 từ đợt Re-QA Round 3 của Cowork.
