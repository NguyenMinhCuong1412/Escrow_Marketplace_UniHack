# Task Specification — RULES UPDATE

> Nguồn: `docs/audit/AGENT_RULES_AUDIT_REPORT.md` (audit 11/11/2026, `main` @ `7a0c5e9`).
> File này theo `docs/agent-ops/TASK_TEMPLATE.md`. Chỉ sửa **rules, skills, agent-ops** — không sửa code, không sửa `docs/context/`, `docs/specs/`.

## Metadata

- **Task ID:** `ESC-090`
- **Title:** Cập nhật bộ rules/skills/agent-ops theo audit: AI authority, precedence, role matrix, test matrix, QA & Release gate
- **Priority:** P1 (phải xong trước Phase 7 viết slide/README)
- **Status:** READY — sau khi Owner hoàn tất mục **Owner prerequisites** bên dưới
- **Requested by:** Cowork (PM/QA) theo phê duyệt của Project Owner ngày 12/11/2026
- **Assigned role:** Docs/Process Engineer (Antigravity, một agent, không có subagent ghi song song)
- **Branch/worktree:** `ops/esc-090-rules-update` (tách từ `main` mới nhất sau khi Owner commit DEC-014..017)
- **Related decision:** DEC-013; DEC-014 (Q1-A), DEC-015 (Q8), DEC-016 (Q7), DEC-017 (Q10) — xem Phụ lục A
- **Hạn:** report trước **15/11/2026 23:59**; Cowork QA 16/11 (feature freeze). Nộp bài 21/11/2026 23:59.

## Owner decisions đã phê duyệt (12/11/2026)

| Q | Quyết định | Áp dụng trong task này |
|---|---|---|
| Q1 | **Phương án A**: AI Agent chỉ ký `attest()`; giải phóng cọc do contract quyết định qua `resolveClean` sau `DISPUTE_WINDOW`; con người phản bác bằng `fileComplaint`. Không đổi contract | Tạo `55-ai-authority.md`, sửa AGENTS §5.3, rule 50, rule 70 |
| Q7 | Verify thủ công chỉ dùng ảnh niêm yết đã có chữ ký seller (code: ESC-080) | Rule input binding (30, 50, 55) |
| Q8 | **Antigravity + Claude Code** đều được viết code theo Task Spec; chỉ Owner merge/deploy (hoặc Spec ghi `Deploy authorized: Yes`); Cowork chỉ đọc, viết Spec, review | Role matrix trong AGENTS.md, CLAUDE.md |
| Q10 | Tên chính thức: **Escrow Marketplace** | Rule branding (70) |
| Scope | Chỉ rules + agent-ops (Đợt 1 phần rules + Đợt 3 của audit). Doc-sync `docs/context/` để task riêng | Out of scope bên dưới |

**Chưa quyết (không được tự chốt trong task này):** Q2 (escrow giữ cọc hay tiền hàng), Q3 (claim "không có human arbitrator"), Q4 (liveness `Disputed`), Q5 (reputation −10/+5), Q6 (privacy), Q11, Q12 (cài eslint/gitleaks/Playwright). Rule nào phụ thuộc các câu này chỉ được tham chiếu "chờ Owner (Qx)", không ghi nội dung nghiệp vụ.

## Owner prerequisites (trước khi dispatch)

1. Owner dán 4 dòng DEC-014..017 (Phụ lục A) vào `docs/context/DECISION_LOG.md` với status `CONFIRMED`, commit lên `main`. Agent **không** tự ghi Decision Log.
2. (Khuyến nghị, không chặn) Owner đánh `SUPERSEDED` cho DEC-011 và phần "chỉ sau feature freeze 16/11" của DEC-005 (Phụ lục A).
3. Nếu bước 1 chưa xong → agent dừng `BLOCKED`, không viết số DEC tạm.

## Context

Audit kết luận bộ rules có khung tốt nhưng chưa đủ an toàn để dẫn dắt agent (điểm A 45, D 38, E 40). Các vấn đề task này xử lý:

- **RA-01 (Critical):** `AGENTS.md:L39`, `50-ai-pipeline.md:L14-15`, `70-security.md:L14` cấm AI ký transaction, trong khi DEC-013 và code (`backend/chain.py:L129` chỉ gọi `attest`) cho AI tự `attest()`. Rule không thực thi được.
- **RA-02 (High):** không có thứ tự ưu tiên nguồn sự thật; `CLAUDE.md:L71` ("không hỏi lại user") xung đột `AGENTS.md:L10` ("stop and report").
- **RA-03 (High, phần rules):** rules/CLAUDE.md/MASTER_DISPATCH viết cho trạng thái trước Phase 4A (`CLAUDE.md:L57`, `60-ui-ux.md:L8`, `20-architecture.md:L9`, `MASTER_DISPATCH.md:L24-29, L86`).
- **SE-01 (High):** 4D/4E/ESC-050 merge không có Task Spec/QA report; không có role matrix, không có merge gate.
- **TST-01, TST-02 (High):** `80-testing.md` không định nghĩa loại test bắt buộc; test bị skip vẫn được báo "ALL PASS".
- **QA-01, QA-02 (High):** QA được ACCEPT khi không rerun; Release Gate chưa từng chạy, không tách DEMO-READY/PRODUCTION-READY.
- Medium/Low đi kèm: RA-06, RA-07, RA-08, RA-09, SEC-05, SEC-06, SEC-08, SEC-10, SE-02, SE-03, SE-07, SE-08 (phần rule), QA-03, QA-04, QA-05, WR-01..16.

## Goal

1. Không còn mâu thuẫn giữa rules và DEC-013/DEC-014: một định nghĩa duy nhất về quyền AI, các file khác chỉ tham chiếu.
2. Có precedence, role matrix, merge gate, task lifecycle, skip policy, test matrix, QA rerun policy, release gate 2 cấp — mỗi quy tắc có cách kiểm chứng pass/fail.
3. Mỗi quy tắc xuất hiện nguyên văn ở đúng một file.
4. Không thay đổi hành vi hệ thống (0 file code bị chạm).

