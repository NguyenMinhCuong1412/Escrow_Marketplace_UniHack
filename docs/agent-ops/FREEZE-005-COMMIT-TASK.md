# Task Specification — FREEZE-005-COMMIT

> Template: `docs/agent-ops/TASK_TEMPLATE.md` · Nguồn finding: `docs/agent-ops/reports/UNIHACK-FINAL-PRELIM-AUDIT.md` **P0-02** (GitHub công khai không chứa sản phẩm hiện tại)
> Quy trình: **Cowork viết Spec → Owner duyệt → Antigravity triển khai → Cowork Re-QA độc lập → Owner ACCEPT/REJECT → (riêng) Owner "GO PUSH"**
> Mọi manifest SHA-256 sinh bằng `-LiteralPath` (bài học L2 của FREEZE-003).

## Metadata

- **Task ID:** `FREEZE-005-COMMIT`
- **Title:** Đưa toàn bộ thay đổi Marketplace đã kiểm duyệt vào branch `freeze/003-marketplace-mkt` với commit rõ ràng, sạch secret, kiểm chứng bằng clean clone
- **Priority:** **P0**
- **Status:** **READY** (Owner APPROVED WITH CONDITIONS 15/11/2026 15:08; điều kiện C1–C3 đã đưa vào spec; baseline §11 chụp lúc READY)
- **Deploy authorized:** No · **Push authorized:** **No** (cần lệnh "GO PUSH" riêng sau Re-QA) · **Merge authorized:** **No**
- **Risk tier:** P0 về quy trình (mất code / lộ secret khi public), P2 về logic (không đổi code)
- **Requested by:** Project Owner (15/11/2026 14:58) · Spec bởi Cowork
- **Assigned role:** Antigravity
- **Branch/worktree:** tạo `freeze/003-marketplace-mkt` **trên working tree chính** `D:\Escrow_Marketplace_Demo` bằng `git switch -c`. Đây là cách duy nhất mang theo working tree đang dirty mà không phải copy hay stash (lý do ở §5). Rule 90 yêu cầu worktree riêng cho task viết code; task này **không viết code**, chỉ đóng gói thay đổi đã có.
- **Related decision:** DEC-001, DEC-015 (chỉ Owner merge), OD-08 (cho phép gitleaks), DEC-019..021 (`PROPOSED`, các thay đổi MKT)
- **Phụ thuộc:** FREEZE-003-DEPS = `ACCEPTED WITH LIMITATIONS` ✅. **Chặn:** FREEZE-004-CLAIMS (D1 = S1).

---

## 1. Context

- `origin/main` = `main` = `bdb1e13` (13/11/2026). Repo public trên GitHub: `NguyenMinhCuong1412/Escrow_Marketplace_UniHack`.
- Toàn bộ MKT-001..005, MKT-ERROR-HANDLING-FIX, FREEZE-003 và tài liệu audit **chỉ nằm trong working tree** của máy Owner. Giám khảo chấm repo, nên hiện tại họ không thấy Marketplace, BFF hardening hay 5 bộ test mới.
- Rủi ro khi để lâu: mất code (ổ cứng, lỡ tay `git checkout`/`clean`), xung đột với FREEZE-004, không kịp hạn nộp **21/11/2026 23:59**.

### 1.1 Kiểm kê (Cowork, 15/11/2026 15:05 VN; `git status --porcelain=v1 -uall`)

**Baseline cuối (READY, §11): 99 mục = 46 modified + 53 untracked.** So với lần kiểm kê 15:05 (98 mục), mục thêm là `docs/agent-ops/FREEZE-005-COMMIT-TASK.md` (spec này), đã thuộc nhóm Documentation. Không có file nào chỉ khác CRLF. `frontend/package*.json` đã sạch sau FREEZE-003.

**Sẽ commit 97 mục** (10 backend + 63 frontend + 24 docs). **Không commit 2 mục** (EXCLUDE §1.5), để nguyên untracked.

| Nhóm | Modified (` M`) | Untracked (`??`) | Tổng |
|---|---|---|---|
| Backend (`backend/`) | 6 | 4 | 10 |
| Frontend (`frontend/`) | 28 | 35 | 63 |
| Docs (`README.md`, `docs/`) | 12 | 14 | 26 (24 ALLOW + 2 EXCLUDE) |
| Khác | 0 | 0 | 0 |
| **Tổng** | **46** | **53** | **99** |

> Danh sách đích chính xác (99 đường dẫn + SHA-256) nằm ở **§11**. Mọi khác biệt giữa trạng thái lúc thực thi và §11 ⇒ **G2 STOP**; Cowork kiểm kê lại trước khi tiếp tục.

### 1.2 Chi tiết từng file

**C1 — Backend (10)**
- ` M` `backend/.env.example`, `backend/Dockerfile`, `backend/attest_service.py`, `backend/auto_agent.py`, `backend/chain.py`, `backend/tests/test_service_unit.py`
- `??` `backend/db.py`, `backend/listings.py`, `backend/tests/test_listings_integration.py`, `backend/tests/test_listings_unit.py`

**C2 — Frontend (63)**
- ` M` (28): `frontend/.env.local.example`; `frontend/app/{admin/page.tsx, api/auth/session/route.ts, api/pin/route.ts, api/uris/route.ts, api/verify/route.ts, auth/local/page.tsx, auth/page.tsx, page.tsx, trade/[id]/page.tsx, trade/[id]/report/page.tsx, trade/new/page.tsx}`; `frontend/components/{AgentStatusCard, AuthGuard, ConnectWalletModal, EvidenceUploader, Navbar, PendingWithdrawalBanner, TradeList, WrongChainBanner}.tsx`; `frontend/hooks/{useAuthSession, useMyTrades, useReputation, useTrade}.ts`; `frontend/lib/{auth-session, errors, wallet-providers}.ts`; `frontend/test/wallet-providers.test.cjs`
- `??` (35):
  - `frontend/app/api/listings/{route.ts, mine/route.ts, [id]/route.ts, [id]/requests/route.ts}`
  - `frontend/app/api/requests/{route.ts, [id]/route.ts, [id]/bind-trade/route.ts, [id]/cancel/route.ts, [id]/decision/route.ts}`
  - `frontend/app/api/trades/[id]/{context,sync}/route.ts`
  - `frontend/app/{listings/[id]/page.tsx, sell/page.tsx, trades/page.tsx}`
  - `frontend/components/{CollectiblesCarousel, MultiImageUploader, ProductCard}.tsx`
  - `frontend/lib/{auth-routes, marketplace-bff, marketplace-ui, marketplace, pin-security, trade-id, wallet-toast}.ts`
  - `frontend/public/images/collectibles/*.webp` (6 file, đều < 500 KB)
  - `frontend/test/{marketplace-bff, marketplace-ui, mkt-error-handling, pin-hardening, security-remediation}.test.cjs`

**C3 — Docs (26 trong kiểm kê; commit 24, EXCLUDE 2 theo §1.5)**
- ` M` (12): `README.md`; `docs/agent-ops/{MASTER_DISPATCH.md, RISK_REGISTER.md}`; `docs/context/{BUSINESS_REQUIREMENTS, COMPETITION_CONTEXT, CURRENT_STATUS, DECISION_LOG, OPEN_QUESTIONS, PRODUCT_VISION, PROJECT_BRIEF, TECH_STACK, USER_PERSONAS}.md`
- `??` (13): `docs/agent-ops/{FREEZE-003-DEPS-TASK.md, FREEZE-004-CLAIMS-TASK.md}`; `docs/agent-ops/reports/{FREEZE-003-DEPS-report.md, FREEZE-003-DEPS-REQA.md, MKT-001-report.md, MKT-002-report.md, MKT-003-report.md, MKT-004-report.md, MKT-005-qa-report.md, MKT-005-remediation-report.md, MKT-ERROR-HANDLING-FIX.md, MKT-FINAL-QA-ANTIGRAVITY.md, UNIHACK-FINAL-PRELIM-AUDIT.md}` (+ `FREEZE-005-COMMIT-TASK.md`)

### 1.5 Rà soát tài liệu công khai — ALLOW / EXCLUDE (điều kiện C2)

