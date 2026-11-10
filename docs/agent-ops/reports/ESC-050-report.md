# Operational Task Report: ESC-050 (Phase 5)

**Task ID:** `ESC-050`
**Title:** Deploy Contracts to Avalanche Fuji Testnet
**Role:** DevOps / Contract Engineer (Claude Code, theo yêu cầu trực tiếp của Project Owner)
**Branch:** `phase/5-deploy-fuji`
**Date:** 2026-11-11
**Status:** READY FOR QA REVIEW

---

## 1. Preflight Check & Scope Compliance

- **Dependencies:** ví Deployer + ví Agent tạo bằng `scripts/gen-wallets.ps1` trên máy Project Owner (2 key khác nhau, DEC-009). Project Owner đã nạp Fuji AVAX: Deployer 0.15, Agent 0.10 (kiểm tra bằng `cast balance` trước khi broadcast).
- **Dry-run** (`forge script` không `--broadcast`) pass trước khi broadcast.
- **Files changed (tracked):** `contracts/deployments/43113.json`, report này, `docs/context/CURRENT_STATUS.md`.
- **Files changed (untracked, KHÔNG commit):** `contracts/.env`, `backend/.env`, `frontend/.env.local`.
- **Out of scope giữ nguyên:** `contracts/src/`, `contracts/test/`, `contracts/script/`, `backend/*.py`, source `frontend/`.
- **Deploy do ai chạy:** MASTER_DISPATCH ghi "Project Owner chạy deploy". Lần này Project Owner yêu cầu agent chạy broadcast trực tiếp trong phiên làm việc, sau khi tự nạp ví.

### Lưu ý về file `43113.json` cũ

Bản `43113.json` trên `main` (commit `798d194`) là sản phẩm của một lần **dry-run**, không phải deploy thật: địa chỉ `0xdfB1…f0f1` / `0xeaA8…0A9D` không có code trên Fuji, ví owner/agent ghi trong đó có nonce 0 và 0 AVAX. File đã được ghi đè bằng kết quả deploy thật dưới đây.

## 2. Kết quả deploy

| Mục | Giá trị |
|---|---|
| Chain | Avalanche Fuji C-Chain (`43113`) |
| Escrow | `0x1F048Bc735CF0277FeFd3fAaA3dA7d8d2c4cCbCf` |
| CollectibleToken | `0x24E0E84b3fA7C71E87dc3ee4525B9E8F1Fb7a3Fb` |
| Owner (Deployer) | `0x10dFa7a8A861a4A461A4186705F2c15EB8FA0a4c` |
| Agent | `0x10582eDa05f63ae2D132b9436B18bc76a72894E2` |
| Windows (evidence / attest / dispute) | 600 / 600 / 90 giây |
| Block chứa 3 giao dịch | `60846519` |
| `deployBlock` trong JSON | `60846507` (block lúc script mô phỏng — sớm hơn 12 block, an toàn làm mốc dưới cho `getLogs`) |

| Giao dịch | Tx hash | Gas |
|---|---|---|
| CREATE CollectibleToken | `0x5a5e6da6ca11155899c42311b034229b5fa690397f18eef3c1c16daed08deed4` | 752,184 |
| CREATE Escrow | `0xf888bd481a99d1807aebde81708a0461b94bef60a6ddc1cf0ae33f08cdde760a` | 2,194,783 |
| `token.setEscrow(escrow)` | `0x8e5bdced40af3dd4301b8bcc54a2e25902e88625829adfb801c7bc4c4a0a2e05` | 47,398 |

Cả 3 receipt `status = 1`. Tổng phí ≈ 0.0000000005 AVAX (số dư Deployer sau deploy: 0.1499999995 AVAX).

Explorer: <https://testnet.snowtrace.io/address/0x1F048Bc735CF0277FeFd3fAaA3dA7d8d2c4cCbCf>

## 3. Acceptance Criteria

| ID | Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|---|
| AC-01 | `forge script … --broadcast` thành công | ✅ PASS | `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.` |
| AC-02 | `deployments/43113.json` đủ trường | ✅ PASS (xem ghi chú) | Có `escrow`, `token`, `deployBlock`, `chainId: 43113`, `owner`, `agent`, 3 window |
| AC-03 | `nextTradeId()` = 1 | ✅ PASS | `cast call` → `1` |
| AC-04 | `agent()` đúng | ✅ PASS | `0x10582eDa05f63ae2D132b9436B18bc76a72894E2` |
| AC-05 | `owner()` đúng | ✅ PASS | `0x10dFa7a8A861a4A461A4186705F2c15EB8FA0a4c` |
| AC-06 | `backend/.env` có `ESCROW_ADDRESS`, `RPC_URL`, `CHAIN_ID=43113` | ✅ PASS | Đã ghi cả 3 biến |
| AC-07 | Không `.env`/private key trong git | ✅ PASS | `git ls-files` không có `.env`; `git check-ignore` khớp cả 3 file `.env`, `contracts/broadcast`, `contracts/cache` |
| AC-08 | (Optional) Verify trên Snowtrace | ✅ PASS | Cả 2 contract `Pass - Verified` qua Routescan API |

**Ghi chú AC-02:** spec ghi tên khoá `escrowAddress` / `tokenAddress`, nhưng `Deploy.s.sol` (không được sửa) ghi `escrow` / `token`, và backend (`chain.py`, `demo_local.py`) đọc đúng khoá `escrow`. Giữ nguyên theo script; đây là lệch tên trong spec, không phải lỗi chức năng.

**Ghi chú AC-06:** backend không đọc biến `CHAIN_ID` (chain id lấy từ RPC); biến được thêm chỉ để khớp spec.

Kiểm tra bổ sung on-chain: `EVIDENCE_WINDOW()`=600, `ATTEST_WINDOW()`=600, `DISPUTE_WINDOW()`=90, `escrow.token()` = địa chỉ token, `token.escrow()` = địa chỉ escrow.

## 4. Test evidence

| Kiểm tra | Lệnh | Kết quả |
|---|---|---|
| Smoke backend | `uvicorn attest_service:app --port 8000` → `curl /health` | HTTP 200, `ok: true`, `chain_id: 43113`, `agent_matches_contract: true`, `tesseract: true`, `agent_balance_wei: 100000000000000000` |
| Regression contract | `forge test` | 81 passed, 0 failed |
| Frontend env | `frontend/.env.local` | Đã điền `NEXT_PUBLIC_ESCROW_ADDRESS`, `NEXT_PUBLIC_TOKEN_ADDRESS`, `NEXT_PUBLIC_DEPLOY_BLOCK=60846507` |

## 5. Known limitations / việc còn lại

- `PINATA_JWT` trong `frontend/.env.local` còn trống → `/api/pin` đang trả CID mock; cần JWT thật trước Phase 6.
- Key 2 ví chỉ nằm trong `.env` trên máy Project Owner — cần backup ngoài repo.
- **Ngoài scope, chưa commit:** `backend/tests/test_integration_anvil.py` đang có thay đổi chưa commit trong working tree. Sau Phase 3A, 13/14 integration test fail (`listing_image_url must be an ipfs:// URI` + rate limit 10 req/phút dùng chung app); bản sửa chỉ đụng file test, đưa `pytest` về 115/115 pass. Cần Project Owner quyết định commit vào branch nào.
- `MASTER_DISPATCH.md` còn ghi trạng thái cũ cho Phase 4A–4C (READY/BLOCKED); chưa sửa vì ngoài scope.
