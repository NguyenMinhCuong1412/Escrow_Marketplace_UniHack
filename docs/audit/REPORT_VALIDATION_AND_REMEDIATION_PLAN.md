# REPORT VALIDATION & REMEDIATION PLAN — Escrow Marketplace (UniHack 2026)

| Mục | Giá trị |
|---|---|
| Loại | Thẩm định độc lập 2 báo cáo audit + lập kế hoạch khắc phục (READ-ONLY đối với code, rules, tests) |
| Ngày | 2026-11-12 |
| Reviewer | Cowork — Technical Lead / Independent Auditor / Task Planner |
| Trạng thái repo được đối chiếu | Working tree `ops/esc-090-rules-update` @ `e5c2123` (= `main` @ `e29487b` + commit ESC-090 chỉ chạm docs/rules). Code ứng dụng giống hệt `7a0c5e9`. |
| Báo cáo được thẩm định | [AGENT_RULES_AUDIT_REPORT.md](AGENT_RULES_AUDIT_REPORT.md) (gọi tắt **AR**, 49 finding) · [FULL_PROJECT_AUDIT_REPORT.md](FULL_PROJECT_AUDIT_REPORT.md) (gọi tắt **FP**, untracked, 25 finding được tách ở đây) |
| Kế hoạch thực thi | [../agent-ops/remediation/REMEDIATION_MASTER_PLAN.md](../agent-ops/remediation/REMEDIATION_MASTER_PLAN.md) |
| Mốc thời gian | Feature freeze **16/11/2026** (DEC-012) · Nộp bài **21/11/2026 23:59** · Demo Day 30/11/2026 |

> **Giới hạn của lần thẩm định này**
> - **Không chạy được test nào.** Shell trên máy không có `forge`/`anvil`, `python3 -m pytest` báo `ModuleNotFoundError: No module named 'pytest'`, `frontend/node_modules` chưa có; nhiệm vụ cấm cài dependency. Mọi kết luận là **phân tích tĩnh** trên mã nguồn tại commit nêu trên. Không có dòng nào trong tài liệu này khẳng định một test đã PASS.
> - Số dòng `file:Lx` là số dòng thật đọc được tại working tree (đã bỏ `\r`).
> - "OUTDATED" cho các finding về rules nghĩa là đã được sửa trên nhánh `ops/esc-090-rules-update` (ESC-090) và/hoặc DEC-014..017 trên `main`; **ESC-090 chưa qua QA và chưa merge**.

---

## 1. Tóm tắt

**Kết luận chung:**

1. **AR (AGENT_RULES_AUDIT_REPORT) đáng tin cậy.** Mọi bằng chứng mã nguồn được lấy mẫu kiểm tra đều khớp code thật. 13/49 finding đã lỗi thời nhờ DEC-014..017 và ESC-090; 7 finding chờ Owner; 28 finding vẫn đúng.
2. **FP (FULL_PROJECT_AUDIT_REPORT) KHÔNG đáng tin cậy làm nguồn bằng chứng.** Các kết luận lớn trùng với AR (PC-02, SEC-01, TrustPact) là đúng. Tuy nhiên phần lớn **đoạn code được trích dẫn không tồn tại trong repo**: `ReentrancyGuardUpgradeable`, `DEPOSIT_PERCENT`, mapping `balances`, `claimExpiredEvidence`, `DEPOSIT_TIMEOUT`, `resolveDispute(tradeId, buyerPct, sellerPct)`, state `AwaitingDeposit/Completed`, `CollectibleToken` là ERC-721, `httpx.AsyncClient`, 7 file test Foundry, "60 req/min". Kết quả "80 tests passed / 7 suites" mâu thuẫn với repo (3 file test, 81 hàm `test*`/`invariant*`). 6 finding là false positive. FP cũng dùng lại mã `ESC-080..085` trùng với `ESC-080` thật (SEC-01), gây nhầm lẫn khi dispatch (NEW-06).
3. **Phát hiện mới quan trọng nhất (NEW-02, P1):** khi đăng ký URI bằng chứng cho AI Agent thất bại (backend gián đoạn, reload trang trước khi tx xác nhận), không có đường khôi phục. Trade kẹt ở `waiting_uris` cho tới khi quá `ATTEST_WINDOW` thì chỉ còn hoàn cọc. Lỗi này làm hỏng luồng demo cốt lõi.
4. **Rủi ro P0 duy nhất còn mở là SEC-01**, đã có Task Spec `ESC-080` (READY, chưa thực hiện). Đây là việc đầu tiên cần giao Antigravity.

### 1.1 Thống kê thẩm định (80 finding = 49 AR + 25 FP + 6 mới)

| Trạng thái | AR | FP | Mới | Tổng |
|---|---|---|---|---|
| `VERIFIED` | 28 | 0 | 4 | **32** |
| `PARTIALLY_VERIFIED` | 0 | 5 | 0 | **5** |
| `FALSE_POSITIVE` | 0 | 6 | 0 | **6** |
| `OUTDATED` | 13 | 0 | 0 | **13** |
| `DUPLICATE` | 0 | 11 | 0 | **11** |
| `BLOCKED` | 1 | 2 | 0 | **3** |
| `NEEDS_OWNER_DECISION` | 7 | 1 | 2 | **10** |

Owner decisions cần chốt: **10** (OD-01..OD-10, mục 6). Task Spec triển khai mới: **8** (TASK-001..008), cộng 1 spec có sẵn là `ESC-080`.

### 1.2 Sức khoẻ dự án (đánh giá định tính)

| Module | Nhận định | Rủi ro chính còn mở |
|---|---|---|
| Smart contract | Tốt. CEI + `nonReentrant` + pull-fallback `pendingWithdrawals`; access control rõ; 81 hàm test gồm fuzz + 2 invariant | Mô hình chỉ giữ cọc (PC-02, chờ Owner); liveness `Disputed`/flagged (SEC-04); invariant chưa có `withdraw` (TST-04) |
| Backend | Khá. Có SSRF allowlist + chặn IP, khoá theo trade, hash bằng chứng neo on-chain | SEC-01 (P0); auth fail-open + rate-limit dồn một bucket (SEC-02); lộ exception (SE-05); mất report khi chờ receipt lỗi (NEW-01) |
| AI pipeline | Minh bạch, deterministic | Kiểm tra tái sử dụng video chỉ dùng khung 0 (FP AI-01, đã chỉnh mô tả); chưa có đánh giá định lượng (TST-06) |
| Auto agent | Đúng boundary: chỉ gửi giao dịch `attest` (`backend/chain.py:L129`) | Số lần thử reset khi restart (P3); phụ thuộc đăng ký URI (NEW-02) |
| Frontend | Có `WrongChainBanner`, chờ receipt, khoá nút khi pending | Không có test/lint; không khôi phục được URI (NEW-02); mock IPFS vẫn neo được on-chain (SEC-05); chưa dùng `simulateContract` |
| Docs/Process | Rules đã sửa trong ESC-090 (chờ QA) | `docs/context` và `docs/specs` còn lỗi thời (RA-03, PC-01, PC-06…); claim pitch chờ Owner (PC-02/03) |

