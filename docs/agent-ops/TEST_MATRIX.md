# Test Matrix — Escrow Marketplace

> **Tài liệu chuẩn quản trị kiểm thử toàn diện cho Escrow Marketplace.**  
> Nguồn: `docs/audit/AGENT_RULES_AUDIT_REPORT.md` (mục 3.D, mục 8 TST-01..08); `.agents/rules/80-testing.md`; Task Spec ESC-090 (C-18, AC-11).  
> Tài liệu này là nguồn sự thật duy nhất về phân loại tầng rủi ro (Risk Tiers), ma trận kiểm thử theo module, lệnh thực thi chuẩn, điều kiện môi trường, và danh mục lỗ hổng kiểm thử đã biết (Known Gaps).

---

## 1. Mục Đích & Phạm Vi Áp Dụng

Mọi Task Specification (`docs/agent-ops/TASK_TEMPLATE.md`) trước khi thực hiện phải xác định rõ các dòng kiểm thử áp dụng từ tài liệu này (`TEST_MATRIX rows applied`).

1. **Ràng buộc thi hành:** Mọi thay đổi code hoặc quy trình phải chạy bộ kiểm thử tương ứng với tầng rủi ro cao nhất của các file bị chỉnh sửa.
2. **Skip Policy:** Bắt buộc tuân thủ văn bản chuẩn tại `.agents/rules/80-testing.md`: chạy `pytest` với cờ `-rs`; mọi test bị skip trong suite bắt buộc của module bị chạm khiến task nhận verdict `BLOCKED`, tuyệt đối không được báo `PASS`.
3. **Báo cáo kết quả:** QA reviewer và implementer bắt buộc trích xuất dòng tổng kết thực tế (`passed`, `failed`, `skipped`) từ console log lần chạy gần nhất; không hardcode số lượng test.

---

## 2. Định Nghĩa Tầng Rủi Ro (Risk Tiers)

Dự án phân loại rủi ro theo 3 tầng (P0, P1, P2) căn cứ vào mức độ ảnh hưởng tới tài sản người dùng, tính toàn vẹn on-chain, và thẩm quyền của AI:

| Risk Tier | Tên Tầng | Phạm Vi & Bản Chất | Hệ Quả Khi Lỗi | Yêu Cầu Kiểm Thử Tối Thiểu |
|---|---|---|---|---|
| **P0** | **Critical** | Quản lý tiền cọc (AVAX), phân quyền quản trị (`onlyOwner`, `onlyAgent`), chuyển đổi trạng thái giao dịch on-chain (`contracts/src/**`, tích hợp backend-anvil `backend/tests/test_integration_anvil.py`). | Mất tiền, khóa tiền vĩnh viễn, chiếm quyền agent/owner, bypass cọc. | Unit + Negative + Boundary + Fuzz + Invariant + Integration Anvil (không skip). |
| **P1** | **High** | Quyết định rủi ro của AI, xác thực API key/SSRF, luồng gọi giao dịch `attest()`, tính nhất quán/parity giữa Python backend và TypeScript frontend. | AI đánh giá sai, gian lận bằng chứng, lỗi xác thực, lệch định dạng ký/hash giữa các module. | Unit + Heuristic Boundaries + Evaluation (confusion matrix) + Failure-injection + Parity Golden-files. |
| **P2** | **Medium / Low** | Giao diện người dùng frontend (`frontend/app/**`, `components/**`), static type checking, build production, tài liệu quy trình (`docs/**`, `.agents/**`). | Lỗi hiển thị UI, vỡ layout responsive, sai lệch tài liệu quy trình. | Typecheck (`tsc --noEmit`) + Production Build (`npm run build`) + Lint + Kiểm tra đường dẫn tài liệu. |

---

## 3. Ma Trận Kiểm Thử Theo Module & Tầng Rủi Ro

Ma trận áp dụng trên 5 module kỹ thuật của dự án:

