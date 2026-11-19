# Local Demo QA Report — Docker + Avalanche Fuji (`43113`)

- **Ngày:** 2026-11-20 (GMT+7) · **Base:** `origin/main` @ `0cdb845` (PR #22) · **Branch:** `feat/local-demo-fuji`
- **Phạm vi Owner duyệt:** Local Docker + Fuji, ngân sách 0, không VPS/domain. Không sửa smart contract, AI pipeline, business logic hay runtime code.
- **Vị trí file:** `docs/audit/` bị `.gitignore` của baseline loại trừ (dòng 44) nên báo cáo được commit tại `docs/test-evidence/`.

## 1. Fresh-clone audit (TASK A)

| Hạng mục | Kết quả |
|---|---|
| Chế độ chạy tối thiểu | `docker compose up --build -d` với `compose.yaml` — **không cần `.env`**; secrets BFF tự sinh trong volume `runtime_secrets`; mặc định trỏ Escrow Fuji `0x19D0…eb00` |
| Phụ thuộc không cần thiết | `compose.shared.yaml` (cần `SHARED_API_URL`), `compose.ops.yaml` (+ Caddy/VPS) — **không cần** cho Local Demo; README chuyển thành mục "Nâng cao (tuỳ chọn)" |
| Credentials tuỳ chọn | `PINATA_JWT` (upload IPFS; thiếu ⇒ `503` fail-closed), `AGENT_PRIVATE_KEY` (chỉ ví Agent của hợp đồng mới `attest` được) |
| Tài liệu sai đã sửa | `RUN_LOCAL_BEGINNER.md`: QR nonce **không** cần `AGENT_PRIVATE_KEY` (runtime trả `200`); `/health` trả `ok: true` (không phải `false`) khi thiếu khóa Agent |

## 2. Docker — chạy thật trên máy Windows của Owner (Docker 29.8.1, Compose v5.5.1), project `unihack-localqa`, không có `.env`

| Bước | Kết quả |
|---|---|
| `docker compose -f compose.yaml config -q` | **PASS** (exit 0) |
| `docker compose build` (backend + frontend, gồm `next build`) | **PASS** — lần đầu frontend lỗi `rpc error … EOF` (BuildKit/daemon) và entrypoint backend bị chép **0 byte** do build context đọc file worktree vừa được tạo từ VM; rebuild `--no-cache` ⇒ entrypoint 1357 byte, build OK. Kết luận: lỗi môi trường build, **không** phải lỗi repo (file trong git: 1357 byte, LF) |
| `up -d` → `ps` | **PASS** — `backend` healthy, `frontend` healthy |
| `GET :8000/health` | **PASS** — `ok:true`, `chain_id:43113`, `escrow:0x19D0…eb00`, `insecure_for_chain:false`, `allow_local_hosts:false`, `enforce_evidence_hash:true`, `api_key_set:true`, `tesseract:true`, `agent_signer_configured:false` |
| `GET :3000/`, `/sell`, `/trades`, `/admin`, `/trade/3`, `/listings/1` | **PASS** — HTTP 200 |
| `GET :8000/trade/3/nonce-qr.png` (đọc Fuji) | **PASS** — 200 PNG |
| `POST /api/pin`, `/api/verify` chưa đăng nhập | **PASS** — 401 (cổng xác thực hoạt động) |
| Trình duyệt mở `/trade/3` | **PASS** — chuyển hướng `/auth` "Kết nối ví" |
| Kết nối Core Wallet + ký đăng nhập + giao dịch qua UI | **NOT RUN** — agent không được ký ví người dùng |

## 3. Regression (Linux VM; Python 3.10.12, Node 22.23.5, Foundry 1.5.1, solc 0.8.24)

| Suite | Kết quả |
|---|---|
| `pytest -rs` (ai-pipeline + backend, gồm Anvil integration) | **223 passed, 0 failed, 0 skipped** (223 collected) |
| `forge test` | **81 passed, 0 failed, 0 skipped** (7 suites) |
| `npm test` (`node --test`) | **101 pass, 0 fail, 0 skipped** |
| `npx tsc --noEmit` | **PASS** |
| `next build` | **PASS** (trong Docker build ở §2) |
| `forge script Deploy.s.sol` (Mode B) trên Anvil, windows 600/600/90 | **PASS** — `agent()`/`owner()` đúng, ghi `deployments/31337.json` |
| `gitleaks git --log-opts=--all --redact` (v8.21.2) | **PASS** — no leaks (5 false positive đã triage trong `.gitleaksignore`: địa chỉ contract CDU ×3, Idempotency-Key test, khóa Anvil mặc định công khai) |
| `.env` / key thật trong git | **PASS** — không có file `.env`, `*.pem`, `*.key` được track; `.env`, `frontend/.env.local`, `backend/.env`, `contracts/broadcast/` đều ignored |

Ghi chú: `test_phase3_t3_trade_index.py` bị OOM trên máy 4 GB (mock dựng ~61M block hash) — đã sửa **chỉ trong test** (commit `test(trade-index): lazy block-hash mock…`), runtime không đổi.

## 4. Blockchain (TASK B) — xem `AVALANCHE-FUJI-DEMO-EVIDENCE.md`

| Bước | Kết quả |
|---|---|
| Chain/hợp đồng/agent/owner/windows on-chain khớp `43113.json` | **PASS** (đọc RPC Fuji thật) |
| `createTrade`, `deposit` 30%, `submitEvidence`, Agent `attest`, `fileComplaint`, Owner `resolveDispute` (không lỗi), `cancelUnfunded`, `cancelOnEvidenceTimeout` | **PASS** — tx Fuji lịch sử, kiểm chứng độc lập |
| `resolveClean`, `resolveDispute` phạt 5% | **NOT RUN** — cần Owner ký + Agent chạy (lúc quay video) |
| E2E mới qua UI với 2 Core Wallet | **NOT RUN** |

## 5. Known Limitations

1. Mode A: người clone không điều khiển Agent/Owner của hợp đồng nhóm ⇒ không tự `attest`/`resolveDispute`; trade kết thúc bằng `cancelOnEvidenceTimeout` nếu Agent nhóm không chạy.
2. Mode B (tự deploy Fuji) chỉ kiểm thử trên Anvil; chưa kiểm thử E2E trên Fuji. Script ghi đè `contracts/deployments/43113.json`.
3. Testnet only; Owner EOA là trọng tài duy nhất; windows 600/600/90s chỉ cho demo.
4. AI verify heuristic (pHash, ORB, QR/OCR; embedding mặc định HSV histogram).
5. Marketplace off-chain trên SQLite **cục bộ của từng máy** — Seller & Buyer phải dùng cùng một instance (2 browser profile trên cùng máy).
6. Phụ thuộc RPC công khai Fuji (có thể `429`), faucet có giới hạn.
7. `npm run lint` chưa cấu hình; `npm audit` còn advisory gián tiếp (README §6).