Cowork quét 26 tài liệu (15:15 VN) theo các tiêu chí: mã số sinh viên/email/số điện thoại; đường dẫn máy cá nhân; secret/placeholder; nhắc tên đối thủ; tự chấm điểm, chiến lược; điểm yếu bảo mật **chưa vá**.

| Tài liệu | Quyết định | Ghi chú |
|---|---|---|
| `README.md` | ALLOW | Claim sẽ sửa ở FREEZE-004 |
| `docs/context/BUSINESS_REQUIREMENTS.md`, `CURRENT_STATUS.md`, `DECISION_LOG.md`, `OPEN_QUESTIONS.md`, `PRODUCT_VISION.md`, `TECH_STACK.md`, `USER_PERSONAS.md` | ALLOW | Không có thông tin nhạy cảm |
| `docs/context/PROJECT_BRIEF.md` | ALLOW ⚠️ | Có **MSSV** của Owner (dòng bảng Team). Thông tin này **đã public sẵn** trong HEAD `bdb1e13`. Commit không làm lộ thêm. Owner có thể xóa MSSV ở task docs sau |
| `docs/context/COMPETITION_CONTEXT.md` | ALLOW ⚠️ | Nhắc tên + repo đội khác (TrustPact). **Đã public sẵn** trong HEAD. Đề xuất bỏ ở task docs sau |
| `docs/agent-ops/MASTER_DISPATCH.md`, `RISK_REGISTER.md` | ALLOW | Đã tracked; tài liệu quy trình |
| `docs/agent-ops/FREEZE-003-DEPS-TASK.md`, `FREEZE-005-COMMIT-TASK.md` | ALLOW | Có đường dẫn backup `D:\…` (không nhạy cảm) |
| `docs/agent-ops/reports/FREEZE-003-DEPS-report.md`, `FREEZE-003-DEPS-REQA.md` | ALLOW | Bằng chứng QA; có hash SHA-256 file, đường dẫn `D:\…` |
| `docs/agent-ops/reports/MKT-001…004-report.md`, `MKT-005-qa-report.md`, `MKT-005-remediation-report.md`, `MKT-ERROR-HANDLING-FIX.md`, `MKT-FINAL-QA-ANTIGRAVITY.md` | ALLOW ⚠️ | Bằng chứng kiểm thử. Có đường dẫn `file:///D:/…` (link hỏng với người ngoài), số dư ví testnet công khai, verdict `NO-GO` trung gian (đã được xử lý sau đó). Placeholder `<…>` cho biến env, **không** có giá trị thật (§1.4) |
| `docs/agent-ops/reports/UNIHACK-FINAL-PRELIM-AUDIT.md` | **EXCLUDE** | Tự chấm điểm theo rubric, đánh giá khả năng vào Top 10, bình luận đối thủ, liệt kê điểm yếu chưa xử lý (Owner kiêm Seller trên Fuji, số dư ví). Đây là tài liệu chiến lược nội bộ, không phù hợp để giám khảo đọc. Giữ local |
| `docs/agent-ops/FREEZE-004-CLAIMS-TASK.md` | **EXCLUDE (tạm)** | Mô tả chi tiết điểm yếu auth **chưa vá** (P2-03: fallback `SESSION_SECRET → ATTEST_API_KEY`). Commit cùng FREEZE-004 sau khi đã sửa |

> Nhiều tài liệu ALLOW tham chiếu tới `UNIHACK-FINAL-PRELIM-AUDIT.md` (link sẽ hỏng trên GitHub). Chấp nhận được; không sửa nội dung trong task này.

### 1.3 Phải loại trừ (KHÔNG commit dù bất kỳ lý do gì)

| Đường dẫn / mẫu | Lý do | Hiện trạng |
|---|---|---|
| `backend/.env`, `frontend/.env.local`, mọi `.env*` trừ `*.example` | Secret thật (private key agent, API key, session secret, Pinata JWT) | Bị `.gitignore` chặn ✅ |
| `backend/data/` (`marketplace.db*`, `known_hashes.json`, `trade_uris.json`, `reports/`) | Dữ liệu runtime | Ignored ✅ |
| `frontend/node_modules/`, `frontend/.next/`, `*.tsbuildinfo`, `frontend/next-env.d.ts` | Build artifact | Ignored ✅ |
| `.venv/`, `**/__pycache__/` | Môi trường Python | Ignored ✅ |
| `contracts/out/`, `contracts/cache/`, `contracts/broadcast/` | Artifact Foundry (tx hash đã có trong audit report) | Ignored ✅ |
| `*.bak`, `*.orig`, `*.rej`, file backup bất kỳ | Rác | Hiện không còn trong repo ✅ |
| `D:\Escrow_Marketplace_Backups\**` | Nằm ngoài repo | — |

### 1.4 Tiền kiểm secret (Cowork, read-only, không in giá trị)