---

## 2. Độ tin cậy của FULL_PROJECT_AUDIT_REPORT

| Claim trong FP | Thực tế trong repo | Bằng chứng |
|---|---|---|
| `Escrow` kế thừa `ReentrancyGuardUpgradeable` (FP §4.1.2, §14) | `ReentrancyGuard` (không upgradeable) | [`contracts/src/Escrow.sol:L4,L20`](../../contracts/src/Escrow.sol) |
| `DEPOSIT_PERCENT = 30`, `balances` mapping, `withdraw()` đọc `balances` | `MAX_DEPOSIT_BPS = 3000`; `pendingWithdrawals`; trả trực tiếp qua `_payout`, chỉ hoãn khi thất bại | `Escrow.sol:L25,L70,L312-319,L347-354` |
| State `AwaitingDeposit`, `Completed` | Enum: `Created, AwaitingEvidence, Attested, Disputed, Resolved, Cancelled` | `Escrow.sol:L36-43` |
| `cancelUnfunded` sau `DEPOSIT_TIMEOUT` 24h; `claimExpiredEvidence` thưởng cọc bên kia | Không có timeout cho `Created`; không có `claimExpiredEvidence`; `cancelOnEvidenceTimeout` hoàn **cả hai** | `Escrow.sol:L183-189,L296-309` |
| `resolveDispute(tradeId, buyerPct, sellerPct)` | `resolveDispute(uint256 tradeId, address violator)` | `Escrow.sol:L262` |
| `CollectibleToken` là ERC-721 mint "reputation NFT badge" | ERC-20 soulbound "Collectible Deposit Unit" mint/burn 1:1 với cọc | `contracts/src/CollectibleToken.sol:L4,L17,L22` |
| Backend dùng `async def`, `httpx.AsyncClient`, rate limit 60 req/min | `def` đồng bộ, `requests.Session`; verify 10 req/phút, uris 60 req/phút | `backend/attest_service.py:L260,L379,L489,L636` |
| 7 file test Foundry, "80 passed" | 3 file: `Escrow.t.sol` (68), `CollectibleToken.t.sol` (11), `EscrowInvariant.t.sol` (2 invariant) | `contracts/test/` |
| Rule `00-AGENTS.md`; 30-backend "COMPLIANT" | Không có file `00-AGENTS.md`; backend fail-open khi thiếu key (vi phạm rule 30 mới) | `.agents/AGENTS.md`; `attest_service.py:L467-472` |
| Thiếu cảnh báo/switch mạng | Có `WrongChainBanner` + `useSwitchChain`; `isWrongChain` khoá nút | `frontend/components/WrongChainBanner.tsx:L4,L10,L29`; `frontend/app/trade/[id]/page.tsx:L74-75` |
| Message ký `"…\nTrade ID: …\nURI: …"` | Message có các dòng `chain:`, `escrow:`, `trade:`, `uri:` | `backend/auto_agent.py:L74-84` |

**Hệ quả:** không agent nào được dùng FP làm nguồn bằng chứng hay Task Spec. Các đề xuất `ESC-080..085` trong FP **không được dispatch**. Khuyến nghị Owner thêm ghi chú đầu file FP, hoặc chuyển FP vào `docs/audit/superseded/` (NEW-06). Audit này không sửa FP.

---

## 3. Thẩm định AGENT_RULES_AUDIT_REPORT (49 finding)

Cột: **Status** · **Bằng chứng thực tế** · **Giải thích** · **Tác động / thành phần** · **Mức (P0–P3)** · **Khắc phục** · **Task?**

### 3.1 Rule Architecture (RA)

| ID | Mô tả gốc | Status | Bằng chứng thực tế | Giải thích | Tác động | Mức | Khắc phục | Task? |
|---|---|---|---|---|---|---|---|---|
| RA-01 | Rule cấm AI ký tx mâu thuẫn DEC-013 | OUTDATED | `docs/context/DECISION_LOG.md:L21` (DEC-014 trên `main`); `.agents/rules/55-ai-authority.md` (`trigger: always_on`); grep 4 câu cũ trong `.agents`, `CLAUDE.md`, `docs/agent-ops/*.md` → rỗng | Đúng tại `7a0c5e9`; đã giải quyết bằng DEC-014 + ESC-090 | Hết mâu thuẫn khi ESC-090 merge | — | QA + merge ESC-090 | Không (QA) |
| RA-02 | Thiếu precedence | OUTDATED | `.agents/AGENTS.md` mục `## 0. Precedence`; `CLAUDE.md` không còn "không hỏi lại user" | Đã sửa trên nhánh ESC-090 | — | — | QA ESC-090 | Không |
| RA-03 | Source-of-truth lỗi thời | VERIFIED | Phần rules đã sửa. Còn: `docs/context/OPEN_QUESTIONS.md:L9` (Q-003 "Frontend CHƯA tồn tại"), `L16` (Q-010 "chưa deploy lên Fuji"), `docs/context/TECH_STACK.md:L39` (CLIP), `README.md:L66` ("42 unit tests"), `README.md` mục "Phase 3B" | Phần `docs/context`/`docs/specs`/README nằm ngoài scope ESC-090 nên vẫn sai | Agent viết slide/README ở Phase 7 sẽ chép sai | P2 | Doc-sync | **TASK-007** |
| RA-04 | Decision Log không quản trị | NEEDS_OWNER_DECISION | DEC-005, DEC-011 vẫn `CONFIRMED`; grep `SUPERSEDED` chỉ thấy dòng hướng dẫn L3 và template L30; chưa có DEC cho QR nonce | Việc này chỉ Owner được làm (role matrix DEC-015) | Không phân biệt được quyết định cũ/mới | P3 | Owner cập nhật | OD-09 |
| RA-05 | Không có REQ-ID | VERIFIED | `docs/context/BUSINESS_REQUIREMENTS.md` không có mã REQ; `TASK_TEMPLATE.md:L44` có cột `Traces` | Template đã sẵn sàng nhưng BR chưa có ID | Không truy vết được AC→REQ | P3 | Gán REQ-ID sau nộp bài | Không (hoãn) |
| RA-06 | Rule khó kiểm chứng | OUTDATED | `.agents/rules/60-ui-ux.md` (5 kiểm tra đo được); `70-security.md` (ASVS L1) | Đã sửa trong ESC-090 | — | — | QA ESC-090 | Không |
| RA-07 | Mọi rule `model_decision` | VERIFIED | 55/70/80 đã `always_on`; 30/40/50/60 vẫn `model_decision` (head `.agents/rules/*.md`); report ESC-090 §5 nói Antigravity không hỗ trợ glob (**chưa kiểm chứng độc lập**) | Phần còn lại do giới hạn công cụ | Rule domain có thể không được nạp | P3 | Chấp nhận; QA ESC-090 xác minh bằng chứng §5 | Không |
| RA-08 | Scope cấm reputation/admin | OUTDATED | `.agents/rules/10-product-scope.md:L11` đã sửa | — | — | — | — | Không |
| RA-09 | Trùng lặp quy tắc | OUTDATED | AGENTS §4 tham chiếu 90; pointer prompts | — | — | — | QA ESC-090 | Không |

