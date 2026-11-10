# SLIDE & VIDEO SCRIPT — UniHack 2026 (Track: AI Agents and Security)

> Tên dự án chưa chốt → dùng placeholder **[TÊN DỰ ÁN]**. Category demo chưa chốt → **[CATEGORY]**
> (vd thẻ bài Pokémon/One Piece). Thay trước khi xuất slide.
> Mọi số liệu kỹ thuật dưới đây lấy từ code/test thật trong repo — cập nhật lại nếu đổi.

## A. Slide (12–13 slide, bám 6 tiêu chí chấm)

Mỗi slide ghi: **tiêu chí được chấm** · nội dung · hình gợi ý. Tổng thời lượng thuyết trình 5–7 phút.

| # | Tiêu chí | Tiêu đề | Nội dung chính | Hình |
|---|---|---|---|---|
| 1 | Presentation | [TÊN DỰ ÁN] — Mua bán đồ sưu tầm không cần trung gian | Tagline 1 dòng; tên, track, logo Avalanche | Ảnh món [CATEGORY] + tờ giấy ghi nonce |
| 2 | Impact | Vấn đề | Lừa đảo P2P đồ sưu tầm trên Facebook/Zalo: nhận tiền không gửi hàng, gửi hàng giả, dùng ảnh mạng. Giải pháp hiện có: "trung gian uy tín" (tốn phí, cũng có thể lừa). Thêm 1–2 số liệu/ảnh chụp bài cảnh báo lừa đảo (Quốc tự thu thập, ghi nguồn) | Collage ảnh bài cảnh báo (che tên) |
| 3 | Impact | Người dùng & use case | Sinh viên mua bán [CATEGORY] giá 200k–5tr; cả hai đều sợ bên kia | Persona 2 người |
| 4 | Creativity | Giải pháp trong 1 hình | Cọc 2 bên ≤30% → chụp ảnh có **nonce** → **AI agent** xác thực → hợp đồng **tự giải ngân** hoặc phạt 5% | Sơ đồ 5 bước (flow mục 3 CLAUDE.md) |
| 5 | Creativity | Differentiator: Nonce-in-frame + AI | Nonce sinh on-chain sau khi đủ cọc ⇒ ảnh cũ/ảnh mạng **không thể** có nonce này. AI: pHash (ảnh tái sử dụng), ORB+RANSAC (cùng MỘT món), OCR nonce (cho phép 1 lỗi OCR). So sánh: TrustPact cần broker/người duyệt — ta không | Ảnh keypoint match thật từ report + ô nonce khoanh đỏ |
| 6 | Technical | Kiến trúc | Frontend (Next.js+wagmi) ↔ Escrow.sol + CollectibleToken.sol (Fuji) ↔ AI Attest Service (FastAPI, ví agent riêng gọi `attest()`) ↔ IPFS | Sơ đồ khối |
| 7 | Technical | Smart contract an toàn | State machine 6 trạng thái; checks-effects-interactions + ReentrancyGuard; push-payment có fallback `withdraw()` (bên xấu không chặn được giải ngân); token cọc non-transferable; **81 test Foundry** gồm fuzz + invariant (51.200 lời gọi ngẫu nhiên: số AVAX trong escrow luôn = cọc đang khoá) | Screenshot `forge test` xanh |
| 8 | Technical | AI pipeline minh bạch | Công thức rủi ro viết tay, không blackbox: `0.4·(100−uy tín) + 0.4·(100−2·min(inliers,50)) + 0.2·giá trị`, cờ cứng ⇒ ≥80. Report JSON được **keccak256 neo on-chain** ⇒ không ai sửa được. 96 test Python + integration test với chain thật | Screenshot Explainable Report |
| 9 | Avalanche | Vì sao Avalanche | Finality < 2s ⇒ trạng thái giao dịch cập nhật gần như tức thời trong demo; phí thấp ⇒ cọc nhỏ (vài trăm nghìn) vẫn hợp lý; deploy Fuji (ghi địa chỉ contract + link Snowtrace); roadmap L1 zero-gas cho reputation qua ICM (docs/L1_MODULE_SPEC.md) | Logo + địa chỉ contract + QR Snowtrace |
| 10 | Impact | Pháp lý & kinh tế | Cọc = "Ký Cược" theo **Điều 328 BLDS 2015** — bảo đảm nghĩa vụ, không phải đầu tư; token CDU mint/burn 1:1, không lợi tức, không chuyển nhượng. Phạt 5% bên vi phạm; uy tín 0–100 (+1 sạch, −10 vi phạm, +5 bị hại) | Bảng nhỏ |
| 11 | UI/UX | Demo | (Chiếu video 2–3 phút hoặc demo live) | — |
| 12 | Presentation | Roadmap | Cọc động theo uy tín (10–30%, docs/VAI3), agent lắng nghe event tự chạy, L1 reputation, mở rộng category | Timeline |
| 13 | Presentation | Cảm ơn + link | GitHub, video, slide (đều mở công khai) | QR |

Mẹo trình bày: mỗi slide ≤ 25 chữ chính; con số to (81 test, <2s, 30%, 5%); không đọc slide.

