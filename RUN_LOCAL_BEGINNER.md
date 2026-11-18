# Hướng Dẫn Cài Đặt & Chạy Local Cho Người Mới — Escrow Marketplace

Hướng dẫn này giúp bạn clone và khởi chạy toàn bộ **Escrow Marketplace** (Frontend Next.js + Backend FastAPI + AI Pipeline OpenCV/Tesseract + SQLite) trên máy mới **chỉ bằng Docker Compose**, **không cần cài đặt thủ công Node.js, Python, Foundry, OpenCV hay Tesseract**.

> **An toàn thử nghiệm:** Hệ thống kết nối mạng thử nghiệm **Avalanche Fuji Testnet (`Chain ID: 43113`)**. Tuyệt đối không dùng ví thật, seed phrase thật hoặc AVAX mainnet.

---

## Bước 1: Cài đặt phần mềm cần thiết

Bạn chỉ cần cài **2 phần mềm** sau:

1. **Git**
   - Tải chính thức tại: https://git-scm.com/downloads
   - **Windows:** Cài bản *Git for Windows* (khi cài giữ mặc định, có sẵn Git Bash và hỗ trợ lệnh `git` trong PowerShell).
   - **Ubuntu/Debian:** Cài qua terminal ở Bước 2 bên dưới (`sudo apt-get install -y git`).
   - **macOS:** Chạy `xcode-select --install` hoặc tải từ link trên.

2. **Docker (kèm Docker Compose v2)**
   - **Windows & macOS:** Tải và cài **Docker Desktop** chính thức tại: https://www.docker.com/products/docker-desktop/
     *(Sau khi cài trên Windows/macOS, mở ứng dụng **Docker Desktop** và chờ icon cá voi góc màn hình báo trạng thái **Engine running**.)*
   - **Ubuntu / Linux:** Cài **Docker Engine + Docker Compose plugin** theo hướng dẫn chính thức: https://docs.docker.com/engine/install/ubuntu/

*(Tùy chọn trên Ubuntu để chạy `docker` không cần `sudo`: `sudo usermod -aG docker $USER` rồi đăng xuất và đăng nhập lại.)*

---

## Bước 2: Kiểm tra cài đặt thành công

Mở **PowerShell** (Windows) hoặc **Terminal** (Ubuntu/macOS) và chạy các lệnh sau:

- **Windows (PowerShell) & macOS (Terminal):**
```bash
git --version
docker --version
docker compose version
docker info
```

- **Ubuntu/Linux (nếu chưa cài Git/curl):**
```bash
sudo apt-get update && sudo apt-get install -y git
git --version
docker --version
docker compose version
docker info
```

Nếu cả 4 lệnh đều không báo lỗi (`docker info` trả về thông tin Server/Engine, không báo *Cannot connect to the Docker daemon*), máy của bạn đã sẵn sàng.

---

## Bước 3: Clone mã nguồn từ GitHub

Chạy đúng bộ lệnh theo hệ điều hành của bạn:

- **Windows (PowerShell):**
```powershell
git clone https://github.com/NguyenMinhCuong1412/Escrow_Marketplace_UniHack.git
Set-Location Escrow_Marketplace_UniHack
```

- **Ubuntu/Linux & macOS (Terminal):**
```bash
git clone https://github.com/NguyenMinhCuong1412/Escrow_Marketplace_UniHack.git
cd Escrow_Marketplace_UniHack
```

---

## Bước 4: Thiết lập cấu hình lần đầu (Tùy chọn theo nhu cầu sử dụng)

### Chế độ 1 — Dùng ngay không cần tạo file `.env` (Khuyên dùng cho người mới xem demo)
Khi bạn chạy lệnh ở Bước 5 ngay lập tức:
- Hệ thống **tự động cấu hình** đúng hợp đồng đã deploy trên **Avalanche Fuji (`43113`)** (`Escrow`: `0x19D053c84941411888f5b9e40c854365fdd4eb00`).
- Hệ thống **tự động sinh an toàn** 2 secret nội bộ ngẫu nhiên độc lập (`SESSION_SECRET` và `ATTEST_API_KEY`, dài `>= 32` ký tự) lưu trong Docker volume `runtime_secrets` dùng cho xác thực phiên và chữ ký HMAC giữa Next.js BFF với FastAPI.
- Bạn có thể mở website, kết nối ví, xác thực phiên, xem Marketplace và kiểm tra giao dịch on-chain.

### Chế độ 2 — Bật upload ảnh lên IPFS (Pinata) hoặc bật AI Auto-Agent ký `attest()` on-chain
Vì lý do bảo mật, mã nguồn công khai **không** chứa token Pinata hay private key. Nếu thiếu các thông tin này, tính năng upload ảnh lên IPFS và ký giao dịch `attest()` sẽ từ chối an toàn (fail-closed) chứ không giả lập thành công.

