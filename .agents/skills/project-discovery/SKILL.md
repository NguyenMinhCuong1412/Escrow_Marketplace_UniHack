---
name: project-discovery
description: Performs a read-only discovery of the Escrow Marketplace repository, maps modules and dependencies, and prepares evidence-based assessment findings before implementation.
---

# Project Discovery Skill

## Use when

Khi người dùng yêu cầu khảo sát, tìm hiểu mã nguồn repo, đánh giá hiện trạng hệ thống, vẽ sơ đồ kiến trúc, phát hiện lỗi/khoảng trống (gaps), hoặc chuẩn bị backlog trước khi bắt đầu triển khai nhiệm vụ.

## Procedure

1. **Context Freshness Verification (`AGENTS.md §1`)**:
   - Đọc `AGENTS.md` và toàn bộ các file tài liệu nền tảng trong `docs/context/`.
   - Kiểm tra header `Verified against commit: <hash>` của từng file đối chiếu với commit `HEAD` hiện tại của repo.
   - Lập danh sách các file context bị lỗi thời (stale context files) hoặc thiếu header xác minh.
   - Đối chiếu các claim quan trọng trong context với code thực tế trên `main` theo quy tắc Precedence `AGENTS.md §0` (code trên `main` và contract đã deploy phản ánh hệ thống đang làm gì).
2. **Inspect Git Workspace Baseline**:
   - Kiểm tra `git status`, commit `HEAD`, branch hiện tại và cấu trúc repo root.
   - Kiểm tra bảng Active ownership trong `docs/agent-ops/MASTER_DISPATCH.md` để nắm rõ các task và worktree đang hoạt động.
3. **Map Repository Structure & Dependencies**:
   - Khảo sát các thư mục cốt lõi: `backend/`, `contracts/`, `ai-pipeline/`, `frontend/`, `.agents/`, `docs/`.
   - Xác định entry points, runtime, dependencies (`package.json`, `requirements*.txt`, `foundry.toml`), file cấu hình, và các dịch vụ tích hợp bên ngoài (RPC, Pinata IPFS).
   - Loại trừ `.venv`, node_modules, thư mục cache, build artifacts và không đọc/in các giá trị bí mật (.env).
4. **Identify Gaps & Mismatches**:
   - Ghi lại bằng chứng cụ thể kèm file path, số dòng, đoạn code (evidence chain).
   - Phân định rõ ràng: sự thật đã xác nhận (confirmed facts), giả định (assumptions), đề xuất (proposals), và điểm chưa rõ (unknowns).
   - Đối chiếu sự sai lệch giữa Business Requirements / Specs và Implementation thực tế trong code.
   - Đối chiếu ranh giới quyền hạn AI với `55-ai-authority.md` và các toggle nguy hiểm với `70-security.md`.
5. **Read-Only Constraint**:
   - Tuyệt đối không chỉnh sửa application code, không cài đặt dependencies mới, không migrate dữ liệu, và không thực hiện deployment.
   - Báo cáo khảo sát chỉ được ghi vào thư mục được phân quyền (state folder của agent hoặc `docs/agent-ops/reports/`).

## Output

Báo cáo khảo sát (Discovery Report) bao gồm:
- **Sơ đồ kiến trúc (Architecture Map)**: Module boundaries, data flow và các điểm tích hợp chéo.
- **Danh mục module & công cụ (Module Inventory & Toolchain)**: Ngôn ngữ, framework, và môi trường chạy.
- **Tình trạng kiểm thử (Test Status & Commands)**: Lệnh chạy kiểm thử hiện có của từng module và kết quả thực tế.
- **Stale / Unverified Context Files**: Danh sách các tài liệu context bị lệch so với commit `HEAD` hoặc thiếu header xác minh.
- **Rủi ro & Sai lệch ưu tiên (Prioritized Risks/Gaps)**: Danh sách sai lệch giữa docs và code, đối chiếu với `docs/agent-ops/RISK_REGISTER.md`.
- **Câu hỏi mở (Open Questions)**: Các vấn đề cần Project Owner ra quyết định (Q1–Q12).
- **Đề xuất Backlog**: Đề xuất các task tiếp theo kèm điều kiện tiên quyết, phạm vi file, và tiêu chí nghiệm thu sơ bộ.