- **So khớp giá trị thật:** đọc 5 giá trị trong `backend/.env` và `frontend/.env.local` (`AGENT_PRIVATE_KEY`, `ATTEST_API_KEY` ×2, `SESSION_SECRET`, `PINATA_JWT`), tìm trong 98 file ứng viên và trong `git log --all -p`: **0 trùng khớp**.
- **Regex** (hex 64, JWT, `KEY=…`), các ca trúng đều đã phân loại:
  - 5 key là **khóa mặc định công khai của Anvil** (account #0, #1, #2, #3, #4; ví dụ `STRANGER` = `0x15d3…6A65` = Anvil #4), nằm trong `backend/tests/test_listings_integration.py`, có comment "Key mặc định CÔNG KHAI của anvil".
  - `ATTEST_API_KEY=` để trống trong `.env.example`.
  - Placeholder `<…>` trong các report MKT-005.
  - Secret giả cho test (`test-session-secret-…`, `sec03-…`) trong `frontend/test/*.cjs`.
  - Hash SHA-256 trong report FREEZE-003.
  - `0x000…` (địa chỉ zero) trong UI/test.
- **Kết luận tiền kiểm:** chưa thấy secret thật. Antigravity **vẫn phải** quét lại khi thực thi (§6, Bước 4).

---

## 2. Goal

1. Branch local `freeze/003-marketplace-mkt` (từ `bdb1e13`) có **3 commit** (F1) chứa **đúng 97 mục** ALLOW của §11, không thiếu, không thừa.
2. Sau commit: `git status --porcelain=v1 -uall` chỉ còn **đúng** 2 mục EXCLUDE (`??`), cộng với report và `MASTER_DISPATCH.md` của chính task này (ghi sau khi commit).
3. Không file nào trong §1.3 có trong `git ls-tree -r HEAD`; không secret thật trong `git log -p bdb1e13..HEAD`.
4. **Clean clone** của branch build và test PASS mà không cần `.env`.
5. Nội dung từng file sau commit = nội dung working tree trước commit (bỏ qua CRLF).
6. **Chưa push, chưa merge, chưa mở PR** (Phase B chờ "GO PUSH").

---

## 3. Owner decisions — ĐÃ DUYỆT (15/11/2026 15:08)

| ID | Quyết định |
|---|---|
| **F1** | **3 commit**: C1 Backend → C2 Frontend → C3 Documentation |
| **F2** | `git switch -c freeze/003-marketplace-mkt` trên working tree hiện tại; **ở lại** branch mới sau task |
| **F3** | **Không push / không PR** trong Phase A. Phase B chỉ khi Owner ra lệnh `GO PUSH` |
| **F4** | Bắt buộc: so khớp giá trị + regex. Thêm gitleaks nếu **đã cài sẵn** (không cài mới). **Không in, không lưu giá trị bí mật** vào log/report |
| **F5** | Clean clone tại `D:\Escrow_Marketplace_CleanClone_005`; **không tự xóa** |
| **F6** | Chỉ commit tài liệu phù hợp công khai theo bảng **ALLOW/EXCLUDE §1.5**. File EXCLUDE giữ nguyên trên đĩa (untracked), không xóa, không sửa |
| **F7** | `pytest -rs` phải **185 passed, 0 skipped** với Anvil. Thiếu Anvil ⇒ **BLOCKED (môi trường)**; khôi phục Anvil rồi mới tiếp tục |

**Điều kiện bổ sung của Owner:** C1 (kiểm kê nhất quán tuyệt đối) → §1.1, §11, Bước 1/5. C2 (rà soát tài liệu công khai) → §1.5. C3 (toàn vẹn working tree khi đổi branch) → Bước 0, Bước 3, AC-12.

Bảng phương án gốc (tham chiếu):

| ID | Câu hỏi | Đề xuất Cowork | Thay thế |
|---|---|---|---|
| **F1** | Chia commit | **3 commit theo module**: C1 backend → C2 frontend → C3 docs. Mỗi nhóm tự đứng được về test (backend không phụ thuộc frontend) | 1 commit duy nhất (nhanh hơn, khó review); hoặc tách frontend thành BFF/UI (rủi ro commit trung gian không build được) |
| **F2** | Working tree chính sau task | **Ở lại trên `freeze/003-marketplace-mkt`**. File trên đĩa không đổi, dev server/demo không bị ảnh hưởng | Quay về `main`: các file MKT trên đĩa sẽ bị Git trả về bản `bdb1e13` (vẫn còn trong commit, nhưng dễ gây nhầm lẫn) |
| **F3** | Push / PR | **Không** trong task này. Sau Re-QA, Owner nói "GO PUSH" thì mới làm Phase B: `git push -u origin freeze/003-marketplace-mkt` + mở **draft PR** vào `main`. **Không merge** | Cho phép push branch ngay sau commit (repo public, nên phải chờ secret scan Re-QA) |
| **F4** | Công cụ quét secret | **Bắt buộc:** script so khớp giá trị thật (chỉ in số lần trùng) + regex có allowlist. **Khuyến nghị:** `gitleaks detect --log-opts="bdb1e13..HEAD" --redact` nếu đã có sẵn (OD-08 cho phép) | Chỉ regex |
| **F5** | Clean clone | `git clone --branch freeze/003-marketplace-mkt D:\Escrow_Marketplace_Demo D:\Escrow_Marketplace_CleanClone_005` (clone local, không cần mạng cho git) + `npm ci`. Giữ lại thư mục sau task, Owner tự xóa | Clone vào `%TEMP%` |
| **F6** | Docs nội bộ (audit, report agent, spec) có commit vào repo public không? | **Có**: là bằng chứng quy trình QA, không chứa secret (§1.4) | Chỉ commit `README.md` + `docs/context/`; giữ `docs/agent-ops/reports/` local |
| **F7** | `pytest` cần Anvil để 0 skip | **Bắt buộc 0 skipped** (Antigravity đã từng chạy 185/185 trên Windows). Thiếu Anvil ⇒ BLOCKED | Chấp nhận skip Anvil, ghi limitation |

---

## 4. Scope

**Được phép:**
- Lệnh Git: `git switch -c`, `git add -- <đường dẫn cụ thể>`, `git commit`, `git diff`, `git status`, `git log`, `git show`, `git ls-tree`, `git clone` (local, vào thư mục mới ngoài repo).
- Tạo `docs/agent-ops/reports/FREEZE-005-COMMIT-report.md`; sửa 1 dòng `docs/agent-ops/MASTER_DISPATCH.md` **sau khi** commit xong (để uncommitted, xem §8).
- Tạo thư mục backup `D:\Escrow_Marketplace_Backups\FREEZE-005-COMMIT\` và clean clone `D:\Escrow_Marketplace_CleanClone_005\`.

**Cấm:**
- Sửa **nội dung** bất kỳ file nào (kể cả whitespace, line-ending, format) ngoài report/MASTER_DISPATCH.
- `git add -A`, `git add .`, `git add -f`, `git commit -a`, `git stash`, `git reset` (mọi dạng), `git clean`, `git checkout -- <file>`, `git rebase`, `git commit --amend` *(trừ khi Owner duyệt trong phiên)*, `git push`, `git merge`, tạo PR, xóa branch/worktree.
- `npm install/update/audit fix` trong repo chính. `npm ci` chỉ trong clean clone.
- Mở, in, copy `.env`/`.env.local`. Script so khớp secret chỉ in **số đếm**.
- Sửa `.gitignore` hay thêm `.gitattributes` (để sau).

---

## 5. Vì sao `git switch -c` an toàn với working tree dirty

- `git switch -c freeze/003-marketplace-mkt` tạo branch mới **tại cùng commit** `bdb1e13`. Git không phải cập nhật file nào, nên mọi thay đổi ` M`/`??` giữ nguyên trên đĩa và trong index.
- Không cần `stash` (rủi ro mất untracked nếu dùng sai cờ). Không cần copy sang worktree khác (rủi ro bỏ sót file, đổi CRLF).
- **Điều kiện:** HEAD phải đúng `bdb1e13` và branch tên đó chưa tồn tại (G1).
- **Line-ending:** máy Owner dùng `core.autocrlf=true` (global). Khi `git add`, file CRLF được chuẩn hóa về LF trong commit, đúng như HEAD đang lưu. Kiểm chứng bằng AC-05.

---

## 6. Các bước thực hiện (PowerShell, tại `D:\Escrow_Marketplace_Demo`)

### Bước 0 — Snapshot & backup đầy đủ (trước mọi lệnh Git ghi)

```powershell
$R = "D:\Escrow_Marketplace_Demo"; $B = "D:\Escrow_Marketplace_Backups\FREEZE-005-COMMIT"
New-Item -ItemType Directory -Force -Path "$B\files" | Out-Null
Set-Location $R
git rev-parse HEAD                     | Out-File "$B\head-before.txt"
git branch --list                      | Out-File "$B\branches-before.txt"
git config --get core.autocrlf         | Out-File "$B\autocrlf.txt"
git status --porcelain=v1 -uall        | Out-File "$B\git-status-uall-before.txt" -Encoding utf8
git diff --ignore-cr-at-eol --stat     | Out-File "$B\diffstat-before.txt" -Encoding utf8

# Danh sách đường dẫn từ status (bỏ 3 ký tự trạng thái); đường dẫn có [id] xử lý bằng -LiteralPath
$paths = Get-Content "$B\git-status-uall-before.txt" | ForEach-Object { $_.Substring(3).Trim('"') }
$paths | Out-File "$B\inventory-before.txt" -Encoding utf8

# Backup nguyên trạng + manifest SHA-256 của từng file trong kiểm kê
$man = foreach ($p in $paths) {
  $src = Join-Path $R $p
  $dst = Join-Path "$B\files" $p
  New-Item -ItemType Directory -Force -Path (Split-Path -LiteralPath $dst) | Out-Null
  Copy-Item -LiteralPath $src -Destination $dst
  "{0}  {1}" -f (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash.ToLower(), $p
}
$man | Out-File "$B\inventory-before.sha256" -Encoding utf8
($man | Where-Object { $_ -match '  $' }).Count     # PHẢI = 0
($man).Count                                         # PHẢI = số dòng inventory
```

### Bước 1 — Gates (điều kiện dừng §7)
- `head-before.txt` = `bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5`.
- `git branch --list freeze/003-marketplace-mkt` rỗng.
- `inventory-before.txt` **khớp từng dòng** với danh sách đường dẫn ở §11 (không dùng tổng số làm tiêu chí).
- `inventory-before.sha256` **khớp từng dòng** với manifest SHA-256 ở §11, **trừ** dòng `docs/agent-ops/FREEZE-005-COMMIT-TASK.md`. Spec không thể tự chứa hash của chính nó; SHA của spec nằm trong prompt dispatch và phải khớp.
- Có thay đổi bất kỳ sau baseline ⇒ **G2 STOP**. Không tự điều chỉnh danh sách.
- `git diff --name-only` = `git diff --ignore-cr-at-eol --name-only` (không file nào chỉ đổi CRLF).
- Không đường dẫn nào trong kiểm kê khớp §1.3: `$paths | Select-String -Pattern '(^|/)\.env($|\.)(?!.*example$)|\.bak$|node_modules/|\.next/|backend/data/|__pycache__/|tsbuildinfo$'` = 0.

### Bước 2 — Regression trên working tree (trước commit)
```powershell
cd contracts; forge test; "EXIT=$LASTEXITCODE"; cd ..                       # kỳ vọng 81 passed, 0 failed, 0 skipped
.\.venv\Scripts\python.exe -m pytest -rs; "EXIT=$LASTEXITCODE"             # kỳ vọng 185 passed, 0 skipped (F7)
cd frontend; npm test; "EXIT=$LASTEXITCODE"; npx tsc --noEmit; "EXIT=$LASTEXITCODE"; npm run build; "EXIT=$LASTEXITCODE"; npm ls; "EXIT=$LASTEXITCODE"; cd ..
```
Ghi log đầy đủ và **exit code** vào `$B\tests-before\`. `npm test` hỗ trợ cả hai dạng tóm tắt (`# tests N` / `ℹ tests N`). Không ấn định cứng tổng số; yêu cầu `fail = 0`, `skipped = 0`, `cancelled = 0`, `EXIT = 0`.

### Bước 3 — Tạo branch
```powershell
git switch -c freeze/003-marketplace-mkt
git branch --show-current                                     # freeze/003-marketplace-mkt
git rev-parse HEAD                                            # vẫn bdb1e13…
git status --porcelain=v1 -uall | Out-File "$B\git-status-uall-after-switch.txt" -Encoding utf8
# (a) PHẢI giống hệt git-status-uall-before.txt
# (b) Toàn vẹn nội dung (C3): tính lại SHA-256 từng file trong kiểm kê bằng -LiteralPath
$after = foreach ($p in $paths) { "{0}  {1}" -f (Get-FileHash -LiteralPath (Join-Path $R $p) -Algorithm SHA256).Hash.ToLower(), $p }
$after | Out-File "$B\inventory-after-switch.sha256" -Encoding utf8
Compare-Object (Get-Content "$B\inventory-before.sha256") $after     # PHẢI RỖNG; khác ⇒ G6 STOP, rollback = git switch main
```

### Bước 4 — Quét secret trước khi stage (F4)
1. **So khớp giá trị thật**: script đọc `backend/.env` và `frontend/.env.local` **trong bộ nhớ**, lấy các giá trị dài ≥ 12 ký tự của `AGENT_PRIVATE_KEY`, `PRIVATE_KEY`, `ATTEST_API_KEY`, `SESSION_SECRET`, `PINATA_JWT`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. Tìm từng giá trị (cả dạng có và không có `0x`) trong mọi file của kiểm kê. **Chỉ in** `TÊN_BIẾN: hits=N`. Bất kỳ `N > 0` ⇒ **STOP**.
2. **Regex** `0x?[0-9a-fA-F]{64}`, `eyJ[\w-]{20,}\.[\w-]{20,}`, `(PRIVATE_KEY|JWT|SECRET|API_KEY)\s*[=:]\s*\S{12,}` trên kiểm kê. Mọi ca trúng phải thuộc **allowlist**: 5 khóa Anvil công khai, placeholder `<…>`/rỗng, chuỗi `test-…`/`sec03-…`/`anvil-mkt-test-key` trong `*/test*/`, hash SHA-256 trong `docs/agent-ops/**`, `0x000…0`. Ca ngoài allowlist ⇒ **STOP, báo Owner**.
3. **gitleaks** (nếu có): `gitleaks detect --no-git --source . --redact` trên kiểm kê; sau khi commit, chạy lại `gitleaks detect --log-opts="bdb1e13..HEAD" --redact`.

### Bước 5 — Commit theo module (F1)

Chỉ `git add -- <đường dẫn>` theo **đúng danh sách §1.2**. Đường dẫn có `[id]` phải đặt trong dấu nháy.

```powershell
# C1
git add -- backend/.env.example backend/Dockerfile backend/attest_service.py backend/auto_agent.py backend/chain.py `
  backend/tests/test_service_unit.py backend/db.py backend/listings.py `
  backend/tests/test_listings_integration.py backend/tests/test_listings_unit.py
git diff --cached --name-only | Out-File "$B\C1-staged.txt"; git diff --cached --check; "CHECK_EXIT=$LASTEXITCODE"
git commit -m "feat(backend): marketplace listings, purchase requests, bind-trade and BFF HMAC replay guard (MKT-001..005)"

# C2 — liệt kê đủ 63 đường dẫn §1.2 (frontend/...)
git add -- <63 đường dẫn frontend>
git diff --cached --name-only | Out-File "$B\C2-staged.txt"; git diff --cached --check; "CHECK_EXIT=$LASTEXITCODE"
git commit -m "feat(frontend): marketplace UI, BFF proxy routes, auth session and pin hardening (MKT-001..005)"

# C3 — liệt kê đủ đường dẫn docs §1.2 + FREEZE-005-COMMIT-TASK.md
git add -- README.md docs/...
git diff --cached --name-only | Out-File "$B\C3-staged.txt"; git diff --cached --check; "CHECK_EXIT=$LASTEXITCODE"
git commit -m "docs: sync context docs, audit and agent-ops reports (MKT-005, FREEZE-003..005)"
```
- Danh sách `git add` chính xác cho C1/C2/C3 nằm ở **§11.2**. Dùng đúng danh sách đó, không gõ tay.
- Trước mỗi `git commit`: `Cn-staged.txt` phải **trùng từng dòng** với danh sách nhóm đó trong §11.2.
- **Không** `git add` 2 mục EXCLUDE (§1.5).
- `git diff --cached --check` ≠ 0 ⇒ **STOP, báo Owner**. Không tự sửa whitespace vì sẽ đổi nội dung.
- Commit dưới danh tính Git hiện có trên máy Owner (`git config user.name/email`). Không đổi cấu hình.

### Bước 6 — Xác minh sau commit (repo chính)
```powershell
git log --oneline bdb1e13..HEAD                         # đúng 3 commit
git status --porcelain=v1 -uall                         # CHỈ 2 dòng ?? EXCLUDE (§1.5)
git diff --ignore-cr-at-eol --stat HEAD                 # RỖNG
git diff --name-only bdb1e13 HEAD | Sort-Object | Out-File "$B\committed-paths.txt"   # = inventory (sort)
git ls-tree -r --name-only HEAD | Select-String -Pattern '(^|/)\.env$|\.env\.local$|\.bak$|node_modules/|\.next/|backend/data/|__pycache__/|tsbuildinfo$'   # RỖNG
# Nội dung: từng file trong kiểm kê, hash(blob HEAD) = hash(file backup đã bỏ CR)
```
Sau đó mới ghi report và cập nhật 1 dòng `MASTER_DISPATCH.md` → `IN_REVIEW`. Hai file này **để uncommitted** (§8).

### Bước 7 — Clean clone verification (F5)
```powershell
git clone --branch freeze/003-marketplace-mkt D:\Escrow_Marketplace_Demo D:\Escrow_Marketplace_CleanClone_005
Set-Location D:\Escrow_Marketplace_CleanClone_005
git log --oneline -4; git status --porcelain=v1 -uall                  # sạch
Test-Path -LiteralPath backend\.env, frontend\.env.local                # False, False
Get-ChildItem -Recurse -File -Filter *.bak | Measure-Object             # 0
cd contracts; forge test; "EXIT=$LASTEXITCODE"; cd ..
D:\Escrow_Marketplace_Demo\.venv\Scripts\python.exe -m pytest -rs; "EXIT=$LASTEXITCODE"
cd frontend; npm ci --no-audit --no-fund; "EXIT=$LASTEXITCODE"
npm ls; "EXIT=$LASTEXITCODE"; npm test; "EXIT=$LASTEXITCODE"; npx tsc --noEmit; "EXIT=$LASTEXITCODE"; npm run build; "EXIT=$LASTEXITCODE"
```
- **Không** tạo `.env`/`.env.local` trong clone. Nếu build đòi biến, chỉ đặt **biến public** (`NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_ESCROW_ADDRESS`, `NEXT_PUBLIC_TOKEN_ADDRESS`) trong phiên shell, rồi ghi vào report.
- `npm ci` lỗi ⇒ **BLOCKED** (không junction, không `npm install`).
- SHA `package*.json` trong clone trước và sau `npm ci` phải bằng nhau.

---

## 7. Điều kiện dừng (STOP → `BLOCKED`, không chạy tiếp, báo Owner/Cowork)

| ID | Điều kiện |
|---|---|
| G1 | HEAD ≠ `bdb1e13`, hoặc branch `freeze/003-marketplace-mkt` đã tồn tại |
| G2 | Kiểm kê hoặc SHA-256 khác §11 (thừa/thiếu **bất kỳ** đường dẫn nào, hoặc hash lệch), hoặc SHA spec ≠ giá trị trong prompt |
| G3 | Có file chỉ đổi CRLF, hoặc đường dẫn khớp mẫu loại trừ §1.3 |
| G4 | Secret scan: `hits > 0` với giá trị thật, hoặc regex/gitleaks trúng ngoài allowlist |
| G5 | Bất kỳ test/build nào ở Bước 2 FAIL / skip / exit ≠ 0 |
| G6 | `git status` hoặc SHA-256 kiểm kê thay đổi sau `git switch -c`; `Cn-staged.txt` lệch §11.2; `git diff --cached --check` ≠ 0; mục EXCLUDE bị stage |
| G7 | Sau C3: `git status -uall` khác đúng 2 mục EXCLUDE; tìm thấy đường dẫn cấm hoặc mục EXCLUDE trong `git ls-tree`; hash nội dung lệch backup |
| G8 | Clean clone: `npm ci` lỗi, hoặc test/build FAIL |
| G9 | Bất kỳ bước nào đòi sửa nội dung file để đi tiếp |

---

## 8. Acceptance Criteria

| ID | Tiêu chí | Verification | Evidence |
|---|---|---|---|
| **AC-01** | Snapshot + backup đủ trước khi thao tác; manifest không có đường dẫn rỗng | Thư mục `$B`; số dòng manifest = inventory | Report |
| **AC-02** | G1–G3 PASS; kiểm kê và SHA-256 khớp **từng dòng** với §11 | `Compare-Object` inventory/manifest vs §11 = rỗng | Output |
| **AC-03** | Secret scan sạch (giá trị thật = 0; regex/gitleaks chỉ trúng allowlist) trên kiểm kê **và** trên `git log -p bdb1e13..HEAD` | Bước 4 + chạy lại sau Bước 6 | Log (đã redact) |
| **AC-04** | Đúng 3 commit trên `freeze/003-marketplace-mkt`, cha là `bdb1e13`; mỗi commit chỉ chứa nhóm của mình | `git log --oneline --name-status bdb1e13..HEAD` đối chiếu §1.2 | Output |
| **AC-05** | Nội dung commit = working tree trước task: `git diff --ignore-cr-at-eol HEAD` rỗng; `git status -uall` chỉ còn 2 mục EXCLUDE; với từng file trong 97 mục ALLOW, hash blob = hash backup (bỏ CR) | Bước 6 | Bảng hash |
| **AC-06** | Không đường dẫn cấm §1.3 trong `git ls-tree -r HEAD` | Bước 6 | Output |
| **AC-07** | Regression trên repo chính trước commit: `forge test`, `pytest -rs`, `npm test`, `tsc`, `build`, `npm ls`: tất cả EXIT 0, 0 fail, 0 skipped | Bước 2 | Log + exit code |
| **AC-08** | Clean clone: không `.env`/`.bak`; `npm ci` OK, lock không đổi; `forge test`, `pytest -rs` (0 skip), `npm test`, `tsc`, `build`, `npm ls` EXIT 0; số test **bằng** AC-07 | Bước 7 | Log |
| **AC-09** | Không file nào bị sửa nội dung (ngoài report/MASTER_DISPATCH sau commit) | So `inventory-before.sha256` với file hiện tại trên đĩa | Compare-Object |
| **AC-10** | Chưa push/merge/PR: `git ls-remote origin freeze/003-marketplace-mkt` rỗng; `origin/main` vẫn `bdb1e13`; `main` local vẫn `bdb1e13` | Lệnh | Output |
| **AC-11** | Working tree chính đang ở `freeze/003-marketplace-mkt` (F2) | `git branch --show-current` | Output |
| **AC-12** | Toàn vẹn working tree khi đổi branch (C3): SHA-256 99 mục trước và ngay sau `git switch -c` giống hệt; trong toàn task không có lệnh `stash`/`reset`/`clean`/`checkout --`/`switch` ngoài kế hoạch | `inventory-after-switch.sha256` vs `inventory-before.sha256`; lịch sử lệnh trong report | Compare-Object |
| **AC-13** | 2 mục EXCLUDE còn nguyên trên đĩa, SHA không đổi, **không** có trong bất kỳ commit nào | `Get-FileHash -LiteralPath` + `git log --all -- <path>` rỗng | Output |
| **AC-14** | Không giá trị bí mật nào xuất hiện trong report/log của task | Cowork chạy so khớp giá trị trên `$B\**` + report | Đếm = 0 |

> Report + MASTER_DISPATCH của chính FREEZE-005 viết **sau** khi commit nên để uncommitted. Hai file này sẽ được commit chung với FREEZE-004 hoặc một commit docs riêng khi Owner duyệt.

---

## 9. Rollback Plan

| Tình huống | Hành động | Mất dữ liệu? |
|---|---|---|
| Dừng trước Bước 3 | Không cần làm gì | Không |
| Sau Bước 3, chưa commit | `git switch main`. Cùng commit `bdb1e13` nên các file dirty giữ nguyên | Không |
| Đã commit sai (chưa push) | **Cần Owner duyệt trong phiên** (rule 90): `git reset --soft bdb1e13` trên `freeze/003-marketplace-mkt` đưa mọi thay đổi về staged, rồi `git restore --staged .` để làm lại Bước 5. **Không bao giờ** `reset --hard` | Không (file trên đĩa không đổi) |
| File trên đĩa bị đổi ngoài ý muốn | Khôi phục từng file từ `$B\files\<path>` bằng `Copy-Item -LiteralPath`, so với `inventory-before.sha256` | Không |
| Clean clone hỏng | Bỏ thư mục clone (Owner tự xóa); repo chính không bị ảnh hưởng | Không |

Backup `D:\Escrow_Marketplace_Backups\FREEZE-005-COMMIT\` giữ tới sau Demo Day.

---

## 10. Phase B — chỉ khi Owner nói "GO PUSH" (sau Re-QA ACCEPT)

1. `git push -u origin freeze/003-marketplace-mkt` (không `--force`).
2. Mở **draft PR** `freeze/003-marketplace-mkt` → `main`, mô tả gồm danh sách 3 commit, test evidence, link report Re-QA.
3. Kiểm tra trên GitHub ở chế độ ẩn danh rằng branch hiển thị, không có `.env`.
4. **Không merge.** Merge vào `main` theo kế hoạch tích hợp riêng do Owner duyệt (sau FREEZE-004).

> **Lưu ý thời hạn:** giám khảo xem nhánh mặc định (`main`). Để đáp ứng P0-02 trước 21/11, Owner cần lên kế hoạch merge `freeze/003…` (+ `freeze/004…`) vào `main` sớm, mục tiêu ≤ 18/11.

---

## 11. Danh sách đích & baseline (Cowork chốt khi READY)

**Thời điểm chụp:** 15/11/2026 ~15:25 (VN) · HEAD `bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5` · branch `main` · Cowork chụp bằng `git status --porcelain=v1 -uall` + `sha256sum` trên chính thư mục `D:\Escrow_Marketplace_Demo` (tương đương `Get-FileHash -LiteralPath`).

### 11.0 Kết quả kiểm Gate lúc READY (Cowork)

| Gate | Kết quả | Bằng chứng |
|---|---|---|
| G1 | ✅ HEAD = `bdb1e13` = `main` = `origin/main`; không tồn tại branch `freeze/003-marketplace-mkt` (local/remote ref) | `git rev-parse`, `git branch -a --list` |
| G2 | ✅ 99 mục (46 ` M` + 53 `??`); manifest 98 file (trừ spec) không có đường dẫn rỗng | §11.1 |
| G3 | ✅ 0 file chỉ đổi CRLF; 0 đường dẫn khớp mẫu loại trừ | `git diff --name-only` vs `--ignore-cr-at-eol`; regex §1.3 |
| G4 | ✅ So khớp giá trị thật trên 99 mục: `AGENT_PRIVATE_KEY` 0 · `ATTEST_API_KEY` 0 · `SESSION_SECRET` 0 · `PINATA_JWT` 0. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: 2 lần (`frontend/.env.local.example`, `MKT-FINAL-QA-ANTIGRAVITY.md`). Đây là **định danh công khai phía client** (tiền tố `NEXT_PUBLIC_`, gửi xuống trình duyệt), **đã có sẵn trong HEAD** (`frontend/lib/wagmi.ts`, `.env.local.example`, `ESC-020-qa-report.md`), nên được đưa vào allowlist | Script chỉ in số đếm |
| G5 | ⚠️ Cowork chạy trên Linux VM, cùng nội dung logic (manifest 137 file trùng baseline FREEZE-003): `npm test` 61/61, `tsc` 0, `next build` PASS (15/11 14:30–14:45); `forge test` 81/81, `pytest` 185/185 với Anvil (15/11 13:50, logic không đổi từ đó). **Antigravity phải chạy lại trên Windows ở Bước 2** | Report FREEZE-003-DEPS-REQA, UNIHACK audit §4.5 |
| G6–G9 | ⏳ Kiểm lúc thực thi | §7 |

### 11.1 Manifest SHA-256 (98 file; định dạng `sha256  path`, sort theo path)

`docs/agent-ops/FREEZE-005-COMMIT-TASK.md` **không** nằm trong manifest (tự tham chiếu). SHA của spec ở prompt dispatch.
SHA-256 của chính manifest (98 dòng, LF, có newline cuối): `4eb54b512e1e95b5e448b008a7380e8acc45688db625d7616dc72130d569f206`

```text
b4fd6731658b38a35042e8f8de3cd57cc6b3edc5138b305fb8dbf49414449c82  README.md
2e8711487c8b3251da25b5a22505e9dd7256f0a3b7f9f9f291874a0a1d8fb28e  backend/.env.example
5cc3c158b78d45986ea94830d083de144a834c7dbf160521990c5ce736ba9812  backend/Dockerfile
2187757ad4a5cd812e9762a49b10f1d4df965355008b166da6ddcea30196c529  backend/attest_service.py
5545ad288bd5d51ab6127b1e62a58022c3c8091ba5d781625f6cfada01a98f99  backend/auto_agent.py
c949df7b6c9b22adf21a7fd7a4a060f4ef945157b224d1dd64159772eaf7e409  backend/chain.py
411e05998df1e01b111210f5331d20397ecb594fa87bfe6971c43956a05bf86b  backend/db.py
28e40cdc66352c568d2731a2dc1d713701c450bde711cd5f8b1fe40dc1b53532  backend/listings.py
705fb856bcea5a1b47d1b1e2a1a965c8caa0e618d2cb8dd4638bb9097f1add2b  backend/tests/test_listings_integration.py
2923324e0e5f0d75fb18a5c2718cd8356b08898ccc74af9be8585cc61fd9361d  backend/tests/test_listings_unit.py
9f0738137b4ac8d590d07bf43797cd3cc6ef48c99c0f5bf1b7376b6ca48a1876  backend/tests/test_service_unit.py
6f4974b4020fd5a02a29866d9a31796161ff5bf57ab9945759b3f3229efe0431  docs/agent-ops/FREEZE-003-DEPS-TASK.md
24e88a520a4a2478a56a03c3fdcca08516ef624c4922d2d1524cb6fbda2a11db  docs/agent-ops/FREEZE-004-CLAIMS-TASK.md
e622d1eb4cbcf43189a78982ee26c56fe762a26bffa12dcaf2dac947fc3338cf  docs/agent-ops/MASTER_DISPATCH.md
e78fd9b3526ce4969a60fe17278625dead060fcc9bcaefea2348b3d40f16eedb  docs/agent-ops/RISK_REGISTER.md
fdcf8be07c1be82645bb53054b16aa4a1e4e337fd42970c8e01d3651e985863d  docs/agent-ops/reports/FREEZE-003-DEPS-REQA.md
78fa8a7d09e62a7a343a149a5c854021e3e31505197c2c7caa5207e431f1baa9  docs/agent-ops/reports/FREEZE-003-DEPS-report.md
1a35c4237b744381c66a03ec4c036c3b223a9957d29d02c890cc58f712e17a28  docs/agent-ops/reports/MKT-001-report.md
19a3006dbfb0d85ee144f31236f81c97248d5e045c3ab6bad735013d708a8f90  docs/agent-ops/reports/MKT-002-report.md
195ae740e0572bab6b56fb177c6c63336f961201d7a34aa9c9debfc2fb1bad4b  docs/agent-ops/reports/MKT-003-report.md
602226e2f3474f550cd0ecc1d2abd5deee3fc8c3a016631be1b116d27c4b1c76  docs/agent-ops/reports/MKT-004-report.md
a00bfcfff0aa99c61720f65fc8514416ca296089a5ddee06afd3149a5c8b899b  docs/agent-ops/reports/MKT-005-qa-report.md
aefb40866e0c775e50164574daea7bc2490bc5acad030efca22e773900fb0f48  docs/agent-ops/reports/MKT-005-remediation-report.md
6dd900713bfb86437ebb3c71c208cbf27c4a52bda7276cc16332a1989398fbf7  docs/agent-ops/reports/MKT-ERROR-HANDLING-FIX.md
e63edd69e9ab08aaab2051386f9d83aa62c84dc8467c3c6476aa141bcdc186ec  docs/agent-ops/reports/MKT-FINAL-QA-ANTIGRAVITY.md
14ebfb08e6b5a8985ece18321195bc7ea8136538804a63a46ea68d7d2987e80f  docs/agent-ops/reports/UNIHACK-FINAL-PRELIM-AUDIT.md
08b00853ce9f0341036edf6fb8f104ba59a7f9aab3421ed341cd84905f959021  docs/context/BUSINESS_REQUIREMENTS.md
7ba2044c27e7c9d7ebaff33906f3baf30013b6e599ac740f6c0fd30e2e81d5c5  docs/context/COMPETITION_CONTEXT.md
718128a108995d3e6eda34f139c0e97a1767d43d23f0a29bb7e7eed2c4278f31  docs/context/CURRENT_STATUS.md
e5e8ec67901f6c88a4f916cb2fd82db364d012d9bc1ec131b3434fbded237121  docs/context/DECISION_LOG.md
2807686402f1ba96e0a98fb7c0b3a764a0f7e1521ec1c48a763ccbcc4ff6c1f9  docs/context/OPEN_QUESTIONS.md
f970bdbdc5f9921bf1d9422c62b3007155ed2a8063f48dcc7d90b39cfd537c33  docs/context/PRODUCT_VISION.md
0ff32bb44364ef7ef1328735e0c02470232486b14d8a79c1ce4d6d2be64f2dbd  docs/context/PROJECT_BRIEF.md
5ae796daa52d3f88443b1ffd3f4139f92454f282bcc1570c2f4301810ee061c5  docs/context/TECH_STACK.md
e94926a3bad2ada952c694a84a1207390d4c8ccf0012c7e7228d53bcf8c347d3  docs/context/USER_PERSONAS.md
c573d734055993e5ba958b0cef568912a82b2f060cc690842bfbe17706857135  frontend/.env.local.example
0c63387dc624152d8c0817bc0e4630d3061c02a4dfba3ea05c1d721ed094ee78  frontend/app/admin/page.tsx
f2c1a33a55d4fe3b494a08b2f42b3a3140dafa285494100cbd922ff04e2d8700  frontend/app/api/auth/session/route.ts
baeab61ab6f18d909b21fe5d5c91d79425b2da6174c306ded407baa6928c2691  frontend/app/api/listings/[id]/requests/route.ts
af606924f0aeb4ef4888a86368faf26d498f2b814c2462caea965d35b33fc9a8  frontend/app/api/listings/[id]/route.ts
647c736ddfe90663c66be4dce7e98b5ed64c6eeb0a4ba6f6991f4a028e8318c9  frontend/app/api/listings/mine/route.ts
e915202a3b7e2fc981cf5b80063a5f7d66a1725343f4df48f5745ddcb66e8715  frontend/app/api/listings/route.ts
bfb322009ae7f64f88722ec1cf7a17491867615913b164be193220ec6fa487bc  frontend/app/api/pin/route.ts
236a1765b2b5325a188432f6e735e26378b145630290c393a0108d485572e473  frontend/app/api/requests/[id]/bind-trade/route.ts
9f74957f6cf19a01d486bf403588665558215486e9dfdf6627c6ee7f9145d3cf  frontend/app/api/requests/[id]/cancel/route.ts
2fe7e8abbc923dda820fb00812643ed94888a2a27e54effbd3c679ed5a9c6a8d  frontend/app/api/requests/[id]/decision/route.ts
1d989b9c72bbc49341890a49f8b2a89c1da9bf4535ec284575dac34947640f3b  frontend/app/api/requests/[id]/route.ts
e970af207a0e4a7486ad678855eec4c39a8842395d641497c8c2278aa4cc6f29  frontend/app/api/requests/route.ts
df019fc225b6a323d7fe42aac655ff019cf0b634c00ef9fbb18b82fe5257f052  frontend/app/api/trades/[id]/context/route.ts
fa6a48c077966ad1f6b0e000a48b44e1ec18d3c0bcd7daf660d81a621465b363  frontend/app/api/trades/[id]/sync/route.ts
6ac15dc66eb9b61911727472474138fec8bdb1ba4fe56977422afae5ea65a7d8  frontend/app/api/uris/route.ts
38743ac726144244bf089d90737364e250e7b15c1556dcbbc9feadc23f808d61  frontend/app/api/verify/route.ts
7145f8c2afad7e2b7a80b370451fa31f81f72d31a87bfb9f76ce675cb2be760c  frontend/app/auth/local/page.tsx
269b26d08d7a476570cd36c371265dc3c5e1a0f318998af4488c44f13915f63d  frontend/app/auth/page.tsx
1994f548286407769c58bec8eacaad468d0865b7247430b2cf02101940acfd5a  frontend/app/listings/[id]/page.tsx
f863adfada37acc714ebf46fa43524bc89bfdc1df86b940d0650a6bc902eaea5  frontend/app/page.tsx
29e76257176bad90e25449654e72fbc52378fd25988bcb909e7c716f9dba51c4  frontend/app/sell/page.tsx
6bb3ae292ced12cf0c7455c5343d9c1788210dd59cb94b780cea4f6f6e5b4f9a  frontend/app/trade/[id]/page.tsx
d2d434ceae9d8722180494b04c03f9f49497d60b87c833b84f5619e310913f0d  frontend/app/trade/[id]/report/page.tsx
ede7c3158156f0486125d0b39ee3c014f87972ff59d0054e322a9806785d5cf0  frontend/app/trade/new/page.tsx
66a55afe33e53cea4f23f33f47bb070931676e1ec49f2e0015b7e1b4e80f5bfd  frontend/app/trades/page.tsx
be64e071ceb980ed340d036cf44c2ac3a39b3f3f7f688f12aa0255b3ad441753  frontend/components/AgentStatusCard.tsx
2503106c0ec25ae06813bdcdaa029a19574f249f351214a7aa6f41fd0557ceea  frontend/components/AuthGuard.tsx
5d281b96a8dfae0f6e0f90b09ab47fa4456984b81ab2a53181b3ec1f86ec3390  frontend/components/CollectiblesCarousel.tsx
897296fb867e096b658a5f1f5df92823fcec90951c572399604bf096d4cae7ab  frontend/components/ConnectWalletModal.tsx
8699eee62a33c4575bd4205d46fe92f580379541e45e86b18ee9e5de9cc013c2  frontend/components/EvidenceUploader.tsx
e8b2735d5fd10da229959e867a43ea2fd28c2d518c2940f7e82a3c4143800017  frontend/components/MultiImageUploader.tsx
b5d9153a3901cdd7e4857220e5ce243c925fb19c8f3100345ffc5acf90c738f6  frontend/components/Navbar.tsx
5f1db9a1c6fa3922a827d5234f44bc6a333e1e1b844ad7e2a0591881c5dc33c8  frontend/components/PendingWithdrawalBanner.tsx
db403c8f7e867711987dd63005070f9f599c86d85cfb84f35561249837b81ae1  frontend/components/ProductCard.tsx
0ac392a8a69937f4d9e11444ad634b68683d54d4dac8376172419add4d4589f2  frontend/components/TradeList.tsx
d3c180eab565aefa2a15fbf7ae2bfedcf94b0b7004829e9a77ec5aeba4f18733  frontend/components/WrongChainBanner.tsx
beb097419a64d6b574c7a254a6db1236427212cf54bb47dd6d364620c6de9c40  frontend/hooks/useAuthSession.ts
0a0e99a08978c5feaefc3b015da82123ca8e1bb784d02305da362f3178fb333c  frontend/hooks/useMyTrades.ts
c69175ac7b86123fa3a9ad9fb4d17a3e7cbe33c7b7a4a4cb30822f98ffe89b3a  frontend/hooks/useReputation.ts
7c9bc37f23e9737f68032cf1d4b77ec452aeff43330ce66c5e7c5904d2106d6d  frontend/hooks/useTrade.ts
1cc6ab8aab6df5092fb2a9a14faef79f0900ffa2973d626d8eaf87b7fa979282  frontend/lib/auth-routes.ts
dc5af59c399b6da3714437897f559f0382c06929217f7e70bb80dcc0cb7f7651  frontend/lib/auth-session.ts
7483df74b2c7cb0518c9b9f273dd9dac39318b8b3f1daa4c04103f8563813abf  frontend/lib/errors.ts
c12de53fa0498d3ab3419c93b9f1b97a22a43cde060d35ece91bae814cf0b980  frontend/lib/marketplace-bff.ts
530f6ac313d22f0213c7d55e54145fc0c8554966672f8908acd82718f6ce7c62  frontend/lib/marketplace-ui.ts
9a11d487ae2cd2b1f9e9f5af92ed3efc240df091c42dfbad69e804cb053d0ca6  frontend/lib/marketplace.ts
223c3c6ef807c109c6e56d64a54ec2c41a77befa5326d2e1914594c6881abb85  frontend/lib/pin-security.ts
8eb7a0f7fbd181b5590f3af670b9f0f8477a25092202d5b1afa730a08b5fa5e1  frontend/lib/trade-id.ts
ac3b2c01cdbc4ac4c635ad10478b601f98c909d91f5c2f97182c7395f21c078e  frontend/lib/wallet-providers.ts
5d3b265a3ddba0e6b31451f13a6ea0947c72755e32180a1b0482702ddb809dfd  frontend/lib/wallet-toast.ts
123df5b5803922ae4dee35e9f6ef90e90637b17b5bd0cde7ac02cc751434350a  frontend/public/images/collectibles/collectible-coins.webp
e90d096af7ca6f8da1095df51a647d5eb9ced2be7c02ddca8d05810d2244dcd9  frontend/public/images/collectibles/collectible-figure.webp
545a15a6156fd15e371e5bc505e1a4aafa86983f604c32e5fce88f62eea7d56a  frontend/public/images/collectibles/lego-set.webp
59024fd9f08411d214938a7c70da152f052bdb360a11b3223e3692f9a65f6cc7  frontend/public/images/collectibles/mecha-model.webp
3e9ae1e1a27eab6ffc3e447efe361ab4562541d7bcce0018473b31495733154d  frontend/public/images/collectibles/scale-model-car.webp
a5e6daef4e0c45747cb87164874a7f3dc497f82cd4638c9ddff5e99d8b3f0d30  frontend/public/images/collectibles/trading-cards.webp
54ab5d11b5e1f0c6fd9df62fd48c22961f9a06f6c92b73f5a9361148ff6f8f6e  frontend/test/marketplace-bff.test.cjs
e8fff38cdd99d80cbe0305518dc740a4f5e2f68a308a25b679d1266031e5253d  frontend/test/marketplace-ui.test.cjs
c43a64bb1b0a8c566fc6eb68172f024d6d46558a13f9870b8e7c9fc6c8c6c484  frontend/test/mkt-error-handling.test.cjs
6cc0a1ea177092898e4f796ac7aa05eb4a6fb76dae1bff1c95892af075300bf6  frontend/test/pin-hardening.test.cjs
93da1db3df3ba2e51ec9b8a3f05bcae8f4a5355dcd96cdc25d0997e5b23dd345  frontend/test/security-remediation.test.cjs
2b293320fc086e9e2aff9731840ec37a8d1fc9de866f83d41e72ad6ddee77402  frontend/test/wallet-providers.test.cjs
```

### 11.2 Danh sách `git add` chính xác (PowerShell; dùng nguyên văn)

**C1 — Backend (10)**
```powershell
$C1 = @(
  'backend/.env.example',
  'backend/Dockerfile',
  'backend/attest_service.py',
  'backend/auto_agent.py',
  'backend/chain.py',
  'backend/db.py',
  'backend/listings.py',
  'backend/tests/test_listings_integration.py',
  'backend/tests/test_listings_unit.py',
  'backend/tests/test_service_unit.py'
)
git add -- $C1
```

**C2 — Frontend (63)**
```powershell
$C2 = @(
  'frontend/.env.local.example',
  'frontend/app/admin/page.tsx',
  'frontend/app/api/auth/session/route.ts',
  'frontend/app/api/listings/[id]/requests/route.ts',
  'frontend/app/api/listings/[id]/route.ts',
  'frontend/app/api/listings/mine/route.ts',
  'frontend/app/api/listings/route.ts',
  'frontend/app/api/pin/route.ts',
  'frontend/app/api/requests/[id]/bind-trade/route.ts',
  'frontend/app/api/requests/[id]/cancel/route.ts',
  'frontend/app/api/requests/[id]/decision/route.ts',
  'frontend/app/api/requests/[id]/route.ts',
  'frontend/app/api/requests/route.ts',
  'frontend/app/api/trades/[id]/context/route.ts',
  'frontend/app/api/trades/[id]/sync/route.ts',
  'frontend/app/api/uris/route.ts',
  'frontend/app/api/verify/route.ts',
  'frontend/app/auth/local/page.tsx',
  'frontend/app/auth/page.tsx',
  'frontend/app/listings/[id]/page.tsx',
  'frontend/app/page.tsx',
  'frontend/app/sell/page.tsx',
  'frontend/app/trade/[id]/page.tsx',
  'frontend/app/trade/[id]/report/page.tsx',
  'frontend/app/trade/new/page.tsx',
  'frontend/app/trades/page.tsx',
  'frontend/components/AgentStatusCard.tsx',
  'frontend/components/AuthGuard.tsx',
  'frontend/components/CollectiblesCarousel.tsx',
  'frontend/components/ConnectWalletModal.tsx',
  'frontend/components/EvidenceUploader.tsx',
  'frontend/components/MultiImageUploader.tsx',
  'frontend/components/Navbar.tsx',
  'frontend/components/PendingWithdrawalBanner.tsx',
  'frontend/components/ProductCard.tsx',
  'frontend/components/TradeList.tsx',
  'frontend/components/WrongChainBanner.tsx',
  'frontend/hooks/useAuthSession.ts',
  'frontend/hooks/useMyTrades.ts',
  'frontend/hooks/useReputation.ts',
  'frontend/hooks/useTrade.ts',
  'frontend/lib/auth-routes.ts',
  'frontend/lib/auth-session.ts',
  'frontend/lib/errors.ts',
  'frontend/lib/marketplace-bff.ts',
  'frontend/lib/marketplace-ui.ts',
  'frontend/lib/marketplace.ts',
  'frontend/lib/pin-security.ts',
  'frontend/lib/trade-id.ts',
  'frontend/lib/wallet-providers.ts',
  'frontend/lib/wallet-toast.ts',
  'frontend/public/images/collectibles/collectible-coins.webp',
  'frontend/public/images/collectibles/collectible-figure.webp',
  'frontend/public/images/collectibles/lego-set.webp',
  'frontend/public/images/collectibles/mecha-model.webp',
  'frontend/public/images/collectibles/scale-model-car.webp',
  'frontend/public/images/collectibles/trading-cards.webp',
  'frontend/test/marketplace-bff.test.cjs',
  'frontend/test/marketplace-ui.test.cjs',
  'frontend/test/mkt-error-handling.test.cjs',
  'frontend/test/pin-hardening.test.cjs',
  'frontend/test/security-remediation.test.cjs',
  'frontend/test/wallet-providers.test.cjs'
)
git add -- $C2
```

**C3 — Documentation (24 ALLOW)**
```powershell
$C3 = @(
  'README.md',
  'docs/agent-ops/FREEZE-003-DEPS-TASK.md',
  'docs/agent-ops/FREEZE-005-COMMIT-TASK.md',
  'docs/agent-ops/MASTER_DISPATCH.md',
  'docs/agent-ops/RISK_REGISTER.md',
  'docs/agent-ops/reports/FREEZE-003-DEPS-REQA.md',
  'docs/agent-ops/reports/FREEZE-003-DEPS-report.md',
  'docs/agent-ops/reports/MKT-001-report.md',
  'docs/agent-ops/reports/MKT-002-report.md',
  'docs/agent-ops/reports/MKT-003-report.md',
  'docs/agent-ops/reports/MKT-004-report.md',
  'docs/agent-ops/reports/MKT-005-qa-report.md',
  'docs/agent-ops/reports/MKT-005-remediation-report.md',
  'docs/agent-ops/reports/MKT-ERROR-HANDLING-FIX.md',
  'docs/agent-ops/reports/MKT-FINAL-QA-ANTIGRAVITY.md',
  'docs/context/BUSINESS_REQUIREMENTS.md',
  'docs/context/COMPETITION_CONTEXT.md',
  'docs/context/CURRENT_STATUS.md',
  'docs/context/DECISION_LOG.md',
  'docs/context/OPEN_QUESTIONS.md',
  'docs/context/PRODUCT_VISION.md',
  'docs/context/PROJECT_BRIEF.md',
  'docs/context/TECH_STACK.md',
  'docs/context/USER_PERSONAS.md'
)
git add -- $C3
```

**EXCLUDE — KHÔNG add (2), giữ nguyên untracked trên đĩa**
```text
docs/agent-ops/FREEZE-004-CLAIMS-TASK.md
docs/agent-ops/reports/UNIHACK-FINAL-PRELIM-AUDIT.md
```

> Kiểm tra trước mỗi commit: `Compare-Object (git diff --cached --name-only) $Cn` phải rỗng. Tổng C1+C2+C3 = 97 = 99 − 2 EXCLUDE.
> PowerShell truyền mảng cho `git add --` theo từng phần tử, nên đường dẫn có `[id]` **không** bị hiểu là wildcard (git nhận nguyên văn sau `--`).

---

## 12. Cowork Independent Re-QA Checklist

1. `git log --oneline --name-status bdb1e13..freeze/003-marketplace-mkt`: 3 commit, phân nhóm đúng §1.2, cha đúng `bdb1e13`.
2. Tự tính hash nội dung từng file trong commit (`git show HEAD:<path>`) so với baseline Cowork lúc READY (bỏ CR): **trùng 100%**; không thiếu/thừa đường dẫn.
3. `git ls-tree -r HEAD` không có đường dẫn cấm; `git status -uall` repo chính chỉ còn report + MASTER_DISPATCH.
4. Secret scan độc lập trên `git log -p bdb1e13..HEAD`: so khớp giá trị thật (chỉ đếm) + regex/allowlist.
5. Chạy lại test trên bản checkout sạch của branch: `forge test` (81), `pytest -rs` (185, 0 skip), `npm test`, `tsc`, `next build`, `npm ls`. Môi trường Cowork là Linux VM; nếu không có Windows, ghi limitation như FREEZE-003.
6. Đối chiếu log clean clone của Antigravity (chỉ tham khảo) với kết quả tự chạy.
7. Xác minh AC-10: chưa có branch trên remote, `main`/`origin/main` = `bdb1e13`.
8. Verdict theo `.agents/skills/qa-review/SKILL.md`; đề xuất Owner ACCEPT/REJECT và (riêng) GO PUSH.

## Review outcome

- **Reviewer:** Cowork
- **Result:** _(chờ)_
- **Owner approval (Spec):** ✅ APPROVED WITH CONDITIONS, 15/11/2026 15:08 · F1 ☑ 3 commit · F2 ☑ ở lại branch · F3 ☑ không push trong Phase A · F4 ☑ value-match + regex (+gitleaks nếu có sẵn) · F5 ☑ `D:\Escrow_Marketplace_CleanClone_005` · F6 ☑ theo bảng ALLOW/EXCLUDE §1.5 · F7 ☑ 185/185, 0 skip
- **Owner approval (Result / GO PUSH):** _(chờ Re-QA)_
