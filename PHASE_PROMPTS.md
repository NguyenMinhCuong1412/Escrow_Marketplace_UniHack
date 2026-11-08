# Escrow Marketplace — Đánh giá dự án & Prompt cho các Phase tiếp theo

> Cập nhật: 05/11/2026 · Mốc cứng: **Feature freeze 16/11** · **Nộp bài 21/11 23:59** · Demo Day 30/11
> Cách dùng: mỗi phase = 1 prompt dán nguyên văn vào Claude Code / Antigravity (mở ở thư mục gốc repo). Luôn dán kèm **Prompt chung (P0)** ở đầu.

---

## A. Đánh giá hiện trạng

### A1. Đã kiểm chứng
- Chạy lại được: **82 test Python pass** (59 AI pipeline + 23 backend unit). Foundry/anvil không có trong môi trường đánh giá nên 81 test contract và 14 integration test **chưa tự chạy lại được** — dựa vào báo cáo của bạn.
- Không có `.env` hay private key thật trong zip. Các chuỗi `0x…64 hex` trong `demo_local.py`, `e2e_anvil.sh`, test là **key mặc định công khai của anvil** → an toàn, miễn là không dùng ví thật có tiền.
- Contract gọn (373 dòng), có reentrancy guard, pull-payment (`withdraw`), cửa sổ thời gian immutable. Hướng đi hợp lý.

### A2. Điểm mạnh
- Backend/AI/contract đã test sâu, có E2E local, có Dockerfile.
- Spec frontend rất chi tiết (407 dòng, khớp ABI) → AI khác code được ngay.
- Backend lấy trạng thái từ chain và ép `evidenceHash` khớp on-chain (không tin dữ liệu client).

### A3. Rủi ro / lỗ hổng (xếp theo mức ảnh hưởng đến điểm)

| # | Vấn đề | Ảnh hưởng | Mức |
|---|---|---|---|
| 1 | **Chưa có frontend** (UI/UX 10% + Demo, và giám khảo cần thứ để bấm) | Rủi ro lớn nhất về thời gian | 🔴 |
| 2 | **Chưa deploy Fuji** → "Avalanche Integration" (25%) hiện bằng 0 trên thực tế | Mất điểm nặng nhất | 🔴 |
| 3 | **Avalanche Integration mỏng**: chỉ là "deploy EVM lên Fuji". L1/ICM đã bỏ. Cần thêm tối thiểu: verify trên Snowtrace, link explorer trong UI, Core wallet, ghi rõ vì sao chọn Avalanche | 25% điểm | 🔴 |
| 4 | **SSRF / lạm dụng backend**: `ALLOWED_HOSTS` mặc định **rỗng = cho mọi host**; `requests.get` theo redirect; `/verify-evidence` không xác thực; `CORS_ORIGINS` mặc định `*`. Track của bạn là *AI Agents **and Security*** — giám khảo sẽ soi chỗ này | Technical 25% | 🟠 |
| 5 | **`listing_image_url` không neo on-chain** (chỉ ảnh seller/buyer được ép khớp hash). Người gọi API có thể đưa ảnh listing tuỳ ý để lái kết quả pHash/ORB | Độ tin cậy pipeline | 🟠 |
| 6 | **`resolveDispute` chỉ `onlyOwner`** = 1 người phân xử, mâu thuẫn với pitch "không cần broker thứ 3". Cần câu trả lời rõ (vd: owner = multisig/agent, hoặc nói thẳng là "arbiter tối thiểu, roadmap: AI + DAO jury") | Creativity/Impact, câu hỏi của giám khảo | 🟠 |
| 7 | **Ngưỡng AI chưa hiệu chỉnh trên ảnh thật** (chỉ ảnh tổng hợp, OCR ~99% trên ảnh in). Ảnh viết tay + chụp điện thoại có thể rớt mạnh → demo live dễ hỏng | Technical, Demo | 🟠 |
| 8 | **Backend cần chạy công khai** cho demo (hiện chỉ localhost). Giám khảo không chạy được anvil | Demo | 🟠 |
| 9 | **Mất tài liệu khi gộp KIT**: `CLAUDE.md` mới chỉ còn ~45 dòng; nhật ký **12 bug đã sửa**, thông tin TrustPact và kế hoạch phase cũ không còn ở đâu rõ ràng (chỉ còn 1 dòng trong `BUSINESS_REQUIREMENTS.md`). `README.md` và `FIRST_PROMPT_FOR_CLAUDE_CODE.md` cũng **không còn trong zip mới** → repo public sẽ thiếu README | Presentation, bảo trì | 🟡 |
| 10 | Chưa chốt: tên dự án, category demo (Q-011, Q-012), người code frontend (Q-013). Q-009 (git history có secret?) chưa kiểm | Chặn slide/video/phân công | 🟡 |
| 11 | Xung đột nhỏ: `AGENTS.md` cấm sửa `CLAUDE.md`, nhưng `CLAUDE.md` đã được rút gọn thành mục lục → cho phép agent cập nhật **KIT docs**, không cần động `CLAUDE.md` | Vận hành | 🟡 |
| 12 | Không có CI, `contracts/deployments/31337.json` bị gitignore (đúng) nhưng chưa có cơ chế xuất `43113.json` cho frontend | Tích hợp | 🟡 |

