---
name: qa-review
description: Independently reviews a task diff and test evidence against acceptance criteria, including scope IN/OUT, rerun policy, skip policy, AI authority boundary, and security edge cases.
---

# QA Review Skill

## Authority & Precedence

Nguồn thẩm quyền duy nhất cho quy trình đánh giá chất lượng (QA Review) độc lập trên toàn bộ dự án Escrow Marketplace (C-14, AC-12, QA-01, QA-04, MR-13). Mọi prompt, tài liệu hướng dẫn hoặc agent review đều phải tuân thủ nghiêm ngặt quy trình trong skill này.

## Use when

Khi một task chuyển sang trạng thái `IN_REVIEW` hoặc khi Project Owner / Cowork yêu cầu đánh giá nghiệm thu độc lập trước khi merge PR.

## Role Boundary

- Reviewer (Cowork hoặc agent QA độc lập) **tuyệt đối không tự sửa application code** trong khi thực hiện review (AGENTS §2a).
- Tuyệt đối không chấp nhận task chỉ dựa vào lời agent tự báo "done", "all pass" hoặc ảnh chụp/log không thể kiểm chứng lại độc lập.

## 4 Verdicts

1. `ACCEPT`:
   - Toàn bộ tiêu chí trong Acceptance Criteria đạt với bằng chứng cụ thể.
   - 100% file thay đổi nằm trong phạm vi cho phép (`[IN]`).
   - Reviewer đã tự chạy lại build và test suite bắt buộc với kết quả 100% pass và `skipped=0`.
   - Không còn lỗi Critical hoặc High nào chưa giải quyết.
2. `ACCEPT WITH LIMITATIONS`:
   - Đạt phần lớn AC và logic an toàn, nhưng reviewer không thể tự rerun toàn bộ test suite do hạn chế môi trường (ví dụ thiếu Anvil hoặc Tesseract trong máy review); hoặc phát hiện sai lệch nhỏ/Medium không ảnh hưởng tới luồng chính.
   - BẮT BUỘC: Phải ghi rõ Known Limitations trong report và tạo task follow-up bắt buộc phải giải quyết trước Release Gate.
3. `CHANGES_REQUESTED`:
   - Phát hiện ít nhất một file thay đổi nằm ngoài phạm vi cho phép (`[OUT]`).
   - Có tiêu chí AC chưa đạt hoặc bằng chứng không đầy đủ.
   - Test thất bại hoặc vi phạm skip policy.
   - Phát hiện lỗi Critical, High, hoặc Medium cần khắc phục trước khi merge.
4. `BLOCKED`:
   - Task bị chặn do thiếu quyết định nghiệp vụ của Owner (Q1–Q12).
   - Thiếu môi trường hoặc dependency quan trọng không thể tiến hành review.
   - Xung đột quyền sở hữu file (vi phạm bảng Active ownership trên `docs/agent-ops/MASTER_DISPATCH.md`).

## Mandatory Rerun Policy

- **Quy tắc bắt buộc**: Verdict `ACCEPT` chỉ được đưa ra khi reviewer đã độc lập tự chạy lại lệnh build và suite kiểm thử bắt buộc đối với tất cả module bị chạm (theo `docs/agent-ops/TEST_MATRIX.md`).
- **Báo cáo rerun**: Trong QA report, reviewer bắt buộc phải đưa vào mục `### Commands rerun by reviewer` với cú pháp lệnh chính xác, môi trường thực thi và dòng tổng kết kết quả (`N passed, M failed, K skipped`).
- **Hạn chế rerun**: Nếu reviewer không thể tự chạy lại kiểm thử vì lý do môi trường: verdict tối đa là `ACCEPT WITH LIMITATIONS`, kèm theo lý do cụ thể và yêu cầu rerun ở bước Release Gate.

## Scope & Diff Verification (IN/OUT Check)

Reviewer bắt buộc phải kiểm tra phạm vi thay đổi bằng Git:
1. Chạy lệnh: `git diff --name-only <base>...<head>`.
2. Lập bảng đối chiếu từng file trong diff với danh sách Allowed Files trong Task Specification:
   ```markdown
   | File | In Scope? | Status | Ghi chú |
   |---|---|---|---|
   | backend/service.py | Có | [IN] | Sửa logic đúng spec |
   | contracts/Escrow.sol | Không | [OUT] | VI PHẠM SCOPE |
   ```
3. **Quy tắc OUT**: Nếu xuất hiện bất kỳ file nào có trạng thái `[OUT]` (kể cả file cấu hình, định dạng, whitespace, hoặc sửa lỗi ngoài phạm vi) ⇒ lập tức trả về verdict `CHANGES_REQUESTED`.

## Severity Scale