| Module | Risk Tier | Các Loại Kiểm Thử Bắt Buộc | Điều Kiện Kích Hoạt | Tiêu Chí Đạt (Acceptance Criteria) |
|---|---|---|---|---|
| **`contracts/`** | **P0** | **1. Unit & Negative:** Kiểm tra truy cập (`onlyOwner`, `onlyAgent`), sai trạng thái, trùng lặp hành động (`double deposit`, `double attest`).<br>**2. Boundary:** Biên thời gian `block.timestamp == deadline` (`resolveClean > deadline`, `fileComplaint <= deadline`).<br>**3. Fuzzing:** Giá trị nạp, mốc thời gian (512 runs).<br>**4. Invariant:** `balance == Σ outstanding deposits + Σ pendingWithdrawals` (256 runs, depth 200).<br>**5. Reentrancy & Pull-fallback:** Chặn reentrancy trên `withdraw`, xử lý actor từ chối nhận AVAX. | Chạm bất kỳ file nào trong `contracts/src/**` hoặc thay đổi logic state machine, cọc, phân quyền. | 100% tests PASS; 0 revert ngoài dự kiến; Invariant kiểm tra toàn vẹn tài sản không bị phá vỡ. |
| **`contracts/`** | **P1** | **1. Event Verification:** Kiểm tra đầy đủ emit event cho `TradeCreated`, `Deposited`, `Attested`, `CleanResolved`, `DisputeResolved`.<br>**2. Gas Benchmarking:** Đo lường gas consumption cho luồng `attest` và `resolveClean`. | Đổi interface contract, sửa nạp/rút sự kiện hoặc tối ưu hóa gas. | `forge test --gas-report` không vượt trần block gas Fuji testnet. |
| **`contracts/`** | **P2** | **1. Code Formatting:** Kiểm tra chuẩn format Foundry (`forge fmt --check`).<br>**2. NatSpec Documentation:** Kiểm tra comment tài liệu hàm/biến. | Chỉnh sửa code formatting, natspec, hoặc script deploy. | `forge fmt --check` trả về 0 lỗi. |
| **`backend/`** | **P0** | **1. Attest Authorization Fail-Closed:** Backend từ chối khởi động nếu `ATTEST_API_KEY` rỗng trên chain khác `31337`.<br>**2. Integration Anvil:** Kiểm tra full luồng `createTrade -> deposit -> attest -> resolveClean` trên Anvil local node.<br>**3. Input Neo On-Chain:** Kiểm tra chỉ dùng ảnh niêm yết đã neo on-chain / có chữ ký seller (DEC-016). | Chạm `backend/attest_service.py`, `backend/chain.py`, `backend/auto_agent.py`, logic gọi contract. | Suite `backend/tests/test_integration_anvil.py` chạy đủ với Anvil, 0 test bị skip, 0 lỗi giao dịch. |
| **`backend/`** | **P1** | **1. Unit & Error Handling:** Xử lý 4xx/5xx chuẩn, không lộ `str(exception)` cho client (SE-05).<br>**2. Failure Injection:** Xử lý RPC gián đoạn, IPFS gateway HTTP 429 rate limit.<br>**3. Concurrency:** Hai request verify cùng lúc trên cùng 1 tradeId.<br>**4. Process Recovery:** Khởi động lại service khi tx đang pending. | Chạm API endpoints, proxy backend, worker polling, hoặc cấu trúc xử lý dữ liệu. | `pytest -rs backend/tests/test_service_unit.py` PASS 100%; mock network failures được xử lý êm thuận. |
| **`backend/`** | **P2** | **1. Logging Inspection:** Đảm bảo không log secret, private key, token, RPC auth header.<br>**2. Code Hygiene:** Tuân thủ import và không dùng debug prints. | Chỉnh sửa middleware log, config môi trường, hoặc docs backend. | Log kiểm tra thủ công hoặc grep không phát hiện secret leak. |
| **`ai-pipeline/`** | **P0** | **1. Input Binding Verification:** Xác minh dữ liệu đầu vào pipeline bắt buộc lấy từ URI/hash đã neo, không chấp nhận URL tự do từ client (DEC-016). | Chạm code nhận ảnh/bằng chứng phục vụ chấm điểm `attest`. | Kiểm tra chặn URL giả mạo pass 100%. |
| **`ai-pipeline/`** | **P1** | **1. Unit Tests:** Trích xuất đặc trưng pHash, ORB feature matching, QR nonce detection, OCR text extraction.<br>**2. Boundary Thresholds:** Kiểm tra các ngưỡng heuristic (`PHASH_REUSE_THRESHOLD = 8`, `MIN_GOOD_INLIERS = 15`, risk flag ≥ 70).<br>**3. Quantitative Evaluation:** Bộ dữ liệu kiểm thử thực tế có nhãn (confusion matrix, FPR, FNR).<br>**4. Resource Limits:** Chống cạn kiệt tài nguyên (ảnh quá khổ, video dài, timeout xử lý). | Chạm `ai-pipeline/evidence_check.py`, ngưỡng rủi ro, thuật toán thị giác máy tính. | `pytest -rs ai-pipeline/tests` PASS 100%; không phát sinh lỗi tràn bộ nhớ hoặc timeout vô hạn. |
| **`ai-pipeline/`** | **P2** | **1. Synthetic Tests:** Kiểm tra trên bộ mẫu tổng hợp (`ai-pipeline/tests/synth.py`).<br>**2. Performance Benchmarking:** Đo thời gian xử lý trung bình mỗi bằng chứng. | Thay đổi tối ưu thuật toán, cập nhật dependency thị giác. | Thời gian xử lý trung bình < 5s cho mỗi bằng chứng tiêu chuẩn. |
| **`frontend/`** | **P0** | **1. Contract Simulation Gate:** Bắt buộc gọi `simulateContract` trước `writeContract` để phát hiện revert trước khi user ký ví.<br>**2. Wallet Reconnect & Network Guard:** Đảm bảo chỉ cho phép ký giao dịch khi kết nối đúng Chain ID 43113 (Fuji). | Chạm code tương tác ví, custom hook wagmi, transaction dispatching. | Không có giao dịch mù (blind write); thông báo lỗi on-chain hiển thị rõ ràng cho user. |
| **`frontend/`** | **P1** | **1. Unit Tests cho `frontend/lib/`:** Xử lý parse lỗi revert (`frontend/lib/errors.ts`), format tiền tệ/thời gian (`frontend/lib/format.ts`), backend client (`frontend/lib/backend.ts`).<br>**2. Precedence Bug Fix:** Đảm bảo regex `/violator not a party/` được match trước `/not a party/`. | Chạm utility libraries trong `frontend/lib/**` hoặc logic kết nối API backend. | Unit test cho `lib/` pass; regex phân giải đúng mã lỗi smart contract. |
| **`frontend/`** | **P2** | **1. Production Build:** `npm run build` thành công không phát sinh error.<br>**2. Static Typecheck:** `npx tsc --noEmit` hoàn tất với 0 lỗi TypeScript.<br>**3. Lint Check:** `npm run lint` pass (khi ESLint được cài đặt theo Q12).<br>**4. Accessibility Checks:** Text contrast ≥ 4.5:1, keyboard nav, viewport 375px không cuộn ngang. | Mọi thay đổi code frontend trong `frontend/**`. | Build và Typecheck pass 100%; không có warning phá vỡ layout. |
| **`cross-module`** | **P0** | **1. Local Anvil End-to-End Flow:** Chạy trọn vẹn kịch bản thực tế từ command line qua 3 luồng: Clean Release, Dispute Resolution, Timeout Cancellation. | Thay đổi protocol, luồng tương tác giữa Frontend - Backend - Contracts. | Script E2E chạy thành công từ đầu tới cuối trên local chain Anvil. |
| **`cross-module`** | **P1** | **1. Golden-File Parity Tests:**<br>- Template `listing_message` (Python `backend/auto_agent.py`) ↔ `listingMessage` (TS `frontend/lib/backend.ts`) phải khớp từng ký tự.<br>- Canonical JSON serialization & report hashing (`ai-pipeline/evidence_check.py` ↔ `frontend/lib/backend.ts`).<br>- Đồng bộ ABI đồng thời tại 3 vị trí: `contracts/out/`, `backend/abi/`, `frontend/lib/abi/`. | Thay đổi cấu trúc message ký EIP-191, thay đổi schema report JSON, hoặc cập nhật ABI contract. | Test so khớp golden-file fixture pass; lệch 1 ký tự phải gây test FAIL lập tức. |
| **`cross-module`** | **P2** | **1. Documentation Link & Path Check:** Kiểm tra toàn bộ đường dẫn trong dấu backtick trỏ tới file tồn tại trên repository (AC-19). | Thay đổi tài liệu quy trình, specs, hoặc tái cấu trúc thư mục. | Script quét backtick path hoàn tất với 0 lỗi file thiếu. |

