# MKT-002 REPORT — MARKETPLACE BACKEND, DATABASE & FINAL REMEDIATION

**Task ID:** `MKT-002` + `MKT-002 Final Remediation`\
**Dự án:** `D:\Escrow_Marketplace_Demo`\
**Base Commit:** `bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5`\
**Tài liệu thiết kế:** [`docs/agent-ops/reports/MKT-001-report.md`](../reports/MKT-001-report.md)\
**Trạng thái:** Đã hoàn thành triển khai `MKT-002` và khắc phục rủi ro P1 trong `MKT-002 Final Remediation`; **dừng tại đây chờ Project Owner rà soát và phê duyệt `MKT-003`**.

---

## 1. Tóm Tắt Triển Khai Theo 9 Yêu Cầu MKT-002

| # | Yêu cầu MKT-002 | Trạng thái | Chi tiết triển khai & Vị trí mã nguồn |
|---|---|---|---|
| **1** | **Database SQLite WAL** | **DONE** | `MarketplaceDB` tại [`backend/db.py`](../../../backend/db.py) khởi tạo `DATA_DIR/marketplace.db` với `PRAGMA journal_mode=WAL;`, `PRAGMA busy_timeout=5000;`, `PRAGMA foreign_keys=ON;`, đóng/mở kết nối ngắn hạn theo transaction, và context manager `write_tx()` thực thi `BEGIN IMMEDIATE` → `COMMIT`/`ROLLBACK`. Schema gồm `listings`, `listing_images`, `purchase_requests` (đã bổ sung cột `min_onchain_trade_id INTEGER` + migration idempotent trong `_init_schema()`), `listing_trades`, `used_proxy_nonces`, `idempotency_records` và ràng buộc `CHECK (quantity_reserved + quantity_sold <= quantity_total)`. |
| **2** | **Listing API** | **DONE** | Các endpoint `GET /listings`, `GET /listings/{listing_id}`, `POST /listings`, `PATCH /listings/{listing_id}` trong [`backend/attest_service.py`](../../../backend/attest_service.py) và `MarketplaceService` trong [`backend/listings.py`](../../../backend/listings.py). Hỗ trợ `sku`, `category` (`LEGO`, `MODEL_KIT`, `FIGURE`, `TRADING_CARD`, `COIN`, `OTHER`), `condition` (`SEALED_NEW`, `LIKE_NEW`, `USED_GOOD`, `USED_FAIR`, `GRADED`), `quantity_total`, giá `price_wei` AVAX (lọc `min_price_wei`/`max_price_wei` và sắp xếp `price_asc`/`price_desc` theo `(LENGTH(price_wei), price_wei)` tránh tràn số nguyên 64-bit SQLite với giá > 9.22 AVAX), tiền cọc tham chiếu 30% `deposit_required_wei` (`DEPOSIT_BPS = 3000`, CDU kế toán 1:1), nhiều ảnh IPFS (`1..10` ảnh, 1 `is_primary`), tìm kiếm `q`, lọc `status`/`seller`/`in_stock_only` và phân trang. |
| **3** | **Purchase Request & Chống Oversell** | **DONE** | `POST /listings/{listing_id}/requests`, `GET /requests`, `GET /requests/{request_id}`, `POST /requests/{request_id}/decision` (`accept`/`reject`), `POST /requests/{request_id}/cancel`. Trong `decide_request()` (`accept`), backend ghi nhận `min_onchain_trade_id` từ `client.next_trade_id()` (nếu có RPC client khớp chain/escrow), mở transaction `BEGIN IMMEDIATE` và chạy `UPDATE listings ... WHERE id = ? AND chain_id = ? AND escrow_address = ? AND status = 'ACTIVE' AND (quantity_total - quantity_reserved - quantity_sold) >= ?`. Khi hai buyer cùng tranh giữ chỗ món `quantity=1`, chỉ một request thành công (`200`), request còn lại nhận `409 OUT_OF_STOCK_OR_RESERVED` (hoặc `409 LISTING_UNAVAILABLE` khi tạo request mới trên tin đã `RESERVED`). Chặn sửa `price_wei`/`sku`/`category`/`condition`/`images` hoặc chuyển `PAUSED`/`CANCELLED` khi `quantity_reserved > 0`. |
| **4** | **Reservation TTL & Chống Giải Phóng Thiếu An Toàn** | **DONE** | Mặc định `RESERVATION_TTL_SECONDS = 1800` (30 phút) và `VERIFY_CHAIN_BEFORE_TTL_RELEASE = true` (mục 2 bên dưới). Trước khi giải phóng request `ACCEPTED` quá hạn hoặc xử lý `cancel_request()` trên request `ACCEPTED`, backend đối soát read-only on-chain (ngoài SQLite write lock): **chỉ giải phóng** khi xác minh chắc chắn trên `Escrow` không có trade `createTrade` khớp `(seller, buyer, total_value_wei)` chưa `Cancelled` tại `tradeId >= min_onchain_trade_id`. Nếu thiếu RPC client, RPC lỗi hoặc phát hiện trade chưa bind trên chain, giữ nguyên `ACCEPTED` và `quantity_reserved`. |
| **5** | **Bind Trade & Khôi phục sau lỗi** | **DONE** | `EscrowClient.verify_create_trade_tx()` tại [`backend/chain.py`](../../../backend/chain.py) (chỉ đọc RPC) kiểm tra `get_transaction_receipt(tx_hash)` (`status == 1`, `to == escrow_address`), giải mã đúng 1 sự kiện `TradeCreated`, đọc lại `getTrade(trade_id)` và đối chiếu `chain_id`, `escrow_address`, `seller`, `buyer`, `item_value == int(total_value_wei)`. Chống bind trùng qua `UNIQUE` trên `request_id`, `(chain_id, escrow_address, trade_id)`, `(chain_id, escrow_address, tx_hash)`. Bước 1 kiểm tra `Idempotency-Key` theo đúng payload request (`body.tx_hash`, `body.trade_id`); hỗ trợ retry idempotent và khôi phục `EXPIRED` khi tồn kho còn đủ (`recovered=true`), hoặc chặn dứt khoát bằng `409 INSUFFICIENT_STOCK_AFTER_EXPIRY` nếu đã có buyer khác giữ/mua hết hàng. |
| **6** | **Sync & Reconciliation chỉ đọc** | **DONE** | `POST /trades/{trade_id}/sync`, `GET /trades/{trade_id}/context`, `POST /marketplace/reconcile` và hook `AutoAgent(..., reconcile=reconcile_marketplace_readonly)` trong [`backend/auto_agent.py`](../../../backend/auto_agent.py). Nhịp `AutoAgent.tick()` gọi đối soát chỉ đọc (hết hạn TTL có xác minh on-chain + `get_trade()` các trade chưa kết thúc để cập nhật `COMPLETED`/`SOLD` hoặc `TRADE_CANCELLED`/`ACTIVE`), tách biệt hoàn toàn với AI attest và hỗ trợ chuyển trực tiếp `ACCEPTED -> COMPLETED` (`TradeState.Resolved`) không double-count hay lỗi `CHECK`. |
| **7** | **Security & Kênh BFF tin cậy** | **DONE** | `authenticate_marketplace_actor()` trong [`backend/attest_service.py`](../../../backend/attest_service.py) dùng `hmac.compare_digest(...encode("utf-8"))` kiểm tra `X-API-Key`, yêu cầu `X-Authenticated-Wallet`, kiểm tra `X-Authenticated-Chain-Id`, dùng Pydantic `ConfigDict(extra="forbid")` chặn client nhồi field ví giả, phân quyền Seller/Buyer, giới hạn tốc độ theo ví (`_consume_rate_limit`) và IP qua proxy tin cậy (`resolve_read_rate_key`), hỗ trợ `Idempotency-Key`, và xác thực HMAC-SHA256 chống replay (`X-Auth-Timestamp`, `X-Auth-Nonce`, `X-Auth-Signature` + bảng `used_proxy_nonces`). Guard fail-closed (`InsecureConfigError` 503) tiếp tục từ chối toggle nguy hiểm trên chain `!= 31337` (bao gồm `VERIFY_CHAIN_BEFORE_TTL_RELEASE=false`). |
| **8** | **Duplicate Detection** | **DONE** | Partial unique index `uq_active_seller_sku` + check chủ động trả `409 DUPLICATE_ACTIVE_SKU` nếu cùng seller tạo/sửa trùng `sku_norm` đang ở trạng thái `ACTIVE`/`RESERVED`/`PAUSED` (vẫn cho phép khác seller hoặc tái sử dụng SKU của tin `CANCELLED`/`SOLD`). Ảnh chính đi qua SSRF-safe `download()` (khi `INSPECT_LISTING_IMAGES=true`) để tính `sha256` & `pHash`; nếu trùng `sha256`, `pHash <= PHASH_REUSE_THRESHOLD`, hoặc trùng URI chỉ gắn cảnh báo (`image_warnings_json`) và `image_review_required=True`, không chặn tạo tin đăng hợp lệ. |
| **9** | **Docker & Cấu hình mẫu** | **DONE** | [`backend/Dockerfile`](../../../backend/Dockerfile) copy các module Python của backend; [`backend/.env.example`](../../../backend/.env.example#L32-L36) ghi chú các biến MKT-002 (`RESERVATION_TTL_SECONDS`, `INSPECT_LISTING_IMAGES`, `REQUIRE_PROXY_SIGNATURE`, `PROXY_SIG_TTL_SECONDS`, `TRUST_PROXY_FORWARDED_FOR`). *(Ghi chú: `docker build` chưa kiểm chứng được trên máy dev vì Docker Desktop daemon không chạy).* |

---

## 2. Kết Quả Audit & Khắc Phục `MKT-002 Final Remediation` (Rủi Ro P1 Oversell & Bảo Mật HMAC)

### 2.1. Các lỗ hổng được tái hiện và nguyên nhân gốc rễ
1. **Giải phóng TTL & hủy chỗ giữ mù quáng dẫn tới oversell (P1):**
   - *Hiện tượng tái hiện:* Người bán xác nhận yêu cầu của Buyer 1 trên món `quantity_total=1`, gọi `createTrade` thành công trên hợp đồng `Escrow`, nhưng gọi API `POST /requests/{req_id}/bind-trade` bị lỗi/rớt mạng. Khi hết TTL (30 phút), hàm `_expire_stale_reservations_locked` cũ trong `backend/listings.py` và `cancel_request` chỉ kiểm tra bảng cục bộ `listing_trades` mà không đọc state trên blockchain; ngoài ra các endpoint Marketplace trong `backend/attest_service.py` chưa truyền RPC client vào xử lý TTL. Hệ quả là backend tự chuyển Buyer 1 sang `EXPIRED` (`quantity_reserved = 0`, `status = ACTIVE`) dù đã có `TradeCreated` on-chain, cho phép Buyer 2 đặt/giữ chỗ tiếp cùng món `quantity=1`.
2. **Lỗi SQLite `CHECK` khi bind/sync chuyển thẳng `ACCEPTED -> TradeState.Resolved` (P1):**
   - Trong `_apply_trade_state_locked` trước đây, nhánh `TradeState.Resolved` chỉ trừ `quantity_reserved` nếu `req_status == 'ESCROW_CREATED'`. Nếu trade đã chạy hết quy trình on-chain đến `Resolved` trước khi gọi `bind-trade`, `purchase_requests.status` vẫn là `ACCEPTED` nên `quantity_reserved` không bị trừ khi cộng `quantity_sold`, vi phạm `CHECK (quantity_reserved + quantity_sold <= quantity_total)`.
3. **Điểm cứng hóa phụ trên `bind_trade` và so sánh header HMAC (P2):**
   - `bind_trade` trước đây kiểm tra `Idempotency-Key` sau bước tra `existing_by_req` và băm theo `verified.trade_id` thay vì `body.trade_id`, làm lệch khóa băm khi client bỏ trống `trade_id` lúc retry khôi phục.
   - `hmac.compare_digest` trong `backend/attest_service.py` so sánh `str` trực tiếp, có thể phát sinh `TypeError` (HTTP 500) nếu proxy/client gửi header chứa ký tự ngoài ASCII (e.g. qua ISO-8859-1 raw bytes).

### 2.2. Giải pháp đã triển khai
1. **Xác minh on-chain read-only trước khi giải phóng giữ chỗ (`backend/listings.py`, `backend/db.py`, `backend/chain.py`, `backend/attest_service.py`):**
   - `decide_request` (`accept`) lưu `min_onchain_trade_id = int(client.next_trade_id())` (tạo mốc trade hợp lệ cho request để các trade cũ lịch sử cùng cặp ví không khóa vĩnh viễn request mới).
   - Bỏ `_expire_stale_reservations_locked` trong write lock; thay bằng quy trình 2 pha `expire_stale_reservations(..., client=client)` chạy trước `write_tx()` tại tất cả endpoint listings/requests/sync/reconcile:
     1. Đọc danh sách request `ACCEPTED` quá hạn (`read_conn()`).
     2. Khi `verify_chain_before_ttl_release=True` (mặc định), đối soát ngoài SQLite write lock qua `client.next_trade_id()` + `client.get_trade(tid)` (chỉ đọc `.call()`): **từ chối giải phóng** và giữ nguyên `ACCEPTED` nếu `client is None`, RPC lỗi (`Exception`), lệch `chain_id`/`escrow_address`, hoặc tồn tại trade chưa bind (`not IN listing_trades`) khớp `(seller, buyer, total_value_wei)` với `state != TradeState.Cancelled`.
     3. Chỉ mở `write_tx()` giải phóng các `request_id` đã được xác minh chắc chắn không có trade mở trên chain (hoặc trade đó đã `Cancelled` trên chain).
   - `cancel_request` đối với request `ACCEPTED` áp dụng đúng nguyên tắc an toàn trên: trả `503`/`502 CHAIN_UNVERIFIED_CANNOT_RELEASE` nếu không xác minh được chain, trả `409 ONCHAIN_TRADE_ALREADY_EXISTS` nếu đã có `createTrade` khớp chưa `Cancelled` (request `PENDING` chưa từng giữ chỗ vẫn hủy offline bình thường).
   - Bổ sung `EscrowClient(..., agent_private_key=None)` trong `backend/chain.py` và `get_readonly_client()` / `active_chain_context(require_client=False)` trong `backend/attest_service.py` để xác minh TTL hoạt động ngay cả khi vận hành chế độ chỉ đọc RPC (trong khi các thao tác `send_attest` vẫn đòi hỏi `agent_private_key`).
   - Đặt `VERIFY_CHAIN_BEFORE_TTL_RELEASE=false` trên chain `!= 31337` bị chặn fail-closed trong `insecure_reasons()`.
2. **Chống oversell khi khôi phục `bind_trade` & sửa nhánh `Resolved`:**
   - Khi khôi phục từ `EXPIRED`, `bind_trade` kiểm tra điều kiện nguyên tử `status IN ('ACTIVE', 'RESERVED', 'PAUSED') AND (quantity_total - quantity_reserved - quantity_sold) >= ?` và trả `409 INSUFFICIENT_STOCK_AFTER_EXPIRY` nếu Buyer 2 đã giữ chỗ hoặc mua hết (kể cả khi trade khôi phục đang ở `Created` hay `Resolved`).
   - `_apply_trade_state_locked` (`TradeState.Resolved`) giảm `quantity_reserved = MAX(0, quantity_reserved - ?)` đồng nhất cho cả `ACCEPTED` và `ESCROW_CREATED`.
   - Đưa kiểm tra `Idempotency-Key` lên Bước 1 của `bind_trade` với hash theo đúng payload request gốc (`body.tx_hash`, `body.trade_id`).
3. **Xác minh cơ chế HMAC Proxy & tương thích Frontend hiện tại (`MKT-003`):**
   - Đã kiểm tra [`backend/attest_service.py`](../../../backend/attest_service.py#L713-L795): `authenticate_marketplace_actor` dùng `hmac.compare_digest(...encode("utf-8"))` xác thực `X-API-Key`, ép kiểu và kiểm tra cửa sổ thời gian `abs(now - ts) <= proxy_sig_ttl_seconds`, định dạng `X-Auth-Nonce`, chữ ký `compute_proxy_signature(ATTEST_API_KEY, method, path, actor, chain_id, ts, nonce)`, và ghi nonce vào bảng SQLite chống replay bền vững qua backend restart. Nếu nhận header chữ ký không phải ASCII qua ASGI raw bytes, backend trả chuẩn `401 INVALID_PROXY_SIGNATURE` thay vì `500`.
   - **Tương thích & Yêu cầu bắt buộc cho `MKT-003`:** Biến `REQUIRE_PROXY_SIGNATURE` **được giữ mặc định `false`** trong phạm vi `MKT-002` để không làm gãy tương thích trước khi BFF `MKT-003` hoàn tất; tuy nhiên khi có bất kỳ header `X-Auth-*` nào được gửi lên, backend luôn xác thực đầy đủ. **Bắt buộc tại `MKT-003`:** Next.js BFF phải ký mọi request tới Marketplace API bằng `ATTEST_API_KEY` (server-side) với `X-Auth-Timestamp`, `X-Auth-Nonce`, `X-Auth-Signature`, `X-Authenticated-Chain-Id`, và cấu hình triển khai `REQUIRE_PROXY_SIGNATURE=true` (có `ATTEST_API_KEY` mạnh) để chặn hoàn toàn kênh proxy không ký.

---

## 3. Danh Sách File Chỉnh Sửa & Tạo Mới

Phạm vi chỉnh sửa chỉ nằm trong `backend/` và file báo cáo này. Các thay đổi uncommitted có sẵn ở `frontend/`, [`MKT-001-report.md`](../reports/MKT-001-report.md) và file phụ ở root giữ nguyên hoàn toàn, không ghi đè.

- **Tạo mới (MKT-002):**
  - [`backend/db.py`](../../../backend/db.py) — Kết nối SQLite WAL, schema 6 bảng + index, migration cột `min_onchain_trade_id`, `write_tx()` (`BEGIN IMMEDIATE`), `record_proxy_nonce()`.
  - [`backend/listings.py`](../../../backend/listings.py) — Strict DTO (`extra="forbid"`), validate wei/IPFS/SKU, `compute_proxy_signature`, phát hiện trùng SKU / cảnh báo pHash & SHA-256, `MarketplaceService` với xác minh on-chain read-only trước khi giải phóng TTL/cancel, `bind_trade` chống oversell & idempotency, `sync_trade`, `reconcile`, `get_trade_context`.
  - [`backend/tests/test_listings_unit.py`](../../../backend/tests/test_listings_unit.py) — **25 unit tests** (bao gồm 6 test mới thuộc remediation: thiếu RPC / lỗi RPC từ chối giải phóng TTL & cancel; unbound on-chain trade chặn TTL/cancel nhưng tự giải phóng sau khi `Cancelled` và bỏ qua historical trade `< min_onchain_trade_id`; chặn `bind_trade` recovery khi buyer khác đang giữ chỗ `Created`/`Resolved`; chuyển thẳng `ACCEPTED -> COMPLETED` không lỗi `CHECK` + `Idempotency-Key` không truyền `trade_id`; non-ASCII signature header trả `401` thay vì `500`).
  - [`backend/tests/test_listings_integration.py`](../../../backend/tests/test_listings_integration.py) — **5 Anvil integration tests** (chạy với Anvil thật, `Escrow.sol`, `CollectibleToken` CDU & AI `AutoAgent.tick()`: full E2E listing → escrow → `attest()` → `resolveClean` → `SOLD`; recovery `EXPIRED -> bind-trade` sau restart; `cancelUnfunded` hoàn tồn kho; **mới:** tái hiện 2 buyer tranh `quantity=1` + `createTrade` thành công khi `bind-trade` lỗi + hết TTL giữ nguyên `RESERVED`/`ACCEPTED` qua `GET`/`reconcile`/chặn accept Buyer 2 (`409`)/chặn `cancel` (`409`)/restart retry `bind-trade` tới `SOLD`; **mới:** unbound trade bị `cancelUnfunded` tự mở khóa tồn kho cho Buyer 2 + late `bind-trade` thẳng từ `ACCEPTED -> Resolved`).
  - [`docs/agent-ops/reports/MKT-002-report.md`](../reports/MKT-002-report.md) — Báo cáo hiện tại.
- **Chỉnh sửa (MKT-002 & Final Remediation):**
  - [`backend/chain.py`](../../../backend/chain.py) — `ChainTxNotFound`, `ChainValidationError`, `CreatedTradeReceipt`, `EscrowClient.verify_create_trade_tx()`, và hỗ trợ `agent_private_key=None` chỉ đọc RPC.
  - [`backend/auto_agent.py`](../../../backend/auto_agent.py) — Hook `reconcile` chỉ đọc tách biệt ở đầu `AutoAgent.tick()`.
  - [`backend/attest_service.py`](../../../backend/attest_service.py) — Cấu hình `MKT-002` + `VERIFY_CHAIN_BEFORE_TTL_RELEASE=true` (fail-closed ngoài chain `31337`), `hmac.compare_digest(...encode("utf-8"))`, `get_readonly_client()`, `active_chain_context(require_client=False)`, truyền `active_client` vào các endpoint Marketplace, và 13 Marketplace endpoints.
  - [`backend/Dockerfile`](../../../backend/Dockerfile) — Copy đầy đủ các module `backend/*.py`.
  - [`backend/.env.example`](../../../backend/.env.example) — Ghi chú cấu hình MKT-002.

---

## 4. Bằng Chứng Kiểm Thử & Kiểm Chứng (Verification Matrix)

Môi trường chạy: Windows, `.venv` Python `3.14.3`, `pytest-9.2.0`, Foundry `anvil`, `Tesseract-OCR`. Tất cả các lần kiểm thử dưới đây đều được thực thi **sau chỉnh sửa code cuối cùng**.

| Kiểm tra | Lệnh thực thi | Kết quả | Trạng thái | Ghi chú chi tiết |
|---|---|---|---|---|
| **MKT-002 Unit + Anvil Integration** | `.\.venv\Scripts\python.exe -m pytest -rs backend/tests/test_listings_unit.py backend/tests/test_listings_integration.py` | `30 passed in 14.61s` | **PASS** | `25` unit (`test_listings_unit.py`) + `5` Anvil integration (`test_listings_integration.py`); `0 failed, 0 skipped`. |
| **Toàn bộ Pytest Suite (`ai-pipeline` + `backend`)** | `.\.venv\Scripts\python.exe -m pytest -rs` | `183 passed in 119.50s (0:01:59)` | **PASS** | Đủ 6 file test: `test_evidence_check.py`, `test_qr_nonce.py`, `test_integration_anvil.py`, `test_listings_integration.py`, `test_listings_unit.py`, `test_service_unit.py`; `0 failed, 0 skipped`. |
| **Grep AI Authority Boundary** | `Select-String -Path "backend\*.py" -Pattern "functions\.\w*\("` | 5 dòng khớp tại [`backend/chain.py`](../../../backend/chain.py#L130-L234) | **PASS** | Chỉ `self.escrow.functions.attest(...)` (dòng 234) tạo giao dịch; 4 lời gọi còn lại (`agent()`, `getTrade()`, `reputationOf()`, `nextTradeId()`) đều là `.call()` chỉ đọc. |
| **Docker Image Build** | *(Chưa chạy lại sau remediation; phiên MKT-002 daemon Docker không hoạt động)* | — | **NOT TESTED** | Cần chạy `docker build -f backend/Dockerfile -t escrow-attest .` trên môi trường có Docker daemon. |
| **Contracts / Frontend Checks** | — | — | **NOT RUN** | Ngoài phạm vi `MKT-002`; không sửa `contracts/`, ABI, hay `frontend/`. |

---

## 5. Hạn Chế Đã Biết, Rủi Ro & Checklist Bàn Giao Sang `MKT-003`

### 5.1. Hạn chế & Rủi ro còn lại
1. **Giữ chỗ ở trạng thái `ACCEPTED` khi RPC bị gián đoạn tạm thời:** Vì chính sách fail-safe (`VERIFY_CHAIN_BEFORE_TTL_RELEASE=true`), nếu RPC node mất kết nối kéo dài hơn `RESERVATION_TTL_SECONDS`, request `ACCEPTED` quá hạn sẽ tiếp tục giữ chỗ (`RESERVED`) thay vì tự giải phóng cho buyer khác cho tới khi RPC khôi phục hoặc trade on-chain được xác nhận `Cancelled`. Đây là đánh đổi có chủ đích để **loại bỏ hoàn toàn nguy cơ double-booking/oversell**.
2. **Độ trễ quét tuyến tính nếu tồn đọng nhiều trade mới chưa bind:** `_has_matching_unbound_onchain_trade` quét tuần tự từ `max(1, min_onchain_trade_id)` tới `nextTradeId() - 1` qua RPC (nhóm đọc 1 lần cho mọi request `ACCEPTED` quá hạn của cùng cặp chain/escrow). Trên quy mô hàng nghìn trade liên tục chưa bind, có thể tối ưu bằng indexer/event filter `TradeCreated` theo block range ở giai đoạn sau.
3. **In-memory Rate Limiter & SQLite Single-Process:** `rate_limit_records` nằm trong bộ nhớ FastAPI và SQLite WAL tối ưu cho **1 worker Uvicorn** (`--workers 1`) kết hợp volume `DATA_DIR`. Scale đa worker cần PostgreSQL + Redis.
4. **Docker Build chưa thực thi thực tế:** Xem mục 4 (`NOT TESTED`).

### 5.2. Yêu cầu bắt buộc cho `MKT-003` (Next.js BFF)
1. **Bắt buộc bật ký HMAC proxy ở môi trường tích hợp `MKT-003`:**
   - Cấu hình `REQUIRE_PROXY_SIGNATURE=true` và `ATTEST_API_KEY` đủ mạnh trên backend khi triển khai cùng BFF `MKT-003` (trên bản hiện tại giữ mặc định `false` để không phá tương thích trước khi có BFF).
   - Mọi request server-to-server từ Next.js BFF tới Marketplace backend phải gửi kèm:
     - `X-API-Key` (`ATTEST_API_KEY`, tuyệt đối chỉ nằm ở server Next.js, không đưa vào `NEXT_PUBLIC_*`)
     - `X-Authenticated-Wallet` (lấy từ session ví đã xác thực phía BFF)
     - `X-Authenticated-Chain-Id`
     - `X-Auth-Timestamp`, `X-Auth-Nonce` (`^[A-Za-z0-9._-]{8,128}$`), `X-Auth-Signature` tính khớp `compute_proxy_signature()` tại [`backend/listings.py`](../../../backend/listings.py) (HMAC-SHA256 bằng `ATTEST_API_KEY` theo method, path, wallet, chain_id, timestamp, nonce)
     - `Idempotency-Key` cho các thao tác tạo/sửa/quyết định/hủy/`bind-trade`
     - `X-Forwarded-For` cho các endpoint public read nếu cấu hình `TRUST_PROXY_FORWARDED_FOR=true` hoặc kèm `X-API-Key`.
2. **Xử lý lỗi mới từ backend trên UI BFF:** Frontend/BFF cần xử lý rõ mã lỗi `503`/`502 CHAIN_UNVERIFIED_CANNOT_RELEASE`, `409 ONCHAIN_TRADE_ALREADY_EXISTS` (khi người dùng hủy giữ chỗ nhưng đã có `createTrade` trên chain), `409 INSUFFICIENT_STOCK_AFTER_EXPIRY`, và `409 OUT_OF_STOCK_OR_RESERVED` / `LISTING_UNAVAILABLE`.
3. **Nâng cấp `/api/pin` tại `MKT-003`:** Chưa thuộc phạm vi `MKT-002`; `MKT-003` cần bổ sung kiểm tra **magic bytes** tệp upload (`JPG`/`PNG`/`WEBP`/`MP4`) và trả `503` thay vì mock CID khi chain `!= 31337` (như Fuji `43113`) thiếu `PINATA_JWT`.
