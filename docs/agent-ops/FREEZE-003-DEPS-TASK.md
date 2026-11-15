# Task Specification — FREEZE-003-DEPS

> Template: `docs/agent-ops/TASK_TEMPLATE.md` · Nguồn finding: `docs/agent-ops/reports/UNIHACK-FINAL-PRELIM-AUDIT.md` (P1-03 + P2-04, SEC-02)
> Quy trình bắt buộc: **Cowork viết Spec → Owner duyệt → Antigravity thực hiện → Cowork Re-QA độc lập → Owner quyết định Freeze**

## Metadata

- **Task ID:** `FREEZE-003-DEPS`
- **Title:** Hoàn tất rollback PostCSS override lỗi, chuẩn hóa `package*.json`, cất giữ an toàn 2 file `.bak`
- **Priority:** P1
- **Status:** **READY** (Owner duyệt 15/11/2026 14:16 VN)
- **Owner decisions:**
  - ✅ Chọn **Phương án A**: khôi phục riêng `frontend/package.json` + `frontend/package-lock.json` từ HEAD, **chỉ sau khi G1/G2 PASS**.
  - ✅ **Phê duyệt ngoại lệ worktree:** thực hiện trên working tree `main` hiện tại; không commit, không push, không đổi branch. Ngoại lệ **chỉ áp dụng cho FREEZE-003-DEPS**.
  - ✅ Giữ nguyên 4 override hợp lệ và toàn bộ thay đổi Marketplace chưa commit.
  - ✅ Di chuyển 2 file `.bak` ra ngoài repo, bảo toàn SHA-256.
- **Deploy authorized:** No
- **Risk tier:** P2 (cấu hình build frontend; không chạm tiền, quyền, state on-chain, AI, auth)
- **Requested by:** Project Owner (phê duyệt 15/11/2026) · Spec bởi Cowork
- **Assigned role:** Antigravity (engineering)
- **Branch/worktree:** **Ngoại lệ có chủ đích với `.agents/rules/90-git-docs.md`**: làm **trực tiếp trên working tree chính** `D:\Escrow_Marketplace_Demo` (branch `main`), **không commit**.
  - **Lý do:** Lỗi chỉ tồn tại trong working tree chưa commit. Worktree mới tạo từ HEAD `bdb1e13` vốn đã sạch nên không có gì để sửa.
  - Việc commit được tách sang `FREEZE-005-COMMIT`.
  - **Owner đã phê duyệt ngoại lệ này (15/11/2026).**
- **Related decision:** DEC-002 (giữ stack), DEC-012 / OD-10 (freeze 16/11, sửa P1/P2 tới 19/11)

## Context

Kết quả Cowork kiểm tra lại lúc 15/11/2026 14:10 (VN), trạng thái **VERIFIED**:

| File | Trạng thái so với HEAD `bdb1e13` | Kết luận |
|---|---|---|
| `frontend/package.json` | `git diff --ignore-cr-at-eol` chỉ khác **đúng 1 điểm**: thêm dấu `,` sau `"qr": "0.5.5"` và khối `"next": { "postcss": "8.5.32" }` (+3 dòng). Toàn file đang dùng CRLF (HEAD dùng LF) | Thay đổi duy nhất chính là override lỗi. **Không có thay đổi hợp lệ nào khác.** |
| `frontend/package-lock.json` | `git diff --ignore-cr-at-eol` **rỗng**. Khác HEAD chỉ ở CRLF (8 623 dòng) | Nội dung = HEAD. Trạng thái "modified" là nhiễu CRLF |
| `frontend/package.json.20261115-130129.bak` | Nội dung = HEAD (bỏ qua CRLF) | Bản sao an toàn trước Bước 192 |
| `frontend/package-lock.json.20261115-130129.bak` | **Byte-identical** với `package-lock.json` hiện tại (SHA-256 `e1d2febb…1fb65`); nội dung = HEAD | Bản sao an toàn |

