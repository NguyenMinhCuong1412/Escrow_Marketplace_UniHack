# AUTO-E2E — Happy Path `ResolvedClean` trên Avalanche Fuji (43113)

- **Kết luận: `E2E PASS`** — Fuji xác nhận `ResolvedClean` cho **Trade #6**; Seller và Buyer mỗi bên được hoàn đúng **0.003 AVAX** (100% cọc 30%).
- **Thời gian chạy:** 2026-11-20T06:07:18Z → 2026-11-20T06:10:20Z (UTC) — ~3 phút, gồm chờ `DISPUTE_WINDOW` 90 s thật trên Fuji.
- **Baseline code:** `main` @ `e491454` (Final Freeze) — không sửa contract / backend / frontend / cấu hình bảo mật. Harness mới: `tests/e2e/e2e_resolved_clean.py` (branch `test/auto-e2e-resolved-clean`).
- **Dữ liệu thô:** [`auto-e2e/e2e-fuji-result.json`](auto-e2e/e2e-fuji-result.json) (không chứa khóa/JWT).

## 1. Cấu hình & vai trò (đã xác minh on-chain)

| Mục | Giá trị |
|---|---|
| Chain ID | `43113` (Avalanche Fuji C-Chain) |
| Escrow | [`0x19D053c84941411888f5b9e40c854365fdd4eb00`](https://testnet.snowtrace.io/address/0x19D053c84941411888f5b9e40c854365fdd4eb00) — khớp `contracts/deployments/43113.json`, không redeploy |
| CDU (CollectibleToken) | `0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78` |
| Windows (evidence / attest / dispute) | 600 s / 600 s / 90 s |
| **Seller** (ví testnet chuyên dụng, tạo cho test, Owner cấp 0.05 AVAX) | `0xeBb338A3D44F197AFFf45C09601032e620bc56FF` |
| **Buyer** (ví testnet chuyên dụng, tạo cho test, Owner cấp 0.05 AVAX) | `0xD242eA7c7870F0b98358670550268689A4636Be2` |
| **Agent** (`onlyAgent`, khóa Owner ủy quyền trong `backend/.env`) | `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081` — `Escrow.agent()` = `0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081` ✓ |
| Owner/Arbiter (không tham gia, không ký) | `0xCa76cBE87902108712729A02F78C1F8cC20b39Eb` |
| Backend | App FastAPI Final Freeze chạy in-process trong image backend Docker; `/health`: `ok=true`, `chain_id=43113`, `agent_matches_contract=true`, `insecure_for_chain=false`, `pinata_relay_configured=true`; `require_proxy_signature=true`, `allow_local_hosts=false`, `enforce_evidence_hash=true` |

Bốn địa chỉ Seller ≠ Buyer ≠ Agent ≠ Owner (kiểm tra trong E0).

## 2. Kết quả từng bước

| ID | Bước | Kết quả | Chi tiết |
|---|---|---|---|
| E0 | Chain/contract/roles | **PASS** | chain=43113 escrow=0x19D053c84941411888f5b9e40c854365fdd4eb00 agent_match=True seller≠buyer≠agent≠owner=True |
| E0b | Test AVAX balances | **PASS** | seller=0.05 buyer=0.05 agent=0.26999999998004172 |
| E0c | Backend /health (in-process, Final Freeze toggles) | **PASS** | {"ok": true, "chain_id": 43113, "agent": "0x579eD8b6a4A0dAc0E3ACB0C96392ADE857327081", "agent_matches_contract": true, "tesseract": true, "pinata_relay_configured": true, "insecure_for_chain": false} |
| E1 | Seller tạo listing (ảnh IPFS) | **PASS** | listing=lst_0032d2b5ba3a4b619434 image=ipfs://QmRTUnxmnUkx3ZtcLudi6rHAC1NucdpciTTJTLbRqzYMKF |
| E2 | Buyer gửi yêu cầu mua | **PASS** | request=req_2af799d9e2c74568a303 |
| E3 | Seller accept + createTrade + bind-trade | **PASS** | trade_id=6 |
| E4 | Deposit 30% ×2 | **PASS** | each=0.003 AVAX state=AwaitingEvidence CDU seller/buyer=(3000000000000000, 3000000000000000) |
| E5 | Evidence (synthetic, nonce in frame) uploaded IPFS | **PASS** | seller=ipfs://QmeYBPV6sTbqp3zwxV3rpKnuGr2HKYqcJbLPV2jsYNdQfY buyer=ipfs://QmSr8d6CB3UHXQmFoTneLs7g62cMeQPwD1CtmLA4X7EbbV |
| E6 | submitEvidence(keccak256(utf8(uri))) ×2 + đăng ký URI (listing có chữ ký seller) | **PASS** |  |
| E7 | Evidence hash on-chain == keccak256(utf8(uri)) | **PASS** | seller=0x4561d4313a5f7b27d506e5d1a051b0b038553ba9ee0c7cb1f4c6a40e09f4692d buyer=0x2e742221a4c95c9b2eec0490c2909141b65ac7ab3d7469d66ecdc206dcc0962d |
| E8 | Agent attest flagged=false (from = Agent) | **PASS** | state=Attested flagged=False risk=20 reportHash_match=True |
| E9 | Hết dispute window, không có khiếu nại | **PASS** | deadline=1795154997 (Fuji: chờ thời gian thật) disputes=0 |
| E10 | resolveClean | **PASS** | event ResolvedClean(tradeId=6) PayoutDeferred=0 |
| E11 | Cọc hoàn đúng cho Seller & Buyer, CDU burn, state Resolved | **PASS** | refund seller=0.003 buyer=0.003 (expected 0.003 each) CDU=(0, 0) reputation=(51, 51) |
| E12 | Listing reconcile → SOLD | **PASS** | listing.status=SOLD |

## 3. IPFS & đối chiếu evidence hash

| Vai trò | URI (CID) | SHA-256 file | `keccak256(utf8(uri))` tính local | Hash on-chain (`getTrade`) | Khớp |
|---|---|---|---|---|---|
| Listing (ảnh niêm yết, seller ký EIP-191) | `ipfs://QmRTUnxmnUkx3ZtcLudi6rHAC1NucdpciTTJTLbRqzYMKF` | `7cadab1edf1802ed63aaf8b725bd3646d6ee939369551d2a938894e88ec31df1` | — | — | — |
| Seller (đóng gói, nonce `6426def8`) | `ipfs://QmeYBPV6sTbqp3zwxV3rpKnuGr2HKYqcJbLPV2jsYNdQfY` | `903e863ac4258bd93df526d1296bbda6b5daa0cd0e7e9198868c6cffa0eff3f4` | `0x4561d4313a5f7b27d506e5d1a051b0b038553ba9ee0c7cb1f4c6a40e09f4692d` | `0x4561d4313a5f7b27d506e5d1a051b0b038553ba9ee0c7cb1f4c6a40e09f4692d` | ✅ |
| Buyer (mở hộp, nonce `6426def8`) | `ipfs://QmSr8d6CB3UHXQmFoTneLs7g62cMeQPwD1CtmLA4X7EbbV` | `c16def67c221bd1bc09f564ca3810a9e674f1873454778fa29197549b319c8f7` | `0x2e742221a4c95c9b2eec0490c2909141b65ac7ab3d7469d66ecdc206dcc0962d` | `0x2e742221a4c95c9b2eec0490c2909141b65ac7ab3d7469d66ecdc206dcc0962d` | ✅ |

Ảnh do harness sinh (bộ demo tổng hợp từ `ai-pipeline/tests/synth.py`: cùng một vật thể, giấy ghi nonce của đúng trade trong khung hình), upload qua endpoint `/pin` của backend lên Pinata thật. AI report: `risk_score=20`, `flagged=False`, `reportHash` on-chain `0x88002b404c3970806297ea7d2e4db84a2a32117677de93c9b269cd2863f4d11b` = report hash backend ✅.

## 4. Giao dịch Fuji

| Bước | Người ký | Tx hash | Block | Trạng thái | Gas used | Phí (AVAX) | Value (AVAX) | Link |
|---|---|---|---|---|---|---|---|---|
| createTrade | seller | `0x797a1cdf676fc7d9265c685f326fa97fd2b8fa20d34bf759d2b43ff84e6557fa` | 61366384 | success | 252,292 | 0.00000000004036672 | 0 | [Snowtrace](https://testnet.snowtrace.io/tx/0x797a1cdf676fc7d9265c685f326fa97fd2b8fa20d34bf759d2b43ff84e6557fa) |
| deposit (seller) | seller | `0x3f46e7fddd823cd2a28f1b9156ba95355d814494694cf0f2882aa4879fcad3c3` | 61366385 | success | 94,450 | 0.000000000015112 | 0.003 | [Snowtrace](https://testnet.snowtrace.io/tx/0x3f46e7fddd823cd2a28f1b9156ba95355d814494694cf0f2882aa4879fcad3c3) |
| deposit (buyer) | buyer | `0x5bd0311abecafa285f641b6ba51e94098888cc90bc55efb0876d224e760885d5` | 61366387 | success | 101,413 | 0.00000000001622608 | 0.003 | [Snowtrace](https://testnet.snowtrace.io/tx/0x5bd0311abecafa285f641b6ba51e94098888cc90bc55efb0876d224e760885d5) |
| submitEvidence (seller) | seller | `0xd82bdec4b3afb828a18df9024fcdfdb3cce561ed3ff54873d723b700deb48520` | 61366390 | success | 50,775 | 0.000000000008124 | 0 | [Snowtrace](https://testnet.snowtrace.io/tx/0xd82bdec4b3afb828a18df9024fcdfdb3cce561ed3ff54873d723b700deb48520) |
| submitEvidence (buyer) | buyer | `0x02ecfeec3d884f79d2052d8474dbb97dca501b532b65f67c45fa891fa2b294fd` | 61366391 | success | 52,899 | 0.00000000000846384 | 0 | [Snowtrace](https://testnet.snowtrace.io/tx/0x02ecfeec3d884f79d2052d8474dbb97dca501b532b65f67c45fa891fa2b294fd) |
| attest (Agent) | agent | `0x7eb61255837eb0697724d685f11441904a4ce06b37b915ecc7c556923450eedd` | 61366405 | success | 58,959 | 0.00000000000943344 | 0 | [Snowtrace](https://testnet.snowtrace.io/tx/0x7eb61255837eb0697724d685f11441904a4ce06b37b915ecc7c556923450eedd) |
| resolveClean (seller) | seller | `0xda5d71a0c2d467992c729d93f12321624ceb71851e7ef4819b46a7dd4625b931` | 61366455 | success | 98,841 | 0.00000000001581456 | 0 | [Snowtrace](https://testnet.snowtrace.io/tx/0xda5d71a0c2d467992c729d93f12321624ceb71851e7ef4819b46a7dd4625b931) |

Kiểm chứng độc lập (RPC `api.avax-test.network`, ngoài harness): cả 7 tx `status=1`, `to = Escrow`, `from` đúng vai trò (attest từ `0x579e…7081`); event Escrow lần lượt `TradeCreated`, `Deposited`, `Deposited`+`FullyFunded`, `EvidenceSubmitted` ×2, `Attested`, `ReputationChanged` ×2 + `ResolvedClean(tradeId=6)`.

## 5. Cọc, hoàn trả & phí gas

| Ví | Số dư trước | Cọc nộp | Hoàn trả (đo bằng số dư quanh `resolveClean`) | Tổng phí gas | Số dư sau | Chênh lệch ròng |
|---|---|---|---|---|---|---|
| Seller | 0.05 | 0.003 | **0.003** | 0.00000000007941728 | 0.04999999992058272 | −0.00000000007941728 (= phí gas) |
| Buyer | 0.05 | 0.003 | **0.003** | 0.00000000002468992 | 0.04999999997531008 | −0.00000000002468992 (= phí gas) |
| Agent | 0.26999999998004172 | — | — | 0.00000000000943344 | 0.26999999997060828 | −0.00000000000943344 |

- Cọc mỗi bên = 30% × 0.01 AVAX = **0.003 AVAX** (`depositRequired` on-chain). **Không có thanh toán giá trị sản phẩm qua Escrow.**
- Hoàn trả trực tiếp vào ví (không qua `pendingWithdrawals`: cả hai = `['0', '0']`; `PayoutDeferred` = 0).
- CDU sau giải ngân: Seller/Buyer = `['0', '0']` (burn). Reputation: Seller/Buyer = `[51, 51]` (50 → 51, +1 theo `resolveClean`).
- Phí gas trên Fuji tại thời điểm chạy rất thấp (~160 wei/gas), nên số dư ví gần như không đổi ngoài phí.

## 6. Trạng thái cuối trên blockchain

`getTrade(6)`: `state = Resolved`, `flagged = false`, `riskScore = 20`, `sellerDeposit = buyerDeposit = 0.003 AVAX` (giá trị lịch sử), seller `0xeBb338A3D44F197AFFf45C09601032e620bc56FF`, buyer `0xD242eA7c7870F0b98358670550268689A4636Be2`. `nextTradeId = 7`. Listing off-chain `lst_0032d2b5ba3a4b619434` → `SOLD`, request `req_2af799d9e2c74568a303` hoàn tất.

Số dư Escrow sau test = 0.599999999999999978 AVAX — **không thuộc Trade #6**: đó là cọc 0.3 + 0.3 AVAX của **Trade #5** (seller `0x1093…7c7c`, buyer `0x0f73…38b1`, giá trị 1 AVAX, `AwaitingEvidence`) do phiên khác tạo trước lượt test; harness không tương tác với Trade #5.

## 7. Diễn tập trên Anvil (không phải bằng chứng Fuji)

Trước khi chạy Fuji, cùng harness chạy trên Anvil local (contract deploy bằng `Deploy.s.sol`, windows 600/600/90, gateway IPFS giả, `evm_increaseTime` cho dispute window): **15/15 bước PASS**, Trade #1 `ResolvedClean`, hoàn 0.003/0.003. Kết quả này chỉ dùng để kiểm tra harness.

## 8. An toàn & phạm vi

- Không sửa contract, ABI, backend, frontend, compose hay toggle bảo mật. Toggle Fuji giữ nguyên fail-closed; kênh BFF dùng chữ ký HMAC + nonce chống replay như frontend thật (API key ngẫu nhiên, chỉ tồn tại trong tiến trình test).
- Khóa Seller/Buyer: ví testnet tạo riêng cho test (Owner đồng ý), lưu `0600` tại `.worktrees/.e2e-secrets/` (loại khỏi git), không in/log. Khóa Agent và `PINATA_JWT` được đọc từ `.env` local (mount read-only), không in/log. Không chạm ví Owner; không dùng Core Wallet.
- Agent chỉ chạy trong tiến trình test (`agent_auto=false`, gọi `tick()` thủ công) — không bật Agent Worker nền.
- Gitleaks trên harness + kết quả: chỉ 1 false positive (`"token"` = địa chỉ CDU công khai, giống `contracts/deployments/43113.json`).

## 9. Hạn chế & hướng xử lý

| # | Hạn chế | Hướng xử lý |
|---|---|---|
| 1 | Harness đóng vai BFF (ký HMAC với API key của tiến trình) thay vì đăng nhập UI bằng Core Wallet; luồng ví UI không được tự động hoá | Bằng chứng on-chain giống hệt luồng UI (cùng API, cùng contract). Video demo bằng Core Wallet minh hoạ phần UI |
| 2 | Ảnh bằng chứng là ảnh tổng hợp (synthetic) có nonce dạng chữ; không phải ảnh chụp thật có QR | Đủ để kiểm chứng pipeline + on-chain; video demo dùng ảnh thật |
| 3 | Image backend không có `httpx` (dependency test) — harness cài tạm trong container `--rm` | Không ảnh hưởng runtime |
| 4 | Trade #5 (của phiên khác) đang giữ 0.6 AVAX ở `AwaitingEvidence` | Owner hoàn tất hoặc để timeout `cancelOnEvidenceTimeout` |
| 5 | Agent còn ~0.27 AVAX | Đủ cho nhiều lần `attest` (~9.4×10⁻¹² AVAX/lần ở mức phí hiện tại); nạp thêm nếu Release Gate yêu cầu ≥ 0.5 |

## 10. Tái chạy

```powershell
docker run --rm -v "D:\Escrow_Marketplace_Demo\<worktree>:/repo" -v "<secrets dir>:/secrets:ro" `
  -v "D:\Escrow_Marketplace_Demo\backend\.env:/envs/backend.env:ro" -v "D:\Escrow_Marketplace_Demo\.env:/envs/root.env:ro" `
  -w /repo --entrypoint sh <backend-image> -c "pip install -q httpx; python -u tests/e2e/e2e_resolved_clean.py --network fuji --testers /secrets/fuji-testers.json --backend-env /envs/backend.env --root-env /envs/root.env --out /repo/docs/test-evidence/auto-e2e"
```
