# Bước 6 – Vòng lặp làm việc có kiểm soát

## Trạng thái task

`BACKLOG → READY → IN_PROGRESS → IN_REVIEW → CHANGES_REQUESTED → IN_PROGRESS → DONE`

Có thể chuyển sang `BLOCKED` ở bất kỳ bước nào khi thiếu quyết định, dependency hoặc môi trường. Chỉ Project Manager cập nhật trạng thái; chỉ Project Owner hoặc reviewer được ủy quyền mới chấp nhận nghiệm thu cuối.

## Quy trình chuẩn

1. **Discover:** đọc context, code, cấu hình, Git state; chưa sửa.
2. **Assess:** xác định vấn đề và bằng chứng, phân biệt requirement với assumption.
3. **Plan:** tạo backlog, dependency graph, ước lượng rủi ro và thứ tự.
4. **Approve:** Owner duyệt scope, architecture decision và task cần làm.
5. **Dispatch:** Cowork tạo Task Specification; Antigravity Engineering Lead nhận task.
6. **Implement:** agent chuyên môn làm trong branch/worktree riêng.
7. **Test:** chạy test liên quan và regression; ghi kết quả thật.
8. **Review:** QA/Security review độc lập theo tiêu chí; review diff.
9. **Fix:** task lỗi quay lại `CHANGES_REQUESTED` với finding cụ thể.
10. **Accept & integrate:** Owner/reviewer chấp nhận; integrator merge sau approval và cập nhật docs/status.

## Quality Gates

| Gate | Điều kiện đi tiếp |
|---|---|
| G0 – Context Ready | Context canonical có đủ thông tin; unknowns được liệt kê |
| G1 – Plan Approved | Scope, task, dependencies, owners và acceptance criteria được duyệt |
| G2 – Implementation | Code nằm đúng phạm vi; không có unrelated changes |
| G3 – Automated Tests | Các test bắt buộc chạy pass; chưa chạy phải ghi BLOCKED/NOT RUN |
| G4 – Independent Review | QA review diff; Security review khi có auth, assets, contracts, secrets hoặc external input |
| G5 – Integration | Không conflict; contract/API/schema tương thích; regression pass |
| G6 – Acceptance | Owner chấp nhận và tài liệu/status đã cập nhật |

## Priority và severity

### Task priority

- `P0`: blocker hoặc rủi ro có thể làm mất kiểm soát tài sản/dữ liệu; xử lý trước mọi feature.
- `P1`: luồng MVP chính bị hỏng hoặc không thể demo.
- `P2`: lỗi/chức năng quan trọng nhưng có workaround.
- `P3`: polish, tối ưu hoặc cải thiện sau MVP.

### Finding severity

- `Critical`: có thể gây unauthorized asset movement, private key exposure hoặc bypass quyền nghiêm trọng.
- `High`: ảnh hưởng đáng kể tới tài sản, phân quyền, tính toàn vẹn giao dịch hoặc dữ liệu nhạy cảm.
- `Medium`: lỗi chức năng/bảo mật cần sửa trước release tùy context.
- `Low`: vấn đề nhỏ, style, usability hoặc maintainability.

## Giới hạn vòng lặp sửa

- Tối đa **2 vòng sửa** cho cùng một finding/task mà không thay đổi nguyên nhân gốc.
- Nếu vẫn không đạt, chuyển `BLOCKED`, yêu cầu Engineering Lead phân tích root cause, cập nhật cách tiếp cận và xin Owner quyết định.
- Không để agent lặp vô hạn, tự mở rộng scope hoặc sửa đi sửa lại không có tiêu chí mới.

## Definition of Done

- Scope và non-goals được tôn trọng.
- Mọi acceptance criteria đều có bằng chứng.
- Test bắt buộc đã chạy và pass; test không chạy được ghi rõ lý do.
- Không còn finding Critical/High chưa xử lý hoặc chưa được Owner chấp nhận rủi ro bằng văn bản.
- Diff được review, không có secret hoặc file ngoài scope.
- Tài liệu API/state/config/decision được cập nhật khi có thay đổi.
- Project Owner hoặc reviewer được ủy quyền xác nhận.

## Quy tắc báo cáo test

Mỗi báo cáo phải sử dụng trạng thái:

- `PASS`: command chạy xong và kết quả đạt.
- `FAIL`: command chạy và test/check thất bại.
- `BLOCKED`: không thể chạy vì môi trường/dependency/credential thiếu.
- `NOT RUN`: chưa thực hiện.

Không dùng từ “pass” cho test được suy đoán hoặc chưa chạy.
