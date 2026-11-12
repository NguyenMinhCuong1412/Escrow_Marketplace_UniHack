# TASK-008 — Căn chỉnh claim sản phẩm/pitch với cơ chế contract (escrow model, trọng tài, reputation)

> **TRẠNG THÁI: BLOCKED — chờ Owner ghi OD-01, OD-02, OD-04 vào `docs/context/DECISION_LOG.md`.** Không dispatch trước khi có các DEC này. Spec viết sẵn để thực thi ngay khi có quyết định.

## 1. Task Metadata

| Trường | Giá trị |
|---|---|
| Task ID | `TASK-008` |
| Title | Pitch & product claims alignment |
| Priority | **P1** (claim sai khi pitch ảnh hưởng Technical 25%, Impact 15%, Creativity 15%; Release Gate cấm hiển thị chức năng chưa có) |
| Affected module | `docs/context/`, `docs/specs/`, `README.md`, chuỗi hiển thị trong `frontend/` |
| Suggested agent role | Docs/Product Writer (+ Frontend cho phần chuỗi UI) |
| Branch | `ops/task-008-claims` (từ `main` sau TASK-007 merge) |
| Dependencies | **OD-01, OD-02, OD-04** (Owner); **TASK-007 merged** (cùng file `BUSINESS_REQUIREMENTS.md`, `SLIDE_AND_VIDEO_SCRIPT.md`); TASK-002 merged (cùng `frontend/app/trade/[id]/page.tsx`); ESC-080 merged (cùng `frontend/components/Navbar.tsx`) |
| Related findings | PC-02, PC-03, PC-05, NEW-04, FPA-01, FPA-12 ([báo cáo thẩm định](../../audit/REPORT_VALIDATION_AND_REMEDIATION_PLAN.md) §3.2, §5, §6) |
| Owner approval | **REQUIRED — chưa có** |
| Security review required | No (chỉ chuỗi hiển thị). Nếu OD-01 = B (đổi contract), task này **không áp dụng**; cần một Task Spec contract mới |

## 2. Problem Description

- **PC-02 / OD-01:** contract chỉ giữ cọc 30% mỗi bên và hoàn lại khi sạch ([`contracts/src/Escrow.sol`](../../../contracts/src/Escrow.sol) L136, L162, L233-244, L338-345). Không có khoản tiền hàng nào chuyển cho seller. Trong khi đó chữ "giải ngân" xuất hiện ở:
  - frontend: `frontend/app/page.tsx`, `frontend/app/layout.tsx`, `frontend/app/admin/page.tsx`, `frontend/app/trade/[id]/page.tsx`, `frontend/components/PendingWithdrawalBanner.tsx`;
  - `README.md`;
  - `docs/context/` (`BUSINESS_REQUIREMENTS.md`, `PRODUCT_VISION.md`, `USER_PERSONAS.md`, `DECISION_LOG.md`);
  - `docs/specs/` (`FRONTEND_SPEC.md`, `L1_MODULE_SPEC.md`, `SLIDE_AND_VIDEO_SCRIPT.md`).
- **PC-03 / OD-02:** "Không có human arbitrator" (`docs/context/PRODUCT_VISION.md`, `docs/context/OPEN_QUESTIONS.md` L10 Q-004) trái với `owner` là trọng tài `resolveDispute` (`Escrow.sol` L22, L262).
- **PC-05 + NEW-04 / OD-04:** BR ghi "chỉ `resolveClean` mới +1". Contract còn có violator −10, victim +5 (`Escrow.sol` L282-283). Farm qua self-trade ảnh hưởng điểm rủi ro AI (`ai-pipeline/evidence_check.py` `risk_score`, reputation_term 40%).
- **Root cause:** RC-6 — claim được viết trước khi quyết định được chốt.

## 3. Expected Outcome

*(Điền chính xác theo DEC của Owner. Bên dưới là kết quả khi Owner chọn phương án khuyến nghị A cho cả ba.)*

