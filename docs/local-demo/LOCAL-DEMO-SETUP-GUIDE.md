# Local Demo Setup Guide — Docker trên máy cá nhân + Avalanche Fuji (`43113`)

> **Mục tiêu:** clone repo → chạy Frontend + Backend bằng Docker trên máy bạn → kết nối Core Wallet → dùng **hai ví của chính bạn** (Seller & Buyer) → tạo giao dịch ký quỹ **thật** trên Avalanche Fuji Testnet.
> **Chi phí:** 0 đồng. Chỉ dùng **test AVAX** miễn phí trên Fuji. **Không dùng mainnet, không dùng tiền thật.**
> **Không cần:** VPS, domain, HTTPS công khai, hai máy tính. Dự án **không bao giờ** yêu cầu bạn gửi private key / seed phrase cho ai.

Hợp đồng Escrow **chỉ giữ tiền cọc 30%** của mỗi bên (không giữ tiền mua hàng — tiền hàng thanh toán P2P ngoài hợp đồng). AI chỉ **Verify/Attest**; tranh chấp do **Owner/Arbiter** xử lý.

---

## 1. Chuẩn bị công cụ

| Công cụ | Ghi chú |
|---|---|
| Git | https://git-scm.com/downloads |
| Docker Desktop (Windows/macOS) hoặc Docker Engine + Compose v2 (Linux) | Cấp ≥ 4 GB RAM cho Docker. Hướng dẫn cài theo từng hệ điều hành: [RUN_LOCAL_BEGINNER.md](../../RUN_LOCAL_BEGINNER.md) |
| Core Wallet (extension trình duyệt) | https://core.app — bật **Testnet Mode** (Settings → Advanced → Testnet Mode) để chuyển sang Fuji |
| *(Tuỳ chọn)* Tài khoản Pinata miễn phí | Cần để upload ảnh niêm yết & bằng chứng lên IPFS (xem §4) |
| *(Tuỳ chọn, Mode B)* Foundry | Chỉ cần nếu bạn tự deploy hợp đồng (xem §8) |

## 2. Chạy ứng dụng (một lệnh)

```bash
git clone https://github.com/NguyenMinhCuong1412/Escrow_Marketplace_UniHack.git
cd Escrow_Marketplace_UniHack
docker compose up --build -d          # lần đầu ~3–8 phút
docker compose ps                     # backend & frontend: healthy
curl http://127.0.0.1:8000/health     # JSON, "chain_id": 43113
```

Mở **http://127.0.0.1:3000**. Không cần file `.env`: `SESSION_SECRET` và `ATTEST_API_KEY` được tự sinh (ngẫu nhiên, quyền `0600`) trong Docker volume `runtime_secrets`. Mặc định kết nối hợp đồng Fuji của nhóm (§6).

> `compose.yaml` là chế độ chạy local chính thức. Các file `compose.shared.yaml` / `compose.ops.yaml` là **chế độ nâng cao** dành cho máy chủ vận hành tập trung — nhóm **không** vận hành máy chủ công khai, bạn không cần dùng chúng.

## 3. Hai ví Seller & Buyer trên cùng một máy

1. Trong Core Wallet tạo **hai account** (Account 1 = Seller, Account 2 = Buyer). Chúng là hai địa chỉ độc lập.
> Listing, yêu cầu mua và giữ chỗ được lưu trong SQLite **của máy bạn** — Seller và Buyer phải dùng **cùng một bản chạy local** (cùng `http://127.0.0.1:3000`). Phần ký quỹ thì nằm trên Fuji và ai cũng xem được.

2. Khuyên dùng **hai browser profile** (ví dụ Chrome Profile "Seller" và "Buyer"), mỗi profile cài Core Wallet và chọn đúng account — tránh nhầm phiên đăng nhập. Một profile + đổi account cũng được nhưng dễ nhầm.
3. Kiểm tra mạng: **Avalanche Fuji C-Chain, Chain ID `43113`**, RPC `https://api.avax-test.network/ext/bc/C/rpc`, explorer `https://testnet.snowtrace.io`. Core Wallet có sẵn Fuji khi bật Testnet Mode.
4. Nhận **test AVAX miễn phí** cho cả hai ví từ faucet chính thức của Avalanche (Core → Tools → Testnet Faucet). Faucet có giới hạn tần suất/số lượng và điều kiện có thể thay đổi; nếu faucet từ chối, dùng faucet testnet khác hỗ trợ Fuji hoặc nhờ người có test AVAX chuyển.
5. Số dư gợi ý mỗi ví: ≥ 0.1 AVAX (cọc 30% giá trị niêm yết + gas). Niêm yết giá nhỏ (ví dụ 0.05 AVAX → cọc 0.015 AVAX/bên) để tiết kiệm.

