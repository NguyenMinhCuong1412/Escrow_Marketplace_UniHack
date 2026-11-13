# Task Report — ESC-100: Tách màn xác thực thành 2 trang nhỏ theo style "Quiet Fintech"

## 1. Metadata

- **Task ID:** `ESC-100`
- **Title:** Tách màn xác thực thành 2 trang nhỏ theo style "Quiet Fintech", bỏ các dấu hiệu UI sinh tự động
- **Status:** `IN_REVIEW`
- **Assigned role:** Frontend Engineer (Antigravity)
- **Branch:** `ui/esc-100-auth-two-pages`
- **Date:** 2026-11-13
- **Owner Decisions Applied:**
  - **D1 (Theme):** `CONFIRMED` — Light cho màn Auth (`data-auth-theme="light"`), khai báo đầy đủ CSS variables Light & Dark tại `frontend/app/globals.css`.
  - **D2 (Mascot/Minh hoạ):** `CONFIRMED` — Không sử dụng mascot hoặc hình minh hoạ bên thứ ba; chỉ dùng typography sạch theo phong cách Quiet Fintech.

---

## 2. Danh Sách Đường Dẫn Trong Scope (Xác định ở bước Discovery & Đã Thực Hiện)

| # | File | Phạm vi theo Task Spec | Hành động | Mô tả thay đổi |
|---|---|---|---|---|
| 1 | `frontend/app/auth/page.tsx` | Scope #1: Page/route auth hiện tại | Sửa | Thiết kế lại **Trang 1 — Kết nối** theo Quiet Fintech (1 cột `max-w-[420px]`, mark phẳng `E`, 1 badge mạng `Fuji Testnet`, tiêu đề 2 dòng với dòng 2 màu nhấn `--accent`, 1 nút chính `Kết nối ví`, link sang `/auth/local`, ghi chú chân thực ở footer, và hiển thị trạng thái đã kết nối kèm địa chỉ ví monospace). |
| 2 | `frontend/app/auth/local/page.tsx` | Scope #2: Route mới cho Trang 2 | Tạo mới | Xây dựng **Trang 2 — Ví trên trình duyệt** (`/auth/local`) với nút `← Quay lại`, tiêu đề 2 dòng, hệ thống tabs gạch chân (`Tạo ví`, `Mở khóa`, `Khôi phục`) chuẩn `role="tablist"` / `aria-selected`, ẩn tab `Mở khóa` khi chưa có keystore và tự chọn làm mặc định khi có keystore, dùng nhãn `Tên ví (chỉ lưu trên máy này)`, và đưa thông tin kỹ thuật (`BIP-39`, `AES-256-GCM`) vào thẻ `<details>`. |
| 3 | `frontend/components/ConnectWalletModal.tsx` | Scope #3: Component UI dùng riêng cho auth | Tạo/Sửa | Áp dụng bảng màu Quiet Fintech (`--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent`, `--primary-bg`), loại bỏ hoàn toàn `backdrop-blur`, `shadow-lg`, `shadow-2xl`. |
| 4 | `frontend/components/AuthGuard.tsx` | Scope #3: Component UI dùng riêng cho auth | Tạo/Sửa | Cho phép cả `/auth` và `/auth/local` (`pathname.startsWith('/auth/')`) nằm trong nhóm route xác thực công khai và đồng bộ hydration. |
| 5 | `frontend/app/globals.css` | Scope #4: File CSS global / theme tokens | Sửa | Thêm biến CSS `--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent`, `--primary-bg`, `--primary-fg`, `--font-sans`, `--font-mono` cho cả Light và Dark mà không xoá biến `--background`/`--foreground` đang dùng ở màn khác. |
| 6 | `frontend/next.config.js` | Scope #5: `next.config.*` | Sửa | Thêm duy nhất `devIndicators: false` để ẩn nút "N" của Next.js. |
| 7 | `docs/agent-ops/tasks/ESC-100.md` | Task Spec | Tạo mới | Lưu Task Specification kèm quyết định D1, D2 của Owner. |
| 8 | `docs/agent-ops/reports/ESC-100-report.md` | Scope #6: Task Report | Tạo mới | Báo cáo nghiệm thu task `ESC-100`. |

