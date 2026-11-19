# Final Local Demo Release Gate — UniHack 2026

- **Ngày:** 2026-11-20 (GMT+7) · **Branch:** `feat/local-demo-fuji` (base `origin/main` @ `0cdb845`)
- **Vị trí:** `docs/agent-ops/` không còn trong baseline và `docs/audit/` bị ignore ⇒ đặt tại `docs/test-evidence/`.
- **Verdict:** **`ACCEPT FOR LOCAL DEMO`** — bản code/doc sẵn sàng freeze. **Chưa đủ điều kiện nộp bài** cho tới khi Owner hoàn tất mục §3.

## 1. Final Freeze Rule (Owner, mục 7)

| Điều kiện | Trạng thái | Bằng chứng |
|---|---|---|
| Clone & chạy Local Demo theo hướng dẫn | **PASS** | Build sạch từ cây Git, không `.env`, trên Docker Windows của Owner → backend/frontend healthy, 6 trang 200 (`LOCAL-DEMO-QA-REPORT.md` §2) |
| Trỏ đúng Avalanche Fuji `43113` | **PASS (cấu hình + runtime)** / NOT RUN (popup Core Wallet) | `/health` `chain_id:43113` đọc RPC Fuji thật; frontend build `NEXT_PUBLIC_CHAIN_ID=43113` |
| Bằng chứng blockchain là tx Fuji thật | **PASS (lịch sử)** | 23 event Fuji Trade #1..#4 kiểm chứng độc lập, gồm Agent `attest` & Owner `resolveDispute` (`AVALANCHE-FUJI-DEMO-EVIDENCE.md`) |
| README không hứa chức năng chưa kiểm chứng | **PASS** | README §3/§5 nêu rõ giới hạn Mode A, Mode B chỉ test Anvil, `ResolvedClean`/phạt 5% chưa có on-chain |
| Full regression & security scan | **PASS** | pytest 223/0/0 · forge 81/0/0 · node 101/0/0 · tsc · next build · gitleaks clean |
| Không còn P0/P1 chặn trải nghiệm local | **PASS** | Không phát hiện lỗi repo; 2 sự cố Docker là môi trường build (đã ghi nhận cách xử lý trong guide §9) |

## 2. Tier 1 DEMO-READY (rút gọn cho Local Demo)

| # | Tiêu chí | Trạng thái |
|---|---|---|
| 1 | Link ẩn danh (repo, slide, video) | **PENDING-OWNER** — README §5 `Demo Video`/`Slide` chưa có link |
| 2 | README không `[TBD]` | PASS |
| 3 | Contract parity `43113.json` ↔ README/compose/on-chain | PASS |
| 4 | Toggle nguy hiểm trên 43113 | PASS (runtime `/health`) |
| 5 | Gas Agent ≥ 0.5 AVAX | **FAIL** — `0.47 AVAX` on-chain (20/11) — Owner faucet |
| 6 | Agent attest hoạt động | PASS lịch sử (Trade #3); lần quay mới NOT RUN |
| 7 | Video backup `.mp4` | PENDING-OWNER |
| 8 | Test skip = 0 | PASS |
| 9 | Risk Register Critical/High | NOT VERIFIED — file không còn trong baseline |
| 10 | Media claims parity | PASS cho script đã sửa (số test, HSV/CLIP, không dApp public); slide/video cuối PENDING-OWNER |

## 3. Việc bắt buộc của Owner trước 21/11/2026 23:59

1. Faucet ví Agent `0x579e…7081` lên ≥ 0.5 AVAX.
2. Trên máy Owner: `.env` (`PINATA_JWT`, `AGENT_PRIVATE_KEY`, `AGENT_AUTO=true`) → `docker compose up -d` → quay 2 giao dịch thật: `ResolvedClean` và `ResolvedDispute` có `penaltyAmount > 0` (Seller/Buyer khác ví Owner; bằng chứng lỗi thật).
3. Điền tx hash vào `AVALANCHE-FUJI-DEMO-EVIDENCE.md` §2 + README §5; điền link Video/Slide (mở được ẩn danh); repo public hoặc mời `tuantqse90`.
4. Chạy lại `gitleaks` + smoke sau commit cuối.

## 4. Tier 2 PRODUCTION-READY: NOT PASSED (theo thiết kế — testnet, Owner EOA, chưa audit, windows rút ngắn)
