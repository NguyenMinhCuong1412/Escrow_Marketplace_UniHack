# Pitch Deck (11 Slides) & Kịch Bản Video Demo (2–3 Phút) — Escrow Marketplace

> **Tên chính thức:** `Escrow Marketplace` (`DEC-017`)
> **Cuộc thi:** UniHack 2026 — Track **AI Agents and Security** (`Deadline: 21/11/2026 23:59 VN`, `Demo Day: 30/11/2026`)
> **Đối chiếu code:** `origin/main` (`f6b909a`) — `README.md`, `contracts/src/Escrow.sol`, `contracts/deployments/43113.json`, `ai-pipeline/evidence_check.py`, `backend/attest_service.py`, `frontend/`.

---

## Nguyên tắc trình bày trung thực (Claims Guardrails)

Mọi nội dung trên slide, lời thoại video và trang nộp bài **bắt buộc** tuân thủ ranh giới đã triển khai trong code và `DECISION_LOG.md`:

1. **Ký quỹ cọc 30% (`deposit-only`), không giữ tiền hàng:** Hợp đồng `Escrow.sol` khóa **30% giá trị món hàng** bằng AVAX ở cả hai phía Buyer và Seller (`MAX_DEPOSIT_BPS = 3000`), lấy cảm hứng từ cơ chế **Đặt cọc** (Bộ luật Dân sự Việt Nam 2015, Điều 328) như một ràng buộc kinh tế hai chiều ở mức kỹ thuật — **không** tuyên bố cơ chế hợp đồng thông minh tương đương hay thay thế hoàn toàn quy định pháp luật dân sự. Tiền mua hàng được hai bên thanh toán P2P ngoài hợp đồng; không nói *"giải ngân tiền hàng cho người bán"* hay *"nạp 100% giá trị đơn hàng"*.
2. **CollectibleToken (`CDU`) Soulbound 1:1:** Token `CDU` chỉ được mint 1:1 khi nạp cọc AVAX và bị burn khi hoàn tất/hoàn cọc (không chuyển nhượng, không sinh lợi tức).
3. **Ranh giới quyền AI (`DEC-014`):** Ví `onlyAgent` chỉ được gọi duy nhất giao dịch `attest(tradeId, riskScore, flagged, reportHash)` khi hợp đồng đang ở trạng thái `AwaitingEvidence` và đã đủ bằng chứng hai bên. AI **không** giữ tiền, **không** tự phạt và **không** gọi `resolveClean` hay `resolveDispute`.
4. **Trọng tài tập trung khi có tranh chấp (`OD-02`, `OD-03`):** Khi giao dịch ở `Disputed`, **Owner/Arbiter EOA** (`onlyOwner`) là người gọi `resolveDispute(tradeId, violator)`:
   - Có bên vi phạm: phạt **5% tiền cọc** (`PENALTY_BPS = 500`) của bên sai chuyển cho bên bị hại; cập nhật uy tín **`-10` / `+5`**.
   - `violator = address(0)` (không ai sai / AI flag nhầm): hoàn đủ cọc cho cả hai bên, giữ nguyên uy tín.
   - Không nói *"không cần con người / Avalanche tự làm trọng tài"*.
5. **Hoàn cọc sạch có điều kiện:** Ai cũng có thể gọi `resolveClean(tradeId)` khi giao dịch đang ở `Attested`, `!flagged`, và đã qua `DISPUTE_WINDOW` (`90s` trên Fuji demo) mà không có ai khiếu nại; khi đó hoàn đủ cọc hai bên và cộng **`+1` uy tín**.
6. **Marketplace off-chain & bảo mật BFF:** Danh mục tin đăng (`/listings`), giữ chỗ 30 phút (`/listings/{id}/requests`) và đồng bộ trạng thái chạy trên **FastAPI + SQLite WAL**, bảo vệ qua tầng BFF Next.js ký **HMAC-SHA256 + nonce replay guard**.
7. **Roadmap tách biệt khỏi hiện tại:** Các đề xuất tương lai (`VAI3_DYNAMIC_DEPOSIT_SPEC.md`, `L1_MODULE_SPEC.md`) nếu nhắc đến ở Slide 8 chỉ được ghi rõ là **"Roadmap sau Hackathon (chưa triển khai)"**.

---

## Phần A — Bộ Slide Pitch Deck (11 trang)

