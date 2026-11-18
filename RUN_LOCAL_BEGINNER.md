# Hướng Dẫn Cài Đặt & Chạy Escrow Marketplace Trên Nhiều Nền Tảng

Hướng dẫn từng bước để clone, cấu hình và chạy toàn bộ **Escrow Marketplace** (Frontend Next.js + Backend FastAPI + AI Pipeline OpenCV/Tesseract + SQLite WAL) **chỉ bằng Git và Docker Compose** (hoặc trực tiếp trên trình duyệt qua **GitHub Codespaces**), **không cần cài thủ công Node.js, Python, Foundry, OpenCV hay Tesseract**.

> **An toàn thử nghiệm (`Avalanche Fuji Testnet — Chain ID: 43113`):** Hệ thống kết nối mạng thử nghiệm Fuji (`Escrow`: `0x19D053c84941411888f5b9e40c854365fdd4eb00`). Tuyệt đối không dùng ví thật, seed phrase thật hoặc AVAX mainnet.

---

## Mục lục nhanh theo nền tảng

1. [Nền tảng 1: Windows 10 / 11 (PowerShell + Docker Desktop + WSL2)](#1-windows-10--11-powershell--docker-desktop--wsl2)
2. [Nền tảng 2: Ubuntu / Debian (Terminal + Docker Engine / Compose)](#2-ubuntu--debian-terminal--docker-engine--compose)
3. [Nền tảng 3: Các Linux distro khác (Fedora / RHEL / Arch / openSUSE)](#3-các-linux-distro-khác-theo-hệ-quản-lý-gói)
4. [Nền tảng 4: macOS (Intel `x86_64` và Apple Silicon `M1–M4`)](#4-macos-intel-và-apple-silicon)
5. [Nền tảng 5: GitHub Codespaces (Chạy trực tiếp trên trình duyệt)](#5-github-codespaces-chạy-trực-tiếp-trên-trình-duyệt)
6. [Cấu hình tùy chọn (Chế độ Không cần khóa vs IPFS Pinata / AI Auto-Agent)](#6-cấu-hình-lần-đầu-tùy-chọn-theo-nhu-cầu)
7. [Kiểm tra nhanh, mở website & kết nối ví Fuji](#7-kiểm-tra-website--kết-nối-ví-avalanche-fuji-43113)
8. [Dừng, khởi động lại, xem logs & cập nhật](#8-dừng-khởi-động-lại-xem-logs--cập-nhật)
9. [Xử lý các lỗi thường gặp](#9-xử-lý-các-lỗi-thường-gặp)

---

## 1. Windows 10 / 11 (PowerShell + Docker Desktop + WSL2)

### 1.1. Cài đặt công cụ (Git, WSL2, Docker Desktop)

Mở **PowerShell** (Run as Administrator nếu cài mới WSL2 lần đầu):

1. **Cài Git for Windows:**
   ```powershell
   winget install --id Git.Git -e --source winget
   ```
   *(Hoặc tải bộ cài tại: https://git-scm.com/downloads và giữ mặc định khi cài.)*

2. **Bật / kiểm tra WSL2 (bắt buộc cho Docker Desktop trên Windows):**
   ```powershell
   wsl --status
   ```
   Nếu máy chưa có WSL2, chạy lệnh sau rồi **khởi động lại Windows**:
   ```powershell
   wsl --install
   ```

3. **Cài Docker Desktop for Windows:**
   ```powershell
   winget install --id Docker.DockerDesktop -e --source winget
   ```
   *(Hoặc tải tại: https://www.docker.com/products/docker-desktop/)*

4. Mở ứng dụng **Docker Desktop**, xác nhận dùng **WSL 2 based engine**, và chờ góc dưới cửa sổ báo **Engine running**.

### 1.2. Kiểm tra môi trường → Clone → Cấu hình → Khởi động

Mở cửa sổ **PowerShell** mới và chạy lần lượt:

```powershell
# 1. Kiểm tra công cụ sẵn sàng (không lệnh nào báo lỗi)
git --version
wsl --status
docker --version
docker compose version
docker info

# 2. Clone mã nguồn & di chuyển vào thư mục dự án
git clone https://github.com/NguyenMinhCuong1412/Escrow_Marketplace_UniHack.git
Set-Location Escrow_Marketplace_UniHack

# 3. (Tùy chọn) Tạo file .env nếu muốn dùng Pinata hoặc AI Auto-Agent — xem Mục 6
# Copy-Item .env.example .env

# 4. Build và khởi chạy toàn bộ hệ thống (lần đầu mất ~2-5 phút)
docker compose up --build -d

# 5. Kiểm tra trạng thái container & Backend health
docker compose ps
Invoke-RestMethod http://127.0.0.1:8000/health
```

*(Nếu dùng terminal bên trong một distro WSL2 Ubuntu trên Windows: bật **Settings → Resources → WSL Integration** trong Docker Desktop cho distro đó, rồi dùng các lệnh Bash tương tự Mục 2.)*

Mở trình duyệt tại **`http://127.0.0.1:3000`** (hoặc `http://localhost:3000`), rồi xem tiếp [Mục 7](#7-kiểm-tra-website--kết-nối-ví-avalanche-fuji-43113) và [Mục 8](#8-dừng-khởi-động-lại-xem-logs--cập-nhật).

---

## 2. Ubuntu / Debian (Terminal + Docker Engine / Compose)

### 2.1. Cài đặt Git và Docker Engine + Docker Compose v2

Mở **Terminal** và chạy đúng block cho hệ điều hành của bạn:

#### Trên Ubuntu (22.04 / 24.04+)
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

#### Trên Debian (12 Bookworm / 13 Trixie)
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Bật service Docker và cấp quyền chạy không cần `sudo`:
```bash
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
```
*(Nếu `docker info` vẫn báo permission denied sau `newgrp`, hãy đăng xuất và đăng nhập lại phiên Linux.)*

### 2.2. Kiểm tra môi trường → Clone → Khởi động
```bash
# 1. Kiểm tra cài đặt
git --version
docker --version
docker compose version
docker info

# 2. Clone mã nguồn
git clone https://github.com/NguyenMinhCuong1412/Escrow_Marketplace_UniHack.git
cd Escrow_Marketplace_UniHack

# 3. (Tùy chọn) Tạo .env nếu cần Pinata / Auto-Agent — xem Mục 6
# cp .env.example .env

# 4. Build và khởi chạy
docker compose up --build -d

# 5. Kiểm tra container & Backend health
docker compose ps
curl -s http://127.0.0.1:8000/health
```

---

## 3. Các Linux distro khác (theo hệ quản lý gói)

### 3.1. Cài đặt Git + Docker + Docker Compose theo từng distro

#### Fedora (41+) — `dnf`
```bash
sudo dnf install -y git dnf-plugins-core
sudo dnf config-manager addrepo --from-repofile https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
```

#### RHEL / CentOS Stream / Rocky Linux / AlmaLinux — `dnf`
```bash
sudo dnf install -y git dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
```

#### Arch Linux / Manjaro / EndeavourOS — `pacman`
```bash
sudo pacman -Syu --noconfirm
sudo pacman -S --needed git docker docker-compose docker-buildx
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
```

#### openSUSE Leap / Tumbleweed — `zypper`
```bash
sudo zypper refresh
sudo zypper install -y git docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
```

### 3.2. Kiểm tra môi trường → Clone → Khởi động (chung cho mọi distro Linux)
```bash
git --version
docker --version
docker compose version
docker info

git clone https://github.com/NguyenMinhCuong1412/Escrow_Marketplace_UniHack.git
cd Escrow_Marketplace_UniHack

# (Tùy chọn) Xem Mục 6 nếu cần điền PINATA_JWT / AGENT_PRIVATE_KEY
# cp .env.example .env

docker compose up --build -d
docker compose ps
curl -s http://127.0.0.1:8000/health
```

---

## 4. macOS (Intel và Apple Silicon)

### 4.1. Cài đặt Git và Docker Desktop (Intel `x86_64` & Apple Silicon `M1–M4`)

1. **Cài Git** (nếu máy chưa có):
   ```bash
   xcode-select --install
   ```
   *(Hoặc bằng Homebrew: `brew install git`.)*

2. **Cài Docker Desktop for Mac:**
   - Nếu đã cài **Homebrew** (https://brew.sh):
     ```bash
     brew install --cask docker-desktop
     ```
   - Hoặc tải bộ cài `.dmg` trực tiếp tại https://www.docker.com/products/docker-desktop/ (chọn đúng **Mac with Apple silicon** cho máy M1–M4 hoặc **Mac with Intel chip** cho máy Intel).

3. Mở **Docker Desktop** trong thư mục `/Applications`, cấp quyền khởi tạo ban đầu và chờ trạng thái **Engine running**.

> **Ghi chú Apple Silicon (`linux/arm64`):** Cả `backend/Dockerfile` (`python:3.12-slim`) và `frontend/Dockerfile` (`node:20-slim` kèm `python3`, `make`, `g++` ở stage `builder`) đều hỗ trợ build gốc `linux/arm64` cho M1–M4 mà không cần ép giả lập `amd64`.

### 4.2. Kiểm tra môi trường → Clone → Khởi động
Mở **Terminal** (hoặc iTerm2):

```bash
# 1. Kiểm tra công cụ & kiến trúc
uname -m
git --version
docker --version
docker compose version
docker info

# 2. Clone mã nguồn
git clone https://github.com/NguyenMinhCuong1412/Escrow_Marketplace_UniHack.git
cd Escrow_Marketplace_UniHack

# 3. (Tùy chọn) Tạo file .env nếu muốn dùng Pinata hoặc AI Auto-Agent — xem Mục 6
# cp .env.example .env

# 4. Build và khởi chạy
docker compose up --build -d

# 5. Kiểm tra container & Backend health
docker compose ps
curl -s http://127.0.0.1:8000/health
```

Trên macOS, khuyên mở **`http://localhost:3000`** (hoặc dùng Chrome / Edge / Firefox / Brave) để tránh Safari chặn cookie `Secure` trên `127.0.0.1` HTTP.

---

## 5. GitHub Codespaces (Chạy trực tiếp trên trình duyệt)

GitHub Codespaces cho phép mở và chạy toàn bộ dự án **ngay trên trình duyệt**, không cần cài Git hay Docker lên máy cá nhân. Repo đã tích hợp sẵn [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json) và [`.devcontainer/compose.codespaces.yml`](.devcontainer/compose.codespaces.yml).

### 5.1. Tạo Codespace
1. Mở repository trên GitHub → bấm nút **`<> Code`** → chuyển sang tab **Codespaces** → chọn **Create codespace on main** *(khuyên chọn máy từ **4 cores / 8 GB RAM** nếu có, để build image OpenCV + Next.js nhanh hơn)*.
2. Chờ khoảng 30–60 giây để Codespace khởi tạo môi trường Ubuntu kèm **Docker-in-Docker** và **Docker Compose v2**.

### 5.2. (Tùy chọn) Cấu hình Pinata / Agent an toàn bằng GitHub Codespaces Secrets
**Tuyệt đối không commit file `.env` hay key lên repository.**
- Nếu chỉ xem giao diện Marketplace, kết nối ví, xác thực phiên và kiểm tra giao dịch on-chain: **không cần cấu hình Secrets nào** (`SESSION_SECRET` và `ATTEST_API_KEY` được hệ thống tự sinh ngẫu nhiên an toàn trong Docker volume `runtime_secrets`).
- Nếu cần bật upload IPFS (`PINATA_JWT`) hoặc AI Auto-Agent ký `attest()` (`AGENT_PRIVATE_KEY` + `AGENT_AUTO`):
  1. Vào **GitHub Account Settings → Codespaces → Secrets** *(khuyên dùng — chỉ gắn cho tài khoản của bạn)* hoặc **Repository Settings → Secrets and variables → Codespaces**, tạo các secret cần dùng (`PINATA_JWT`, `AGENT_PRIVATE_KEY`, `AGENT_AUTO=true`, tùy chọn `IPFS_GATEWAY`).
  2. Gán quyền truy cập repository `Escrow_Marketplace_UniHack` cho secret đó.
  3. Nếu thêm secret *sau khi* Codespace đang chạy, hãy bấm thông báo **Reload / Restart Codespace** để biến môi trường nạp vào shell của Codespace trước khi chạy `docker compose up -d`.

> **Lưu ý về biến `NEXT_PUBLIC_*` build-time:**
> Các biến có tiền tố `NEXT_PUBLIC_*` (`NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_ESCROW_ADDRESS`, `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_IPFS_GATEWAY`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`) được Next.js đóng gói trực tiếp vào mã JavaScript phía trình duyệt lúc **`next build` (`docker compose build`)**.
> - Nếu bạn thay đổi bất kỳ biến `NEXT_PUBLIC_*` nào, bắt buộc chạy lại **`docker compose up --build -d`**.
> - Nếu chỉ thêm secret phía server (`PINATA_JWT`, `AGENT_PRIVATE_KEY`, `AGENT_AUTO`), chỉ cần chạy `docker compose up -d`.

### 5.3. Kiểm tra môi trường & Khởi động trong Terminal của Codespaces
Trong Terminal của Codespaces (mặc định đang ở `/workspaces/Escrow_Marketplace_UniHack`), chạy:

```bash
# 1. Kiểm tra Docker-in-Docker, Compose & biến Codespaces
git --version
docker --version
docker compose version
docker info
echo "CODESPACE_NAME=${CODESPACE_NAME:-local}"

# 2. Khởi chạy toàn bộ dự án bằng lệnh chuẩn (tự ghép override .devcontainer/compose.codespaces.yml)
docker compose up --build -d

# 3. Kiểm tra container healthy & Backend health nội bộ
docker compose ps
curl -s http://127.0.0.1:8000/health
```

### 5.4. Mở website, bảo mật Ports Private & cơ chế hoạt động trên Codespaces
1. Mở tab **Ports** (cạnh Terminal trong VS Code web) → kiểm tra 2 cổng `3000` và `8000`:
   - **Cả port `3000` và `8000` mặc định phải giữ ở chế độ `Private`** (đã khai báo trong [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json)). **Không** chuyển port `8000` sang `Public`.
2. Tại dòng port **`3000`** (`Escrow Marketplace (Web UI)`), bấm biểu tượng quả địa cầu (**Open in Browser**) để mở URL HTTPS dạng `https://<CODESPACE_NAME>-3000.app.github.dev` trong **một tab trình duyệt riêng**.
3. **Cách các lớp bảo mật & BFF hoạt động trên forwarded URL Codespaces:**
   - **Cookie xác thực (`escrow_auth_session`):** URL Codespaces dùng `HTTPS`, nên cookie `HttpOnly; Secure; SameSite=Lax` hoạt động ổn định trên mọi trình duyệt kể cả Safari.
   - **BFF & CSRF (`ALLOWED_ORIGINS`):** Toàn bộ route `/api/*` gọi nội bộ tới `http://backend:8000` trong mạng Docker riêng. Entrypoint [`docker/frontend-entrypoint.sh`](docker/frontend-entrypoint.sh) và [`docker/backend-entrypoint.sh`](docker/backend-entrypoint.sh) tự động nối origin `https://<CODESPACE_NAME>-3000.app.github.dev` vào `ALLOWED_ORIGINS` (cho Next.js BFF chống CSRF) và `CORS_ORIGINS` (cho FastAPI), đồng thời vẫn chặn cross-site / origin lạ (`403 CSRF_REJECTED`).
   - **Giữ port `8000` Private cho các request phía client (`/_backend`):** Do `NEXT_PUBLIC_BACKEND_URL` được đóng gói lúc build, [`.devcontainer/compose.codespaces.yml`](.devcontainer/compose.codespaces.yml) cấu hình `NEXT_PUBLIC_BACKEND_URL=/_backend` kết hợp danh sách 5 đường dẫn đọc công khai hợp lệ trong [`frontend/next.config.js`](frontend/next.config.js) (`/health`, `/report/<id>`, `/agent/status/<id>`, `/trade/<id>/uris`, `/trade/<id>/nonce-qr.png`). Nhờ đó, trang `/trade/3/report` hay `/trade/4` gọi **cùng origin HTTPS port `3000`** thay vì gọi chéo sang port `8000` — tránh lỗi Mixed Content, tránh bị proxy GitHub chặn port `8000` Private và không phụ thuộc `CODESPACE_NAME` khi build.
4. **Cách kết nối ví trên Codespaces:**
   - **Ví trình duyệt (Core Wallet / MetaMask):** Bắt buộc dùng tab trình duyệt ngoài (**Open in Browser**); extension ví **không** tiêm vào khung *Simple Browser* nhúng trong VS Code web.
   - **Local Wallet (`/auth/local`):** Hoạt động trực tiếp trên `https://<CODESPACE_NAME>-3000.app.github.dev` (có HTTPS để WebCrypto hoạt động).
   - **WalletConnect:** Tự động gắn metadata origin hiện tại (`window.location.origin`), cho phép quét QR bằng ví di động.
   - **Phương án thay thế bằng VS Code Desktop:** Chọn *Open in VS Code Desktop* trên GitHub Codespaces (hoặc `gh codespace ports forward 3000:3000 8000:8000`) để tunnel an toàn về `http://127.0.0.1:3000` trên máy cá nhân mà vẫn giữ mọi port Private.

---

## 6. Cấu hình lần đầu (Tùy chọn theo nhu cầu)

### Chế độ 1 — Dùng ngay không cần tạo `.env` (Khuyên dùng cho người mới xem demo)
Khi chạy `docker compose up --build -d` trực tiếp:
- Hệ thống **tự động trỏ đúng hợp đồng đã deploy trên Avalanche Fuji (`43113`)**:
  - `Escrow`: `0x19D053c84941411888f5b9e40c854365fdd4eb00`
  - `CollectibleToken (CDU)`: `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78`
- `init-secrets` **tự sinh an toàn** 2 khóa nội bộ ngẫu nhiên độc lập (`SESSION_SECRET` và `ATTEST_API_KEY`, dài `>= 32` ký tự) lưu vào Docker volume `runtime_secrets`.
- Hỗ trợ duyệt Marketplace, tạo/kết nối ví, xác thực EIP-191, tạo tin/yêu cầu mua trong SQLite và xem giao dịch on-chain trên Fuji.
- **Giới hạn khi thiếu credentials:** Upload ảnh qua `/api/pin` báo lỗi `503` (fail-closed, không dùng mock CID trên Fuji); AI Auto-Agent `attest()` và `nonce-qr.png` báo thiếu `AGENT_PRIVATE_KEY` (`503`).

### Chế độ 2 — Bật upload ảnh IPFS (Pinata) và/hoặc AI Auto-Agent `attest()`
Trên máy local, tạo `.env` từ [`.env.example`](.env.example):

- **Windows (PowerShell):**
  ```powershell
  Copy-Item .env.example .env
  notepad .env
  ```
- **Ubuntu / Linux / macOS:**
  ```bash
  cp .env.example .env
  nano .env
  ```

Các biến tùy chọn trong `.env` (hoặc Codespaces Secrets):
- `PINATA_JWT=...` *(token từ https://app.pinata.cloud/ có quyền `pinFileToIPFS` để upload ảnh niêm yết & bằng chứng)*.
- `AGENT_PRIVATE_KEY=...` và `AGENT_AUTO=true` *(chỉ dùng cho ví AI Agent khớp `Escrow.agent()` trên Fuji và có AVAX testnet làm gas)*.
- *(Tùy chọn)* `IPFS_GATEWAY=https://<ten-gateway>.mypinata.cloud/ipfs/` để tránh giới hạn tốc độ (`HTTP 429`) của gateway công khai.

> **Cảnh báo bảo mật:** Tuyệt đối không chia sẻ hoặc commit `.env`, private key, seed phrase hay token lên GitHub / ảnh chụp màn hình.

---

## 7. Kiểm tra website & Kết nối ví Avalanche Fuji (`43113`)

Sau khi `docker compose ps` báo cả `backend` và `frontend` đều **`healthy` / `running`**:

- **Website:** `http://127.0.0.1:3000` (hoặc `http://localhost:3000` trên local/macOS; `https://<CODESPACE_NAME>-3000.app.github.dev` trên Codespaces)
- **API Backend Health:** `http://127.0.0.1:8000/health` *(hoặc `<frontend-url>/_backend/health` trong Codespaces)*

*(Lưu ý: Nếu chưa điền `AGENT_PRIVATE_KEY`, `/health` vẫn trả JSON `"tesseract": true`, `"insecure_for_chain": false` kèm `"ok": false` báo thiếu `AGENT_PRIVATE_KEY` — đây là hành vi trung thực bình thường ở Chế độ 1.)*

Các trang chính:
- `/` — Trang chủ Marketplace duyệt đồ sưu tầm đang đăng bán
- `/trades` — Danh sách giao dịch Escrow của ví đang kết nối
- `/trade/4` — Xem ví dụ giao dịch thật trên Avalanche Fuji (`Trade #4 = Cancelled`)
- `/trade/3/report` — Xem báo cáo AI giải trình & đối chiếu `keccak256` on-chain
- `/auth` hoặc `/auth/local` — Kết nối ví Core/MetaMask/WalletConnect hoặc tạo Local Wallet thử nghiệm

*(Lưu ý: `/trades` và `/trade/<id>` yêu cầu kết nối & xác thực ví trước; nếu chưa kết nối, giao diện tự chuyển hướng sang `/auth`.)*

### Hai cách lấy & dùng ví thử nghiệm Fuji miễn phí
1. **Core Wallet / MetaMask (Khuyên dùng):**
   - Cài **Core Wallet** (https://core.app/) hoặc MetaMask, bật chế độ **Testnet**, chọn mạng **Avalanche Fuji C-Chain** (`RPC`: `https://api.avax-test.network/ext/bc/C/rpc`, `Chain ID`: `43113`, `Symbol`: `AVAX`, `Explorer`: `https://testnet.snowtrace.io`).
   - Nhận AVAX testnet miễn phí tại: https://core.app/tools/testnet-faucet/
   - Trên website bấm **`Kết nối ví`** → **`Xác thực ví`** và ký thông điệp EIP-191 (miễn phí gas).
2. **Local Wallet trên trình duyệt (`/auth/local`):**
   - Chọn **`Tạo ví`** → đặt mật khẩu → sao lưu cụm từ khôi phục test → nạp ít AVAX Fuji từ faucet nếu muốn gửi giao dịch tạo/nạp cọc Escrow on-chain. *(Lưu ý: reload toàn trang sẽ khóa lại khóa riêng trong RAM để an toàn, bạn chỉ cần nhập mật khẩu mở khóa lại.)*

---

## 8. Dừng, khởi động lại, xem logs & cập nhật

Chạy trong thư mục gốc `Escrow_Marketplace_UniHack` (dùng chung cho Windows PowerShell, Linux, macOS và GitHub Codespaces):

```bash
# Xem log thời gian thực (tất cả dịch vụ / riêng từng dịch vụ)
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend

# Tạm dừng mà giữ nguyên database SQLite & secret
docker compose stop

# Khởi động lại (hoặc áp dụng thay đổi mới trong .env / Codespaces Secrets runtime)
docker compose up -d

# Tắt hẳn container (vẫn giữ dữ liệu volume backend_data & runtime_secrets)
docker compose down

# Cập nhật phiên bản mới từ GitHub và build lại
git pull
docker compose up --build -d

# Reset sạch database local & sinh lại secret mới (CẨN THẬN: xóa dữ liệu thử nghiệm local!)
docker compose down -v
```

---

## 9. Xử lý các lỗi thường gặp

| Triệu chứng / Thông báo lỗi | Nền tảng | Nguyên nhân | Cách khắc phục |
|---|---|---|---|
| `open //./pipe/dockerDesktopLinuxEngine` hoặc `Cannot connect to the Docker daemon` | Windows / macOS / Linux | Docker Desktop chưa chạy hoặc `docker.service` chưa bật | Mở **Docker Desktop** chờ *Engine running*; trên Linux chạy `sudo systemctl enable --now docker` |
| `WSL 2 installation is incomplete` hoặc lỗi ảo hóa | Windows 10/11 | Chưa cập nhật WSL2 hoặc chưa bật Virtualization (VT-x / AMD-V) | Chạy `wsl --update` trong PowerShell Admin, bật Virtualization trong BIOS/UEFI và khởi động lại máy |
| Hết dung lượng ổ `C:` khi build image Docker | Windows 10/11 | Docker Desktop lưu WSL2 disk image mặc định trên ổ `C:` | Trong **Docker Desktop → Settings → Resources → Advanced**, chuyển **Disk image location** sang ổ đĩa còn trống (ví dụ ổ `D:`) |
| `permission denied while trying to connect to the Docker daemon socket` | Ubuntu / Debian / Linux khác | Tài khoản hiện tại chưa thuộc nhóm `docker` | Chạy `sudo usermod -aG docker "$USER" && newgrp docker` (hoặc đăng xuất/đăng nhập lại) |
| `unknown shorthand flag: 'd' in -d` với `docker-compose` | Linux distro | Dùng nhầm binary `docker-compose` v1 cũ thay vì plugin v2 | Luôn gõ `docker compose ...` (có dấu cách, không gạch nối) và kiểm tra `docker compose version` |
| `Bind for 0.0.0.0:3000 failed: port is already allocated` (hoặc cổng `8000`) | Mọi nền tảng | Đã có dịch vụ khác chiếm cổng `3000` hoặc `8000` | Dừng ứng dụng đang chiếm cổng cũ rồi chạy lại `docker compose up -d` |
| Không tạo được tin đăng / báo `401` trên HTTP `127.0.0.1` | Safari (macOS) | Safari có thể từ chối cookie `Secure` trên HTTP `127.0.0.1` | Mở **`http://localhost:3000`** hoặc dùng **Chrome / Edge / Firefox / Brave** |
| Extension Core/MetaMask không hiện trong Codespaces | GitHub Codespaces | Đang mở giao diện trong khung *Simple Browser* nhúng của VS Code | Vào tab **Ports** → cổng `3000` → bấm **Open in Browser** để mở bằng tab trình duyệt độc lập |
| Thêm Codespaces Secrets nhưng app chưa nhận | GitHub Codespaces | Secrets được nạp khi Codespace khởi tạo/khởi động lại, hoặc biến `NEXT_PUBLIC_*` cần rebuild | Restart Codespace để nạp env mới, chạy `docker compose up -d` (thêm `--build` nếu sửa `NEXT_PUBLIC_*`) |
| Codespace ngắt kết nối / báo cổng `3000` không phản hồi sau khi ngủ | GitHub Codespaces | Codespaces tự dừng container sau thời gian không hoạt động | Mở lại Codespaces → chạy `docker compose up -d` |
| Upload ảnh báo `503` / `Thiếu PINATA_JWT` | Mọi nền tảng | Chưa cấu hình `PINATA_JWT` (hệ thống fail-closed trên Fuji `43113`) | Điền `PINATA_JWT=...` trong `.env` (local) hoặc Codespaces Secrets → chạy `docker compose up -d` |
| QR Nonce / trang chi tiết trade / `/health` báo thiếu `AGENT_PRIVATE_KEY` | Mọi nền tảng | Mặc định tắt ví Agent vì lý do bảo mật | Nếu muốn test Auto-Agent `attest()` và QR Nonce, điền `AGENT_PRIVATE_KEY` + `AGENT_AUTO=true` rồi chạy `docker compose up -d` |
| Tải ảnh IPFS chậm hoặc lỗi `HTTP 429` | Mọi nền tảng | Gateway công cộng bị giới hạn tần suất | Điền gateway riêng vào `IPFS_GATEWAY=https://<ten-gateway>.mypinata.cloud/ipfs/` → chạy `docker compose up -d` |
| Giao dịch ví báo sai mạng | Mọi nền tảng | Ví đang chọn Mainnet (`43114` / `1`) | Chuyển ví sang **Avalanche Fuji Testnet (`Chain ID: 43113`)** |