### A4. Nhận định về timeline
Còn **11 ngày** đến freeze. Đường găng: **Deploy Fuji → Frontend → Nối E2E**. Frontend không phụ thuộc Fuji để bắt đầu (dùng anvil), nên **chạy song song**. Việc chọn category/tên có thể làm trong lúc chờ.

### A5. Kế hoạch phase đề xuất

| Phase | Nội dung | Ai | Hạn |
|---|---|---|---|
| **3A** | Hardening backend + đồng bộ tài liệu KIT/README | Claude Code | 07/11 |
| **3B** | Deploy Fuji + verify Snowtrace + deploy backend public | Quốc + Claude Code | 08/11 |
| **4A** | Frontend: khung, ví, đọc dữ liệu | AI/Cường/Vũ | 09/11 |
| **4B** | Frontend: luồng ghi (tạo, cọc, bằng chứng, resolve, dispute) | như trên | 12/11 |
| **4C** | Frontend: Evidence Report + trang admin + hoàn thiện UI | như trên | 14/11 |
| **5** | Hiệu chỉnh AI trên ảnh thật (chạy song song 4A–4C) | Quốc + Claude Code | 12/11 |
| **6** | Nối E2E trên Fuji + Avalanche Integration + quay thử | cả team | 15/11 |
| **7** | Freeze → README, slide, video, kiểm tra link | cả team | 17–20/11 |

Stretch (Vai3 cọc động, event-listener agent, L1): **chỉ làm sau 16/11 nếu mọi thứ trên xong** — không khuyến nghị.

---

## P0. PROMPT CHUNG (dán ở đầu MỌI prompt phase bên dưới)