> **Ghi chú về Font:** Dự án không cài thêm package mới; sử dụng khai báo `--font-sans: "Geist", "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` và `--font-mono: "Geist Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` trong `frontend/app/globals.css`.

---

## 3. Kết Quả Nghiệm Thu Acceptance Criteria (AC-01 .. AC-12)

| ID | Tiêu chí | Phương pháp kiểm tra | Trạng thái | Bằng chứng (Evidence) |
|---|---|---|---|---|
| **AC-01** | Có đúng 2 trang auth; Trang 1 có 1 nút chính "Kết nối ví" và link sang Trang 2; Trang 2 có nút quay lại | Chạy app tại `http://localhost:3006/auth` & `/auth/local`, thao tác thủ công trên trình duyệt | **PASS** | Trang 1 (`/auth`) hiển thị nút `Kết nối ví` và link `Tạo ví ngay trên trình duyệt →` dẫn tới `/auth/local`. Trang 2 (`/auth/local`) có link `← Quay lại` về `/auth`. Xem ảnh chụp `step_4_shot_1.png` và `step_8_shot_1.png`. |
| **AC-02** | Kết nối ví (Core hoặc MetaMask trên Fuji) vẫn hoạt động như trước | Thao tác kết nối ví và kiểm tra hiển thị địa chỉ trên `/auth` | **PASS** | Sau khi kết nối ví, `/auth` hiển thị khung thông tin phẳng gồm `Địa chỉ ví` (`0x2735d1...2D1CD5` dạng monospace), `Phương thức`, `Mạng: Avalanche Fuji (43113)` và nút `Vào sàn giao dịch →`. Xem ảnh `step_20_shot_1.png`. |
| **AC-03** | Tạo ví → khoá → mở khóa → khôi phục vẫn hoạt động; tab "Mở khóa" ẩn khi chưa có keystore, là tab mặc định khi có | Thao tác thực tế với ví test trên `/auth/local` | **PASS** | 1) Khi chưa có keystore: `role="tablist"` chỉ có 2 tab (`Tạo ví`, `Khôi phục`), tab `Mở khóa` ẩn hoàn toàn (`step_8_shot_1.png`).<br>2) Tạo ví mới (`Ví cá nhân`) → kích hoạt → tab `Mở khóa` xuất hiện và được chọn (`step_12_shot_1.png`).<br>3) Bấm `Khóa ví ngay` và tải lại trang `/auth/local` → tab `Mở khóa` tự động là tab mặc định (`aria-selected="true"`, `step_14_shot_1.png`).<br>4) Nhập mật khẩu mở khóa thành công.<br>5) Sang tab `Khôi phục`, nhập lại 12 từ vừa tạo → khôi phục đúng địa chỉ `0x2735d1...2D1CD5` (`step_18_shot_1.png`). |
| **AC-04** | Không còn gradient/glow/blur trong component auth | Chạy grep kiểm tra mẫu `gradient\|blur\|drop-shadow\|shadow-(lg\|xl\|2xl)\|glow` trên các file auth | **PASS** | Kết quả grep bằng 0 dòng khớp (xem mục 4.2 bên dưới). |
| **AC-05** | Không còn chuỗi "Lựa chọn 1", "Lựa chọn 2", "AI ATTESTED", "Khuyên dùng" ở bề mặt auth; "AES-256-GCM"/"BIP-39" chỉ nằm trong `<details>` | Chạy grep kiểm tra chuỗi trong các file auth | **PASS** | Không còn `"Lựa chọn 1"`, `"Lựa chọn 2"`, `"AI ATTESTED"`, `"Khuyên dùng"`. Chuỗi `"BIP-39"` và `"AES-256-GCM"` chỉ xuất hiện duy nhất tại dòng 662 của `frontend/app/auth/local/page.tsx` bên trong thẻ `<details>` (xem mục 4.3). |
| **AC-06** | Không còn dev indicator Next.js | Cấu hình `devIndicators: false` trong `frontend/next.config.js` và chụp toàn trang | **PASS** | Đã thêm `devIndicators: false`; ảnh chụp toàn trang không còn nút "N" ở góc dưới. |
| **AC-07** | Không còn caret/badge lệch ở tiêu đề | Đối chiếu ảnh chụp trước và sau | **PASS** | Tiêu đề 2 dòng căn trái sạch sẽ, chỉ có duy nhất 1 badge trạng thái mạng `● Fuji Testnet` nằm thẳng hàng trên thanh header. |
| **AC-08** | Copy không khẳng định nội dung Q2/Q3 (vd "tiền hàng được giữ", "không cần người phân xử") | Kiểm tra toàn bộ câu chữ trong `frontend/app/auth/page.tsx` và `frontend/app/auth/local/page.tsx` | **PASS** | Copy chỉ ghi ngắn gọn: `"Mua bán đồ sưu tầm. / Kiểm hàng bằng AI."` và ghi chú bảo mật khóa cá nhân; hoàn toàn không khẳng định Q2 hay Q3. |
| **AC-09** | Responsive: hiển thị đúng ở 375px và 1280px, không cuộn ngang | Kiểm tra trên trình duyệt ở viewport `375x812` và `1280x800` | **PASS** | Cả hai độ phân giải `375px` (`step_6_shot_1.png`) và `1280px` (`step_4_shot_1.png`) đều hiển thị gọn trong khung nhìn, `scrollWidth <= clientWidth` (không có cuộn ngang). |
| **AC-10** | Bàn phím: Tab qua được tabs/input/nút; focus ring nhìn thấy; tabs có `role="tablist"`/`aria-selected` | Kiểm tra mã nguồn & thuộc tính ARIA trên DOM | **PASS** | Mọi tab, input, link và button đều có `focus-visible:ring-2 focus-visible:ring-[var(--accent)]`; thanh tab dùng `role="tablist"`, từng tab dùng `role="tab"` và `aria-selected={isSelected}` kèm `aria-controls` khớp với `role="tabpanel"` (xem mục 4.4). |
| **AC-11** | Build sạch | Chạy `npx tsc --noEmit` và `npm run build` trong `frontend/` | **PASS** | Build thành công với mã thoát `0`, tạo tĩnh cả `/auth` và `/auth/local` (xem mục 4.5). |
| **AC-12** | Chỉ file trong Scope bị đổi | Chạy `git diff --name-only main...HEAD` và kiểm tra các thư mục ngoài scope | **PASS** | Chỉ các file trong scope của `ESC-100` nằm trong commit trên nhánh `ui/esc-100-auth-two-pages`; `git diff --name-only main...HEAD -- backend contracts ai-pipeline scripts docs/context docs/specs README.md` hoàn toàn rỗng (xem mục 4.6). |

