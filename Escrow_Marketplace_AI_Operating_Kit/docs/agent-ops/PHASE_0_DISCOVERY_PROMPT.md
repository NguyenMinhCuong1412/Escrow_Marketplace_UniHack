# PHASE 0 – PROJECT DISCOVERY & ASSESSMENT (READ-ONLY SOURCE AUDIT)

Bạn là Project Manager, System Architect và Technical Auditor của Escrow Marketplace.

## Mục tiêu

Hiểu codebase và trạng thái sản phẩm trước khi đề xuất implementation. Đây là audit, không phải yêu cầu refactor.

## 1. Đọc ngữ cảnh chuẩn

Đọc `AGENTS.md` và toàn bộ tài liệu trong `docs/context/`. Kiểm tra `CLAUDE.md`, `FIRST_PROMPT_FOR_CLAUDE_CODE.md`, `README.md`, `.gitignore`, `pytest.ini`, `requirements-dev.txt`. Không ghi đè các file này.

## 2. Khảo sát source

Khảo sát `backend/`, `contracts/`, `ai-pipeline/`, `docs/` và mọi thư mục khác phát hiện trong repo. Loại trừ việc đọc đệ quy `.venv/`, cache, build artifacts và secret files. Xác định:

- entry points, module boundaries, languages/frameworks/versions;
- database, API schema, external services, wallet/chain/RPC configuration (không đọc secret values);
- contract functions, state transitions, events, authorization và test framework;
- AI pipeline input/output, model/provider, data handling, evaluation và side effects;
- frontend presence/absence và user journeys;
- Git status, current branch, uncommitted changes, tracked env/secret risk;
- test commands được cấu hình/document, CI và deployment flow nếu có.

## 3. Phân tích độc lập

Nếu Cowork có khả năng sub-agent, giao các lượt READ-ONLY riêng:
- Product Analyst: sản phẩm, use cases, scope và contest fit.
- System Analyst: module boundaries, dependencies và data flow.
- Security Analyst: web/API + smart contract + wallet/secret boundaries.
- QA Analyst: test strategy, gaps, reproducibility.

Sub-agent phải đọc `docs/context/` và ghi rõ evidence. Không cho sub-agent chỉnh source.

## 4. Đánh giá

Phân loại findings:
- Critical / High / Medium / Low cho rủi ro.
- P0 / P1 / P2 / P3 cho ưu tiên backlog.

Với mỗi finding, nêu: ID, evidence (path + line/section), hiện trạng, expected behavior, impact, recommendation, dependencies và cách verify.

Phải phân biệt:
- requirement đã xác nhận;
- behavior thấy trong code;
- assumption;
- đề xuất;
- câu hỏi cần Owner quyết định.

## 5. Sản phẩm đầu ra

Được phép tạo mới/chỉnh sửa **chỉ** trong `docs/agent-ops/reports/`:
1. `PROJECT_ASSESSMENT.md`: overview, architecture map, modules, existing behavior, gaps, risks, test status, contest alignment, limitations.
2. `BACKLOG.md`: task list có ID, priority, dependencies, module owner, acceptance criteria, test requirements và status đề xuất.
3. `OWNER_DECISIONS_REQUIRED.md`: các câu hỏi phải do Owner chốt.

Không chỉnh sửa application code hoặc file cấu hình hiện có. Không cài package. Không chạy migration, deployment hoặc transaction. Không xóa/di chuyển file. Chỉ chạy command kiểm tra không phá huỷ nếu cần; nêu command trước khi chạy nếu có thể gây tác động.

## 6. Đánh giá toolchain

- Giữ stack hiện tại.
- Nếu backend dùng Python, kiểm tra pytest config và ghi đúng lệnh test; không cài thêm framework.
- Với contracts, xác định framework hiện tại trước. Foundry chỉ là candidate nếu chưa có framework phù hợp và Owner duyệt.
- Nếu dùng Avalanche C-Chain, ghi rõ testnet/mainnet config lấy từ đâu; không deploy.
- Nếu có frontend, đánh giá accessibility/responsive; nếu không thấy thì ghi “chưa xác nhận”, không tự tạo.

## 7. Kết thúc

Tóm tắt: 5 phát hiện quan trọng nhất, 5 task ưu tiên đầu tiên, blockers, các quyết định cần Owner và các điểm chưa thể xác minh. Không tự bắt đầu Phase 1.
