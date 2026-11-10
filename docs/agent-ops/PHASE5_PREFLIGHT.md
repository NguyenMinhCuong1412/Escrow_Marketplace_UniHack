# Phase 5 Pre-flight — Trạng thái & việc còn lại

**Cập nhật:** 2026-11-10 · **Deadline nộp bài:** 21/11/2026 23:59 (còn 11 ngày)  
**`main` hiện tại:** `9101c61` — đã có đủ Phase 3A + 4A + 4B + 4C

---

## ✅ Phần đã hoàn tất (Cowork thực hiện)

| Bước | Kết quả |
|---|---|
| B1 | Xoá 3 file `ESC-0x0-report.md` untracked trùng lặp |
| B2 | **Merge `phase/4c-frontend-integration` → `main`** (fast-forward, mang cả 3A+4A+4B+4C) |
| B3 | Commit 63 file docs — commit `9101c61`, verify không lẫn `.env` |
| B4 | `git worktree prune` + xoá 4 branch alias trùng commit |
| B7a | Tạo khung `contracts/.env`, `backend/.env`, `frontend/.env.local` |

**Verify đã chạy:**

```
✅ frontend/ đầy đủ trên main (page, admin, api/pin)
✅ backend có X-API-Key auth (Phase 3A)
✅ 32 file docs/ đã được git track
✅ Không file .env nào bị track (chỉ .env.example)
✅ ATTEST_API_KEY sinh tự động, khớp giữa backend ↔ frontend
```

### Phát sinh đã xử lý

**810 file hiện "modified" do line-ending CRLF.** Đã phân loại: 758 file chỉ khác CRLF (đã khôi phục), 1 file thay đổi thật (`CLAUDE.md`, giữ lại). Đây là vấn đề Windows checkout — xem mục "Dọn dẹp tuỳ chọn" cuối file để chặn tái diễn.

**README.md:** bản trên branch `4c` (78 dòng, có sơ đồ kiến trúc + hướng dẫn chạy local) đầy đủ hơn bản local (28 dòng stub). Đã lấy bản branch. Bản local backup ở `README.local-backup.md` — xem lại rồi xoá.

---

## 🔴 Việc bạn phải tự làm

### Bước 1 — Push `main` lên GitHub

Shell của Cowork không có credential GitHub nên không push được. Mở terminal trên Windows:

```bash
cd D:\unihack-escrow-project
git push origin main
```

`main` đang đi trước `origin/main` **8 commit**. Sau khi push, repo public sẽ hiện đầy đủ sản phẩm thay vì chỉ scaffold.

---

### Bước 2 — Sửa mô tả repo trên GitHub

Repo <https://github.com/NguyenMinhCuong1412/Escrow_Marketplace_UniHack> đang hiển thị mô tả **"PHẦN MỀM QUẢN LÝ SỰ KIỆN"** (sót lại từ project UniAttend cũ). Giám khảo sẽ nhìn thấy dòng này đầu tiên.

Vào repo → nút ⚙️ cạnh "About" (góc phải trên) → sửa:

- **Description:** `Trustless escrow marketplace on Avalanche with AI-verified evidence attestation`
- **Topics:** `avalanche` `blockchain` `escrow` `ai-agent` `computer-vision` `solidity` `nextjs`

Đồng thời kiểm tra:

- Repo đã **Public** chưa (Settings → General → Danger Zone)
- Đã add collaborator **`tuantqse90`** chưa (Settings → Collaborators)

> BTC ghi rõ: mọi link phải mở công khai được, nếu không sẽ bị loại.

---

### Bước 3 — Tạo 2 ví Fuji riêng biệt

Theo **DEC-009**, deployer và agent phải là **2 private key khác nhau**.

| Ví | Vai trò on-chain | Quyền |
|---|---|---|
| **Deployer** | `Escrow.owner()` | `resolveDispute()`, quản trị |
| **AI Agent** | `Escrow.agent()` | Chỉ `attest()` |

Lý do tách: agent key nằm trong `backend/.env` và được dùng tự động để ký `attest()`. Nếu lộ, kẻ tấn công chỉ giả mạo được attestation — **không chạm được vào tiền** trong escrow.

**Cách A — Foundry (nhanh nhất):**

```bash
cast wallet new
```

Chạy **2 lần**. Mỗi lần in ra một cặp `Address` + `Private key`. Ghi lại riêng, đánh dấu rõ cái nào là Deployer, cái nào là Agent.

**Cách B — MetaMask:**

1. Mở MetaMask → menu account (góc trên) → **Add account** → đặt tên `Deployer`
2. Lặp lại, đặt tên `AI Agent`
3. Với mỗi account: ⋮ → **Account details** → **Show private key** → nhập mật khẩu → copy

**Thêm mạng Fuji vào MetaMask** (nếu chưa có):

| Field | Giá trị |
|---|---|
| Network Name | Avalanche Fuji C-Chain |
| RPC URL | `https://api.avax-test.network/ext/bc/C/rpc` |
| Chain ID | `43113` |
| Symbol | `AVAX` |
| Block Explorer | `https://testnet.snowtrace.io` |

---

### Bước 4 — Xin AVAX từ faucet

Faucet chính thức: <https://core.app/tools/testnet-faucet/>

**Hai ràng buộc cần biết trước:**

1. Faucet chỉ cho dùng miễn phí nếu ví có **mainnet AVAX balance > 0**. Ví trắng hoàn toàn thì phải lấy coupon qua Guild, hoặc xin trong Discord chính thức của Avalanche.
2. **Cooldown 1 request / 2 giờ** — hai ví có thể mất nửa ngày.