```
Bạn đang làm trong repo Escrow Marketplace (UniHack 2026, Track AI Agents and Security, Avalanche Fuji).

BẮT BUỘC ĐỌC TRƯỚC KHI LÀM:
1. CLAUDE.md (mục lục) rồi toàn bộ Escrow_Marketplace_AI_Operating_Kit/docs/context/*.md, đặc biệt CURRENT_STATUS.md, DECISION_LOG.md, OPEN_QUESTIONS.md, BUSINESS_REQUIREMENTS.md.
2. Escrow_Marketplace_AI_Operating_Kit/AGENTS.md và các rule trong .agents/rules/ liên quan tới phạm vi task.
3. Nếu có mâu thuẫn giữa các file: code thắng tài liệu; DECISION_LOG thắng mọi file khác. Báo lại mâu thuẫn, đừng tự chọn im lặng.

QUY TẮC:
- Không hỏi lại những gì đã ghi trong KIT docs. Chỉ hỏi khi thiếu thông tin thật sự chặn việc.
- Làm trên nhánh git riêng: phase/<tên-phase>. Không merge, không force-push, không xoá file ngoài phạm vi.
- Không đọc/in/commit private key, seed phrase, .env thật. Chỉ dùng .env.example. Chỉ testnet (Fuji 43113) hoặc anvil (31337). Không mainnet.
- Giữ KISS/YAGNI. Không thêm dependency hay thư mục mới nếu không cần; nếu cần, nêu lý do trong báo cáo.
- KHÔNG sửa contracts/src/*.sol trừ khi prompt phase ghi rõ. Nếu sửa: phải chạy lại toàn bộ `forge test` và giữ số test pass ≥ 81.
- AI không bao giờ là nguồn quyết định duy nhất để giải ngân; contract + quyền hạn xác định là nguồn cuối.
- Không báo "đã pass" nếu chưa chạy. Ghi đúng lệnh đã chạy và kết quả.

KẾT THÚC MỖI PHASE:
- Cập nhật Escrow_Marketplace_AI_Operating_Kit/docs/context/CURRENT_STATUS.md (checklist + bảng module + update log có ngày) và DECISION_LOG.md/OPEN_QUESTIONS.md nếu có quyết định/câu hỏi mới. KHÔNG cần sửa CLAUDE.md (chỉ là mục lục).
- Báo cáo ngắn gồm: đã làm gì, file đã đổi, lệnh test + kết quả, việc tôi (Owner) phải tự làm, rủi ro còn lại, đề xuất bước tiếp.
- Nhắc tôi về deadline: feature freeze 16/11, nộp 21/11 23:59 giờ VN.
```

---

## PHASE 3A — Hardening backend + đồng bộ tài liệu

```
[Dán P0 trước]

PHASE 3A — HARDENING BACKEND & ĐỒNG BỘ TÀI LIỆU (nhánh phase/3a-hardening)

Bối cảnh: audit cho thấy backend/attest_service.py có các điểm yếu mà track "AI Agents and Security" sẽ bị soi:
(a) ALLOWED_HOSTS mặc định rỗng = cho mọi host → SSRF; requests.get đang theo redirect; không chặn IP nội bộ/loopback/link-local/metadata.
(b) /verify-evidence không có xác thực; CORS_ORIGINS mặc định "*"; không rate limit.
(c) listing_image_url không được neo on-chain nên người gọi có thể đưa ảnh listing tuỳ ý.

Phạm vi được sửa: backend/**, ai-pipeline/** (chỉ nếu cần), backend/tests/**, .env.example. KHÔNG sửa contracts/.

Việc cần làm:
1. SSRF: 
   - Mặc định chỉ cho phép host từ ipfs_gateway cấu hình (và host trong ALLOWED_HOSTS); host khác → 422. Giữ cờ rõ ràng để dev local nới lỏng (vd ALLOW_LOCAL_HOSTS=true, mặc định false).
   - Resolve DNS rồi chặn IP private/loopback/link-local/reserved (cả IPv6) trước khi tải; tắt follow redirect (allow_redirects=False) hoặc kiểm tra lại từng bước redirect.
   - Giữ giới hạn dung lượng + timeout hiện có; thêm kiểm tra Content-Type thuộc whitelist.
2. Xác thực + giới hạn: thêm header API key đơn giản (X-API-Key từ biến môi trường ATTEST_API_KEY) bắt buộc cho POST /verify-evidence (GET /health, /report, /trade vẫn công khai). Thêm rate limit đơn giản theo IP (không thêm dependency nặng nếu có thể làm gọn bằng bộ nhớ trong). CORS_ORIGINS mặc định rỗng (không "*"); doc rõ cách bật cho frontend.
3. Listing image: chọn phương án KHÔNG đụng contract: yêu cầu listing_image_url phải là ipfs://CID, và backend ghi lại hash của nó vào report (listing_hash) để lộ rõ ra người xem; ghi trong tài liệu hạn chế còn lại ("listing chưa neo on-chain — roadmap: thêm listingHash vào createTrade") vào DECISION_LOG dưới dạng PROPOSED. Không tự sửa contract.
4. Test: thêm test cho mọi thay đổi trên (host bị chặn, IP nội bộ bị chặn, redirect bị chặn, thiếu/sai API key → 401, CORS). Giữ nguyên 59 + 37 test cũ đều pass (chạy `python -m pytest`; integration cần anvil + Tesseract).
5. Cập nhật backend/.env.example và Dockerfile cho cấu hình mới (không thêm secret thật).
6. Tài liệu (sửa trực tiếp file, không viết lại từ đầu):
   - Khôi phục nhật ký "12 bug bảo mật đã sửa" (reentrancy, DoS, reputation laundering, stack-too-deep ở getter `trades`, …) vào một mục mới trong CURRENT_STATUS.md. Lấy thông tin từ code + test + git log nếu có; nếu không đủ dữ kiện, liệt kê rõ bug nào chưa truy lại được, không bịa.
   - Tạo README.md ở gốc repo cho người ngoài (mô tả sản phẩm, kiến trúc, chạy local, chạy test, link demo để trống). Ngắn gọn, tiếng Việt + 3 dòng tiếng Anh ở đầu cho giám khảo.
   - Chạy kiểm tra bí mật: grep git history (nếu có .git) và working tree tìm key/.env; ghi kết quả vào OPEN_QUESTIONS.md Q-009 (đóng hoặc nêu cụ thể).
   - Thêm DECISION-LOG cho vai trò `owner` trong resolveDispute (xem câu hỏi dưới) ở trạng thái PROPOSED, KHÔNG tự chốt.

Câu hỏi cần đưa tôi quyết (liệt kê cuối báo cáo, đừng tự chọn): `resolveDispute` đang `onlyOwner` — dùng (1) owner là ví riêng của team + nói rõ là "arbiter tối thiểu", (2) multisig, hay (3) giao cho agent AI với cơ chế kháng cáo là roadmap?

Tiêu chí nghiệm thu: toàn bộ test cũ + mới pass; docker build backend không lỗi; /verify-evidence từ chối URL nội bộ và host lạ; README có; CURRENT_STATUS cập nhật.
```