---

## 4. Lệnh Thực Thi Chuẩn & Định Dạng Kết Quả

Khi chạy kiểm thử, agent và reviewer bắt buộc thực thi chính xác các câu lệnh chuẩn dưới đây kèm theo cờ bắt buộc:

| Module | Lệnh Thực Thi Chuẩn | Thư Mục Làm Việc | Cờ Bắt Buộc & Ý Nghĩa | Định Dạng Dòng Kết Quả Bắt Buộc |
|---|---|---|---|---|
| **`contracts/`** | `forge test -vv` | `contracts/` | `-vv`: Hiển thị chi tiết stack traces khi test fail.<br>`--gas-report`: Đo gas khi chạm P1. | Dòng tổng kết Foundry: `Test result: ok. N passed; 0 failed; 0 skipped; finished in Xms` |
| **`contracts/` (Fuzz/Inv)** | `forge test --match-contract "EscrowInvariant\|EscrowTest" -vv` | `contracts/` | Fuzz runs 512, Invariant runs 256 depth 200 (theo `foundry.toml`). | Dòng kết quả invariant: `[PASS] invariantBalanceMatchesDeposits() (runs: 256, calls: 51200, reverts: ...)` |
| **`backend/`** | `pytest -rs backend/tests` | Gốc repository | `-rs`: Báo cáo chi tiết lý do skip.<br>`--strict-markers`: Chặn warning marker lạ. | Dòng tổng kết pytest: `= N passed, M failed, K skipped in Xs =` (Yêu cầu: `K = 0` nếu chạm backend) |
| **`ai-pipeline/`** | `pytest -rs ai-pipeline/tests` | Gốc repository | `-rs`: Hiển thị lý do skip nếu thiếu Tesseract OCR. | Dòng tổng kết pytest: `= N passed, M failed, K skipped in Xs =` (Yêu cầu: `K = 0` nếu chạm pipeline) |
| **Tất cả Python** | `pytest -rs` | Gốc repository | Đọc `pytest.ini` gom `ai-pipeline/tests` và `backend/tests`. | Dòng tổng kết pytest: `= N passed, M failed, K skipped in Xs =` |
| **`frontend/` (Build)** | `npm run build` | `frontend/` | Next.js production packaging check. | Output kết thúc với `✓ Compiled successfully` và danh sách Route chunks. |
| **`frontend/` (Types)** | `npx tsc --noEmit` | `frontend/` | `--noEmit`: Kiểm tra type tĩnh không sinh file JS. | Không có output (exit code 0). |
| **`frontend/` (Lint)** | `npm run lint` | `frontend/` | Chạy sau khi Owner phê duyệt cài đặt ESLint (Q12). | `✔ No ESLint warnings or errors` |
| **`cross-module` (E2E)** | `bash contracts/script/e2e_anvil.sh` | Gốc repository | Chạy kịch bản E2E trên Anvil node. | Từng bước in `[PASS]` và xác nhận state transition on-chain thành công. |

