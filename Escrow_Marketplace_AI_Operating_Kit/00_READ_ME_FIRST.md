# Escrow Marketplace – AI Agent Operating Kit

Bộ tài liệu này thiết lập cách phối hợp **Claude Cowork + Antigravity** cho dự án Escrow Marketplace. Mục tiêu là giúp bạn làm theo từng bước, không phải đọc và cấu hình mọi thứ cùng lúc.

## Đọc theo đúng thứ tự

| Bước | Đọc file | Việc cần hoàn thành |
|---|---|---|
| 0 | File này | Hiểu cấu trúc bộ kit và cách cài vào repo |
| 1 | `guides/01_SETUP_COWORK_ANTIGRAVITY.md` | Tạo Cowork Project và Antigravity Project cùng trỏ tới một repo |
| 2 | `guides/02_IMPORT_OLD_CHATS.md` | Trích xuất ngữ cảnh từ các chat cũ, không dựa vào trí nhớ tự động |
| 3 | `guides/03_PROJECT_KNOWLEDGE_BASE.md` | Hoàn thiện tài liệu chuẩn trong `docs/context/` |
| 4 | `guides/04_AGENT_ROLES.md` | Chốt vai trò, quyền hạn và phạm vi agent |
| 5 | `guides/05_RULES_AND_STANDARDS.md` | Nạp quy tắc dự án và chuẩn kỹ thuật |
| 6 | `guides/06_WORKFLOW_AND_QA_GATES.md` | Áp dụng vòng lặp giao việc – test – review – sửa |
| 7 | `guides/07_FIRST_RUN_AND_COMMANDS.md` | Chạy kiểm tra bộ kit và bắt đầu Phase 0 |
| 8 | `guides/08_MAINTENANCE.md` | Duy trì context, rules và backlog về sau |
| 9 | `guides/09_OFFICIAL_REFERENCES.md` | Tra cứu tài liệu nguồn chính thức |

**Không chuyển sang Phase 1 (sửa code) trước khi Phase 0 hoàn thành và Project Owner duyệt báo cáo.**

## Cách đưa bộ kit vào dự án

1. Sao lưu repo hoặc tạo một Git commit checkpoint trước khi thay đổi cấu hình.
2. Giải nén nội dung ZIP vào **thư mục gốc** của Escrow Marketplace, cùng cấp với `backend/`, `contracts/`, `ai-pipeline/`, `docs/`.
3. Nếu repo đã có `AGENTS.md` hoặc `.agents/`, không ghi đè một cách mù quáng: so sánh và hợp nhất nội dung.
4. Bộ kit không thay thế hoặc ghi đè `README.md`, `CLAUDE.md`, `.gitignore`, `pytest.ini`, `requirements-dev.txt` hay code hiện tại.
5. Chạy `tools/Test-AgentKit.ps1` để kiểm tra các file hướng dẫn đã được giải nén đúng.

## Cấu trúc được thêm vào

```text
project-root/
├── AGENTS.md                         # Quy tắc cốt lõi luôn áp dụng cho Antigravity
├── 00_READ_ME_FIRST.md
├── guides/                            # Hướng dẫn theo thứ tự
├── .agents/
│   ├── rules/                         # Quy tắc chuyên môn, nạp theo ngữ cảnh
│   └── skills/                        # Quy trình lặp lại cho Antigravity
├── docs/
│   ├── context/                       # Nguồn sự thật của sản phẩm
│   │   └── inbox/                     # Ghi chú trích xuất từ chat cũ
│   └── agent-ops/                     # Prompt, task template, reports
└── tools/                             # Script kiểm tra không phá huỷ
```

## Kiến trúc vận hành đã chốt

- **Bạn:** Project Owner, người quyết định cuối cùng về phạm vi, nghiệp vụ, kiến trúc lớn và nghiệm thu.
- **Claude Cowork:** Project Manager + Product/System Analyst + Quality Gate. Cowork phân tích, lập kế hoạch, tạo task, xem xét kết quả và báo cáo. Cowork có thể tự điều phối sub-agent trong các task phức tạp, nhưng không được mặc định là nó có thể điều khiển trực tiếp Agent Manager của Antigravity.
- **Antigravity:** Engineering workspace. Một agent chính điều phối các agent chuyên môn, làm code trong Git worktree, chạy test và chuẩn bị kết quả tích hợp.
- **Giao tiếp giữa hai ứng dụng:** Ban đầu dùng quy trình human-in-the-loop: Cowork tạo Task Specification → bạn chuyển task sang Antigravity → Antigravity trả diff/test report → bạn đưa kết quả lại Cowork review. Không giả định có kết nối điều khiển trực tiếp nếu chưa thiết lập và kiểm chứng một integration riêng.

## Những quyết định kỹ thuật đã chốt và những gì chưa được phép tự suy diễn

### Đã chốt

- Giữ nguyên stack đang có; không viết lại framework chỉ vì agent thích công nghệ khác.
- `pytest.ini` và `requirements-dev.txt` cho thấy repo đã có dấu hiệu sử dụng hệ sinh thái Python/pytest. Giữ pytest làm điểm xuất phát cho test Python, nhưng phải đọc cấu hình và lệnh test thực tế trước khi chạy.
- Dùng `AGENTS.md` cho nguyên tắc ngắn, luôn áp dụng; `.agents/rules/*.md` cho quy tắc theo chuyên môn; `.agents/skills/<skill>/SKILL.md` cho quy trình nhiều bước.
- Dùng Git branch/worktree tách biệt cho công việc code song song.
- Không dùng tiền thật, private key thật hoặc triển khai mainnet trong quá trình làm MVP/demo.
- Với tích hợp Avalanche, ưu tiên testnet Fuji nếu phù hợp với yêu cầu cuộc thi và kiến trúc đã xác nhận.

### Chưa chốt – Phase 0 phải xác minh

- Backend framework, database, API style, authentication.
- Contract language/compiler/framework và phiên bản Solidity.
- AI model/provider, vector store, cách xử lý dữ liệu và quyền hạn AI.
- Frontend framework: ảnh thư mục hiện tại chưa thể hiện thư mục frontend; không tự tạo trước khi xác minh.
- Vai trò buyer/seller/arbitrator/admin, dispute policy, timeout, fee, refund, milestone và điều kiện release.
- Token thanh toán, wallet, RPC, chain deployment và cơ chế index/sync trạng thái.

## Trạng thái ban đầu

Bộ kit được xây dựng từ cấu trúc thư mục bạn cung cấp và ngữ cảnh cuộc thi/dự án đã chia sẻ. **Chưa có mã nguồn thực tế được audit trong lần tạo bộ kit này.** Vì vậy, `docs/context/` phân biệt rõ thông tin đã biết, thông tin do chủ dự án cung cấp và câu hỏi cần xác nhận.