> Phân bổ 11 slide bám sát 6 tiêu chí chấm điểm UniHack: Technical (25%), Avalanche Integration (25%), Creativity (15%), Impact (15%), Presentation (10%), UI/UX (10%).

### Slide 1 — Cover
- **Tiêu đề:** **Escrow Marketplace**
- **Phụ đề:** Sàn giao dịch đồ sưu tầm P2P với Ký quỹ cọc 30% AVAX & AI Evidence Attestation trên Avalanche C-Chain
- **Nhãn cuộc thi:** UniHack 2026 · Track **AI Agents and Security**
- **Thông tin đội thi:** `[Điền tên team / thành viên]` · Fuji Testnet (`43113`)

### Slide 2 — Vấn đề & Tác động thị trường (Impact 15%)
- **Bối cảnh:** Giao dịch P2P đồ sưu tầm giá trị cao (LEGO, mô hình, figure, thẻ bài, xu sưu tầm) hiện phụ thuộc hoàn toàn vào niềm tin chụp màn hình chuyển khoản.
- **3 điểm gãy chính khiến giao dịch đổ vỡ:**
  1. **Bùng cọc / Hủy kèo một chiều:** Một bên nhận cọc rồi biến mất hoặc đổi ý phút chót mà không chịu chi phí cơ hội.
  2. **Ảnh giả & Tái sử dụng bằng chứng:** Dùng ảnh tải từ Internet hoặc ảnh từ đơn hàng cũ để đối phó khi giao/nhận hàng.
  3. **Thiếu bằng chứng neo thời gian khi tranh chấp:** Khi hộp hàng bị tráo hoặc móp méo, trọng tài không có căn cứ đối chiếu vật thể tại lúc đóng gói và mở hộp.

### Slide 3 — Giải pháp: Hybrid Marketplace + Ký quỹ cọc 30% (Creativity 15% + Impact 15%)
- **Tách bạch hai lớp để vừa tiện dụng vừa an toàn:**
  - **Lớp Marketplace (Off-chain FastAPI + SQLite WAL):** Đăng tin đa ảnh, gửi yêu cầu mua, khóa giữ chỗ **30 phút** (`TTL 30m`) trước khi lên chuỗi, tránh rác giao dịch gas vô ích.
  - **Lớp Escrow (On-chain Avalanche `Escrow.sol`):** Hai bên cùng ký quỹ **30% giá trị món hàng** bằng AVAX (`MAX_DEPOSIT_BPS = 3000`), mint **`CDU` Soulbound 1:1** ghi nhận phần cọc.
- **Tại sao là cọc 30% (lấy cảm hứng từ Đặt cọc — BLDS 2015 Điều 328)?** Không giam 100% vốn lưu thông của người mua và người bán, nhưng tạo ràng buộc kinh tế hai chiều kết hợp điểm uy tín `[0..100]` và mức phạt **5% cọc** khi vi phạm *(cơ chế tham khảo ý tưởng đặt cọc, không tương đương hoàn toàn chế định pháp lý)*. Tiền hàng vẫn thanh toán trực tiếp P2P.

### Slide 4 — Điểm khác biệt: Nonce-in-Frame & Seller-Signed Reference (Creativity 15% + Security)
- **Chống ảnh mạng / ảnh cũ bằng Nonce gắn với Trade ID:**
  - `Escrow.sol` sinh `bytes32 nonce = keccak256(tradeId, seller, buyer, block.timestamp, block.prevrandao)` ngay tại `createTrade()`, và giao diện `NonceCard` mở khóa hiển thị mã **QR `TP1:`** (ECC Level Q — khuyên dùng) cùng **mã 8-hex** viết tay dự phòng khi hai bên nạp đủ cọc (`AwaitingEvidence`).
  - Cả người bán (lúc đóng gói) và người mua (lúc unbox) phải đặt mã QR/giấy ghi nonce **trong cùng khung hình với món hàng**.
- **Chống hoán đổi ảnh tham chiếu (`DEC-016`):**
  - AI Agent chỉ tin ảnh niêm yết đã được ví người bán ký **EIP-191** lưu trong `UriRegistry`; client không thể tự thay ảnh tham chiếu giả khi yêu cầu xác thực.