**Hệ quả:**
- `npm ls` exit 1: `ELSPROBLEMS invalid: postcss@8.4.31 … "8.5.32" from node_modules/next overridden`.
- `node_modules` hiện tại **đã khớp** lock HEAD (`next/node_modules/postcss@8.4.31`, top-level `postcss@8.5.32`). Không cần cài lại gì.

**Tiền kiểm (INFERRED):** Cowork chạy `npm ls --all` với `package.json` + `package-lock.json` của HEAD và cây `node_modules` hiện tại → **0 lỗi `invalid`**. Chỉ còn cảnh báo `extraneous` do cách liên kết symlink trong môi trường thử. Trên máy thật, kết quả phải được xác nhận bằng AC-03.

**Bốn override hợp lệ phải giữ nguyên:**
```json
"@vanilla-extract/css": "1.21.3",
"ws@8": "8.23.0",
"@wagmi/connectors": { "@walletconnect/ethereum-provider": "2.26.0" },
"qr": "0.5.5"
```

## Goal

1. `frontend/package.json` và `frontend/package-lock.json` có nội dung **giống hệt HEAD** (`git status` không còn liệt kê hai file này).
2. `npm ls` exit 0.
3. Hai file `.bak` được **di chuyển ra ngoài repo** (không xóa), kèm manifest SHA-256.
4. `npm audit --omit=dev` = **22** (13 High, 9 Moderate), không tăng.
5. Test, typecheck và build trên Windows PASS như trước.

## Scope – allowed files/paths