1. **OD-01 = A:** mọi mô tả gọi đúng là "cọc ký quỹ hai chiều / hoàn cọc"; thanh toán tiền hàng ngoài chuỗi được nói rõ. "Giải ngân" chỉ còn ở ngữ cảnh đúng (ví dụ hoàn cọc), hoặc bị bỏ.
2. **OD-02 = A:** "AI tự động xử lý luồng sạch; khi AI gắn cờ hoặc có khiếu nại, trọng tài (owner hợp đồng) phân xử; roadmap: trọng tài phi tập trung". Không còn "không có human arbitrator".
3. **OD-04:** BR liệt kê đủ mọi thay đổi reputation có trong contract và Known Limitation về farm, theo DEC.
4. Chuỗi UI tiếng Việt trong frontend khớp các câu trên; không đổi logic, không đổi tên hàm/biến.

## 4. Scope

**Được sửa:**

- `docs/context/BUSINESS_REQUIREMENTS.md`, `docs/context/PRODUCT_VISION.md`, `docs/context/USER_PERSONAS.md`
- `docs/context/OPEN_QUESTIONS.md` (Q-004)
- `docs/specs/SLIDE_AND_VIDEO_SCRIPT.md`, `docs/specs/FRONTEND_SPEC.md`, `docs/specs/L1_MODULE_SPEC.md` (chỉ câu chữ liên quan)
- `README.md` (hero/mô tả)
- `frontend/app/page.tsx`, `frontend/app/layout.tsx`, `frontend/app/admin/page.tsx`, `frontend/app/trade/[id]/page.tsx`, `frontend/components/PendingWithdrawalBanner.tsx`, `frontend/components/Navbar.tsx` (**chỉ chuỗi hiển thị**)
- `docs/agent-ops/reports/TASK-008-report.md`

**Không được sửa:** `docs/context/DECISION_LOG.md` (Owner); `contracts/`, `backend/`, `ai-pipeline/`; logic frontend.

## 5. Implementation Guidance

1. Liệt kê mọi vị trí bằng `grep -rn "giải ngân\|human arbitrator\|không có trọng tài\|trustless" ...` trước khi sửa. Đưa danh sách "trước → sau" vào report.
2. Giữ câu ngắn, nhất quán giữa slide, README và UI.
3. Không thêm claim mới không có trong DEC.

## 6. Test Requirements

| Loại | Kiểm chứng |
|---|---|
| Build | `npm run build`, `npx tsc --noEmit` (chuỗi UI thay đổi) |
| Docs | Grep mục 8 |
| Thủ công | Mở các trang `/`, `/trade/[id]`, `/admin`; chụp màn hình phần chữ đã đổi |

## 7. Acceptance Criteria

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-01 | Có DEC của OD-01/02/04 trên `main` trước commit đầu tiên của task | `git log` + Decision Log |
| AC-02 | Không còn claim trái DEC (ví dụ OD-02 = A: không còn "không có human arbitrator") | grep |
| AC-03 | Mọi "giải ngân" còn lại đều đúng ngữ cảnh theo DEC (liệt kê trong report) | grep + report |
| AC-04 | Build frontend pass | Output |
| AC-05 | `git diff --name-only main...HEAD` ⊆ mục 4; diff frontend chỉ là chuỗi | Output + review |

## 8. Verification Commands

```bash
grep -rn "giải ngân" README.md docs/context docs/specs frontend/app frontend/components
grep -rni "human arbitrator\|trustless" README.md docs/context docs/specs frontend/app frontend/components
cd frontend && npm ci && npx tsc --noEmit && npm run build
git diff --name-only main...HEAD
```

## 9. Risks and Rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Sửa nhầm logic khi đổi chuỗi | Review diff chỉ trong JSX text; build + kiểm tay |
| Lệch giữa slide và video đã quay | Đồng bộ với ESC-070 (Phase 7) |

**Rollback:** revert branch.

## 10. Required Completion Report

`docs/agent-ops/reports/TASK-008-report.md` gồm:

- DEC đã áp dụng
- File thay đổi
- Bảng "trước → sau"
- Output grep và build
- Ảnh chụp UI
- Sai lệch so với spec
