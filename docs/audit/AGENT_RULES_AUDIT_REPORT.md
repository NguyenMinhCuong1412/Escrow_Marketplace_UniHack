# AGENT RULES AUDIT REPORT — Escrow Marketplace (UniHack 2026)

| Mục | Giá trị |
|---|---|
| Loại | READ-ONLY AUDIT (rules, instructions, skills, workflow, QA prompts, tài liệu nghiệp vụ) |
| Ngày | 2026-11-11 |
| Reviewer | Cowork (vai trò PM/QA Reviewer) |
| Repo / branch | `D:\Escrow_Marketplace_UniHack` · `main` @ `7a0c5e9` (Merge PR #7 `phase/4e-qr-nonce`) |
| Deadline liên quan | Feature freeze **16/11/2026** · Nộp bài **21/11/2026 23:59** (còn 10 ngày) · Demo Day 30/11/2026 |
| Phạm vi ghi | Chỉ tạo file này. Không sửa source code, rules, Decision Log, không cài dependency |

> **Giới hạn của audit**
> - Đây là phân tích tĩnh (static review). **Không chạy test**: shell trên máy không có `forge`, `pytest` chưa cài, và nhiệm vụ cấm cài dependency → mọi số liệu test trong báo cáo là **đếm tĩnh** (số hàm `test_*`), trạng thái `NOT RUN`.
> - `git diff --stat` thô báo **877 file** thay đổi, nhưng `git diff --ignore-cr-at-eol --stat` rỗng → toàn bộ khác biệt chỉ là line-ending CRLF của bản checkout Windows, không có thay đổi nội dung chưa commit (xem SE-08). Audit không tạo ra các thay đổi này; file duy nhất audit thêm là báo cáo này (untracked).
> - Điểm số 0–100 ở mục 3 là **đánh giá định tính** của reviewer, không phải phép đo coverage tự động.
> - Mọi trích dẫn `path:Lx` là số dòng tại commit `7a0c5e9`.

---

## 1. Executive Summary

Bộ quy tắc hiện tại có **khung tốt** (AGENTS.md ngắn gọn, phân tách domain rules, skills có quy trình, Task Template + QA/Release prompt), và smart contract có nền kiểm thử mạnh (81 hàm test gồm fuzz + invariant). Tuy nhiên bộ quy tắc **chưa đủ để dẫn dắt AI Agent phát triển, kiểm thử và nghiệm thu an toàn** một hệ thống hoàn chỉnh, vì 5 vấn đề cấu trúc:

1. **Rule cốt lõi mâu thuẫn với thiết kế đã CONFIRMED.** Ba file rule cấm AI "ký transaction" / "trực tiếp trigger release", trong khi DEC-013 và `BUSINESS_REQUIREMENTS.md` xác nhận AI Agent tự ký `attest()` và kết quả `attest` sạch mở khoá `resolveClean` cho bất kỳ ai (RA-01). Agent tuân thủ rule sẽ phải BLOCK hoặc vi phạm — rule không thể thực thi.
2. **Không có thứ tự ưu tiên giữa các nguồn sự thật**, và nhiều tài liệu đánh dấu `CONFIRMED` đã lỗi thời (frontend "chưa tồn tại", "chưa deploy Fuji", state machine sai so với contract). Agent đọc `docs/context/` theo chỉ dẫn sẽ nhận thông tin sai (RA-02, RA-03, PC-01).
3. **Quy trình bị bỏ qua mà rule không phát hiện được.** Hai tính năng lớn (auto-agent, QR nonce) được merge không có Task Spec, report hay QA report; một commit đơn chạm backend + frontend + docs + Decision Log (SE-01, RA-04).
4. **Lỗ hổng trust boundary của AI** ở luồng verify thủ công: proxy `/api/verify` công khai gắn sẵn API key, backend nhận `listing_image_url` tuỳ ý không ràng buộc chữ ký seller → bất kỳ ai gọi trước có thể chọn ảnh tham chiếu để điều khiển điểm rủi ro (SEC-01).
5. **Quy tắc kiểm thử/QA quá mỏng**: không bắt buộc fuzz/invariant/failure-injection/E2E, không cấm test bị skip được tính là PASS, QA được phép ACCEPT khi không chạy lại build; frontend không có test và không cài ESLint dù report ghi "0 lỗi ESLint" (TST-01..03, QA-01).

Ngoài ra có **3 câu hỏi nghiệp vụ phải Owner quyết định trước khi sửa rules** (BLOCKED): escrow có giữ tiền hàng hay chỉ giữ cọc (PC-02), mô hình trọng tài (owner là human arbiter, mâu thuẫn tuyên bố "không có human arbitrator") (PC-03), và định nghĩa chính xác quyền hạn của AI (RA-01).

**Tổng hợp findings:** 49 findings — **Critical 3 · High 14 · Medium 27 · Low 5**. 7 findings ở trạng thái **BLOCKED – cần Owner** (RA-01, PC-02, PC-03, PC-05, SEC-03, SEC-04, SEC-07); RA-04 cần Owner tự sửa Decision Log.

| Nhóm | Điểm (định tính) | Nhận định một dòng |
|---|---|---|
| A. Rule Architecture | **45/100** | Khung phân tầng có, nhưng không có precedence, rule cốt lõi mâu thuẫn decision, source-of-truth lỗi thời |
| B. Software Engineering | **55/100** | Nguyên tắc KISS/YAGNI/ownership tốt; thiếu API contract, dependency pinning, enforcement quy trình |
| C. Security | **50/100** | Secrets & SSRF rule tốt; thiếu auth model, AI trust boundary, centralization/liveness của owner |
| D. Testing | **38/100** | Contract test mạnh nhưng là nhờ implementer, không do rule; rule không định nghĩa loại test bắt buộc, không kiểm soát skip |
| E. QA & Release | **40/100** | Có prompt QA/Release; AC không đo được, ACCEPT không cần rerun, Release Gate chưa từng chạy, không tách demo/production |
| F. Project Consistency | **35/100** | State machine, arbitration, payment scope, AI components, test counts lệch giữa docs ↔ code |

---

## 2. Danh sách rules / tài liệu đã kiểm tra

Danh sách lập từ `find` thực tế trên working tree (loại `node_modules`, `contracts/lib`, build output). Không có `.github/`, `.claude/`, CI config, `.gitattributes`, hoặc `.gitmodules` trong repo.

### 2.1 Agent rules & skills

| File | Dòng | Vai trò | Trigger | Đã đọc |
|---|---|---|---|---|
| `CLAUDE.md` | 71 | Pointer cho Claude/Cowork | — | ✅ toàn bộ |
| `.agents/AGENTS.md` | 58 | Always-on rules cho Antigravity | — | ✅ |
| `.agents/rules/10-product-scope.md` | 13 | Product scope | `model_decision` | ✅ |
| `.agents/rules/20-architecture.md` | 14 | Architecture | `model_decision` | ✅ |
| `.agents/rules/30-backend.md` | 15 | Backend | `model_decision` | ✅ |
| `.agents/rules/40-smart-contract.md` | 16 | Smart contract | `model_decision` | ✅ |
| `.agents/rules/50-ai-pipeline.md` | 15 | AI pipeline | `model_decision` | ✅ |
| `.agents/rules/60-ui-ux.md` | 16 | UI/UX | `model_decision` | ✅ |
| `.agents/rules/70-security.md` | 15 | Security | `model_decision` | ✅ |
| `.agents/rules/80-testing.md` | 15 | Testing | `model_decision` | ✅ |
| `.agents/rules/90-git-docs.md` | 16 | Git & docs | `model_decision` | ✅ |
| `.agents/skills/implement-task/SKILL.md` | 27 | Skill implement | — | ✅ |
| `.agents/skills/project-discovery/SKILL.md` | 30 | Skill discovery | — | ✅ |
| `.agents/skills/qa-review/SKILL.md` | 26 | Skill QA | — | ✅ |

### 2.2 Context (nguồn sự thật)

`docs/context/`: `BUSINESS_REQUIREMENTS.md` (66), `COMPETITION_CONTEXT.md` (50), `CURRENT_STATUS.md` (60), `DECISION_LOG.md` (26), `OPEN_QUESTIONS.md` (19), `PRODUCT_VISION.md` (48), `PROJECT_BRIEF.md` (78), `TECH_STACK.md` (49), `USER_PERSONAS.md` (49) — ✅ đọc toàn bộ.

### 2.3 Specs

`docs/specs/`: `FRONTEND_SPEC.md` (407), `L1_MODULE_SPEC.md` (54), `SLIDE_AND_VIDEO_SCRIPT.md` (62), `VAI3_DYNAMIC_DEPOSIT_SPEC.md` (100) — ✅.

### 2.4 Agent-ops

`docs/agent-ops/`: `MASTER_DISPATCH.md` (86), `PHASE5_PREFLIGHT.md` (238), `QA_REVIEW_PROMPT.md` (22), `RELEASE_GATE_PROMPT.md` (35), `TASK_DISPATCH_PROMPT.md` (14), `TASK_TEMPLATE.md` (73); `tasks/ESC-020…070.md` (6 file); `reports/ESC-020/030/040-report.md`, `ESC-020/030/040-qa-report.md`, `ESC-050-report.md`, `reports/README.md` — ✅.

**Vắng mặt đáng chú ý:** không có `ESC-050-qa-report.md`, không có `ESC-060-report.md` (dù `CURRENT_STATUS.md:L20` ghi "phần tự động PASS 11/11"), không có Task Spec/report cho Phase 4D (auto-agent) và 4E (QR nonce).

### 2.5 Tài liệu/cấu hình khác liên quan đến agent

`README.md`, `.gitignore`, `frontend/.gitignore`, `pytest.ini`, `requirements-dev.txt`, `backend/.env.example`, `frontend/.env.local.example`, `contracts/foundry.toml`, `scripts/gen-wallets.ps1` (chỉ đọc phần tên biến, không đọc/in giá trị secret).

### 2.6 Source code đã đối chiếu (đọc để kiểm tra nhất quán, không sửa)

`contracts/src/Escrow.sol`, `contracts/src/CollectibleToken.sol`, `contracts/script/Deploy.s.sol`, `contracts/script/e2e_anvil.sh` (phần đầu), `contracts/deployments/43113.json`, danh sách hàm test trong `contracts/test/*.sol`; `backend/attest_service.py`, `backend/auto_agent.py`, `backend/chain.py` (cấu trúc); `ai-pipeline/evidence_check.py` (các hằng số/hàm chính); `frontend/app/api/{pin,verify,uris}/route.ts`, `frontend/lib/{backend,errors}.ts`, `frontend/components/VerifyProgress.tsx` (phần listing URI), `frontend/package.json`; lịch sử git 15 commit gần nhất và danh sách branch.

---

## 3. Đánh giá từng nhóm quy tắc

Phân loại theo yêu cầu: **(1)** Đã có & hợp lý · **(2)** Có nhưng chưa đủ chặt · **(3)** Thiếu hoàn toàn · **(4)** Trùng lặp/mâu thuẫn · **(5)** Không phù hợp kiến trúc hiện tại · **(6)** Cần Owner xác nhận.

### A. Rule Architecture — 45/100

| Quy tắc | Vị trí | Phân loại | Ghi chú / Finding |
|---|---|---|---|
| Phân tầng AGENTS.md (always-on) → rules/ (domain) → skills/ (procedure) | `AGENTS.md:L3` | (1) | Thiết kế tốt, ngắn gọn |
| Đọc 7 file context trước khi làm | `AGENTS.md:L7` | (2) | Không có cơ chế phát hiện file lỗi thời → RA-03 |
| Phân biệt CONFIRMED/PROPOSED/UNKNOWN/SUPERSEDED | `AGENTS.md:L9` | (2) | Không áp dụng ở cấp requirement; DEC-005/011 không được đánh SUPERSEDED → RA-04, RA-05 |
| Stop khi nguồn mâu thuẫn | `AGENTS.md:L10` | (4) | Mâu thuẫn `CLAUDE.md:L71` ("không hỏi lại user") và `FRONTEND_SPEC.md:L5` ("code thắng spec") → RA-02 |
| Thứ tự ưu tiên giữa các nguồn | — | (3) | RA-02 |
| AI không là authority duy nhất cho release/refund | `AGENTS.md:L39`, `50-ai-pipeline.md:L14-15`, `70-security.md:L14` | (4)(6) | Mâu thuẫn DEC-013 → RA-01 |
| Trigger của rule | Tất cả `model_decision` | (2) | Security/testing có thể không được nạp → RA-07 |
| Scope cấm "reputation", "admin features" | `10-product-scope.md:L11` | (5) | Reputation & admin là tính năng lõi đã CONFIRMED → RA-08 |
| "Không tự tạo frontend mới", "frontend chỉ khi xác nhận tồn tại" | `60-ui-ux.md:L8`, `20-architecture.md:L9` | (5) | Frontend đã tồn tại từ ESC-020 → RA-03 |
| Rule có thể kiểm chứng | `60-ui-ux.md:L9,L15`, `70-security.md:L11` | (2) | Thiếu ngưỡng đo được → RA-06 |
| Phân quyền theo agent (Claude Code / Antigravity / Cowork) | `CLAUDE.md:L62-64` | (2) | Thực tế Claude Code đã code + deploy, không có rule cho vai trò này → SE-01 |

### B. Software Engineering — 55/100

| Quy tắc | Vị trí | Phân loại | Finding |
|---|---|---|---|
| KISS/YAGNI/DRY/SOLID thực dụng | `AGENTS.md:L22-23` | (1) | — |
| Giữ module boundary backend/contracts/ai-pipeline | `AGENTS.md:L25`, `20-architecture.md:L9` | (2) | `backend` import trực tiếp `ai-pipeline` qua `sys.path` (`attest_service.py:L52`) — chấp nhận được nhưng không được ghi thành contract |
| API/event/schema có version | `20-architecture.md:L11` | (2) | Không có OpenAPI/contract test; spec lệch → SE-02 |
| Error model, không lộ stack trace/secret | `30-backend.md:L11` | (2) | Raw exception trả về client → SE-05 |
| Timeout/retry/idempotency | `30-backend.md:L12` | (1) | Code có timeout download, retry agent, lock per-trade |
| Logging an toàn | `30-backend.md:L14`, `50-ai-pipeline.md:L13` | (2) | Không có field/format bắt buộc, không correlation ID |
| Dependency: không thêm khi chưa duyệt | `AGENTS.md:L15`, `80-testing.md:L8` | (2) | Không có rule pin/lock/audit → SE-04 |
| Worktree/branch cho agent song song, 1 file 1 owner | `AGENTS.md:L30-32`, `90-git-docs.md:L9-10`, `MASTER_DISPATCH.md:L51` | (2)(4) | Lặp 4 nơi, không có registry ownership, bị vi phạm → SE-01, SE-07 |
| Không merge khi chưa review diff + test | `AGENTS.md:L33` | (2) | PR #5/#6/#7 merge không có QA report → SE-01 |
| Line endings / `.gitattributes` | — | (3) | SE-08 |
| Đồng bộ ABI giữa contracts/backend/frontend | — | (3) | SE-03 |

### C. Security — 50/100

| Quy tắc | Vị trí | Phân loại | Finding |
|---|---|---|---|
| Không đọc/in/commit secret | `AGENTS.md:L18`, `70-security.md:L9` | (1) | Tốt, được tuân thủ trong reports |
| Least privilege, deny-by-default | `70-security.md:L8` | (2) | Backend fail-open khi thiếu API key → SEC-02 |
| Input validation, SSRF | `30-backend.md:L10`, `70-security.md:L10` | (2) | Code có allowlist + chặn IP; còn toggle nguy hiểm không bị rule cấm → SEC-06 |
| OWASP ASVS 5.0 / Top 10:2025 / SC Top 10:2025 | `70-security.md:L11-12` | (2) | Không nêu level/checklist → không kiểm chứng được |
| Contract: access control, reentrancy, CEI, DoS | `40-smart-contract.md:L9-10` | (1) | Code tuân thủ (CEI + ReentrancyGuard + pull fallback) |
| Owner/admin centralization, key management, liveness | — | (3)(6) | SEC-03, SEC-04 |
| AI trust boundary (input binding) | `50-ai-pipeline.md:L9-10` | (5) | Viết cho LLM/RAG, không cho CV pipeline → SEC-01, TST-06 |
| AI không trigger transfer | `70-security.md:L14` | (4)(6) | RA-01 |
| File upload / IPFS | — | (3) | SEC-05, SEC-07 |
| Dependency/config security | — | (3) | SE-04, SEC-06 |
| Secret scan lịch sử git | `OPEN_QUESTIONS.md:L15` (Q-009 OPEN) | (2) | SEC-09 |

### D. Testing — 38/100

Ma trận yêu cầu của rules hiện tại so với 12 loại test được yêu cầu audit:

| Loại test | Rule yêu cầu? | Thực tế trong repo | Phân loại |
|---|---|---|---|
| Unit | Ngầm (`80-testing.md:L10`) | Contract 81 hàm, AI 66 hàm, backend unit 38 hàm; **frontend 0** | (2) |
| Integration | `80-testing.md:L12` | `backend/tests/test_integration_anvil.py` 20 hàm (skip được) | (2) |
| End-to-end | — | `e2e_anvil.sh` (cast); ESC-060 thủ công, không có report | (3) |
| Regression | `80-testing.md:L10`, skill implement L20 | Không có định nghĩa suite regression/module | (2) |
| Fuzz | — (chỉ VAI3 spec L89) | 4 hàm `testFuzz_*` | (3) |
| Invariant | — | 2 invariant; handler không gồm `withdraw`/payout bị từ chối | (3) |
| Boundary-value | `40-smart-contract.md:L13` ("amount boundary") | Có cho contract; không cho AI threshold | (2) |
| Negative | `80-testing.md:L10` | Contract tốt; frontend không | (2) |
| Failure injection | — | Không | (3) |
| Security testing | `40-smart-contract.md:L13` | Reentrancy test có; không có test cho SEC-01 | (2) |
| Concurrency | — | Lock per-trade có; không test multi-process/nonce agent | (3) |
| Recovery | — | Registry/hash store JSON sống qua restart; không test | (3) |
| Kiểm soát skip | `80-testing.md:L15` ("report skipped") | Skip vẫn được báo "ALL PASS" | (2) |

Chi tiết: TST-01…TST-08.

### E. QA & Release — 40/100

| Quy tắc | Vị trí | Phân loại | Finding |
|---|---|---|---|
| Không chấp nhận chỉ dựa vào "done" | `QA_REVIEW_PROMPT.md:L22` | (2) | ACCEPT khi build NOT RE-RUN → QA-01 |
| Verdict ACCEPT / CHANGES_REQUESTED / BLOCKED | `QA_REVIEW_PROMPT.md:L18-20` | (1) | — |
| Severity scale | `70-security.md:L15` (chỉ yêu cầu có severity) | (2) | Report dùng INFO/LOW/… không định nghĩa → QA-01 |
| AC đo lường được | `TASK_TEMPLATE.md:L38-42` | (2) | Không có cột "phương pháp kiểm chứng" → QA-03 |
| Test evidence bắt buộc | `AGENTS.md:L47`, `MASTER_DISPATCH.md:L58` | (1)/(2) | Có yêu cầu "full output" nhưng không lưu artifact |
| Diff & regression review | skill implement L21, `TASK_DISPATCH_PROMPT.md:L13` | (2) | QA-04 |
| Release Gate | `RELEASE_GATE_PROMPT.md` | (2) | Chưa từng chạy, thiếu checklist đo được → QA-02 |
| Demo-ready vs production-ready | `RELEASE_GATE_PROMPT.md:L35` (1 câu) | (2) | QA-02 |
| Task status lifecycle | `TASK_TEMPLATE.md:L10` (mặc định READY) | (3) | QA-05 |

### F. Project Consistency — 35/100

Xem chi tiết mục 6 và 7. Tóm tắt các cặp lệch: state machine (BR ↔ contract), arbitration (Vision/Q-004 ↔ contract/admin page), phạm vi escrow (Vision/README ↔ contract), `cancelUnfunded` (BR/ESC-060 ↔ contract), reputation ±10/+5 (BR ↔ contract), thời điểm sinh nonce (slide ↔ contract), CLIP (TECH_STACK ↔ runtime), API endpoint (FRONTEND_SPEC/ESC-040 ↔ backend), số lượng test (≥7 con số khác nhau).

---

## 4. Các quy tắc thiếu

| ID | Quy tắc thiếu | Lý do cần | Liên quan |
|---|---|---|---|
| MR-01 | **Thứ tự ưu tiên nguồn sự thật** (Owner instruction > DECISION_LOG CONFIRMED > code on `main` cho hành vi đã deploy > BUSINESS_REQUIREMENTS > specs > reports) + quy tắc xử lý lệch | Hiện có 3 chỉ dẫn mâu thuẫn | RA-02 |
| MR-02 | **Metadata độ tươi** cho mỗi file context: `Status`, `Last verified`, `Verified against commit` | Phát hiện tài liệu lỗi thời | RA-03 |
| MR-03 | **Định nghĩa AI authority boundary** chính xác (được ký gì, output ảnh hưởng gì, ai có quyền phản bác, trong bao lâu) | Rule hiện tại không thực thi được | RA-01 |
| MR-04 | **Input binding cho mọi quyết định AI**: mọi input ảnh hưởng `attest` phải được neo on-chain hoặc ký bởi actor có thẩm quyền | Chống thao túng điểm rủi ro | SEC-01 |
| MR-05 | **Auth model backend**: fail-closed ngoài môi trường dev; proxy công khai không được coi là auth | API key bị proxy lộ chức năng | SEC-02 |
| MR-06 | **Cấm toggle bảo mật ngoài dev** (`ALLOW_LOCAL_HOSTS`, `ENFORCE_EVIDENCE_HASH=false`, IPFS mock, `ATTEST_API_KEY` rỗng) + kiểm tra khi khởi động | Config là attack surface | SEC-06, SEC-05 |
| MR-07 | **Owner/admin key & liveness**: ai giữ key owner, backup, xoay vòng, thời hạn xử lý dispute, phương án khi owner vắng | Tiền có thể kẹt vô hạn trong `Disputed` | SEC-03, SEC-04 |
| MR-08 | **Ma trận test bắt buộc theo rủi ro** (contract/backend/AI/frontend × unit/integration/fuzz/invariant/negative/failure/concurrency/recovery/E2E) | 80-testing quá chung | TST-01 |
| MR-09 | **Skip policy**: test bị skip trong suite bắt buộc = `BLOCKED`, không được tính PASS; report phải ghi `passed/failed/skipped` | Integration test skip khi thiếu anvil/tesseract | TST-02 |
| MR-10 | **Frontend quality gate tối thiểu**: ESLint cài thật, `tsc --noEmit`, unit test cho `lib/`, smoke E2E | Report claim "0 lỗi ESLint" không kiểm chứng được | TST-03 |
| MR-11 | **Cross-module parity tests** (hash report Python ↔ viem, `listing_message` Python ↔ TS, ABI sync) | Hợp đồng ngầm giữa module | TST-05, SE-03 |
| MR-12 | **AI/CV evaluation rule**: bộ dữ liệu gắn nhãn tối thiểu, đo FPR/FNR, không công bố số liệu chưa đo | Ngưỡng 8/15/70 chưa hiệu chỉnh | TST-06 |
| MR-13 | **QA rerun policy**: reviewer phải chạy lại ít nhất build + suite bắt buộc hoặc verdict tối đa `ACCEPT WITH LIMITATIONS` | ACCEPT khi NOT RE-RUN | QA-01 |
| MR-14 | **Release Gate checklist đo được** + phân biệt `DEMO-READY` / `PRODUCTION-READY` | Gate chưa từng chạy | QA-02 |
| MR-15 | **Task lifecycle** (`DRAFT→READY→IN_PROGRESS→IN_REVIEW→ACCEPTED→MERGED`) và rule "không merge khi chưa có QA report" | Status file không bao giờ cập nhật | QA-05, SE-01 |
| MR-16 | **Decision governance**: chỉ Owner tạo/đổi CONFIRMED; agent chỉ được đề xuất `PROPOSED`; cột "Approval evidence" | DEC-013 tạo trong commit implementation | RA-04 |
| MR-17 | **Agent role matrix** (Cowork / Antigravity / Claude Code: đọc, viết code, deploy, merge, ghi docs) | Claude Code đã code + deploy ngoài workflow | SE-01 |
| MR-18 | **API contract rule**: OpenAPI snapshot được commit, thay đổi endpoint phải cập nhật spec cùng PR | Spec lệch backend | SE-02 |
| MR-19 | **Dependency rule**: pin/lock (Python + Node), `pip-audit`/`npm audit` trước release, vendored libs có version ghi rõ | `>=` không khoá | SE-04 |
| MR-20 | **Evidence privacy & data retention** (ảnh/video có thể chứa PII, IPFS vĩnh viễn) | Endpoint public lộ URI | SEC-07 |
| MR-21 | **Naming/branding rule**: chuỗi người dùng ký/thấy không được dùng tên dự án khác | "TrustPact" trong message ký | SEC-08 |
| MR-22 | **Doc-sync rule**: thay đổi hành vi/API/state phải cập nhật BR/spec trong cùng PR; số liệu test không hardcode | ≥7 con số test khác nhau | SE-06, RA-03 |
| MR-23 | **`.gitattributes` / line-ending rule** | 810 file "modified" giả (PHASE5_PREFLIGHT L30) | SE-08 |

---

## 5. Các quy tắc chưa đủ chặt

| ID | Quy tắc | Vị trí | Vì sao chưa đủ chặt | Đề xuất siết |
|---|---|---|---|---|
| WR-01 | "Read context before substantial work" | `AGENTS.md:L7` | Không yêu cầu kiểm tra độ tươi | Thêm bước so `Verified against commit` với `HEAD`; lệch → báo |
| WR-02 | "Never silently promote a proposal" | `AGENTS.md:L9` | Không cấm agent ghi DEC với status CONFIRMED | MR-16 |
| WR-03 | "Run only relevant, documented checks" | `AGENTS.md:L46` | "Relevant" tuỳ ý | Liên kết tới ma trận MR-08 |
| WR-04 | "A task is not DONE until…" | `AGENTS.md:L48` | Không ràng buộc với merge | "Không merge nếu thiếu `<ID>-qa-report.md` verdict ACCEPT" |
| WR-05 | "Cover … proportional to risk" | `80-testing.md:L10` | Không có thang rủi ro | Định nghĩa risk tier (P0 tiền/quyền, P1 AI quyết định, P2 UI) |
| WR-06 | "Report … skipped tests" | `80-testing.md:L15` | Skip vẫn có thể ACCEPT | MR-09 |
| WR-07 | "Validate input tại boundary" | `30-backend.md:L10` | Không nêu binding với chain/chữ ký | MR-04 |
| WR-08 | "Có evaluation dataset/criteria" | `50-ai-pipeline.md:L11` | Không có ngưỡng, không gate | MR-12 |
| WR-09 | "Review against OWASP ASVS 5.0" | `70-security.md:L11` | Không chỉ level, không checklist | Chọn ASVS L1 cho demo + checklist ≤15 mục liên quan |
| WR-10 | "WCAG 2.2 … hướng tới AA khi khả thi" | `60-ui-ux.md:L15` | "Khi khả thi" → không đo được | Liệt kê 5 kiểm tra tối thiểu (contrast, focus, label, keyboard, 375px) |
| WR-11 | "Use isolated worktree…" | `90-git-docs.md:L9` | Không có registry ai đang giữ file nào | Thêm bảng "Active ownership" trong MASTER_DISPATCH |
| WR-12 | "Update docs when behavior/API/schema changes" | `90-git-docs.md:L15` | Không chỉ rõ file nào phải cập nhật | Mapping thay đổi → file (MR-22) |
| WR-13 | "Viết test cho … timeout và dispute cases có trong spec" | `40-smart-contract.md:L13` | Spec không định nghĩa dispute timeout → rule không kích hoạt | Liên kết SEC-04 |
| WR-14 | QA "rerun approved tests if appropriate" | `qa-review/SKILL.md:L17` | "If appropriate" → có thể bỏ qua | MR-13 |
| WR-15 | Release "Critical/High đã xử lý hoặc Owner ghi nhận" | `RELEASE_GATE_PROMPT.md:L24` | Không có risk register để đối chiếu | Tạo `RISK_REGISTER.md` |
| WR-16 | Task Template "Security review required? Yes/No" | `TASK_TEMPLATE.md:L50` | Không có tiêu chí khi nào bắt buộc Yes | Bắt buộc Yes nếu chạm `contracts/src`, `attest_service.py`, `auto_agent.py`, `app/api/*`, env/config |

---

## 6. Xung đột giữa tài liệu

Findings dạng chi tiết. Severity: **Critical** = có thể gây mất/khoá tiền, khiến agent hành động không an toàn trên luồng lõi, hoặc tuyên bố sai chức năng lõi khi pitch; **High** = làm agent ra quyết định sai/BLOCK trên luồng chính hoặc rủi ro bảo mật khai thác được; **Medium** = sai lệch gây lãng phí/rủi ro có giới hạn; **Low** = vệ sinh tài liệu.

---

**RA-01 · Critical · BLOCKED (Owner)** — Rule về quyền hạn AI mâu thuẫn trực tiếp với thiết kế đã CONFIRMED

- **Path:** `.agents/AGENTS.md:L39`; `.agents/rules/50-ai-pipeline.md:L14-15`; `.agents/rules/70-security.md:L14`; `docs/context/DECISION_LOG.md:L20` (DEC-013); `docs/context/BUSINESS_REQUIREMENTS.md:L11`; `contracts/src/Escrow.sol:L214-244`; `backend/auto_agent.py:L143-201`.
- **Bằng chứng:**
  - `AGENTS.md:L39`: "AI output must never be the sole authority for releasing, refunding… AI may summarize evidence or assist a human reviewer".
  - `50-ai-pipeline.md:L14`: "AI không tự ký transaction"; L15: "đề xuất ảnh hưởng đến tranh chấp/tài sản phải có human review".
  - `70-security.md:L14`: "Never let AI output directly trigger a transfer, release, refund".
  - DEC-013 (CONFIRMED): agent "tự verify + `attest()`"; `auto_agent.py` tự ký và gửi `attest` không cần người bấm.
  - `Escrow.sol:L233-237`: sau `attest(flagged=false)` và hết `DISPUTE_WINDOW`, **bất kỳ ai** gọi `resolveClean` → hoàn cọc. Không có human review bắt buộc; chỉ có quyền phản bác (`fileComplaint`) trong 90 giây ở bản deploy Fuji (`deployments/43113.json`: `disputeWindow: 90`).
- **Tác động:** Agent tuân thủ nghiêm rules phải BLOCK mọi task chạm auto-agent; agent khác "diễn giải lỏng" thì vi phạm. QA reviewer không có chuẩn để đánh giá. Đây là luồng lõi của track AI Agents & Security (Technical 25%).
- **Đề xuất:** Owner ra quyết định định nghĩa authority boundary, ví dụ: "AI Agent được ký **duy nhất** `attest()`; `attest` sạch chỉ mở khả năng `resolveClean` sau `DISPUTE_WINDOW` ≥ X; mọi bên có quyền `fileComplaint` trong cửa sổ đó; AI không được gọi `resolve*`, `withdraw`, `setAgent`, `cancel*`; `flagged` không tự phạt ai". Sau đó viết lại 3 rule trên theo cùng một câu chữ, đặt ở 1 file (đề xuất `55-ai-authority.md`, always_on) và các file khác chỉ tham chiếu.
- **Tiêu chí xác nhận:** (1) Có DEC mới (CONFIRMED bởi Owner) định nghĩa boundary; (2) `grep` 3 câu cũ không còn; (3) một QA reviewer độc lập đọc rule + DEC-013 kết luận "không mâu thuẫn"; (4) có test contract chứng minh agent không gọi được `resolveClean/resolveDispute/withdraw` với vai trò agent (đã có `onlyOwner` cho `resolveDispute`; `resolveClean` là public — boundary phải phản ánh đúng điều này).

---

**RA-02 · High** — Không có thứ tự ưu tiên nguồn sự thật; 4 chỉ dẫn xung đột

- **Path:** `CLAUDE.md:L31, L71`; `.agents/AGENTS.md:L8, L10`; `docs/specs/FRONTEND_SPEC.md:L5`; `docs/agent-ops/reports/ESC-030-qa-report.md:L56`.
- **Bằng chứng:** `CLAUDE.md:L71` "đọc file trong `docs/context/` — không hỏi lại user"; `AGENTS.md:L10` "If sources conflict, stop and report"; `FRONTEND_SPEC.md:L5` "Nếu thấy mâu thuẫn, **code thắng spec**"; ESC-030 QA report viện dẫn "FRONTEND_SPEC (source of truth theo AGENTS.md)" — AGENTS.md không có câu này.
- **Tác động:** Cùng một mâu thuẫn, Claude chọn context, Antigravity dừng, frontend agent chọn code, QA chọn spec. Kết quả không lặp lại được.
- **Đề xuất:** Thêm mục "Precedence" vào `AGENTS.md` (và `CLAUDE.md` tham chiếu): Owner instruction hiện tại > DEC CONFIRMED > hành vi contract đã deploy trên Fuji (cho câu hỏi "hệ thống đang làm gì") > BUSINESS_REQUIREMENTS > specs > task specs > reports. Ghi rõ: khi docs lệch code, agent **báo lệch** và không tự sửa docs nghiệp vụ.
- **Tiêu chí xác nhận:** Một câu precedence duy nhất tồn tại; `CLAUDE.md:L71` và `FRONTEND_SPEC.md:L5` được thay bằng tham chiếu tới nó.

---

**RA-03 · High** — Tài liệu "source of truth" đánh dấu CONFIRMED nhưng lỗi thời

- **Path & bằng chứng:**

| File:dòng | Nội dung hiện tại | Thực tế (`7a0c5e9`) |
|---|---|---|
| `CLAUDE.md:L57` | `frontend/ # Next.js (chưa tạo, Phase 4A)` | Frontend đã có, 4A–4C merged |
| `CLAUDE.md:L24,L27` | `.agents/` liệt kê 2 lần | Trùng |
| `TECH_STACK.md:L15` | Frontend `NOT STARTED` | Next.js 14.2.35 đã chạy |
| `TECH_STACK.md:L14` | "CLIP embeddings (lru_cache)" | Mặc định `hsv-histogram`; `torch/open_clip` bị comment trong `ai-pipeline/requirements.txt` |
| `OPEN_QUESTIONS.md:L9` (Q-003) | "Frontend CHƯA tồn tại" — ✅ ANSWERED | Sai |
| `OPEN_QUESTIONS.md:L16` (Q-010) | "chưa deploy lên Fuji" | Đã deploy `0x1F04…CbCf` |
| `OPEN_QUESTIONS.md:L19` (Q-013) | Ai code frontend? OPEN | Đã code |
| `PROJECT_BRIEF.md:L12` | "Đang chuẩn bị frontend + deploy Fuji" | Xong |
| `PROJECT_BRIEF.md:L44-55` | `docs/FRONTEND_SPEC.md`, `.agents/docs/context`, `guides/`, `tools/` | Các path này không tồn tại |
| `MASTER_DISPATCH.md:L24-29` | 4A READY, 4B/4C BLOCKED | Đã merged (PR #2–#4) |
| `MASTER_DISPATCH.md:L86` | "Còn 13 ngày tính từ 08/11" | Số ngày cố định trong văn bản |
| `CURRENT_STATUS.md:L4,L17,L47` | ESC-050 "chờ QA review + merge" | PR #5 đã merge (`75fc741`) |
| `DECISION_LOG.md:L13,L18` | `docs/VAI3_DYNAMIC_DEPOSIT_SPEC.md`, `docs/FRONTEND_SPEC.md` | Đã chuyển vào `docs/specs/` |
| `PRODUCT_VISION.md:L34-35` | `docs/VAI3…`, `docs/L1_MODULE_SPEC.md` | Như trên |
| `L1_MODULE_SPEC.md:L3` | "(CLAUDE.md mục 6)" | `CLAUDE.md` không có mục 6 |
| `SLIDE_AND_VIDEO_SCRIPT.md:L16` | "flow mục 3 CLAUDE.md" | Không tồn tại |
| `README.md:L53` | "Chạy Frontend (Kế hoạch Phase 3B)" | Lỗi thời |
| `60-ui-ux.md:L8`, `20-architecture.md:L9` | "không tự tạo frontend", "frontend chỉ khi xác nhận tồn tại" | Viết cho trạng thái trước 4A |

- **Tác động:** Agent làm theo `AGENTS.md:L7` sẽ nạp thông tin sai (ví dụ: tạo lại frontend, tưởng chưa deploy, tưởng dùng CLIP), sinh task/AC sai.
- **Đề xuất:** (1) Thêm header bắt buộc `Status / Last verified / Verified against commit` cho mỗi file `docs/context/*`; (2) một task doc-sync duy nhất (Owner duyệt) sửa các dòng trên; (3) bỏ con số ngày đếm ngược khỏi tài liệu tĩnh.
- **Tiêu chí xác nhận:** Không còn dòng nào trong bảng trên; mỗi file context có header với commit ≥ commit merge gần nhất.

---

**RA-04 · High** — Decision Log không được quản trị: thiếu SUPERSEDED, DEC do agent ghi trong commit code, thay đổi nghiệp vụ không có DEC

- **Path:** `docs/context/DECISION_LOG.md:L3, L12, L18, L20`; commit `f8f07ac`, `4c783c5`.
- **Bằng chứng:**
  - L3 yêu cầu "đánh dấu `SUPERSEDED` khi có quyết định thay thế". DEC-005 (L12: "Nâng lên A… chỉ sau feature freeze 16/11") bị DEC-013 (11/11) thay thế nhưng vẫn `CONFIRMED`. DEC-011 (L18: "Frontend chỉ viết spec") đã lỗi thời nhưng vẫn `CONFIRMED`.
  - `git show --stat f8f07ac`: cùng commit thêm `auto_agent.py` (225 dòng), sửa `attest_service.py`, 7 file frontend, và `DECISION_LOG.md` (+1 dòng DEC-013, status CONFIRMED), co-authored bởi AI. Không có trường "approval evidence".
  - QR nonce (`4c783c5`) thay đổi cách tạo/đọc bằng chứng (nghiệp vụ lõi) — không có DEC, không có trong BR/FRONTEND_SPEC/TECH_STACK.
- **Tác động:** Không phân biệt được quyết định của Owner với quyết định agent tự ghi → vi phạm tinh thần `AGENTS.md:L9` và `MASTER_DISPATCH.md:L54`.
- **Đề xuất:** MR-16. Thêm cột `Approved via` (link PR comment/tin nhắn Owner). Owner xác nhận lại DEC-013 và tạo DEC cho QR nonce, đánh DEC-005 (phần "chỉ sau 16/11") và DEC-011 `SUPERSEDED`. **Audit này không tự sửa Decision Log.**
- **Tiêu chí xác nhận:** Mọi DEC CONFIRMED có `Approved via`; DEC-005/011 có trạng thái phản ánh đúng; có DEC cho QR nonce.

---

**RA-05 · Medium** — Không có ID requirement; nhãn trạng thái không thống nhất

- **Path:** `BUSINESS_REQUIREMENTS.md:L3`, `PRODUCT_VISION.md:L3`, `USER_PERSONAS.md:L3`, `OPEN_QUESTIONS.md` (✅ ANSWERED / ⬜ OPEN), `FRONTEND_SPEC.md` (không có status), `TASK_TEMPLATE.md:L40-42`.
- **Bằng chứng:** Status ở cấp file ("CONFIRMED – đã code và test"); chỉ bảng actors có status từng dòng. Không có `REQ-xxx` để AC trỏ tới.
- **Tác động:** Không trace được AC → requirement → test; không thể đánh dấu một phần requirement là PROPOSED.
- **Đề xuất:** Gán ID ngắn cho các dòng nghiệp vụ trong BR (REQ-01…), AC trong Task Spec ghi `Traces: REQ-xx`. Dùng đúng 4 nhãn của `AGENTS.md:L9`.
- **Tiêu chí xác nhận:** 100% AC của task mới có `Traces:`; không còn nhãn ngoài 4 nhãn chuẩn trong `docs/context`.

---

**RA-06 · Medium** — Rule khó kiểm chứng

- **Path:** `60-ui-ux.md:L9, L15`; `70-security.md:L11-12`; `20-architecture.md:L11`; `50-ai-pipeline.md:L8`.
- **Bằng chứng:** "màu tiết chế và typography đủ lớn", "AA cho MVP khi khả thi", "against OWASP ASVS 5.0" (không level), "schema/version rõ", "logging" (không field).
- **Tác động:** QA không thể ra verdict khách quan; agent có thể tự tuyên bố "đã tuân thủ".
- **Đề xuất:** Mỗi rule đi kèm "Cách kiểm chứng" (lệnh/checklist). Ví dụ: contrast ≥ 4.5:1 cho text thường; ASVS L1 các mục V2/V4/V5/V12 liên quan; log JSON có `trade_id`, `phase`, `duration_ms`.
- **Tiêu chí xác nhận:** Mỗi bullet trong rules có ít nhất một tiêu chí pass/fail hoặc được gắn nhãn "guideline (không gate)".

---

**RA-07 · Medium** — Tất cả domain rule dùng `trigger: model_decision`

- **Path:** frontmatter của 9 file `.agents/rules/*.md`.
- **Bằng chứng:** Không có rule `always_on` hoặc trigger theo glob path; security (70) và testing (80) phụ thuộc mô hình tự quyết định nạp.
- **Tác động:** Task chạm `contracts/src/**` có thể không nạp `40`/`70`/`80`.
- **Đề xuất:** `70-security` và `80-testing` → `always_on`; `30` glob `backend/**`, `40` glob `contracts/**`, `50` glob `ai-pipeline/**, backend/auto_agent.py, backend/attest_service.py`, `60` glob `frontend/**`. (Cần xác nhận cú pháp trigger mà Antigravity hỗ trợ trước khi đổi.)
- **Tiêu chí xác nhận:** Một task thử chạm `contracts/src/Escrow.sol` cho thấy trong log agent đã nạp 40/70/80.

---

**RA-08 · Medium** — `10-product-scope` cấm tính năng đang là lõi đã CONFIRMED

- **Path:** `.agents/rules/10-product-scope.md:L11` vs `BUSINESS_REQUIREMENTS.md:L13, L26`, `FRONTEND_SPEC.md:§6.5–6.6`.
- **Bằng chứng:** "Không tự thêm tokenomics, DAO, **reputation**, oracle, cross-chain, yield hoặc **admin features** ngoài scope". Reputation (BR L26) và trang `/admin` (FRONTEND_SPEC §6.6) đã CONFIRMED/implemented.
- **Tác động:** Agent có thể từ chối sửa bug reputation/admin hoặc QA đánh dấu sai "out of scope".
- **Đề xuất:** Đổi thành "Không mở rộng reputation/admin **ngoài những gì BR và DEC đã CONFIRMED**".
- **Tiêu chí xác nhận:** Rule không còn mâu thuẫn với BR theo đánh giá của reviewer.

---

**RA-09 · Medium** — Trùng lặp quy tắc ở nhiều nơi, đã bắt đầu lệch

- **Path:** Worktree/ownership: `AGENTS.md:L30-32`, `90-git-docs.md:L9-10`, `MASTER_DISPATCH.md:L51`, `TASK_DISPATCH_PROMPT.md:L9-10`, `TASK_TEMPLATE.md:L56-57`. Deploy: `MASTER_DISPATCH.md:L53` ("Không deploy… Project Owner chạy deploy") vs `tasks/ESC-050.md:L29` (scope "chạy deploy") vs `ESC-050-report.md:L19` (agent broadcast theo yêu cầu Owner).
- **Tác động:** Sửa một nơi, các nơi khác lệch; agent gặp chỉ dẫn trái ngược về deploy.
- **Đề xuất:** Giữ định nghĩa ở **một** file (AGENTS.md hoặc 90), các file khác chỉ tham chiếu. Thêm ngoại lệ có kiểm soát cho deploy: "chỉ khi Task Spec ghi `Deploy authorized: Yes` + Owner xác nhận trong phiên".
- **Tiêu chí xác nhận:** Mỗi quy tắc xuất hiện nguyên văn ở đúng 1 file.

---

**PC-01 · High** — State machine trong BUSINESS_REQUIREMENTS khác contract

- **Path:** `BUSINESS_REQUIREMENTS.md:L28-40` vs `contracts/src/Escrow.sol:L36-43`; `FRONTEND_SPEC.md:L81-89`.
- **Bằng chứng:** BR vẽ các trạng thái `SellerDeposited`, `BuyerDeposited`, `FullyFunded`, `EvidenceSubmitted` và ghi "đã implement trong `Escrow.sol`". Contract chỉ có 6 state: `Created, AwaitingEvidence, Attested, Disputed, Resolved, Cancelled`. FRONTEND_SPEC khớp contract.
- **Tác động:** Agent dùng BR (nguồn sự thật theo `AGENTS.md:L7`) sẽ viết UI/test/slide sai; slide 7 ("State machine 6 trạng thái") mâu thuẫn BR.
- **Đề xuất:** Owner xác nhận BR vẽ lại đúng 6 state + điều kiện chuyển (trích từ `require` trong contract), các mốc "SellerDeposited…" chỉ là sub-condition.
- **Tiêu chí xác nhận:** Sơ đồ trong BR liệt kê đúng 6 enum của `Escrow.sol:L36-43` và mọi transition có hàm tương ứng.

---

**PC-02 · Critical · BLOCKED (Owner)** — Phạm vi escrow: contract chỉ giữ cọc, tài liệu/pitch nói "giải ngân"

- **Path:** `PRODUCT_VISION.md:L7, L25`; `BUSINESS_REQUIREMENTS.md:L24`; `README.md:L13`; `FRONTEND_SPEC.md:L270`; `SLIDE_AND_VIDEO_SCRIPT.md:L45`; `Escrow.sol:L134-180, L233-244`.
- **Bằng chứng:** Vấn đề nêu ở Vision L7: "buyer trả tiền nhưng seller không giao". Contract: `createTrade` chỉ lưu `itemValue` để tính cọc; `deposit` nhận đúng `depositRequired` (30%) từ **mỗi** bên; `resolveClean` gọi `_refundBoth` — **không có khoản tiền hàng nào được giữ hay chuyển cho seller**. BR L24 "hoàn cọc + giải ngân"; hero "hợp đồng tự giải ngân".
- **Tác động:** (1) Rủi ro tuyên bố sai chức năng khi pitch/video — `RELEASE_GATE_PROMPT.md:L9` cấm "hiển thị chức năng chưa implement như thể đã hoạt động"; giám khảo Technical/Impact có thể phát hiện. (2) Agent viết docs/slide sẽ tiếp tục khuếch đại sai lệch.
- **Đề xuất:** Owner quyết định một trong hai: (a) giữ mô hình "cọc ký quỹ hai chiều, thanh toán hàng ngoài chuỗi" và sửa mọi chữ "giải ngân" thành "hoàn cọc"; (b) thay đổi contract để buyer nạp thêm giá hàng (vượt phạm vi trước freeze 16/11 — rủi ro cao, cần redeploy + re-test).
- **Tiêu chí xác nhận:** Có DEC ghi rõ mô hình; `grep -rn "giải ngân"` trong docs/README/frontend chỉ còn ở ngữ cảnh đúng.

---

**PC-03 · High · BLOCKED (Owner)** — "Không có human arbitrator" vs owner là trọng tài

- **Path:** `PRODUCT_VISION.md:L15, L9`; `OPEN_QUESTIONS.md:L10` (Q-004); `Escrow.sol:L22, L262`; `FRONTEND_SPEC.md:§6.6`; `frontend/components/Navbar.tsx:L68` ("Trọng tài Admin"); `SLIDE_AND_VIDEO_SCRIPT.md:L17, L46`; `PHASE5_PREFLIGHT.md:L75`.
- **Bằng chứng:** Vision L15 "Không có: Human arbitrator — đây là differentiator chính"; Q-004 "Không có human arbitrator; AI Agent thay thế". Contract: `address public owner; // arbiter mặc định cho dispute` và `resolveDispute(...) external onlyOwner` quyết định ai bị phạt 5%. Slide 5 còn nói "TrustPact cần broker/người duyệt — ta không", nhưng video L46 lại quay cảnh "Admin chọn bên vi phạm".
- **Tác động:** Mâu thuẫn ngay trong pitch (Creativity 15% dựa vào differentiator này); agent viết slide/README sẽ chép claim sai.
- **Đề xuất:** Owner chọn cách diễn đạt chính xác: "AI xử lý luồng sạch tự động; tranh chấp (khi AI flag hoặc bị khiếu nại) do trọng tài xử lý — roadmap: thay bằng cơ chế phi tập trung". Cập nhật Vision/Q-004/slide theo.
- **Tiêu chí xác nhận:** Không tài liệu nào còn câu "không có human arbitrator" trừ khi contract thay đổi tương ứng.

---

**PC-04 · Medium** — Ngữ nghĩa `cancelUnfunded` mô tả sai

- **Path:** `BUSINESS_REQUIREMENTS.md:L42`; `tasks/ESC-060.md:L46` (AC-03); `Escrow.sol:L183-189`.
- **Bằng chứng:** BR: "chỉ 1 bên deposit, bên kia **quá hạn** → huỷ". ESC-060 AC-03: "quá evidence window → cancelUnfunded". Contract: không có deadline nào ở state `Created`; bất kỳ party nào gọi được ngay, kể cả khi chưa ai nạp.
- **Tác động:** AC-03 của ESC-060 không thể kiểm chứng đúng như viết; QA có thể FAIL nhầm hoặc PASS sai.
- **Đề xuất:** Sửa BR + AC theo hành vi thật (hoặc Owner quyết định thêm deadline — thay đổi contract).
- **Tiêu chí xác nhận:** AC mới mô tả đúng điều kiện `state == Created && msg.sender ∈ {seller, buyer}`.

---

**PC-05 · Medium · BLOCKED (Owner)** — Quy tắc reputation ±10/+5 không có trong BR/Decision Log

- **Path:** `BUSINESS_REQUIREMENTS.md:L26, L62`; `Escrow.sol:L282-283`; `SLIDE_AND_VIDEO_SCRIPT.md:L22`; `FRONTEND_SPEC.md:L371`.
- **Bằng chứng:** BR: "Chỉ `resolveClean` mới +1" và "Farm uy tín fix: chỉ resolveClean mới +1". Contract `resolveDispute`: violator −10, **victim +5**. Không DEC nào ghi tham số này.
- **Tác động:** Tham số kinh tế chỉ tồn tại trong code/slide; nếu VAI3 (cọc động theo reputation) được làm, +5 từ dispute trở thành vector farm (cần owner thông đồng hoặc bị lừa).
- **Đề xuất:** Owner xác nhận bằng DEC; BR ghi đầy đủ.
- **Tiêu chí xác nhận:** DEC mới; BR liệt kê đủ mọi thay đổi reputation có trong contract.

---

**PC-06 · Medium** — Thời điểm sinh nonce trong slide/video sai so với contract

- **Path:** `SLIDE_AND_VIDEO_SCRIPT.md:L17` (slide 5), `L41` (video 0:35); `Escrow.sol:L140, L154`.
- **Bằng chứng:** Slide: "Nonce sinh on-chain **sau khi đủ cọc**"; video: "Khi đủ cọc, hợp đồng sinh một mã nonce". Contract sinh nonce trong `createTrade` và phát qua event `TradeCreated` ngay lúc tạo. (UI chỉ *hiển thị* NonceCard khi đã đủ cọc.)
- **Tác động:** Tuyên bố kỹ thuật sai trong pitch; giám khảo đọc contract sẽ thấy.
- **Đề xuất:** Sửa câu thành "nonce sinh on-chain khi tạo giao dịch, chỉ dùng được cho giao dịch đó".
- **Tiêu chí xác nhận:** Script không còn "sau khi đủ cọc" cho nonce.

---

**PC-07 · Medium** — Thành phần AI mô tả sai (CLIP) và thiếu QR nonce

- **Path:** `CLAUDE.md:L56` ("pHash + ORB + OCR + CLIP"); `TECH_STACK.md:L14, L39`; `USER_PERSONAS.md:L43`; `tasks/ESC-040.md:L61`; `ai-pipeline/requirements.txt` (torch/open_clip bị comment); `FRONTEND_SPEC.md:L179`; commit `4c783c5`.
- **Bằng chứng:** Runtime mặc định `embedding_backend: "hsv-histogram"`; ESC-040 QA Finding #3 đã chỉ ra nhưng tài liệu gốc chưa sửa. QR nonce (đọc QR trước, OCR dự phòng) không xuất hiện trong BR/TECH_STACK/FRONTEND_SPEC/PERSONAS.
- **Đề xuất:** Doc-sync; ghi "CLIP (tuỳ chọn, mặc định tắt) → fallback HSV histogram"; thêm QR nonce sau khi có DEC (RA-04).
- **Tiêu chí xác nhận:** Mô tả pipeline trong mọi file khớp `ec.embedding_backend()` mặc định và có QR.

---

**PC-08 · Low** — Tham số cửa sổ thời gian ghi không đồng nhất

- **Path:** `BUSINESS_REQUIREMENTS.md:L50-52`; `DECISION_LOG.md:L15` (DEC-008); `Escrow.sol:L30`; `Deploy.s.sol:L25-27`; `PHASE5_PREFLIGHT.md:L141`.
- **Bằng chứng:** Attest window production 1 ngày chỉ có trong code/preflight; BR ghi "có", DEC-008 không nhắc. Bản Fuji đang chạy 600/600/90 giây.
- **Đề xuất:** BR/DEC ghi đủ 3 giá trị production + 3 giá trị demo, và ghi rõ bản nộp bài đang chạy cấu hình demo.
- **Tiêu chí xác nhận:** Một bảng duy nhất có 6 giá trị, khớp `Deploy.s.sol` và `43113.json`.

---

**PC-09 · Low** — FRONTEND_SPEC cho phép http URL, backend đã cấm

- **Path:** `FRONTEND_SPEC.md:L398` ("backend chấp nhận http URL"); `attest_service.py:L504, L637`.
- **Bằng chứng:** Từ Phase 3A backend chỉ nhận `ipfs://` cho listing và URI đăng ký.
- **Đề xuất:** Sửa spec.
- **Tiêu chí xác nhận:** Spec mô tả đúng ràng buộc `ipfs://`.

---

## 7. Các xung đột giữa rules và source code

**SEC-01 · Critical** — Luồng verify thủ công cho phép người gọi bất kỳ chọn ảnh tham chiếu, điều khiển kết quả AI

- **Path:** `frontend/app/api/verify/route.ts:L20-48`; `frontend/components/VerifyProgress.tsx:L157-159`; `backend/attest_service.py:L488-505, L537-553, L626-650`; `DECISION_LOG.md:L20`.
- **Bằng chứng:**
  - `/api/verify` không kiểm tra người gọi là ai, tự gắn `X-API-Key` từ server (L46-48) và chuyển tiếp `listing_image_url` do client gửi.
  - UI có ô nhập tay `ipfs://Qm...listing` (VerifyProgress L157-159).
  - Backend `/verify-evidence` chỉ kiểm tra listing bắt đầu bằng `ipfs://` (L503-505); **không** yêu cầu chữ ký seller — chữ ký chỉ được kiểm ở `POST /trade/{id}/uris` (L640-650).
  - Listing image là đầu vào của ORB identity match → ảnh hưởng `identity_term` (40% điểm rủi ro, `evidence_check.py:L533`).
  - `attest` chỉ chạy một lần (state chuyển sang `Attested`), nên người gọi **đầu tiên** quyết định kết quả; auto-agent sau đó nhận 409.
  - DEC-013 khẳng định "ảnh niêm yết phải có chữ ký ví của seller" — chỉ đúng cho luồng tự động.
- **Rule liên quan:** `30-backend.md:L10` (validate tại boundary), `50-ai-pipeline.md:L9` (untrusted input) — tồn tại nhưng không cụ thể đến mức chặn được lỗi này (MR-04 thiếu).
- **Tác động:** Một bên gian lận (hoặc người ngoài) có thể đưa ảnh listing trùng/giống bằng chứng của mình để kéo điểm rủi ro xuống, vượt qua `flagged`, rồi sau `DISPUTE_WINDOW` (90 s trên Fuji) gọi `resolveClean`. Cơ chế "AI Agents & Security" — điểm nhấn của bài — có thể bị qua mặt trong demo nếu giám khảo thử.
- **Đề xuất (cần Task Spec, không sửa trong audit):** Khi `AGENT_AUTO=true`, `/verify-evidence` chỉ dùng listing URI đã đăng ký có chữ ký trong `UriRegistry` (bỏ qua giá trị client gửi) hoặc trả 409; hoặc yêu cầu chữ ký seller trong request thủ công. Bổ sung rule MR-04.
- **Tiêu chí xác nhận:** Test integration: gọi `/verify-evidence` với `listing_image_url` khác URI đã đăng ký → 4xx và không có tx `attest`; test với URI đã đăng ký → 200.

---

**SEC-02 · High** — API key không phải ranh giới xác thực; fail-open; rate-limit sụp về một bucket

- **Path:** `backend/attest_service.py:L467-472, L474-486`; `backend/.env.example:L14`; `frontend/app/api/verify/route.ts:L46-48`; `frontend/app/api/uris/route.ts:L122-124`.
- **Bằng chứng:** `ATTEST_API_KEY` rỗng → chỉ log warning và bỏ qua auth ("Rỗng = tắt auth (dev only)"). Hai proxy Next.js công khai luôn gắn key → mọi người dùng Internet đều "có key". Rate-limit theo IP (`request.client.host`); sau proxy mọi request mang IP của server Next.js → toàn hệ thống chung 10 req/phút cho `/verify-evidence`.
- **Rule liên quan:** `70-security.md:L8` deny-by-default — bị vi phạm bởi fail-open.
- **Tác động:** Một client spam có thể khoá chức năng verify cho mọi người trong demo; auth tạo cảm giác an toàn sai trong QA (ESC-040 QA ghi "Server-side API keys đúng pattern").
- **Đề xuất:** MR-05; fail-closed khi `ENV != dev`; rate-limit theo `trade_id`/địa chỉ ví (cần chữ ký) hoặc đọc `X-Forwarded-For` từ proxy tin cậy.
- **Tiêu chí xác nhận:** Khởi động backend với key rỗng ở chế độ non-dev → exit; test 11 request từ 2 "người dùng" khác nhau qua proxy không chặn nhau.

---

**SEC-03 · High · BLOCKED (Owner)** — Tập trung quyền ở owner EOA, BR ghi "quyền tối thiểu"

- **Path:** `Escrow.sol:L22, L121-125, L248-257, L262-291`; `BUSINESS_REQUIREMENTS.md:L12`; `scripts/gen-wallets.ps1:L1, L14-15`.
- **Bằng chứng:** BR: Owner "Deploy contract, `setAgent()`, emergency. Quyền tối thiểu". Thực tế: owner (a) là trọng tài duy nhất `resolveDispute`; (b) đổi `agent` bất kỳ lúc nào, kể cả thành chính mình → tự `attest(flagged=true)` → bất kỳ ai `fileComplaint` (flagged cho phép mọi người) → owner `resolveDispute` chọn violator. Không có hàm "emergency" nào. Không có chuyển giao owner; key owner nằm trong `contracts/.env` do script ghi thẳng.
- **Rule liên quan:** `40-smart-contract.md:L16` "Không tự chốt ai có quyền release/refund/dispute" — đúng, nhưng không có rule yêu cầu tài liệu hoá rủi ro tập trung.
- **Tác động:** Tuyên bố "trustless"/"không ai cầm tiền của ai" (README L2, video L45) không hoàn toàn đúng; rủi ro mất key owner = mọi trade `Disputed` kẹt vĩnh viễn (SEC-04).
- **Đề xuất:** Owner quyết định: chấp nhận và công bố rõ ("owner = trọng tài, testnet only") hoặc giới hạn `setAgent` khi có trade đang mở (thay đổi contract). Thêm rule MR-07 về key backup.
- **Tiêu chí xác nhận:** BR mô tả đúng quyền owner; README/slide không dùng "trustless" không điều kiện; có ghi chú backup key owner ngoài repo.

---

**SEC-04 · High · BLOCKED (Owner)** — Không có lối thoát cho trạng thái `Disputed` và trade `flagged`

- **Path:** `Escrow.sol:L233-237, L248-257, L262-264, L296-309`; `BUSINESS_REQUIREMENTS.md:L63`.
- **Bằng chứng:** `resolveClean` yêu cầu `!flagged`; `cancelOnEvidenceTimeout` chỉ ở `AwaitingEvidence`; `resolveDispute` chỉ owner. Không có deadline cho `Disputed`. BR L63 tuyên bố "Kẹt tiền fix" nhưng chỉ cho unfunded/attest timeout.
- **Rule liên quan:** `40-smart-contract.md:L13` yêu cầu test "timeout và dispute cases có trong spec" — spec không có dispute timeout nên rule không bao giờ kích hoạt.
- **Tác động:** Owner mất key / vắng mặt → cọc cả hai bên kẹt vô hạn. Trên testnet rủi ro tiền thấp, nhưng là điểm yếu bảo mật dễ bị giám khảo hỏi.
- **Đề xuất:** Owner quyết định: chấp nhận cho MVP (ghi vào Known Limitations + Release Gate) hoặc thêm `DISPUTE_RESOLUTION_WINDOW` → refund cả hai (đổi contract, redeploy trước 16/11).
- **Tiêu chí xác nhận:** Quyết định được ghi DEC; nếu đổi contract: test `test_Disputed_TimeoutRefundsBoth` + invariant vẫn pass.

---

**SEC-05 · Medium** — Upload proxy `/api/pin` công khai và chế độ mock âm thầm

- **Path:** `frontend/app/api/pin/route.ts:L165-198`; `PHASE5_PREFLIGHT.md:L160`; `ESC-050-report.md:L77`.
- **Bằng chứng:** Không auth/rate-limit; dùng `PINATA_JWT` của dự án cho mọi người. MIME lấy từ `file.type` do client khai báo. Khi thiếu JWT trả CID giả `ipfs://mock…` — có thể bị neo on-chain bằng `submitEvidence`, sau đó backend không tải được → trade chỉ có thể huỷ.
- **Rule liên quan:** Không có rule về file upload/IPFS (MR-06 thiếu).
- **Tác động:** Cạn quota Pinata trong ngày demo; trade "chết" nếu mock bật trên môi trường Fuji.
- **Đề xuất:** Rule: mock chỉ cho `NEXT_PUBLIC_CHAIN_ID=31337`; Release Gate kiểm tra `mock:false`; kiểm tra magic bytes; rate-limit đơn giản.
- **Tiêu chí xác nhận:** Trên Fuji không có JWT → `/api/pin` trả 503 thay vì CID giả.

---

**SEC-06 · Medium** — Toggle bảo mật nguy hiểm không bị rule kiểm soát

- **Path:** `backend/attest_service.py:L115, L117, L186, L202-231, L525`; `backend/.env.example:L15, L30`.
- **Bằng chứng:** `ALLOW_LOCAL_HOSTS=true` bỏ toàn bộ kiểm tra IP; `ENFORCE_EVIDENCE_HASH=false` bỏ ràng buộc URI ↔ hash on-chain (L525) — tức bỏ cơ chế chống thay ảnh; `application/octet-stream` được chấp nhận; DNS được phân giải để kiểm tra rồi `requests` phân giải lại (khả năng DNS rebinding — rủi ro thấp vì host bị allowlist).
- **Tác động:** Một agent "sửa nhanh cho chạy được" có thể bật toggle trên môi trường demo mà không rule nào cấm.
- **Đề xuất:** MR-06: `/health` báo các toggle; Release Gate FAIL nếu bất kỳ toggle nguy hiểm bật ở chain 43113.
- **Tiêu chí xác nhận:** `/health` trả `security_toggles` và gate script kiểm tra được.

---

**SEC-07 · Medium · BLOCKED (Owner)** — Lộ URI bằng chứng công khai, không có rule privacy

- **Path:** `backend/attest_service.py:L460-465, L663-665`.
- **Bằng chứng:** `GET /trade/{id}/uris` và `GET /report/{id}` không auth, trả URI video unbox/ảnh đóng gói (có thể chứa khuôn mặt, địa chỉ nhà, nhãn vận chuyển). IPFS công khai, không xoá được.
- **Đề xuất:** Owner quyết định chính sách (chấp nhận cho demo + cảnh báo người dùng không để lộ thông tin cá nhân trong ảnh). Thêm MR-20.
- **Tiêu chí xác nhận:** Có câu cảnh báo trong UI upload và rule privacy trong 70-security.

---

**SEC-08 · Medium** — Thông điệp người dùng ký mang tên dự án đối thủ "TrustPact"

- **Path:** `backend/auto_agent.py:L79`; `frontend/lib/backend.ts:L182`; `COMPETITION_CONTEXT.md:L38`.
- **Bằng chứng:** `"TrustPact Escrow - xac nhan anh niem yet"` — TrustPact là đối thủ trực tiếp được liệt kê.
- **Tác động:** Ví hiển thị tên dự án khác khi seller ký → gây nhầm lẫn/giống phishing, rủi ro điểm Presentation/UI-UX và uy tín. Đổi chuỗi phải đổi đồng thời 2 file (không có test parity — TST-05).
- **Đề xuất:** Chờ Q-011 (tên dự án) rồi đổi đồng bộ; trước đó dùng tên trung tính "Escrow Marketplace". Thêm MR-21.
- **Tiêu chí xác nhận:** `grep -rn TrustPact backend frontend` chỉ trả kết quả trong docs đối thủ; test parity pass.

---

**SEC-09 · Low** — Kiểm tra secret trong lịch sử git chưa hoàn tất

- **Path:** `OPEN_QUESTIONS.md:L15` (Q-009 OPEN); `tasks/ESC-070.md:L52` (AC-08); `SLIDE_AND_VIDEO_SCRIPT.md:L61`.
- **Bằng chứng:** AC-08 chỉ kiểm tra **tên file** được thêm (`--diff-filter=A -- '*.env' '*secret*' '*key*'`), không kiểm tra nội dung. Audit này chạy kiểm tra tên file tương tự: chỉ thấy `backend/.env.example`, `frontend/.env.local.example`, `scripts/gen-wallets.ps1` và file thư viện OpenZeppelin — **không đọc nội dung, không kết luận về nội dung**.
- **Đề xuất:** Rule: chạy secret scanner theo nội dung (ví dụ gitleaks) trước khi public — cần Owner duyệt công cụ (cài dependency).
- **Tiêu chí xác nhận:** Report scan nội dung toàn lịch sử, 0 phát hiện ngoài allowlist (khoá anvil công khai).

---

**SEC-10 · Medium** — `40-smart-contract` thiếu các mục kiểm tra đang liên quan trực tiếp

- **Path:** `.agents/rules/40-smart-contract.md`.
- **Bằng chứng:** Không nhắc: rủi ro tập trung owner/agent (SEC-03), liveness (SEC-04), ảnh hưởng `setAgent` lên trade đang mở, tính dự đoán của `block.prevrandao` trong nonce (`Escrow.sol:L140`), yêu cầu static analysis (Slither) hay ghi lại gas.
- **Đề xuất:** Bổ sung checklist 6 mục trên; Slither là tuỳ chọn (cần Owner duyệt cài đặt).
- **Tiêu chí xác nhận:** Rule có checklist; QA contract report tham chiếu từng mục.

---

**SE-01 · High** — Quy trình Task Spec → Report → QA bị bỏ qua cho 3 lần merge; rule không có cơ chế chặn

- **Path:** `docs/agent-ops/tasks/` (không có 4D/4E); `docs/agent-ops/reports/` (không có ESC-050-qa, 4D, 4E); `MASTER_DISPATCH.md:L21-29`; commit `f8f07ac`, `4c783c5`, merge `75fc741`, `5ef8a2d`, `7a0c5e9`; `CLAUDE.md:L62-64`; project instruction "Cowork KHÔNG tự sửa application code".
- **Bằng chứng:** `f8f07ac` chạm 15 file thuộc backend + frontend + tests + docs (886 dòng thêm) trong một commit; `4c783c5` chạm 9 file ai-pipeline + backend + frontend. Cả hai co-authored bởi Claude, merge cùng ngày qua PR #6/#7. ESC-050 merge (PR #5) khi CURRENT_STATUS vẫn ghi "chờ QA review". ESC-050 report L5: "Claude Code, theo yêu cầu trực tiếp của Project Owner" — vai trò này không có trong workflow `CLAUDE.md:L62-64`.
- **Rule liên quan:** `AGENTS.md:L14, L30, L33`, `MASTER_DISPATCH.md:L51-52`.
- **Tác động:** Phần rủi ro cao nhất (agent tự ký on-chain) không qua review độc lập — đúng nơi SEC-01 phát sinh.
- **Đề xuất:** MR-15, MR-17: ma trận vai trò (ai được code/deploy/merge); "không merge nếu thiếu QA report" — nếu Owner muốn fast-track, ghi `Fast-track approved by Owner` trong PR và tạo QA report hậu kiểm trong 24h.
- **Tiêu chí xác nhận:** Có Task Spec + report + QA report (hậu kiểm) cho 4D, 4E, ESC-050; MASTER_DISPATCH liệt kê 4D/4E.

---

**SE-02 · Medium** — API contract trong spec/task lệch backend

- **Path:** `FRONTEND_SPEC.md:L14, §4`; `tasks/ESC-040.md:L21-24, L83`; `backend/attest_service.py:L405-669`.
- **Bằng chứng:** Spec: "Backend AI chỉ có 3 endpoint cần dùng". Backend thực có thêm `GET /trade/{id}/nonce-qr.png`, `POST/GET /trade/{id}/uris`, `GET /agent/status/{id}`; `/health` thêm `agent_auto/agent_running/...`. ESC-040 mô tả request `{ "trade_id": 1 }` và field `visual_match` — thực tế request cần 3 URI, field là `match_visual_png_b64`.
- **Đề xuất:** MR-18 — commit `openapi.json` sinh từ FastAPI; spec trỏ tới nó; test so khớp snapshot.
- **Tiêu chí xác nhận:** Diff `openapi.json` xuất hiện trong mọi PR đổi endpoint.

---

**SE-03 · Medium** — ABI nhân bản 3 nơi không có rule đồng bộ

- **Path:** `backend/abi/Escrow.json`, `frontend/lib/abi/Escrow.json`, `contracts/out/` (build); `VAI3_DYNAMIC_DEPOSIT_SPEC.md:L62-63, L100`.
- **Bằng chứng:** ESC-020 QA ghi "Cùng content (khác formatting whitespace)"; VAI3 tự cảnh báo rủi ro lệch thứ tự tuple.
- **Đề xuất:** Rule: thay đổi contract ⇒ chạy script copy ABI + test so sánh `abi` field.
- **Tiêu chí xác nhận:** Test so sánh ABI 3 nơi pass.

---

**SE-04 · Medium** — Dependency không được khoá; không có rule audit

- **Path:** `backend/requirements.txt`, `ai-pipeline/requirements.txt` (`>=`), `requirements-dev.txt`; `frontend/package.json` (`^`); `contracts/lib/` (770 file vendored, không `.gitmodules`).
- **Bằng chứng:** Python không có lockfile → môi trường giám khảo có thể cài phiên bản khác (web3 7.x đổi API so với 6.x). FRONTEND_SPEC L58 yêu cầu "pin version" nhưng `package.json` dùng `^`.
- **Đề xuất:** MR-19; tối thiểu `pip freeze > requirements.lock` cho bản nộp (Owner duyệt).
- **Tiêu chí xác nhận:** Clone sạch + cài từ lock → test suite pass.

---

**SE-05 · Medium** — Trả nguyên văn exception cho client

- **Path:** `backend/attest_service.py:L425, L435, L449, L515, L572`; `backend/chain.py` (thông điệp `ChainError` bọc lỗi web3).
- **Bằng chứng:** `HTTPException(502, str(e))`, `{"error": f"RPC error: {e}"}` — lỗi web3 có thể chứa URL RPC (nếu dùng RPC có API key trong URL).
- **Rule liên quan:** `30-backend.md:L11` "không trả stack trace/secret".
- **Đề xuất:** Mapping lỗi → thông điệp chuẩn + `error_code`; log chi tiết phía server.
- **Tiêu chí xác nhận:** Test: RPC lỗi → response không chứa chuỗi URL RPC.

---

**SE-06 · Low** — Số lượng test được hardcode, ít nhất 7 con số khác nhau

- **Path & bằng chứng:** `TECH_STACK.md:L45` & `PROJECT_BRIEF.md:L63` & `DECISION_LOG.md:L9` "177 tests"; `CURRENT_STATUS.md:L29-30` "59 AI, 23 unit + 14 integration"; `README.md:L66` "42 unit tests"; `SLIDE_AND_VIDEO_SCRIPT.md:L20, L47` "96 test Python"; `ESC-050-report.md:L79` "115/115"; commit `f8f07ac` "120 passing", `4c783c5` "139 passing"; `tasks/ESC-070.md:L48` AC-04 "= 177 tests". Đếm tĩnh hiện tại: Python có 57 + 9 (ai-pipeline) + 38 + 20 (backend) = **124 hàm `test_*`** (số case thực tế có thể khác do parametrize); contract **81 hàm** (khớp).
- **Tác động:** README/slide nộp bài có thể đưa số sai; AC-04 của ESC-070 không thể PASS trung thực.
- **Đề xuất:** MR-22: số liệu test chỉ lấy từ lần chạy gần nhất (lưu output), không ghi cứng trong docs nghiệp vụ.
- **Tiêu chí xác nhận:** Chỉ một nơi (report test gần nhất) chứa số liệu; README trỏ tới nó.

---

**SE-07 · Medium** — Branch hygiene và ownership không được quản lý

- **Path:** `git branch -a`; `tasks/ESC-030.md:L11`, `ESC-040.md:L11`; QA reports Finding "Branch name mismatch".
- **Bằng chứng:** Remote còn 8 branch phase, trong đó `phase/4c-integration` và `phase/4c-frontend-integration` song song; tên branch trong task ≠ thực tế (3 lần). Không có CI/branch protection (không có `.github/`).
- **Đề xuất:** Rule đặt tên `phase/<id>-<slug>` lấy đúng từ Task Spec; xoá branch đã merge sau khi Owner duyệt; tối thiểu một GitHub Action chạy `forge test` + `pytest` (Owner quyết định — có thể sau deadline).
- **Tiêu chí xác nhận:** Branch thực tế = branch trong spec; CI badge (nếu làm).

---

**SE-08 · Low** — Không có `.gitattributes`; line-ending gây "modified" giả

- **Path:** `PHASE5_PREFLIGHT.md:L30, L211-217`; `git status` hiện tại.
- **Bằng chứng:** 810 file "modified" do CRLF (preflight, 10/11); tại thời điểm audit (11/11) `git diff --stat` báo 877 file thay đổi trong khi `git diff --ignore-cr-at-eol --stat` rỗng → vấn đề tái diễn. Khắc phục đề xuất trước đây chỉ là cấu hình local (`core.autocrlf`), không được commit vào repo.
- **Tác động:** Agent đọc `git status` theo `90-git-docs.md:L8` sẽ thấy working tree "bẩn" → có thể BLOCK hoặc commit nhầm.
- **Đề xuất:** Thêm `.gitattributes` (`* text=auto eol=lf`, `*.ps1 eol=crlf`) — cần Owner duyệt vì chạm cấu hình repo.
- **Tiêu chí xác nhận:** Clone mới trên Windows → `git status` sạch.

---

## 8. Các test requirements còn thiếu

**TST-01 · High** — `80-testing.md` không định nghĩa loại test bắt buộc theo module/rủi ro

- **Path:** `.agents/rules/80-testing.md:L8-15`; `TASK_TEMPLATE.md:L44-50`.
- **Bằng chứng:** Rule chỉ có 8 bullet chung; Task Template chỉ có Unit/Integration/Contract/Regression. Fuzz/invariant của contract tồn tại nhờ implementer, không do rule (xem bảng mục 3.D).
- **Đề xuất:** Thêm `docs/agent-ops/TEST_MATRIX.md` (đề xuất tối thiểu dưới đây) và để `80-testing` + Task Template tham chiếu.

| Module | Bắt buộc mọi thay đổi | Bắt buộc khi chạm tiền/quyền/AI decision |
|---|---|---|
| contracts | unit + negative (unauthorized, wrong state, double action) + boundary (deadline `==`, `+1`) | fuzz (amount/time), invariant (balance == outstanding + pendingWithdrawals), reentrancy, payout-rejecting receiver, liveness |
| backend | unit + negative (4xx contract) | integration anvil (không skip), failure injection (RPC down, IPFS 429, tx revert), concurrency (2 verify cùng trade), recovery (restart giữa chừng) |
| ai-pipeline | unit + boundary (ngưỡng pHash 8, inliers 15, score 70) | evaluation set (FPR/FNR), adversarial (ảnh xoay/mờ/QR lạ), resource limits (video dài, ảnh lớn) |
| frontend | `tsc`, lint, unit cho `lib/` | smoke E2E (Playwright) happy path + 1 failure path |
| cross-module | parity: report hash, listing message, ABI | E2E anvil 3 luồng (clean, dispute, timeout) |

- **Tiêu chí xác nhận:** Task Spec mới có mục "Test matrix rows applied"; QA report kiểm từng dòng.

---

**TST-02 · High** — Test bị skip được báo là "ALL PASS"

- **Path:** `backend/tests/conftest.py:L80`; `backend/tests/test_integration_anvil.py:L39, L52`; `ai-pipeline/tests/test_evidence_check.py:L18`; `ai-pipeline/tests/test_qr_nonce.py:L83, L87`; `CURRENT_STATUS.md:L28-30`.
- **Bằng chứng:** Toàn bộ integration test skip nếu thiếu anvil hoặc Tesseract; OCR test skip nếu thiếu Tesseract. CURRENT_STATUS ghi "ALL PASS" không kèm số skipped. Không có CI để chứng minh môi trường đủ.
- **Đề xuất:** MR-09 — suite bắt buộc chạy với `-rs` và `--strict-markers`; report ghi `passed/failed/skipped`; skip trong suite bắt buộc ⇒ verdict `BLOCKED`.
- **Tiêu chí xác nhận:** Report test có dòng tổng kết pytest gồm `skipped`; QA từ chối report thiếu dòng này.

---

**TST-03 · High** — Frontend không có test, không có ESLint, report claim không kiểm chứng được

- **Path:** `frontend/package.json` (không `eslint`, không script `test`); `frontend/` (không `.eslintrc*`); `ESC-030-report.md:L38`; `ESC-040-report.md:L48`; `frontend/lib/errors.ts:L17, L29`; `FRONTEND_SPEC.md:L169, L378`.
- **Bằng chứng:**
  - Report ghi "0 lỗi ESLint" nhưng ESLint không có trong dependencies → `next build` không thể chạy lint thật.
  - `errors.ts` kiểm tra `/not a party/` (L17) **trước** `/violator not a party/` (L29) → revert "violator not a party" hiển thị sai thông điệp. Một unit test 5 dòng sẽ bắt được.
  - Spec bắt buộc "**Luôn `simulateContract` trước `writeContract`**"; `grep` không thấy `simulateContract`/`useSimulateContract` trong `frontend/app|components|hooks`.
  - CURRENT_STATUS L31: "Manual testing done" — không có artifact.
- **Đề xuất:** MR-10 (tối thiểu: cài `eslint` + `eslint-config-next`, `tsc --noEmit`, vài unit test cho `lib/errors.ts`, `lib/format.ts`, `lib/backend.ts` parity) — cài dependency cần Owner duyệt; cân nhắc thời gian trước 16/11.
- **Tiêu chí xác nhận:** `npm run lint` chạy thật và có output; test `errors.ts` cho "violator not a party" pass.

---

**TST-04 · Medium** — Lỗ hổng trong bộ test contract

- **Path:** `contracts/test/Escrow.t.sol`; `contracts/test/EscrowInvariant.t.sol:L38-126`.
- **Bằng chứng:** Handler invariant gồm `create, deposit, cancelUnfunded, evidence, attest, complain, resolveDispute, resolveClean, cancelTimeout, warp` — **không có `withdraw`** và không có actor từ chối nhận AVAX, nên nhánh `pendingWithdrawals` không được invariant phủ (có unit test riêng `test_RejectingReceiverCannotBlockDispute`). Không có test: owner tự làm agent (SEC-03), `Disputed` không có lối ra (SEC-04), biên `block.timestamp == disputeDeadline` cho cả `resolveClean` (`>`) và `fileComplaint` (`<=`) trong cùng một kịch bản, reputation victim +5 tích luỹ.
- **Đề xuất:** Bổ sung handler `withdraw` + actor reject; invariant `balance == Σ outstanding deposits + Σ pendingWithdrawals`; test biên deadline.
- **Tiêu chí xác nhận:** Invariant mới pass với `runs=256, depth=200`.

---

**TST-05 · Medium** — Không có test parity giữa module

- **Path:** `backend/auto_agent.py:L74-84` & `frontend/lib/backend.ts:L177-182` (comment "PHẢI khớp từng ký tự"); `ai-pipeline/evidence_check.py:L565` (`canonical_json`) & `frontend/lib/backend.ts:L133-138`; ABI 3 nơi.
- **Bằng chứng:** Ràng buộc chỉ nằm trong comment. ESC-040 report L44 mô tả "chuẩn hoá canonical JSON (sort keys…)" phía client, còn QA report L43 nói "dùng `report_json` gốc, tránh re-serialize" — hai tài liệu mô tả khác nhau cho cùng một hàm, không có test để phân xử.
- **Đề xuất:** Golden-file test: Python sinh `listing_message` + `report_json` + hash → file JSON fixture; test TS đọc fixture và so khớp.
- **Tiêu chí xác nhận:** Đổi 1 ký tự ở một phía → test đỏ.

---

**TST-06 · Medium** — Không có đánh giá định lượng pipeline AI/CV

- **Path:** `.agents/rules/50-ai-pipeline.md:L11`; `ai-pipeline/evidence_check.py:L51-53, L516-538`; `SLIDE_AND_VIDEO_SCRIPT.md:L20`.
- **Bằng chứng:** Ngưỡng `PHASH_REUSE_THRESHOLD = 8`, `MIN_GOOD_INLIERS = 15`, flag ≥ 70 là giá trị đặt tay; `grep` không thấy accuracy/FPR/FNR ở đâu. Test dùng ảnh tổng hợp (`tests/synth.py`). Rule 50 tập trung vào prompt injection/RAG — không áp dụng cho pipeline OpenCV/Tesseract.
- **Tác động:** Không thể trả lời câu hỏi giám khảo "tỉ lệ flag nhầm?"; điểm Technical/Impact.
- **Đề xuất:** Viết lại `50` thành rule cho CV pipeline: bộ ≥ 20 cặp ảnh thật (sạch / không nonce / ảnh tái dùng / khác món), báo cáo confusion matrix; không công bố số chưa đo.
- **Tiêu chí xác nhận:** File kết quả đánh giá có confusion matrix + commit dataset manifest.

---

**TST-07 · Medium** — Không có yêu cầu failure-injection, concurrency, recovery

- **Path:** `backend/auto_agent.py:L92-95, L143-201`; `backend/attest_service.py:L401-403, L507-509`; `backend/chain.py` (nonce tx agent).
- **Bằng chứng:** Code có xử lý (retry 5 lần backoff, lock per-trade **trong một process**, registry JSON sống qua restart) nhưng không có rule yêu cầu kiểm chứng: hai process/worker cùng attest; agent restart giữa lúc tx pending; IPFS 429 kéo dài quá `ATTEST_WINDOW` (600 s trên Fuji; tổng retry ~4 phút); manual + auto chạy song song với cùng ví agent (nonce collision).
- **Đề xuất:** Thêm các case vào TEST_MATRIX; tối thiểu 3 test: RPC lỗi → retry; 2 request đồng thời → 1 attest; restart với registry có sẵn → tiếp tục.
- **Tiêu chí xác nhận:** 3 test tồn tại và pass trong integration suite (không skip).

---

**TST-08 · Medium** — ESC-060 (E2E) có AC không kiểm chứng được và không có report

- **Path:** `tasks/ESC-060.md:L44-51`; `CURRENT_STATUS.md:L20`.
- **Bằng chứng:** AC-01 "risk < 50" (ngưỡng tuỳ ý, không khớp ngưỡng flag 70); AC-03 dựa trên "evidence window" không tồn tại cho `cancelUnfunded` (PC-04); AC-05 "Finality < 5s" không nêu cách đo; không có AC cho attest-timeout, withdraw thật, auto-agent, QR nonce, mock IPFS off. CURRENT_STATUS ghi "phần tự động PASS 11/11" nhưng không có `ESC-060-report.md`.
- **Đề xuất:** Viết lại AC theo hành vi thật + bổ sung luồng auto-agent; report bắt buộc kèm tx hash.
- **Tiêu chí xác nhận:** `ESC-060-report.md` tồn tại, mỗi AC có tx hash/screenshot.

---

**QA-01 · High** — QA được ACCEPT mà không chạy lại; thang severity không định nghĩa

- **Path:** `QA_REVIEW_PROMPT.md:L16-22`; `qa-review/SKILL.md:L17`; `ESC-020-qa-report.md:L35-36, L99`; `ESC-030-qa-report.md:L44, L87`; `ESC-040-qa-report.md:L47, L94-100`.
- **Bằng chứng:** Cả 3 QA report ACCEPT với build "NOT RE-RUN" và luồng E2E "NOT RUN"; severity dùng INFO/LOW không được định nghĩa ở đâu. ESC-040 QA ACCEPT dù 5 mục NOT RUN (IPFS, AI verify, admin, withdraw).
- **Đề xuất:** MR-13: định nghĩa severity (dùng thang ở mục 6 của báo cáo này); `ACCEPT` chỉ khi reviewer chạy lại suite bắt buộc; nếu không chạy được ⇒ `ACCEPT WITH LIMITATIONS` + task follow-up bắt buộc trước Release Gate.
- **Tiêu chí xác nhận:** QA report mới có mục "Commands rerun by reviewer" với output.

---

**QA-02 · High** — Release Gate chưa từng chạy; không tách demo-ready / production-ready

- **Path:** `RELEASE_GATE_PROMPT.md`; `README.md:L75-78`; `contracts/deployments/43113.json`; `SLIDE_AND_VIDEO_SCRIPT.md:L55-62`.
- **Bằng chứng:** Không có release gate report. Prompt thiếu kiểm tra đo được cho các điểm loại bài của BTC (mọi link mở ẩn danh — `COMPETITION_CONTEXT.md:L34`), README còn 4 mục `[TBD]` (gồm địa chỉ Fuji đã có), bản Fuji chạy cửa sổ demo 600/600/90 s, mock IPFS, `AGENT_AUTO`, số dư ví agent, video dự phòng. "Production-ready" chỉ được nhắc 1 câu (L35).
- **Đề xuất:** Viết lại thành checklist có cột "Lệnh/bằng chứng" và 2 cấp: `DEMO-READY` (bắt buộc trước 21/11) và `PRODUCTION-READY` (ghi là *không đạt* + lý do: testnet, owner EOA, không audit độc lập, cửa sổ demo).
- **Tiêu chí xác nhận:** `docs/agent-ops/reports/RELEASE-GATE-<date>.md` tồn tại trước 20/11 với verdict từ 3 lựa chọn.

---

**QA-03 · Medium** — AC không đo được / sai so với hệ thống

- **Path:** `tasks/ESC-030.md:L48` (`createTrade(itemValue)` — sai chữ ký, đúng là `(address,uint256)`); `ESC-040.md:L61` (CLIP); `ESC-050.md:L49` (`escrowAddress/tokenAddress` vs `escrow/token`); `ESC-070.md:L48` (177 tests); `ESC-030.md:L71` vs `FRONTEND_SPEC.md:L110` (nonce "hiện nguyên không cắt" vs 8 ký tự); `TASK_TEMPLATE.md:L38-42`.
- **Đề xuất:** Template thêm cột "Verification method" và "Evidence artifact" cho mỗi AC; Cowork kiểm AC với code trước khi dispatch.
- **Tiêu chí xác nhận:** Task Spec mới không có AC nào thiếu 2 cột này.

---

**QA-04 · Medium** — Review diff/regression chưa được chuẩn hoá ở phía QA

- **Path:** `QA_REVIEW_PROMPT.md:L7`; `implement-task/SKILL.md:L21`.
- **Bằng chứng:** Implementer phải chạy `git diff --check/--stat`; QA prompt chỉ hỏi "có sửa file ngoài scope không" — không yêu cầu đối chiếu tự động danh sách file đổi với allowed paths, không định nghĩa suite regression theo module.
- **Đề xuất:** QA bắt buộc dán `git diff --name-only <base>..<head>` và đánh dấu từng file IN/OUT scope; regression = suite bắt buộc của mọi module bị chạm.
- **Tiêu chí xác nhận:** QA report có bảng file IN/OUT.

---

**QA-05 · Medium** — Không có vòng đời trạng thái task

- **Path:** `TASK_TEMPLATE.md:L10`; `tasks/ESC-0x0.md:L8` (tất cả `READY`); `MASTER_DISPATCH.md:L21-29`.
- **Bằng chứng:** Mọi task file vẫn `Status: READY` dù đã merge; trạng thái thật chỉ nằm trong CURRENT_STATUS (và cũng lệch).
- **Đề xuất:** MR-15 — một bảng trạng thái duy nhất trong MASTER_DISPATCH, task file chỉ chứa spec.
- **Tiêu chí xác nhận:** Trạng thái MASTER_DISPATCH khớp lịch sử merge.

---

## 9. Risk Assessment

| ID | Severity | Rủi ro | Khả năng xảy ra trước 21/11 | Ảnh hưởng chính | Trạng thái |
|---|---|---|---|---|---|
| RA-01 | Critical | Rule AI authority không thực thi được | Cao (mọi task chạm agent) | Agent BLOCK/vi phạm; QA không có chuẩn | BLOCKED |
| PC-02 | Critical | Pitch nói "giải ngân" trong khi contract chỉ giữ cọc | Cao (slide/video đang soạn) | Technical, Impact, Presentation | BLOCKED |
| SEC-01 | Critical | Người gọi tự chọn listing image để điều khiển attest | Trung bình | Bypass cơ chế AI — differentiator | OPEN |
| RA-02 | High | Không có precedence | Cao | Quyết định không lặp lại | OPEN |
| RA-03 | High | Source of truth lỗi thời | Đã xảy ra | Agent dùng dữ liệu sai | OPEN |
| RA-04 | High | Decision Log không quản trị | Đã xảy ra | Không biết quyết định nào của Owner | OPEN (Owner) |
| PC-01 | High | State machine BR sai | Cao | UI/test/slide sai | OPEN |
| PC-03 | High | "Không có human arbitrator" sai | Cao | Creativity claim | BLOCKED |
| SEC-02 | High | Fail-open auth; rate-limit chung | Trung bình | DoS demo | OPEN |
| SEC-03 | High | Owner tập trung quyền | Thấp (testnet) | Claim "trustless" | BLOCKED |
| SEC-04 | High | Disputed kẹt vô hạn | Thấp | Câu hỏi giám khảo | BLOCKED |
| SE-01 | High | Bỏ qua quy trình | Đã xảy ra | Lọt lỗi bảo mật | OPEN |
| TST-01/02/03 | High | Test rule mỏng, skip, frontend 0 test | Cao | Claim test sai | OPEN |
| QA-01/02 | High | QA không rerun; gate chưa chạy | Cao | Rủi ro bị loại (link) / demo hỏng | OPEN |
| Medium (27) | Medium | RA-05..09, PC-04..07, SEC-05..08, SEC-10, SE-02..05, SE-07, TST-04..08, QA-03..05 | — | Tài liệu/độ tin cậy | OPEN |
| Low (5) | Low | PC-08, PC-09, SE-06, SE-08, SEC-09 | — | Vệ sinh | OPEN |

> Ghi chú kết hợp rủi ro: SE-01 (quy trình bị bỏ qua) là nguyên nhân khiến SEC-01 lọt vào `main` không qua review độc lập. Khi lập kế hoạch, xử lý SEC-01 và QA hậu kiểm SE-01 trong cùng một đợt.

**Đếm theo nhóm:** RA 9 · PC 9 · SEC 10 · SE 8 · TST 8 · QA 5 = 49.

---

## 10. Đề xuất cấu trúc rules mới

Nguyên tắc: **KISS/YAGNI — chỉ thêm file khi xoá được trùng lặp hoặc lấp lỗ hổng có bằng chứng**; còn 5 ngày tới feature freeze nên ưu tiên sửa nội dung hơn tái cấu trúc.

```text
CLAUDE.md                         # ≤ 40 dòng: pointer + role matrix + precedence (tham chiếu AGENTS.md)
.agents/
  AGENTS.md                       # always-on: precedence, role matrix, Definition of Done, merge gate
  rules/
    10-product-scope.md           # sửa: bỏ cấm reputation/admin; tham chiếu REQ-ID
    20-architecture.md            # sửa: bỏ câu "frontend chỉ khi tồn tại"; thêm API contract (MR-18)
    30-backend.md                 # glob backend/** ; thêm auth fail-closed, error mapping
    40-smart-contract.md          # glob contracts/** ; thêm checklist centralization/liveness/setAgent
    50-ai-cv-pipeline.md          # ĐỔI TÊN + viết lại cho OpenCV/Tesseract/QR: input binding, eval, limits
    55-ai-authority.md            # MỚI, always_on: một định nghĩa duy nhất về quyền AI (sau DEC của Owner)
    60-frontend-ui.md             # glob frontend/** ; tiêu chí đo được + lint/tsc/simulate bắt buộc
    70-security.md                # always_on ; thêm config toggles, upload/IPFS, privacy, branding
    80-testing.md                 # always_on ; tham chiếu TEST_MATRIX + skip policy
    90-git-docs.md                # sửa: nguồn duy nhất cho worktree/ownership/branch naming/doc-sync
  skills/
    implement-task/SKILL.md       # thêm bước: kiểm độ tươi context, chạy TEST_MATRIX rows
    qa-review/SKILL.md            # thêm: rerun bắt buộc, bảng file IN/OUT, severity scale
    project-discovery/SKILL.md    # giữ
    release-gate/SKILL.md         # MỚI (thay cho prompt rời): DEMO-READY vs PRODUCTION-READY
docs/
  context/                        # mỗi file có header Status / Last verified / Verified against commit
  agent-ops/
    MASTER_DISPATCH.md            # bảng trạng thái duy nhất + Active ownership
    TASK_TEMPLATE.md              # + Traces REQ, Verification method, Evidence artifact, Deploy authorized
    QA_REVIEW_PROMPT.md           # hợp nhất vào skills/qa-review (giữ file làm pointer)
    RELEASE_GATE_PROMPT.md        # hợp nhất vào skills/release-gate (giữ file làm pointer)
    TEST_MATRIX.md                # MỚI (TST-01)
    RISK_REGISTER.md              # MỚI (mục 9 của báo cáo này làm bản khởi tạo)
  audit/
    AGENT_RULES_AUDIT_REPORT.md   # file này
```

**Hierarchy đề xuất (precedence):**

1. Chỉ thị hiện tại của Project Owner (ghi lại vào DEC nếu là quyết định bền vững).
2. `DECISION_LOG.md` — dòng `CONFIRMED` có `Approved via`.
3. Hành vi của contract đã deploy (`deployments/43113.json`) và code trên `main` — cho câu hỏi "hệ thống đang làm gì".
4. `BUSINESS_REQUIREMENTS.md` → `PRODUCT_VISION.md` → `TECH_STACK.md`.
5. `docs/specs/*`.
6. Task Spec.
7. Reports (chỉ là bằng chứng, không phải yêu cầu).

Khi (3) lệch (2)/(4): agent **báo lệch, không tự sửa** docs nghiệp vụ hay code để "khớp".

---

## 11. Danh sách file cần sửa, tạo mới hoặc hợp nhất

> Tất cả là **đề xuất**; mỗi mục cần Task Spec + Owner duyệt. Audit này không thực hiện thay đổi nào.

| # | File | Hành động | Finding | Chặn bởi |
|---|---|---|---|---|
| 1 | `.agents/AGENTS.md` | Sửa: precedence, role matrix, merge gate, liên kết 55-ai-authority | RA-01, RA-02, SE-01 | Owner Q1, Q8 |
| 2 | `CLAUDE.md` | Sửa: bỏ L57 "chưa tạo", bỏ `.agents/` trùng, thay L71 bằng precedence, thêm role Claude Code | RA-02, RA-03, SE-01 | Q8 |
| 3 | `.agents/rules/10-product-scope.md` | Sửa L11 | RA-08 | — |
| 4 | `.agents/rules/20-architecture.md` | Sửa L9; thêm API contract | RA-03, SE-02 | — |
| 5 | `.agents/rules/30-backend.md` | Thêm auth fail-closed, error mapping, input binding | SEC-01, SEC-02, SE-05 | — |
| 6 | `.agents/rules/40-smart-contract.md` | Thêm checklist SEC-10 | SEC-03, SEC-04, SEC-10 | Q4 |
| 7 | `.agents/rules/50-ai-pipeline.md` → `50-ai-cv-pipeline.md` | Viết lại cho CV | TST-06, SEC-01 | — |
| 8 | `.agents/rules/55-ai-authority.md` | **Tạo mới** | RA-01 | **Q1** |
| 9 | `.agents/rules/60-ui-ux.md` | Sửa L8; tiêu chí đo được; simulate bắt buộc | RA-03, RA-06, TST-03 | — |
| 10 | `.agents/rules/70-security.md` | Sửa L14 (tham chiếu 55); thêm toggles/upload/privacy/branding | RA-01, SEC-05..08 | Q1, Q6 |
| 11 | `.agents/rules/80-testing.md` | Viết lại theo TEST_MATRIX + skip policy | TST-01, TST-02 | — |
| 12 | `.agents/rules/90-git-docs.md` | Nguồn duy nhất cho ownership/branch/doc-sync; `.gitattributes` | RA-09, SE-07, SE-08 | — |
| 13 | Frontmatter 9 rule | Đổi trigger (always_on/glob) | RA-07 | Xác minh cú pháp Antigravity |
| 14 | `.agents/skills/qa-review/SKILL.md` | Rerun bắt buộc, file IN/OUT, severity | QA-01, QA-04 | — |
| 15 | `.agents/skills/implement-task/SKILL.md` | Kiểm độ tươi context + TEST_MATRIX | WR-01, TST-01 | — |
| 16 | `.agents/skills/release-gate/SKILL.md` | **Tạo mới**, hợp nhất `RELEASE_GATE_PROMPT.md` | QA-02 | — |
| 17 | `docs/agent-ops/QA_REVIEW_PROMPT.md`, `RELEASE_GATE_PROMPT.md` | **Hợp nhất** vào skill, giữ pointer | RA-09 | — |
| 18 | `docs/agent-ops/TASK_TEMPLATE.md` | Thêm Traces/Verification/Evidence/Deploy authorized/Status lifecycle | QA-03, QA-05, RA-05 | — |
| 19 | `docs/agent-ops/TEST_MATRIX.md` | **Tạo mới** | TST-01 | — |
| 20 | `docs/agent-ops/RISK_REGISTER.md` | **Tạo mới** từ mục 9 | WR-15 | — |
| 21 | `docs/agent-ops/MASTER_DISPATCH.md` | Cập nhật trạng thái; thêm 4D/4E, Active ownership; bỏ "còn N ngày" | RA-03, SE-01, QA-05 | — |
| 22 | `docs/agent-ops/tasks/ESC-060.md`, `ESC-070.md` | Viết lại AC | TST-08, QA-03, SE-06 | Q2, Q3 |
| 23 | `docs/agent-ops/tasks/ESC-0xx` cho 4D/4E | **Tạo hậu kiểm** + QA report; `ESC-050-qa-report.md` | SE-01 | — |
| 24 | `docs/context/BUSINESS_REQUIREMENTS.md` | State machine 6 state; cancelUnfunded; reputation; owner powers; windows; REQ-ID | PC-01, PC-04, PC-05, PC-08, SEC-03 | Q2, Q3, Q5 |
| 25 | `docs/context/PRODUCT_VISION.md` | "giải ngân", "không có human arbitrator", path specs | PC-02, PC-03, RA-03 | **Q2, Q3** |
| 26 | `docs/context/DECISION_LOG.md` | **Chỉ Owner**: SUPERSEDED DEC-005/011; DEC cho AI authority, QR nonce, reputation, escrow scope; cột Approved via | RA-04 | **Owner** |
| 27 | `docs/context/OPEN_QUESTIONS.md` | Q-003/Q-010/Q-013 cập nhật; thêm câu hỏi mục 13 | RA-03 | — |
| 28 | `docs/context/TECH_STACK.md`, `PROJECT_BRIEF.md`, `CURRENT_STATUS.md`, `USER_PERSONAS.md` | Doc-sync; header độ tươi; bỏ số test cứng | RA-03, PC-07, SE-06 | — |
| 29 | `docs/specs/FRONTEND_SPEC.md` | Endpoint mới, bỏ "code thắng spec", sửa L398 | SE-02, RA-02, PC-09 | — |
| 30 | `docs/specs/SLIDE_AND_VIDEO_SCRIPT.md` | Nonce timing, arbitration claim, số test, "giải ngân" | PC-02, PC-03, PC-06, SE-06 | Q2, Q3 |
| 31 | `docs/specs/L1_MODULE_SPEC.md` | Sửa tham chiếu "CLAUDE.md mục 6" | RA-03 | — |
| 32 | `README.md` | Thuộc ESC-070 (điền địa chỉ Fuji, link, bỏ Phase 3B, số test từ report) | RA-03, SE-06, QA-02 | — |
| 33 | `.gitattributes` | **Tạo mới** | SE-08 | Owner (config repo) |
| 34 | Code (ngoài phạm vi rules — cần Task Spec riêng) | `attest_service.py` input binding + fail-closed; `auto_agent.py`/`lib/backend.ts` đổi chuỗi TrustPact; `errors.ts` thứ tự regex; `api/pin` mock guard | SEC-01, SEC-02, SEC-08, TST-03, SEC-05 | Q1, Q7 |

---

## 12. Thứ tự ưu tiên thực hiện

Bối cảnh thời gian: hôm nay **11/11**, feature freeze **16/11**, nộp bài **21/11 23:59**. Đề xuất chia 4 đợt; mỗi đợt kết thúc bằng QA report.

| Đợt | Hạn đề xuất | Việc | Finding | Lý do ưu tiên |
|---|---|---|---|---|
| **0 — Owner decisions** | 12/11 | Trả lời Q1–Q5 mục 13 (≤ 30 phút) | RA-01, PC-02, PC-03, SEC-03, SEC-04, PC-05 | Mọi việc sau phụ thuộc; câu trả lời quyết định có sửa contract (phải trước 16/11) hay chỉ sửa docs |
| **1 — Chặn lỗi nghiêm trọng (code + rule tối thiểu)** | 13–14/11 | (a) Task Spec sửa SEC-01 (+ test); (b) đổi chuỗi TrustPact (SEC-08); (c) `AGENTS.md` precedence + role matrix + merge gate; (d) `55-ai-authority.md` theo Q1; (e) QA hậu kiểm 4D/4E/ESC-050 | SEC-01, SEC-08, RA-01, RA-02, SE-01 | Trước freeze; trực tiếp ảnh hưởng Technical 25% + Avalanche 25% |
| **2 — Doc-sync nguồn sự thật** | 15–16/11 | BR (state machine, cancelUnfunded, reputation, owner), Vision, TECH_STACK, OPEN_QUESTIONS, CURRENT_STATUS, MASTER_DISPATCH, FRONTEND_SPEC endpoints; DEC hygiene (Owner) | RA-03, RA-04, PC-01, PC-04, PC-05, PC-07, SE-02 | Agent viết slide/README ở Phase 7 sẽ đọc các file này |
| **3 — Test & Release gate** | 17–19/11 | TEST_MATRIX + skip policy; ESC-060 viết lại AC và chạy; release-gate skill; Release Gate report (DEMO-READY); số liệu test từ lần chạy thật | TST-01, TST-02, TST-08, QA-01, QA-02, SE-06 | Tránh claim sai trong slide/video; kiểm link ẩn danh (rủi ro bị loại) |
| **4 — Sau nộp bài (trước/hoặc sau Demo Day 30/11)** | 22–29/11 | Rule trigger, CV rule viết lại + eval set, frontend lint/test, parity tests, dependency lock, `.gitattributes`, CI, invariant mở rộng | RA-07, TST-03..07, SE-03, SE-04, SE-07, SE-08, SEC-10 | Giá trị dài hạn; một phần (eval set) có thể kịp cho Demo Day |

Nếu thời gian không đủ, **tối thiểu bắt buộc trước 21/11**: Đợt 0, SEC-01, SEC-08, PC-02/PC-03 (sửa câu chữ pitch), QA-02 (Release Gate với kiểm tra link ẩn danh).

---

## 13. Các câu hỏi cần Project Owner quyết định

| # | Câu hỏi | Vì sao cần | Lựa chọn đề xuất | Finding |
|---|---|---|---|---|
| **Q1** | Định nghĩa chính xác quyền của AI Agent: được ký những hàm nào, `attest` sạch có được mở `resolveClean` tự động không, cửa sổ phản bác tối thiểu bao lâu? | Rule hiện tại cấm điều DEC-013 cho phép | (A) Giữ thiết kế hiện tại, sửa rule: "AI chỉ ký `attest`; release do contract quyết định sau dispute window; con người phản bác bằng `fileComplaint`" (khuyến nghị); (B) bắt buộc human confirm trước release (đổi contract) | RA-01 |
| **Q2** | Escrow giữ **chỉ cọc 2 bên** (thanh toán hàng ngoài chuỗi) hay phải giữ **tiền hàng**? | Pitch/README nói "giải ngân" | (A) Giữ mô hình cọc, sửa toàn bộ câu chữ (khuyến nghị — không đổi contract trước freeze); (B) đổi contract | PC-02 |
| **Q3** | Có công bố "không có human arbitrator" nữa không, khi owner đang là trọng tài dispute? | Differentiator chính trong slide | (A) Sửa claim: "AI tự động cho luồng sạch; dispute có trọng tài, roadmap phi tập trung" (khuyến nghị) | PC-03 |
| **Q4** | Chấp nhận rủi ro `Disputed`/`flagged` không có timeout và owner có thể đổi agent bất kỳ lúc nào cho bản MVP? | Liveness & centralization | (A) Chấp nhận + ghi Known Limitations (khuyến nghị nếu không muốn redeploy); (B) thêm dispute timeout / khoá `setAgent` khi có trade mở (redeploy trước 16/11) | SEC-03, SEC-04 |
| **Q5** | Xác nhận tham số reputation: violator −10, victim +5 (đang có trong contract, chưa có DEC)? | Tham số kinh tế chưa được phê duyệt | Xác nhận bằng DEC hoặc yêu cầu đổi | PC-05 |
| **Q6** | Chính sách privacy cho ảnh/video bằng chứng công khai trên IPFS và endpoint `/trade/{id}/uris`? | Có thể lộ PII | Chấp nhận cho demo + cảnh báo trong UI | SEC-07 |
| **Q7** | Khi `AGENT_AUTO=true`, có tắt/giới hạn đường `/verify-evidence` thủ công (chỉ dùng listing đã ký) không? | SEC-01 | Giới hạn (khuyến nghị) | SEC-01 |
| **Q8** | Vai trò của Claude Code (đã code 4D/4E và deploy ESC-050): chính thức được viết code/deploy hay chỉ Antigravity? Cowork có được merge/sửa docs context không? | Role matrix | Ghi rõ trong AGENTS.md/CLAUDE.md | SE-01 |
| **Q9** | Xác nhận lại DEC-013 và tạo DEC cho QR nonce; đánh `SUPERSEDED` cho DEC-005 (phần "chỉ sau 16/11") và DEC-011? | Decision governance | Owner tự ghi | RA-04 |
| **Q10** | Tên chính thức dự án (Q-011 đang OPEN) — cần để thay chuỗi "TrustPact" trong thông điệp ký và slide | Branding | Chốt trước 14/11 | SEC-08 |
| **Q11** | Bản contract nộp bài giữ cửa sổ demo 600/600/90 s hay deploy thêm bản cửa sổ production để trình bày? | Demo-ready vs production-ready | Giữ bản demo + ghi rõ trong README/slide | QA-02, PC-08 |
| **Q12** | Có cho phép cài thêm dependency phục vụ kiểm thử (eslint, gitleaks, Playwright) trước nộp bài không? | Nhiều đề xuất test cần cài | Chỉ eslint trước 16/11; còn lại sau nộp | TST-03, SEC-09 |

---

*Hết báo cáo. Báo cáo này không thay đổi bất kỳ file nào khác trong repository. Mọi đề xuất cần Task Specification theo `docs/agent-ops/TASK_TEMPLATE.md` và phê duyệt của Project Owner trước khi thực hiện.*