Để bật thêm 2 tính năng này, tạo file `.env` từ file mẫu:

- **Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
notepad .env
```

- **Ubuntu/Linux & macOS (Terminal):**
```bash
cp .env.example .env
nano .env
```

Trong `.env`, chỉ điền phần bạn cần:
- **`PINATA_JWT=...`** *(tạo JWT tại https://app.pinata.cloud/ — cần quyền `pinFileToIPFS` để đăng ảnh niêm yết & bằng chứng)*.
- **`AGENT_PRIVATE_KEY=...`** và **`AGENT_AUTO=true`** *(chỉ dành cho ví AI Agent khớp `Escrow.agent()` trên contract và có AVAX Fuji làm gas; tuyệt đối không điền private key ví chính hoặc tiền thật)*.
- *(Tùy chọn)* **`IPFS_GATEWAY=https://<gateway-cua-ban>.mypinata.cloud/ipfs/`** để tránh giới hạn tốc độ (`HTTP 429`) của gateway công khai.

> **Cảnh báo bảo mật:** Không bao giờ chia sẻ file `.env`, private key hoặc token lên GitHub hay ảnh chụp màn hình. File `.gitignore` đã mặc định bỏ qua `.env`.

---

## Bước 5: Chạy toàn bộ dự án bằng một lệnh

Từ thư mục gốc `Escrow_Marketplace_UniHack`:

- **Windows (PowerShell), Ubuntu/Linux & macOS:**
```bash
docker compose up --build -d
```

*(Lần đầu chạy sẽ mất khoảng 2–5 phút để tải base image Python/Node và cài các thư viện Next.js, OpenCV, Tesseract; các lần sau chạy lại chỉ mất vài giây.)*

Kiểm tra trạng thái các container:
```bash
docker compose ps
```

Chờ đến khi cả `backend` và `frontend` hiện trạng thái **`healthy` / `running`**.

Kiểm tra nhanh Backend API:
- **Windows (PowerShell):**
```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```
- **Ubuntu/Linux & macOS (Terminal):**
```bash
curl -s http://127.0.0.1:8000/health
```

*(Lưu ý: Nếu bạn không điền `AGENT_PRIVATE_KEY` ở Bước 4, `/health` vẫn phản hồi JSON với `"tesseract": true`, `"security_toggles": { "insecure_for_chain": false }` và ghi rõ `"ok": false` kèm lý do thiếu `AGENT_PRIVATE_KEY` — điều này hoàn toàn bình thường khi chạy chế độ duyệt chợ/UI mà không chạy ví Agent on-chain.)*

---

## Bước 6: Truy cập và sử dụng website

Mở trình duyệt (**khuyên dùng Chrome, Edge, Firefox hoặc Brave**) và truy cập:

- **Website Escrow Marketplace:** `http://127.0.0.1:3000` (hoặc `http://localhost:3000`)
- **API Backend Health:** `http://127.0.0.1:8000/health`

Một số đường dẫn chính trên giao diện:
- `/` — Trang chủ Marketplace duyệt đồ sưu tầm đang đăng bán
- `/trades` — Danh sách giao dịch Escrow của ví đang kết nối
- `/trade/4` — Xem ví dụ giao dịch thật trên Avalanche Fuji (`Trade #4 = Cancelled`)
- `/trade/3/report` — Xem báo cáo AI giải trình & đối chiếu `keccak256` on-chain
- `/auth` hoặc `/auth/local` — Kết nối ví Core/MetaMask hoặc tạo Ví thử nghiệm trên trình duyệt

*(Lưu ý: `/trades` và `/trade/<id>` yêu cầu kết nối & xác thực ví trước — xem Bước 7; nếu chưa kết nối, giao diện tự chuyển hướng sang `/auth`.)*

---

## Bước 7: Kết nối ví thử nghiệm Avalanche Fuji (`Chain ID: 43113`)

Bạn có 2 cách dùng ví thử nghiệm miễn phí:

### Cách A — Dùng Core Wallet hoặc MetaMask (Khuyên dùng)
1. Cài tiện ích **Core Wallet** tại https://core.app/ (hoặc MetaMask).
2. Bật chế độ **Testnet** và kiểm tra thông số mạng **Avalanche Fuji C-Chain**:
   - **Network Name:** `Avalanche Fuji C-Chain`
   - **RPC URL:** `https://api.avax-test.network/ext/bc/C/rpc`
   - **Chain ID:** `43113`
   - **Currency Symbol:** `AVAX`
   - **Block Explorer:** `https://testnet.snowtrace.io`
