# Phase 5 Pre-flight Checklist — Việc Project Owner phải làm trước khi dispatch ESC-050

**Người thực hiện:** Hứa Kiến Quốc (Project Owner) — KHÔNG giao cho agent  
**Ngày lập:** 2026-11-10 · **Deadline nộp bài:** 21/11/2026 23:59 (còn 11 ngày)  
**Trạng thái repo khi quét:** branch `main` @ `1874c08`

---

## ⚠️ Phát hiện quan trọng: toàn bộ Phase 3+4 CHƯA merge vào `main`

Đây là blocker lớn nhất, phải xử lý trước mọi thứ khác.

| Branch | Commit | Nội dung | Đã merge vào main? |
|---|---|---|---|
| `main` | `1874c08` | checkpoint: pre-phase-3 | — |
| `phase/3a-backend-hardening` | `b238a41` | SSRF + API key + rate limit | ❌ CHƯA |
| `phase/4a-frontend-scaffold` | `1a4dc3a` | Frontend scaffold (ESC-020) | ❌ CHƯA |
| `phase/4b-core-pages` | `851a707` | Core pages (ESC-030) | ❌ CHƯA |
| `phase/4c-frontend-integration` | `a1ad5bc` | Integration (ESC-040) | ❌ CHƯA |

**Tin tốt:** 4 branch này là một chuỗi tuyến tính — `phase/4c-frontend-integration` đã **chứa sẵn** cả 3A, 4A, 4B. Chỉ cần merge 1 branch duy nhất là có đủ stack.

**Đã verify:** `main` là ancestor của `4c` → merge sẽ là **fast-forward**, không conflict.

### Hệ quả nếu không merge trước khi deploy

- Trên `main` hiện tại, thư mục `frontend/` **rỗng hoàn toàn**.
- Agent ESC-050 sẽ tạo branch `phase/5-deploy-fuji` từ `main` → deploy xong ghi `deployments/43113.json` nhưng không có frontend để demo.
- Repo nộp cho BTC (link public) sẽ chỉ thấy scaffold, không thấy sản phẩm.

---

## ⚠️ Phát hiện 2: 32 file tài liệu đang KHÔNG được git track

Toàn bộ specs, context docs, task specs và QA reports chỉ nằm trên ổ đĩa local — chưa commit, chưa push. Nếu máy hỏng là mất sạch.

Các file untracked gồm:

- `docs/context/` — 9 files (DECISION_LOG, PROJECT_BRIEF, TECH_STACK, CURRENT_STATUS…)
- `docs/specs/` — 4 files (FRONTEND_SPEC, L1_MODULE_SPEC, VAI3_DYNAMIC_DEPOSIT_SPEC, SLIDE_AND_VIDEO_SCRIPT)
- `docs/agent-ops/tasks/` — 6 files (ESC-020 → ESC-070)
- `docs/agent-ops/reports/` — các QA report
- `docs/agent-ops/` — MASTER_DISPATCH, QA_REVIEW_PROMPT, TASK_TEMPLATE, RELEASE_GATE_PROMPT, TASK_DISPATCH_PROMPT
- `.agents/AGENTS.md`

**Code thì an toàn** — cả 4 phase branch đều đã push lên `origin`. Chỉ có docs là chưa.

---

## BƯỚC 1 — Dọn 3 file trùng (bắt buộc làm trước khi merge)

3 file report dưới đây vừa tồn tại dưới dạng **untracked local**, vừa đã nằm trên branch `4c`. Nội dung **giống hệt nhau** (đã verify bằng `diff`). Không xoá thì lệnh merge sẽ báo *"untracked working tree files would be overwritten"*.

```bash
cd D:\unihack-escrow-project

del docs\agent-ops\reports\ESC-020-report.md
del docs\agent-ops\reports\ESC-030-report.md
del docs\agent-ops\reports\ESC-040-report.md
```

> Yên tâm: 3 file này sẽ được merge trả lại nguyên vẹn ở bước 2.

---

## BƯỚC 2 — Merge toàn bộ Phase 3+4 vào `main`

```bash
git checkout main
git merge --ff-only phase/4c-frontend-integration
```

Dùng `--ff-only` có chủ đích: nếu vì lý do nào đó không fast-forward được, lệnh sẽ **dừng lại an toàn** thay vì tạo merge commit lộn xộn.

**Kiểm tra sau merge:**

```bash
git log -1 --oneline          # phải ra a1ad5bc
dir frontend\app              # phải thấy page.tsx, trade/, admin/, api/
```

---

## BƯỚC 3 — Commit toàn bộ tài liệu + dọn cấu trúc docs

Working tree đang có 53 thay đổi chưa commit. Phần lớn là bạn đã **tái cấu trúc** thư mục: xoá `Escrow_Marketplace_AI_Operating_Kit/` và chuyển nội dung ra `docs/` ở root. Git nhìn thấy đó là delete + add.

