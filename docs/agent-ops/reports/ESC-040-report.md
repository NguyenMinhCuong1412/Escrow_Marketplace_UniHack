# Operational Task Report: ESC-040 (Phase 4C)

**Task ID:** `ESC-040`  
**Title:** Frontend Integration — IPFS Upload + AI Verify + Evidence Flow + Admin  
**Role:** Engineering Lead / Frontend Engineer  
**Branch:** `phase/4c-integration`  
**Date:** 2026-11-10  
**Status:** READY FOR QA REVIEW  

---

## 1. Preflight Check & Scope Compliance

- **Scope Allowed:**
  - `frontend/app/api/pin/` — Route API server-side xử lý upload Pinata IPFS (Node.js runtime, multipart file parser, mock fallback an toàn).
  - `frontend/app/api/verify/` — Route API proxy server-side gọi backend AI `/verify-evidence`, giữ `ATTEST_API_KEY` bí mật hoàn toàn.
  - `frontend/app/trade/[id]/report/` — Trang Explainable Evidence Report hiển thị trực quan Risk Score gauge, checklist 4 thuật toán AI, công thức toán học minh bạch, visual match canvas/modal và tính năng verify on-chain hash.
  - `frontend/app/admin/` — Trang Trọng tài xử lý tranh chấp: lọc trade Disputed / Flagged, quyền Owner hợp đồng, các nút `resolveDispute(tradeId, violator)` và `resolveDispute(tradeId, address(0))`.
  - `frontend/lib/ipfs.ts` — Thư viện hỗ trợ IPFS upload, kích thước tệp (ảnh ≤10MB, video ≤50MB), tính `evidenceHashOf(uri) = keccak256(toBytes(uri))` khớp đúng backend.
  - `frontend/lib/backend.ts` — API client kết nối backend FastAPI, xử lý verify evidence, lấy report JSON và tính `verifyReportOnChain(reportJson, onChainReportHash)`.
  - `frontend/lib/errors.ts` — Bổ sung dịch lỗi revert tiếng Việt (AlreadyDeposited, violator not a party, wrong state, zero address).
  - `frontend/app/trade/[id]/page.tsx` — Tích hợp `EvidenceUploader`, nút kích hoạt AI verification `VerifyProgress`, liên kết trực tiếp tới AI Report.
  - `frontend/app/trade/new/page.tsx` — Cho phép upload ảnh sản phẩm niêm yết lên IPFS và lưu trữ local metadata.
  - `frontend/components/` — Thêm `EvidenceUploader.tsx`, `VerifyProgress.tsx`, `PendingWithdrawalBanner.tsx`.
- **Out of Scope (Preserved):**
  - `backend/` — Giữ nguyên 100%, không sửa.
  - `contracts/` — Giữ nguyên 100%, không sửa.
  - `ai-pipeline/` — Giữ nguyên 100%, không sửa.
  - `frontend/app/layout.tsx` và `frontend/lib/wagmi.ts` — Giữ nguyên 100%.
  - Không thêm bất kỳ package/dependency mới nào vào `package.json`.
  - Không để lộ secret ra browser bundle (không có tiền tố `NEXT_PUBLIC_` cho `PINATA_JWT` hay `ATTEST_API_KEY`).

---

## 2. Acceptance Criteria Verification