### Slide 5 — Kiến trúc Hệ thống & Bảo mật BFF (Technical 25%)
- **Sơ đồ 4 tầng tách biệt (`frontend/` · `backend/` · `ai-pipeline/` · `contracts/`):**
  - **Frontend (`Next.js 15 App Router`):** Core Wallet / MetaMask (Wagmi) + Local Keystore Wallet (`AES-GCM`).
  - **BFF Security Layer:** `SESSION_SECRET` bắt buộc fail-closed trên Fuji `43113`, mọi request nhạy cảm đi qua proxy Next.js được ký **HMAC-SHA256 kèm nonce chống replay** (`REQUIRE_PROXY_SIGNATURE=true`) và kiểm tra CSRF (`/api/verify`, `/api/uris`, `/api/pin`).
  - **Upload & IPFS:** `/api/pin` kiểm tra **magic bytes** MIME type trước khi ghim lên Pinata và chặn mock CID ngoài mạng local `31337`.
  - **Backend & Auto-Agent:** FastAPI + SQLite WAL điều phối listing/reservation và worker `AGENT_AUTO=true` quét bằng chứng để gọi AI Pipeline.

### Slide 6 — Smart Contract State Machine & Ranh giới AI (Technical 25% + Security)
- **6 trạng thái on-chain rõ ràng:** `Created` → `AwaitingEvidence` → `Attested` → `Disputed` → `Resolved` | `Cancelled`.
- **Ranh giới quyền AI (`DEC-014`):** `onlyAgent` chỉ gọi duy nhất `attest(tradeId, riskScore, flagged, reportHash)` — không thể rút tiền, hủy kèo, hay chỉ định bên thắng.
- **Bảo vệ tiền cọc:**
  - `nonReentrant` + cơ chế pull fallback (`pendingWithdrawals` + `withdraw()`) nếu ví nhận từ chối chuyển khoản trực tiếp.
  - Tự động thoát kẹt cọc trước tranh chấp qua `cancelUnfunded()` và `cancelOnEvidenceTimeout()`.
  - `resolveClean()` do bất kỳ ai kích hoạt khi `Attested && !flagged && block.timestamp > disputeDeadline`.
- **Kiểm chứng Smart Contract:** **80/80 Foundry tests PASS**, bao gồm **2 invariant suites (`256 runs, 51,200 calls`)** bảo chứng tổng số dư hợp đồng khớp tổng cọc/rút chờ và điểm uy tín luôn nằm trong `[0, 100]`.

### Slide 7 — AI Pipeline Minh bạch & Explainable Report (Technical 25%)
- **Không hộp đen — 4 bước kiểm tra định lượng trên ảnh & video (tách keyframe):**
  1. **pHash Reuse Detection:** Kiểm tra trùng lặp với ảnh giao dịch cũ hoặc ảnh niêm yết bị dùng lại làm ảnh đóng gói (`Hamming distance <= 8`).
  2. **Nonce Verification:** Đọc mã **QR `TP1:`** chính xác trước; dự phòng **Tesseract OCR** cho mã 8-hex viết tay (`Levenshtein <= 1`).
  3. **Object Identity Verification:** Kết hợp **CLIP** embedding (hoặc HSV histogram fallback) với **ORB + RANSAC homography** (`>= 15` good inliers).
  4. **Handcrafted Risk Formula (`0..100`):**
     $$\text{raw} = 0.4 \cdot \text{reputation\_term} + 0.4 \cdot \text{identity\_term} + 0.2 \cdot \text{value\_term}$$
     - Bất kỳ `hard_flag` nào (trùng pHash, thiếu/sai nonce Seller hoặc Buyer) đẩy `riskScore >= 80` và tự động gắn cờ (`flagged = true` khi `hard_flag` hoặc `riskScore >= 70`).
- **Neo bằng chứng toán học:** Toàn bộ báo cáo chuẩn hóa JSON được băm `keccak256` thành `reportHash` lưu on-chain để mọi người kiểm chứng lại trên trang `/trade/[id]/report`.

### Slide 8 — Tích hợp Avalanche C-Chain & Hướng mở rộng (Avalanche 25%)
- **Triển khai thực tế trên Avalanche Fuji Testnet (`Chain ID: 43113`, block `60980241`):**
  - `Escrow`: `0x19D053c84941411888f5b9e40c854365fdd4eb00`
  - `CollectibleToken (CDU)`: `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`
  - Cửa sổ cấu hình cho bản demo Fuji: `evidenceWindow = 600s`, `attestWindow = 600s`, `disputeWindow = 90s` (cấu hình Production theo `DEC-008`: 3 ngày / 1 ngày / 2 ngày).