**Lượng thực sự cần** (task spec ghi ≥2 AVAX/ví là rất dư):

| Ví | Tiêu gas vào | Thực tế cần |
|---|---|---|
| Deployer | Deploy 2 contracts + `setEscrow()` | ~0.1–0.2 AVAX |
| AI Agent | Mỗi lần `attest()` ~0.01 AVAX | ~0.1 AVAX |

**0.5 AVAX mỗi ví là thừa đủ.** Đừng để cooldown chặn tiến độ.

Faucet dự phòng: QuickNode Avalanche faucet, hoặc Discord Avalanche (admin cấp tay).

---

### Bước 5 — Điền key vào 3 file `.env`

Ba file đã tạo sẵn đầy đủ biến và comment hướng dẫn. Bạn chỉ cần điền **3 chỗ**.

#### 5.1 — `contracts/.env`

```
PRIVATE_KEY=<private key ví DEPLOYER>
AGENT_ADDRESS=<ĐỊA CHỈ PUBLIC 0x... của ví AGENT>
```

> **Chỗ dễ sai nhất:** `AGENT_ADDRESS` là địa chỉ công khai `0x...` (42 ký tự), **không phải** private key. Script gọi `vm.envAddress()` — dán nhầm key vào sẽ fail parse address ngay.

Ba biến `*_WINDOW_SECS` đã set sẵn `600 / 600 / 90` (10 phút / 10 phút / 90 giây) cho demo. Nếu để trống, `vm.envOr` fallback về **3 ngày / 1 ngày / 2 ngày** → không demo kịp.

#### 5.2 — `backend/.env`

```
AGENT_PRIVATE_KEY=<private key ví AGENT>
```

`ESCROW_ADDRESS` để trống — backend tự đọc từ `contracts/deployments/43113.json` sau deploy.  
`ATTEST_API_KEY` đã sinh sẵn, **không sửa** (đã khớp với frontend).

#### 5.3 — `frontend/.env.local`

```
PINATA_JWT=<JWT từ pinata.cloud>
```

Lấy JWT: đăng ký <https://pinata.cloud> (free tier đủ dùng) → **API Keys** → **New Key** → bật quyền `pinFileToIPFS` → copy **JWT** (không phải API Key/Secret).

> Để trống vẫn chạy được — route `/api/pin` có mock fallback sinh CID giả, nhưng ảnh không thật sự lên IPFS. **Demo nên có JWT thật.**

Ba dòng `NEXT_PUBLIC_ESCROW_ADDRESS` / `TOKEN_ADDRESS` / `DEPLOY_BLOCK` để trống — agent ESC-050 điền sau deploy.

`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` để trống cũng chạy local được (RainbowKit chỉ cảnh báo). Nếu muốn demo kết nối ví mobile thì lấy free tại <https://cloud.walletconnect.com>.

---

### Bước 6 — Verify trước khi dispatch ESC-050

Chạy trên Windows (shell Cowork không có `forge`/`cast`):

```bash
cd D:\unihack-escrow-project\contracts

# 1. Số dư 2 ví — cả hai phải khác 0
cast balance <deployer_address> --rpc-url fuji
cast balance <agent_address>    --rpc-url fuji

# 2. DRY RUN — quan trọng nhất
forge script script/Deploy.s.sol --rpc-url fuji
#    ^ KHÔNG có --broadcast = chỉ simulate, không tốn gas, không lên chain

# 3. Regression
forge test
```

Alias `fuji` đã khai báo sẵn trong `foundry.toml` (`rpc_endpoints`), không cần gõ URL đầy đủ.

**Bước 2 bắt hết lỗi env** (thiếu biến, sai format address, key không hợp lệ) trước khi tiêu AVAX thật. Nếu dry-run pass thì broadcast gần như chắc chắn thành công.

---

## Checklist

```
[ ] 1. git push origin main                    (Windows terminal)
[ ] 2. Sửa description repo + check Public + collaborator tuantqse90
[ ] 3. Tạo ví Deployer + ví AI Agent (2 key KHÁC NHAU)
[ ] 4. Faucet ~0.5 AVAX mỗi ví
[ ] 5. Điền 3 chỗ: PRIVATE_KEY, AGENT_ADDRESS, AGENT_PRIVATE_KEY (+ PINATA_JWT)
[ ] 6. cast balance OK → forge script dry-run OK → forge test pass
[ ] → Báo Cowork để xuất Task Specification ESC-050
```

Bước 3–4 nên làm **song song** với bước 1–2 (faucet có cooldown, xin càng sớm càng tốt).

---

## Dọn dẹp tuỳ chọn

**Chặn CRLF tái diễn** — nguyên nhân khiến 810 file hiện "modified" giả:

```bash
git config core.autocrlf true
```

Chỉ ảnh hưởng repo này trên máy bạn, không đụng đồng đội.

**Xoá backup README** sau khi xem xong:

```bash
del README.local-backup.md
```

**Branch cũ** — 4 branch phase vẫn giữ nguyên, có thể xoá sau khi push main thành công:

```bash
git branch -d phase/3a-backend-hardening phase/4a-frontend-scaffold ^
             phase/4b-core-pages phase/4c-frontend-integration
```

---

## Lưu ý bảo mật

Cowork **không đọc, không in, không commit** nội dung file `.env` nào. Ba file đã verify `git check-ignore` — tất cả đều ignored đúng, không thể vô tình commit.

Khi điền private key: đừng paste vào chat, đừng screenshot, đừng commit. Nếu lỡ lộ, tạo ví mới và deploy lại — testnet nên không mất gì.