---

## 5. Điều Kiện Tiên Quyết Về Môi Trường (Environment Prerequisites)

Để bộ kiểm thử tích hợp (Integration) và thị giác máy tính (AI Pipeline) không bị bỏ qua (skip), môi trường máy trạm hoặc CI bắt buộc phải cài đặt đầy đủ các thành phần sau:

```
+-----------------------------------------------------------------------------------+
|                           MÔI TRƯỜNG KIỂM THỬ BẮT BUỘC                            |
+---------------------+-------------------+-------------------+---------------------+
|      FOUNDRY        |     TESSERACT     |      NODE.JS      |       PYTHON        |
|  forge / anvil      |   tesseract-ocr   |     v18+ / npm    |     v3.12+ venv     |
| (contracts/backend) |   (ai-pipeline)   |    (frontend)     |   (backend & ai)    |
+---------------------+-------------------+-------------------+---------------------+
```

### Chi Tiết Từng Thành Phần Môi Trường:

1. **Foundry Toolchain (`forge`, `anvil`):**
   - **Phiên bản tối thiểu:** `forge 1.9.0` / `anvil 1.9.0` hoặc mới hơn.
   - **Đường dẫn nhận diện:** Nằm trong biến môi trường `PATH` hoặc tại `~/.foundry/bin/anvil` (được tự động dò tìm bởi `backend/tests/conftest.py:_find_bin`).
   - **Hệ quả nếu thiếu:** 
     * `contracts/` hoàn toàn không thể biên dịch hoặc chạy test.
     * `backend/tests/conftest.py:L80` kích hoạt `pytest.skip("anvil chưa cài (Foundry)")`, khiến toàn bộ integration test suite bị skip.
   - **Điều kiện phụ thuộc Build Artifact:** Trước khi chạy `backend/tests/test_integration_anvil.py`, bắt buộc phải chạy `forge build` trong `contracts/` để sinh `contracts/out/Escrow.sol/Escrow.json` và `contracts/out/CollectibleToken.sol/CollectibleToken.json`. Nếu thiếu, `test_integration_anvil.py:L39` sẽ skip ngay lập tức.