- `frontend/package.json`: chỉ xóa khối `"next": { "postcss": … }` và dấu `,` thừa, hoặc khôi phục từ HEAD sau khi qua Gate G1.
- `frontend/package-lock.json`: chỉ chuẩn hóa line-ending về HEAD sau khi qua Gate G2. **Không thay đổi nội dung.**
- `frontend/package.json.20261115-130129.bak`, `frontend/package-lock.json.20261115-130129.bak`: **di chuyển** ra `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\` (ngoài repo).
- Tạo mới: `docs/agent-ops/reports/FREEZE-003-DEPS-report.md`.
- `docs/agent-ops/MASTER_DISPATCH.md`: chỉ thêm hoặc cập nhật 1 dòng trạng thái cho `FREEZE-003-DEPS`.

## Out of scope – do not edit

- `contracts/**`, `backend/**`, `ai-pipeline/**`.
- `frontend/app/**`, `frontend/components/**`, `frontend/hooks/**`, `frontend/lib/**`, `frontend/test/**`, mọi file cấu hình khác (`next.config.js`, `postcss.config.js`, `tailwind.config.js`, `tsconfig.json`).
- `.env`, `.env.local`, mọi file env/secret (không mở, không in).
- **Cấm:**
  - `npm install`, `npm update`, `npm audit fix`, `npm dedupe`, `npm prune`.
  - Thay đổi phiên bản bất kỳ dependency nào.
  - Thêm hoặc xóa override khác.
  - Nâng Next.js 16 / wagmi 3.
- **Cấm** xóa `node_modules` hoặc chạy `npm ci` trên repo (node_modules hiện đã đúng; cài lại tốn thời gian và phụ thuộc mạng).
- **Cấm** `git add`, `git commit`, `git push`, `git stash`, `git reset`, `git clean`, đổi branch.
- **Cấm** `git checkout -- <path>` cho bất kỳ file nào khác ngoài 2 file trong Scope.
- **Cấm** sửa các file khác đang modified/untracked trong working tree (46 file thay đổi thật của MKT-001..005 phải nguyên vẹn).
- Không thêm `.gitattributes`, không đổi `core.autocrlf` (để task sau).

## Dependencies

- Không phụ thuộc task nào.
- **Chặn:** `FREEZE-005-COMMIT` (P0-02) chỉ bắt đầu sau khi task này ACCEPT.
- Trước khi làm: **dừng mọi tiến trình `next dev` / `next build` / `npm`** đang chạy trong `frontend/`.

## Implementation Steps (PowerShell, chạy tại `D:\Escrow_Marketplace_Demo`)

### Bước 0 — Snapshot & backup (bắt buộc, trước mọi thay đổi)
```powershell
$B = "D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS"
New-Item -ItemType Directory -Force -Path $B | Out-Null
git rev-parse HEAD                                   # phải = bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5
git status --porcelain | Out-File "$B\git-status-before.txt" -Encoding utf8
Copy-Item frontend\package.json      "$B\package.json.before"
Copy-Item frontend\package-lock.json "$B\package-lock.json.before"
Get-FileHash frontend\package.json, frontend\package-lock.json, frontend\*.bak -Algorithm SHA256 |
  Format-Table Hash, Path -AutoSize | Out-File "$B\sha256-before.txt" -Encoding utf8
cd frontend; npm ls 2>&1 | Select-Object -Last 5 | Out-File "$B\npm-ls-before.txt"; cd ..

# Snapshot hash các file logic (cho AC-09). Không đọc nội dung env.
$Roots = "contracts","backend","ai-pipeline","frontend","scripts"
$ExDirs = '\\node_modules\\|\\\.next\\|\\__pycache__\\|\\backend\\data\\|\\contracts\\(out|cache|lib|broadcast)\\'
$ExNames = '^(\.env|\.env\.local|package\.json|package-lock\.json)$|\.tsbuildinfo$|\.bak$'
Get-ChildItem $Roots -Recurse -File |
  Where-Object { $_.FullName -notmatch $ExDirs -and $_.Name -notmatch $ExNames } |
  Get-FileHash -Algorithm SHA256 | Sort-Object Path |
  ForEach-Object { "{0}  {1}" -f $_.Hash.ToLower(), (Resolve-Path -Relative $_.Path) } |
  Out-File "$B\logic-files-before.sha256" -Encoding utf8
(Get-Content "$B\logic-files-before.sha256").Count     # kỳ vọng 137 (khớp baseline Cowork)
Get-FileHash docs\agent-ops\MASTER_DISPATCH.md -Algorithm SHA256 | Out-File "$B\master-dispatch-before.txt" -Encoding utf8
```

### Bước 1 — Gate G1 (`package.json` không có thay đổi hợp lệ nào khác)
```powershell
git diff --ignore-cr-at-eol HEAD -- frontend/package.json
```
- **PASS** nếu diff chỉ gồm đúng 5 dòng thay đổi (1 dòng `-`, 4 dòng `+`): `-    "qr": "0.5.5"` / `+    "qr": "0.5.5",` / `+    "next": {` / `+      "postcss": "8.5.32"` / `+    }`.
- **Khác bất kỳ điều gì → DỪNG, không sửa, báo Owner/Cowork** (trạng thái `BLOCKED`).

### Bước 2 — Gate G2 (`package-lock.json` chỉ khác line-ending)
```powershell
git diff --ignore-cr-at-eol --stat HEAD -- frontend/package-lock.json   # phải RỖNG
(Get-FileHash frontend\package-lock.json).Hash -eq (Get-FileHash frontend\package-lock.json.20261115-130129.bak).Hash   # phải True
```
- Không rỗng hoặc `False` → **DỪNG, `BLOCKED`**.

### Bước 3 — Khôi phục 2 file (chỉ khi G1 và G2 PASS)
- **Phương án A (khuyến nghị):** khôi phục từ HEAD.
  ```powershell
  git checkout HEAD -- frontend/package.json frontend/package-lock.json
  ```
  - Vì sao đây là thay đổi tối thiểu: theo G1/G2, nội dung HEAD = nội dung hiện tại trừ đúng override lỗi.
  - Phương án này còn đưa line-ending về LF như HEAD, nên hai file biến mất khỏi `git status`.
- **Phương án B — KHÔNG được Owner chọn, không thực hiện** (giữ để tham chiếu):
  - Mở `frontend/package.json`, xóa 3 dòng khối `"next"` và dấu `,` sau `"qr": "0.5.5"`. Giữ nguyên mọi dòng khác.
  - Để nguyên `package-lock.json`.
  - Hệ quả: `git status` vẫn báo 2 file modified do CRLF. FREEZE-005 phải xử lý.

### Bước 4 — Cất giữ `.bak` (di chuyển, không xóa)
```powershell
Move-Item frontend\package.json.20261115-130129.bak      "$B\"
Move-Item frontend\package-lock.json.20261115-130129.bak "$B\"
Get-FileHash "$B\*" -Algorithm SHA256 | Format-Table Hash, Path -AutoSize | Out-File "$B\sha256-after-move.txt" -Encoding utf8
```
SHA-256 của 2 file `.bak` sau khi di chuyển phải trùng `sha256-before.txt`.

### Bước 5 — Kiểm chứng
- Chạy lại lệnh hash logic của Bước 0, ghi vào `$B\logic-files-after.sha256`.
- `Compare-Object (Get-Content "$B\logic-files-before.sha256") (Get-Content "$B\logic-files-after.sha256")` phải rỗng.
- `git status --porcelain | Out-File "$B\git-status-after.txt"`.
- Chạy toàn bộ AC-01…AC-09, ghi output vào report.
- Cập nhật `MASTER_DISPATCH.md` **sau cùng** (chỉ 1 dòng), rồi tạo report.

## Acceptance Criteria

| ID | Tiêu chí | Traces | Verification method | Evidence artifact |
|---|---|---|---|---|
| AC-01 | Gate G1 và G2 PASS **trước** khi sửa | Owner yêu cầu "không ghi đè thay đổi hợp lệ" | Output Bước 1–2 | Report §Gates |
| AC-02 | `package.json` không còn override `next.postcss`; **4 override hợp lệ giữ nguyên giá trị** | SEC-02 / P1-03 | `node -e "const o=require('./frontend/package.json').overrides;console.log(JSON.stringify(o))"` phải in **đúng** `{"@vanilla-extract/css":"1.21.3","ws@8":"8.23.0","@wagmi/connectors":{"@walletconnect/ethereum-provider":"2.26.0"},"qr":"0.5.5"}` | Report |
| AC-03 | `npm ls` exit 0, không còn `invalid` / `ELSPROBLEMS` | SEC-02 | `cd frontend; npm ls; echo $LASTEXITCODE` → `0`; `npm ls postcss` → `next/node_modules/postcss@8.4.31` + top-level `postcss@8.5.32` | Report |
| AC-04 | Không có dependency nào đổi phiên bản | DEC-002 | (A) `git diff --ignore-cr-at-eol --stat HEAD -- frontend/package.json frontend/package-lock.json` rỗng · (B) chỉ có diff 4 dòng override | Report |
| AC-05 | `npm audit --omit=dev` = 22 tổng (13 High, 9 Moderate, 0 Critical) | SEC-01 | `npm audit --omit=dev --json` → `metadata.vulnerabilities` | Report |
| AC-06 | 2 file `.bak` nằm ở `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\`, SHA-256 không đổi; không còn `*.bak` trong repo | Owner yêu cầu "không mất dữ liệu" | `Get-ChildItem -Recurse -Filter *.bak -Exclude node_modules` (trong repo) → rỗng; so `sha256-before.txt` với `sha256-after-move.txt` | Manifest SHA |
| AC-07 | **Chỉ đúng các thay đổi trong scope**; mọi thay đổi khác bị chặn | Out of scope | So `git status --porcelain` sau task với `git-status-before.txt`. Chỉ cho phép **đúng 5 khác biệt**: (1) biến mất ` M frontend/package.json`; (2) biến mất ` M frontend/package-lock.json`; (3) biến mất `?? frontend/package.json.20261115-130129.bak` và `?? frontend/package-lock.json.20261115-130129.bak`; (4) xuất hiện `?? docs/agent-ops/reports/FREEZE-003-DEPS-report.md`; (5) xuất hiện ` M docs/agent-ops/MASTER_DISPATCH.md`, và `git diff --ignore-cr-at-eol -- docs/agent-ops/MASTER_DISPATCH.md` chỉ thêm hoặc sửa **dòng của FREEZE-003-DEPS**. Bất kỳ khác biệt nào khác ⇒ **FAIL** | Diff 2 file status + diff MASTER_DISPATCH |
| AC-08 | Regression frontend PASS | TEST_MATRIX frontend | `npm test` → 61 pass / 0 fail / 0 skipped · `npx tsc --noEmit` exit 0 · `npm run build` exit 0 | Log tóm tắt |
| AC-09 | **Không thay đổi logic.** Mọi file logic giữ nguyên SHA-256 | Out of scope | (1) Chạy lại lệnh hash ở Bước 0 → `logic-files-after.sha256`; `Compare-Object` với `logic-files-before.sha256` phải **rỗng**. (2) Cowork đối chiếu độc lập với **baseline Cowork** (§Cowork baseline): 137 file, SHA-256 của manifest `59d2a607…75edb`. (3) `git diff --ignore-cr-at-eol --stat -- contracts backend ai-pipeline frontend/app frontend/components frontend/hooks frontend/lib frontend/test` = `33 files changed, 3528 insertions(+), 759 deletions(-)` | `logic-files-before/after.sha256` + output Compare-Object |

## Test Requirements

- **TEST_MATRIX rows applied:** Frontend (unit/security tests, typecheck, production build). Contract/Backend: chạy làm regression xác nhận "không đụng".
- **Skip policy:** `.agents/rules/80-testing.md`. Frontend phải 0 skipped.
- **Unit:** `cd frontend; npm test`.
- **Integration / Build:** `npx tsc --noEmit`; `npm run build` (trên Windows; đây cũng là bằng chứng còn thiếu ở audit: "build trên máy Owner").
- **Regression (khuyến nghị, không bắt buộc vì không đụng file):** `cd contracts; forge test` (81/81); `.\.venv\Scripts\python.exe -m pytest -rs` (185 passed khi có Anvil). Nếu không chạy thì ghi `NOT RUN – out of touched scope`.
- **Security review required?** No. Không chạm `contracts/src/**`, `backend/*.py`, `frontend/app/api/**` hay env. Cowork vẫn Re-QA đầy đủ.

## Rollback Plan

- **Rollback toàn bộ (≤ 1 phút):**
  ```powershell
  $B = "D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS"
  Copy-Item "$B\package.json.before"      frontend\package.json      -Force
  Copy-Item "$B\package-lock.json.before" frontend\package-lock.json -Force
  Move-Item "$B\package.json.20261115-130129.bak"      frontend\
  Move-Item "$B\package-lock.json.20261115-130129.bak" frontend\
  ```
  Sau đó so SHA-256 với `sha256-before.txt`. Phải trùng 100%.
- **Khi nào rollback:** AC-03, AC-05 hoặc AC-08 FAIL; hoặc AC-07 phát hiện file ngoài scope bị đổi.
- `node_modules` không bị chạm nên không cần khôi phục.
- **Không** dùng `git stash` / `git reset` để rollback (sẽ ảnh hưởng 46 file MKT chưa commit).

## Implementation constraints

- Đọc `.agents/AGENTS.md`, `.agents/rules/80-testing.md`, `.agents/rules/90-git-docs.md` trước khi làm.
- Tuyệt đối không mở, in hay chụp nội dung `backend/.env`, `frontend/.env.local`.
- Không deploy, không giao dịch on-chain (DEC-003).
- Gặp bất kỳ sai khác nào so với mô tả Context → dừng, đặt `BLOCKED`, báo cáo. Không tự ứng biến.

## Deliverables

- **Files changed:**

| File | Hành động | Scope |
|---|---|---|
| `frontend/package.json` | Khôi phục HEAD (A) / xóa khối override (B) | SEC-02 |
| `frontend/package-lock.json` | Khôi phục HEAD, line-ending only (A) / không đổi (B) | P2-04 |
| `frontend/*.bak` (2 file) | Di chuyển ra `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\` | Cất giữ dữ liệu |
| `docs/agent-ops/reports/FREEZE-003-DEPS-report.md` | Tạo mới | Báo cáo |
| `docs/agent-ops/MASTER_DISPATCH.md` | 1 dòng trạng thái | Tracking |

- **Diff/commit:** Không commit. Đính kèm output `git diff --ignore-cr-at-eol HEAD -- frontend/package.json` trước và sau.
- **Tests run:** lệnh + tóm tắt passed/failed/skipped cho AC-03, AC-05, AC-08.
- **Known violations touched:** SEC-02 (audit P1-03), SE-08 (CRLF, một phần), SE-04 (không đổi).
- **Docs cần sync:** Không (RISK_REGISTER cập nhật ở `DOC-SYNC-FINAL`).
- **Known limitations:** 22 lỗ hổng npm vẫn còn (chấp nhận theo audit §4.2, xử lý tài liệu ở FREEZE-004).
- **Docs/status updated:** `MASTER_DISPATCH.md` → `IN_REVIEW`.

## Cowork baseline (chụp độc lập trước khi giao task — 15/11/2026 14:16 VN, HEAD `bdb1e13`)

- **Logic manifest:** 137 file trong `contracts backend ai-pipeline frontend scripts`. Loại trừ: `node_modules`, `.next`, `__pycache__`, `backend/data`, `contracts/{out,cache,lib,broadcast}`, `.env`, `.env.local`, `package.json`, `package-lock.json`, `*.tsbuildinfo`, `*.bak`. SHA-256 của manifest (định dạng `sha256sum`, đường dẫn tương đối, sort): `59d2a607f3361369f351cfbd9d6e5915e6a0632860acd105d84b1f50fb775edb`. Cowork giữ bản đầy đủ.
- **`git status --porcelain`:** 47 `M` + 38 `??` (đã gồm spec này và báo cáo audit).
- **`git diff --ignore-cr-at-eol --stat` (thư mục logic):** 33 files, +3 528 / −759.
- **`docs/agent-ops/MASTER_DISPATCH.md`** SHA-256: `d53e18af98f3c18c602449164a2313d7ec8c0bff47d360e950f5432066bff06f`.
- **Trạng thái kỳ vọng sau task (A):** 46 `M` (−2 package, +1 MASTER_DISPATCH) + 37 `??` (−2 `.bak`, +1 report).

## Cowork Re-QA (độc lập, sau khi Antigravity báo xong)

Cowork **không dùng** output trong report làm bằng chứng. Cowork tự chạy lại:
1. `git rev-parse HEAD` = `bdb1e13…`. Đối chiếu `git status --porcelain` với snapshot `git-status-before.txt` (AC-07).
2. `git diff --ignore-cr-at-eol --stat HEAD -- frontend/package*.json` (AC-04). In `overrides` (AC-02).
3. `npm ls` exit code (AC-03); `npm audit --omit=dev --json` (AC-05).
4. Kiểm tra thư mục backup + so SHA-256 (AC-06); tìm `*.bak` trong repo.
5. `npm test`, `npx tsc --noEmit`, `next build` (AC-08).
6. Tính lại manifest logic theo đúng quy tắc §Cowork baseline, `diff` với baseline Cowork (137 file) và đối chiếu chéo với `logic-files-before/after.sha256` của Antigravity. Chạy lại `git diff --ignore-cr-at-eol --stat` thư mục logic: phải = 33 files, +3 528 / −759 (AC-09).
7. `git diff --ignore-cr-at-eol -- docs/agent-ops/MASTER_DISPATCH.md`: chỉ dòng FREEZE-003-DEPS (AC-07). Đọc report để đối chiếu, **không** dùng làm bằng chứng.

Kết luận theo `docs/agent-ops/QA_REVIEW_PROMPT.md`: **PASS** chỉ khi AC-01…AC-09 đều đạt; còn lại là CHANGES_REQUESTED / BLOCKED. Owner quyết định Freeze.

## Review outcome

- **Reviewer:** Cowork (`.agents/skills/qa-review/SKILL.md`)
- **Result:** _(chờ)_
- **Commands rerun by reviewer:** _(chờ)_
- **Findings:** _(chờ)_
- **Owner approval (Spec):** ✅ 15/11/2026 14:16 · Phương án Bước 3: ☑ **A** ☐ B · Ngoại lệ worktree: ☑ **Đã phê duyệt** (chỉ cho FREEZE-003-DEPS)
- **Owner approval (Freeze):** _(chờ Re-QA)_