### 3.2 Project Consistency (PC)

| ID | Mô tả gốc | Status | Bằng chứng thực tế | Giải thích | Tác động | Mức | Khắc phục | Task? |
|---|---|---|---|---|---|---|---|---|
| PC-01 | State machine BR ≠ contract | VERIFIED | `BUSINESS_REQUIREMENTS.md:L32-35` (`SellerDeposited`, `FullyFunded`, `EvidenceSubmitted`) vs `Escrow.sol:L36-43` | Vẫn sai | UI/test/slide sai | P2 | Vẽ lại 6 state + transition | **TASK-007** |
| PC-02 | Escrow chỉ giữ cọc, pitch nói "giải ngân" | NEEDS_OWNER_DECISION | `Escrow.sol:L136,L162,L233-244,L338-345`; "giải ngân" xuất hiện trong 5 file frontend (`app/page.tsx`, `app/layout.tsx`, `app/admin/page.tsx`, `app/trade/[id]/page.tsx`, `components/PendingWithdrawalBanner.tsx`), README và 7 file docs | Cơ chế đúng như mô tả; cách xử lý là quyết định kinh doanh (Q2) | Claim sai khi pitch (Technical/Impact) | P1 | Owner chọn mô hình | OD-01 → **TASK-008** |
| PC-03 | "Không có human arbitrator" vs owner là trọng tài | NEEDS_OWNER_DECISION | `Escrow.sol:L22,L262`; `OPEN_QUESTIONS.md:L10` (Q-004) | Như AR | Differentiator sai | P1 | Owner chọn câu chữ (Q3) | OD-02 → **TASK-008** |
| PC-04 | `cancelUnfunded` mô tả sai | VERIFIED | `Escrow.sol:L183-189` (không có deadline; party nào cũng gọi được khi `Created`) | BR + `tasks/ESC-060.md` AC-03 sai | AC E2E không kiểm chứng đúng | P3 | Sửa BR; Cowork viết lại ESC-060 | **TASK-007** + Cowork |
| PC-05 | Reputation −10/+5 chưa có DEC | NEEDS_OWNER_DECISION | `Escrow.sol:L282-283` | Tham số kinh tế chưa duyệt | Xem thêm NEW-04 | P3 | Owner xác nhận (Q5) | OD-04 |
| PC-06 | Slide nói nonce sinh "sau khi đủ cọc" | VERIFIED | `docs/specs/SLIDE_AND_VIDEO_SCRIPT.md:L17,L41`; nonce sinh trong `createTrade` `Escrow.sol:L140` | Claim kỹ thuật sai, không phụ thuộc quyết định nào | Giám khảo đọc contract sẽ thấy | P2 | Sửa câu | **TASK-007** |
| PC-07 | CLIP mô tả sai, thiếu QR | VERIFIED | `TECH_STACK.md:L39` ("CLIP embeddings"); `CLAUDE.md` đã sửa (ESC-090) | Phần context còn sai | Tài liệu sai | P3 | Doc-sync | **TASK-007** |
| PC-08 | Bảng cửa sổ thời gian không đồng nhất | VERIFIED | `Escrow.sol:L30-34`; `contracts/deployments/43113.json` (600/600/90) | — | Nhầm cấu hình demo | P3 | Một bảng 6 giá trị | **TASK-007** |
| PC-09 | FRONTEND_SPEC cho phép http URL | VERIFIED | `docs/specs/FRONTEND_SPEC.md:L398` vs `attest_service.py:L504,L637` (chỉ `ipfs://`) | — | Hướng dẫn local sai | P3 | Sửa spec | **TASK-007** |

### 3.3 Security (SEC)