---

## 4. Bằng Chứng Dòng Lệnh & Trích Đoạn Code

### 4.1. Ảnh chụp trước / sau (Screenshots)

- **Trước khi sửa (`ESC-100`):** `C:/Users/OS/.gemini/antigravity/brain/f007ab28-dd07-4e38-87d8-4962851a5716/.user_uploaded/media_1794579489068_262cfa91.jpg` (1 trang chứa nhiều card lồng nhau, gradient/glow, thứ tự Lựa chọn 2 trên Lựa chọn 1).
- **Sau khi sửa (`ESC-100` Quiet Fintech):**
  - Trang 1 (`/auth` ở `1280px`): `C:/Users/OS/.gemini/antigravity/brain/1f9920f2-60c5-498c-86cf-1e27eca83a89/browser_sandbox/screenshots/step_4_shot_1.png`
  - Trang 1 (`/auth` ở `375px` mobile): `C:/Users/OS/.gemini/antigravity/brain/1f9920f2-60c5-498c-86cf-1e27eca83a89/browser_sandbox/screenshots/step_6_shot_1.png`
  - Trang 2 (`/auth/local` khi chưa có keystore — ẩn tab `Mở khóa`, mở `<details>`): `C:/Users/OS/.gemini/antigravity/brain/1f9920f2-60c5-498c-86cf-1e27eca83a89/browser_sandbox/screenshots/step_8_shot_1.png`
  - Trang 2 (`/auth/local` sau khi tạo ví & mở khóa): `C:/Users/OS/.gemini/antigravity/brain/1f9920f2-60c5-498c-86cf-1e27eca83a89/browser_sandbox/screenshots/step_12_shot_1.png`
  - Trang 2 (`/auth/local` sau khi khóa ví & reload — tab `Mở khóa` là mặc định): `C:/Users/OS/.gemini/antigravity/brain/1f9920f2-60c5-498c-86cf-1e27eca83a89/browser_sandbox/screenshots/step_14_shot_1.png`
  - Trang 2 (`/auth/local` sau khi khôi phục bằng 12 từ): `C:/Users/OS/.gemini/antigravity/brain/1f9920f2-60c5-498c-86cf-1e27eca83a89/browser_sandbox/screenshots/step_18_shot_1.png`
  - Trang 1 (`/auth` khi đã kết nối ví, hiện địa chỉ monospace): `C:/Users/OS/.gemini/antigravity/brain/1f9920f2-60c5-498c-86cf-1e27eca83a89/browser_sandbox/screenshots/step_20_shot_1.png`

