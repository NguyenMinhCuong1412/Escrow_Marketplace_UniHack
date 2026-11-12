# Operational Task Report: ESC-080

**Task ID:** `ESC-080`  
**Title:** Ràng buộc ảnh niêm yết với chữ ký seller ở mọi đường verify (đóng SEC-01) + thống nhất tên dự án + sửa errors.ts  
**Priority:** P0  
**Role:** Backend + Frontend Engineer  
**Branch:** `phase/4f-listing-binding`  
**Date:** 2026-11-12  
**Status:** READY FOR QA REVIEW  

---

## 1. Preflight Check & Scope Compliance

### 1.1 Scope Allowed (Tuân thủ 100%)
- `backend/attest_service.py`: Kiểm tra ràng buộc ảnh niêm yết trong `run_verification` với sổ URI (`UriRegistry`), trả lỗi 409 nếu chưa có chữ ký seller, 422 nếu URL gửi lên không khớp với URL seller đã ký.
- `backend/auto_agent.py`: Cập nhật dòng đầu thông điệp ký `listing_message` thành `Escrow Marketplace - xac nhan anh niem yet` (loại bỏ chuỗi "TrustPact").
- `backend/tests/test_service_unit.py`: Thêm suite `TestListingBindingUnit` kiểm tra AC-01, AC-02, AC-04; cập nhật `test_ssrf_unknown_host_rejected` đăng ký listing URI.
- `backend/tests/test_integration_anvil.py`: Cập nhật các bài test verify thủ công đăng ký listing URI có chữ ký seller qua `_evidence(..., client=client)`; bổ sung 3 test tích hợp cho AC-01, AC-02, AC-06.
- `frontend/lib/backend.ts`: Thống nhất dòng đầu của `listingMessage` thành `'Escrow Marketplace - xac nhan anh niem yet'` (loại bỏ chuỗi "TrustPact").
- `frontend/lib/errors.ts`: Đưa nhánh `/violator not a party/` lên trước `/not a party/` để hiển thị đúng thông báo tiếng Việt.
- `frontend/components/VerifyProgress.tsx`: Đọc URI ảnh niêm yết từ sổ URI backend (`getRegisteredUris`), đặt thuộc tính `readOnly`, không cho người dùng sửa tay ảnh niêm yết.
- `frontend/components/AgentStatusCard.tsx`: Khi `missing_uris` chứa `listing`, nếu người xem là **seller** thì hiển thị ô nhập/lấy URI từ localStorage và nút "Ký xác nhận ảnh niêm yết" (`personal_sign` -> `POST /api/uris` -> làm mới thẻ); người xem khác thấy "Chờ người bán ký xác nhận ảnh niêm yết".
- `frontend/app/trade/new/page.tsx`: Cập nhật toast khi ký thất bại: hướng dẫn ký lại ở trang chi tiết giao dịch thay vì thông báo "vẫn có thể xác thực thủ công".
- `frontend/app/layout.tsx`: Thống nhất tên hiển thị "Escrow Marketplace" ở tiêu đề và footer (loại bỏ "Collectible Escrow").
- `frontend/components/Navbar.tsx`: Thống nhất tên thương hiệu "Escrow Marketplace".
- `frontend/lib/wagmi.ts`: Đổi `appName` của RainbowKit thành `'Escrow Marketplace'`.
- `docs/agent-ops/reports/ESC-080-report.md`: Tạo mới báo cáo này.

### 1.2 Out of Scope (Không chạm)
- `contracts/`: Giữ nguyên 100%, không sửa contract, không redeploy.
- `ai-pipeline/`: Giữ nguyên 100%, không sửa logic thị giác máy tính.
- `frontend/app/api/*`: Giữ nguyên 100%.
- `docs/context/`, `docs/specs/`, `.agents/`, `README.md`, `CLAUDE.md`: Không chạm (để Cowork cập nhật sau review).
- Không thêm dependency mới nào vào `package.json` hay `requirements.txt`.
- Không thêm biến môi trường hay toggle để tắt ràng buộc an toàn.

