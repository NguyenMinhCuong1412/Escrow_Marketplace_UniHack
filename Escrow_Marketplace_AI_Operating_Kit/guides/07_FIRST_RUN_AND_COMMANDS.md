# Bước 7 – Chạy kiểm tra và khởi động Phase 0

## Thứ tự chạy

### 1. Giải nén bộ kit

Giải nén vào thư mục gốc Escrow Marketplace. Kiểm tra có các mục `AGENTS.md`, `guides/`, `.agents/`, `docs/context/`, `docs/agent-ops/`, `tools/`.

### 2. Chạy kiểm tra bộ kit (không sửa code)

Mở PowerShell tại thư mục gốc:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\Test-AgentKit.ps1
```

Script chỉ kiểm tra file/folder của bộ kit; không cài package, không sửa code và không chạy test ứng dụng.

### 3. Chạy project preflight (chỉ đọc)

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\Preflight-ReadOnly.ps1
```

Script kiểm tra Git state, branch, các folder/module hiện có, Python/pytest availability và dấu hiệu `.venv` được ignore. Không in giá trị secret.

### 4. Hoàn tất Bước 1–3

- Cowork Project và Antigravity Project cùng trỏ tới một folder.
- Đã trích xuất chat cũ.
- Đã review và hoàn thiện context canonical.
- `OPEN_QUESTIONS.md` liệt kê rõ những điều Owner cần quyết định.

### 5. Chạy Phase 0 trên Cowork

Mở `docs/agent-ops/PHASE_0_DISCOVERY_PROMPT.md`, copy toàn bộ prompt vào Cowork Project.

Cho phép Cowork:
- Đọc source, config, docs và Git status.
- Dùng sub-agent nội bộ để audit độc lập nếu có lợi.
- Tạo report mới trong `docs/agent-ops/reports/`.

Không cho phép:
- Sửa application code.
- Cài/nâng cấp package.
- Chạy migration/deploy.
- Xóa/di chuyển file hiện hữu.
- Sửa configuration hoặc lockfile.

### 6. Review report trước khi giao code

Đọc `PROJECT_ASSESSMENT.md`, `BACKLOG.md` và `OWNER_DECISIONS_REQUIRED.md`. Bạn quyết định:
- Giữ hay thay đổi architecture.
- MVP scope nào được ưu tiên.
- Tech stack nào được giữ.
- Task nào được đưa sang `READY`.

### 7. Chuyển task đầu tiên sang Antigravity

Dùng `docs/agent-ops/TASK_TEMPLATE.md` tạo task cụ thể. Mở Antigravity Engineering Lead, dùng **New Worktree** cho task implementation, dán task và yêu cầu agent đọc context/rules.

### 8. Kiểm thử task đầu tiên

- Agent triển khai và báo cáo diff.
- QA chạy test đã xác định.
- Security review nếu có ảnh hưởng tới auth, assets, contract, transaction hoặc external input.
- Gửi báo cáo về Cowork bằng `QA_REVIEW_PROMPT.md`.
- Chỉ merge khi G3–G6 đạt.

## Lệnh Git nên biết

```powershell
# Kiểm tra đang ở đúng repo
git rev-parse --show-toplevel

# Xem thay đổi chưa commit
git status --short

# Xem branch hiện tại
git branch --show-current

# Xem các worktree
git worktree list
```

Không chạy `git reset --hard`, `git clean -fd`, `git checkout -- .`, force-push hoặc xóa worktree có thay đổi chưa kiểm tra.

## Khi nào chạy pytest?

Repo có `pytest.ini` và `requirements-dev.txt`, nhưng chưa audit nội dung. Sau khi Phase 0 xác nhận môi trường/test commands, dùng lệnh trong report. Thường có thể là:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Chỉ chạy nếu `.venv` hợp lệ và các dependency đã có; không tự `pip install -r requirements-dev.txt` trước khi review package và version. Nếu test command trong repo khác, ưu tiên command chính thức của dự án.