---

## PHASE 3B — Deploy Fuji + backend công khai

> Quốc làm trước các bước thủ công (không giao cho AI): tạo 2 ví riêng (deployer, agent), xin AVAX từ faucet Fuji (Core faucet), lưu key vào `.env` cục bộ, **không dán key vào chat**.

```
[Dán P0 trước]

PHASE 3B — DEPLOY FUJI & BACKEND CÔNG KHAI (nhánh phase/3b-fuji)

Điều kiện: tôi đã có .env cục bộ (DEPLOYER_PRIVATE_KEY, AGENT_PRIVATE_KEY/AGENT_ADDRESS, FUJI_RPC_URL). Bạn KHÔNG đọc nội dung .env; chỉ dùng qua biến môi trường khi chạy lệnh. Nếu thiếu biến, dừng và liệt kê tên biến còn thiếu.

Phạm vi: contracts/script/*, contracts/deployments/*, backend/** (cấu hình/triển khai), tài liệu. Không sửa logic contracts/src.

Việc cần làm:
1. Rà Deploy.s.sol: tham số cửa sổ thời gian cho Fuji. Đề xuất 2 cấu hình rõ ràng: "demo" (evidence/attest/dispute window vài phút) và "real" (3 ngày/…/2 ngày theo DEC-008). Hỏi tôi chọn cấu hình nào trước khi deploy.
2. Dry-run deploy (forge script không --broadcast) và báo kết quả. Chờ tôi xác nhận rồi mới --broadcast lên Fuji (chain 43113).
3. Sau deploy: ghi contracts/deployments/43113.json (escrow, token, agent, owner, deployBlock, windows). Bỏ 43113.json khỏi .gitignore (địa chỉ contract là công khai và frontend cần) nhưng giữ 31337.json bị ignore. Export ABI mới nhất vào backend/abi/ nếu có thay đổi.
4. Verify source code trên Snowtrace/Routescan (forge verify-contract) cho Escrow và CollectibleToken; ghi link explorer vào deployments JSON và README. Nếu cần API key explorer, hướng dẫn tôi cách lấy, đừng tự tạo.
5. Chạy contracts/script/e2e_anvil.sh phiên bản tương đương trên Fuji (viết contracts/script/e2e_fuji.sh dùng cast): tạo trade → 2 bên cọc → nộp evidence → (backend attest) → resolveClean sau window. Ghi lại các tx hash vào docs/DEPLOY_LOG.md.
6. Backend công khai: chuẩn bị triển khai backend lên nền tảng miễn phí/rẻ (Render/Railway/Fly — chọn cái phù hợp với Dockerfile hiện có), có /health công khai, biến môi trường đặt qua dashboard (không commit). Viết docs/DEPLOY_BACKEND.md từng bước cho tôi làm tay (tôi là người đăng nhập dịch vụ). Cấu hình CORS_ORIGINS cho domain frontend (placeholder trước), bật ATTEST_API_KEY.
7. Ghi các địa chỉ + link explorer vào CURRENT_STATUS.md.

Tiêu chí nghiệm thu: có 43113.json; contract verified; tx hash của một vòng clean hoàn chỉnh trên Fuji; docs/DEPLOY_BACKEND.md đủ để tôi deploy backend không cần hỏi lại; không có secret nào trong git diff.
```