---

## 2. Acceptance Criteria Verification

| AC | Tiêu chí | Kết quả | Bằng chứng kiểm tra thực tế |
|---|---|---|---|
| **AC-01** | `POST /verify-evidence` với trade chưa có ảnh niêm yết đã ký trong sổ URI → **409**, `detail` nêu rõ cần seller ký xác nhận. Không gửi `attest`. | ✅ PASS | Đã triển khai tại `backend/attest_service.py:L525-528`. Trả về `HTTP 409 ("Chưa có ảnh niêm yết đã ký trong sổ URI, cần seller ký xác nhận")`. Unit test `TestListingBindingUnit::test_ac01_unregistered_listing_returns_409` và integration test `test_ac01_unregistered_listing_gives_409` khẳng định không gửi giao dịch `attest` và state on-chain giữ nguyên `AwaitingEvidence`. |
| **AC-02** | `POST /verify-evidence` với `listing_image_url` khác URI seller đã ký → **422**. Không gửi `attest`; trade vẫn ở `AwaitingEvidence`. | ✅ PASS | Đã triển khai tại `backend/attest_service.py:L529-530`. Trả về `HTTP 422 ("listing_image_url không khớp ảnh niêm yết seller đã ký")`. Unit test `test_ac02_mismatched_listing_returns_422` và integration test `test_ac02_mismatched_listing_gives_422` khẳng định state on-chain không đổi. |
| **AC-03** | `POST /verify-evidence` với `listing_image_url` đúng URI đã ký → 200, attest như cũ. | ✅ PASS | Integration test `test_clean_trade_end_to_end` đăng ký listing có chữ ký seller, gọi `/verify-evidence` nhận 200 OK, `attested=True`, hash on-chain khớp, state chuyển sang `Attested`. |
| **AC-04** | Ràng buộc áp dụng cho cả `dry_run=true`. Thứ tự lỗi giữ nguyên với trade không tồn tại (404) và sai state / thiếu bằng chứng (409). | ✅ PASS | Đã kiểm chứng tại `TestListingBindingUnit::test_ac04_dry_run_enforces_listing_binding` (dry_run vẫn bị chặn 409/422 và không gửi attest) và `test_ac04_error_ordering_preserved` (404 trước, Created 409 trước, thiếu bằng chứng 409 trước, sau đó mới tới listing binding). |
| **AC-05** | Luồng agent tự động không đổi hành vi — 5 integration test `test_auto_agent_*` và `test_register_uri_validation` vẫn pass. | ✅ PASS | Toàn bộ các test của agent tự động trong `test_integration_anvil.py` (`test_auto_agent_attests_without_manual_call`, `test_auto_agent_flags_fraud`, v.v.) đều pass 100% không cần sửa kỳ vọng. |
| **AC-06** | Kịch bản tấn công: bên thứ ba gọi verify thủ công với ảnh niêm yết là chính ảnh bằng chứng của seller, trong khi seller ký ảnh khác → 422, không attest. | ✅ PASS | Triển khai bài test riêng `test_ac06_attack_scenario_listing_replaced_with_seller_evidence`. Kẻ tấn công gửi `listing_image_url = req["seller_evidence_url"]` bị từ chối 422, trade vẫn ở `AwaitingEvidence`. |
| **AC-07** | Trang giao dịch: khi `missing_uris` chứa `listing`, **seller** thấy nút ký xác nhận ảnh niêm yết (lấy từ localStorage hoặc cho dán `ipfs://...`) → `personal_sign` → `POST /api/uris` → cập nhật thẻ. Người xem khác thấy "chờ người bán ký xác nhận ảnh niêm yết". | ✅ PASS | Triển khai tại `frontend/components/AgentStatusCard.tsx:L150-188`. Sử dụng `useTrade` và `useAccount` để phân biệt quyền seller. Người bán có ô nhập URI + nút "Ký xác nhận ảnh niêm yết", gọi `signMessageAsync` và `registerUri`. Người ngoài hiển thị thông báo "Chờ người bán ký xác nhận ảnh niêm yết". |
| **AC-08** | `VerifyProgress`: URI ảnh niêm yết lấy từ sổ URI của backend và không cho sửa tay. Toast trong `trade/new` khi ký thất bại hướng dẫn ký lại ở trang giao dịch. | ✅ PASS | `VerifyProgress.tsx` đọc `getRegisteredUris`, đặt input `readOnly`, không cho sửa tay. Toast trong `trade/new/page.tsx:L201` cập nhật thành `"Chưa ký xác nhận ảnh niêm yết — bạn có thể ký lại ở trang chi tiết giao dịch."`. |
| **AC-09** | `grep -rn "TrustPact" backend frontend --include=*.py --include=*.ts --include=*.tsx` trả rỗng. Hai hàm `listing_message` (Python) và `listingMessage` (TS) cùng dùng dòng đầu `Escrow Marketplace - xac nhan anh niem yet`. | ✅ PASS | Lệnh `git grep "TrustPact" backend/ frontend/` trả về rỗng (0 kết quả). Hai hàm `listing_message` và `listingMessage` khớp nhau từng ký tự. |
| **AC-10** | `getReadableError` trả đúng thông báo "Bên bị xử phạt phải là…" cho lỗi chứa `violator not a party` (đưa nhánh này lên trước `not a party`). | ✅ PASS | `frontend/lib/errors.ts` đã đưa regex `/violator not a party/i` lên dòng 17 trước `/not a party/i`. |
| **AC-11** | `npm run build` trong `frontend/` pass. | ✅ PASS | `next build` hoàn thành thành công, 0 lỗi TypeScript, 0 lỗi ESLint, toàn bộ 10 route render đúng. |
| **AC-12** | `git diff --name-only main...HEAD` chỉ gồm file trong Scope. | ✅ PASS | Đối chiếu danh sách thay đổi chỉ gồm đúng 12 file trong Scope được cấp quyền. |
| **AC-13** | Tên hiển thị thống nhất là **Escrow Marketplace**: `grep -rn "Collectible Escrow" frontend/app frontend/components frontend/lib` trả rỗng. | ✅ PASS | Lệnh `git grep "Collectible Escrow" frontend/app frontend/components frontend/lib` trả về rỗng (0 kết quả). |