Phân loại lỗi theo Audit mục 6:
- **Critical**:
  - Nguy cơ thất thoát, chiếm đoạt hoặc khóa tiền/cọc vĩnh viễn trên smart contract.
  - AI Agent thực hiện giao dịch chuyển tài sản trái phép trên escrow (vi phạm `55-ai-authority.md`).
  - Slide/video/pitch tuyên bố sai lệch nghiêm trọng về chức năng cốt lõi của hệ thống.
- **High**:
  - AI Agent đưa ra quyết định sai hoặc BLOCK luồng giao dịch chính của người dùng.
  - Lỗ hổng bảo mật có thể khai thác được (auth fail-open, bypass API key, SSRF, injection).
  - Phá vỡ tính tương thích giữa các module (lệch ABI, lệch format bản tin).
- **Medium**:
  - Sai lệch có giới hạn so với Business Requirements hoặc Task Specification.
  - Thiếu tính tương đồng (parity) giữa Python và TypeScript.
  - Thiếu xử lý lỗi chuẩn (error model) hoặc thiếu validation dữ liệu đầu vào.
- **Low**:
  - Vấn đề vệ sinh mã nguồn (code hygiene), định dạng, chú thích thừa hoặc lỗi thời.
  - Sai sót nhỏ trong tài liệu không ảnh hưởng tới vận hành hệ thống.

## Core Review Checklists

### 1. Acceptance Criteria & Evidence
- Đối chiếu từng dòng trong bảng AC 5 cột của Task Spec (`TASK_TEMPLATE.md`): `ID | Tiêu chí | Traces | Verification method | Evidence artifact`.
- Xác minh bằng chứng thực tế trong task report: câu lệnh, output, commit hash. Không chấp nhận tuyên bố cảm tính.

### 2. Skip Policy Check (`.agents/rules/80-testing.md`)
- Kiểm tra toàn bộ kết quả kiểm thử pytest xem có chạy với `-rs` không.
- Đối chiếu dòng tổng kết `N passed, M failed, K skipped`.
- Nếu có bất kỳ test nào bị skip trong suite bắt buộc của module bị chạm ⇒ đánh giá `BLOCKED` hoặc `CHANGES_REQUESTED`. Không được báo PASS khi có test bị skip.

### 3. AI Authority Boundary Check (`.agents/rules/55-ai-authority.md`)
Áp dụng bắt buộc khi task tác động tới `contracts/src/**`, `backend/attest_service.py`, `backend/auto_agent.py`, hoặc `backend/chain.py`:
- [ ] AI Agent chỉ ký và gửi **duy nhất** giao dịch `attest(tradeId, riskScore, flagged, reportHash)`.
- [ ] AI Agent tuyệt đối không gọi các giao dịch: `resolveClean`, `resolveDispute`, `fileComplaint`, `cancel*`, `withdraw`, `setAgent`, `deposit`, `submitEvidence`, `createTrade`.
- [ ] Dữ liệu đầu vào của `attest` phải được neo on-chain (`evidenceHash`) hoặc ảnh niêm yết có chữ ký seller trong `UriRegistry` (DEC-016). Không dùng dữ liệu client gửi trực tiếp.
- [ ] AI Agent không tự chỉ định bên vi phạm hoặc đề xuất kết quả giải quyết tranh chấp.

### 4. Smart Contract Checks (`.agents/rules/40-smart-contract.md`)
- Kiểm tra quyền hạn của `owner` và `agent`, đối chiếu `55-ai-authority.md`.
- Kiểm tra tính liveness (mọi trạng thái đều có lối thoát hợp lệ).
- Bắt buộc có kiểm thử fuzz và invariant khi thay đổi logic tài chính hoặc trạng thái.

### 5. Security & Dangerous Toggles (`.agents/rules/70-security.md`)
- Trên chain 43113 (Fuji), các toggle nguy hiểm phải TẮT hoàn toàn: `ALLOW_LOCAL_HOSTS=false`, `ENFORCE_EVIDENCE_HASH=true`, `ATTEST_API_KEY` present/fail-closed, mock IPFS tắt.
- Kiểm tra không để lộ private keys, tokens, mật khẩu hoặc giá trị `.env`.
- Chuỗi ký và hiển thị phải dùng thương hiệu chính thức "Escrow Marketplace" (DEC-017).

### 6. Line Endings on Windows (`.agents/rules/90-git-docs.md`)
- Kiểm tra `git diff --check`.
- Đối chiếu `git diff --stat` với `git diff --ignore-cr-at-eol --stat` để xác nhận không commit thay đổi rác do CRLF.

## Output

Báo cáo kết quả review độc lập phải được lưu tại:
`docs/agent-ops/reports/<TASK_ID>-qa-report.md`
