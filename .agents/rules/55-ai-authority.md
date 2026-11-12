---
trigger: always_on
description: "Định nghĩa duy nhất về quyền hạn của AI Agent trên escrow. Áp dụng cho mọi task."
---

# AI Authority Boundary

Nguồn: DEC-013, DEC-014, DEC-016. Đây là định nghĩa duy nhất; các file khác chỉ tham chiếu file này.

## AI Agent được phép
- Đọc state on-chain, tải bằng chứng, tính điểm rủi ro, công bố report có hash khớp `reportHash`.
- Ký và gửi **duy nhất** `attest(tradeId, riskScore, flagged, reportHash)` bằng ví agent (`onlyAgent`), tối đa một lần mỗi trade, khi trade ở `AwaitingEvidence` và đủ bằng chứng.

## Hệ quả của attest (contract quyết định, không phải AI)
- `flagged=false` và không ai khiếu nại trong `DISPUTE_WINDOW` → bất kỳ ai gọi `resolveClean` → hoàn cọc hai bên. Đây là hành vi CONFIRMED, không phải vi phạm rule.
- `flagged=true` không tự phạt ai; tranh chấp do trọng tài xử lý qua `resolveDispute` (`onlyOwner`).
- Mọi bên phản bác được bằng `fileComplaint` trong `DISPUTE_WINDOW` (production theo DEC-008; bản Fuji demo theo `contracts/deployments/43113.json`).

## AI Agent không được
- Gửi bất kỳ giao dịch nào khác `attest` (gồm `resolveClean`, `resolveDispute`, `fileComplaint`, `cancel*`, `withdraw`, `setAgent`, `deposit`, `submitEvidence`, `createTrade`) hoặc dùng ví agent cho mục đích khác.
- Dùng input chưa được neo. Mọi input ảnh hưởng `attest` phải là (a) bằng chứng có hash khớp on-chain, hoặc (b) ảnh niêm yết có chữ ký ví seller trong `UriRegistry`. Giá trị client gửi kèm request không thay thế được (a)/(b).
- Chỉ định bên vi phạm hoặc đề xuất kết quả `resolveDispute`.

## Thay đổi boundary
Thêm lời gọi giao dịch mới cho agent, đổi điều kiện/ngưỡng/input của `attest`, hoặc đổi cửa sổ thời gian ⇒ cần DEC mới do Owner CONFIRMED + `Security review required: Yes` + test theo `docs/agent-ops/TEST_MATRIX.md`.

## Cách kiểm chứng
- `grep -n "functions\.\w*(" backend/*.py` chỉ có lời gọi **giao dịch** `attest`; còn lại là `.call()` đọc.
- Vi phạm hiện có được theo dõi trong `docs/agent-ops/RISK_REGISTER.md` (SEC-01 → ESC-080).