### 4.2. Output AC-04 (Kiểm tra không còn gradient/glow/blur/shadow trang trí)

```text
$ Select-String -Path "frontend/app/auth/page.tsx","frontend/app/auth/local/page.tsx","frontend/components/ConnectWalletModal.tsx" -Pattern "gradient|blur|drop-shadow|shadow-(lg|xl|2xl)|glow"
(rỗng - 0 dòng khớp)
```

### 4.3. Output AC-05 (Kiểm tra không còn jargon ở bề mặt; BIP-39 / AES-256-GCM chỉ nằm trong `<details>`)

```text
$ Select-String -Path "frontend/app/auth/page.tsx","frontend/app/auth/local/page.tsx","frontend/components/ConnectWalletModal.tsx" -Pattern "Lựa chọn 1|Lựa chọn 2|AI ATTESTED|Khuyên dùng|AES-256-GCM|BIP-39"

frontend\app\auth\local\page.tsx:662:              Cụm từ khôi phục sinh theo chuẩn BIP-39; dữ liệu khóa được mã hoá cục bộ bằng AES-256-GCM (dẫn xuất khoá PBKDF2 100.000 vòng lặp SHA-256).
```

### 4.4. Trích đoạn code AC-10 (Accessibility `role="tablist"`, `aria-selected`, Focus Ring)

Từ `frontend/app/auth/local/page.tsx`:

