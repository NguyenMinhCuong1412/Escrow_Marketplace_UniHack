# TASK-006 — AI pipeline: harness đánh giá định lượng (confusion matrix) trên bộ ảnh/video thật có nhãn

## 1. Task Metadata

| Trường | Giá trị |
|---|---|
| Task ID | `TASK-006` |
| Title | AI evaluation harness |
| Priority | **P2** (phục vụ Technical 25% và trả lời câu hỏi giám khảo về tỉ lệ flag nhầm) |
| Affected module | `ai-pipeline/` (thư mục con mới `eval/`) |
| Suggested agent role | AI/CV Engineer |
| Branch | `phase/4l-ai-eval` (từ `main` sau TASK-004 merge) |
| Dependencies | **TASK-004 merged** (đo trên pipeline đã sửa). **Bộ dữ liệu có nhãn do Owner/team cung cấp** (≥ 20 trường hợp, mục 3.2). Nếu sau 16/11 cần OD-10 (task không đổi hành vi sản phẩm, chỉ thêm công cụ) |
| Related findings | TST-06, FPA-19 ([báo cáo thẩm định](../../audit/REPORT_VALIDATION_AND_REMEDIATION_PLAN.md) §3.5) |
| Owner approval | Cần Owner **cung cấp dữ liệu** và xác nhận dữ liệu không chứa PII, hoặc được phép lưu (liên quan OD-05). Không đổi ngưỡng. `Deploy authorized: No` |
| Security review required | No (công cụ offline, không chạm đường tới `attest`) |

## 2. Problem Description

- Ngưỡng `PHASH_REUSE_THRESHOLD = 8`, `MIN_GOOD_INLIERS = 15` ([`ai-pipeline/evidence_check.py`](../../../ai-pipeline/evidence_check.py) L51-53) và ngưỡng flag 70 trong `risk_score` (L516-538) đều đặt tay.
- Repo không có số đo accuracy/FPR/FNR nào. Toàn bộ test dùng ảnh tổng hợp ([`ai-pipeline/tests/synth.py`](../../../ai-pipeline/tests/synth.py)).
- Rule 50 (ESC-090) cấm công bố số chưa đo, và yêu cầu dữ liệu đánh giá trước khi đổi ngưỡng.
- **Root cause:** RC-4. **Tác động:** không có bằng chứng định lượng cho differentiator AI khi pitch, và không có cơ sở cho các quyết định OD-06.

## 3. Expected Outcome

1. Một script CLI chạy `analyze_evidence` trên danh sách trường hợp mô tả bằng manifest (CSV hoặc JSON), **không cần chain, không cần backend**. Input của mỗi trường hợp:
   - đường dẫn listing, seller, buyer;
   - nonce hex;
   - reputation và item value (có giá trị mặc định);
   - nhãn kỳ vọng `expected_flagged` và `category`.
2. Dữ liệu tối thiểu do Owner cung cấp gồm ≥ 20 trường hợp, mỗi nhóm ≥ 3:
   - `clean`: đúng món, có nonce;
   - `missing_nonce`;
   - `reused_image`;
   - `wrong_item`;
   - `video_unbox` (buyer là video).
3. Output là một file JSON + một bảng Markdown gồm:
   - confusion matrix của `flagged` so với nhãn;
   - FPR, FNR theo tổng và theo nhóm;
   - phân bố `risk_score`;
   - số trường hợp nonce đọc được qua QR so với OCR;
   - thời gian xử lý trung bình.
4. Kết quả có thể tái lập: ghi `embedding_backend()`, các hằng số ngưỡng, commit hash, phiên bản Tesseract.
5. Đường dẫn dữ liệu truyền qua tham số. **Ảnh/video không bị commit** nếu Owner chưa xác nhận không có PII. Chỉ commit manifest mẫu (không có dữ liệu thật) và file kết quả đã ẩn đường dẫn cá nhân.

## 4. Scope

**Được sửa/tạo:**