---

## PHASE 4A — Frontend: khung, ví, đọc dữ liệu

```
[Dán P0 trước]

PHASE 4A — FRONTEND KHUNG + VÍ + ĐỌC DỮ LIỆU (nhánh phase/4a-frontend-scaffold)

Nguồn sự thật: docs/FRONTEND_SPEC.md (đọc TOÀN BỘ). Code thắng spec nếu mâu thuẫn; mâu thuẫn nào tìm thấy ghi vào báo cáo. Đây là lần đầu tạo thư mục frontend/ (đã được phê duyệt, DEC-011). Không sửa contracts/ hay backend/.

Việc cần làm:
1. Khởi tạo frontend/ theo mục 1 của spec: Next.js 14 (App Router) + TypeScript + Tailwind + wagmi v2 + viem v2 + @tanstack/react-query v5 + RainbowKit v2. Pin version. Không thêm state manager.
2. lib/wagmi.ts, lib/contracts.ts (đọc địa chỉ + deployBlock từ biến NEXT_PUBLIC_*), lib/abi/ (copy từ backend/abi), lib/format.ts, lib/errors.ts (map revert string → tiếng Việt, lấy chuỗi thật từ Escrow.sol), lib/backend.ts.
3. Banner sai chain + nút switchChain; mọi nút ghi disable khi sai chain/chưa kết nối. Gợi ý faucet khi số dư thấp (Fuji).
4. Trang đọc dữ liệu: `/` (danh sách trade của tôi qua getLogs từ deployBlock + getTrade), `/trade/[id]` (trạng thái, badge, countdown, nonce 8 ký tự hex, số tiền cọc/phạt), `/profile/[address]` (reputation), banner pendingWithdrawals. Chưa cần nút ghi.
5. Cấu hình hoạt động với cả anvil (31337) và Fuji (43113) chỉ bằng đổi biến môi trường. Viết frontend/.env.example (không secret).
6. Giao diện: Tailwind, responsive, có Loading/Empty/Error state; tiếng Việt; hiển thị chain, địa chỉ contract, link explorer.

Kiểm thử: `npm run build` + `npm run lint` + `tsc --noEmit` sạch. Thêm test đơn vị cho lib/format.ts và lib/errors.ts. Chạy thử với anvil local + backend/scripts/demo_local.py để có dữ liệu mẫu, chụp ảnh màn hình các trang chính đính vào báo cáo.

Nghiệm thu: mục 11 của spec phần "đọc"; build sạch; hoạt động trên anvil với dữ liệu thật.
```

---

## PHASE 4B — Frontend: luồng ghi