---

## 3. Test Execution Results

### 3.1 Full Pytest Regression Suite
- **Lệnh thực thi:**
  ```powershell
  $env:PATH = "C:\Program Files\Tesseract-OCR;$env:PATH"
  .venv\Scripts\pytest.exe -rs
  ```
- **Kết quả:**
  ```text
  ============================= test session starts =============================
  platform win32 -- Python 3.14.3, pytest-9.2.0, pluggy-1.7.0
  rootdir: D:\Escrow_Marketplace_UniHack
  configfile: pytest.ini
  testpaths: ai-pipeline/tests, backend/tests
  plugins: anyio-4.16.0
  collected 146 items

  ai-pipeline\tests\test_evidence_check.py ............................... [ 21%]
  ............................                                             [ 40%]
  ai-pipeline\tests\test_qr_nonce.py ..................                    [ 52%]
  backend\tests\test_integration_anvil.py .......................          [ 68%]
  backend\tests\test_service_unit.py ..................................... [ 93%]
  .........                                                                [100%]

  ======================= 146 passed in 109.17s (0:01:49) =======================
  ```
  *(146 passed, 0 failed, 0 skipped — tuân thủ nghiêm ngặt skip policy, không có test nào bị bỏ qua).*

### 3.2 Frontend Production Build
- **Lệnh thực thi:**
  ```powershell
  cd frontend
  npm.cmd run build
  ```