- `ai-pipeline/eval/` (mới): script, manifest mẫu, README ngắn
- `ai-pipeline/tests/` (test cho script, dùng `synth.py`)
- `docs/agent-ops/reports/TASK-006-report.md`

**Phải đọc trước:** `evidence_check.analyze_evidence` (L624-712), `ai-pipeline/requirements.txt`, `pytest.ini`.

**Không được sửa:** `ai-pipeline/evidence_check.py` (không đổi ngưỡng/logic), `backend/`, `frontend/`, `contracts/`, `docs/context/`, `docs/specs/`; không thêm dependency (dùng thư viện đã có trong `ai-pipeline/requirements.txt`).

**Ngoài phạm vi:** đổi ngưỡng; công bố số liệu lên slide (Owner quyết sau khi xem kết quả, qua TASK-008 hoặc ESC-070).

## 5. Implementation Guidance

1. Tái sử dụng `analyze_evidence(..., known_hashes=...)`. Với nhóm `reused_image`, manifest cho phép khai báo trường hợp nguồn để nạp pHash vào `known_hashes`.
2. Đặt `with_visual=False` để chạy nhanh.
3. Lỗi đọc file (`ValueError`) được ghi thành kết quả `error`, không làm dừng cả lượt chạy.
4. Ghi rõ: kết quả trên tập nhỏ chỉ là chỉ báo, không có ý nghĩa thống kê mạnh.

## 6. Test Requirements

| Loại | Test |
|---|---|
| Unit | Parse manifest hợp lệ/thiếu trường → lỗi rõ ràng |
| Unit | Tính confusion matrix/FPR/FNR đúng trên kết quả giả lập cố định |
| Integration (offline) | Chạy script trên 4–5 trường hợp sinh bằng `synth.py` (clean, missing nonce, reused, wrong item) → file output tồn tại, nhãn khớp kỳ vọng của dữ liệu tổng hợp |
| Regression | Toàn bộ pytest |
| Chạy thật | Trên bộ dữ liệu Owner → đính kèm bảng kết quả vào report (không đường dẫn cá nhân) |

## 7. Acceptance Criteria

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-01 | Script chạy offline trên manifest mẫu tổng hợp, tạo JSON + Markdown | Lệnh + output |
| AC-02 | Unit/integration test mới pass; toàn bộ pytest pass, skip = 0 trên máy có Tesseract | Dòng tổng kết |
| AC-03 | Có kết quả chạy trên bộ dữ liệu thật ≥ 20 trường hợp, hoặc `BLOCKED` nếu chưa có dữ liệu | Bảng trong report |
| AC-04 | `evidence_check.py` không đổi | `git diff --name-only main...HEAD` |
| AC-05 | Không có ảnh/video thật bị commit khi chưa có xác nhận PII | `git diff --stat` |

## 8. Verification Commands

```bash
python -m pytest -rs ai-pipeline/tests
python ai-pipeline/eval/<script>.py --manifest <đường dẫn manifest> --out <thư mục kết quả>   # tên script do agent đặt, ghi trong report
python -m pytest -rs
git diff --name-only main...HEAD
```

## 9. Risks and Rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Lộ PII trong dữ liệu | Không commit dữ liệu thật; ẩn đường dẫn |
| Số liệu tập nhỏ bị dùng quá mức khi pitch | Report ghi rõ cỡ mẫu và giới hạn |
| Kết quả xấu | Không tự đổi ngưỡng. Đề xuất cho Owner (OD-06 / DEC mới) |

**Rollback:** xoá thư mục `ai-pipeline/eval/` (không ảnh hưởng runtime).

## 10. Required Completion Report

`docs/agent-ops/reports/TASK-006-report.md` gồm:

- File tạo
- Cách dùng
- Test thêm
- Lệnh và output
- Dòng tổng kết pytest
- Bảng kết quả (hoặc `BLOCKED: chưa có dữ liệu`)
- Cỡ mẫu và giới hạn
- Đề xuất cho Owner (không tự áp dụng)
- Sai lệch so với spec