## B. Kịch bản video demo (2:30–2:50)

Chuẩn bị trước khi quay:
- Deploy bản demo trên Fuji với cửa sổ ngắn: `EVIDENCE_WINDOW_SECS=600 ATTEST_WINDOW_SECS=600 DISPUTE_WINDOW_SECS=90` (để quay được bước giải ngân không phải chờ 2 ngày; nói rõ trong video "bản demo dùng cửa sổ 90 giây, production 2 ngày").
- 2 ví (Seller, Buyer) trên 2 profile trình duyệt cạnh nhau, đã có AVAX Fuji; ví Agent đã `setAgent`, backend đang chạy.
- 1 món [CATEGORY] thật, giấy trắng, bút dạ đen. Ánh sáng tốt.
- Màn hình 1920×1080, zoom trình duyệt 125%, tắt thông báo.

| Thời điểm | Cảnh | Trên màn hình | Lời thoại (tóm ý) |
|---|---|---|---|
| 0:00–0:15 | Hook | Ảnh chụp màn hình bài "bị lừa mua thẻ bài" (che tên) | "Mua đồ sưu tầm online, ai cũng sợ bên kia lừa. [TÊN DỰ ÁN] giải quyết mà không cần trung gian." |
| 0:15–0:35 | Tạo giao dịch | Seller: form tạo trade, ảnh listing, ký `createTrade` | "Người bán tạo giao dịch, giá 1 AVAX. Hợp đồng yêu cầu mỗi bên cọc 30%." |
| 0:35–0:50 | Nạp cọc | Seller nạp 0.3 → Buyer nạp 0.3 → **NonceCard hiện ra** (zoom) | "Khi đủ cọc, hợp đồng sinh một mã nonce ngẫu nhiên — mã này chưa từng tồn tại trước đó." |
| 0:50–1:15 | **Nonce + bằng chứng (nhấn mạnh)** | Quay tay viết nonce lên giấy, đặt cạnh món hàng, chụp; upload; Buyer quay clip mở hộp có giấy nonce; upload | "Ảnh đóng gói và video mở hộp phải có mã này. Ảnh lấy trên mạng hay ảnh cũ không thể có nó." |
| 1:15–1:45 | AI xác thực | Bấm "Chạy AI xác thực" → checklist chạy → **Explainable Report**: ✓ nonce seller, ✓ nonce buyer (đọc từ khung video), ✓ không tái sử dụng, ✓ cùng món (ảnh keypoint xanh), risk 22 | "Agent AI kiểm tra 4 thứ, giải thích từng kết luận, rồi tự ký giao dịch attest lên Avalanche." |
| 1:45–1:55 | Verify on-chain | Bấm "Verify on-chain" → ✓; mở tx trên Snowtrace | "Report được băm và neo on-chain — không ai sửa được sau này." |
| 1:55–2:10 | Giải ngân | Countdown hết → bấm Giải ngân → số dư 2 ví hoàn cọc, uy tín 50→51 | "Không khiếu nại thì hợp đồng tự hoàn cọc. Không ai cầm tiền của ai." |
| 2:10–2:35 | Kịch bản lừa đảo | Trade 2: buyer gửi video **không có nonce** (hoặc seller dùng lại ảnh trade 1) → Report đỏ, risk 80, flagged → Mở tranh chấp → Admin chọn bên vi phạm → phạt 5%, uy tín −10 | "Nếu bằng chứng gian lận, AI gắn cờ ngay, bên vi phạm mất 5% cọc và uy tín." |
| 2:35–2:50 | Kết | Slide kiến trúc + "81 contract tests · 96 AI/backend tests · Avalanche Fuji" + link GitHub | "[TÊN DỰ ÁN] — escrow không trung gian, AI làm chứng, Avalanche làm trọng tài." |

Nguyên tắc quay:
- Nonce + OCR là differentiator ⇒ **luôn zoom rõ** NonceCard và khung hình có giấy nonce; trong report, zoom vào dòng "expected 37a27ccc · đọc được 37a27ccc".
- Cắt bỏ thời gian chờ tx/AI (giữ 1–2 giây spinner để thấy là thật).
- Phụ đề tiếng Anh nếu có thời gian (giám khảo có thể không đọc tiếng Việt).
- Nếu demo live trên sân khấu hỏng mạng: có sẵn bản quay; có sẵn anvil local + `backend/scripts/demo_local.py` chạy được không cần Internet (trừ IPFS).

## C. Checklist nộp bài (trước 21/11 23:59)

- [ ] GitHub public (hoặc private + collaborator `tuantqse90`), README có link video + slide + địa chỉ contract Fuji.
- [ ] Slide Canva/Google Slides **chế độ ai có link cũng xem được**.
- [ ] Video YouTube (unlisted OK) / Drive (quyền xem công khai), 2–3 phút.
- [ ] Mở từng link bằng **cửa sổ ẩn danh**.
- [ ] Không có private key / JWT trong repo (`git log -p | grep -i "private"` trước khi public).
- [ ] Bấm Submit trên team1vn.xyz.