| ID | Mô tả gốc | Status | Bằng chứng thực tế | Giải thích | Tác động | Mức | Khắc phục | Task? |
|---|---|---|---|---|---|---|---|---|
| SEC-01 | `/verify-evidence` nhận `listing_image_url` tuỳ ý | VERIFIED | `attest_service.py:L503-505` (chỉ kiểm tra tiền tố), `L537` (tải URL client gửi), `L640-650` (chữ ký chỉ kiểm ở `/uris`); proxy `frontend/app/api/verify/route.ts` chuyển tiếp `listing_image_url` và gắn key | Vi phạm DEC-016 và rule 55; người gọi đầu tiên chọn ảnh tham chiếu cho ORB (identity term 40%, `ai-pipeline/evidence_check.py` hàm `risk_score`) | Bỏ qua được cơ chế AI → `resolveClean` | **P0** | Ràng buộc với `UriRegistry` | **ESC-080** (có sẵn) |
| SEC-02 | API key không phải auth; fail-open; rate-limit chung bucket | VERIFIED | `attest_service.py:L467-472` (key rỗng → chỉ log warning), `L476-477` (key = `request.client.host`); proxy gắn key ở `frontend/app/api/verify/route.ts:L34`, `uris/route.ts:L45` | Sau proxy mọi người dùng chung một IP → chung 10 req/phút | DoS chức năng verify trong demo; chạy không key trên Fuji | P1 | Fail-closed khi chain ≠ 31337; key rate-limit theo client thật | **TASK-001** |
| SEC-03 | Tập trung quyền owner EOA | NEEDS_OWNER_DECISION | `Escrow.sol:L121-125,L262` | Chấp nhận/công bố hay đổi contract (Q4) | Claim "trustless" | P2 | Owner | OD-03 |
| SEC-04 | `Disputed`/flagged không lối thoát | NEEDS_OWNER_DECISION | `Escrow.sol:L236` (`!flagged`), `L262-264` (chỉ owner), `L296-298` (chỉ `AwaitingEvidence`) | Trade flagged chỉ thoát qua `fileComplaint` → owner | Kẹt cọc nếu owner vắng | P2 | Owner (Q4); test ghi nhận hành vi trong TASK-005 | OD-03 (+TASK-005 test) |
| SEC-05 | `/api/pin` mock âm thầm | VERIFIED | `frontend/app/api/pin/route.ts:L40-46` trả `ipfs://mock…` khi thiếu JWT; `components/EvidenceUploader.tsx:L96-110` chỉ hiện toast rồi vẫn `submitEvidence` | CID giả bị neo on-chain, backend không tải được | Trade chết trên Fuji nếu thiếu cấu hình | P2 | Chặn mock ngoài chain 31337 | **TASK-002** |
| SEC-06 | Toggle nguy hiểm không được kiểm soát | VERIFIED | `attest_service.py:L115,L117,L204,L221,L525` | Rule 70 mới cấm trên 43113 nhưng code chưa enforce | Tắt chống thay ảnh / SSRF | P2 | Guard + báo trong `/health` | **TASK-001** |
| SEC-07 | Lộ URI bằng chứng công khai | NEEDS_OWNER_DECISION | `attest_service.py:L460-465` (`/report`), `L663-665` (`GET /uris`) | Chính sách privacy (Q6) | PII trên IPFS | P3 | Owner | OD-05 |
| SEC-08 | Chuỗi ký "TrustPact" | VERIFIED | `backend/auto_agent.py:L79`; `frontend/lib/backend.ts:L180-183` | Vi phạm DEC-017 | Ví hiển thị tên đối thủ | P1 | Đổi đồng bộ | **ESC-080** (AC-09) |
| SEC-09 | Chưa scan secret theo nội dung | BLOCKED | Không có công cụ scan; cần Owner duyệt cài (gitleaks…) | Không kiểm chứng được | Rò rỉ key khi public repo | P2 | Owner duyệt công cụ, chạy trước Release Gate | OD-08 |
| SEC-10 | Rule 40 thiếu checklist | OUTDATED | `.agents/rules/40-smart-contract.md` có checklist 6 mục | — | — | — | — | Không |

### 3.4 Software Engineering (SE)

| ID | Mô tả gốc | Status | Bằng chứng thực tế | Giải thích | Tác động | Mức | Khắc phục | Task? |
|---|---|---|---|---|---|---|---|---|
| SE-01 | Bỏ qua quy trình Spec→QA | VERIFIED | Rule đã có merge gate (AGENTS §7). `docs/agent-ops/reports/` vẫn không có QA report cho 4D/4E/ESC-050; `MASTER_DISPATCH.md:L28-29` ghi "QA hậu kiểm: pending" | Phần rule OUTDATED; QA hậu kiểm vẫn thiếu | Code agent tự ký on-chain chưa được review độc lập | P2 | Cowork QA hậu kiểm 4D/4E/ESC-050 | Không (QA Cowork) |
| SE-02 | API spec lệch backend | VERIFIED | `FRONTEND_SPEC.md` §4 vs endpoints thật `attest_service.py:L405-669` (`/nonce-qr.png`, `/uris`, `/agent/status`) | — | Tài liệu sai | P3 | Doc-sync | **TASK-007** |
| SE-03 | ABI nhân bản 3 nơi | VERIFIED | `backend/abi/Escrow.json`, `frontend/lib/abi/Escrow.json` | Rule 20 đã có; test chưa có | Lệch ABI khi đổi contract | P3 | Không đổi contract trước nộp → hoãn | Không |
| SE-04 | Dependency không khoá | VERIFIED | `backend/requirements.txt` (`>=`), `frontend/package.json` (`^`; có `package-lock.json`) | Python không có lock | Môi trường giám khảo khác | P3 | Owner duyệt lock | OD-08 |
| SE-05 | Trả nguyên exception | VERIFIED | `attest_service.py:L425` (`RPC error: {e}`), `L435,L449,L515,L572` (`str(e)` của `ChainError`), `L559` | `ChainError` bọc lỗi web3, có thể chứa URL RPC | Lộ cấu hình | P2 | Map lỗi → `error_code` | **TASK-001** |
| SE-06 | Số test hardcode | VERIFIED | `README.md:L66` ("42 unit tests"), `DECISION_LOG.md:L9` / `PROJECT_BRIEF.md:L63` / `TECH_STACK.md:L45` (177) | Đếm tĩnh: Python 124 hàm `test_*` (57+9+38+20), contract 81 | Claim sai trên slide | P3 | Bỏ số cứng | **TASK-007** (trừ DECISION_LOG: Owner) |
| SE-07 | Branch/CI | VERIFIED | 8 branch remote `phase/*` (gồm cả `phase/4c-integration` và `phase/4c-frontend-integration` song song); không có `.github/` | — | Vệ sinh repo | P3 | Owner dọn branch; CI sau nộp | Không |
| SE-08 | Không có `.gitattributes` | VERIFIED | `ls .gitattributes` → không tồn tại | — | Diff CRLF giả | P3 | Owner duyệt | OD-08 |

### 3.5 Testing & QA (TST, QA)