## Scope – allowed files/paths

| # | File | Hành động |
|---|---|---|
| 1 | `.agents/AGENTS.md` | Sửa |
| 2 | `CLAUDE.md` | Sửa |
| 3 | `.agents/rules/10-product-scope.md` | Sửa |
| 4 | `.agents/rules/20-architecture.md` | Sửa |
| 5 | `.agents/rules/30-backend.md` | Sửa |
| 6 | `.agents/rules/40-smart-contract.md` | Sửa |
| 7 | `.agents/rules/50-ai-pipeline.md` | Viết lại nội dung (giữ tên file) |
| 8 | `.agents/rules/55-ai-authority.md` | **Tạo mới** |
| 9 | `.agents/rules/60-ui-ux.md` | Sửa |
| 10 | `.agents/rules/70-security.md` | Sửa |
| 11 | `.agents/rules/80-testing.md` | Sửa |
| 12 | `.agents/rules/90-git-docs.md` | Sửa |
| 13 | `.agents/skills/implement-task/SKILL.md` | Sửa |
| 14 | `.agents/skills/qa-review/SKILL.md` | Sửa (thành nguồn duy nhất cho QA) |
| 15 | `.agents/skills/release-gate/SKILL.md` | **Tạo mới** |
| 16 | `.agents/skills/project-discovery/SKILL.md` | Sửa nhỏ (bước kiểm độ tươi) |
| 17 | `docs/agent-ops/QA_REVIEW_PROMPT.md` | Rút gọn thành pointer |
| 18 | `docs/agent-ops/RELEASE_GATE_PROMPT.md` | Rút gọn thành pointer |
| 19 | `docs/agent-ops/TASK_DISPATCH_PROMPT.md` | Bỏ trùng lặp, tham chiếu |
| 20 | `docs/agent-ops/TASK_TEMPLATE.md` | Sửa |
| 21 | `docs/agent-ops/TEST_MATRIX.md` | **Tạo mới** |
| 22 | `docs/agent-ops/RISK_REGISTER.md` | **Tạo mới** |
| 23 | `docs/agent-ops/MASTER_DISPATCH.md` | Sửa |
| 24 | `docs/agent-ops/reports/ESC-090-report.md` | **Tạo mới** |

## Out of scope – do not edit

- `backend/`, `contracts/`, `ai-pipeline/`, `frontend/`, `scripts/` (code — vi phạm có sẵn chỉ được ghi vào `RISK_REGISTER.md`).
- `docs/context/**` (kể cả `DECISION_LOG.md`, `OPEN_QUESTIONS.md`, `CURRENT_STATUS.md`) — doc-sync là task riêng; Decision Log chỉ Owner sửa.
- `docs/specs/**`, `README.md`, `docs/audit/**`.
- `docs/agent-ops/tasks/ESC-0xx.md` hiện có (ESC-060/070 viết lại AC chờ Q2/Q3; ESC-080 đang chạy song song).
- `.gitattributes`, `.gitignore`, CI, `package.json`, `requirements*.txt` (SE-08, SE-04 là task khác, cần Owner duyệt).
- Không đổi tên/di chuyển/xoá file hiện có. Không thêm dependency.

## Dependencies

- Owner prerequisites ở trên (DEC-014..017 trên `main`).
- Chạy song song được với ESC-080 (`phase/4f-listing-binding`): không file nào trùng. ESC-080 không phải điền lại theo template mới.

---

## Nội dung thay đổi chi tiết

Quy ước: "Bắt buộc có" = nội dung phải xuất hiện (được diễn đạt lại nếu giữ nguyên nghĩa); "Văn bản chuẩn" = dùng gần như nguyên văn.

### C-01 · `.agents/rules/55-ai-authority.md` (mới) — RA-01, MR-03, MR-04

Văn bản chuẩn:

```markdown
---
trigger: always_on
description: "Định nghĩa duy nhất về quyền hạn của AI Agent trên escrow. Áp dụng cho mọi task."
---

# AI Authority Boundary

Nguồn: DEC-013, DEC-014, DEC-016. Đây là định nghĩa duy nhất; các file khác chỉ tham chiếu file này.

## AI Agent được phép
- Đọc state on-chain, tải bằng chứng, tính điểm rủi ro, công bố report có hash khớp `reportHash`.
- Ký và gửi **duy nhất** `attest(tradeId, riskScore, flagged, reportHash)` bằng ví agent (`onlyAgent`),
  tối đa một lần mỗi trade, khi trade ở `AwaitingEvidence` và đủ bằng chứng.

## Hệ quả của attest (contract quyết định, không phải AI)
- `flagged=false` và không ai khiếu nại trong `DISPUTE_WINDOW` → bất kỳ ai gọi `resolveClean` → hoàn cọc hai bên.
  Đây là hành vi CONFIRMED, không phải vi phạm rule.
- `flagged=true` không tự phạt ai; tranh chấp do trọng tài xử lý qua `resolveDispute` (`onlyOwner`).
- Mọi bên phản bác được bằng `fileComplaint` trong `DISPUTE_WINDOW`
  (production theo DEC-008; bản Fuji demo theo `contracts/deployments/43113.json`).

## AI Agent không được
- Gửi bất kỳ giao dịch nào khác `attest` (gồm `resolveClean`, `resolveDispute`, `fileComplaint`, `cancel*`,
  `withdraw`, `setAgent`, `deposit`, `submitEvidence`, `createTrade`) hoặc dùng ví agent cho mục đích khác.
- Dùng input chưa được neo. Mọi input ảnh hưởng `attest` phải là (a) bằng chứng có hash khớp on-chain, hoặc
  (b) ảnh niêm yết có chữ ký ví seller trong `UriRegistry`. Giá trị client gửi kèm request không thay thế được (a)/(b).
- Chỉ định bên vi phạm hoặc đề xuất kết quả `resolveDispute`.

## Thay đổi boundary
Thêm lời gọi giao dịch mới cho agent, đổi điều kiện/ngưỡng/input của `attest`, hoặc đổi cửa sổ thời gian
⇒ cần DEC mới do Owner CONFIRMED + `Security review required: Yes` + test theo `docs/agent-ops/TEST_MATRIX.md`.

## Cách kiểm chứng
- `grep -n "functions\.\w*(" backend/*.py` chỉ có lời gọi **giao dịch** `attest`; còn lại là `.call()` đọc.
- Vi phạm hiện có được theo dõi trong `docs/agent-ops/RISK_REGISTER.md` (SEC-01 → ESC-080).
```

### C-02 · `.agents/AGENTS.md` — RA-02, RA-09, SE-01, MR-01, MR-15..17, WR-01..04

Bắt buộc có (giữ cấu trúc 7 mục hiện tại, thêm mục 0 và 2a; tổng ≤ 130 dòng):

- **§0 Precedence (văn bản chuẩn):**
  1. Chỉ thị hiện tại của Project Owner (quyết định bền vững phải được ghi thành DEC).
  2. `DECISION_LOG.md` — dòng `CONFIRMED`.
  3. Contract đã deploy (`contracts/deployments/43113.json`) và code trên `main` — cho câu hỏi "hệ thống đang làm gì".
  4. `BUSINESS_REQUIREMENTS.md` → `PRODUCT_VISION.md` → `TECH_STACK.md`.
  5. `docs/specs/*`. 6. Task Spec. 7. Reports (chỉ là bằng chứng, không phải yêu cầu).
  - Khi (3) lệch (2)/(4): **báo lệch trong report, không tự sửa** docs nghiệp vụ hay code để "khớp". Nếu lệch chặn được task → `BLOCKED`.
- **§1 Source of truth:** thêm bước kiểm độ tươi: nếu file context có header `Verified against commit` khác `HEAD` hoặc không có header → coi là "chưa xác minh", đối chiếu claim quan trọng với code trước khi dùng (WR-01).
- **§2a Role matrix (văn bản chuẩn):**

| Hành động | Project Owner | Antigravity | Claude Code | Cowork |
|---|---|---|---|---|
| Đọc repo | ✓ | ✓ | ✓ | ✓ |
| Sửa application code | ✓ | ✓ khi có Task Spec `READY` | ✓ khi có Task Spec `READY` | ✗ |
| Viết Task Spec, QA report, Release Gate report | ✓ | ✗ | ✗ | ✓ |
| Sửa `.agents/**`, `CLAUDE.md` | ✓ | ✓ chỉ khi Task Spec có trong scope | ✓ chỉ khi Task Spec có trong scope | ✗ (chỉ đề xuất) |
| Sửa `docs/context/**` (trừ Decision Log) | ✓ | ✓ chỉ khi Task Spec có trong scope | ✓ chỉ khi Task Spec có trong scope | ✗ |
| Ghi dòng `CONFIRMED`/`SUPERSEDED` trong `DECISION_LOG.md` | ✓ duy nhất | ✗ (chỉ thêm dòng `PROPOSED`) | ✗ (chỉ thêm dòng `PROPOSED`) | ✗ |
| Merge PR | ✓ duy nhất | ✗ | ✗ | ✗ |
| Deploy testnet | ✓ | chỉ khi Spec ghi `Deploy authorized: Yes` và Owner xác nhận trong phiên | như Antigravity | ✗ |
| Mainnet / tiền thật | ✗ (DEC-003) | ✗ | ✗ | ✗ |

- **§4 Parallel-agent safety:** thay toàn bộ bằng 1 câu tham chiếu `.agents/rules/90-git-docs.md` (nguồn duy nhất) — RA-09.
- **§5.3:** thay bằng "Quyền hạn của AI Agent: xem `.agents/rules/55-ai-authority.md`." — xoá câu "AI output must never be the sole authority…".
- **§6 Verification:** thêm (a) skip policy tham chiếu `80-testing.md`; (b) **vi phạm đã biết**: vi phạm có sẵn trong code được ghi ở `RISK_REGISTER.md` không làm task khác bị `BLOCKED` nếu task không có scope sửa nó, nhưng task không được làm vi phạm đó tệ hơn.
- **§7 DoD + merge gate (văn bản chuẩn):** "Không merge khi chưa có `docs/agent-ops/reports/<TASK_ID>-qa-report.md` với verdict `ACCEPT` hoặc `ACCEPT WITH LIMITATIONS`. Ngoại lệ fast-track: PR ghi `Fast-track approved by Owner`, và QA report hậu kiểm phải có trong 24 giờ sau merge."
- **Decision governance (MR-16):** agent chỉ được đề xuất DEC với status `PROPOSED`; DEC tạo trong cùng commit với code phải là `PROPOSED`.

### C-03 · `CLAUDE.md` — RA-02, RA-03, SE-01 (≤ 60 dòng)

- Xoá dòng `.agents/` lặp (L24 hoặc L27, giữ một).
- L56: `ai-pipeline/ # pHash + ORB + OCR + QR nonce (CLIP tuỳ chọn, mặc định HSV histogram)`.
- L57: `frontend/ # Next.js 14 + wagmi/viem`.
- Thêm `.agents/rules/55-ai-authority.md`, `docs/agent-ops/TEST_MATRIX.md`, `RISK_REGISTER.md`, `.agents/skills/release-gate/` vào cây thư mục.
- Mục Workflow (L60-64): thay bằng tham chiếu role matrix `AGENTS.md §2a`; nêu Claude Code là engineering agent ngang Antigravity theo Task Spec.
- L71: thay bằng "Khi cần thông tin, đọc `docs/context/` theo precedence `AGENTS.md §0`; nếu nguồn mâu thuẫn hoặc thiếu quyết định → hỏi Owner."

### C-04 · `.agents/rules/10-product-scope.md` — RA-08

- L11 → "Không tự thêm tokenomics, DAO, oracle, cross-chain, yield. Reputation và trang admin chỉ trong phạm vi BR/DEC đã CONFIRMED; mở rộng cần Owner."
- L13 → tham chiếu precedence `AGENTS.md §0`.

### C-05 · `.agents/rules/20-architecture.md` — RA-03, SE-02, SE-03, TST-05

- L9 → "Bốn module: `contracts/`, `backend/`, `ai-pipeline/`, `frontend/`. `backend` import `ai-pipeline` qua `sys.path` (`backend/attest_service.py`) là boundary đã chấp nhận; không thêm đường import chéo khác."
- Thêm **API contract**: đổi endpoint/request/response backend ⇒ cập nhật mô tả API trong `docs/specs/FRONTEND_SPEC.md §4` trong cùng PR (file đó do task doc-sync sở hữu; nếu Task Spec không có quyền sửa → ghi vào report mục "Docs cần sync").
- Thêm **ABI sync**: đổi ABI contract ⇒ cập nhật đồng thời `backend/abi/Escrow.json` và `frontend/lib/abi/Escrow.json` trong cùng PR.
- Thêm **parity strings**: `listing_message` (Python) ↔ `listingMessage` (TS), canonical JSON report hash (Python ↔ viem) phải đổi đồng thời hai phía; khi có parity test thì test là nguồn kiểm chứng.

### C-06 · `.agents/rules/30-backend.md` — SEC-01, SEC-02, SE-05, MR-04, MR-05, RA-06

Bắt buộc có:

- **Auth fail-closed:** khi kết nối chain khác `31337` (anvil), backend phải từ chối khởi động nếu `ATTEST_API_KEY` rỗng. Proxy Next.js công khai không được coi là cơ chế xác thực người dùng.
- **Rate-limit:** khoá theo định danh có ý nghĩa (trade/ví/IP thật qua proxy tin cậy), không theo IP của proxy.
- **Input binding:** tham chiếu `55-ai-authority.md` — không dùng giá trị client gửi thay cho dữ liệu đã neo on-chain hoặc đã ký.
- **Error model:** không trả `str(exception)` cho client; trả `error_code` + thông điệp chuẩn, log chi tiết phía server.
- **Logging có thể kiểm chứng:** log mỗi lượt verify/attest có `trade_id`, `phase`, `duration_ms`, `result`; không log secret, URL RPC có key, header auth.
- Ghi chú: code hiện vi phạm fail-open/rate-limit/error (SEC-02, SE-05) → đã có trong `RISK_REGISTER.md`.

### C-07 · `.agents/rules/40-smart-contract.md` — SEC-03, SEC-04, SEC-10, RA-09

Giữ L8–L15, thêm checklist (mỗi mục pass/fail trong QA report khi chạm `contracts/src/**`):

1. Centralization: mọi quyền của `owner`/`agent` được liệt kê trong report và khớp `55-ai-authority.md`.
2. Liveness: mọi state không kết thúc có lối thoát, hoặc được ghi Known Limitation trong `RISK_REGISTER.md` (hiện: `Disputed` — chờ Owner Q4).
3. `setAgent`: ghi rõ ảnh hưởng tới trade đang mở.
4. Randomness: ghi rõ `block.prevrandao` trong nonce là dự đoán được, không dùng cho bảo mật.
5. Test: fuzz + invariant bắt buộc khi đổi logic tiền/trạng thái (`TEST_MATRIX.md`).
6. Static analysis (Slither): tuỳ chọn, chỉ khi Owner duyệt cài đặt.
- Deploy/redeploy: chỉ khi Task Spec ghi `Deploy authorized: Yes`; sau feature freeze 16/11 cần Owner xác nhận lại.
- L16 → "Không tự chốt ai có quyền release/refund/dispute; xem `55-ai-authority.md` và BR."

### C-08 · `.agents/rules/50-ai-pipeline.md` — viết lại cho CV pipeline (TST-06, SEC-01, RA-01)

Giữ tên file; đổi `description` và tiêu đề thành "AI / Computer Vision Pipeline Rules". Bắt buộc có:

- Phạm vi: `ai-pipeline/**`, `backend/auto_agent.py`, `backend/attest_service.py` (phần gọi pipeline).
- Input: ảnh/video/URI là dữ liệu không tin cậy; giới hạn kích thước, thời lượng video, timeout, MIME theo magic bytes.
- Input binding: tham chiếu `55-ai-authority.md`.
- Tái lập: report ghi phiên bản pipeline, `embedding_backend`, các ngưỡng (`PHASH_REUSE_THRESHOLD`, `MIN_GOOD_INLIERS`, ngưỡng flag) và nguồn nonce (QR / OCR).
- Đổi ngưỡng/trọng số điểm rủi ro ⇒ cần bằng chứng đánh giá (tập ảnh gắn nhãn, confusion matrix) + DEC mới; **không công bố accuracy/FPR/FNR chưa đo**.
- Nếu sau này thêm LLM: giữ một dòng về prompt injection / tách instructions khỏi nội dung.
- Xoá L14–L15 (mâu thuẫn DEC-013).

### C-09 · `.agents/rules/60-ui-ux.md` — RA-03, RA-06, TST-03, WR-10

- L8 → "Frontend: `frontend/` (Next.js 14, wagmi/viem). Không tạo frontend thứ hai."
- Thay L9, L14, L15 bằng 5 kiểm tra đo được: contrast text thường ≥ 4.5:1; focus nhìn thấy được; mọi input có label; hoàn thành luồng chính chỉ bằng bàn phím; viewport 375px không cuộn ngang.
- Thêm: gọi `simulateContract` trước `writeContract` (theo FRONTEND_SPEC); `npm run build` pass; `npx tsc --noEmit` pass; lint chỉ bắt buộc khi ESLint đã được cài (chờ Owner Q12) — không được ghi "0 lỗi ESLint" khi chưa chạy lint thật.
- Thêm: tên hiển thị theo `70-security.md` (branding).

### C-10 · `.agents/rules/70-security.md` — RA-01, SEC-05..09, WR-09

- L14 → "Quyền hạn AI: xem `55-ai-authority.md`."
- L11 → "Baseline: OWASP ASVS 5.0 **Level 1** cho bản demo."
- Thêm **toggle nguy hiểm**: `ALLOW_LOCAL_HOSTS=true`, `ENFORCE_EVIDENCE_HASH=false`, `ATTEST_API_KEY` rỗng, IPFS mock (thiếu `PINATA_JWT`) chỉ được phép trên chain `31337`; trên `43113` là FAIL của Release Gate.
- Thêm **upload/IPFS**: mock CID không được dùng ngoài `31337`; kiểm magic bytes; nội dung IPFS là công khai, vĩnh viễn.
- Thêm **privacy**: chính sách chờ Owner (Q6); tối thiểu không log URI bằng chứng kèm địa chỉ ví ở mức INFO.
- Thêm **branding (Q10/DEC-017)**: chuỗi người dùng thấy hoặc ký dùng tên "Escrow Marketplace"; không dùng tên dự án khác.
- Thêm **secret scan**: trước khi công khai repo phải scan theo nội dung lịch sử git (công cụ cần Owner duyệt); scan theo tên file không đủ.
- Frontmatter → `always_on`.

### C-11 · `.agents/rules/80-testing.md` — TST-01, TST-02, WR-03, WR-05, WR-06, SE-06

- Frontmatter → `always_on`.
- Risk tier: **P0** tiền/quyền/state on-chain; **P1** quyết định AI, auth, đường tới `attest`; **P2** UI/docs. Loại test bắt buộc theo tier: xem `docs/agent-ops/TEST_MATRIX.md`.
- **Skip policy (văn bản chuẩn):** "Chạy pytest với `-rs`. Report phải dán dòng tổng kết `N passed, M failed, K skipped`. Test bị skip trong suite bắt buộc của module bị chạm ⇒ task `BLOCKED`, không được báo PASS."
- Số lượng test chỉ lấy từ output lần chạy gần nhất có trong report; không ghi cứng trong rules/docs.

### C-12 · `.agents/rules/90-git-docs.md` — nguồn duy nhất cho git/ownership (RA-09, SE-07, SE-08, WR-11, WR-12)

- Định nghĩa duy nhất cho: worktree/branch riêng cho writer; 1 file = 1 writer; không merge/reset/force-push/xoá branch khi chưa có Owner.
- Branch naming: đúng tên trong Task Spec; mẫu `phase/<phase>-<slug>` cho tính năng, `ops/<task-id>-<slug>` cho quy trình/docs.
- **Active ownership**: bảng trong `MASTER_DISPATCH.md` do Owner/Cowork cập nhật khi dispatch. Agent kiểm tra bảng trước khi bắt đầu; nếu path trong scope đang thuộc task khác → `BLOCKED`.
- **Line endings:** trên Windows, so `git diff --stat` với `git diff --ignore-cr-at-eol --stat`; chỉ stage file có thay đổi nội dung; không commit thay đổi chỉ do CRLF.
- **Doc-sync mapping** (thay L15):

| Thay đổi | File phải cập nhật (hoặc ghi "Docs cần sync" trong report nếu ngoài scope) |
|---|---|
| Endpoint/schema backend | `docs/specs/FRONTEND_SPEC.md §4` |
| State/transition/tham số contract | `docs/context/BUSINESS_REQUIREMENTS.md` + DEC |
| Thành phần AI pipeline/ngưỡng | `docs/context/TECH_STACK.md` + DEC |
| Quyết định nghiệp vụ mới | `DECISION_LOG.md` (dòng `PROPOSED`) |
| Trạng thái task | `docs/agent-ops/MASTER_DISPATCH.md` |

### C-13 · Frontmatter trigger — RA-07

| File | Trigger mới |
|---|---|
| `55-ai-authority.md`, `70-security.md`, `80-testing.md` | `always_on` |
| `30-backend.md` | glob `backend/**` |
| `40-smart-contract.md` | glob `contracts/**` |
| `50-ai-pipeline.md` | glob `ai-pipeline/**, backend/auto_agent.py, backend/attest_service.py` |
| `60-ui-ux.md` | glob `frontend/**` |
| `10`, `20`, `90` | giữ `model_decision` |

**Trước khi đổi:** xác minh cú pháp trigger mà Antigravity hỗ trợ (tài liệu chính thức hoặc UI Rules của Antigravity) và dán bằng chứng vào report. Nếu không xác minh được cú pháp glob → giữ `model_decision` cho 30/40/50/60, chỉ đổi 3 file `always_on`, ghi limitation.

### C-14 · `.agents/skills/qa-review/SKILL.md` — nguồn duy nhất cho QA (QA-01, QA-04, MR-13)

Bắt buộc có:

- **Verdict:** `ACCEPT` · `ACCEPT WITH LIMITATIONS` · `CHANGES_REQUESTED` · `BLOCKED`.
- **Rerun policy:** `ACCEPT` chỉ khi reviewer tự chạy lại build + suite bắt buộc của module bị chạm (mục "Commands rerun by reviewer" kèm output). Không rerun được ⇒ tối đa `ACCEPT WITH LIMITATIONS` + task follow-up bắt buộc trước Release Gate.
- **Scope check:** dán `git diff --name-only <base>...<head>`, đánh IN/OUT cho từng file; file OUT ⇒ `CHANGES_REQUESTED`.
- **Severity scale** (lấy từ audit mục 6): Critical = có thể mất/khoá tiền, agent hành động không an toàn trên luồng lõi, hoặc tuyên bố sai chức năng lõi khi pitch; High = agent quyết định sai/BLOCK luồng chính hoặc lỗ hổng khai thác được; Medium = sai lệch có giới hạn; Low = vệ sinh.
- Kiểm skip policy (80) và AC có cột Verification method/Evidence (TASK_TEMPLATE).
- Với task chạm đường tới `attest`: đối chiếu `55-ai-authority.md`.
- Output: `docs/agent-ops/reports/<TASK_ID>-qa-report.md`.

### C-15 · `.agents/skills/release-gate/SKILL.md` (mới) — QA-02, MR-14

Checklist có cột "Lệnh / bằng chứng", 2 cấp:

- **DEMO-READY** (bắt buộc trước 21/11/2026 23:59): mọi link nộp bài (repo, slide, video) mở được ở cửa sổ ẩn danh; README không còn `[TBD]`; địa chỉ contract Fuji khớp `contracts/deployments/43113.json`; không toggle nguy hiểm nào bật trên `43113` (70); IPFS không ở chế độ mock; ví agent đủ gas cho demo; `AGENT_AUTO` đúng cấu hình demo; video dự phòng có sẵn; test suite bắt buộc chạy với skip = 0 hoặc skip được Owner chấp nhận bằng văn bản; mọi Critical/High trong `RISK_REGISTER.md` có trạng thái FIXED hoặc ACCEPTED-BY-OWNER; slide/video không claim chức năng chưa có (đối chiếu Q2/Q3 khi Owner đã quyết).
- **PRODUCTION-READY**: luôn ghi "không đạt" kèm lý do (testnet, owner EOA, không audit độc lập, cửa sổ demo ngắn) trừ khi các điều kiện đó thay đổi.
- Verdict: `ACCEPT FOR DEMO` · `ACCEPT WITH KNOWN LIMITATIONS` · `REJECT/BLOCKED`. Output: `docs/agent-ops/reports/RELEASE-GATE-<YYYY-MM-DD>.md`.

### C-16 · `.agents/skills/implement-task/SKILL.md` và `project-discovery/SKILL.md` — WR-01, TST-01

- implement-task: thêm bước kiểm độ tươi context (AGENTS §1); bước áp dụng các dòng `TEST_MATRIX.md` ghi trong Task Spec; bước skip policy; bước "Docs cần sync" trong report; dùng `git diff --ignore-cr-at-eol` khi review diff.
- project-discovery: thêm bước ghi file context lỗi thời (so với code) vào output.

### C-17 · `docs/agent-ops/TASK_TEMPLATE.md` — QA-03, QA-05, RA-05, WR-16

- `Status` → lifecycle: `DRAFT → READY → IN_PROGRESS → IN_REVIEW → ACCEPTED → MERGED` (+ `BLOCKED`, `CHANGES_REQUESTED`); ghi chú "trạng thái thật chỉ nằm trong MASTER_DISPATCH".
- Metadata thêm: `Deploy authorized: Yes/No`, `Risk tier: P0/P1/P2`.
- AC đổi thành bảng: `ID | Tiêu chí | Traces (REQ-ID khi BR có ID; tạm thời: mục BR/DEC) | Verification method | Evidence artifact`.
- Test Requirements thêm: `TEST_MATRIX rows applied`, `Skip policy` (tham chiếu 80).
- `Security review required` → bắt buộc **Yes** nếu chạm `contracts/src/**`, `backend/attest_service.py`, `backend/auto_agent.py`, `backend/chain.py`, `frontend/app/api/**`, file env/config.
- Deliverables thêm: `Docs cần sync`, `Known violations touched (RISK_REGISTER IDs)`.

### C-18 · `docs/agent-ops/TEST_MATRIX.md` (mới) — TST-01, TST-04, TST-05, TST-07

- Bảng module × tier từ audit TST-01 (contracts / backend / ai-pipeline / frontend / cross-module).
- Lệnh chuẩn: `forge test` (trong `contracts/`), `pytest -rs` (từ gốc repo, `pytest.ini` gom `ai-pipeline/tests` + `backend/tests`), `npm run build` (trong `frontend/`).
- Điều kiện môi trường để integration không bị skip: `anvil` trong PATH, Tesseract cài đặt.
- Mục "Gap đã biết" (không bắt task hiện tại làm): invariant thiếu handler `withdraw`, frontend 0 test, không parity test, không failure-injection/concurrency/recovery — mỗi mục trỏ ID audit.

### C-19 · `docs/agent-ops/RISK_REGISTER.md` (mới) — WR-15

- Khởi tạo từ audit mục 9 + các finding code. Cột: `ID | Severity | Mô tả | Owner/Task xử lý | Trạng thái (OPEN / IN_PROGRESS / FIXED / ACCEPTED-BY-OWNER / BLOCKED-OWNER) | Ngày cập nhật`.
- Trạng thái ban đầu: RA-01 → `FIXED` khi ESC-090 merge (để `IN_PROGRESS`); SEC-01, SEC-08, TST-03 (errors.ts) → `IN_PROGRESS (ESC-080)`; PC-02, PC-03, SEC-03, SEC-04, PC-05, SEC-07 → `BLOCKED-OWNER`; còn lại `OPEN`.
- Ghi chú: ai được đổi `ACCEPTED-BY-OWNER` = chỉ Owner.

### C-20 · `docs/agent-ops/MASTER_DISPATCH.md` — RA-03, SE-01, QA-05, RA-09

- Phase Index: 4A/4B/4C/5 → `MERGED` (PR #2–#5); thêm 4D (auto-agent, PR #6) và 4E (QR nonce, PR #7) với Task Spec `— (merged không có spec; QA hậu kiểm: pending)`; thêm 4F `ESC-080` (`READY`), `ESC-090` (`IN_PROGRESS`); 6, 7 giữ `BLOCKED` kèm lý do.
- Thêm bảng **Active ownership** (`Task | Branch | Paths | Agent | Since`), điền ESC-080 và ESC-090.
- "Quy tắc quan trọng": thay các bullet trùng bằng tham chiếu `AGENTS.md` / `90-git-docs.md`; bullet deploy → "Không deploy trừ khi Task Spec ghi `Deploy authorized: Yes` và Owner xác nhận trong phiên"; bullet report → thêm "dòng tổng kết test có skipped".
- Bước khởi động: thêm "đọc `55-ai-authority.md`, `TEST_MATRIX.md`".
- Deadline: xoá dòng "Còn 13 ngày…"; giữ ngày tuyệt đối + feature freeze 16/11/2026.

### C-21 · Pointer files — RA-09

- `QA_REVIEW_PROMPT.md`: ≤ 10 dòng, trỏ `.agents/skills/qa-review/SKILL.md`; giữ câu "Không chấp nhận chỉ dựa vào lời agent tự báo done".
- `RELEASE_GATE_PROMPT.md`: ≤ 10 dòng, trỏ `.agents/skills/release-gate/SKILL.md`.
- `TASK_DISPATCH_PROMPT.md`: bước 5–6 → tham chiếu `90-git-docs.md`; bước 1 thêm `55-ai-authority.md`.

---

## Acceptance Criteria

| ID | Tiêu chí | Traces | Verification method | Evidence artifact |
|---|---|---|---|---|
| AC-01 | Ba câu mâu thuẫn DEC-013 không còn | RA-01 | `grep -rn "sole authority\|AI không tự ký transaction\|Never let AI output directly trigger\|phải có human review" .agents CLAUDE.md docs/agent-ops/*.md` → rỗng | Output grep trong report |
| AC-02 | `55-ai-authority.md` tồn tại, `trigger: always_on`, có đủ 5 mục của C-01, tham chiếu DEC-013/014/016 | RA-01, MR-03, MR-04 | Đọc file + `grep -n "^trigger: always_on" .agents/rules/55-ai-authority.md` | Đường dẫn + output |
| AC-03 | AGENTS §5, rule 50, rule 70 chỉ tham chiếu 55, không định nghĩa lại quyền AI | RA-01, RA-09 | `grep -rn "55-ai-authority" .agents` ≥ 4 kết quả (AGENTS, 50, 70, 30) | Output grep |
| AC-04 | Precedence 7 bậc chỉ được định nghĩa ở `AGENTS.md §0`; `CLAUDE.md` và `10-product-scope.md` tham chiếu | RA-02 | `grep -rn "không hỏi lại user" CLAUDE.md` rỗng; đọc §0 | Output grep + trích §0 |
| AC-05 | Role matrix đúng bảng C-02 (Q8) và merge gate + fast-track có trong AGENTS §7 | SE-01, MR-15, MR-17 | Cowork đối chiếu bảng | Trích đoạn trong report |
| AC-06 | Không còn câu lỗi thời về frontend/thời gian | RA-03 | `grep -rn "chưa tạo, Phase 4A\|không tự tạo frontend\|frontend chỉ khi xác nhận\|Còn \*\*13 ngày" .agents CLAUDE.md docs/agent-ops/*.md` → rỗng | Output grep |
| AC-07 | Quy tắc worktree/1-writer chỉ được định nghĩa ở `90-git-docs.md` | RA-09 | `grep -rln "1 file = 1 owner\|one writer per file\|cùng sở hữu một file" .agents CLAUDE.md docs/agent-ops/*.md` → chỉ `90-git-docs.md` | Output grep |
| AC-08 | Trigger đúng bảng C-13, hoặc fallback có bằng chứng | RA-07 | `head -4 .agents/rules/*.md`; link/ảnh tài liệu cú pháp Antigravity | Output + nguồn |
| AC-09 | Kịch bản nạp rule: (a) task sửa `contracts/src/Escrow.sol`; (b) task sửa `backend/auto_agent.py` — Antigravity liệt kê rule được nạp | RA-07 | (a) phải có 40, 55, 70, 80; (b) phải có 30, 50, 55, 70, 80 | Ảnh chụp/log danh sách rule trong Antigravity |
| AC-10 | Skip policy văn bản chuẩn có trong 80; qa-review kiểm skip | TST-02 | Đọc 80 + skill | Trích đoạn |
| AC-11 | `TEST_MATRIX.md` có đủ 5 module, 3 tier, lệnh chuẩn, điều kiện môi trường, mục gap | TST-01 | Đọc file | Đường dẫn |
| AC-12 | qa-review có 4 verdict, rerun policy, bảng IN/OUT, severity scale; `QA_REVIEW_PROMPT.md` ≤ 10 dòng trỏ skill | QA-01, QA-04 | `wc -l`; đọc file | Output |
| AC-13 | release-gate skill có 2 cấp, mỗi mục DEMO-READY có cột lệnh/bằng chứng, gồm kiểm link ẩn danh và toggle nguy hiểm | QA-02 | Đọc file | Đường dẫn |
| AC-14 | TASK_TEMPLATE có lifecycle, `Deploy authorized`, `Risk tier`, bảng AC 5 cột, tiêu chí Security review | QA-03, QA-05, WR-16 | Đọc file | Trích đoạn |
| AC-15 | `RISK_REGISTER.md` có ≥ 49 dòng finding (đủ ID audit) với trạng thái ban đầu theo C-19 | WR-15 | `grep -c "^| \(RA\|PC\|SEC\|SE\|TST\|QA\)-" docs/agent-ops/RISK_REGISTER.md` ≥ 49 | Output |
| AC-16 | MASTER_DISPATCH khớp lịch sử merge, có 4D/4E/4F/ESC-090 và bảng Active ownership | RA-03, SE-01 | `git log --oneline --merges -8` so với bảng | Output + bảng |
| AC-17 | Không có hành vi/quyền mới ngoài các DEC đã CONFIRMED (không tự chốt Q2–Q6, Q11, Q12) | AGENTS §1.3 | Cowork đọc diff | QA report |
| AC-18 | Giới hạn độ dài: AGENTS.md ≤ 130 dòng, CLAUDE.md ≤ 60, mỗi rule ≤ 45 dòng, mỗi pointer ≤ 10 | KISS | `wc -l` | Output |
| AC-19 | Mọi đường dẫn file trong backtick ở các file đã sửa tồn tại (trừ placeholder `<...>`, `ESC-XXX`) | RA-03 | Script kiểm path (xem Kiểm tra bắt buộc #5) | Output script |
| AC-20 | Chỉ file trong Scope bị đổi; 0 file code | Scope | `git diff --name-only main...HEAD` ⊆ bảng Scope; `git diff --name-only main...HEAD -- backend contracts ai-pipeline frontend scripts docs/context docs/specs README.md` rỗng | Output |

## Test Requirements

- **TEST_MATRIX rows applied:** P2 (docs/process). Không có code → không chạy `forge test`/`pytest`/`npm run build`; ghi `NOT RUN – không áp dụng (docs-only)`.
- **Kiểm tra bắt buộc** (dán lệnh + output vào report):
  1. `git status` và `git branch --show-current` (baseline + cuối).
  2. Các lệnh grep của AC-01, 03, 04, 06, 07, 15.
  3. `head -4 .agents/rules/*.md` (AC-08) và `wc -l` các file (AC-18).
  4. `git diff --check main...HEAD` → không lỗi whitespace.
  5. Kiểm path (AC-19), ví dụ (chạy từ gốc repo):

     ```bash
     git diff --name-only main...HEAD -- '*.md' \
       | xargs grep -ohE '`[A-Za-z0-9_./-]+\.(md|py|ts|tsx|sol|json)`' \
       | tr -d '`' | sort -u \
       | while read -r p; do [ -e "$p" ] || echo "MISSING $p"; done
     ```

     Mọi dòng `MISSING` phải được giải thích (tên file không kèm thư mục, hoặc path tương đối có ngữ cảnh).
  6. `git diff --name-only main...HEAD` (AC-20) và `git diff --ignore-cr-at-eol --stat main...HEAD` để xác nhận không có thay đổi chỉ do CRLF.
  7. Kịch bản AC-09 trong Antigravity (không sửa file, chỉ hỏi agent liệt kê rules).
- **Skip policy:** không áp dụng (không có test runner).
- **Security review required? Yes** — task định nghĩa lại AI authority và quy tắc bảo mật; Cowork review đối chiếu DEC-013/014, `backend/chain.py`, `contracts/src/Escrow.sol`.

## Implementation constraints

- Đọc `.agents/AGENTS.md`, audit mục 3–13, và Phụ lục A trước khi sửa.
- Tiếng Việt cho nội dung mới (khớp đa số rules hiện có); thuật ngữ/tên hàm giữ tiếng Anh.
- Thay đổi nhỏ nhất đủ đạt AC; không viết lại file ngoài các mục C-01..C-21.
- Không đổi tên/di chuyển/xoá file. Không thêm dependency.
- Giữ line ending hiện có của từng file; không commit file chỉ đổi CRLF.
- Commit trên `ops/esc-090-rules-update`; không merge, không push force.
- Gặp điểm phải quyết định nghiệp vụ không có trong bảng Owner decisions → ghi `BLOCKED` cho mục đó, làm tiếp các mục khác.

## Deliverables

`docs/agent-ops/reports/ESC-090-report.md` gồm:

- Files changed (bảng file ↔ mục C-xx).
- Diff/commit hash.
- Kết quả từng AC-01..AC-20 (PASS/FAIL/BLOCKED) kèm evidence.
- Output các kiểm tra bắt buộc 1–7.
- Bằng chứng cú pháp trigger Antigravity (C-13).
- Docs cần sync (các chỗ trong `docs/context/`, `docs/specs/` phát hiện còn lệch, để task doc-sync sau).
- Known limitations.
- Docs/status updated: `MASTER_DISPATCH.md` (trong scope); `docs/context/` KHÔNG.

## Review outcome

- Reviewer: Cowork (theo `.agents/skills/qa-review/SKILL.md` **mới** — task này tự áp dụng chuẩn mới)
- Result: ACCEPT / ACCEPT WITH LIMITATIONS / CHANGES_REQUESTED / BLOCKED
- Findings:
- Owner approval:

---

## Phụ lục A — Dòng Decision Log để Owner dán (không phải việc của agent)

| ID | Date | Decision | Status | Rationale | Owner | Evidence / Related task |
|---|---|---|---|---|---|---|
| DEC-014 | 2026-11-12 | AI Agent chỉ được ký `attest()`. `attest` sạch + không có khiếu nại trong `DISPUTE_WINDOW` → bất kỳ ai gọi `resolveClean`. Mọi bên phản bác bằng `fileComplaint`. Tranh chấp do owner xử lý qua `resolveDispute`. Agent không gửi giao dịch nào khác. Không đổi contract | CONFIRMED | Phương án A của Q1 (audit RA-01); khớp DEC-013 và code hiện tại | Quốc | `docs/audit/AGENT_RULES_AUDIT_REPORT.md` RA-01; ESC-090 |
| DEC-015 | 2026-11-12 | Role matrix: Antigravity và Claude Code viết code theo Task Spec READY; chỉ Owner merge; deploy testnet chỉ khi Spec ghi `Deploy authorized: Yes`; Cowork đọc, viết Spec, QA | CONFIRMED | Q8; đóng SE-01 | Quốc | ESC-090 |
| DEC-016 | 2026-11-12 | Verify thủ công `/verify-evidence` chỉ dùng ảnh niêm yết đã có chữ ký seller trong `UriRegistry`; giá trị client gửi khác → từ chối | CONFIRMED | Q7; đóng SEC-01 | Quốc | ESC-080 |
| DEC-017 | 2026-11-12 | Tên chính thức dự án: **Escrow Marketplace** | CONFIRMED | Q10 / Q-011; bỏ chuỗi "TrustPact" | Quốc | ESC-080 |

Khuyến nghị thêm: DEC-011 → `SUPERSEDED` (frontend đã code từ ESC-020); DEC-005 → `SUPERSEDED` bởi DEC-013 (phần "chỉ sau feature freeze 16/11").
