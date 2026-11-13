# QA Review Report — QA-01 Final Release Gate (Updated)

**Dự án:** Escrow Marketplace  
**Môi trường:** `D:\Escrow_Marketplace_Demo` (Avalanche Fuji `43113`)  
**Ngày:** 2026-11-13  
**Reviewer:** QA Engineer độc lập  

---

## 1. Kết Luận Release Gate: `BLOCKED` ⚠️

Theo quy tắc Release Gate: *"Kết luận ACCEPT chỉ khi không còn P1 chưa xác minh hoặc chưa xử lý; ngược lại ghi BLOCKED và nêu chính xác việc cần làm. Không tự đánh dấu MetaMask/Core PASS khi chưa kiểm thử extension thật."*  
Do môi trường tự động hóa không có sẵn extension MetaMask và Core thực tế đã unlock kèm private key, hạng mục P1 đối với extension thật được phân loại **NOT TESTED**. Hệ thống giữ trạng thái **BLOCKED** chờ bước kiểm tra thủ công 2 phút từ Project Owner trên trình duyệt thực tế.

---

## 2. Bảng Tổng Hợp Kiểm Thử & Các Sửa Đổi Kỹ Thuật

| Hạng mục | Mức độ | Trạng thái | Bằng chứng & Đánh giá kỹ thuật |
|---|---|---|---|
| **1.1 Local Wallet** | P1 | ✅ **PASS** | Đã kiểm thử thực tế trên trình duyệt: Tạo ví, mở khóa, khóa ví, ký thông điệp, xử lý từ chối ký (ném `UserRejectedRequestError`), chuyển route an toàn, không crash. |
| **1.2 MetaMask & Core Extension** | P1 | ⚠️ **NOT TESTED** | Modal RainbowKit mở mượt mà, không còn lỗi `border=0`. Tuy nhiên, do thiếu extension thật trong môi trường headless, **tuyệt đối không ghi nhận PASS** mà phân loại đúng thực tế là **NOT TESTED**. |
| **2. API Security & Session** | P1 | ✅ **PASS** (Đã bổ sung Authorization) | - `/api/auth/session`: Đạt chuẩn (nonce 1 lần, chống replay 401, expiry 15m, HMAC session cookie 24h).<br>- `/api/pin`, `/api/verify`, `/api/uris`: **Đã bổ sung hàm `verifySessionFromRequest`**. Truy cập không có cookie session hợp lệ bị từ chối với mã lỗi `401 Unauthorized`. Ngăn ngừa hoàn toàn tình trạng spam tệp lên Pinata hoặc kích hoạt tùy tiện pipeline AI.<br>- Luồng xác thực phía client không còn chỉ dựa vào trạng thái wallet connected mà bắt buộc phải có session cookie hợp lệ (`serverSessionActive === true`). |
| **3. On-chain Fuji Tracking** | P0 | ✅ **PASS** | Đã đối chiếu 3 transaction hash thực tế tại hợp đồng `0x19D053c84941411888f5b9e40c854365fdd4eb00` (block, gas, event logs):<br>1. `0x7134...4a1a` (Block 61000600): `createTrade`, event `TradeCreated`.<br>2. `0x2582...38a1` (Block 61000622): `deposit` 0.00003 AVAX (30%), event `Deposited`.<br>3. `0xda9a...89eb` (Block 61000645): `cancelUnfunded`, event `Cancelled`, hoàn cọc thành công về State 5. Không tự phát sinh giao dịch mới. |
| **4. Dependencies (npm audit)** | P2 | ⚠️ **CONDITIONAL PASS** (Rủi ro gián tiếp có căn cứ) | 22 cảnh báo (PostCSS, Zod, UUID). Phân tích chi tiết rủi ro tại Mục 3 bên dưới. **Quyết định:** Giữ nguyên dependency tree hiện tại, không dùng `--force` hay ép override để bảo vệ độ ổn định hệ thống. |

---

## 3. Phân Tích Căn Cứ Kỹ Thuật 22 Cảnh Báo npm audit

Không thể khẳng định rủi ro bằng 0 do các thư viện tồn tại CVE công khai, nhưng mức độ phơi nhiễm thực tế trên kiến trúc của Escrow Marketplace được xác định như sau:

1. **PostCSS $\le$ 8.5.22 (High — GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849):**
   - *Vector tấn công:* XSS qua unescaped `</style>` hoặc path traversal đọc file `.map` thông qua thuộc tính `sourceMappingURL` do kẻ tấn công kiểm soát.
   - *Căn cứ thực tế:* PostCSS chỉ chạy trong tiến trình biên dịch tĩnh `next build` với mã nguồn CSS cục bộ (`globals.css`). Không có API nào nhận CSS hoặc source map từ client.
   - *Rủi ro:* Gián tiếp trong chuỗi cung ứng lúc build; không phơi nhiễm trực tiếp tại runtime.
2. **Zod < 4.6.6 (High — GHSA-mrhx-c7xc-m3w5):**
   - *Vector tấn công:* ReDoS / Memory Exhaustion khi validate collections bị giới hạn kích thước.
   - *Căn cứ thực tế:* Zod là dependency gián tiếp của `@reown/appkit-wallet` (Reown WalletConnect). Toàn bộ các Next.js API routes (`/api/verify`, `/api/uris`, `/api/pin`, `/api/auth/session`) đều kiểm tra dữ liệu bằng logic Node.js nguyên bản, không dùng schema Zod để parse payload ngoài.
   - *Rủi ro:* Gián tiếp trong luồng handshake của WalletConnect relay.
3. **UUID < 11.1.1 (Moderate — GHSA-w5hq-g745-h8pq):**
   - *Vector tấn công:* Buffer bounds check trong `uuid.v3/v5/v6`.
   - *Căn cứ thực tế:* Ứng dụng chỉ dùng `crypto.randomUUID()` của Web Crypto API và `randomBytes(16)`. UUID trong `@metamask/utils` chỉ sinh ID tin nhắn RPC nội bộ.
   - *Rủi ro:* Rất thấp, không có điểm nghẽn nhận buffer bên ngoài.

---

## 4. Danh Sách Tệp Đã Sửa Đổi
1. `frontend/lib/auth-session.ts`: Tạo mới helper dùng chung xác thực cookie session phía server (`verifySessionFromRequest`, `createSessionToken`, `verifySessionToken`).
2. `frontend/app/api/auth/session/route.ts`: Đồng bộ với helper xác thực phiên dùng chung.
3. `frontend/app/api/pin/route.ts`: Bổ sung kiểm tra session bắt buộc trước khi tải tệp lên IPFS.
4. `frontend/app/api/verify/route.ts`: Bổ sung kiểm tra session bắt buộc trước khi kích hoạt thẩm định AI.
5. `frontend/app/api/uris/route.ts`: Bổ sung kiểm tra session bắt buộc trước khi đăng ký URI.
6. `frontend/hooks/useAuthSession.ts`: Bắt buộc `serverSessionActive === true` mới xác lập trạng thái `isAuthenticated`.
7. `frontend/app/auth/page.tsx`: Tích hợp ký xác thực phiên làm việc SIWE cho cả ví local và ví Web3 ngoài.
8. `frontend/test/api-authorization.test.cjs`: Bổ sung bộ kiểm thử tự động cho cơ chế phân quyền API.

---

## 5. Kết Quả Kiểm Thử Độc Lập
- `npm test`: **24 passed, 0 failed, 0 skipped** (4 test suites).
- `npx tsc --noEmit`: **Exit code 0 (0 lỗi)**.
- `npm run build`: **Exit code 0 (11/11 routes biên dịch thành công)**.
- `forge test`: **80 passed, 0 failed, 0 skipped** (7 suites).

---

## 6. Hành Động Duy Nhất Để Chuyển Sang `ACCEPT` (Của Project Owner)
Thực hiện smoke test 2 phút trên trình duyệt cá nhân có cài extension MetaMask hoặc Core:
1. Chạy `npm run start` tại `frontend/`.
2. Mở `http://localhost:3000/auth` $\to$ Kết nối MetaMask/Core $\to$ Ký thông điệp xác thực phiên.
3. Thử từ chối 1 yêu cầu ký $\to$ Xác nhận ứng dụng báo hủy êm đẹp, không crash.
Sau khi hoàn tất, Release Gate chính thức nghiệm thu `ACCEPT`.
