# TASK-004 — AI pipeline: kiểm tra tái sử dụng video unbox trên mọi keyframe có thông tin, không chỉ khung 0

## 1. Task Metadata

| Trường | Giá trị |
|---|---|
| Task ID | `TASK-004` |
| Title | Buyer video reuse check over informative keyframes |
| Priority | **P2** (P1 nếu bước tái hiện ở mục 6 xác nhận false positive) |
| Affected module | `ai-pipeline/` |
| Suggested agent role | AI/CV Engineer |
| Branch | `phase/4j-buyer-video-reuse` (từ `main`) |
| Dependencies | Không. Chạy song song được với ESC-080 vì ESC-080 không chạm `ai-pipeline/` |
| Related findings | FPA-06 (FULL audit "AI-01", đã chỉnh mô tả) — [báo cáo thẩm định](../../audit/REPORT_VALIDATION_AND_REMEDIATION_PLAN.md) §4 |
| Owner approval | Không cần, **với điều kiện** không đổi `PHASH_REUSE_THRESHOLD`, trọng số hay ngưỡng flag (rule 50/55). Nếu agent thấy cần đổi → dừng `BLOCKED`, đề xuất DEC. `Deploy authorized: No` |
| Security review required | **Yes** (thay đổi đầu vào của `flagged`) |

## 2. Problem Description

- [`ai-pipeline/evidence_check.py`](../../../ai-pipeline/evidence_check.py) L644: `buyer_hash = compute_phash(buyer_frames[0])`. Chỉ **khung đầu tiên** của video unbox được dùng để:
  - (a) so với kho pHash đã biết (`is_reused_image`, L646) → `phash_reused` (L647), một **hard flag** trong `risk_score` (L524, L534-538);
  - (b) làm pHash buyer trả về (`AnalysisResult.buyer_phash`, L613-617), được backend lưu vào kho (`backend/attest_service.py` L574).
- Identity matching (L659-663) và nonce (L668-674) đã duyệt mọi keyframe. FULL audit mô tả sai là "so seller↔buyer chỉ khung 0".
- **Rủi ro thật** (suy từ code, **chưa đo**):
  1. **False negative:** video tái sử dụng có khung đầu khác (ví dụ thêm vài giây đầu) không bị bắt.
  2. **False positive:** khung đầu ít thông tin (đen, mờ, mặt bàn đồng màu) ở các video *khác nhau* có thể cho pHash rất gần nhau. Khi đó video sau bị `phash_reused=True` → hard flag → `resolveClean` bị chặn, trade phải vào tranh chấp. Kho pHash bị "đầu độc" bởi pHash khung đầu của mọi video trước đó.
- **Root cause:** RC-4 — đặc trưng đại diện cho video được chọn tuỳ tiện, chưa được đo.

## 3. Expected Outcome

1. Phát hiện tái sử dụng cho buyer xét **mọi keyframe có thông tin**. Buyer bị coi là tái sử dụng khi có ít nhất một khung như vậy nằm trong ngưỡng hiện tại `PHASH_REUSE_THRESHOLD` (L51) so với kho.
2. Khung "ít thông tin" bị loại khỏi kiểm tra tái sử dụng theo một tiêu chí **tường minh, deterministic, có hằng số đặt tên và ghi trong report** (ví dụ độ lệch chuẩn độ sáng hoặc số cạnh tối thiểu). Agent tự chọn tiêu chí, giải thích lý do và chứng minh bằng test.
3. Nếu mọi khung đều ít thông tin: không kết luận tái sử dụng từ video, và thêm ghi chú vào `report.notes` (ví dụ "video không đủ thông tin để kiểm tra tái sử dụng"). Không tự đặt `flagged` vì lý do này.
4. `AnalysisResult.buyer_phash` vẫn là **một chuỗi** để không đổi backend (`attest_service.py` L574), lấy từ khung có thông tin đại diện. Nếu agent muốn lưu nhiều pHash vào kho thì phải dừng và đề xuất, vì đó là thay đổi `backend/`, ngoài scope.
5. `details` của report có thêm khoá mô tả kiểm tra (ví dụ số khung có thông tin, chỉ số khung trùng, khoảng cách nhỏ nhất). Các khoá hiện có giữ nguyên.
6. Ảnh buyer (không phải video) cho kết quả y hệt hiện nay.

## 4. Scope

**Được sửa:**

- `ai-pipeline/evidence_check.py` (chỉ hàm `analyze_evidence` và helper mới)
- `ai-pipeline/tests/test_evidence_check.py`, `ai-pipeline/tests/synth.py` (chỉ thêm generator nếu cần)
- `docs/agent-ops/reports/TASK-004-report.md`