- **Lợi thế từ Avalanche C-Chain:** Thời gian finality nhanh (~1–2 giây) cho phép 2 bên nạp cọc, nộp hash bằng chứng, AI `attest()` và hoàn cọc mượt mà trong một phiên giao dịch trực tiếp.
- **Roadmap sau Hackathon *(chưa triển khai trong repo hiện tại)*:** Tỉ lệ cọc linh hoạt theo uy tín (`VAI3_DYNAMIC_DEPOSIT_SPEC.md`) và mô hình mạng riêng Avalanche L1 cho sàn quy mô lớn (`L1_MODULE_SPEC.md`).

### Slide 9 — Giao diện & Trải nghiệm Người dùng (UI/UX 10%)
- **Hành trình người dùng liền mạch qua các trang đã xây dựng:**
  - **`/` & `/listings/[id]`:** Duyệt đồ sưu tầm thật, xem rõ số AVAX cọc 30% + token `CDU`, gửi yêu cầu mua với đồng hồ giữ chỗ 30 phút.
  - **`/sell` & `/trades`:** Người bán quản lý tin đăng, duyệt yêu cầu và bấm tạo Escrow on-chain + ký xác nhận ảnh EIP-191 một chạm.
  - **`/trade/[id]` & `/trade/[id]/report`:** Timeline 5 bước trực quan, `NonceCard` tải QR/sao chép 8-hex, `AgentStatusCard` cập nhật trạng thái AI Agent tự động theo thời gian thực, và nút đối chiếu `keccak256` on-chain.
  - **`/admin`:** Giao diện trọng tài cho Owner chọn 1 trong 3 phán quyết (`Phạt Seller vi phạm`, `Phạt Buyer vi phạm`, `Hoà giải / Không ai sai`).

### Slide 10 — Minh bạch Giới hạn & Kết quả Kiểm thử (Security & Quality)
- **Kết quả kiểm thử trên commit `origin/main` (`f6b909a`):**
  - **Smart Contract (`forge test`):** **80 passed, 0 failed, 0 skipped** (gồm 2 invariant `256 runs, 51,200 calls`).
  - **Backend + AI Pipeline (`pytest -rs`):** **185 passed, 0 failed, 0 skipped** (gồm tích hợp Anvil thật).
  - **Frontend (`npm test` / `tsc` / `build`):** **67 passed, 0 failed, 0 skipped**; `tsc --noEmit` và `next build` (27 routes) exit `0`.
  - *(Minh bạch tồn đọng: `npm run lint`/ESLint chưa cấu hình; `npm audit --omit=dev` còn 22 advisory gián tiếp yêu cầu nâng major Next 16/wagmi 3).*
- **Giới hạn hiện tại được công bố thẳng thắn:**
  - Hợp đồng chỉ giữ **cọc 30%** (không thay thế thanh toán 100% giá trị hàng); trọng tài `Disputed` vẫn là **Owner EOA tập trung** và chưa có timeout thoát trạng thái `Disputed` nếu Owner vắng mặt; dữ liệu IPFS công khai vĩnh viễn; hệ thống hiện chạy thử nghiệm trên **Fuji Testnet (`43113`)**.

### Slide 11 — Demo Live & Tài liệu Nộp bài (Presentation 10%)
- **Tóm tắt 2 kịch bản trong Video Demo:**
  1. **Kịch bản Sạch:** Tạo listing → Giữ chỗ 30 phút → Cọc 30% AVAX hai chiều → Chụp/tải QR Nonce → AI Agent `attest()` (`flagged=false`) → Hết `90s` bấm `Hoàn cọc hai bên (Resolve Clean)` (`+1` uy tín).
  2. **Kịch bản Gian lận & Phân xử:** Bằng chứng sai/thiếu nonce → AI `attest()` (`riskScore >= 80, flagged=true`) → `Mở khiếu nại tranh chấp` → Owner vào `/admin` phạt **5% cọc** chuyển cho bên bị hại (`-10` / `+5` uy tín).