Sau khi merge bước 2, sẽ xuất hiện **trùng lặp** cần dọn: branch `4c` mang về `docs/FRONTEND_SPEC.md` (vị trí cũ), trong khi bản bạn đang dùng nằm ở `docs/specs/FRONTEND_SPEC.md`.

```bash
# Xoá 4 file spec ở vị trí cũ (bản mới đã có trong docs/specs/)
git rm docs/FRONTEND_SPEC.md docs/L1_MODULE_SPEC.md ^
       docs/SLIDE_AND_VIDEO_SCRIPT.md docs/VAI3_DYNAMIC_DEPOSIT_SPEC.md

# Stage tất cả: deletions + docs mới
git add -A

# Kiểm tra KỸ trước khi commit — tuyệt đối không được có .env
git status
git diff --cached --name-only | findstr /I ".env"
```

Lệnh `findstr` cuối phải **không in ra gì**. Nếu in ra bất cứ dòng nào → dừng lại, `git reset` và báo tôi.

```bash
git commit -m "docs: restructure operating kit into docs/, add specs, task specs and QA reports"
git push origin main
```

---

## BƯỚC 4 — Dọn worktree mồ côi

Antigravity để lại một worktree trỏ tới thư mục đã bị xoá:

```
C:/Users/OS/.gemini/antigravity/worktrees/unihack-escrow-project/add_ssrf_api_key_hardening  [prunable]
```

Worktree này đang **giữ branch `phase/4c-integration`**, khiến bạn không checkout được branch đó. Dọn:

```bash
git worktree prune
git worktree list          # chỉ còn 1 dòng
```

**Branch trùng tên có thể xoá** (mỗi cặp trỏ cùng một commit, chỉ là đặt tên khác nhau):

```bash
git branch -d phase/4a-scaffold phase/4b-pages phase/4c-integration add_ssrf_api_key_hardening
```

---

## BƯỚC 5 — Tạo 2 ví Fuji riêng biệt

Theo **DEC-009**, deployer và agent phải là **2 private key khác nhau**.

| Ví | Vai trò on-chain | Quyền |
|---|---|---|
| **Deployer** | `Escrow.owner()` | `resolveDispute()`, rút phí |
| **AI Agent** | `Escrow.agent()` | Chỉ `attest()` |

Lý do tách: agent key nằm trong `backend/.env` và được dùng tự động để ký `attest()`. Nếu lộ, attacker chỉ giả mạo được attestation — **không chạm được vào tiền** trong escrow.

**Cách tạo** — chọn 1 trong 2:

```bash
# Cách A: Foundry (chạy 2 lần, lưu kết quả riêng)
cast wallet new

# Cách B: MetaMask → Account menu → Add account → đặt tên "Deployer" và "AI Agent"
#         rồi export private key từng account
```

> Tự chạy trên máy bạn. Đừng paste private key vào chat, commit, hay screenshot. Tôi không đọc các file `.env`.

Thêm mạng Fuji vào MetaMask nếu chưa có:

| Field | Giá trị |
|---|---|
| Network Name | Avalanche Fuji C-Chain |
| RPC URL | `https://api.avax-test.network/ext/bc/C/rpc` |
| Chain ID | `43113` |
| Symbol | `AVAX` |
| Explorer | `https://testnet.snowtrace.io` |

---

## BƯỚC 6 — Xin AVAX từ faucet (làm sớm, có cooldown)

Faucet chính thức: <https://core.app/tools/testnet-faucet/>

**Hai ràng buộc cần biết trước:**

1. Faucet chỉ cho dùng miễn phí nếu ví có **mainnet AVAX balance > 0**. Ví trắng hoàn toàn thì phải lấy coupon qua Guild, hoặc xin trong Discord chính thức của Avalanche.
2. **Cooldown 1 request / 2 giờ.** Hai ví × vài lần request có thể mất nửa ngày.

**Lượng AVAX thực sự cần** — task spec ghi ≥2 AVAX/ví nhưng đó là con số rất dư:

| Ví | Mục đích tiêu gas | Thực tế cần |
|---|---|---|
| Deployer | Deploy 2 contracts + `setEscrow()` | ~0.1–0.2 AVAX |
| AI Agent | Mỗi lần `attest()` | ~0.01 AVAX/lần |

**0.5–1 AVAX mỗi ví là thừa đủ** cho deploy + demo. Đừng để cooldown faucet chặn tiến độ 11 ngày còn lại.

Faucet dự phòng nếu Core từ chối: QuickNode Avalanche faucet, hoặc Discord Avalanche (admin/mod cấp tay).

---

## BƯỚC 7 — Tạo 3 file `.env`

Hiện **chưa có file `.env` nào** trong repo. Cần tạo cả 3.

### 7.1 — `contracts/.env`

Foundry đọc `.env` từ thư mục chạy `forge`, nên file này phải nằm trong `contracts/`.