## 4. (Tuỳ chọn) Bật upload IPFS bằng Pinata miễn phí

Trên Fuji, upload ảnh **fail-closed** nếu thiếu `PINATA_JWT` (trả `503`, không dùng CID giả).

```bash
cp .env.example .env           # Windows PowerShell: Copy-Item .env.example .env
# mở .env, điền PINATA_JWT=<JWT của bạn từ https://app.pinata.cloud/ (quyền pinFileToIPFS)>
docker compose up -d           # nạp lại cấu hình, không cần --build
```

`.env` đã nằm trong `.gitignore` — **không commit**.

## 5. Luồng trải nghiệm Escrow trên Fuji

| # | Ai | Trang | Thao tác | Giao dịch Fuji |
|---|---|---|---|---|
| 1 | Seller & Buyer | Header | Connect Core Wallet + ký thông điệp đăng nhập (không tốn gas) | — |
| 2 | Seller | `/sell` | Tạo listing (ảnh qua IPFS nếu đã cấu hình §4) | — (off-chain SQLite) |
| 3 | Buyer | `/listings/[id]` | Gửi yêu cầu mua | — |
| 4 | Seller | `/sell` (mục yêu cầu mua) | Chấp nhận yêu cầu → ký **`createTrade`** (backend xác minh `TradeCreated` + `getTrade()` khi bind trade) | ✅ |
| 5 | Seller & Buyer | `/trade/[id]` | **`deposit`** 30% mỗi bên | ✅ ×2 |
| 6 | Seller & Buyer | `/trade/[id]` | In/hiển thị **QR nonce** của trade, chụp ảnh đóng gói / quay unbox có QR, **`submitEvidence`** | ✅ ×2 |
| 7 | AI Agent | tự động | **`attest(tradeId, riskScore, flagged, reportHash)`** — *chỉ ví Agent của hợp đồng ký được* (xem §6) | ✅ |
| 8a | Bất kỳ ai | `/trade/[id]` | Không flag & hết `disputeWindow` (90s) → **`resolveClean`**: hoàn 100% cọc, +1 reputation | ✅ |
| 8b | Seller/Buyer | `/trade/[id]` | **`fileComplaint`** trong 90s → `Disputed` | ✅ |
| 8c | **Owner/Arbiter** | `/admin` | **`resolveDispute(tradeId, violator)`** — phạt **5%** cọc bên vi phạm chuyển cho bên kia | ✅ |
| 9 | Bất kỳ ai | `/trade/[id]` | Hết `evidenceWindow` + `attestWindow` (600s + 600s) mà chưa có attest → **`cancelOnEvidenceTimeout`**: hoàn 100% cọc hai bên | ✅ |
| — | Seller/Buyer | `/trade/[id]` | Trước khi đủ cọc: **`cancelUnfunded`** | ✅ |

Kiểm tra mọi giao dịch trên Snowtrace: `https://testnet.snowtrace.io/tx/<txHash>` hoặc trang hợp đồng `https://testnet.snowtrace.io/address/0x19D053c84941411888f5b9e40c854365fdd4eb00` (tab Transactions / Events). Trạng thái trade, CDU và reputation đọc trực tiếp từ hợp đồng (`getTrade`, `reputationOf`, `CollectibleToken.balanceOf`).

## 6. Mode A — Dùng hợp đồng Fuji có sẵn của nhóm (mặc định)

| Thành phần | Địa chỉ |
|---|---|
| Escrow | `0x19D053c84941411888f5b9e40c854365fdd4eb00` (deploy block `60980241`) |
| CollectibleToken (CDU, soulbound) | `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78` |
| AI Agent (`onlyAgent`) | `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081` |
| Owner / Arbiter (`onlyOwner`) | `0xCa76cBE87902108712729A02F78C1F8cC20b39Eb` |
| Cửa sổ thời gian | evidence 600s · attest 600s · dispute 90s |

**Minh bạch về quyền hạn — bạn KHÔNG điều khiển được Agent và Owner của hợp đồng này:**

- Bạn tự làm được bước **1–6, 8b, 9** và `cancelUnfunded` bằng hai ví của mình — đều là giao dịch Fuji thật.
- **Bước 7 (`attest`)** chỉ ví Agent của nhóm ký được. Khi máy bạn không có khóa Agent, nút Verify AI trả `503` (fail-closed, không giả lập). Agent chỉ hoạt động khi nhóm tự chạy worker trên máy của nhóm (ví dụ lúc quay demo).
- **Bước 8c (`resolveDispute`)** chỉ ví Owner của nhóm ký được.
- Vì vậy, với hợp đồng có sẵn, trade của bạn thường kết thúc bằng **`cancelOnEvidenceTimeout`** (hoàn 100% cọc sau ~20 phút), trừ khi Agent của nhóm đang chạy.
- Muốn trải nghiệm trọn vẹn attest/resolveClean/resolveDispute với quyền của chính bạn → dùng **Mode B**.