2. **Tesseract OCR Engine:**
   - **Phiên bản tối thiểu:** `tesseract 4.0.0` hoặc 5.x.
   - **Đường dẫn nhận diện:** Nằm trong `PATH` hệ điều hành (lệnh `tesseract --version`) hoặc cấu hình qua `pytesseract.pytesseract.tesseract_cmd`.
   - **Hệ quả nếu thiếu:**
     * `ai-pipeline/tests/test_evidence_check.py:L18` kích hoạt skip marker: `reason="Tesseract chưa cài"`.
     * `backend/tests/test_integration_anvil.py:L52` kích hoạt skipmark toàn bộ class integration test.

3. **Node.js & npm (Frontend Engine):**
   - **Phiên bản tối thiểu:** Node.js `>= 18.17.0` (yêu cầu bởi Next.js 14 và React 18), npm `>= 9.0.0`.
   - **Cài đặt thư viện:** Phải chạy `npm install` bên trong thư mục `frontend/` trước khi thực hiện build hoặc typecheck.
   - **Hệ quả nếu thiếu:** Lệnh `npm run build` và `npx tsc --noEmit` không thể thực thi.

4. **Python Virtual Environment (Backend & AI):**
   - **Phiên bản tối thiểu:** Python `>= 3.12`.
   - **Cài đặt gói:** Khởi tạo virtualenv và cài đặt đầy đủ qua `pip install -r requirements-dev.txt` (bao gồm `pytest>=8`, `httpx>=0.27`, `fastapi>=0.110`, `web3>=6.15`, `opencv-python-headless>=4.9`, `Pillow>=10.0`, `ImageHash>=4.3`, `pytesseract>=0.3.10`).
   - **Hệ quả nếu thiếu:** Lỗi `No module named pytest` hoặc thiếu thư viện dependency runtime.

---

## 6. Skip Policy & Cổng Duyệt Chất Lượng (Quality Gate)

Căn cứ theo `.agents/rules/80-testing.md` và `.agents/skills/qa-review/SKILL.md`:

```
               [ Chạy Suite Kiểm Thử Bắt Buộc ]
                             │
                             ▼
               / Có test nào bị SKIP trong \
              <  suite của module bị chạm?  >
               \                           /
                             │
               ┌─────────────┴─────────────┐
            CÓ │                           │ KHÔNG
               ▼                           ▼
     [ Verdict: BLOCKED ]        / Tất cả tests PASS? \
   (Không được báo PASS,        <                      >
    cấm merge/fast-track)        \                    /
                                           │
                             ┌─────────────┴─────────────┐
                          CÓ │                           │ KHÔNG
                             ▼                           ▼
                    [ Verdict: ACCEPT ]       [ Verdict: CHANGES_REQUESTED ]
```

1. **Quy định Skip nghiêm ngặt:** Bất kỳ test nào bị skip trong suite bắt buộc của module bị chạm đều dẫn tới kết quả nghiệm thu **`BLOCKED`**. Task không được phép chuyển trạng thái sang `ACCEPTED` hay merge vào `main`.
2. **Ngoại lệ duy nhất:** Chỉ khi có phê duyệt bằng văn bản của Project Owner trong phiên đối với các hạn chế môi trường đã ghi nhận (ví dụ thiếu Tesseract trên môi trường dev tạm thời), verdict tối đa chỉ là **`ACCEPT WITH LIMITATIONS`**, kèm điều kiện bắt buộc mở task xử lý dứt điểm trước khi qua Release Gate.
3. **Bằng chứng độc lập:** Báo cáo QA (`<TASK_ID>-qa-report.md`) bắt buộc phải có mục `"Commands rerun by reviewer"` kèm output thực tế được rerun độc lập bởi Reviewer.

---

## 7. Danh Mục Lỗ Hổng Kiểm Thử Đã Biết (Known Testing Gaps: TST-01..TST-07)

Các lỗ hổng dưới đây được phát hiện trong đợt kiểm toán hệ thống (`docs/audit/AGENT_RULES_AUDIT_REPORT.md` mục 8) và được theo dõi trong `docs/agent-ops/RISK_REGISTER.md`. Task hiện tại không bắt buộc phải giải quyết toàn bộ các gap này, nhưng mọi task mới tuyệt đối không được làm trầm trọng thêm các vi phạm đã biết:

### TST-01 · High — Quy tắc kiểm thử không phân loại theo module và mức độ rủi ro
- **Affected Paths:** `.agents/rules/80-testing.md`, `docs/agent-ops/TASK_TEMPLATE.md`.
- **Mô tả & Bằng chứng:** Trước ESC-090, `.agents/rules/80-testing.md` chỉ có 8 gạch đầu dòng chung chung; Task Template chỉ liệt kê sơ sài Unit/Integration/Contract/Regression. Các bộ test fuzzing và invariant trong `contracts/` được viết theo sáng kiến cá nhân của implementer mà không có quy định bắt buộc từ quy trình.
- **Tác động:** Agent có thể viết vài test sơ sài cho luồng chuyển tiền và báo hoàn thành mà không bị QA từ chối.
- **Biện pháp xử lý:** Khởi tạo `docs/agent-ops/TEST_MATRIX.md` và cập nhật `.agents/rules/80-testing.md` (giải quyết trong ESC-090).

### TST-02 · High — Test bị skip nhưng vẫn được báo cáo là "ALL PASS"
- **Affected Paths:** `backend/tests/conftest.py:L80`, `backend/tests/test_integration_anvil.py:L39, L52`, `ai-pipeline/tests/test_evidence_check.py:L18`, `CURRENT_STATUS.md:L28-30`.
- **Mô tả & Bằng chứng:** Toàn bộ test tích hợp Anvil và test OCR sẽ âm thầm bị skip nếu máy chạy thiếu Foundry hoặc Tesseract. Tài liệu `CURRENT_STATUS.md` từng ghi nhận "ALL PASS" nhưng không hề đính kèm số lượng test bị skip. Không có CI độc lập để xác thực môi trường.
- **Tác động:** Code chứa lỗi nghiêm trọng có thể được merge vào nhánh chính do các bài test cốt lõi thực chất đã bị bỏ qua mà không ai hay biết.
- **Biện pháp xử lý:** Áp dụng Skip Policy chuẩn yêu cầu cờ `-rs`, dán dòng tổng kết có `skipped`, và cấm verdict PASS nếu có test skip trong module bị chạm (giải quyết trong ESC-090).

