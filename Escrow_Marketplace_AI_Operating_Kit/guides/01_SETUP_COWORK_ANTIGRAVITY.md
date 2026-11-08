# Bước 1 – Thiết lập Claude Cowork và Antigravity trên cùng dự án

## Mục tiêu

Sau bước này, cả Cowork và Antigravity đều làm việc trên **cùng một thư mục Escrow Marketplace**, nhưng mỗi ứng dụng giữ đúng vai trò. Cowork quản lý sản phẩm/kế hoạch/nghiệm thu; Antigravity thực hiện kỹ thuật.

## A. Chuẩn bị trước

1. Đóng các phiên agent đang chỉnh sửa code.
2. Mở File Explorer tại thư mục dự án và xác nhận bạn đang ở thư mục gốc có `backend/`, `contracts/`, `ai-pipeline/`, `docs/`.
3. Sao lưu dự án hoặc tạo một Git commit checkpoint an toàn. Không stage cả repo một cách mù quáng; kiểm tra `.gitignore` để chắc chắn `.venv/`, `.env`, cache và secret không bị đưa vào Git.
4. Cập nhật Claude Desktop và Antigravity lên phiên bản hiện tại.
5. Giữ Claude Desktop mở trong khi Cowork cần đọc/ghi thư mục local. Khả năng local file access của Cowork phụ thuộc Desktop và folder đã được cấp quyền.

## B. Tạo Cowork Project

1. Mở Claude Desktop.
2. Đi tới **Projects** trong thanh bên, chọn nút tạo project (`+`).
3. Chọn **Use an existing folder**.
4. Trỏ tới thư mục gốc Escrow Marketplace, không chọn riêng `backend/` hay `contracts/`.
5. Đặt tên dễ nhận biết, ví dụ `Escrow Marketplace – UniHack`.
6. Nếu giao diện có phần Project instructions/Folder instructions, dán toàn bộ nội dung từ `docs/agent-ops/COWORK_PROJECT_INSTRUCTIONS.md`.
7. Thêm các tài liệu context sau vào Project context nếu giao diện yêu cầu chọn file riêng: toàn bộ `docs/context/` và `AGENTS.md`. Khi Project đã gắn local folder, Cowork vẫn cần được hướng dẫn rõ tài liệu nào là nguồn chuẩn.
8. Bật project memory nếu có tùy chọn; nhưng coi các file `docs/context/` là nguồn sự thật lâu dài, không coi memory là kho quyết định duy nhất.
9. Trong bước đầu, chọn quyền cần phê duyệt trước khi ghi file/chạy lệnh. Không cấp quyền rộng hơn mức cần thiết.

### Điều cần hiểu về Cowork

- Cowork Projects có context, instructions và memory riêng cho project.
- Cowork có thể phối hợp nhiều sub-agent song song trong một số task phức tạp; đây là khả năng điều phối nội bộ của Cowork, không đồng nghĩa nó đang điều khiển Agent Manager của Antigravity.
- Không mặc định mọi chat cũ tự động được đưa vào Project context. Làm theo Bước 2 để trích xuất chúng thành file.
- Nếu bạn dùng giao diện Claude mới, tên nút/menu có thể khác; tìm phần Projects, project instructions và local folder access.

## C. Tạo Antigravity Project

1. Mở Antigravity App (hoặc Antigravity IDE nếu đó là surface bạn đang sử dụng).
2. Chọn **New Project**.
3. Chọn **Add Folder** và thêm đúng thư mục gốc Escrow Marketplace. Không mở một bản copy khác.
4. Tạo Project.
5. Mở Customizations/Rules và xác nhận Antigravity nhận diện `AGENTS.md` cùng `.agents/rules/*.md`.
6. Xác nhận các Skills trong `.agents/skills/` được phát hiện. Skill chỉ chứa quy trình theo yêu cầu; không thay thế quy tắc cốt lõi.
7. Đặt quyền trên Windows ở chế độ yêu cầu review/approval cho terminal và thao tác ngoài workspace. Không chọn chế độ tự động tối đa khi chưa hiểu rõ quyền.
8. Đọc `AGENTS.md` trong phiên agent mới và yêu cầu agent tóm tắt các ràng buộc chính. Nếu agent không nhận được file, xử lý cấu hình rules trước khi giao task.