## 7. Dừng ứng dụng & bảo toàn dữ liệu SQLite

```bash
docker compose stop            # dừng, giữ nguyên container + volume
docker compose start           # chạy lại
docker compose down            # xoá container, GIỮ volume backend_data (marketplace.db) và runtime_secrets
docker compose logs -f backend # xem log
```

- **Không** chạy `docker compose down -v` trừ khi muốn xoá sạch: lệnh này xoá `marketplace.db` (listing, request, report) và secrets tự sinh. Dữ liệu on-chain trên Fuji không bị ảnh hưởng.
- Sao lưu DB: `docker compose exec backend python -c "import sqlite3; s=sqlite3.connect('/data/marketplace.db'); d=sqlite3.connect('/data/backup.db'); s.backup(d)"` rồi `docker compose cp backend:/data/backup.db ./backup.db`.

## 8. Mode B — Tự deploy hợp đồng riêng trên Fuji (tuỳ chọn, nâng cao)

Dùng khi bạn muốn tự làm **Owner** và **Agent**. Dùng **ví testnet riêng, chỉ chứa test AVAX**. Private key chỉ nằm trên máy bạn, trong biến môi trường của terminal / file `.env` không commit.

> Trạng thái kiểm chứng: script `Deploy.s.sol` đã chạy thành công trên Anvil (`31337`) với cửa sổ 600/600/90. **Deploy lên Fuji bằng Mode B chưa được nhóm kiểm thử end-to-end** — hãy coi đây là tuỳ chọn thử nghiệm.

```bash
# 1. Cài Foundry: https://book.getfoundry.sh/getting-started/installation
cd contracts
forge build
# 2. Deployer = Owner/Arbiter; AGENT_ADDRESS = một account khác của bạn (sẽ làm AI Agent)
export PRIVATE_KEY=<private key ví testnet Owner của bạn>        # PowerShell: $env:PRIVATE_KEY="..."
export AGENT_ADDRESS=<địa chỉ ví Agent của bạn>
export EVIDENCE_WINDOW_SECS=600 ATTEST_WINDOW_SECS=600 DISPUTE_WINDOW_SECS=90
forge script script/Deploy.s.sol --rpc-url fuji --broadcast
unset PRIVATE_KEY
```

Script **ghi đè** `contracts/deployments/43113.json` bằng địa chỉ mới. Đừng commit file này (dùng `git restore contracts/deployments/43113.json` nếu muốn quay về hợp đồng của nhóm). Sau đó tạo `.env` ở thư mục gốc:

```dotenv
ESCROW_ADDRESS=<Escrow mới>
NEXT_PUBLIC_ESCROW_ADDRESS=<Escrow mới>
NEXT_PUBLIC_TOKEN_ADDRESS=<CollectibleToken mới>
NEXT_PUBLIC_DEPLOY_BLOCK=<deployBlock trong 43113.json>
AGENT_PRIVATE_KEY=<private key ví Agent của bạn (có test AVAX làm gas)>
AGENT_AUTO=true
PINATA_JWT=<JWT Pinata của bạn>
```

```bash
docker compose up --build -d   # --build bắt buộc vì địa chỉ NEXT_PUBLIC_* được nhúng lúc build frontend
```

Owner của bạn mở `/admin` để `resolveDispute`. Seller/Buyer vẫn là hai account khác.

## 9. Xử lý sự cố nhanh

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| `/api/pin` trả `503` | Chưa có `PINATA_JWT` (§4) |
| Verify AI trả `503` / không có `attest` | Máy không giữ khóa Agent của hợp đồng (Mode A) — dùng `cancelOnEvidenceTimeout` hoặc Mode B |
| Core Wallet báo sai mạng | Bật Testnet Mode, chọn Avalanche Fuji C-Chain (`43113`) |
| `/health` có `"agent_signer_configured": false` | Bình thường ở Mode A (máy bạn không giữ khóa Agent). `"chain_id": 43113` và `"insecure_for_chain": false` mới là điều cần kiểm tra |
| Lỗi `429` / RPC chậm | RPC công khai Fuji bị giới hạn — đợi rồi thử lại, hoặc đặt `RPC_URL` khác trong `.env` |
| Build frontend lỗi `rpc error ... EOF` | Docker thiếu RAM — tăng RAM cho Docker Desktop, chạy lại `docker compose build frontend` |