### TST-03 · High — Frontend hoàn toàn không có test, thiếu ESLint, và lỗi regex trong xử lý lỗi
- **Affected Paths:** `frontend/package.json`, `frontend/lib/errors.ts:L17, L29`, `docs/specs/FRONTEND_SPEC.md:L169`.
- **Mô tả & Bằng chứng:** `frontend/package.json` không có script `test` và không cài đặt `eslint`. Báo cáo nhiệm vụ trước đây từng ghi "0 lỗi ESLint" dù lệnh lint không thể chạy. File `frontend/lib/errors.ts` bị lỗi thứ tự regex khi đặt `/not a party/` trước `/violator not a party/`, dẫn đến revert message của smart contract bị hiển thị sai lệch hoàn toàn. Ngoài ra, thiếu kiểm tra `simulateContract` trước khi gửi giao dịch.
- **Tác động:** Trải nghiệm người dùng bị hỏng; lỗi giao dịch không được giải thích chính xác; vi phạm cam kết chất lượng.
- **Biện pháp xử lý:** Sửa lỗi regex `frontend/lib/errors.ts` trong task ESC-080; cài đặt ESLint và viết unit test cho `frontend/lib/` theo đề xuất Q12 của Owner.

### TST-04 · Medium — Lỗ hổng trong bộ test hợp đồng thông minh (Escrow Contract)
- **Affected Paths:** `contracts/test/Escrow.t.sol`, `contracts/test/EscrowInvariant.t.sol:L38-126`.
- **Mô tả & Bằng chứng:** Handler invariant của hợp đồng bao gồm các hành động create, deposit, cancel, evidence, attest, complain, resolve... nhưng **thiếu hoàn toàn handler `withdraw`** và thiếu actor từ chối nhận AVAX (rejecting receiver). Do đó, biến trạng thái `pendingWithdrawals` chưa từng được kiểm tra trong invariant testing. Ngoài ra, thiếu test biên thời gian `block.timestamp == disputeDeadline` đồng thời cho `resolveClean` và `fileComplaint`, thiếu test owner tự làm agent (SEC-03), và thiếu test tích lũy điểm uy tín +5 của nạn nhân.
- **Tác động:** Nguy cơ tiềm ẩn về việc mất cân bằng số dư (`balance != outstanding + pending`) hoặc kẹt tiền khi giải quyết tranh chấp trong các kịch bản phức tạp.
- **Biện pháp xử lý:** Mở task bổ sung invariant handler cho `withdraw` và bổ sung các test case biên sau giai đoạn Feature Freeze (trước thềm audit chính thức).

### TST-05 · Medium — Thiếu kiểm thử tính nhất quán (Parity) giữa các module
- **Affected Paths:** `backend/auto_agent.py:L74-84`, `frontend/lib/backend.ts:L177-182`, `ai-pipeline/evidence_check.py:L565`, `frontend/lib/backend.ts:L133-138`, ABI tại 3 thư mục.
- **Mô tả & Bằng chứng:** Chuỗi template ký `listing_message` và cơ chế canonical JSON hashing được viết độc lập bằng Python ở backend và TypeScript ở frontend. Ràng buộc duy nhất hiện tại là comment nhắc nhở "phải khớp từng ký tự". ABI của Escrow contract bị nhân bản tại 3 vị trí khác nhau mà không có script kiểm tra đồng bộ.
- **Tác động:** Bất kỳ sự thay đổi nhỏ nào (như khoảng trắng, thứ tự key JSON) ở một phía sẽ làm gãy chữ ký hoặc sai lệch hash báo cáo, khiến AI agent không thể attest hoặc hợp đồng từ chối xử lý.
- **Biện pháp xử lý:** Xây dựng bộ Golden-File Parity Test: Python xuất dữ liệu mẫu chuẩn ra file JSON fixture và test của TypeScript đọc fixture để đối chiếu tính tương đồng tuyệt đối.