| ID | Mô tả gốc | Status | Bằng chứng thực tế | Giải thích | Tác động | Mức | Khắc phục | Task? |
|---|---|---|---|---|---|---|---|---|
| TST-01 | Không có ma trận test | OUTDATED | `docs/agent-ops/TEST_MATRIX.md` | — | — | — | — | Không |
| TST-02 | Skip vẫn báo PASS | OUTDATED | `.agents/rules/80-testing.md` (skip policy) | Hành vi skip trong `backend/tests/conftest.py`, `test_integration_anvil.py:L39,L52` là hợp lệ khi có policy | — | — | — | Không |
| TST-03 | Frontend không test/lint; `errors.ts`; không `simulateContract` | VERIFIED | `frontend/package.json` không có eslint/test; `frontend/lib/errors.ts:L17` trước `L29`; grep `simulateContract` → rỗng | Rule 60 mới yêu cầu `simulateContract` → vi phạm đã biết | Thông báo lỗi sai; không bắt revert trước khi ký | P2 | `errors.ts` → ESC-080 AC-10; lint/test → OD-08; simulate → hoãn (P3) | ESC-080 + OD-08 |
| TST-04 | Invariant thiếu `withdraw` | VERIFIED | Handler `contracts/test/EscrowInvariant.t.sol:L38-125` có 10 hàm, không có `withdraw`, không có actor từ chối nhận AVAX | Nhánh rút tiền hoãn chưa được invariant phủ | Lỗ hổng kế toán tiềm ẩn chưa được chứng minh vắng mặt | P2 | Bổ sung handler | **TASK-005** |
| TST-05 | Không có parity test | VERIFIED | `auto_agent.py:L74-84` vs `frontend/lib/backend.ts:L180-189` | Cần test runner TS (chưa có) | Lệch chuỗi ký → mọi listing bị 403 | P3 | Hoãn đến OD-08 | OD-08 |
| TST-06 | Không đánh giá định lượng AI | VERIFIED | `evidence_check.py:L51-53` (ngưỡng đặt tay); test dùng ảnh tổng hợp `ai-pipeline/tests/synth.py` | — | Không trả lời được câu hỏi FPR/FNR | P2 | Harness đánh giá + bộ dữ liệu gắn nhãn | **TASK-006** |
| TST-07 | Thiếu failure-injection/concurrency/recovery | VERIFIED | Có `test_auto_agent_resumes_after_restart` và `test_auto_agent_retries_then_gives_up` (`test_integration_anvil.py:L401,L445`); không có test mất receipt / restart giữa attest | Phần lớn đúng | Xem NEW-01 | P2 | Test trong TASK-003 | **TASK-003** |
| TST-08 | ESC-060 AC không kiểm chứng được | VERIFIED | `docs/agent-ops/tasks/ESC-060.md` AC-01/03/05; không có `ESC-060-report.md` | — | E2E không có chuẩn | P2 | Cowork viết lại ESC-060 sau ESC-080 | Không (Cowork) |
| QA-01 | QA ACCEPT không rerun | OUTDATED | `.agents/skills/qa-review/SKILL.md:L28,L45` | — | — | — | — | Không |
| QA-02 | Release Gate chưa chạy | OUTDATED | `.agents/skills/release-gate/SKILL.md` | Skill có; **chưa chạy** → việc lịch trình | — | — | Chạy Release Gate trước 20/11 | Không (Cowork) |
| QA-03 | AC không đo được | OUTDATED | `TASK_TEMPLATE.md:L44` | — | — | — | — | Không |
| QA-04 | QA không kiểm IN/OUT | OUTDATED | qa-review skill | — | — | — | — | Không |
| QA-05 | Không có lifecycle | OUTDATED | `MASTER_DISPATCH.md:L28-43` | — | — | — | — | Không |

---

## 4. Thẩm định FULL_PROJECT_AUDIT_REPORT (25 finding, đánh số FPA-xx)