**Phải đọc trước:** `risk_score` L516-538, `is_reused_image` L146-155, `extract_keyframes` L90-112, `synth.py` (`write_video` L123, `unbox_frames` L139), các test hiện có `test_buyer_video`, `test_reused_image_flagged` (test_evidence_check.py L319-336).

**Không được sửa:** `PHASH_REUSE_THRESHOLD`, `MIN_GOOD_INLIERS`, trọng số và ngưỡng 70 trong `risk_score`, logic nonce, ORB; `backend/`, `frontend/`, `contracts/`; không thêm dependency.

**Ngoài phạm vi:** đánh giá FPR/FNR trên dữ liệu thật (TASK-006); đổi QR prefix `TP1:` (FPA-04).

## 5. Implementation Guidance

1. **Bước 1 — tái hiện trước khi sửa.** Viết test tái hiện hai rủi ro bằng `synth.py`:
   - (a) hai video khác món hàng, cùng bắt đầu bằng khung đen/đồng màu; video 1 đã vào kho → kỳ vọng mới: video 2 **không** bị coi là tái sử dụng;
   - (b) video 2 chứa lại các khung (index > 0) của video 1 → kỳ vọng mới: bị coi là tái sử dụng.
   - Chạy test trên code cũ và ghi kết quả (FAIL/PASS) vào report. Nếu (a) PASS ngay trên code cũ (pHash không trùng như suy đoán), ghi rõ và hạ phần false positive thành "không tái hiện được".
2. Không tăng đáng kể thời gian chạy: pHash rẻ hơn OCR/ORB nhiều. Ghi thời gian trước/sau cho video 8 khung.
3. Giữ deterministic: cùng input cho cùng `report_hash`.

## 6. Test Requirements

**Unit** (`ai-pipeline/tests/test_evidence_check.py`):

| # | Trường hợp | Kỳ vọng sau sửa |
|---|---|---|
| U1 | Hai video khác nội dung, khung 0 cùng đồng màu; video 1 trong kho | `phash_reused == False` cho video 2 |
| U2 | Video 2 chèn khung đầu mới, các khung sau trùng video 1 | `phash_reused == True` |
| U3 | Video toàn khung đồng màu | Không kết luận tái sử dụng; có note; hàm không raise |
| U4 | Buyer là ảnh | Kết quả bằng hệt baseline (so `report_hash` với fixture cố định sinh trên code cũ) |
| U5 | Helper "khung có thông tin": biên đúng tại hằng số ngưỡng (bằng, dưới, trên) | Đúng phân loại |
| U6 | Video hỏng / 0 khung | Vẫn `ValueError` như cũ (L110-111) |

**Regression:** toàn bộ `ai-pipeline/tests` và `backend/tests` (backend gọi `analyze_evidence`). Không sửa kỳ vọng của test hiện có. Nếu một test hiện có phải đổi kỳ vọng → dừng và báo.

## 7. Acceptance Criteria

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-01 | Report có kết quả tái hiện (U1, U2 trên code cũ) | Mục "Baseline" trong report |
| AC-02 | U1–U6 pass trên code mới | pytest |
| AC-03 | Hằng số ngưỡng/trọng số rủi ro không đổi | `git diff main...HEAD -- ai-pipeline/evidence_check.py` không chạm các dòng `PHASH_REUSE_THRESHOLD`, `MIN_GOOD_INLIERS`, thân `risk_score` |
| AC-04 | `details` có khoá mới và giữ mọi khoá cũ | Test so tập khoá |
| AC-05 | Toàn bộ pytest pass, skip = 0 trên máy có Tesseract (+ anvil cho backend) | Dòng tổng kết |
| AC-06 | `git diff --name-only main...HEAD` ⊆ mục 4 | Output |

## 8. Verification Commands

```bash
python -m pytest -rs ai-pipeline/tests
python -m pytest -rs
git diff --name-only main...HEAD
```

## 9. Risks and Rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Tiêu chí "ít thông tin" loại nhầm khung có món hàng → bỏ lọt tái sử dụng | Test biên U5; ghi giá trị vào report để audit |
| `report_hash` của các trade cũ không tái tính được | Không ảnh hưởng: hash chỉ tính một lần lúc attest và đã lưu |
| Kho pHash cũ chứa pHash khung 0 | Ghi Known Limitation; không migrate dữ liệu trong task này |

**Rollback:** revert branch.

## 10. Required Completion Report

`docs/agent-ops/reports/TASK-004-report.md` gồm:

- File thay đổi
- Kết quả tái hiện baseline
- Tiêu chí "khung có thông tin" và lý do chọn
- Test thêm
- Lệnh và output
- Dòng tổng kết pytest
- Thời gian chạy trước/sau
- Test không chạy và lý do
- Hạn chế
- Sai lệch so với spec