### TST-06 · Medium — Thiếu đánh giá định lượng trên dữ liệu thực tế cho AI Pipeline
- **Affected Paths:** `ai-pipeline/evidence_check.py:L51-53, L516-538`, `.agents/rules/50-ai-pipeline.md:L11`.
- **Mô tả & Bằng chứng:** Các ngưỡng heuristic quan trọng (`PHASH_REUSE_THRESHOLD = 8`, `MIN_GOOD_INLIERS = 15`, ngưỡng flag rủi ro ≥ 70) được ấn định thủ công mà không có báo cáo đo lường tỉ lệ nhận diện sai (FPR) hay bỏ lọt vi phạm (FNR). Hiện tại toàn bộ test của pipeline đều sử dụng ảnh nhân tạo tự sinh (`ai-pipeline/tests/synth.py`).
- **Tác động:** Không có cơ sở khoa học để trả lời ban giám khảo hackathon về độ chính xác của AI; nguy cơ AI flag oan người bán lương thiện hoặc bỏ sót gian lận trong điều kiện ánh sáng thực tế.
- **Biện pháp xử lý:** Viết lại `.agents/rules/50-ai-pipeline.md` trong ESC-090 cấm tuyên bố độ chính xác chưa đo kiểm; xây dựng bộ dữ liệu đánh giá tối thiểu 20 cặp ảnh thực tế và xuất Confusion Matrix trước ngày Demo Day.

### TST-07 · Medium — Thiếu kiểm thử chích lỗi (Failure-Injection), đồng thời (Concurrency) và phục hồi (Recovery)
- **Affected Paths:** `backend/auto_agent.py:L92-95, L143-201`, `backend/attest_service.py:L401-403, L507-509`, `backend/chain.py`.
- **Mô tả & Bằng chứng:** Backend có cơ chế thử lại (exponential backoff retry) và khóa in-memory per-trade, nhưng chưa có test tự động nào kiểm tra: 2 tiến trình worker cùng attest một trade; agent bị crash/restart giữa lúc transaction đang pending; IPFS gateway trả về lỗi HTTP 429 kéo dài vượt quá `ATTEST_WINDOW` (600s); xung đột số nonce giao dịch giữa auto-agent và manual verify.
- **Tác động:** Backend có thể bị treo, nghẽn hàng đợi, mất đồng bộ trạng thái giao dịch hoặc làm lỡ hạn chót chứng thực của trade trong điều kiện tải cao hoặc mạng chập chờn khi demo trực tiếp.
- **Biện pháp xử lý:** Bổ sung tối thiểu 3 test kịch bản vào bộ integration test: RPC failure retry, simultaneous request lock, và resume service state from registry.

---

## 8. Hướng Dẫn Áp Dụng Cho Task Specification

Khi lập Task Spec theo mẫu `docs/agent-ops/TASK_TEMPLATE.md`:

1. **Điền Mục Metadata:**
   - Xác định đúng `Risk tier: P0 / P1 / P2` căn cứ theo bảng tại Mục 2.
2. **Điền Mục Test Requirements:**
   - Trường `TEST_MATRIX rows applied:` Phải liệt kê rõ ràng tên Module và Risk Tier tương ứng (ví dụ: `contracts/ (P0), backend/ (P0, P1)`).
   - Trường `Skip policy:` Bắt buộc dẫn chiếu `.agents/rules/80-testing.md`.
3. **Báo Cáo Nghiệm Thu:**
   - Phải dán nguyên văn output của lệnh test chuẩn quy định tại Mục 4, bao gồm cả dòng tổng kết số lượng test `passed`, `failed`, `skipped`.