```
[Dán P0 trước]

PHASE 4B — FRONTEND LUỒNG GHI (nhánh phase/4b-frontend-write). Điều kiện: 4A đã merge.

Đọc docs/FRONTEND_SPEC.md mục 3.3, 5, 6, 8, 9. Không sửa contracts/ và backend/.

Việc cần làm:
1. `/trade/new`: tạo trade (createTrade) với kiểm tra phía client giống điều kiện contract (buyer ≠ 0, ≠ mình, cọc > 0). Hiển thị trước: giá, cọc 30% mỗi bên, phạt 5%.
2. Trang chi tiết: nút deposit (đúng depositRequired), cancelUnfunded, submitEvidence, resolveClean, fileComplaint, withdraw — nút chỉ bật khi đúng điều kiện (state, vai trò, deadline). Hiển thị chuỗi trạng thái tx rõ ràng: chờ ký → đã gửi → pending → xác nhận → thất bại (theo .agents/rules/60-ui-ux.md). Trước khi ký phải hiện chain, contract, số tiền, hành động.
3. Upload bằng chứng: app/api/pin/route.ts (Pinata, PINATA_JWT chỉ server-side) → ipfs://CID → evidenceHash = keccak256(toBytes(uri)) → submitEvidence. Chặn file quá lớn/sai định dạng; hiển thị nonce cần viết lên giấy cạnh món hàng.
4. Sau khi đủ 2 bằng chứng: nút "Chạy xác thực AI" gọi POST /verify-evidence (gửi X-API-Key qua route handler phía server, KHÔNG để key trong bundle client). Xử lý lỗi 409/422/502 với thông báo dễ hiểu.
5. Xử lý các lỗi revert phổ biến bằng lib/errors.ts; không bao giờ hiển thị "thành công" trước khi receipt xác nhận.

Kiểm thử: chạy trọn 2 kịch bản trên anvil (clean → resolveClean; gian lận → flagged → dispute) bằng giao diện; viết test (Vitest/Playwright mức tối thiểu cho các hàm logic và 1 luồng chính). Báo cáo kèm ảnh/GIF và danh sách bước đã bấm.
```

---

## PHASE 4C — Frontend: Evidence Report + Admin + hoàn thiện

```
[Dán P0 trước]

PHASE 4C — EVIDENCE REPORT + ADMIN + POLISH (nhánh phase/4c-frontend-polish). Điều kiện: 4B đã merge.

Đây là màn hình "wow" của demo (UI/UX 10% + Creativity 15%). Đọc docs/FRONTEND_SPEC.md mục 6 (Explainable Evidence Report, trang admin).

Việc cần làm:
1. `/trade/[id]/report`: hiển thị ảnh keypoint match (match_visual_png_b64), kết quả OCR nonce, pHash, điểm rủi ro, các lý do gắn cờ; nút "Verify on-chain": keccak256(report_json) phải bằng reportHash trong getTrade() → hiện ✅/❌ rõ ràng.
2. `/admin`: chỉ hiện với ví owner; danh sách trade Disputed; gọi resolveDispute(id, violator) gồm cả lựa chọn "không ai sai" (address(0), DEC-010). Giải thích hậu quả (phạt 5%, hoàn cọc) trước khi ký.
3. Polish: landing page 1 màn hình nói rõ vấn đề + 3 bước; chế độ "Demo" rút ngắn cửa sổ thời gian nếu cấu hình Fuji dùng cửa sổ ngắn (hiển thị countdown); trạng thái rỗng đẹp; mobile OK; favicon + tên dự án (nếu đã chốt Q-011, nếu chưa dùng placeholder cấu hình được).
4. Link explorer (Snowtrace/Routescan) ở mọi tx hash và địa chỉ contract.
5. Chuẩn bị deploy frontend (Vercel/Netlify): ghi docs/DEPLOY_FRONTEND.md các bước + biến môi trường cho tôi làm tay.
6. Kiểm tra a11y cơ bản + Lighthouse (ghi điểm thật, không bịa).

Nghiệm thu: mục 11 của spec; toàn bộ kịch bản demo (spec mục 8) chạy được bằng UI trên anvil; build sạch.
```

---

## PHASE 5 — Hiệu chỉnh AI trên ảnh thật (chạy song song 4A–4C)

> Quốc/đồng đội làm tay: chụp **40–60 cặp** có nhãn bằng điện thoại thật (đúng hàng / hàng khác / ảnh mạng / ảnh tái sử dụng / nonce viết tay sai / ánh sáng yếu). Đặt vào `ai-pipeline/data/real/` kèm `labels.csv` (đừng commit ảnh nếu có thông tin cá nhân).