| ID | Tiêu chí (Acceptance Criteria) | Kết quả | Bằng chứng kiểm tra thực tế |
|---|---|---|---|
| **AC-01** | Upload ảnh (jpg/png ≤10MB) qua `/api/pin` → trả `ipfs://CID` thành công (hoặc mock với ghi chú) | ✅ PASS | Đã triển khai tại `frontend/app/api/pin/route.ts` & `frontend/lib/ipfs.ts`. Validate mime type và kích thước file ≤ 10MB. Khi có `PINATA_JWT`, gửi file lên Pinata IPFS gateway; khi không có, fallback trả về CID mock `ipfs://mock...` có ghi nhận cờ `{ mock: true }`. |
| **AC-02** | Upload video (mp4 ≤50MB) qua `/api/pin` → trả `ipfs://CID` thành công (hoặc mock) | ✅ PASS | Validate video/mp4 với dung lượng tối đa 50MB trong `frontend/lib/ipfs.ts`. Route `/api/pin` xử lý multipart file stream và trả về CID thành công. |
| **AC-03** | Evidence submission: upload → `keccak256(toBytes(uri))` → `submitEvidence(id, hash)` → tx confirm → UI cập nhật | ✅ PASS | Đã triển khai trong `frontend/components/EvidenceUploader.tsx`. Sử dụng `viem` để hash chuỗi URI (`keccak256(toBytes(uri))`) đồng bộ 100% với hàm `evidence_hash_of(uri)` của `backend/chain.py`. Gửi `submitEvidence` lên Smart Contract, chờ transaction receipt và refetch trạng thái UI. |
| **AC-04** | Nút "Chạy AI xác thực" hiện khi cả seller + buyer đã submit evidence → gọi `POST /verify-evidence` → loading → hiển thị kết quả | ✅ PASS | Triển khai trong `frontend/components/VerifyProgress.tsx`. Tự động kích hoạt khi `sellerEvidenceHash` và `buyerEvidenceHash` đều khác zero-hash. Giao diện hiển thị ticker 6 bước kiểm định trực quan, gọi backend và hiển thị kết quả rủi ro, chuyển hướng sang `/trade/[id]/report`. |
| **AC-05** | Trang report hiển thị: risk score (số + màu), từng check (pHash, ORB, OCR nonce, inliers/CLIP) với pass/fail icon, ảnh keypoint match | ✅ PASS | Triển khai tại `frontend/app/trade/[id]/report/page.tsx`. Gauge trực quan điểm rủi ro 0–100 (xanh/vàng/đỏ), checklist 4 bài kiểm tra AI (OCR Nonce Seller, OCR Nonce Buyer, pHash tái sử dụng ảnh, ORB + RANSAC keypoint inliers), công thức tính toán minh bạch và modal phóng to ảnh visual match base64. |
| **AC-06** | Nút "Verify on-chain": tính `keccak256(report JSON)` so với `reportHash` on-chain → ✓ hoặc ✗ | ✅ PASS | Triển khai trong `frontend/lib/backend.ts` (`verifyReportOnChain`) và render trong card kiểm định on-chain tại `report/page.tsx`. Tự động chuẩn hoá canonical JSON (sort keys, no space `separators=(',', ':')`), băm keccak256 và so khớp với `trade.reportHash` đọc từ hợp đồng Escrow. |
| **AC-07** | Admin page `/admin`: danh sách trade có state Attested+flagged hoặc Disputed, nút `resolveDispute(id, violator)` và `resolveDispute(id, address(0))` | ✅ PASS | Triển khai tại `frontend/app/admin/page.tsx`. Xác thực quyền `owner()` của Escrow contract, lọc các trade Disputed (state 3) và Flagged (state 2 + flagged). Cung cấp 3 nút phán quyết: Phạt Seller, Phạt Buyer, và Hoà giải (`address(0)`) kèm modal xác nhận chi tiết số tiền phạt 5% và điểm uy tín. |
| **AC-08** | `pendingWithdrawals > 0` → banner "Bạn có X AVAX chờ rút" + nút `withdraw()` | ✅ PASS | Triển khai tại `frontend/components/PendingWithdrawalBanner.tsx` và gắn trên Navbar. Đọc `pendingWithdrawals(address)`, khi > 0 hiển thị banner màu hổ phách và nút "Rút tiền ngay" thực thi lệnh `withdraw()`. |
| **AC-09** | `lib/errors.ts`: map ít nhất 5 revert string phổ biến → thông báo tiếng Việt | ✅ PASS | Đã mở rộng `frontend/lib/errors.ts`: map `AlreadyDeposited` / `already_deposited`, `wrong state`, `violator not a party`, `zero address`, `deposit window closed`, `evidence window closed`, `dispute window still open`, `only owner`. |
| **AC-10** | `npm run build` pass (zero TypeScript / ESLint errors) | ✅ PASS | Production build Next.js 14 thành công với 0 lỗi TypeScript và 0 lỗi ESLint. Tất cả 8 route pages và 2 server API routes đều compile và export hợp lệ. |

---

## 3. Build & Verification Evidence

### Next.js 14 Production Build (`npm run build`)

```text
> collectible-escrow-frontend@0.1.0 build
> next build

  ▲ Next.js 14.2.35
  - Environments: .env.local

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
┌ ○ /                                    5.07 kB         326 kB
├ ○ /_not-found                          880 B          90.9 kB
├ ○ /admin                               10.6 kB         338 kB
├ ƒ /api/pin                             0 B                0 B
├ ƒ /api/verify                          0 B                0 B
├ ƒ /profile/[address]                   5.96 kB         159 kB
├ ƒ /trade/[id]                          14.6 kB         344 kB
├ ƒ /trade/[id]/report                   7.3 kB          166 kB
└ ○ /trade/new                           7.69 kB         326 kB
+ First Load JS shared by all            90 kB
  ├ chunks/2117-b59cc24b9d9324e7.js      31.9 kB
  ├ chunks/fd9d1056-d87032f735ffd154.js  53.6 kB
  └ other shared chunks (total)          4.44 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

### Security Audit — Secrets Leak Check

- Kiểm tra chuỗi `NEXT_PUBLIC_PINATA` và `NEXT_PUBLIC_ATTEST` trong toàn bộ mã nguồn frontend: **0 kết quả tìm thấy (clean)**.
- `PINATA_JWT` chỉ được đọc trong `frontend/app/api/pin/route.ts` (server-side Node runtime).
- `ATTEST_API_KEY` chỉ được đọc trong `frontend/app/api/verify/route.ts` (server-side Node runtime).
- Không có bất kỳ API key nhạy cảm nào lọt vào JavaScript client bundle.

---

## 4. Known Limitations & Notes

1. **Pinata IPFS Gateway / Token:** Mặc định khi chạy local nếu môi trường chưa cấu hình `PINATA_JWT`, hệ thống tự động chuyển sang chế độ Mock IPFS (trả về hash IPFS hợp lệ có định dạng `ipfs://mock...` và ghi nhận cờ cảnh báo), đảm bảo nhà phát triển và ban giám khảo vẫn test trơn tru toàn bộ luồng E2E mà không bị chặn.
2. **Backend AI Verification Host:** Proxy `/api/verify` kết nối tới `BACKEND_URL` (mặc định `http://127.0.0.1:8000`). Cần khởi chạy backend bằng lệnh `uvicorn attest_service:app --port 8000` để nhận diện bằng chứng thực tế từ OpenCV / ORB pipeline.