3. Nhận **AVAX testnet miễn phí** (chọn mạng Fuji C-Chain) tại:
   - https://core.app/tools/testnet-faucet/
4. Trên website `http://127.0.0.1:3000`, bấm **`Kết nối ví`** → chọn Core Wallet / MetaMask → bấm **`Xác thực ví`** và ký thông điệp EIP-191 miễn phí gas.

### Cách B — Dùng Ví trên trình duyệt (`Local Wallet`) không cần cài extension
1. Truy cập `http://127.0.0.1:3000/auth/local`.
2. Chọn **`Tạo ví`** → đặt mật khẩu mở khóa → sao lưu cụm từ khôi phục (chỉ dùng cho ví test trên Fuji).
3. Nạp một ít AVAX testnet từ faucet nếu muốn gửi giao dịch tạo/nạp cọc Escrow on-chain.

---

## Bước 8: Dừng, khởi động lại, xem logs và cập nhật

Tất cả lệnh dưới đây chạy trong thư mục `Escrow_Marketplace_UniHack` (dùng chung cho Windows PowerShell, Ubuntu/Linux và macOS):

- **Xem log thời gian thực (tất cả dịch vụ):**
```bash
docker compose logs -f
```
- **Xem log riêng Backend hoặc Frontend:**
```bash
docker compose logs -f backend
docker compose logs -f frontend
```
- **Tạm dừng mà giữ nguyên dữ liệu & secret:**
```bash
docker compose stop
```
- **Khởi động lại sau khi đã build hoặc sau khi sửa `.env`:**
```bash
docker compose up -d
```
- **Tắt hẳn container (vẫn giữ dữ liệu SQLite trong volume `backend_data`):**
```bash
docker compose down
```
- **Cập nhật phiên bản mới từ GitHub:**
```bash
git pull
docker compose up --build -d
```
- *(Chỉ dùng khi muốn reset sạch database local và sinh secret mới):* `docker compose down -v`

---

## Bước 9: Xử lý các lỗi thường gặp

| Triệu chứng / Thông báo lỗi | Nguyên nhân | Cách khắc phục |
|---|---|---|
| `Cannot connect to the Docker daemon` / `open //./pipe/dockerDesktopLinuxEngine` | Chưa mở Docker Desktop (Windows/macOS) hoặc service Docker chưa chạy (Ubuntu) | Mở ứng dụng **Docker Desktop** chờ trạng thái *Engine running*; trên Ubuntu chạy `sudo systemctl start docker` |
| `permission denied while trying to connect to the Docker daemon socket` (Ubuntu) | Tài khoản hiện tại chưa thuộc nhóm `docker` | Chạy `sudo usermod -aG docker $USER`, đăng xuất/đăng nhập lại (hoặc chạy lệnh với `sudo docker compose ...`) |
| `Bind for 0.0.0.0:3000 failed: port is already allocated` (hoặc cổng `8000`) | Đã có ứng dụng khác chạy trên cổng `3000` hoặc `8000` | Tắt tiến trình đang chiếm cổng cũ rồi chạy lại `docker compose up -d` |
| Upload ảnh báo `503` / `Thiếu PINATA_JWT` | Chưa cấu hình `PINATA_JWT` (hệ thống chặn fail-closed trên Fuji `43113`) | Tạo file `.env` từ `.env.example`, điền `PINATA_JWT=...`, rồi chạy `docker compose up -d` |
| Không tạo được tin đăng / báo `401` khi dùng Safari trên `127.0.0.1` | Safari có thể từ chối cookie `Secure` trên HTTP `127.0.0.1` | Mở bằng `http://localhost:3000` hoặc dùng **Chrome / Edge / Firefox / Brave** |
| QR Nonce / trang chi tiết trade / `/health` báo thiếu `AGENT_PRIVATE_KEY` | Chưa điền khóa ví AI Agent (mặc định tắt vì lý do bảo mật) | Nếu muốn thử tính năng Auto-Agent `attest()` và tạo QR Nonce, cấu hình `AGENT_PRIVATE_KEY` + `AGENT_AUTO=true` trong `.env` và chạy `docker compose up -d` |
| Tải ảnh IPFS bị chậm hoặc lỗi `HTTP 429` | Gateway công cộng `gateway.pinata.cloud` bị giới hạn tần suất | Thêm gateway riêng của bạn vào `.env`: `IPFS_GATEWAY=https://<ten-gateway>.mypinata.cloud/ipfs/` rồi chạy `docker compose up -d` |
| Giao dịch ví báo sai mạng | Ví đang ở Avalanche Mainnet (`43114`) hoặc Ethereum (`1`) | Chuyển ví sang **Avalanche Fuji Testnet (`Chain ID: 43113`)** |