| ID | Finding trong FP (vị trí FP) | Status | Bằng chứng thực tế | Giải thích | Mức | Khắc phục / Task |
|---|---|---|---|---|---|---|
| FPA-01 | PC-02 collateral-only (§1.3-1, §4.1.1) | DUPLICATE (PC-02) | `Escrow.sol:L136,L162,L338-345` | Kết luận đúng; **toàn bộ đoạn code trích dẫn sai** | P1 | OD-01 |
| FPA-02 | SEC-01 listing không neo (§4.2.1, §5.2) | DUPLICATE (SEC-01) | `attest_service.py:L503-537` | Kết luận đúng. Code trích sai (FP ghi `async`, `HTTPException(400)`; thực tế 422). Sơ đồ tấn công dùng `https://attacker.com/...` nhưng backend chỉ nhận `ipfs://` (L504) — kẻ tấn công cần pin ảnh lên IPFS (vẫn dễ) | P0 | ESC-080 |
| FPA-03 | Chuỗi "TrustPact" (§1.3-3, §4.4.2) | DUPLICATE (SEC-08) | `auto_agent.py:L79` | Định dạng message FP trích sai | P1 | ESC-080 |
| FPA-04 | QR prefix `"TP1:"` (§1.3-3, TD-01) | PARTIALLY_VERIFIED | `evidence_check.py:L409,L413-414,L456` | Tồn tại, nhưng là payload máy đọc, không phải "chuỗi người dùng thấy hoặc ký" (rule 70). Đổi sang `EM1:` làm hỏng mã QR đã in cho trade đang mở trên Fuji, trừ khi giữ tương thích ngược | P3 | Không làm trước nộp bài |
| FPA-05 | AutoAgent mất state khi restart (§1.3-4, §4.4.1, TD-02) | PARTIALLY_VERIFIED | `auto_agent.py:L103-107,L177-181` | Đúng là `status`/`_cursor` nằm trong RAM. **Sai** ở "infinite retry": mỗi lần restart tối đa thêm `MAX_ATTEMPTS=5` lần, có backoff 15/30/60/120 s (L92-93, L181-183). Quét lại từ trade 1 chỉ tốn một `getTrade` cho mỗi trade đã kết thúc. Đề xuất SQLite là thừa | P3 | Lưu attempts ra JSON trong **TASK-003** |
| FPA-06 | AI-01 video chỉ dùng khung 0 (§1.3-5, §4.3.1) | PARTIALLY_VERIFIED | `evidence_check.py:L644-646` | **Mô tả sai cơ chế:** khung 0 chỉ dùng cho *kiểm tra tái sử dụng* với kho pHash (và là pHash buyer được lưu ở `attest_service.py:L574`), không phải so seller↔buyer. Identity match (L659-663) và nonce (L668-674) đã duyệt mọi keyframe. **Rủi ro thật khác FP:** (a) video tái sử dụng có khung đầu khác không bị bắt; (b) khung đầu ít thông tin (đen/đồng màu) ở các video khác nhau có thể cho pHash gần nhau → `phash_reused=True` → hard flag (L524) → **false positive**. Chưa chạy được để đo | P2 | **TASK-004** |
| FPA-07 | AI-02 listing dùng lại làm ảnh đóng gói không tăng điểm (§4.3.2) | NEEDS_OWNER_DECISION | `evidence_check.py:L650,L707-708` (chỉ thêm note) | Đúng là không cộng điểm. Tác động bị giới hạn: ảnh listing thường không chứa nonce → `nonce_ok_seller=False` → hard flag. Chỉ lọt khi listing được chụp **sau** `createTrade` và có nonce (xem NEW-03). Đổi trọng số/cờ là thay đổi chính sách chấm điểm → cần DEC (rule 50/55) | P3 | OD-06 |
| FPA-08 | SSRF DNS rebinding (§4.2.2) | PARTIALLY_VERIFIED | `attest_service.py:L219-231,L257,L268` | Có khoảng TOCTOU (resolve rồi `requests` resolve lại). FP ghi sai thư viện (`httpx`). Tác động thấp: host phải nằm trong allowlist (mặc định chỉ host gateway, L243-250), redirect cũng được kiểm lại (L276-280) | P3 | Ghi Known Limitation; không task |
| FPA-09 | "SEC-03" state volatility (§5.1) | DUPLICATE (FPA-05) | — | — | P3 | TASK-003 |
| FPA-10 | "SEC-04" bypass khi key rỗng (§5.1) | DUPLICATE (SEC-02/SEC-06) | `attest_service.py:L467-472` | — | P1 | TASK-001 |
| FPA-11 | "SEC-05" TrustPact phishing (§5.1) | DUPLICATE (SEC-08) | — | — | P1 | ESC-080 |
| FPA-12 | Logic Bug 1 zero payout (§6.1) | DUPLICATE (PC-02) | — | — | P1 | OD-01 |
| FPA-13 | Logic Bug 2 video 0 khung → `IndexError`/mặc định 50 (§6.2) | FALSE_POSITIVE | `evidence_check.py:L110-111` raise `ValueError` → `attest_service.py:L555-556` trả 422 | Không có `IndexError`, không có "risk 50 flagged" mặc định | — | Không |
| FPA-14 | Logic Bug 3 `cancelUnfunded` 24h (§6.3) | FALSE_POSITIVE | `Escrow.sol:L183-189` | Không có `DEPOSIT_TIMEOUT`; party nào cũng huỷ được bất kỳ lúc nào ở `Created`. Trade không ai nạp không giữ tiền | — | Không |
| FPA-15 | Edge: `claimExpiredEvidence` thưởng cọc; AI fail → `claimExpiredEvidence` (§7) | FALSE_POSITIVE | `Escrow.sol:L296-309` | Hàm không tồn tại; timeout hoàn cả hai, không thưởng | — | Không |
| FPA-16 | Edge: không có exponential backoff (§7) | FALSE_POSITIVE | `auto_agent.py:L92-93,L181-183` | Có backoff gấp đôi. Không có fee bumping (thiếu sót nhỏ, chưa đủ thành finding) | — | Không |
| FPA-17 | Invariant thiếu `withdraw` (§8.1) | DUPLICATE (TST-04) | `EscrowInvariant.t.sol:L38-125` | Kết luận đúng; mô tả handler sai (FP nói chỉ 3 hàm, thực tế 10) | P2 | TASK-005 |
| FPA-18 | Không có test vòng kín upload→AI→attest (§8.1) | PARTIALLY_VERIFIED | `backend/tests/test_integration_anvil.py` (20 test trên anvil, gồm auto agent) | Vòng backend↔contract↔AI đã có test; thiếu CI và phần frontend | P3 | Không task (CI: SE-07) |
| FPA-19 | Test dùng ảnh tổng hợp (§8.2) | DUPLICATE (TST-06) | `ai-pipeline/tests/synth.py` | — | P2 | TASK-006 |
| FPA-20 | Frontend 0 test (§4.5.2) | DUPLICATE (TST-03) | — | — | P2 | OD-08 |
| FPA-21 | `node_modules` chưa cài (§4.5.2, §9.3) | FALSE_POSITIVE | `frontend/.gitignore`; có `package-lock.json` | Trạng thái môi trường, không phải lỗi dự án | — | Không |
| FPA-22 | "forge test: 7 suites, 80 passed" (§9.1) | BLOCKED | Shell không có `forge` | Không tái lập được. Claim mâu thuẫn repo (3 file test, 81 hàm) → **không dùng làm bằng chứng PASS** | — | QA rerun trong TASK-005 |
| FPA-23 | TD-03 thiếu cảnh báo sai mạng (§12) | FALSE_POSITIVE | `components/WrongChainBanner.tsx`; `app/trade/[id]/page.tsx:L74-75` | Đã có | — | Không |
| FPA-24 | TD-04 compiler warning / import thừa (§12) | BLOCKED | Không build được; FP không nêu warning cụ thể | Không kiểm chứng | — | Kiểm trong output `forge build` của TASK-005 |
| FPA-25 | TD-05 không có CI (§12) | DUPLICATE (SE-07) | Không có `.github/` | — | P3 | Không |

---

## 5. Phát hiện mới (không có trong cả hai báo cáo)

### NEW-01 · VERIFIED · P2 — Report bằng chứng và pHash có thể mất vĩnh viễn khi chờ receipt thất bại hoặc tiến trình dừng giữa chừng

- **Bằng chứng:** `backend/chain.py:L143-150` gửi tx rồi `wait_for_transaction_receipt(timeout=120)`. Mọi exception sau khi broadcast đều bị bọc thành `ChainError`. `backend/attest_service.py:L568-572` chuyển lỗi này thành HTTP 502, **trước** các bước `store.add` (L573-574) và ghi report (L590-598).
- **Cơ chế:** tx `attest` đã được broadcast và có thể được mine (RPC timeout, RPC công cộng rớt, hoặc backend restart trong lúc chờ). Khi đó `reportHash` đã neo on-chain nhưng:
  - (a) `GET /report/{id}` trả 404 vĩnh viễn, vì lần verify sau nhận 409 do state đã là `Attested`;
  - (b) pHash của trade không vào kho, nên lần tái sử dụng ảnh sau không bị phát hiện.
- **Tác động:** trang "Explainable Evidence Report" (điểm UI/UX, Technical) trống cho trade đó. Tính năng chống tái sử dụng (Vai 1) bị suy giảm.
- **Khắc phục:** **TASK-003**.

### NEW-02 · VERIFIED · P1 — Không có đường khôi phục khi đăng ký URI bằng chứng cho AI Agent thất bại

- **Bằng chứng:**
  - `frontend/components/EvidenceUploader.tsx:L105-121`: URI chỉ được lưu vào localStorage **sau khi** receipt thành công.
  - `L125-131`: nếu `registerUri` lỗi thì chỉ hiện toast.
  - Grep `registerUri` trong `app/` và `components/` chỉ thấy 2 chỗ gọi (lúc tạo trade và lúc upload).
  - `components/AgentStatusCard.tsx:L98` hướng dẫn "Bên nộp cần mở lại trang này", nhưng trang **không** tự đăng ký lại.
  - `backend/auto_agent.py:L173-175`: agent chờ vô hạn khi thiếu URI.
