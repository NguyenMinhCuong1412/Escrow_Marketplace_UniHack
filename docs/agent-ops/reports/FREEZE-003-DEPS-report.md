# Implementation Report — FREEZE-003-DEPS

- **Task ID:** `FREEZE-003-DEPS`
- **Title:** Hoàn tất rollback PostCSS override lỗi, chuẩn hóa `package*.json`, cất giữ an toàn 2 file `.bak`
- **Task Spec:** [`docs/agent-ops/FREEZE-003-DEPS-TASK.md`](file:///D:/Escrow_Marketplace_Demo/docs/agent-ops/FREEZE-003-DEPS-TASK.md)
- **Status:** **`IN_REVIEW`** *(Chờ Cowork Re-QA độc lập xác nhận `AC-01`..`AC-09`; không tự kết luận PASS)*
- **Workspace / Branch / Baseline HEAD:** `D:\Escrow_Marketplace_Demo` · branch `main` *(ngoại lệ worktree đã được Project Owner phê duyệt ngày 15/11/2026 riêng cho `FREEZE-003-DEPS`)* · `HEAD = bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5`
- **Phương án thực thi đã duyệt:** Phương án **A** (`git checkout HEAD -- frontend/package.json frontend/package-lock.json` sau khi G1/G2 đạt)
- **Deploy / Commit / Install:** Không commit, không push, không đổi branch, không deploy, không chạy `npm install`/`update`/`audit fix`/`ci`/`dedupe`/`prune`, không mở hay in `.env` / `.env.local`.

---

## 1. Bước 0 — Pre-flight, Snapshot & Thư mục Backup

- **Kiểm tra tiến trình nền trong `frontend/`:** Đã kiểm tra `Win32_Process` (`node`/`npm`/`next`) trước khi thực hiện — chỉ có tiến trình `desktop-commander`, **không có** `next dev`, `next build`, hay `npm` nào đang chạy trong `frontend/`.
- **Thư mục backup ngoài repo:** `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\` *(tạo mới, trước đó chưa tồn tại)*.
- **Danh sách snapshot lưu trước khi sửa:**
  - `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\git-status-before.txt` (`git status --porcelain`)
  - `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\git-status-uall-before.txt` (`git status --porcelain=v1 -uall`)
  - `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\package.json.before`
  - `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\package-lock.json.before`
  - `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\sha256-before.txt` & `sha256-before-full.txt`
  - `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\npm-ls-before.txt` & `npm-ls-postcss-before.txt`
  - `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\logic-files-before.sha256` (`137` files; normalized Python manifest SHA-256 = `59d2a607f3361369f351cfbd9d6e5915e6a0632860acd105d84b1f50fb775edb`)
  - `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\master-dispatch-before.txt` (`D53E18AF98F3C18C602449164A2313D7EC8C0BFF47D360E950F5432066BFF06F`)

### Manifest SHA-256 trước và sau di chuyển (AC-06)

| Tệp | SHA-256 Trước (trong `frontend/`) | SHA-256 Sau (trong `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\`) | Đối chiếu |
|---|---|---|---|
| `package.json.before` (`package.json` trước sửa) | `0a4e0753e0513d15d90f55df659ab099d2d112997927d5c1a148dccbac8095ef` | `0a4e0753e0513d15d90f55df659ab099d2d112997927d5c1a148dccbac8095ef` | Khớp 100% |
| `package-lock.json.before` | `e1d2febb15c76b5706c63791831ca5597d4e16ec4bd902679151f9c82c31fb65` | `e1d2febb15c76b5706c63791831ca5597d4e16ec4bd902679151f9c82c31fb65` | Khớp 100% |
| `package.json.20261115-130129.bak` | `26897c54eafaa5ba953eb4797118d8ff567a948daa152fbbde7226bf4338407c` | `26897c54eafaa5ba953eb4797118d8ff567a948daa152fbbde7226bf4338407c` | Khớp 100% |
| `package-lock.json.20261115-130129.bak` | `e1d2febb15c76b5706c63791831ca5597d4e16ec4bd902679151f9c82c31fb65` | `e1d2febb15c76b5706c63791831ca5597d4e16ec4bd902679151f9c82c31fb65` | Khớp 100% |

- Kiểm tra `Get-ChildItem -Recurse -Filter *.bak | Where-Object { $_.FullName -notmatch '\\node_modules\\' }` trong `D:\Escrow_Marketplace_Demo`: `REPO_BAK_COUNT=0` (không còn file `.bak` trong repo).

---

## 2. Gates (G1 & G2) trước khi sửa (AC-01)

### Gate G1 — `git diff --ignore-cr-at-eol HEAD -- frontend/package.json`
```diff
diff --git a/frontend/package.json b/frontend/package.json
index 5b81e57..599900a 100644
--- a/frontend/package.json
+++ b/frontend/package.json
@@ -37,6 +37,9 @@
     "@wagmi/connectors": {
       "@walletconnect/ethereum-provider": "2.26.0"
     },
-    "qr": "0.5.5"
+    "qr": "0.5.5",
+    "next": {
+      "postcss": "8.5.32"
+    }
   }
 }