- **Links đối chiếu:**
  - GitHub Repository *(Bắt buộc)*: `[Điền link GitHub công khai hoặc mời tuantqse90]`
  - Pitch Deck & Demo Video *(Bắt buộc)*: `[Điền link công khai mở được ẩn danh]`
  - Snowtrace Escrow (`43113`) *(Bắt buộc)*: `https://testnet.snowtrace.io/address/0x19D053c84941411888f5b9e40c854365fdd4eb00`
  - Snowtrace Token `CDU` (`43113`) *(Bắt buộc)*: `https://testnet.snowtrace.io/address/0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`
  - Live Fuji dApp *(OPTIONAL)*: `[Điền URL công khai nếu đã deploy, hoặc ghi rõ chạy demo local kết nối Fuji 43113]`

---

## Phần B — Kịch bản Video Demo (2 phút 30 giây – 2 phút 45 giây)

> **Nguyên tắc quay & cắt dựng trung thực:** Trong thời lượng 2–3 phút, video **được phép cắt dựng / tua nhanh (jump cut / time-lapse)** khoảng thời gian chờ xác nhận giao dịch blockchain, thời gian AI Agent quét nền và cửa sổ chờ `DISPUTE_WINDOW` `90s`. Tuy nhiên, toàn bộ kết quả hiển thị trên UI (`riskScore`, `flagged`, số dư hoàn cọc, mức phạt `5%`, điểm uy tín) và màn hình/link tx trên **Snowtrace Fuji (`43113`)** **bắt buộc phản ánh trung thực kết quả thực tế** đã xảy ra on-chain, không chỉnh sửa hay giả lập dữ liệu.

### 0. Chuẩn bị bắt buộc trước khi bấm máy