- **Cơ chế:** backend gián đoạn đúng lúc nộp, hoặc người dùng reload trong lúc chờ receipt, thì URI không bao giờ tới backend. Đường verify thủ công cần cả 3 URI trong một trình duyệt hoặc sổ backend (`components/VerifyProgress.tsx:L55-62`), nên cũng không chạy được. Hết `EVIDENCE_WINDOW + ATTEST_WINDOW` (1200 s trên Fuji) thì chỉ còn `cancelOnEvidenceTimeout`.
- **Tác động:** luồng chính hỏng trong demo. Không mất tiền (cọc được hoàn).
- **Khắc phục:** **TASK-002**.

### NEW-03 · NEEDS_OWNER_DECISION · P2 — Ảnh niêm yết không được neo tại `createTrade`

- **Bằng chứng:**
  - `Escrow.sol:L134-155`: `createTrade` không nhận hash listing.
  - Seller ký listing bất kỳ lúc nào trước verify (`attest_service.py:L640-650`).
  - `UriRegistry` dùng first-write-wins (`auto_agent.py:L60-71`).
- **Cơ chế:** seller chọn ảnh listing **sau khi** biết mình đóng gói gì, nên có thể làm cho identity match luôn cao. Kết hợp với FPA-07: seller chụp món hàng kèm nonce rồi dùng cùng ảnh làm listing và bằng chứng đóng gói. ESC-080 đã ghi đây là Known Limitation.
- **Tác động:** giảm giá trị bằng chứng "Item Identity" khi seller là bên gian lận.
- **Phương án:**
  - (A) Chấp nhận và công bố.
  - (B) Neo hash listing trong `createTrade`. Cần đổi contract, redeploy, sửa ABI 3 nơi; vượt freeze 16/11.
- **Hướng xử lý:** OD-07.

### NEW-04 · NEEDS_OWNER_DECISION · P3 — Reputation có thể farm bằng self-trade, và reputation ảnh hưởng trực tiếp tới điểm rủi ro AI

- **Bằng chứng:**
  - `Escrow.sol:L240-241`: +1 cho mỗi bên khi `resolveClean`, không giới hạn theo cặp ví.
  - `evidence_check.py` hàm `risk_score`: `reputation_term` chiếm trọng số 0.4.
- **Cơ chế:** hai ví cùng chủ chạy giao dịch sạch lặp lại (mỗi vòng ~2–3 phút trên Fuji). Reputation 50→100 làm giảm tối đa 20 điểm rủi ro. Hard flag vẫn có hiệu lực.
- **Hướng xử lý:** gộp vào OD-04 cùng PC-05.

### NEW-05 · VERIFIED · P3 — MASTER_DISPATCH ghi sai scope ESC-080

- **Bằng chứng:** `docs/agent-ops/MASTER_DISPATCH.md:L31,L42` ghi `contracts/` trong scope ESC-080, trong khi `docs/agent-ops/tasks/ESC-080.md` cấm `contracts/`.
- **Tác động:** Active ownership sai, có thể chặn TASK-005 (`contracts/test/`) một cách nhầm.
- **Khắc phục:** sửa khi Cowork QA ESC-090 (không cần Task Spec).

### NEW-06 · VERIFIED · P2 — FULL_PROJECT_AUDIT_REPORT chứa bằng chứng không tồn tại và mã task trùng

- **Bằng chứng:** mục 2 của báo cáo này. FP §13 đặt `ESC-080` = "Payment Model" trong khi `docs/agent-ops/tasks/ESC-080.md` = SEC-01.
- **Tác động:** agent đọc `docs/audit/` có thể thực thi theo code không tồn tại hoặc dispatch nhầm task.
- **Khắc phục:** Owner chú thích hoặc chuyển FP sang `superseded`. Không dispatch theo FP §13.

---

## 6. Owner decisions cần chốt (`OWNER_DECISION_REQUIRED`)

| ID | Câu hỏi | Xung đột & bằng chứng | Phương án | Hệ quả | Quyết định Owner cần đưa ra | Chặn |
|---|---|---|---|---|---|---|
| **OD-01** (Q2) | Escrow giữ chỉ cọc hay giữ cả tiền hàng? | `Escrow.sol:L136,L162,L338-345` vs "giải ngân" trong `PRODUCT_VISION.md`, README, 5 file frontend | **A** Bond cọc hai chiều, thanh toán hàng ngoài chuỗi: sửa câu chữ. **B** Buyer nạp `itemValue + cọc`, seller nhận tiền hàng: đổi contract + redeploy + ABI + UI | A: không rủi ro kỹ thuật, kịp hạn. B: vượt freeze 16/11, rủi ro hồi quy cao, phải chạy lại toàn bộ test | Chọn A hoặc B; ghi DEC | TASK-008 |
| **OD-02** (Q3) | Có tiếp tục claim "không có human arbitrator"? | `Escrow.sol:L22,L262` vs `OPEN_QUESTIONS.md:L10` | **A** "AI xử lý luồng sạch; tranh chấp do trọng tài (owner) xử lý; roadmap phi tập trung". **B** Giữ claim, khi đó phải đổi contract | B mâu thuẫn code → rủi ro khi giám khảo hỏi | Chọn câu chữ; ghi DEC | TASK-008 |
| **OD-03** (Q4) | Chấp nhận owner EOA là trọng tài duy nhất + trade `Disputed`/flagged không có timeout? | `Escrow.sol:L121-125,L236,L262` | **A** Chấp nhận, ghi Known Limitation + RISK_REGISTER `ACCEPTED-BY-OWNER`. **B** Thêm dispute timeout / khoá `setAgent` khi có trade mở (đổi contract) | B vượt freeze | Chọn A/B | Release Gate |
| **OD-04** (Q5 + NEW-04) | Xác nhận −10/+5 và có chống farm reputation không? | `Escrow.sol:L240-241,L282-283`; `risk_score` | **A** Xác nhận tham số, ghi Known Limitation farm. **B** Đổi tham số / giới hạn theo cặp ví (đổi contract) | B vượt freeze | Xác nhận bằng DEC | TASK-008 (phần reputation) |
| **OD-05** (Q6) | Chính sách privacy cho bằng chứng công khai | `attest_service.py:L460-465,L663-665` | **A** Chấp nhận cho demo + cảnh báo trong UI upload. **B** Bảo vệ endpoint (cần mô hình auth người dùng) | B tốn công, cần thiết kế auth | Chọn A/B | TASK-002 (câu cảnh báo nếu A) |
| **OD-06** | Ảnh listing dùng lại làm ảnh đóng gói có phải cờ đỏ (cộng điểm/flag)? | `evidence_check.py:L650,L707` | **A** Giữ là ghi chú. **B** Hard flag. **C** Cộng điểm cố định | B/C đổi chính sách chấm điểm → cần DEC + dữ liệu đánh giá (TASK-006) | Chọn; nếu B/C ghi DEC | Task AI tương lai |
| **OD-07** (NEW-03) | Có neo hash ảnh listing on-chain lúc tạo trade? | `Escrow.sol:L134` | **A** Không, ghi Known Limitation. **B** Có (đổi contract) | B vượt freeze | Chọn A/B | — |
| **OD-08** (Q12) | Cho phép cài/khoá công cụ: ESLint, test runner TS (vitest), gitleaks, lockfile Python, `.gitattributes`, CI? | TST-03/05, SEC-09, SE-04, SE-08, SE-07 | Duyệt từng mục (khuyến nghị: gitleaks trước public repo; eslint trước 16/11; còn lại sau nộp) | Không duyệt → các finding này ở trạng thái Known Limitation | Danh sách mục được duyệt | TST-03/05, SEC-09 |
| **OD-09** | Vệ sinh Decision Log | `DECISION_LOG.md`: DEC-005/011 vẫn `CONFIRMED`; chưa có DEC cho QR nonce | Owner ghi `SUPERSEDED` + DEC QR nonce | — | Owner tự sửa | TASK-007 (không phụ thuộc cứng) |
| **OD-10** | Có cho phép sửa lỗi P1/P2 sau feature freeze 16/11 (DEC-012)? | DEC-012 chỉ cho slide/video/link sau 16/11 | **A** Ngoại lệ cho fix bảo mật/độ tin cậy có QA ACCEPT tới 19/11. **B** Đóng băng cứng: task chưa xong → Known Limitation | A tăng chất lượng nhưng có rủi ro hồi quy sát hạn | Chọn; ghi DEC | TASK-001/002/003/004/005 nếu trễ |