```tsx
<div
  role="tablist"
  aria-label="Tùy chọn ví trên trình duyệt"
  className="flex items-center gap-6 border-b border-[var(--border)]"
>
  {visibleTabs.map((tab) => {
    const isSelected = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        id={`tab-${tab.id}`}
        role="tab"
        type="button"
        aria-selected={isSelected}
        aria-controls={`panel-${tab.id}`}
        onClick={() => handleSelectTab(tab.id)}
        className={`pb-2.5 text-sm font-semibold border-b-2 -mb-[1px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-t ${
          isSelected
            ? 'border-[var(--accent)] text-[var(--text)]'
            : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
        }`}
      >
        {tab.label}
      </button>
    );
  })}
</div>
```

### 4.5. Output AC-11 (`npx tsc --noEmit` & `npm run build` & `npm test`)

```text
$ npx tsc --noEmit
(0 errors)

$ npm run build
> collectible-escrow-frontend@0.1.0 build
> next build

   ▲ Next.js 15.5.29
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully in 30.2s
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (8/8)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ○ /                                    3.77 kB         218 kB
├ ○ /_not-found                             1 kB         105 kB
├ ○ /admin                               10.2 kB         265 kB
├ ƒ /api/auth/session                      139 B         104 kB
├ ƒ /api/pin                               139 B         104 kB
├ ƒ /api/uris                              139 B         104 kB
├ ƒ /api/verify                            139 B         104 kB
├ ○ /auth                                4.66 kB         219 kB
├ ○ /auth/local                          8.15 kB         235 kB
├ ƒ /profile/[address]                   2.91 kB         169 kB
├ ƒ /trade/[id]                          19.5 kB         274 kB
├ ƒ /trade/[id]/report                   7.87 kB         177 kB
└ ○ /trade/new                           9.84 kB         258 kB
+ First Load JS shared by all             104 kB

$ npm test
ℹ tests 29
ℹ suites 0
ℹ pass 29
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

> **Ghi chú về `npm run lint`:** `eslint` chưa được cài trong `frontend/package.json` (theo `.agents/rules/60-ui-ux.md` — chờ Owner Q12), nên bước `npm run lint` độc lập được ghi nhận là `NOT RUN – eslint package chưa được cài đặt trong devDependencies`, trong khi bước kiểm tra kiểu dữ liệu tĩnh (`npx tsc --noEmit`) và bước kiểm tra của `next build` đạt `PASS`.

### 4.6. Output Git & AC-12 (`git branch --show-current`, `git status`, `git diff --name-only main...HEAD`)

```text
$ git branch --show-current
ui/esc-100-auth-two-pages

$ git diff --name-only main...HEAD
docs/agent-ops/reports/ESC-100-report.md
docs/agent-ops/tasks/ESC-100.md
frontend/app/auth/local/page.tsx
frontend/app/auth/page.tsx
frontend/app/globals.css
frontend/components/AuthGuard.tsx
frontend/components/ConnectWalletModal.tsx
frontend/next.config.js

$ git diff --name-only main...HEAD -- backend contracts ai-pipeline scripts docs/context docs/specs README.md
(rỗng - 0 file ngoài phạm vi)

$ git status -s -- frontend/app/auth frontend/components/ConnectWalletModal.tsx frontend/components/AuthGuard.tsx frontend/app/globals.css frontend/next.config.js docs/agent-ops/tasks/ESC-100.md docs/agent-ops/reports/ESC-100-report.md
(clean - đã commit đầy đủ trên ui/esc-100-auth-two-pages)
```

---

## 5. Findings (Bảo mật & UX phát hiện thêm — Không tự sửa ngoài Scope)

1. **[Security / Keystore KDF & Password Policy — Low/Info]:**
   - Trong `frontend/lib/local-wallet/crypto.ts`, hàm `validatePasswordStrength` hiện chỉ kiểm tra độ dài tối thiểu `password.length >= 8` mà chưa kiểm tra độ phức tạp hoặc danh sách mật khẩu phổ biến; đồng thời `PBKDF2` đang đặt `100_000` vòng lặp `SHA-256` (khuyến nghị OWASP hiện hành cho PBKDF2-HMAC-SHA256 là `600_000` vòng lặp). Tuân thủ ràng buộc của `ESC-100`, logic mã hoá/KDF trong `lib/local-wallet/crypto.ts` được giữ nguyên và ghi nhận tại đây để Owner xem xét ở task bảo mật tiếp theo.
2. **[UX / Theme Consistency Across Routes — Info]:**
   - Theo quyết định D1 của Owner, màn `/auth` và `/auth/local` áp dụng giao diện **Light Quiet Fintech** (`--bg: #FFFFFF`), trong khi các trang giao dịch sau khi đăng nhập (`/`, `/trade/new`, `/trade/[id]`) vẫn đang ở nền tối (`bg-slate-950`). Bộ biến CSS (`--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent`, `--primary-bg`) đã được khai báo global tại `frontend/app/globals.css` để sẵn sàng đồng bộ cho các trang còn lại ở task tiếp theo.

---

## 6. Known Limitations & Docs Cần Sync

- **Known Limitations:**
  - Chưa áp dụng bộ token Quiet Fintech cho các trang ngoài `/auth` và `/auth/local` (nằm ngoài phạm vi của `ESC-100`).
- **Docs cần sync:**
  - Không thay đổi API contract, ABI, state transition hay ngưỡng AI; không yêu cầu sync `docs/specs/FRONTEND_SPEC.md` hay `docs/context/BUSINESS_REQUIREMENTS.md`.