> **Lưu ý quan trọng từ kết quả kiểm tra Fuji (`17/11/2026`, `nextTradeId = 5`):** Trên contract `0x19D053c8...` hiện có `Trade #1`, `#2` và `#4` ở trạng thái `Cancelled` (`Trade #4` đã hoàn cọc timeout qua [`0x82ab62...4bbd`](https://testnet.snowtrace.io/tx/0x82ab6274f1cbc55ed7dfc07ec397896e117c9fd7ebcc9daedd8e2f56aef54bbd), số dư contract `Escrow` hiện `0.000000 AVAX`), và `Trade #3` ở trạng thái `ResolvedDispute` với `violator = 0x0000...`, `penaltyAmount = 0`. **Chưa có bằng chứng on-chain của `ResolvedClean` lẫn phạt 5% (`penaltyAmount > 0`).** Vì vậy, trong buổi quay video này **bắt buộc thực hiện trọn vẹn 2 giao dịch thật trên Fuji**: 1 giao dịch **Resolve Clean** và 1 giao dịch **Flagged + Phạt 5%**.

- **Ví cần chuẩn bị (4 địa chỉ tách biệt trên Avalanche Fuji `43113`):**
  1. **Seller Wallet:** Có `>= 0.25 AVAX` Fuji (khác ví Owner và Buyer).
  2. **Buyer Wallet:** Có `>= 0.25 AVAX` Fuji (khác ví Owner và Seller).
  3. **Owner / Arbiter Wallet (`0xCa76...39Eb`):** Hiện có `~0.10 AVAX` — đủ ký `resolveDispute`, khuyến nghị nạp thêm từ faucet để dư gas dự phòng.
  4. **AI Agent Wallet (`0x579e...7081`):** Hiện có `0.420000 AVAX`, chạy nền với `AGENT_AUTO=true` *(khuyến nghị nạp thêm `>= 0.1 AVAX` Faucet nếu cần đạt ngưỡng `>= 0.5 AVAX` trước khi quay demo)*.
- **Dịch vụ đang bật:** Backend FastAPI kết nối Fuji (`ALLOW_LOCAL_HOSTS=false`, `ENFORCE_EVIDENCE_HASH=true`, `REQUIRE_PROXY_SIGNATURE=true`, nên cấu hình `IPFS_GATEWAY` dự phòng tránh 429) + Frontend Next.js.
- **Đạo cụ quay / ảnh kiểm thử:**
  - 1 món đồ sưu tầm thật (ví dụ mô hình/LEGO/figure) + 2–3 ảnh niêm yết rõ nét.
  - Kịch bản 1 (Sạch): Sau khi hai bên cọc xong, mở QR từ `NonceCard` trên màn hình phụ/điện thoại (hoặc viết rõ 8 ký tự hex bằng bút dạ đen lên giấy trắng) đặt cạnh món đồ thật để chụp ảnh Seller đóng gói và ảnh/video Buyer mở hộp.
  - Kịch bản 2 (Gian lận): 1 ảnh thiếu mã nonce hoặc lấy sai sản phẩm để AI chấm `hard_flag` (`riskScore >= 80`, `flagged = true`).

### 1. Timeline chi tiết Video Demo (~2 phút 40 giây)

| Mốc thời gian | Màn hình / Góc quay | Thao tác thực tế trên UI | Lời thoại (Voiceover gợi ý) |
|---|---|---|---|
| **0:00 – 0:20** | Slide 1–2 hoặc màn hình Marketplace `/` | Mở trang chủ `/`, lướt nhẹ danh mục sản phẩm sưu tầm | *"Giao dịch đồ sưu tầm P2P thường gãy ở hai điểm: bên mua sợ chuyển cọc xong mất hút, bên bán sợ tráo hàng rồi dùng ảnh mạng đòi bồi thường. Đây là **Escrow Marketplace** — sàn đồ sưu tầm kết hợp ký quỹ cọc 30% AVAX trên Avalanche Fuji và AI Agent xác thực bằng chứng trong khung hình."* |
| **0:20 – 0:50** | `/sell` → `/listings/[id]` → `/sell?tab=requests` | 1. Seller đăng bán món đồ sưu tầm với 2 ảnh thật và giá (ví dụ `0.1 AVAX`).<br>2. Đổi sang trình duyệt Buyer mở `/listings/[id]`, chỉ vào box **30% AVAX & CDU**, bấm **`Gửi yêu cầu mua`** (hiện đồng hồ giữ chỗ 30 phút).<br>3. Seller vào `/sell?tab=requests`, bấm chấp nhận rồi bấm **`Tạo Escrow on-chain & Liên kết`** và ký EIP-191 xác nhận ảnh niêm yết (miễn phí gas). | *"Thay vì tạo contract tràn lan gây tốn gas, sàn vận hành danh mục và giữ chỗ 30 phút off-chain trên SQLite. Khi người bán đồng ý, hệ thống tạo Escrow trên Avalanche Fuji và người bán ký xác nhận chính chủ ảnh niêm yết bằng EIP-191 — đảm bảo AI sau này không thể bị lừa bằng ảnh tham chiếu giả."* |
| **0:50 – 1:30** | `/trade/[id]` (2 cửa sổ Buyer & Seller cạnh nhau) | 1. Seller và Buyer lần lượt nạp đúng **30% AVAX** (`deposit`). *[Cắt gọn lúc chờ xác nhận tx]*. Hợp đồng chuyển `AwaitingEvidence` và mint token `CDU` 1:1.<br>2. Trỏ chuột vào **`NonceCard`** mới mở khóa (hiện mã **QR `TP1:`** và **8-hex**).<br>3. Cắt cảnh thực tế đặt điện thoại hiện QR cạnh hộp hàng / quay ảnh mở hộp, upload lên Pinata IPFS và bấm `submitEvidence` cho cả hai phía. | *"Cả hai bên cùng ký quỹ 30% AVAX theo cơ chế Đặt cọc bảo đảm (lấy cảm hứng từ BLDS 2015 Điều 328) — không giam 100% tiền hàng nhưng đủ tạo ràng buộc kinh tế hai chiều. Khi đủ cọc, thẻ `NonceCard` mở khóa mã QR `TP1:` do Smart Contract sinh gắn với đúng giao dịch này. Người bán chụp gói hàng cùng mã QR, người mua chụp lúc mở hộp và neo hash bằng chứng lên blockchain."* |
| **1:30 – 1:55** | `/trade/[id]` (`AgentStatusCard`) → `/trade/[id]/report` → Snowtrace | 1. *[Cắt gọn lúc AI quét nền]* Thẻ **`AI Agent tự động`** chuyển trạng thái phân tích xong đúng kết quả thực tế (ví dụ `flagged = false`, `riskScore < 70`) và hiện hash tx `attest()`.<br>2. Bấm **`Xem Báo Cáo Giải Trình AI (Explainable Report)`**, bấm nút đối chiếu **`keccak256` Report on-chain** hiện khớp hoàn toàn + các điểm khớp ORB.<br>3. *[Cắt nhanh đoạn chờ hết `90s` `DISPUTE_WINDOW`]* Bấm **`Hoàn cọc hai bên (Resolve Clean)`** và xác nhận tx thật trên Fuji. | *"Ngay khi đủ hai bằng chứng, AI Agent chạy nền kiểm tra trùng lặp pHash, đọc mã QR nonce, so khớp vật thể bằng CLIP và ORB rồi chỉ gọi duy nhất hàm `attest()` để neo `reportHash` lên Fuji. AI không cầm tiền và không tự xử phạt. Nếu không ai khiếu nại sau cửa sổ tranh chấp, bất kỳ ai cũng có thể kích hoạt `Resolve Clean` để hoàn cọc hai bên và cộng `+1` uy tín."* |
| **1:55 – 2:28** | `/trade/[id]` (Trade #GianLận) → `/admin` → Snowtrace | 1. Chuyển sang giao dịch thứ hai thực tế trên Fuji (đã nộp ảnh thiếu nonce / sai vật thể, cắt gọn bước nạp cọc) → `AgentStatusCard` hiện `riskScore >= 80`, `flagged = true`.<br>2. Bấm **`Mở khiếu nại tranh chấp (File Complaint)`**.<br>3. Chuyển sang ví Owner mở `/admin`, bấm **`Phạt Seller vi phạm`** (hoặc `Phạt Buyer vi phạm`), xác nhận tx `resolveDispute`.<br>4. Mở giao dịch thật trên **Snowtrace Fuji**, zoom vào sự kiện `ResolvedDispute` có `penaltyAmount > 0` (5% cọc) và điểm uy tín `-10` / `+5`. | *"Ngược lại, ở giao dịch gửi ảnh không có mã nonce hợp lệ, pipeline đẩy điểm rủi ro lên tối thiểu 80 và gắn cờ cảnh báo. Khi chuyển sang tranh chấp, trọng tài Owner vào `/admin` đối chiếu báo cáo AI và gọi `resolveDispute` phạt 5% tiền cọc bên vi phạm chuyển cho bên bị hại, đồng thời cập nhật uy tín `-10` và `+5` minh bạch trên Snowtrace."* |
| **2:28 – 2:40** | Slide 11 / Màn hình tổng kết | Hiển thị kiến trúc tổng quan, số liệu **80 Foundry + 185 Python + 67 Frontend tests** và link GitHub / Fuji Contract. | *"Escrow Marketplace hoàn thiện full-stack trên Avalanche Fuji với 80 bài test Smart Contract, 185 test Backend/AI và 67 test Frontend. Toàn bộ mã nguồn và giao dịch on-chain đều được công khai để kiểm chứng. Cảm ơn Ban Giám Khảo!"* |

---

## Phần C — Checklist Demo Fuji & Nộp bài Tóm tắt

1. **Bắt buộc (`REQUIRED`) trước khi quay video & nộp bài:**
   - [ ] Quay 2 giao dịch thật trên Avalanche Fuji (`43113`) để tạo bằng chứng tx mới: **1 `ResolvedClean`** và **1 `ResolvedDispute` có `violator != address(0)`, `penaltyAmount > 0`**.
   - [ ] Điền đủ các link bắt buộc vào `README.md` §5 (`Demo Video`, `Pitch Deck / Slide`) và gỡ `PENDING-OWNER`.
   - [ ] Kiểm tra tất cả link GitHub, Canva/Google Slides, YouTube/Google Drive đều mở được ở **chế độ ẩn danh không cần đăng nhập** (hoặc mời `tuantqse90` nếu repo private).
   - [ ] Đảm bảo chạy demo Fuji luôn bật cấu hình an toàn: `ALLOW_LOCAL_HOSTS=false`, `ENFORCE_EVIDENCE_HASH=true`, `REQUIRE_PROXY_SIGNATURE=true`, ví Agent `>= 0.5 AVAX`.
2. **Tùy chọn (`OPTIONAL`):**
   - [ ] **Live Fuji dApp URL:** **Không bắt buộc** có URL công khai nếu chưa triển khai; khi demo local chỉ cần ghi rõ phương án chạy local kết nối Avalanche Fuji (`43113`). Nếu deploy public trước khi nộp thì bổ sung URL vào `README.md` §5.