## D. Thiết lập Git để chạy agent song song

Antigravity có Local mode và New Worktree mode. New Worktree tạo working tree Git riêng, phù hợp cho các task code độc lập và giảm nguy cơ agent ghi đè cùng working tree.

Mở PowerShell tại thư mục gốc và chạy kiểm tra chỉ đọc:

```powershell
git rev-parse --show-toplevel
git status --short
git branch --show-current
```

Nếu lệnh đầu báo không phải Git repository, **chưa chạy `git init` ngay**. Trước tiên xác nhận thư mục gốc, backup và kiểm tra `.gitignore`/secret. Sau khi an toàn, mới khởi tạo Git theo hướng dẫn Git chính thức.

Trước khi dùng worktree:

- Có Git repository hợp lệ.
- Working tree có checkpoint rõ ràng.
- Không có thay đổi chưa được lưu mà bạn cần giữ.
- `.venv/`, `.env`, cache, file build và credential được ignore.

## E. Quy tắc dùng Local và Worktree

| Tình huống | Chế độ |
|---|---|
| Đọc repo, audit Phase 0, không sửa code | Local, kèm chỉ thị READ-ONLY và quyền review |
| Một agent chỉnh một task nhỏ, không có agent khác sửa cùng lúc | Local có thể dùng, nhưng phải theo dõi diff |
| Nhiều agent code độc lập | New Worktree cho từng agent/task |
| QA review hoặc Security review | Read-only; worktree riêng nếu cần kiểm tra một snapshot |
| Tích hợp/merge | Chỉ integrator hoặc Project Owner, sau khi review |

**Quan trọng:** Worktree tách file system, không tự giải quyết xung đột logic. Vẫn phải phân vùng ownership: ví dụ Backend Agent chỉ sửa `backend/`, Contract Agent chỉ sửa `contracts/`.

## F. Cách tạo nhiều agent trong Antigravity

Có hai cách:

1. **Nhiều Agent conversations:** mở Agent Manager, tạo các conversation độc lập. Dùng cho vai trò cần tương tác riêng.
2. **Subagents do agent chính gọi:** giao cho Engineering Lead yêu cầu dùng subagent cho các task độc lập; chọn workspace/worktree phù hợp. Subagent khởi đầu với context riêng, vì vậy prompt phải nêu đường dẫn tài liệu cần đọc và task spec cần tuân thủ.

Không tạo 5 agent cùng sửa một file. Khởi đầu nên có 1 Engineering Lead và tối đa 3 agent thực thi song song theo ba module hiện hữu; QA/Security reviewer chạy sau hoặc trên snapshot riêng.

## G. Ranh giới Cowork ↔ Antigravity

Trong cấu hình ban đầu:

1. Cowork đọc, đánh giá, tạo backlog và Task Specification.
2. Bạn chuyển Task Specification sang Antigravity Engineering Lead.
3. Antigravity giao subtask cho các agent, code, test và trả diff/report.
4. Bạn đưa report, test evidence và summary diff về Cowork.
5. Cowork review theo acceptance criteria, yêu cầu sửa hoặc đề xuất nghiệm thu.
6. Bạn quyết định merge và cập nhật trạng thái cuối.

Không tuyên bố đã có tích hợp tự động giữa hai app. Muốn bỏ bước chuyển task thủ công sẽ cần một integration/MCP/CLI riêng, kiểm thử quyền truy cập và cơ chế bảo vệ repo trước khi triển khai.

## Hoàn thành bước 1 khi

- [ ] Cowork Project trỏ tới đúng folder local.
- [ ] Project instructions đã được dán.
- [ ] Antigravity Project trỏ tới đúng folder đó.
- [ ] `AGENTS.md`, rules và skills đã được nhận diện.
- [ ] Git status được kiểm tra; không có thay đổi cần giữ bị bỏ quên.
- [ ] Bạn hiểu cách bật New Worktree cho từng task code.
- [ ] Chưa cho agent tự ý sửa ứng dụng.