```
[Dán P0 trước]

PHASE 5 — HIỆU CHỈNH AI TRÊN ẢNH THẬT (nhánh phase/5-ai-calibration)

Phạm vi: ai-pipeline/**, backend/ (chỉ cấu hình ngưỡng nếu cần). Không sửa contracts/.

Dữ liệu: ai-pipeline/data/real/ + labels.csv (tôi sẽ cung cấp). Nếu chưa có dữ liệu, dừng và nói rõ — không dùng ảnh tổng hợp để tuyên bố độ chính xác thật.

Việc cần làm:
1. Viết script đánh giá ai-pipeline/eval_real.py: chạy pipeline trên toàn bộ cặp có nhãn, xuất CSV điểm từng thành phần (pHash, embedding, ORB inliers, OCR nonce, risk score) + confusion matrix + precision/recall/F1 ở ngưỡng hiện tại.
2. Phân tích lỗi: nhóm sai nhiều nhất (OCR chữ viết tay? ORB trên vật phản quang?). Đề xuất cải tiến nhỏ, rẻ (tiền xử lý ảnh trước OCR, ngưỡng, trọng số) — mỗi thay đổi phải đo lại trước/sau.
3. Hiệu chỉnh ngưỡng bằng dữ liệu (không đoán). Ưu tiên giảm false-positive (cờ nhầm người ngay) — vì DEC-010 chỉ là lối thoát, không phải điều ta muốn xảy ra trong demo.
4. Chốt bộ "ảnh demo an toàn": 2 cặp chạy đúng ổn định (clean) + 1 cặp gian lận rõ ràng, đặt trong ai-pipeline/data/demo/ để quay video.
5. Giữ 59 test cũ pass; thêm test hồi quy bằng vài mẫu ảnh thật nhỏ (đã được phép) hoặc bằng ngưỡng.
6. Ghi số liệu THẬT (n mẫu, P/R/F1) vào CURRENT_STATUS.md để dùng trong slide. Nếu số liệu kém, nói thẳng và nêu hạn chế (mô tả trung thực thắng bịa số).

Nghiệm thu: báo cáo đánh giá có số; ngưỡng cập nhật kèm lý do; bộ ảnh demo chạy ổn định ≥ 10/10 lần.
```

---

## PHASE 6 — Nối E2E trên Fuji + Avalanche Integration

```
[Dán P0 trước]

PHASE 6 — E2E TRÊN FUJI & TĂNG ĐIỂM AVALANCHE INTEGRATION (nhánh phase/6-e2e-fuji). Điều kiện: 3B, 4C, 5 đã xong và merge.

Mục tiêu: một người lạ mở link công khai, kết nối ví Core/MetaMask trên Fuji, chạy trọn luồng mà không cần máy của chúng tôi. Không thêm tính năng mới sau 16/11 — chỉ sửa lỗi.

Việc cần làm:
1. Trỏ frontend (biến môi trường) tới Fuji + backend công khai; chạy 3 kịch bản bằng UI thật: (a) clean → resolveClean, (b) gian lận → flagged → dispute → resolveDispute, (c) timeout bằng chứng → cancelOnEvidenceTimeout. Ghi tx hash từng bước vào docs/DEPLOY_LOG.md.
2. Avalanche Integration (25% điểm) — làm tối thiểu, có thể kiểm chứng:
   - Contract verified + link explorer trong UI/README/slide.
   - Hỗ trợ Core Wallet (RainbowKit) và nút "Add Fuji network".
   - Ghi rõ lý do chọn Avalanche (finality dưới 2s, phí thấp cho thao tác attest nhiều lần, hỗ trợ EVM đầy đủ) trong docs, kèm số đo thật: thời gian xác nhận và phí gas thật của createTrade/deposit/attest/resolveClean trên Fuji (lấy từ receipt).
   - L1/ICM: KHÔNG làm. Trình bày như roadmap, dựa docs/L1_MODULE_SPEC.md.
3. Kiểm thử chịu lỗi cho demo: backend sleep/cold start (thêm thông báo + retry), RPC chậm, ví từ chối ký, hai tab cùng lúc, trade đã được attest rồi bấm lại.
4. Danh sách lỗi (bug bash) theo mức độ; sửa lỗi mức cao/trung. Lỗi thấp → OPEN_QUESTIONS.
5. Chạy tập test đầy đủ: forge test, pytest (anvil+Tesseract), frontend build/lint/test. Báo cáo số liệu thật.

Nghiệm thu: 3 kịch bản chạy từ link công khai trên Fuji ≥ 3/3 lần liên tiếp; có bảng gas/thời gian thật; không còn lỗi mức cao.
```