```
- **Quan sát:** Khớp chính xác 5 dòng thay đổi (1 dòng `-`, 4 dòng `+`) mô tả trong Spec (`G1` đạt điều kiện chạy Phương án A).

### Gate G2 — `frontend/package-lock.json`
- Lệnh: `git diff --ignore-cr-at-eol --stat HEAD -- frontend/package-lock.json` → **Rỗng** (`G2_STAT=[]`).
- So sánh SHA-256:
  - `frontend\package-lock.json`: `E1D2FEBB15C76B5706C63791831CA5597D4E16EC4BD902679151F9C82C31FB65`
  - `frontend\package-lock.json.20261115-130129.bak`: `E1D2FEBB15C76B5706C63791831CA5597D4E16EC4BD902679151F9C82C31FB65`
  - Kết quả `(Hash -eq Hash)`: **`True`** (`G2` đạt điều kiện).

---

## 3. Khôi phục `package*.json`, Overrides & Cây Dependencies (AC-02, AC-03, AC-04, AC-05)

### Bước 3A — Khôi phục từ `HEAD` & đối chiếu diff sau sửa
- Đã thực thi: `git checkout HEAD -- frontend/package.json frontend/package-lock.json` (`CHECKOUT_EXIT=0`).
- `git diff --ignore-cr-at-eol HEAD -- frontend/package.json`: **Rỗng**.
- `git diff --ignore-cr-at-eol --stat HEAD -- frontend/package.json frontend/package-lock.json`: **Rỗng**.

### `overrides` sau sửa (AC-02)
Lệnh: `node -e "const o=require('./frontend/package.json').overrides;console.log(JSON.stringify(o))"`
```json
{"@vanilla-extract/css":"1.21.3","ws@8":"8.23.0","@wagmi/connectors":{"@walletconnect/ethereum-provider":"2.26.0"},"qr":"0.5.5"}
```

### `npm ls` trước & sau sửa (AC-03)
- **Trước sửa (trong `frontend/`):** `npm ls postcss` exit **`1`** (`npm error code ELSPROBLEMS` / `next@15.5.29 -> postcss@8.4.31 invalid: "8.5.32" from node_modules/next`).
- **Sau sửa (trong `frontend/`):**
  - `npm ls`: **`NPM_LS_EXIT=0`** (không còn lỗi).
  - `npm ls --all`: **`NPM_LS_ALL_EXIT=0`** (không còn lỗi `ELSPROBLEMS` / `invalid` ở mọi tầng cây phụ thuộc).
  - `npm ls postcss`: **`NPM_LS_POSTCSS_EXIT=0`**
    ```text
    collectible-escrow-frontend@0.1.0 D:\Escrow_Marketplace_Demo\frontend
    +-- autoprefixer@10.6.2
    | `-- postcss@8.5.32 deduped
    +-- next@15.5.29
    | `-- postcss@8.4.31
    +-- postcss@8.5.32
    `-- tailwindcss@3.4.19
      +-- postcss-import@15.1.0
      | `-- postcss@8.5.32 deduped
      +-- postcss-js@4.1.0
      | `-- postcss@8.5.32 deduped
      +-- postcss-load-config@6.0.1
      | `-- postcss@8.5.32 deduped
      +-- postcss-nested@6.2.0
      | `-- postcss@8.5.32 deduped
      `-- postcss@8.5.32 deduped
    ```

### `npm audit --omit=dev --json` (AC-05)
- Chạy tại `D:\Escrow_Marketplace_Demo\frontend`: `NPM_AUDIT_EXIT=1`
- `metadata.vulnerabilities`:
  ```json
  {"info":0,"low":0,"moderate":9,"high":13,"critical":0,"total":22}
  ```
  *(Tổng `22` lỗ hổng: `13` High, `9` Moderate, `0` Critical — không tăng so với baseline).*

---

## 4. Kiểm thử hồi quy Frontend & Logic Invariance (AC-08, AC-09)

Thực thi sau khi hoàn tất Bước 3A và Bước 4 tại `D:\Escrow_Marketplace_Demo\frontend` (Windows):

| Suite / Lệnh | Exit code | Tóm tắt kết quả thực tế |
|---|---|---|
| `npx tsc --noEmit` | `0` | Không có lỗi TypeScript. |
| `npm test` (`node --test test/*.test.cjs`) | `0` | **`61 tests, 0 suites, 61 pass, 0 fail, 0 cancelled, 0 skipped`** (`duration_ms: 4667.7942`). |
| `npm run build` (`next build`) | `0` | `Compiled successfully in 5.3s`, type & lint validity đạt, tạo `10/10` static pages & `27` routes App Router. |
| Contracts (`forge test`) / Backend (`pytest -rs`) | — | **`NOT RUN – out of touched scope`** (không sửa `contracts/`, `backend/`, `ai-pipeline/`). |

### Kiểm chứng bất biến logic (`AC-09`)
- **Snapshot `Compare-Object` (Bước 5):**
  - `LOGIC_FILES_BEFORE_COUNT=137`
  - `LOGIC_FILES_AFTER_COUNT=137`
  - `Compare-Object (Get-Content "$B\logic-files-before.sha256") (Get-Content "$B\logic-files-after.sha256")`: **Rỗng (`COMPARE_OBJECT_COUNT=0`)**.
- **Normalized manifest SHA-256 (khớp quy tắc Cowork baseline):**
  - Trước & Sau đều cho `FILES=137`, SHA-256 = `59d2a607f3361369f351cfbd9d6e5915e6a0632860acd105d84b1f50fb775edb`.
- **`git diff --ignore-cr-at-eol --stat -- contracts backend ai-pipeline frontend/app frontend/components frontend/hooks frontend/lib frontend/test`:**
  - `33 files changed, 3528 insertions(+), 759 deletions(-)` (giữ nguyên trước và sau task).

---

## 5. Kiểm kê Git Status Trước / Sau & Scope Audit (AC-07)

Tuân thủ yêu cầu bổ sung: **không dựa vào tổng số `46 M + 37 ??`**, lưu đầy đủ `git status --porcelain=v1 -uall` trước và sau triển khai để đối chiếu chính xác **từng đường dẫn và trạng thái**.

- **Lưu ý môi trường Windows (`core.autocrlf=true` tại `C:/Program Files/Git/etc/gitconfig`):** Trên Windows Git, `frontend/package-lock.json` (`i/lf w/crlf`) đã ở trạng thái clean trước task (không xuất hiện dòng ` M frontend/package-lock.json` trong `git-status-uall-before.txt`), trong khi trên môi trường Linux (`core.autocrlf=false`) tệp này từng hiện ` M` do CRLF (và Spec giữ nguyên lệnh không đổi `core.autocrlf`). Việc khôi phục qua `git checkout HEAD -- frontend/package.json frontend/package-lock.json` bảo đảm `git diff --ignore-cr-at-eol --stat HEAD -- frontend/package*.json` **rỗng hoàn toàn**.

### Đối chiếu từng dòng `git-status-uall-before.txt` vs `git-status-uall-after.txt`
- **Tệp snapshot trước:** `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\git-status-uall-before.txt` (`97` dòng)
- **Tệp snapshot sau:** `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\git-status-uall-after.txt` (`96` dòng)
- **Khác biệt duy nhất giữa hai tập `(Status, Path)`:**
  - **Biến mất (`-`):**
    1. ` M frontend/package.json`
    2. `?? frontend/package-lock.json.20261115-130129.bak`
    3. `?? frontend/package.json.20261115-130129.bak`
  - **Xuất hiện (`+`):**
    1. ` M docs/agent-ops/MASTER_DISPATCH.md`
    2. `?? docs/agent-ops/reports/FREEZE-003-DEPS-report.md`
  - **Mọi đường dẫn còn lại (`94` đường dẫn MKT/report/spec/public images chưa commit):** Trùng khớp 100%, không thêm/bớt/đổi trạng thái bất kỳ tệp nào ngoài scope.

### Diff của `docs/agent-ops/MASTER_DISPATCH.md`
```diff
diff --git a/docs/agent-ops/MASTER_DISPATCH.md b/docs/agent-ops/MASTER_DISPATCH.md
index 375f4a0..838bb4e 100644
--- a/docs/agent-ops/MASTER_DISPATCH.md
+++ b/docs/agent-ops/MASTER_DISPATCH.md
@@ -32,6 +32,7 @@
 | 4F | ESC-090 | `docs/agent-ops/tasks/RULES_UPDATE_TASK_SPEC.md` | `ops/esc-090-rules-update` | `.agents/`, `CLAUDE.md`, `docs/agent-ops/` | — | IN_PROGRESS |
 | 6 | ESC-060 | `docs/agent-ops/tasks/ESC-060.md` | *(read-only)* | READ-ONLY | Owner decisions (Q2, Q3) & ESC-080/090 | BLOCKED |
 | 7 | ESC-070 | `docs/agent-ops/tasks/ESC-070.md` | `phase/7-submit` | `README.md`, docs | Phase 6 | BLOCKED |
+| Freeze | FREEZE-003-DEPS | `docs/agent-ops/FREEZE-003-DEPS-TASK.md` | `main` *(Owner worktree exception)* | `frontend/package*.json`, `.bak` | — | IN_REVIEW |

 ---
```
- `git diff --check -- docs/agent-ops/MASTER_DISPATCH.md` exit `0`.

---

## 6. Deliverables & Tổng kết bàn giao cho Cowork Re-QA

- **Files changed:**
  - [`frontend/package.json`](file:///D:/Escrow_Marketplace_Demo/frontend/package.json): Khôi phục từ `HEAD` (loại bỏ khối `"next": { "postcss": "8.5.32" }` và dấu `,` thừa; giữ nguyên 4 override hợp lệ).
  - [`frontend/package-lock.json`](file:///D:/Escrow_Marketplace_Demo/frontend/package-lock.json): Khôi phục từ `HEAD` (nội dung không đổi so với `HEAD`).
  - `frontend/package.json.20261115-130129.bak`, `frontend/package-lock.json.20261115-130129.bak`: Đã di chuyển ra `D:\Escrow_Marketplace_Backups\FREEZE-003-DEPS\` với SHA-256 nguyên vẹn.
  - [`docs/agent-ops/MASTER_DISPATCH.md`](file:///D:/Escrow_Marketplace_Demo/docs/agent-ops/MASTER_DISPATCH.md): Thêm 1 dòng trạng thái `FREEZE-003-DEPS` (`IN_REVIEW`).
  - [`docs/agent-ops/reports/FREEZE-003-DEPS-report.md`](file:///D:/Escrow_Marketplace_Demo/docs/agent-ops/reports/FREEZE-003-DEPS-report.md): Báo cáo triển khai hiện tại.
- **Known violations touched:** `SEC-02` (rollback override `next.postcss`), `SE-08` (CRLF trên `package*.json`), `SE-04` (không đổi).
- **Docs cần sync:** Không (theo Spec §Deliverables; `RISK_REGISTER.md` cập nhật tại `DOC-SYNC-FINAL`).
- **Known limitations:** `22` lỗ hổng production (`13` High, `9` Moderate, `0` Critical) vẫn giữ nguyên trong phạm vi `FREEZE-003-DEPS` (xử lý tài liệu ở `FREEZE-004`). Ngoài ra, trên Windows `core.autocrlf=true`, `git checkout HEAD` xuất CRLF ra working tree nhưng `git diff --ignore-cr-at-eol HEAD -- frontend/package*.json` vẫn rỗng.
- **Trạng thái hiện tại:** **`IN_REVIEW`** — chuyển **Cowork Re-QA** kiểm tra độc lập toàn bộ `AC-01`..`AC-09`.
