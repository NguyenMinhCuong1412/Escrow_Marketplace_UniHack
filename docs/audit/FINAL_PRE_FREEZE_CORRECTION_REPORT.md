# FINAL PRE-FREEZE CORRECTION REPORT — Escrow Marketplace (UniHack 2026)

| Mục | Giá trị |
|---|---|
| Loại | Audit cuối trước Code Freeze (READ-ONLY với code, tests, rules) |
| Ngày | 2026-11-12 (tối, giờ VN) |
| Reviewer | Cowork — Chief Technical Reviewer / Independent QA / Security / Release Readiness |
| Working tree được audit | `phase/4f-listing-binding` @ `5b02f5b` (ESC-080) **+ merge `a6eb000` (ESC-090) đang dở, chưa commit** |
| Remote tại thời điểm audit (`git ls-remote`) | `origin/main` = `00722ed` (**chưa có trong repo local**, nhiều khả năng là merge PR #9 = `c537122`) |
| Mốc | Owner muốn freeze 12/11 · DEC-012 ghi **16/11** · OD-10 cho sửa P1/P2 tới 19/11 · Nộp bài 21/11 23:59 · Demo Day 30/11 |
| Quyết định | **CONDITIONAL GO — FREEZE AFTER SPECIFIC CORRECTIONS** (mục 10) |

> **Phạm vi của kết luận.** "Sẵn sàng freeze" ở đây nghĩa là sẵn sàng cho **demo UniHack trên Fuji testnet**. Không có nghĩa là sẵn sàng giữ tiền thật hay deploy production: owner EOA là trọng tài duy nhất, không có timeout cho `Disputed`, AI chưa được đo định lượng, chưa có audit bên thứ ba.

---

## 1. Executive Summary

### 1.1 Sức khoẻ tổng thể

| Module | Đánh giá | Căn cứ chính |
|---|---|---|
| Smart contract | **Tốt** | `forge test`: 80/80 pass, gồm fuzz 512 runs và 2 invariant (256 runs × 200 depth, 51 200 calls, 0 revert). Đọc lại toàn bộ `Escrow.sol`: CEI + `nonReentrant` + pull-fallback, không thấy lỗi kế toán |
| Backend | **Trung bình** | SEC-01 (P0) đã sửa và test lại pass. Còn **fail-open** khi thiếu `ATTEST_API_KEY` và toggle nguy hiểm không bị chặn trên Fuji (vi phạm rule 30/70) |
| AI pipeline | **Trung bình** | 77 test pass. Sai lệch vật phẩm **không** bật cờ khi giá trị < ~9.5 AVAX (FZ-08). Chưa có số đo FPR/FNR |
| Auto agent | **Khá** | Ranh giới đúng: chỉ ký `attest()`. Trạng thái retry nằm trong RAM; report có thể mất khi chờ receipt lỗi |
| Frontend | **Trung bình** | `tsc` và `next build` pass. Không có lint/test. Chuỗi UI nói sai mô hình tiền ("Tiền hàng … đã được giải ngân"). Thiếu đường khôi phục URI bằng chứng |
| Git / Docs / Process | **Yếu** | Merge đang dở; ESC-080 chưa push, chưa QA; local đi sau remote; docs/README lỗi thời; chưa có QA report cho 4D/4E/ESC-050/ESC-080/ESC-090 |

### 1.2 Rủi ro chính còn lại

1. **Baseline freeze chưa xác định (FZ-01).** Code đã audit không nằm trên nhánh remote nào. `origin/main` có commit `00722ed` mà máy local chưa có.
2. **Backend fail-open trên Fuji (FZ-02).** Toàn bộ an toàn phụ thuộc người vận hành nhớ đặt `ATTEST_API_KEY` và không bật `ALLOW_LOCAL_HOSTS` hay tắt `ENFORCE_EVIDENCE_HASH`. Code không tự chặn.
3. **Claim sai về tiền trên UI (FZ-03).** Contract chỉ giữ cọc. UI vẫn nói "Tiền hàng và tiền cọc đã được giải ngân". Owner đã chốt OD-01 = chỉ giữ cọc, sửa câu chữ, nhưng chưa ai sửa.
4. **AI bỏ sót "đánh tráo vật phẩm" (FZ-08).** Giao dịch sai món nhưng đúng nonce và ảnh mới sẽ đi luồng `resolveClean`, trừ khi buyer khiếu nại trong `DISPUTE_WINDOW` (90 s trên Fuji).
5. **Chưa chạy E2E qua giao diện trên Fuji** sau ESC-080 (ESC-060 vẫn BLOCKED).

### 1.3 Số finding chưa giải quyết (đã hợp nhất, đã kiểm chứng)

| P0 | P1 | P2 | P3 | Tổng |
|---|---|---|---|---|
| **0** | **3** | **12** | **4** (1 mục gom 9 hạng mục P3 đã hoãn) | **19** |

Rủi ro đã được Owner chấp nhận (OD-03..OD-07) **không** tính vào bảng trên. Chúng được liệt kê ở mục 6.2.

---

## 2. Previous Remediation Verification

Căn cứ đối chiếu là `REPORT_VALIDATION_AND_REMEDIATION_PLAN.md` và `REMEDIATION_MASTER_PLAN.md`. Hai file này chỉ có trên `origin/ops/esc-090-rules-update` @ `c537122`; tôi đọc bằng `git show`, không checkout.

### 2.1 Tình trạng thực thi các task khắc phục

| Task | Trạng thái thực tế | Bằng chứng |
|---|---|---|
| ESC-080 (SEC-01, SEC-08, `errors.ts`) | **Đã implement, chưa QA, chưa push, chưa merge** | Commit `5b02f5b` chỉ có trên nhánh local `phase/4f-listing-binding`. `git branch -r --contains 5b02f5b` → rỗng. Không có `ESC-080-qa-report.md` |
| ESC-090 (rules) | Đã merge qua PR #8 (`a6eb000`). Local đang merge vào `phase/4f` nhưng chưa commit | `git status`: "All conflicts fixed but you are still merging". Không có QA report |
| TASK-001 … TASK-003 | **Chưa bắt đầu** | Không có branch hay commit nào |
| TASK-004, TASK-005, TASK-007 | **Chưa bắt đầu, worktree đã bị xoá** | Các nhánh `task/004…`, `task/005…`, `task/007…` đều trỏ `a6eb000` (0 commit). `D:\wt-task-00x` không tồn tại |
| TASK-006 | Chưa bắt đầu (cần dataset của Owner) | — |
| TASK-008 | **Đã hết bị chặn** (OD-01/02/04 đã chốt) nhưng chưa thực hiện | DECISION_LOG trên `c537122` |

### 2.2 Theo trạng thái

| Trạng thái | Finding |
|---|---|
| **FIXED_AND_VERIFIED** (2) | **SEC-01**: `attest_service.py:L524-529` chặn 409 khi chưa có listing ký, 422 khi lệch; áp dụng cả `dry_run`. Có 4 unit test và 3 integration test (AC-01/02/06). Tôi đã chạy lại toàn bộ suite: pass. Còn chờ QA chính thức và merge. **SEC-08**: `git grep TrustPact backend frontend` → rỗng; `listing_message` (Python) và `listingMessage` (TS) khớp từng ký tự, đối chiếu `auto_agent.py:L78-84` với `lib/backend.ts:L180-187` |
| **Đã giải quyết nhờ chạy thật** (2, trước là BLOCKED) | **FPA-22**: `forge test` báo đúng **7 suites / 80 tests**, vì forge 1.9 gom 2 invariant vào 1 entry. Con số này của FULL audit khớp thực tế; báo cáo thẩm định cũ phân loại "mâu thuẫn" là sai (FZ-19). **FPA-24**: `forge build` chỉ có lint notes (`arbitrary-send-eth` tại `Escrow.sol:L349`, `reentrancy-events` tại `L318`), không có compiler warning hay error |
| **FIXED_BUT_NOT_VERIFIED** | 13 mục OUTDATED về rules (RA-01/02/06/08/09, SEC-10, TST-01/02, QA-01..05): đã merge PR #8. Tôi kiểm tra ở mức file: `AGENTS.md §0 Precedence` có; `55-ai-authority.md` là `always_on`; skill `release-gate` có. **Chưa có QA ESC-090 chính thức.** **TST-03 (phần `errors.ts`)**: thứ tự regex đúng (`lib/errors.ts:L17` trước `L20`), nhưng không có test nào chạy hàm này. **ESC-080 AC-07/AC-08 (UI)**: build pass, chưa test runtime. **NEW-06**: FULL audit đã có dòng "KHÔNG dùng làm bằng chứng" trên `c537122`, chưa có trong working tree |
| **PARTIALLY_FIXED** | **NEW-02**: đã thêm đường ký lại ảnh niêm yết (`AgentStatusCard.tsx:L141-188`), nhưng chưa có đường đăng ký lại URI bằng chứng seller/buyer (FZ-04). **TST-03**: `errors.ts` xong; ESLint đã được duyệt (OD-08) nhưng chưa cài; chưa dùng `simulateContract` |
| **NOT_FIXED** | SEC-02, SEC-06 (FZ-02); PC-02, PC-03 (FZ-03, phần UI); SEC-05 (FZ-05); SE-05 (FZ-06); NEW-01, FPA-05, TST-07 (FZ-07); FPA-06 (FZ-09); TST-04 (FZ-10); TST-06 (FZ-11); RA-03, PC-01, PC-04, PC-06, PC-07, PC-08, PC-09, SE-02, SE-06 (FZ-12); SE-01, TST-08, NEW-05, RA-04 (FZ-13); SEC-09 (FZ-15) |
| **REGRESSION_DETECTED** | **0.** Toàn bộ 80 + 146 test pass. ESC-080 có sửa kỳ vọng ở helper integration (đăng ký listing đã ký trước khi verify). Đây là thay đổi hành vi có chủ đích theo DEC-016, không phải hồi quy |
| **FALSE_POSITIVE** (xác nhận lại bằng đọc code) | FPA-13 (`evidence_check.py:L110-111` raise `ValueError`); FPA-14, FPA-15 (`Escrow.sol:L183-189`, `L296-309`); FPA-16 (`auto_agent.py:L92-93`, `L181-183`); FPA-21; FPA-23 (`trade/[id]/page.tsx:L74-75`) |
| **DEFERRED_WITH_ACCEPTED_RISK** | SEC-03, SEC-04 (OD-03); PC-05, NEW-04 (OD-04, chưa ghi Known Limitation); SEC-07 (OD-05, **câu cảnh báo privacy chưa thêm**); FPA-07 (OD-06); NEW-03 (OD-07); RA-05, RA-07, SE-03, SE-04, SE-07, SE-08, FPA-04, FPA-08, FPA-18, TST-05 (P3 đã hoãn theo kế hoạch) |
| **OWNER_DECISION_REQUIRED** (mới) | OD-11, OD-12, OD-13 (mục 7) |

---

## 3. Final Test Results

Tôi chạy trên máy của Owner (Windows, qua Desktop Commander) tại working tree nêu ở đầu báo cáo. Không cài thêm hay nâng cấp gói nào. Không dùng mạng, ví thật hay key thật.

| # | Suite | Lệnh | Kết quả | Pass | Fail | Skip | Blocked / Not run | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 1 | Contract build | `cd contracts; forge build` | OK | — | — | — | — | forge 1.9.0, solc 0.8.24. Chỉ có lint notes (FPA-24) |
| 2 | Contract unit + fuzz + invariant | `cd contracts; forge test` | **PASS** | 80 | 0 | 0 | 0 | 7 suites: Adversarial 4, Deploy 6, Token 11, EvidenceAttest 16, CreateDeposit 18, Resolve 24, Invariant 1 (= 2 invariant). Chạy lại `--match-contract EscrowInvariantTest` ra cùng kết quả |
| 3 | Python toàn bộ (AI + backend unit + integration anvil) | `.\.venv\Scripts\python.exe -m pytest -q -rs` | **PASS** | 146 | 0 | 0 | 0 | 103 s. Phân bổ: `test_evidence_check` 59, `test_qr_nonce` 18, `test_service_unit` 46, `test_integration_anvil` 23 (anvil được spawn, không skip). Python 3.14.3, pytest 9.2.0 |
| 4 | Frontend type check | `cd frontend; npx tsc --noEmit -p .` | **PASS** | — | 0 | — | — | exit 0 |
| 5 | Frontend build | `cd frontend; npm run build` | **PASS** | — | 0 | — | — | Next 14.2.35, 10 route. Bước lint thực tế **không chạy** vì repo không có ESLint config hay dependency |
| 6 | Frontend lint | `npm run lint` | **NOT RUN** | — | — | — | 1 | `next lint` sẽ mở wizard tạo config, tức là sửa repo. ESLint đã được duyệt (OD-08) nhưng chưa cài |
| 7 | Frontend unit/component test | — | **KHÔNG TỒN TẠI** | 0 | 0 | 0 | — | Không có test runner TS (vitest hoãn theo OD-08) |
| 8 | E2E script anvil | `bash contracts/script/e2e_anvil.sh` | **NOT RUN** | — | — | — | 1 | Script bash trên Windows. Luồng tương đương đã được `test_integration_anvil.py` phủ |
| 9 | E2E Fuji qua UI (ESC-060) | thủ công | **NOT RUN** | — | — | — | 1 | Cần ví, faucet và key thật, nằm ngoài quyền của audit. Trên máy này không có `backend/.env` hay `frontend/.env.local` |
| 10 | Secret scan | regex heuristic trên HEAD + `git log --all -p` | Không phát hiện secret thật | — | — | — | — | Chỉ thấy 5 key **mặc định công khai của anvil** (`demo_local.py`, `test_integration_anvil.py`, `e2e_anvil.sh`, `FRONTEND_SPEC.md`) và tx hash. `gitleaks` **chưa chạy** (chưa cài) |
| 11 | Dependency audit | `npm audit` / `pip-audit` | **NOT RUN** | — | — | — | 1 | Cần mạng; chưa được duyệt |

**Tính tái lập:** forge chạy 2 lần cho cùng kết quả. pytest khớp con số 146 trong ESC-080 report (máy khác thời điểm). **Tổng: 226 test tự động pass, 0 fail, 0 skip.** Các test này **không** chứng minh luồng UI→Fuji hoạt động. Frontend không có test tự động nào.

---

## 4. Remaining Issues

Mỗi finding có các cột: ID · Mức · Module · Bằng chứng · Root cause · Tác động · Cách sửa · Test sau sửa · Độ phức tạp · Phụ thuộc · Cần Owner.

### P1 — High

**FZ-01 · P1 · Git / Release integrity — Baseline freeze không tồn tại trên remote; merge dở; local đi sau `origin/main`**
- **Bằng chứng:**
  - `git status`: "All conflicts fixed but you are still merging" (MERGE_HEAD `a6eb000`, 24 file staged).
  - `5b02f5b` (ESC-080) không thuộc nhánh remote nào.
  - `git ls-remote`: `main` = `00722ed`, nhưng `git cat-file -t 00722ed` → không có object.
  - `refs/pull/9/head` = `c537122` (audit, remediation plan, OD-01..10).
- **Root cause:** RC-7. Quy trình branch → PR → QA → merge bị bỏ dở.
- **Tác động:** không xác định được commit nào là bản freeze. Kết quả test ở mục 3 chưa áp dụng cho `main`. Tài liệu remediation và OD chưa có trong cây local.
- **Cách sửa (Owner):**
  1. Commit merge đang dở.
  2. `git fetch`, rồi merge `origin/main` vào `phase/4f-listing-binding`.
  3. Push và mở PR.
  4. Cowork QA ESC-080 và ESC-090.
  5. Merge vào `main`.
  6. Gắn tag freeze.
- **Test sau sửa:** chạy lại mục 3 #2–#5 trên `main` @ commit freeze.
- **Độ phức tạp:** Low. **Phụ thuộc:** —. **Cần Owner:** Có (chỉ Owner merge, theo DEC-015).

**FZ-02 · P1 · Backend — Fail-open auth và toggle nguy hiểm không bị chặn trên chain ≠ 31337 (SEC-02 phần auth, SEC-06)**
- **Bằng chứng:**
  - `attest_service.py:L467-472`: key rỗng chỉ ghi warning.
  - `L115`, `L117`: `ALLOW_LOCAL_HOSTS`, `ENFORCE_EVIDENCE_HASH` có tác dụng tại `L204`, `L221`, `L532`, không phụ thuộc chain.
  - `backend/.env.example:L14` mặc định `ATTEST_API_KEY=` rỗng.
  - Vi phạm `.agents/rules/30-backend.md:L10` và `70-security.md:L15-16`.
  - Dòng P0 backend của `TEST_MATRIX.md` ("từ chối khởi động nếu key rỗng trên chain ≠ 31337") đang fail.
- **Root cause:** RC-2, cấu hình mặc định fail-open.
- **Tác động:** chỉ cần một lần cấu hình sai trên Fuji là bất kỳ ai cũng gọi được `/verify-evidence` (tốn gas ví agent). Nếu bật toggle thì mất cả chống SSRF lẫn ràng buộc hash. Release Gate theo rule 70 sẽ từ chối.
- **Cách sửa:** **FREEZE-001** (tập con của TASK-001).
- **Test sau sửa:** unit U1–U4, U6, U11 của TASK-001; full pytest.
- **Độ phức tạp:** Low. **Phụ thuộc:** FZ-01. **Cần Owner:** Không (rule đã duyệt).

**FZ-03 · P1 · Frontend (chuỗi hiển thị) — Claim tài chính sai so với contract (PC-02; PC-03 phần UI)**
- **Bằng chứng:**
  - `trade/[id]/page.tsx:L158` ("Tiền hàng và cọc đã được chuyển"), `L646` ("Giải ngân thanh toán & Hoàn cọc"), `L675` ("Tiền hàng và tiền cọc đã được giải ngân").
  - `app/page.tsx:L40`, `L45`, `L96` và `app/layout.tsx:L10` ("không cần trung gian … hợp đồng tự giải ngân").
  - Trong khi đó contract chỉ hoàn cọc: `Escrow.sol:L136`, `L338-345`.
  - Owner đã chốt **OD-01 = A** ("chỉ giữ cọc, sửa câu chữ") và **OD-02 = A**.
- **Root cause:** RC-6. Quyết định đã chốt nhưng chưa được áp vào code.
- **Tác động:** giám khảo đọc contract sẽ thấy UI nói sai (ảnh hưởng tiêu chí Technical, Impact, UI/UX). Người dùng hiểu sai rằng tiền hàng được escrow giữ.
- **Cách sửa:** **FREEZE-002** cho chuỗi UI. Phần docs và slide làm trong TASK-007/008 sau freeze (DEC-012 cho phép).
- **Test sau sửa:** `next build`, `tsc`, grep AC.
- **Độ phức tạp:** Low. **Phụ thuộc:** FZ-01. **Cần Owner:** Không (OD-01/02 đã chốt; cần ghi thành DEC, xem OD-13).

### P2 — Medium

**FZ-04 · P2 · Frontend — Khôi phục URI bằng chứng seller/buyer chưa có (NEW-02 residual)**
- **Bằng chứng:**
  - `EvidenceUploader.tsx:L105-131`: URI chỉ được lưu sau receipt; nếu `registerUri` lỗi thì chỉ hiện toast.
  - `AgentStatusCard.tsx:L141-188`: chỉ xử lý trường hợp thiếu `listing`.
- **Tác động:** agent kẹt ở `waiting_uris`. Có đường vòng: verify thủ công bằng cách dán URI (`VerifyProgress`); trường hợp xấu nhất là hoàn cọc khi hết `ATTEST_WINDOW`. Không mất tiền.
- **Cách sửa:** TASK-002 (phần URI). **Độ phức tạp:** Medium. **Cần Owner:** Không.

**FZ-05 · P2 · Frontend API — Mock IPFS vẫn neo được on-chain ngoài chain 31337 (SEC-05)**
- **Bằng chứng:** `app/api/pin/route.ts:L40-47`; `EvidenceUploader.tsx:L96-98` chỉ hiện toast.
- **Tác động:** trên Fuji, nếu thiếu `PINATA_JWT` thì trade sẽ chết.
- **Biện pháp tạm:** checklist freeze xác nhận `PINATA_JWT` đã được đặt.
- **Cách sửa:** TASK-002. **Độ phức tạp:** Low.

**FZ-06 · P2 · Backend — Lộ exception thô và rate-limit dồn một bucket (SE-05, SEC-02 phần rate-limit)**
- **Bằng chứng:**
  - `attest_service.py:L425` (`/health`, không cần auth: `RPC error: {e}`).
  - `L435`, `L449`, `L515`, `L566`, `L579` (`str(e)`).
  - `L476-477` lấy khoá rate-limit từ IP proxy.
- **Cách sửa:** phần còn lại của TASK-001, sau freeze. **Độ phức tạp:** Low–Medium.

**FZ-07 · P2 · Backend / Agent — Report và pHash mất khi chờ receipt lỗi; attempts nằm trong RAM (NEW-01, FPA-05, TST-07)**
- **Bằng chứng:**
  - `attest_service.py:L576-581`: `store.add` chạy sau `send_attest`.
  - `L598-605`: report chỉ được ghi khi `tx_hash` có giá trị.
  - `chain.py:L146-150`: chờ receipt.
- **Cách sửa:** TASK-003. **Độ phức tạp:** Medium.

**FZ-08 · P2 · AI pipeline (MỚI) — Sai lệch vật phẩm không bật cờ; tên test gây hiểu nhầm**
- **Bằng chứng:**
  - `evidence_check.py:L516-538`: `hard_flag` chỉ gồm `phash_reused` và nonce sai.
  - Với reputation 50/50 và `inliers = 0`, điểm = 0.4·50 + 0.4·100 + 0.2·5·min(v, 10) = **60 + v** (v tính bằng AVAX). Như vậy chỉ bị flag khi v ≥ ~9.5 AVAX. Nếu reputation đã farm lên 100/100 thì điểm ≤ 50, **không bao giờ** bị flag.
  - `ai-pipeline/tests/test_evidence_check.py:L310-313` tên là `test_wrong_item_flagged_or_high_risk`, nhưng chỉ assert điểm cao hơn trường hợp sạch.
  - NatSpec `Escrow.sol:L57`, `L213` mô tả flagged gồm "không khớp vật thể".
- **Tác động:** kịch bản gian lận cốt lõi (gửi sai món) đi luồng `resolveClean`, trừ khi buyer khiếu nại trong `DISPUTE_WINDOW` (90 s trên Fuji). Claim pitch "AI phát hiện không khớp" không đúng như mô tả.
- **Cách sửa:** **OD-11.**
  - (A) Giữ công thức, sửa claim, đổi tên test.
  - (B) Thêm hard flag khi `inliers < MIN_GOOD_INLIERS`. Đây là đổi chính sách chấm điểm (rule 50/55), cần DEC và cần đo FP trên ảnh thật (TASK-006).
- **Độ phức tạp:** A Low, B Medium. **Cần Owner:** **Có.**

**FZ-09 · P2 · AI — Kiểm tra tái sử dụng video chỉ dùng khung 0 (FPA-06)**
- **Bằng chứng:** `evidence_check.py:L644` (`compute_phash(buyer_frames[0])`).
- **Cách sửa:** TASK-004 (chưa bắt đầu). **Độ phức tạp:** Low–Medium.

**FZ-10 · P2 · Contract tests — Invariant chưa phủ `withdraw` và actor từ chối nhận AVAX (TST-04)**
- **Bằng chứng:** handler trong `EscrowInvariant.t.sol` không có `withdraw`. Invariant hiện tại pass, nhưng nhánh `pendingWithdrawals` chưa được kiểm tra.
- **Cách sửa:** TASK-005, chỉ sửa test và không redeploy. Được phép làm sau freeze.

**FZ-11 · P2 · AI — Chưa đánh giá định lượng (TST-06)**
- **Cách sửa:** TASK-006, cần dataset. Trước khi có số đo, pitch không được nêu FPR/FNR.

**FZ-12 · P2 · Docs — Tài liệu lệch với code (RA-03, PC-01/04/06/07/08/09, SE-02, SE-06)**
- **Bằng chứng (`README.md`):**
  - `L53`: "Kế hoạch Phase 3B" dù frontend đã có.
  - `L66`: "42 unit tests"; thực tế 46.
  - `L75-78`: demo link và địa chỉ Fuji còn `[TBD]`, dù `deployments/43113.json` đã có địa chỉ Escrow.
  - `L3`: Foundry 1.5.1 / Python 3.12; thực tế 1.9.0 / 3.14.
  - `L2`: "Trustless".
- **Bằng chứng (`docs/`):**
  - `CURRENT_STATUS.md`: ngày 11/11, "23 unit + 14 integration".
  - `BUSINESS_REQUIREMENTS.md:L32-42`: state machine và `cancelUnfunded` sai.
  - `TECH_STACK.md:L14`, `L39`: CLIP.
  - `OPEN_QUESTIONS.md:L9`, `L16`.
  - `SLIDE_AND_VIDEO_SCRIPT.md:L17`: "nonce sinh sau khi đủ cọc".
- **Tác động:** tiêu chí Presentation; quy định link phải công khai.
- **Cách sửa:** TASK-007 + TASK-008 (docs). Theo DEC-012, được làm sau code freeze nhưng **phải xong trước 20/11**.

**FZ-13 · P2 · Process / Governance (SE-01, TST-08, NEW-05, RA-04)**
- Không có QA report cho 4D, 4E, ESC-050, ESC-080, ESC-090.
- ESC-060 chưa được viết lại. Release Gate chưa chạy.
- `MASTER_DISPATCH.md` vẫn ghi ESC-080 `READY` với scope gồm `contracts/` (NEW-05), và không liệt kê TASK-001..008.
- DECISION_LOG (trên `c537122`):
  - Các dòng OD không có cột Owner.
  - Có ID gõ sai `0D-08` (số 0 thay chữ O).
  - OD-06/07 thiếu nội dung câu hỏi.
  - OD-09 đã chốt nhưng DEC-005/011 chưa được đánh `SUPERSEDED`.
- ESC-080 report ghi "0 lỗi ESLint" nhưng repo không có ESLint, nên claim này không có căn cứ.
- **Cách sửa:** Owner sửa DECISION_LOG; Cowork làm QA và Release Gate. **Độ phức tạp:** Low.

**FZ-14 · P2 · Frontend quality (TST-03 phần còn lại)**
- Chưa dùng `simulateContract` (vi phạm `60-ui-ux.md:L11`).
- Không có ESLint (đã được duyệt theo OD-08) và không có test.
- **Cách sửa:** cài ESLint sau freeze (không chặn freeze). Ghi `simulateContract` thành Known Limitation.

**FZ-15 · P2 · Security — Chưa chạy `gitleaks` trước khi public repo (SEC-09)**
- Scan heuristic sạch, nhưng chưa thay được công cụ chuẩn. OD-08 đã duyệt cài `gitleaks`.
- **Bắt buộc trước khi nộp.** Không chặn code freeze.

### P3 — Low

- **FZ-16 · `/api/pin` là proxy upload công khai, không auth, dùng `PINATA_JWT` của team** (`app/api/pin/route.ts:L14-73`). Người lạ có thể dùng hết quota Pinata và làm hỏng demo. Cách sửa sau nộp bài: rate-limit hoặc giới hạn origin.
- **FZ-17 · `reportHash` không cam kết ảnh niêm yết.** `listing_hash` được gắn sau khi đã tính canonical JSON (`attest_service.py:L583-584`). `UriRegistry` không lưu chữ ký seller (`auto_agent.py:L60-71`), nên không có audit trail để kiểm lại. Ghi Known Limitation.
- **FZ-18 · Gom 9 hạng mục P3 đã hoãn:** FPA-04 (`TP1:`), FPA-08 (TOCTOU DNS), SE-03 (ABI nhân bản), SE-04 (deps Python không khoá), SE-07 (branch/CI; thêm 3 worktree `prunable` và một worktree Antigravity cũ còn thay đổi rules chưa commit), SE-08, RA-05, RA-07, TST-05.
- **FZ-19 · Sửa phân loại FPA-22** trong báo cáo thẩm định: con số 7 suites / 80 tests là đúng.

---

## 5. Required Corrections Before Freeze

Chỉ gồm các mục thực sự chặn freeze:

1. **FZ-01:** hợp nhất baseline, QA ESC-080 và ESC-090, merge vào `main`.
2. **FZ-02 → FREEZE-001:** backend fail-closed trên chain ≠ 31337, kèm `/health.security_toggles`.
3. **FZ-03 → FREEZE-002:** sửa chuỗi UI sai về tiền và trung gian.
4. **Regression đầy đủ** trên `main` @ commit freeze: forge, pytest `-rs` với skip = 0, `tsc`, `next build`.
5. **Smoke E2E Fuji qua UI:** một luồng sạch và một luồng bị flag, với cấu hình production đã kiểm qua `/health` (`ATTEST_API_KEY` đặt, `PINATA_JWT` đặt, `AGENT_AUTO=true`, không bật toggle nào). Ghi lại tx hash.
6. **OD-11** được chốt. Nếu Owner chọn B thì phải sửa trước freeze; nếu chọn A thì sửa claim sau freeze.
7. **OD-12** (ngày freeze) được ghi vào DECISION_LOG.

## 6. Acceptable Post-Freeze Issues

### 6.1 Được làm sau freeze (theo OD-10: tới 19/11, chỉ khi có QA ACCEPT)

| ID | Tác động nếu để lại | Biện pháp tạm |
|---|---|---|
| FZ-04 | Trade có thể kẹt ở `waiting_uris` | Verify thủ công bằng cách dán URI; lấy CID trên dashboard Pinata; hoặc chờ hết hạn để hoàn cọc |
| FZ-05 | Trade chết nếu thiếu JWT | Checklist xác nhận `PINATA_JWT` đã đặt |
| FZ-06 | Lộ thông tin RPC (RPC Fuji công khai, không có key); rate-limit 10 req/phút dùng chung | Agent tự động không đi qua endpoint nên không bị ảnh hưởng |
| FZ-07 | Mất report hoặc pHash khi RPC rớt | Demo dùng gateway riêng; chạy lại nếu cần |
| FZ-09, FZ-10, FZ-11 | Độ phủ AI và test | Không nêu số đo trong pitch |
| FZ-12, FZ-13 (docs), FZ-15 | Điểm Presentation; rò rỉ secret | **Bắt buộc xong trước 20/11** |
| FZ-14, FZ-16 … FZ-19 | Thấp | Ghi Known Limitation |

### 6.2 Rủi ro đã được Owner chấp nhận (phải ghi vào `RISK_REGISTER` là `ACCEPTED-BY-OWNER`)

- **OD-03:** owner EOA là trọng tài duy nhất; `Disputed`/flagged không có timeout (SEC-03/04).
- **OD-04:** reputation −10/+5; có thể farm reputation (PC-05, NEW-04).
- **OD-05:** bằng chứng công khai. **Câu cảnh báo privacy trên UI chưa được thêm.**
- **OD-06:** ảnh niêm yết dùng lại làm ảnh đóng gói chỉ ghi chú.
- **OD-07:** listing không neo on-chain (NEW-03).

## 7. Owner Decisions

| ID | Câu hỏi | Vì sao chặn | Khuyến nghị |
|---|---|---|---|
| **OD-11 (mới)** | AI có bật cờ khi vật phẩm không khớp (`inliers < 15`) không? | Kết quả AI ở kịch bản gian lận chính phụ thuộc vào câu trả lời; pitch đang claim điều này | **A** cho demo (sửa claim và đổi tên test). B chỉ khi có dữ liệu đo FP |
| **OD-12 (mới)** | Ngày code freeze chính thức: 12/11 (yêu cầu hiện tại) hay 16/11 (DEC-012)? OD-10 ghi "sau freeze 16/11" | Ba nguồn mâu thuẫn nhau. Freeze 12/11 không thể đạt vì các điều kiện ở mục 5 chưa xong | Ghi DEC mới. Thực tế: freeze ngay khi mục 5 xong, chậm nhất 16/11 |
| **OD-13 (mới)** | OD-01..OD-10 (trên `c537122`) có được coi là DEC chính thức không? | Định dạng chưa chuẩn (thiếu Owner, có `0D-08`, OD-06/07 thiếu câu hỏi) | Owner chuyển thành DEC-018…, có Owner, Status, Evidence |

## 8. Final Git and Documentation Status

- **Branch hiện tại:** `phase/4f-listing-binding`, đang trong merge (MERGE_HEAD `a6eb000`), 24 file staged (rules/docs của ESC-090), 0 file unstaged.
- **Commit mới nhất:** `5b02f5b` ESC-080 (12/11 20:29, chưa push).
- **Remote:** `main` = `00722ed` (chưa fetch); `ops/esc-090-rules-update` = `c537122` (PR #9).
- **Untracked:** chỉ có báo cáo này và 2 Task Spec FREEZE (do audit này tạo).
- **Branch rác:** `task/004`, `task/005`, `task/007` có 0 commit và worktree đã bị xoá. Worktree Antigravity `add_ssrf_api_key_hardening` (`e29487b`) còn thay đổi rules chưa commit; nhiều khả năng là bản nháp cũ của ESC-090. Owner xác nhận rồi dọn.
- **Secret:** không phát hiện secret thật trong file tracked hay trong lịch sử. `.env*` đã được ignore đúng. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` trong `.env.local.example` là ID công khai, chấp nhận được.
- **File mong đợi nhưng thiếu trong working tree:**
  - `docs/audit/FULL_PROJECT_AUDIT_REPORT.md`
  - `docs/audit/REPORT_VALIDATION_AND_REMEDIATION_PLAN.md`
  - `docs/agent-ops/remediation/*`
  - Các QA report: ESC-050, ESC-080, ESC-090, 4D, 4E
  - `ESC-060-report.md`
- **Môi trường:** máy này không có `backend/.env`, `frontend/.env.local` hay `backend/data/`, nên chưa chạy được demo Fuji từ checkout này.
- **Docs lệch:** xem FZ-12 và FZ-13.

## 9. Recommended Final Execution Order

```text
[Owner] FZ-01: commit merge → fetch → merge origin/main → push → PR
   │
   ├─► [Cowork] QA ESC-080 + ESC-090 (qa-review, rerun lệnh) ─► [Owner] merge main
   │
   ├─► [Owner] chốt OD-11, OD-12, OD-13 (DECISION_LOG)
   │
   ├─► FREEZE-001 (backend guard) ∥ FREEZE-002 (UI strings)    ← không có file chung
   │        └─► [Cowork] QA từng task (security review cho FREEZE-001) ─► [Owner] merge
   │
   ├─► [Cowork] regression đầy đủ trên main + smoke E2E Fuji (ESC-060 rút gọn)
   │
   └─► [Owner] tag freeze  ──►  sau freeze: TASK-002/003/004/005 (tới 19/11, cần QA ACCEPT),
                                TASK-007/008 docs + README + gitleaks + Release Gate (≤ 20/11)
```

Lệnh kiểm chứng tối thiểu trên commit freeze:

```powershell
cd contracts; forge build; forge test
cd ..; .\.venv\Scripts\python.exe -m pytest -rs        # 0 failed, 0 skipped
cd frontend; npx tsc --noEmit; npm run build
git status   # sạch; HEAD = tag freeze = origin/main
```

## 10. Code Freeze Checklist (Owner ký duyệt)

- [ ] Không còn merge dở; `git status` sạch; `HEAD == origin/main`; đã gắn tag freeze.
- [ ] ESC-080 và ESC-090 có QA report kết luận ACCEPT và đã merge.
- [ ] FREEZE-001 đã merge: chain 43113 + key rỗng → 503; `/health.security_toggles.insecure_for_chain == false` trên môi trường demo.
- [ ] FREEZE-002 đã merge: grep các chuỗi cấm trong `frontend/app` và `frontend/components` trả rỗng.
- [ ] `forge test` 80/80; `pytest -rs` 146+ pass, 0 skip; `tsc` và `next build` pass, tất cả trên commit freeze.
- [ ] Smoke E2E Fuji qua UI: một trade sạch tới `Resolved`, một trade bị flag tới `Disputed` → `resolveDispute`. Có tx hash.
- [ ] `PINATA_JWT`, `ATTEST_API_KEY`, `AGENT_AUTO=true` đã cấu hình; `ALLOW_LOCAL_HOSTS=false`; `ENFORCE_EVIDENCE_HASH=true`.
- [ ] OD-11, OD-12, OD-13 đã ghi trong DECISION_LOG.
- [ ] Các rủi ro OD-03..07 đã ghi `ACCEPTED-BY-OWNER` trong `RISK_REGISTER.md`.
- [ ] Danh sách việc sau freeze (mục 6.1) có ngày hạn; docs, README và gitleaks xong trước 20/11.

### Quyết định

**CONDITIONAL GO — FREEZE AFTER SPECIFIC CORRECTIONS.**

- Không còn P0, không có hồi quy, contract và luồng backend↔AI↔contract đã được kiểm chứng bằng test chạy thật.
- **Không được duyệt freeze cho tới khi mọi mục ở mục 5 và checklist mục 10 hoàn tất.**
- Tại thời điểm 12/11, các điều kiện này **chưa** đạt.

*Task Spec kèm theo: [`FREEZE-001`](../agent-ops/remediation/final-freeze/FREEZE-001-backend-fail-closed-guard.md), [`FREEZE-002`](../agent-ops/remediation/final-freeze/FREEZE-002-frontend-claim-alignment.md). Báo cáo này không sửa code, tests, rules hay quyết định nào.*