- **Kết quả:**
  ```text
  > collectible-escrow-frontend@0.1.0 build
  > next build

    ▲ Next.js 14.2.35

     Creating an optimized production build ...
   ✓ Compiled successfully
     Linting and checking validity of types ...
     Collecting page data ...
     Generating static pages (0/6) ...
     Generating static pages (1/6) 
     Generating static pages (2/6) 
     Generating static pages (4/6) 
   ✓ Generating static pages (6/6)
     Finalizing page optimization ...
     Collecting build traces ...

  Route (app)                              Size     First Load JS
  ┌ ○ /                                    5.03 kB         326 kB
  ├ ○ /_not-found                          880 B          90.9 kB
  ├ ○ /admin                               10.6 kB         338 kB
  ├ ƒ /api/pin                             0 B                0 B
  ├ ƒ /api/uris                            0 B                0 B
  ├ ƒ /api/verify                          0 B                0 B
  ├ ƒ /profile/[address]                   5.96 kB         159 kB
  ├ ƒ /trade/[id]                          18.1 kB         348 kB
  ├ ƒ /trade/[id]/report                   7.8 kB          167 kB
  └ ○ /trade/new                           8.52 kB         326 kB
  + First Load JS shared by all            90 kB
    ├ chunks/2117-b59cc24b9d9324e7.js      31.9 kB
    ├ chunks/fd9d1056-d87032f735ffd154.js  53.6 kB
    └ other shared chunks (total)          4.44 kB

  ○  (Static)   prerendered as static content
  ƒ  (Dynamic)  server-rendered on demand
  ```

---

## 4. Status of `backend/scripts/demo_local.py`
- **Trạng thái:** `Đã hỏng từ trước (Phase 3A)`
- **Nguyên nhân kỹ thuật:**
  1. Trong `demo_local.py:L80`, script sử dụng URL HTTP trực tiếp: `urls = {k: f"{base}/{k}.jpg" for k in ("listing", "seller", "buyer")}`.
  2. Từ Phase 3A (`b238a41`), `attest_service.py` đã bắt buộc `listing_image_url.startswith("ipfs://")` (trả về 422 nếu là `http://`).
  3. Đồng thời, từ task ESC-080 này, endpoint yêu cầu ảnh niêm yết phải được đăng ký kèm chữ ký seller qua `/trade/{id}/uris`.
- **Ghi chú:** Tuân thủ yêu cầu Out of Scope của Task Spec, script này được giữ nguyên, không sửa.

---

## 5. Known Limitations
1. **Thời điểm ký ảnh niêm yết:** Người bán vẫn tự chọn ảnh niêm yết và có thể ký bất kỳ lúc nào trước khi verify (vì `Escrow.sol::createTrade` trên smart contract hiện tại không nhận tham số `listingUriHash` on-chain).
2. **First-write-wins của sổ URI:** Sau khi người bán ký ảnh niêm yết lần đầu vào `UriRegistry`, URI đó không thể bị sửa đổi (đảm bảo tính bất biến cho verify).

---

## 6. Files Changed & Git Scope Summary

```text
backend/attest_service.py
backend/auto_agent.py
backend/tests/test_integration_anvil.py
backend/tests/test_service_unit.py
frontend/app/layout.tsx
frontend/app/trade/new/page.tsx
frontend/components/AgentStatusCard.tsx
frontend/components/Navbar.tsx
frontend/components/VerifyProgress.tsx
frontend/lib/backend.ts
frontend/lib/errors.ts
frontend/lib/wagmi.ts
docs/agent-ops/reports/ESC-080-report.md
```
Tất cả 13 file đều nằm trong Scope được chỉ định trong Task Spec `docs/agent-ops/tasks/ESC-080.md`.
Không có thay đổi ngoài phạm vi. Không merge vào main.
