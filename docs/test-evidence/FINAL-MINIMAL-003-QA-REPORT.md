# FINAL-MINIMAL-003 — QA Report (Minimal Local Docker + Avalanche Fuji)

- **Ngày:** 2026-11-20 (GMT+7)
- **Baseline:** `origin/main` @ `d76344d820ec37bccc948a34e48db94cb740868c` (PR #24) — `git fetch` xác minh lại.
- **Branch:** `chore/minimal-local-fuji` · **Commit 1:** `7183a68` — `chore: minimal local Docker + Avalanche Fuji repository` · **Commit 2:** `docs: add FINAL-MINIMAL-003 QA report` (chứa file này)
- **Verdict:** **`ACCEPT FOR MERGE`**

## 1. File đã xóa (đúng phạm vi duyệt — 7 file)

| File | Lý do | Ảnh hưởng |
|---|---|---|
| `compose.ops.yaml` | Ops Server/VPS — không thuộc Local Demo | Không file runtime nào tham chiếu; chỉ test §3 và docs |
| `compose.shared.yaml` | Shared Client cần `SHARED_API_URL` của Ops Server | Như trên |
| `.env.ops.example`, `.env.shared.example` | Template của 2 compose trên | Chỉ `.gitignore` (negation) tham chiếu — đã gỡ |
| `docker/Caddyfile.ops.example` | Reverse proxy VPS | Chỉ `compose.ops.yaml` comment, README, 1 test |
| `.devcontainer/devcontainer.json`, `.devcontainer/compose.codespaces.yml` | GitHub Codespaces | Chỉ RUN_LOCAL_BEGINNER §5 và `.dockerignore` — đã gỡ |

Tracked files: **499 → 492** (−7). Không đổi: `contracts/**` (gồm ABI, `deployments/43113.json`), `backend/*.py`, `backend/abi`, `frontend/**`, `ai-pipeline/**`, `compose.yaml`, `docker/{backend-entrypoint.sh,frontend-entrypoint.sh,init_secrets.py}`, `.env.example`, `backend/.env.example`, `.gitleaksignore`, `docs/{context,specs,test-evidence}` (ngoài báo cáo này), tool Anvil (`backend/scripts/demo_local.py`, `contracts/script/e2e_anvil.sh`) — `git diff` xác nhận.

## 2. File sửa

| File | Thay đổi |
|---|---|
| `backend/tests/test_phase3_t4_ops_docker.py` | Gỡ 4 test chỉ kiểm tra file đã xóa (§3); docstring cập nhật; bỏ `import yaml` không còn dùng. 3 test còn lại **giống hệt từng byte** (so AST source segment) |
| `README.md` | Bỏ mục "Nâng cao: Shared Client / Ops Server" và nhắc Codespaces |
| `RUN_LOCAL_BEGINNER.md` | Bỏ §5 Codespaces + các dòng Codespaces rải rác; đánh số lại mục 5–8, mục lục, anchor và "Mục N"; sửa dòng lỗi `AGENT_PRIVATE_KEY` (QR nonce không cần khóa Agent — đã kiểm chứng runtime) |
| `docs/local-demo/LOCAL-DEMO-SETUP-GUIDE.md` | Câu về compose: `compose.yaml` là cấu hình Docker duy nhất |
| `.gitignore` | Bỏ `!.env.shared.example`, `!.env.ops.example` |
| `.dockerignore` | Bỏ `.devcontainer/` |

## 3. Test bị loại bỏ (4) — số test pytest 223 → 219

| Test | Đối tượng duy nhất | Lý do loại |
|---|---|---|
| `test_compose_shared_and_ops_security_boundaries` | `compose.shared.yaml` + `compose.ops.yaml` | File đã xóa |
| `test_p4_c1_hosted_ui_uses_shared_auth_without_ops_secrets` | `compose.ops.yaml` | File đã xóa |
| `test_p4_c1_ops_ports_bind_loopback_by_default` | `compose.ops.yaml` | File đã xóa |
| `test_p4_c1_caddyfile_template_enforces_proxy_limits` | `docker/Caddyfile.ops.example` | File đã xóa |

Giữ nguyên (vẫn có đối tượng): `test_ops_auth_allowed_origins_not_coupled_to_cors_origins` (runtime `attest_service`), `test_init_secrets_split_mode_and_distinctness` (`docker/init_secrets.py` còn nguyên), `test_shell_entrypoints_have_lf_line_endings_and_proper_secret_guards` (2 entrypoint). Không giảm assertion nào khác.

## 4. QA thực tế (chạy mới sau cleanup)

| Hạng mục | Kết quả |
|---|---|
| `forge build` (xóa `out/`,`cache/`) / `forge test` | PASS / **81 passed, 0 failed, 0 skipped** (trước: 81) |
| `pytest -rs` | **219 passed, 0 failed, 0 skipped** (collected: trước 223 → sau 219; chênh 4 = §3) |
| `npm ci` (mới) / `npm test` | PASS / **101 pass, 0 fail, 0 skipped** (trước: 101) |
| `npx tsc --noEmit` / `npm run build` | PASS / PASS |
| Docker: `git archive` commit 1 (492 file, không `.env`) → `config -q`, `build --no-cache` backend + frontend trên Docker 29.8.1 (Windows Owner) | PASS (Docker Desktop được khởi động lại trước khi build); entrypoint trong image 1357 B / 2924 B |
| Runtime: `up -d` | backend **healthy**, frontend **healthy** |
| `/health` | `ok=true`, `chain_id=43113`, `escrow=0x19D0…eb00`, `insecure_for_chain=false`, `allow_local_hosts=false`, `enforce_evidence_hash=true`, `api_key_set=true`, `tesseract=true`, `agent_signer_configured=false` |
| UI `/`, `/sell`, `/trades`, `/admin`, `/trade/3`, `/listings/1`, `/auth`, `/profile/0xCa76…39Eb` | 200 ×8 |
| `/trade/3/nonce-qr.png` (đọc Fuji) · `/api/auth/session` | 200 · 200 |
| `POST /api/pin`, `/api/verify` chưa đăng nhập | 401 · 401 |
| Log container có giá trị secret | Không — 1 dòng khớp mẫu là `ops_jwt=False` (cờ boolean của init-secrets) |
| Ký ví / giao dịch qua UI | **NOT RUN** (agent không ký ví) |

## 5. Avalanche Fuji — đọc on-chain (RPC công khai, head 61,361,985)

`chainId=43113`; Escrow `0x19D053c84941411888f5b9e40c854365fdd4eb00` bytecode 9,466 B; CDU `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78` bytecode 2,869 B; `agent()=0x579e…7081`; `owner()=0xCa76…39Eb`; windows 600/600/90; `nextTradeId=5`; số dư Escrow 0 AVAX; Agent 0.47 AVAX. Khớp `contracts/deployments/43113.json` (không đổi). Không có địa chỉ lạ trong README/hướng dẫn/compose/env.

## 6. Security & repository

| Kiểm tra | Kết quả |
|---|---|
| `gitleaks git --log-opts=--all` | **no leaks** |
| `gitleaks dir` | 2 false positive đã biết (`test_listings_unit.py:761` Idempotency-Key, `43113.json:10` địa chỉ CDU) |
| `git diff --check origin/main HEAD` | PASS |
| Link nội bộ 13 file `.md` + 10 anchor trong RUN_LOCAL_BEGINNER | 0 hỏng |
| Tham chiếu còn lại tới file đã xóa | Chỉ trong báo cáo QA lịch sử (`docs/test-evidence/LOCAL-DEMO-QA-REPORT.md`, `FINAL-*.md`) — giữ nguyên vì là bằng chứng tại thời điểm đó; và docstring test ghi nhận việc gỡ |

## 7. Chức năng Local Demo còn hoạt động

`docker compose up --build -d` (không `.env`) → Frontend + Backend local · Core Wallet / Local Wallet + đăng nhập ký thông điệp · listing, purchase request, giữ chỗ 30 phút (SQLite WAL) · `createTrade`, `deposit` 30%, QR nonce, `submitEvidence`, `fileComplaint`, `resolveClean`, `cancelUnfunded`, `cancelOnEvidenceTimeout` trên Fuji · `/admin` `resolveDispute` (phạt 5%) cho ví Owner · Agent `attest` khi có `AGENT_PRIVATE_KEY` của ví Agent (`AGENT_AUTO=true` hoặc profile `worker`) · TradeIndexer + fallback direct-RPC · upload IPFS khi có `PINATA_JWT` · Mode B tự deploy (`Deploy.s.sol`).

## 8. Known limitations

1. Mode A: người clone không giữ khóa Agent/Owner của hợp đồng nhóm ⇒ không tự `attest`/`resolveDispute`.
2. `ResolvedClean` và `ResolvedDispute` phạt 5% chưa có tx Fuji — chờ Owner quay video.
3. Gas Agent 0.47 AVAX (< 0.5).
4. Code runtime cho chế độ Shared/Ops vẫn còn (không gỡ vì đòi hỏi sửa runtime) — xem §9.

## 9. Đề xuất riêng (KHÔNG thực hiện — cần Owner duyệt, đều đòi sửa runtime/test)

| Đường dẫn | Nội dung còn lại | Ghi chú |
|---|---|---|
| `frontend/lib/{marketplace-bff,auth-session,marketplace}.ts`, `frontend/next.config.js` | Nhánh `BFF_AUTH_MODE=shared`, proxy `/_backend`, kiểm tra host Codespaces | Runtime frontend đã freeze |
| `docker/frontend-entrypoint.sh`, `docker/init_secrets.py` | Nhánh shared / `OPS_SPLIT_SECRETS` | Script runtime, có test |
| `backend/attest_service.py`, `backend/ops_auth.py`, `backend/pin_relay.py` | `ENABLE_SHARED_AUTH`, Ops JWT, Pinata relay | Runtime backend đã freeze |
| `backend/.env.example` (dòng 42–48) | Khối biến Shared Ops dạng comment | Template dev thủ công |
| `frontend/test/phase2-shared-bff.test.cjs`, `frontend/test/phase3-t4-shared-docker.test.cjs`, `backend/tests/test_phase2_shared_ops.py` | Test cho code runtime trên | Chỉ gỡ nếu code bị gỡ |
