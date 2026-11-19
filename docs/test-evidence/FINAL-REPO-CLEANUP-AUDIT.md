# FINAL-CLEANUP-001 — Repository Audit Before Freeze

- **Ngày:** 2026-11-20 (GMT+7) · **Chế độ:** AUDIT ONLY — không xóa, không sửa source/config, không commit cleanup.
- **Baseline:** `origin/main` @ `532686f3c3d9a2429e4a35cce3c6d1f811755caa` (PR #23) — `git fetch` xác minh. Worktree `chore/final-local-demo-cleanup`.
- **Ký hiệu:** **[VERIFIED]** = đã chạy/đo thật · **[INFERRED]** = suy luận từ đọc code/tham chiếu, chưa chạy.

## 1. Executive Summary

| Phân loại | Số file | Ghi chú |
|---|---|---|
| **KEEP** | **483** | 178 file dự án + 305 file thư viện thực sự cần (`forge-std/src`, `openzeppelin-contracts/contracts`, LICENSE, `package.json` ghi version) |
| **REMOVE CANDIDATE** | **465** | Toàn bộ nằm trong `contracts/lib/` (test, docs, audits PDF, certora, hardhat, nested lib… của thư viện vendored) — ~9.4 MB |
| **OPTIONAL / ARCHIVE** | **4** | Tool demo Anvil (2) + Codespaces devcontainer (2) |
| **REVIEW REQUIRED** | **11** | Cấu hình Shared/Ops + test của nó (6), `docs/context/*` lỗi thời (4), barrel file frontend (1) |
| **Tổng** | **963** | = `git ls-files \| wc -l` |

- Ngoài `contracts/lib/`, repository **đã khá sạch**: không có file rác, không có link hỏng, không có file `.env`/key thật được track, gitleaks lịch sử **clean**.
- **Phương án tối ưu, rủi ro thấp nhất:** chỉ trim `contracts/lib/` (465 file, 49% số file tracked) — **đã mô phỏng an toàn: `forge test` 81 passed / 0 failed / 0 skipped** sau khi trim. Giữ nguyên Shared/Ops (đang có test bảo vệ) và chỉ cập nhật tài liệu lỗi thời.

## 2. Git baseline & inventory

| Thư mục | File tracked | Ghi chú |
|---|---|---|
| `contracts/` | 780 | 770 trong `contracts/lib/` (vendored, **không phải submodule** — không có `.gitmodules`, mode `100644`) |
| `frontend/` | 112 | Next.js `15.5.29` |
| `backend/` | 23 | |
| `docs/` | 22 | 10 `.md` + 12 ảnh `.png` bằng chứng Fuji |
| `ai-pipeline/` | 6 | |
| `docker/` | 4 | |
| `.devcontainer/` | 2 | |
| Root | 14 | README, RUN_LOCAL_BEGINNER, 3 compose, 3 env example, ignore files, pytest.ini, requirements-dev |

- Tracked nhưng khớp rule ignore: `frontend/.env.local.example` (rule `.env.*` không có negation cho file này) **[VERIFIED]**.
- Untracked/ignored trong worktree sạch: không có **[VERIFIED]**.
- Lịch sử: 82 commit (`git rev-list --all --count`).
- Tree `532686f` ≡ tree `10f27db` (`91ebbfe…`) ⇒ kết quả QA của PR #23 áp dụng nguyên vẹn: pytest 223/0/0, forge 81/0/0, node --test 101/0/0, tsc, next build, Docker build + runtime smoke **[VERIFIED]**.

## 3. KEEP list (483)

| Nhóm | Đường dẫn | Lý do / bằng chứng |
|---|---|---|
| Docker local demo | `compose.yaml`, `.env.example`, `.dockerignore`, `docker/backend-entrypoint.sh`, `docker/frontend-entrypoint.sh`, `docker/init_secrets.py`, `backend/Dockerfile`, `frontend/Dockerfile` | Đường chạy chính; được `compose.yaml`/Dockerfile tham chiếu; runtime smoke PASS **[VERIFIED]** |
| Backend runtime | `backend/{attest_service,auto_agent,chain,db,listings,ops_auth,pin_relay,trade_indexer,worker}.py`, `backend/abi/Escrow.json`, `backend/requirements.txt`, `backend/.env.example` | Tất cả 9 module được `backend/Dockerfile` COPY và được import chéo/test import **[VERIFIED: git grep import]** |
| Backend tests | `backend/tests/*.py` (9) | Đều chạy trong 223 test |
| AI pipeline | `ai-pipeline/**` (6) | `evidence_check.py` được Dockerfile COPY; tests chạy |
| Frontend | `frontend/**` trừ 1 file ở §6 (111) | Import graph: mọi file `lib/`, `components/`, `hooks/`, `types/` được import; 6/6 ảnh `public/` được tham chiếu **[VERIFIED: script import graph]** |
| Contracts | `contracts/{src,test,script/Deploy.s.sol,deployments/43113.json,foundry.toml,.gitignore}` | Source, test, deploy Fuji, parity địa chỉ |
| Thư viện cần thiết | `contracts/lib/forge-std/src/**` (26), `contracts/lib/forge-std/{LICENSE-APACHE,LICENSE-MIT,package.json}`, `contracts/lib/openzeppelin-contracts/contracts/**` (274), `contracts/lib/openzeppelin-contracts/{LICENSE,package.json}` | Compiler dùng 31 file (24 forge-std/src + 7 OZ: `Ownable`, `ERC20`, `IERC20`, `IERC20Metadata`, `draft-IERC6093`, `Context`, `ReentrancyGuard`) **[VERIFIED: forge build-info]**. Giữ nguyên cả thư mục `src`/`contracts` để không phá tính toàn vẹn thư viện; giữ LICENSE (MIT/Apache yêu cầu) và `package.json` (OZ `5.1.0`, forge-std `1.9.4`) |
| Docs submission | `README.md`, `RUN_LOCAL_BEGINNER.md`, `docs/local-demo/LOCAL-DEMO-SETUP-GUIDE.md`, `docs/specs/SLIDE_AND_VIDEO_SCRIPT.md`, `docs/test-evidence/{AVALANCHE-FUJI-DEMO-EVIDENCE,LOCAL-DEMO-QA-REPORT,FINAL-LOCAL-DEMO-RELEASE-GATE,FUJI-TRADE-4-QA}.md` | Hướng dẫn chạy + bằng chứng; 0 link hỏng **[VERIFIED]** |
| Ảnh bằng chứng Fuji | `docs/test-evidence/fuji-trades/trade-{2,3,4}/*.png` (12, ~1.9 MB) | Mỗi ảnh được `FUJI-TRADE-4-QA.md` tham chiếu **[VERIFIED]**; là bằng chứng UI + Snowtrace — **không xóa** |
| Repo hygiene | `.gitignore`, `.gitattributes`, `.gitleaksignore`, `pytest.ini`, `requirements-dev.txt` | `.gitleaksignore` cần để gitleaks lịch sử exit 0 |

## 4. REMOVE CANDIDATE list (465 — chỉ trong `contracts/lib/`)

| Đường dẫn chính xác | File | Lý do | Bằng chứng dependency |
|---|---|---|---|
| `contracts/lib/openzeppelin-contracts/test/` | 154 | Test suite JS/Hardhat của OZ | Không có trong build-info; `.dockerignore` loại `contracts/lib/` |
| `contracts/lib/openzeppelin-contracts/lib/` | 69 | Bản forge-std/erc4626-tests lồng của OZ | Remapping dự án trỏ `lib/forge-std` gốc; không file nào dùng |
| `contracts/lib/openzeppelin-contracts/scripts/` | 61 | Script release/codegen của OZ | Không tham chiếu |
| `contracts/lib/openzeppelin-contracts/certora/` | 59 | Formal verification specs | Không tham chiếu |
| `contracts/lib/openzeppelin-contracts/docs/` | 39 | Tài liệu OZ | Không tham chiếu |
| `contracts/lib/openzeppelin-contracts/.github/` | 14 | CI của OZ | — |
| `contracts/lib/openzeppelin-contracts/audits/` | 7 | PDF audit (~2.4 MB, 3 file lớn nhất repo) | — |
| `contracts/lib/openzeppelin-contracts/hardhat/` | 6 | Plugin Hardhat | Dự án dùng Foundry |
| `contracts/lib/openzeppelin-contracts/` root: `.changeset`, `.codecov.yml`, `.editorconfig`, `.eslintrc`, `.githooks`, `.gitignore`, `.gitmodules`, `.mocharc.js`, `.prettierrc`, `.solcover.js`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `FUNDING.json`, `GUIDELINES.md`, `README.md`, `RELEASING.md`, `SECURITY.md`, `foundry.toml`, `fv-requirements.txt`, `hardhat.config.js`, `logo.svg`, `netlify.toml`, `package-lock.json`, `remappings.txt`, `renovate.json`, `slither.config.json`, `solhint.config.js` | 28 | Cấu hình dev của OZ | Foundry dự án dùng `contracts/foundry.toml` + remapping riêng |
| `contracts/lib/forge-std/test/` | 20 | Test của forge-std | — |
| `contracts/lib/forge-std/` khác: `.github/` (2), `.gitattributes`, `.gitignore`, `CONTRIBUTING.md`, `README.md`, `foundry.toml`, `scripts/vm.py` | 8 | Dev files của forge-std | — |

- **Ảnh hưởng:** Docker — **không** (`.dockerignore` đã loại `contracts/lib/`); Frontend — không; Backend — không (chỉ dùng `contracts/deployments/` và artifacts `contracts/out/` sinh lúc test); **Foundry — đã mô phỏng: bản trim (305 file lib) `forge test` 81/0/0** **[VERIFIED trên bản sao tạm, không đụng repo]**; Fuji — không (không redeploy).
- **Lợi ích phụ:** loại false positive gitleaks `ecdsa_secp256r1_sha256_p1363_test.json` khi quét working tree **[VERIFIED]**; giảm ~9.4 MB / 11.2 MB của `contracts/lib`.
- **Rủi ro:** **LOW** cho build/test (đã mô phỏng). **MEDIUM** về quy trình: nếu sau này cần nâng cấp thư viện phải tải lại bản gốc.
- **Rollback:** `git revert <cleanup-commit>` (một commit duy nhất), hoặc khôi phục từ tag gốc OpenZeppelin `v5.1.0` / forge-std `v1.9.4`.

## 5. OPTIONAL / ARCHIVE (4)

| Đường dẫn | Lý do | Bằng chứng | Rủi ro nếu xóa | Đề xuất |
|---|---|---|---|---|
| `backend/scripts/demo_local.py` | Demo CLI trên Anvil, không phải Fuji | Không được README/tests tham chiếu **[VERIFIED]**; chỉ tham chiếu `contracts/script/e2e_anvil.sh`. Còn chạy được với API hiện tại hay không: **NOT VERIFIED** | LOW | Giữ (dev tool) hoặc xóa cùng cặp; Owner chọn |
| `contracts/script/e2e_anvil.sh` | Script E2E Anvil | Chứa 4 private key = **khóa mặc định công khai Anvil #0–#3** **[VERIFIED đối chiếu 10 khóa Anvil]** | LOW | Như trên |
| `.devcontainer/devcontainer.json`, `.devcontainer/compose.codespaces.yml` | Chạy trên GitHub Codespaces | Được `RUN_LOCAL_BEGINNER.md §5` hướng dẫn **[VERIFIED]**; chạy thực tế trên Codespaces **NOT VERIFIED** | LOW–MEDIUM (mất cách chạy không cần Docker local cho giám khảo) | **Giữ** |

## 6. REVIEW REQUIRED (11)

| Đường dẫn | Vấn đề | Bằng chứng | Phương án | Rủi ro |
|---|---|---|---|---|
| `compose.shared.yaml`, `compose.ops.yaml`, `.env.shared.example`, `.env.ops.example`, `docker/Caddyfile.ops.example`, `backend/tests/test_phase3_t4_ops_docker.py` | Cấu hình Shared/Ops/VPS không dùng cho Local Demo | `test_phase3_t4_ops_docker.py` (7 test) assert trực tiếp nội dung các file này **[VERIFIED: git grep]**; README §3 đã gọi là "Nâng cao (tuỳ chọn)"; mã runtime hỗ trợ shared mode (`BFF_AUTH_MODE`, `ops_auth.py`, `pin_relay.py`, nhánh shared trong `frontend-entrypoint.sh`) là **code đã freeze**, vẫn còn dù xóa compose | **A (khuyến nghị): giữ nguyên** — có test bảo vệ, đã gắn nhãn tuỳ chọn. B: xóa 5 file + test ⇒ mất 7 test, để lại code shared không còn đường chạy được tài liệu hoá | A: none · B: MEDIUM |
| `docs/context/CURRENT_STATUS.md` | Lỗi thời: baseline `f6b909a`, test 80/185/67, "Live Fuji dApp OPTIONAL" | Không file nào tham chiếu **[VERIFIED]** | Cập nhật theo `532686f` **hoặc** xóa (README + test-evidence đã thay thế) | LOW |
| `docs/context/TECH_STACK.md`, `docs/context/BUSINESS_REQUIREMENTS.md` | Baseline `bdb1e13` | Không tham chiếu; nội dung kỹ thuật còn đúng phần lớn **[INFERRED]** | Cập nhật dòng baseline hoặc giữ nguyên | LOW |
| `docs/context/DECISION_LOG.md` | Baseline `f6b909a`; 7 dòng `PROPOSED`; thiếu `DEC-023..027`; nhắc `FRONTEND_SPEC.md`, `VAI3_DYNAMIC_DEPOSIT_SPEC.md` (đã bị ignore, dạng text không phải link) | **[VERIFIED: grep]** | Owner duyệt **từng dòng** (OD-P4-06); không tự CONFIRM | LOW |
| `frontend/lib/local-wallet/index.ts` | Barrel file không được import | Import graph **[VERIFIED]** | **Giữ** — thuộc `frontend/lib/**` đã freeze, lợi ích xóa ≈ 0 | — |

Hạng mục cấu hình nhỏ (sửa nội dung, không xóa): `.gitignore` nên thêm `!frontend/.env.local.example` cho nhất quán (file đang tracked nhưng khớp rule ignore). Rủi ro LOW.

## 7. Dependency impact analysis

| Thành phần | Nguồn sự thật | Kết quả |
|---|---|---|
| Docker build context | `.dockerignore` loại `contracts/lib/`, `contracts/test/`, `contracts/script/`, `docs/`, `.devcontainer/`, tests | Trim `contracts/lib` không đổi image **[VERIFIED đọc .dockerignore + Dockerfile]** |
| Backend image | `backend/Dockerfile` COPY 9 module + `ai-pipeline/evidence_check.py` + `backend/abi` + `contracts/deployments` | Không chạm file đề xuất |
| Frontend image | `frontend/Dockerfile` COPY `frontend/` + `docker/frontend-entrypoint.sh` | Không chạm |
| Foundry | `foundry.toml` remapping `@openzeppelin/contracts/ → lib/openzeppelin-contracts/contracts/`; forge-std auto-detect `lib/forge-std/src` | Build-info: 31 file lib dùng; mô phỏng trim PASS |
| Pytest Anvil integration | Cần `contracts/out/` (sinh bởi `forge build`) + `anvil` | Không phụ thuộc file lib đề xuất xóa **[INFERRED từ mô phỏng forge build thành công]** |
| Fuji | `contracts/deployments/43113.json` + địa chỉ trong compose/README | Không đổi |

## 8. Security findings

| # | Kết quả | Trạng thái |
|---|---|---|
| S1 | `gitleaks git --log-opts=--all` (82 commit) với `.gitleaksignore`: **no leaks** | PASS **[VERIFIED]** |
| S2 | Quét working tree: 3 phát hiện — Idempotency-Key test, địa chỉ CDU, vector test OZ (`ecdsa_secp256r1…json`) — đều false positive; cái thứ 3 biến mất nếu trim `contracts/lib` | PASS **[VERIFIED]** |
| S3 | Chuỗi dạng private key ngoài lib: chỉ `contracts/script/e2e_anvil.sh` L13–16 = khóa mặc định công khai Anvil #0–#3 | PASS (không phải secret) **[VERIFIED]** |
| S4 | Không có `.env`, `*.pem`, `*.key`, keystore được track; `docker/init_secrets.py` là bộ sinh secret ngẫu nhiên, không chứa giá trị | PASS **[VERIFIED]** |
| S5 | `frontend/.env.local.example` tracked trong khi khớp rule `.env.*` — chỉ là template, không chứa secret | LOW / hygiene |

Không có giá trị bí mật nào được in trong báo cáo này.

## 9. Cleanup execution plan (thứ tự an toàn — CHỜ OWNER DUYỆT)

1. **Commit 1 — trim `contracts/lib/`** (465 file, §4) bằng `git rm -r` đúng danh sách; không đụng `src/`, `contracts/`, LICENSE, `package.json`.
2. **Commit 2 — docs** (tuỳ quyết định §6): cập nhật/xóa `docs/context/CURRENT_STATUS.md`; cập nhật baseline `TECH_STACK.md`/`BUSINESS_REQUIREMENTS.md`; `DECISION_LOG.md` chỉ theo phê duyệt từng dòng; `.gitignore` negation.
3. **Commit 3 (chỉ nếu Owner chọn)** — xóa `demo_local.py` + `e2e_anvil.sh` (cùng cặp).
4. Shared/Ops: **không làm gì** (khuyến nghị phương án A).
5. Chạy QA §10 → local commit → Owner push/merge.

## 10. QA checklist sau cleanup

- [ ] `git ls-files | wc -l` = 963 − số file đã duyệt xóa
- [ ] `forge build` + `forge test` — 0 failed, 0 skipped (≥ 81)
- [ ] `pytest -rs` — 223 passed, 0 skipped (gồm Anvil integration dùng `contracts/out`)
- [ ] `npm test`, `npx tsc --noEmit`, `next build`
- [ ] Fresh clone: `docker compose up --build -d` → backend/frontend healthy, `/health` `chain_id: 43113`
- [ ] `gitleaks git --log-opts=--all` exit 0 và `gitleaks dir` không còn finding mới
- [ ] Link check toàn bộ `.md` tracked — 0 link hỏng
- [ ] README §3–§5 không nhắc file đã xóa (`git grep` tên file)

## 11. Ước lượng tác động

| Phương án | File xóa | Dung lượng | Rủi ro | Ghi chú |
|---|---|---|---|---|
| **Khuyến nghị (§4 + docs)** | 465 (+0–1 doc) | ~9.4 MB | LOW | 963 → ~498 file tracked |
| + tool Anvil (§5) | +2 | ~20 KB | LOW | Mất demo CLI Anvil |
| + Shared/Ops (§6 phương án B) | +6 | ~40 KB | MEDIUM | Mất 7 test, code shared còn lại không có đường chạy |

## 12. Owner Approval Matrix

| ID | Hạng mục | Khuyến nghị | Owner (APPROVE / REJECT) |
|---|---|---|---|
| CL-01 | Trim `contracts/lib/` 465 file (§4) | **APPROVE** | |
| CL-02 | `docs/context/CURRENT_STATUS.md`: cập nhật (a) hoặc xóa (b) | (b) xóa — đã có README + test-evidence | |
| CL-03 | Cập nhật baseline `TECH_STACK.md`, `BUSINESS_REQUIREMENTS.md` | APPROVE (chỉ dòng baseline) | |
| CL-04 | `DECISION_LOG.md`: duyệt từng dòng `DEC-018..027` | Owner quyết từng dòng | |
| CL-05 | `.gitignore` thêm `!frontend/.env.local.example` | APPROVE | |
| CL-06 | Xóa `backend/scripts/demo_local.py` + `contracts/script/e2e_anvil.sh` | Giữ (REJECT) — trừ khi muốn tối giản | |
| CL-07 | Shared/Ops: giữ (A) hay xóa (B) | **A — giữ** | |
| CL-08 | `.devcontainer/` | Giữ | |