---

## 7. Root cause

| Root cause | Finding liên quan | Cách xử lý |
|---|---|---|
| **RC-1 Input của AI không được neo** (listing do client gửi; listing không neo on-chain) | SEC-01, NEW-03, FPA-07 | ESC-080; OD-06/07 |
| **RC-2 Cấu hình là attack surface, mặc định fail-open** | SEC-02, SEC-06, SE-05, SEC-05 | TASK-001, TASK-002 |
| **RC-3 Trạng thái ngoài chuỗi không bền và không đối soát được với chain** (URI chỉ ở localStorage/RAM, report ghi sau receipt) | NEW-01, NEW-02, FPA-05 | TASK-002, TASK-003 |
| **RC-4 Chất lượng AI chưa được đo** | FPA-06, TST-06 | TASK-004, TASK-006 |
| **RC-5 Tài liệu không được đồng bộ với code** | RA-03, PC-01/04/06/07/08/09, SE-02, SE-06 | TASK-007 |
| **RC-6 Quyết định kinh doanh chưa chốt nhưng đã được pitch** | PC-02/03/05, SEC-03/04/07, NEW-04 | OD-01..05 → TASK-008 |
| **RC-7 Quy trình bị bỏ qua** (merge không QA; báo cáo audit không được thẩm định) | SE-01, NEW-06, FPA-22 | Rules ESC-090 + QA hậu kiểm |

---

## 8. Thứ tự ưu tiên và thực hiện

Chi tiết dependency, xung đột file và lịch nằm trong [REMEDIATION_MASTER_PLAN.md](../agent-ops/remediation/REMEDIATION_MASTER_PLAN.md).

| Ưu tiên | Việc | Finding | Cần Owner? |
|---|---|---|---|
| **P0** | [ESC-080](../agent-ops/tasks/ESC-080.md) (có sẵn, READY) | SEC-01, SEC-08, TST-03 (`errors.ts`) | Không (đã duyệt Q7/Q10) |
| **P1** | [TASK-001](../agent-ops/remediation/TASK-001-backend-security-config-hardening.md) backend fail-closed + rate-limit + lỗi | SEC-02, SEC-06, SE-05 | Không |
| **P1** | [TASK-002](../agent-ops/remediation/TASK-002-frontend-evidence-uri-recovery.md) khôi phục URI + chặn mock IPFS | NEW-02, SEC-05 | Không (OD-05 chỉ ảnh hưởng một dòng cảnh báo tuỳ chọn) |
| **P1** | [TASK-008](../agent-ops/remediation/TASK-008-pitch-claims-alignment.md) sửa claim pitch | PC-02, PC-03, PC-05 | **BLOCKED** OD-01/02/04 |
| **P2** | [TASK-003](../agent-ops/remediation/TASK-003-backend-attest-durability.md) độ bền report/agent | NEW-01, FPA-05, TST-07 | Không |
| **P2** | [TASK-004](../agent-ops/remediation/TASK-004-ai-buyer-video-reuse-check.md) kiểm tra tái sử dụng video | FPA-06 | Không |
| **P2** | [TASK-005](../agent-ops/remediation/TASK-005-contract-invariant-boundary-tests.md) test contract | TST-04, SEC-04 (ghi nhận) | Không |
| **P2** | [TASK-006](../agent-ops/remediation/TASK-006-ai-evaluation-harness.md) đánh giá AI | TST-06 | Cần bộ dữ liệu từ Owner |
| **P2** | [TASK-007](../agent-ops/remediation/TASK-007-docs-context-sync.md) doc-sync | RA-03, PC-01/04/06/07/08/09, SE-02, SE-06 | Không |
| — | QA Cowork: ESC-090 (+NEW-05), hậu kiểm 4D/4E/ESC-050 (SE-01), viết lại ESC-060 (TST-08, PC-04), Release Gate ≤ 20/11 | — | — |

**Không cần thay đổi code:** RA-01/02/06/08/09, SEC-10, TST-01/02, QA-01..05 (OUTDATED). FPA-13/14/15/16/21/23 (FALSE_POSITIVE). FPA-04, FPA-08, FPA-18 (P3, ghi Known Limitation). RA-05, RA-07, SE-03, SE-07 (hoãn).

**Không kiểm chứng được:** SEC-09 (cần công cụ scan), FPA-22 (kết quả forge của FP), FPA-24 (warning compiler).

---

*Tài liệu này không thay đổi code, tests, rules hay quyết định nào. Mọi task cần Owner dispatch; task có ghi OD-xx chỉ được bắt đầu sau khi Owner ghi quyết định vào `docs/context/DECISION_LOG.md`.*