```
PRIVATE_KEY=<private key ví DEPLOYER>
AGENT_ADDRESS=<ĐỊA CHỈ PUBLIC 0x... của ví agent>
EVIDENCE_WINDOW_SECS=600
ATTEST_WINDOW_SECS=600
DISPUTE_WINDOW_SECS=90
```

> **Chỗ dễ sai nhất:** `AGENT_ADDRESS` là **địa chỉ công khai** `0x...` (40 hex chars), KHÔNG phải private key. Script gọi `vm.envAddress("AGENT_ADDRESS")` — bỏ nhầm private key vào sẽ fail parse address.

Ba biến `*_WINDOW_SECS` là window rút ngắn cho demo (10 phút / 10 phút / 90 giây). Nếu **không set**, `vm.envOr` fallback về mặc định 3 ngày / 1 ngày / 2 ngày → không demo kịp.

### 7.2 — `backend/.env`

```
RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
AGENT_PRIVATE_KEY=<private key ví AGENT>
ESCROW_ADDRESS=
```

`ESCROW_ADDRESS` **để trống** — backend tự đọc từ `contracts/deployments/43113.json` sau khi deploy xong. Agent ESC-050 sẽ điền nếu cần.

Nếu máy bạn có Tesseract ở đường dẫn không chuẩn, thêm:

```
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

### 7.3 — `frontend/.env.local`

Tạo trống trước, agent ESC-050 sẽ điền địa chỉ sau deploy. Các biến frontend cần:

```
NEXT_PUBLIC_CHAIN_ID=43113
NEXT_PUBLIC_ESCROW_ADDRESS=
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
PINATA_JWT=<JWT từ pinata.cloud — KHÔNG có prefix NEXT_PUBLIC_>
```

> `PINATA_JWT` **tuyệt đối không** được đặt tên `NEXT_PUBLIC_PINATA_JWT` — Next.js sẽ nhúng nó vào bundle client và lộ ra trình duyệt. Route `/api/pin` chạy server-side nên đọc được biến không có prefix.

Nếu chưa có tài khoản Pinata: route `/api/pin` có **mock fallback** sinh CID giả, vẫn chạy được flow nhưng ảnh không thật sự lên IPFS. Demo nên có JWT thật.

### Xác nhận bảo mật — tôi đã verify hộ

Chạy `git check-ignore` trên cả 4 đường dẫn, tất cả đều được `.gitignore` bắt đúng:

| Path | Trạng thái |
|---|---|
| `.env` | ✅ ignored |
| `contracts/.env` | ✅ ignored |
| `backend/.env` | ✅ ignored |
| `frontend/.env.local` | ✅ ignored |

Git hiện chỉ track `backend/.env.example` (template rỗng, không có giá trị thật). An toàn để tạo cả 3 file trên.

---

## BƯỚC 8 — Verify trước khi dispatch ESC-050

```bash
# 1. Số dư 2 ví (cả hai phải khác 0)
cast balance <deployer_address> --rpc-url fuji
cast balance <agent_address>    --rpc-url fuji

# 2. Foundry đọc được env chưa
cd contracts
forge script script/Deploy.s.sol --rpc-url fuji
#    ^ KHÔNG có --broadcast = chỉ simulate, không tốn gas, không lên chain

# 3. Regression: contract source không đổi
forge test
```

Alias `fuji` đã khai báo sẵn trong `foundry.toml` (`rpc_endpoints`), nên không cần gõ URL đầy đủ.

Bước 2 là **dry run quan trọng nhất** — nó bắt hết lỗi env (thiếu biến, sai format address) trước khi tiêu AVAX thật.

---

## Checklist tổng

```
[ ] B1. Xoá 3 file ESC-0x0-report.md untracked
[ ] B2. git merge --ff-only phase/4c-frontend-integration
[ ] B3. Commit + push toàn bộ docs (kiểm tra không lẫn .env)
[ ] B4. git worktree prune + xoá branch trùng tên
[ ] B5. Tạo ví Deployer + ví AI Agent (2 key khác nhau)
[ ] B6. Faucet đủ ~0.5-1 AVAX mỗi ví
[ ] B7. Tạo contracts/.env + backend/.env + frontend/.env.local
[ ] B8. cast balance OK + forge script dry-run OK + forge test pass
[ ] → Dispatch ESC-050 cho Antigravity
```

**Thứ tự bắt buộc:** B1 → B2 → B3 trước, vì agent ESC-050 sẽ branch từ `main`. Nếu `main` chưa có frontend thì deploy xong cũng không demo được.

B5 → B6 có thể làm **song song** với B1-B4 (faucet có cooldown, xin càng sớm càng tốt).

---

## Lưu ý vai trò

Theo quy ước project: **Project Owner merge, agent không merge.** Tất cả lệnh git ở B1-B4 bạn tự chạy. Tôi (PM/QA) không tự merge và không sửa application code — chỉ quét trạng thái và viết checklist này.

Sau khi xong B1-B8, báo tôi để tôi xuất Task Specification ESC-050 cho Antigravity.
