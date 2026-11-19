# FINAL-CLEANUP-002 — QA Report (Approved Cleanup & Final Freeze)

- **Ngày:** 2026-11-20 (GMT+7)
- **Baseline trước:** `origin/main` @ `532686f3c3d9a2429e4a35cce3c6d1f811755caa` (PR #23) — `git fetch` xác minh lại trước khi thực hiện, không đổi.
- **Branch:** `chore/final-local-demo-cleanup`
- **Commit 1:** `4d78173` — `chore(contracts): trim unused vendored library files`
- **Commit 2:** `docs: finalize local demo repository hygiene` (chứa báo cáo này; SHA xem output `git log`)
- **Phạm vi Owner duyệt:** CL-01, CL-02, CL-03, CL-05 thực hiện · CL-04 DEFERRED · CL-06/07/08 KEEP. Không mở rộng danh sách xóa.
- **Verdict:** **`ACCEPT FOR MERGE`**

## 1. Thay đổi đã thực hiện

| ID | Thay đổi | File |
|---|---|---|
| CL-01 | Xóa 465 file thư viện vendored không tham gia build (commit 1) | Danh sách đầy đủ ở §8 |
| CL-02 | Xóa | `docs/context/CURRENT_STATUS.md` |
| CL-03 | Chỉ thay dòng baseline (`bdb1e13…` → `532686f…`), nội dung giữ nguyên | `docs/context/TECH_STACK.md`, `docs/context/BUSINESS_REQUIREMENTS.md` |
| CL-05 | Thêm `!frontend/.env.local.example` | `.gitignore` |
| — | Thêm báo cáo audit + báo cáo QA | `docs/test-evidence/FINAL-REPO-CLEANUP-AUDIT.md`, `docs/test-evidence/FINAL-CLEANUP-002-QA-REPORT.md` |
| CL-04 | **Không đổi** | `docs/context/DECISION_LOG.md` |
| CL-06/07/08 | **Không đổi** | `backend/scripts/demo_local.py`, `contracts/script/e2e_anvil.sh`, `compose.shared.yaml`, `compose.ops.yaml`, `.env.*.example`, `docker/Caddyfile.ops.example`, `backend/tests/test_phase3_t4_ops_docker.py`, `.devcontainer/**` |

## 2. Số lượng file tracked

| | Trước (`532686f`) | Sau commit 1 | Sau commit 2 |
|---|---|---|---|
| Tổng | 963 | 498 | **499** (−465 lib, −1 `CURRENT_STATUS.md`, +2 báo cáo) |
| `contracts/lib/` | 770 | 305 | 305 |

Giữ lại trong `contracts/lib/` (305): `forge-std/src/**` (26), `forge-std/{LICENSE-APACHE,LICENSE-MIT,package.json}`, `openzeppelin-contracts/contracts/**` (274), `openzeppelin-contracts/{LICENSE,package.json}` (OZ `5.1.0`, forge-std `1.9.4`). Các LICENSE/`package.json` bị xóa đều nằm trong thư mục con đã duyệt xóa (`openzeppelin-contracts/lib/**`, `openzeppelin-contracts/scripts/**`).

## 3. Full regression — chạy mới trên bản sau cleanup (không dùng kết quả cũ)

| Suite | Môi trường | Kết quả |
|---|---|---|
| `forge build` (xóa `out/`, `cache/` trước) | Linux VM, Foundry 1.5.1, solc 0.8.24 | **PASS** — 37 sources |
| `forge test` | như trên | **81 passed, 0 failed, 0 skipped** (7 suites) |
| `pytest -rs` (ai-pipeline + backend, gồm Anvil integration) | Python 3.10.12 + anvil | **223 passed, 0 failed, 0 skipped** (223 collected; chạy 2 nhóm 128 + 95 do giới hạn 180 s/lệnh) |
| `npm ci` (mới, từ `git archive`) | Node 22.23.5 | PASS — 558 packages |
| `npm test` | | **101 pass, 0 fail, 0 skipped** |
| `npx tsc --noEmit` | | **PASS** |
| `npm run build` | | **PASS** — compiled, 10 static pages |

## 4. Docker Local Demo — fresh clone simulation trên Docker Windows của Owner (29.8.1 / Compose v5.5.1)

Nguồn build: `git archive HEAD` (commit 1, 498 file tracked, không `.env`) → thư mục tạm, project `unihack-cleanupqa`.

| Bước | Kết quả |
|---|---|
| `docker compose config -q` | **PASS** |
| `build --no-cache backend` / `frontend` | **PASS** / **PASS**; entrypoint trong image 1357 B / 2924 B (đúng với Git) |
| `up -d` → `ps` | **PASS** — backend healthy, frontend healthy |
| `/health` | **PASS** — `ok=true`, `chain_id=43113`, `escrow=0x19D0…eb00`, `insecure_for_chain=false`, `allow_local_hosts=false`, `enforce_evidence_hash=true`, `api_key_set=true`, `tesseract=true`, `agent_signer_configured=false` |
| UI `/`, `/sell`, `/trades`, `/admin`, `/trade/3`, `/listings/1`, `/auth`, `/profile/0xCa76…39Eb` | **PASS** — 200 (`/profile` không tham số trả 404 đúng thiết kế: route là `/profile/[address]`, frontend không đổi) |
| `GET :8000/trade/3/nonce-qr.png` (đọc Fuji) | **PASS** — 200 |
| `POST /api/pin`, `/api/verify` chưa đăng nhập | **PASS** — 401 |
| Log backend chứa chuỗi dạng secret (`PRIVATE`/`JWT`/`SECRET`/hex 64) | **PASS** — 0 dòng |
| Kết nối Core Wallet + ký giao dịch | **NOT RUN** — agent không ký ví người dùng |

Stack QA đã `down` sau kiểm thử (không dùng `-v` trên volume của Owner; project QA tách biệt).

## 5. Avalanche Fuji (`43113`) — đọc on-chain sau cleanup

RPC công khai `api.avax-test.network`, head **61,345,336**: `chainId=43113`, Escrow `0x19D053c84941411888f5b9e40c854365fdd4eb00` có bytecode (9,466 B), `agent()=0x579e…7081`, `owner()=0xCa76…39Eb`, `nextTradeId=5` — khớp `contracts/deployments/43113.json` (file không đổi). Số dư Agent `0.47 AVAX`.

## 6. Security & repository

| Kiểm tra | Kết quả |
|---|---|
| `gitleaks git --log-opts=--all --redact` (v8.21.2) | **PASS** — no leaks |
| `gitleaks dir` working tree | 2 finding, đều false positive đã biết: `backend/tests/test_listings_unit.py:761` (Idempotency-Key test), `contracts/deployments/43113.json:10` (địa chỉ contract CDU công khai). Finding OZ test vector trước cleanup **đã biến mất**. `.gitleaksignore` ngoài phạm vi duyệt nên không sửa |
| `git diff --check` (commit 1 & thay đổi commit 2) | **PASS** |
| Không đổi so với baseline: `contracts/{src,test,script,foundry.toml,deployments}`, `backend/`, `frontend/`, `ai-pipeline/`, `docker/`, 3 compose, env examples, `README.md`, `RUN_LOCAL_BEGINNER.md`, `docs/{specs,local-demo}`, `docs/test-evidence` (ngoài 2 báo cáo mới), `DECISION_LOG.md`, `.devcontainer/`, `contracts/lib/forge-std/src`, `contracts/lib/openzeppelin-contracts/contracts` | **PASS** — `git diff --stat` rỗng |
| Ảnh bằng chứng Fuji `docs/test-evidence/fuji-trades/**` | **PASS** — 12/12 còn nguyên |
| Link nội bộ trong 12 file `.md` | **PASS** — 0 link hỏng; 0 tham chiếu tới `CURRENT_STATUS.md` hay thư mục lib đã xóa |
| File rác (`.DS_Store`, `*.bak`, `*.log`, `__pycache__`, `node_modules`, …) | **PASS** — 0 |
| `.env` thật | `.env`, `.env.local`, `frontend/.env.local`, `backend/.env` vẫn bị ignore; `frontend/.env.local.example` không còn bị ignore |

## 7. Known limitations

1. Thư viện vendored đã trim: nâng cấp OpenZeppelin/forge-std sau này cần tải lại bản gốc (tag OZ `v5.1.0`, forge-std `v1.9.4`).
2. Tương tác Core Wallet và giao dịch mới trên Fuji qua UI: **NOT RUN** trong lượt này. `ResolvedClean` và `ResolvedDispute` phạt 5% vẫn chờ Owner thực hiện khi quay video (xem `AVALANCHE-FUJI-DEMO-EVIDENCE.md` §4).
3. Gas ví Agent `0.47 AVAX` (< ngưỡng Release Gate 0.5).
4. `DECISION_LOG.md` giữ nguyên theo CL-04 (7 dòng `PROPOSED`, chưa có `DEC-023..027`).
5. `TECH_STACK.md` / `BUSINESS_REQUIREMENTS.md`: chỉ cập nhật dòng baseline, nội dung không được kiểm toán lại.

## 8. Danh sách chính xác 465 file đã xóa (commit `4d78173`)

<details>
<summary>Mở danh sách</summary>

```text
contracts/lib/forge-std/.gitattributes
contracts/lib/forge-std/.github/workflows/ci.yml
contracts/lib/forge-std/.github/workflows/sync.yml
contracts/lib/forge-std/.gitignore
contracts/lib/forge-std/CONTRIBUTING.md
contracts/lib/forge-std/README.md
contracts/lib/forge-std/foundry.toml
contracts/lib/forge-std/scripts/vm.py
contracts/lib/forge-std/test/StdAssertions.t.sol
contracts/lib/forge-std/test/StdChains.t.sol
contracts/lib/forge-std/test/StdCheats.t.sol
contracts/lib/forge-std/test/StdError.t.sol
contracts/lib/forge-std/test/StdJson.t.sol
contracts/lib/forge-std/test/StdMath.t.sol
contracts/lib/forge-std/test/StdStorage.t.sol
contracts/lib/forge-std/test/StdStyle.t.sol
contracts/lib/forge-std/test/StdToml.t.sol
contracts/lib/forge-std/test/StdUtils.t.sol
contracts/lib/forge-std/test/Vm.t.sol
contracts/lib/forge-std/test/compilation/CompilationScript.sol
contracts/lib/forge-std/test/compilation/CompilationScriptBase.sol
contracts/lib/forge-std/test/compilation/CompilationTest.sol
contracts/lib/forge-std/test/compilation/CompilationTestBase.sol
contracts/lib/forge-std/test/fixtures/broadcast.log.json
contracts/lib/forge-std/test/fixtures/test.json
contracts/lib/forge-std/test/fixtures/test.toml
contracts/lib/forge-std/test/mocks/MockERC20.t.sol
contracts/lib/forge-std/test/mocks/MockERC721.t.sol
contracts/lib/openzeppelin-contracts/.changeset/config.json
contracts/lib/openzeppelin-contracts/.codecov.yml
contracts/lib/openzeppelin-contracts/.editorconfig
contracts/lib/openzeppelin-contracts/.eslintrc
contracts/lib/openzeppelin-contracts/.githooks/pre-push
contracts/lib/openzeppelin-contracts/.github/ISSUE_TEMPLATE/bug_report.md
contracts/lib/openzeppelin-contracts/.github/ISSUE_TEMPLATE/config.yml
contracts/lib/openzeppelin-contracts/.github/ISSUE_TEMPLATE/feature_request.md
contracts/lib/openzeppelin-contracts/.github/PULL_REQUEST_TEMPLATE.md
contracts/lib/openzeppelin-contracts/.github/actions/gas-compare/action.yml
contracts/lib/openzeppelin-contracts/.github/actions/setup/action.yml
contracts/lib/openzeppelin-contracts/.github/actions/storage-layout/action.yml
contracts/lib/openzeppelin-contracts/.github/workflows/actionlint.yml
contracts/lib/openzeppelin-contracts/.github/workflows/changeset.yml
contracts/lib/openzeppelin-contracts/.github/workflows/checks.yml
contracts/lib/openzeppelin-contracts/.github/workflows/docs.yml
contracts/lib/openzeppelin-contracts/.github/workflows/formal-verification.yml
contracts/lib/openzeppelin-contracts/.github/workflows/release-cycle.yml
contracts/lib/openzeppelin-contracts/.github/workflows/upgradeable.yml
contracts/lib/openzeppelin-contracts/.gitignore
contracts/lib/openzeppelin-contracts/.gitmodules
contracts/lib/openzeppelin-contracts/.mocharc.js
contracts/lib/openzeppelin-contracts/.prettierrc
contracts/lib/openzeppelin-contracts/.solcover.js
contracts/lib/openzeppelin-contracts/CHANGELOG.md
contracts/lib/openzeppelin-contracts/CODE_OF_CONDUCT.md
contracts/lib/openzeppelin-contracts/CONTRIBUTING.md
contracts/lib/openzeppelin-contracts/FUNDING.json
contracts/lib/openzeppelin-contracts/GUIDELINES.md
contracts/lib/openzeppelin-contracts/README.md
contracts/lib/openzeppelin-contracts/RELEASING.md
contracts/lib/openzeppelin-contracts/SECURITY.md
contracts/lib/openzeppelin-contracts/audits/2017-03.md
contracts/lib/openzeppelin-contracts/audits/2018-10.pdf
contracts/lib/openzeppelin-contracts/audits/2022-10-Checkpoints.pdf
contracts/lib/openzeppelin-contracts/audits/2022-10-ERC4626.pdf
contracts/lib/openzeppelin-contracts/audits/2023-05-v4.9.pdf
contracts/lib/openzeppelin-contracts/audits/2023-10-v5.0.pdf
contracts/lib/openzeppelin-contracts/audits/README.md
contracts/lib/openzeppelin-contracts/certora/.gitignore
contracts/lib/openzeppelin-contracts/certora/Makefile
contracts/lib/openzeppelin-contracts/certora/README.md
contracts/lib/openzeppelin-contracts/certora/diff/access_manager_AccessManager.sol.patch
contracts/lib/openzeppelin-contracts/certora/harnesses/AccessControlDefaultAdminRulesHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/AccessControlHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/AccessManagedHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/AccessManagerHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/DoubleEndedQueueHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/ERC20FlashMintHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/ERC20PermitHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/ERC20WrapperHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/ERC3156FlashBorrowerHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/ERC721Harness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/ERC721ReceiverHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/EnumerableMapHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/EnumerableSetHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/InitializableHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/NoncesHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/Ownable2StepHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/OwnableHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/PausableHarness.sol
contracts/lib/openzeppelin-contracts/certora/harnesses/TimelockControllerHarness.sol
contracts/lib/openzeppelin-contracts/certora/reports/2021-10.pdf
contracts/lib/openzeppelin-contracts/certora/reports/2022-03.pdf
contracts/lib/openzeppelin-contracts/certora/reports/2022-05.pdf
contracts/lib/openzeppelin-contracts/certora/run.js
contracts/lib/openzeppelin-contracts/certora/specs.json
contracts/lib/openzeppelin-contracts/certora/specs/AccessControl.spec
contracts/lib/openzeppelin-contracts/certora/specs/AccessControlDefaultAdminRules.spec
contracts/lib/openzeppelin-contracts/certora/specs/AccessManaged.spec
contracts/lib/openzeppelin-contracts/certora/specs/AccessManager.spec
contracts/lib/openzeppelin-contracts/certora/specs/DoubleEndedQueue.spec
contracts/lib/openzeppelin-contracts/certora/specs/ERC20.spec
contracts/lib/openzeppelin-contracts/certora/specs/ERC20FlashMint.spec
contracts/lib/openzeppelin-contracts/certora/specs/ERC20Wrapper.spec
contracts/lib/openzeppelin-contracts/certora/specs/ERC721.spec
contracts/lib/openzeppelin-contracts/certora/specs/EnumerableMap.spec
contracts/lib/openzeppelin-contracts/certora/specs/EnumerableSet.spec
contracts/lib/openzeppelin-contracts/certora/specs/Initializable.spec
contracts/lib/openzeppelin-contracts/certora/specs/Nonces.spec
contracts/lib/openzeppelin-contracts/certora/specs/Ownable.spec
contracts/lib/openzeppelin-contracts/certora/specs/Ownable2Step.spec
contracts/lib/openzeppelin-contracts/certora/specs/Pausable.spec
contracts/lib/openzeppelin-contracts/certora/specs/TimelockController.spec
contracts/lib/openzeppelin-contracts/certora/specs/helpers/helpers.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IAccessControl.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IAccessControlDefaultAdminRules.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IAccessManaged.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IAccessManager.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IERC20.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IERC2612.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IERC3156FlashBorrower.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IERC3156FlashLender.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IERC5313.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IERC721.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IERC721Receiver.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IOwnable.spec
contracts/lib/openzeppelin-contracts/certora/specs/methods/IOwnable2Step.spec
contracts/lib/openzeppelin-contracts/docs/README.md
contracts/lib/openzeppelin-contracts/docs/antora.yml
contracts/lib/openzeppelin-contracts/docs/config.js
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/access-control-multiple.svg
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/access-manager-functions.svg
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/access-manager.svg
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/erc4626-attack-3a.png
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/erc4626-attack-3b.png
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/erc4626-attack-6.png
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/erc4626-attack.png
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/erc4626-deposit.png
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/erc4626-mint.png
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/erc4626-rate-linear.png
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/erc4626-rate-loglog.png
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/erc4626-rate-loglogext.png
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/tally-exec.png
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/images/tally-vote.png
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/nav.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/access-control.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/backwards-compatibility.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/crowdsales.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/drafts.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/erc1155.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/erc20-supply.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/erc20.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/erc4626.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/erc721.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/extending-contracts.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/faq.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/governance.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/index.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/tokens.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/upgradeable.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/utilities.adoc
contracts/lib/openzeppelin-contracts/docs/modules/ROOT/pages/wizard.adoc
contracts/lib/openzeppelin-contracts/docs/templates/contract.hbs
contracts/lib/openzeppelin-contracts/docs/templates/helpers.js
contracts/lib/openzeppelin-contracts/docs/templates/page.hbs
contracts/lib/openzeppelin-contracts/docs/templates/properties.js
contracts/lib/openzeppelin-contracts/foundry.toml
contracts/lib/openzeppelin-contracts/fv-requirements.txt
contracts/lib/openzeppelin-contracts/hardhat.config.js
contracts/lib/openzeppelin-contracts/hardhat/async-test-sanity.js
contracts/lib/openzeppelin-contracts/hardhat/env-artifacts.js
contracts/lib/openzeppelin-contracts/hardhat/ignore-unreachable-warnings.js
contracts/lib/openzeppelin-contracts/hardhat/remappings.js
contracts/lib/openzeppelin-contracts/hardhat/skip-foundry-tests.js
contracts/lib/openzeppelin-contracts/hardhat/task-test-get-files.js
contracts/lib/openzeppelin-contracts/lib/erc4626-tests/ERC4626.prop.sol
contracts/lib/openzeppelin-contracts/lib/erc4626-tests/ERC4626.test.sol
contracts/lib/openzeppelin-contracts/lib/erc4626-tests/LICENSE
contracts/lib/openzeppelin-contracts/lib/erc4626-tests/README.md
contracts/lib/openzeppelin-contracts/lib/forge-std/.gitattributes
contracts/lib/openzeppelin-contracts/lib/forge-std/.github/workflows/ci.yml
contracts/lib/openzeppelin-contracts/lib/forge-std/.github/workflows/sync.yml
contracts/lib/openzeppelin-contracts/lib/forge-std/.gitignore
contracts/lib/openzeppelin-contracts/lib/forge-std/.gitmodules
contracts/lib/openzeppelin-contracts/lib/forge-std/LICENSE-APACHE
contracts/lib/openzeppelin-contracts/lib/forge-std/LICENSE-MIT
contracts/lib/openzeppelin-contracts/lib/forge-std/README.md
contracts/lib/openzeppelin-contracts/lib/forge-std/foundry.toml
contracts/lib/openzeppelin-contracts/lib/forge-std/lib/ds-test/.github/workflows/build.yml
contracts/lib/openzeppelin-contracts/lib/forge-std/lib/ds-test/.gitignore
contracts/lib/openzeppelin-contracts/lib/forge-std/lib/ds-test/LICENSE
contracts/lib/openzeppelin-contracts/lib/forge-std/lib/ds-test/Makefile
contracts/lib/openzeppelin-contracts/lib/forge-std/lib/ds-test/default.nix
contracts/lib/openzeppelin-contracts/lib/forge-std/lib/ds-test/demo/demo.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/lib/ds-test/package.json
contracts/lib/openzeppelin-contracts/lib/forge-std/lib/ds-test/src/test.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/lib/ds-test/src/test.t.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/package.json
contracts/lib/openzeppelin-contracts/lib/forge-std/scripts/vm.py
contracts/lib/openzeppelin-contracts/lib/forge-std/src/Base.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/Script.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/StdAssertions.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/StdChains.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/StdCheats.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/StdError.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/StdInvariant.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/StdJson.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/StdMath.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/StdStorage.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/StdStyle.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/StdUtils.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/Test.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/Vm.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/console.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/console2.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/interfaces/IERC1155.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/interfaces/IERC165.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/interfaces/IERC20.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/interfaces/IERC4626.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/interfaces/IERC721.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/interfaces/IMulticall3.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/mocks/MockERC20.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/mocks/MockERC721.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/src/safeconsole.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/StdAssertions.t.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/StdChains.t.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/StdCheats.t.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/StdError.t.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/StdMath.t.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/StdStorage.t.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/StdStyle.t.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/StdUtils.t.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/Vm.t.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/compilation/CompilationScript.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/compilation/CompilationScriptBase.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/compilation/CompilationTest.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/compilation/CompilationTestBase.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/fixtures/broadcast.log.json
contracts/lib/openzeppelin-contracts/lib/forge-std/test/mocks/MockERC20.t.sol
contracts/lib/openzeppelin-contracts/lib/forge-std/test/mocks/MockERC721.t.sol
contracts/lib/openzeppelin-contracts/lib/halmos-cheatcodes/LICENSE
contracts/lib/openzeppelin-contracts/lib/halmos-cheatcodes/README.md
contracts/lib/openzeppelin-contracts/lib/halmos-cheatcodes/src/SVM.sol
contracts/lib/openzeppelin-contracts/lib/halmos-cheatcodes/src/SymTest.sol
contracts/lib/openzeppelin-contracts/logo.svg
contracts/lib/openzeppelin-contracts/netlify.toml
contracts/lib/openzeppelin-contracts/package-lock.json
contracts/lib/openzeppelin-contracts/remappings.txt
contracts/lib/openzeppelin-contracts/renovate.json
contracts/lib/openzeppelin-contracts/scripts/checks/compare-layout.js
contracts/lib/openzeppelin-contracts/scripts/checks/compareGasReports.js
contracts/lib/openzeppelin-contracts/scripts/checks/coverage.sh
contracts/lib/openzeppelin-contracts/scripts/checks/extract-layout.js
contracts/lib/openzeppelin-contracts/scripts/checks/generation.sh
contracts/lib/openzeppelin-contracts/scripts/checks/inheritance-ordering.js
contracts/lib/openzeppelin-contracts/scripts/gen-nav.js
contracts/lib/openzeppelin-contracts/scripts/generate/format-lines.js
contracts/lib/openzeppelin-contracts/scripts/generate/helpers/sanitize.js
contracts/lib/openzeppelin-contracts/scripts/generate/run.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/Arrays.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/Arrays.opts.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/Checkpoints.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/Checkpoints.opts.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/Checkpoints.t.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/EnumerableMap.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/EnumerableMap.opts.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/EnumerableSet.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/EnumerableSet.opts.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/MerkleProof.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/MerkleProof.opts.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/Packing.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/Packing.opts.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/Packing.t.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/SafeCast.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/Slot.opts.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/SlotDerivation.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/SlotDerivation.t.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/StorageSlot.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/StorageSlotMock.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/TransientSlot.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/TransientSlotMock.js
contracts/lib/openzeppelin-contracts/scripts/generate/templates/conversion.js
contracts/lib/openzeppelin-contracts/scripts/git-user-config.sh
contracts/lib/openzeppelin-contracts/scripts/helpers.js
contracts/lib/openzeppelin-contracts/scripts/prepack.sh
contracts/lib/openzeppelin-contracts/scripts/prepare-docs.sh
contracts/lib/openzeppelin-contracts/scripts/prepare.sh
contracts/lib/openzeppelin-contracts/scripts/release/format-changelog.js
contracts/lib/openzeppelin-contracts/scripts/release/synchronize-versions.js
contracts/lib/openzeppelin-contracts/scripts/release/update-comment.js
contracts/lib/openzeppelin-contracts/scripts/release/version.sh
contracts/lib/openzeppelin-contracts/scripts/release/workflow/exit-prerelease.sh
contracts/lib/openzeppelin-contracts/scripts/release/workflow/github-release.js
contracts/lib/openzeppelin-contracts/scripts/release/workflow/integrity-check.sh
contracts/lib/openzeppelin-contracts/scripts/release/workflow/pack.sh
contracts/lib/openzeppelin-contracts/scripts/release/workflow/publish.sh
contracts/lib/openzeppelin-contracts/scripts/release/workflow/rerun.js
contracts/lib/openzeppelin-contracts/scripts/release/workflow/set-changesets-pr-title.js
contracts/lib/openzeppelin-contracts/scripts/release/workflow/start.sh
contracts/lib/openzeppelin-contracts/scripts/release/workflow/state.js
contracts/lib/openzeppelin-contracts/scripts/remove-ignored-artifacts.js
contracts/lib/openzeppelin-contracts/scripts/solhint-custom/index.js
contracts/lib/openzeppelin-contracts/scripts/solhint-custom/package.json
contracts/lib/openzeppelin-contracts/scripts/update-docs-branch.js
contracts/lib/openzeppelin-contracts/scripts/upgradeable/README.md
contracts/lib/openzeppelin-contracts/scripts/upgradeable/patch-apply.sh
contracts/lib/openzeppelin-contracts/scripts/upgradeable/patch-save.sh
contracts/lib/openzeppelin-contracts/scripts/upgradeable/transpile-onto.sh
contracts/lib/openzeppelin-contracts/scripts/upgradeable/transpile.sh
contracts/lib/openzeppelin-contracts/scripts/upgradeable/upgradeable.patch
contracts/lib/openzeppelin-contracts/slither.config.json
contracts/lib/openzeppelin-contracts/solhint.config.js
contracts/lib/openzeppelin-contracts/test/TESTING.md
contracts/lib/openzeppelin-contracts/test/access/AccessControl.behavior.js
contracts/lib/openzeppelin-contracts/test/access/AccessControl.test.js
contracts/lib/openzeppelin-contracts/test/access/Ownable.test.js
contracts/lib/openzeppelin-contracts/test/access/Ownable2Step.test.js
contracts/lib/openzeppelin-contracts/test/access/extensions/AccessControlDefaultAdminRules.test.js
contracts/lib/openzeppelin-contracts/test/access/extensions/AccessControlEnumerable.test.js
contracts/lib/openzeppelin-contracts/test/access/manager/AccessManaged.test.js
contracts/lib/openzeppelin-contracts/test/access/manager/AccessManager.behavior.js
contracts/lib/openzeppelin-contracts/test/access/manager/AccessManager.predicate.js
contracts/lib/openzeppelin-contracts/test/access/manager/AccessManager.test.js
contracts/lib/openzeppelin-contracts/test/access/manager/AuthorityUtils.test.js
contracts/lib/openzeppelin-contracts/test/finance/VestingWallet.behavior.js
contracts/lib/openzeppelin-contracts/test/finance/VestingWallet.test.js
contracts/lib/openzeppelin-contracts/test/finance/VestingWalletCliff.test.js
contracts/lib/openzeppelin-contracts/test/governance/Governor.t.sol
contracts/lib/openzeppelin-contracts/test/governance/Governor.test.js
contracts/lib/openzeppelin-contracts/test/governance/TimelockController.test.js
contracts/lib/openzeppelin-contracts/test/governance/extensions/GovernorCountingFractional.test.js
contracts/lib/openzeppelin-contracts/test/governance/extensions/GovernorERC721.test.js
contracts/lib/openzeppelin-contracts/test/governance/extensions/GovernorPreventLateQuorum.test.js
contracts/lib/openzeppelin-contracts/test/governance/extensions/GovernorStorage.test.js
contracts/lib/openzeppelin-contracts/test/governance/extensions/GovernorTimelockAccess.test.js
contracts/lib/openzeppelin-contracts/test/governance/extensions/GovernorTimelockCompound.test.js
contracts/lib/openzeppelin-contracts/test/governance/extensions/GovernorTimelockControl.test.js
contracts/lib/openzeppelin-contracts/test/governance/extensions/GovernorVotesQuorumFraction.test.js
contracts/lib/openzeppelin-contracts/test/governance/extensions/GovernorWithParams.test.js
contracts/lib/openzeppelin-contracts/test/governance/utils/ERC6372.behavior.js
contracts/lib/openzeppelin-contracts/test/governance/utils/Votes.behavior.js
contracts/lib/openzeppelin-contracts/test/governance/utils/Votes.test.js
contracts/lib/openzeppelin-contracts/test/helpers/access-manager.js
contracts/lib/openzeppelin-contracts/test/helpers/account.js
contracts/lib/openzeppelin-contracts/test/helpers/constants.js
contracts/lib/openzeppelin-contracts/test/helpers/deploy.js
contracts/lib/openzeppelin-contracts/test/helpers/eip712-types.js
contracts/lib/openzeppelin-contracts/test/helpers/eip712.js
contracts/lib/openzeppelin-contracts/test/helpers/enums.js
contracts/lib/openzeppelin-contracts/test/helpers/governance.js
contracts/lib/openzeppelin-contracts/test/helpers/iterate.js
contracts/lib/openzeppelin-contracts/test/helpers/math.js
contracts/lib/openzeppelin-contracts/test/helpers/methods.js
contracts/lib/openzeppelin-contracts/test/helpers/random.js
contracts/lib/openzeppelin-contracts/test/helpers/storage.js
contracts/lib/openzeppelin-contracts/test/helpers/strings.js
contracts/lib/openzeppelin-contracts/test/helpers/time.js
contracts/lib/openzeppelin-contracts/test/helpers/txpool.js
contracts/lib/openzeppelin-contracts/test/metatx/ERC2771Context.test.js
contracts/lib/openzeppelin-contracts/test/metatx/ERC2771Forwarder.t.sol
contracts/lib/openzeppelin-contracts/test/metatx/ERC2771Forwarder.test.js
contracts/lib/openzeppelin-contracts/test/proxy/Clones.behaviour.js
contracts/lib/openzeppelin-contracts/test/proxy/Clones.t.sol
contracts/lib/openzeppelin-contracts/test/proxy/Clones.test.js
contracts/lib/openzeppelin-contracts/test/proxy/ERC1967/ERC1967Proxy.test.js
contracts/lib/openzeppelin-contracts/test/proxy/ERC1967/ERC1967Utils.test.js
contracts/lib/openzeppelin-contracts/test/proxy/Proxy.behaviour.js
contracts/lib/openzeppelin-contracts/test/proxy/beacon/BeaconProxy.test.js
contracts/lib/openzeppelin-contracts/test/proxy/beacon/UpgradeableBeacon.test.js
contracts/lib/openzeppelin-contracts/test/proxy/transparent/ProxyAdmin.test.js
contracts/lib/openzeppelin-contracts/test/proxy/transparent/TransparentUpgradeableProxy.behaviour.js
contracts/lib/openzeppelin-contracts/test/proxy/transparent/TransparentUpgradeableProxy.test.js
contracts/lib/openzeppelin-contracts/test/proxy/utils/Initializable.test.js
contracts/lib/openzeppelin-contracts/test/proxy/utils/UUPSUpgradeable.test.js
contracts/lib/openzeppelin-contracts/test/sanity.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC1155/ERC1155.behavior.js
contracts/lib/openzeppelin-contracts/test/token/ERC1155/ERC1155.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC1155/extensions/ERC1155Burnable.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC1155/extensions/ERC1155Pausable.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC1155/extensions/ERC1155Supply.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC1155/extensions/ERC1155URIStorage.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC1155/utils/ERC1155Holder.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC1155/utils/ERC1155Utils.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/ERC20.behavior.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/ERC20.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/extensions/ERC1363.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/extensions/ERC20Burnable.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/extensions/ERC20Capped.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/extensions/ERC20FlashMint.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/extensions/ERC20Pausable.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/extensions/ERC20Permit.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/extensions/ERC20Votes.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/extensions/ERC20Wrapper.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/extensions/ERC4626.t.sol
contracts/lib/openzeppelin-contracts/test/token/ERC20/extensions/ERC4626.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/extensions/draft-ERC20TemporaryApproval.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC20/utils/SafeERC20.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC721/ERC721.behavior.js
contracts/lib/openzeppelin-contracts/test/token/ERC721/ERC721.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC721/ERC721Enumerable.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC721/extensions/ERC721Burnable.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC721/extensions/ERC721Consecutive.t.sol
contracts/lib/openzeppelin-contracts/test/token/ERC721/extensions/ERC721Consecutive.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC721/extensions/ERC721Pausable.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC721/extensions/ERC721Royalty.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC721/extensions/ERC721URIStorage.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC721/extensions/ERC721Votes.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC721/extensions/ERC721Wrapper.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC721/utils/ERC721Holder.test.js
contracts/lib/openzeppelin-contracts/test/token/ERC721/utils/ERC721Utils.test.js
contracts/lib/openzeppelin-contracts/test/token/common/ERC2981.behavior.js
contracts/lib/openzeppelin-contracts/test/utils/Address.test.js
contracts/lib/openzeppelin-contracts/test/utils/Arrays.t.sol
contracts/lib/openzeppelin-contracts/test/utils/Arrays.test.js
contracts/lib/openzeppelin-contracts/test/utils/Base64.t.sol
contracts/lib/openzeppelin-contracts/test/utils/Base64.test.js
contracts/lib/openzeppelin-contracts/test/utils/Context.behavior.js
contracts/lib/openzeppelin-contracts/test/utils/Context.test.js
contracts/lib/openzeppelin-contracts/test/utils/Create2.t.sol
contracts/lib/openzeppelin-contracts/test/utils/Create2.test.js
contracts/lib/openzeppelin-contracts/test/utils/Multicall.test.js
contracts/lib/openzeppelin-contracts/test/utils/Nonces.test.js
contracts/lib/openzeppelin-contracts/test/utils/Packing.t.sol
contracts/lib/openzeppelin-contracts/test/utils/Packing.test.js
contracts/lib/openzeppelin-contracts/test/utils/Panic.test.js
contracts/lib/openzeppelin-contracts/test/utils/Pausable.test.js
contracts/lib/openzeppelin-contracts/test/utils/ReentrancyGuard.test.js
contracts/lib/openzeppelin-contracts/test/utils/ShortStrings.t.sol
contracts/lib/openzeppelin-contracts/test/utils/ShortStrings.test.js
contracts/lib/openzeppelin-contracts/test/utils/SlotDerivation.t.sol
contracts/lib/openzeppelin-contracts/test/utils/SlotDerivation.test.js
contracts/lib/openzeppelin-contracts/test/utils/StorageSlot.test.js
contracts/lib/openzeppelin-contracts/test/utils/Strings.test.js
contracts/lib/openzeppelin-contracts/test/utils/TransientSlot.test.js
contracts/lib/openzeppelin-contracts/test/utils/cryptography/ECDSA.test.js
contracts/lib/openzeppelin-contracts/test/utils/cryptography/EIP712.test.js
contracts/lib/openzeppelin-contracts/test/utils/cryptography/MerkleProof.test.js
contracts/lib/openzeppelin-contracts/test/utils/cryptography/MessageHashUtils.test.js
contracts/lib/openzeppelin-contracts/test/utils/cryptography/P256.t.sol
contracts/lib/openzeppelin-contracts/test/utils/cryptography/P256.test.js
contracts/lib/openzeppelin-contracts/test/utils/cryptography/RSA.helper.js
contracts/lib/openzeppelin-contracts/test/utils/cryptography/RSA.test.js
contracts/lib/openzeppelin-contracts/test/utils/cryptography/SigVer15_186-3.rsp
contracts/lib/openzeppelin-contracts/test/utils/cryptography/SignatureChecker.test.js
contracts/lib/openzeppelin-contracts/test/utils/cryptography/ecdsa_secp256r1_sha256_p1363_test.json
contracts/lib/openzeppelin-contracts/test/utils/introspection/ERC165.test.js
contracts/lib/openzeppelin-contracts/test/utils/introspection/ERC165Checker.test.js
contracts/lib/openzeppelin-contracts/test/utils/introspection/SupportsInterface.behavior.js
contracts/lib/openzeppelin-contracts/test/utils/math/Math.t.sol
contracts/lib/openzeppelin-contracts/test/utils/math/Math.test.js
contracts/lib/openzeppelin-contracts/test/utils/math/SafeCast.test.js
contracts/lib/openzeppelin-contracts/test/utils/math/SignedMath.t.sol
contracts/lib/openzeppelin-contracts/test/utils/math/SignedMath.test.js
contracts/lib/openzeppelin-contracts/test/utils/structs/BitMap.test.js
contracts/lib/openzeppelin-contracts/test/utils/structs/Checkpoints.t.sol
contracts/lib/openzeppelin-contracts/test/utils/structs/Checkpoints.test.js
contracts/lib/openzeppelin-contracts/test/utils/structs/CircularBuffer.test.js
contracts/lib/openzeppelin-contracts/test/utils/structs/DoubleEndedQueue.test.js
contracts/lib/openzeppelin-contracts/test/utils/structs/EnumerableMap.behavior.js
contracts/lib/openzeppelin-contracts/test/utils/structs/EnumerableMap.test.js
contracts/lib/openzeppelin-contracts/test/utils/structs/EnumerableSet.behavior.js
contracts/lib/openzeppelin-contracts/test/utils/structs/EnumerableSet.test.js
contracts/lib/openzeppelin-contracts/test/utils/structs/Heap.t.sol
contracts/lib/openzeppelin-contracts/test/utils/structs/Heap.test.js
contracts/lib/openzeppelin-contracts/test/utils/structs/MerkleTree.test.js
contracts/lib/openzeppelin-contracts/test/utils/types/Time.test.js
```

</details>