---

## PHASE 7 — Nộp bài (README, slide, video, kiểm tra link)

```
[Dán P0 trước]

PHASE 7 — HOÀN THIỆN NỘP BÀI (nhánh phase/7-submission). Điều kiện: đã qua feature freeze 16/11. KHÔNG thêm tính năng.

Đọc docs/SLIDE_AND_VIDEO_SCRIPT.md (slide bám 6 tiêu chí, kịch bản video 2:30–2:50, checklist nộp bài).

Việc cần làm:
1. README.md (repo public): tiếng Anh ở đầu cho giám khảo (vấn đề, giải pháp, kiến trúc, link demo/video/slide, địa chỉ contract + link explorer), phần tiếng Việt ở dưới; sơ đồ kiến trúc (Mermaid); cách chạy local; cách chạy test; mô tả bảo mật (SSRF, giới hạn quyền agent, AI không giữ tiền, hạn chế đã biết); số liệu thật từ Phase 5/6. Không khoe số chưa đo.
2. Slide: thay toàn bộ placeholder [TÊN DỰ ÁN] và [CATEGORY] bằng tên/category đã chốt (hỏi tôi nếu Q-011/Q-012 chưa chốt). Tạo outline 12–13 slide ở dạng nội dung sẵn dán vào Canva/Google Slides, mỗi slide ghi tiêu chí được chấm + hình cần chuẩn bị. Số liệu lấy từ CURRENT_STATUS/DEPLOY_LOG (thật).
3. Video: kịch bản từng cảnh có thời lượng, lời thoại, thao tác màn hình, tx hash dùng trong cảnh; kịch bản dự phòng nếu live demo hỏng (video quay trước). Nội dung phải khớp luồng đã chạy ổn trên Fuji.
4. Checklist nộp bài chi tiết có tick: repo public hoặc private + add collaborator `tuantqse90`; link slide mở được ở cửa sổ ẩn danh; link video mở ẩn danh; link demo mở ẩn danh; không có secret trong repo/lịch sử git; README đầy đủ; tag release.
5. Rà soát cuối: grep secret, kiểm tra .gitignore, chạy toàn bộ test lần cuối, chụp bằng chứng.
6. Chuẩn bị 10 câu hỏi giám khảo có thể hỏi (đặc biệt: vì sao cần chain? ai là arbiter? AI sai thì sao? so với TrustPact? Avalanche mang lại gì?) kèm câu trả lời trung thực dựa trên code thật.

Nghiệm thu: mọi link mở được ở ẩn danh (liệt kê link + kết quả kiểm tra); checklist nộp bài đã tick đủ trước 21/11 18:00 (còn dư giờ đệm).
```

---

## Việc chỉ bạn làm được (không giao cho AI)

1. Chọn **tên dự án**, **category demo** (Q-011/Q-012) — chặn slide/video/UI.
2. Giao **ai code frontend** (Q-013) — hiện chưa có người, và đây là đường găng.
3. Tạo ví deployer + agent, xin AVAX faucet, giữ key trong `.env` cục bộ.
4. Chụp 40–60 cặp ảnh thật.
5. Đăng nhập dịch vụ để deploy backend/frontend; tạo Pinata, Snowtrace/Routescan API key.
6. Quyết định vai trò arbiter (`resolveDispute`) trước khi viết slide.
7. Quay video; kiểm tra link bằng cửa sổ ẩn danh.
