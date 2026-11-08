# Technical Stack Register

> Trạng thái: `CONFIRMED – đã audit source code 04/11/2026`

## Stack đã xác nhận

| Layer | Tool/Framework | Version | Có sẵn? | Test command | Ghi chú |
|---|---|---|---|---|---|
| Backend | FastAPI (Python 3.12) | Python 3.12 | ✅ | `pytest` | Endpoint `/verify-evidence`, `/health`, `/trade/{id}`, `/report/{id}` |
| Database | Không dùng DB | — | N/A | — | pHash store lưu file JSON (sống qua restart) |
| Contracts | Solidity + Foundry | Foundry 1.5.1 | ✅ | `cd contracts && forge test` | `~/.foundry/bin` |
| Solidity libs | OpenZeppelin v5.1.0, forge-std | v5.1.0 | ✅ | — | `contracts/lib/` |
| Contract testing | Foundry (forge test) | 1.5.1 | ✅ | `forge test` | 81 tests (unit + fuzz + invariant) |
| AI Pipeline | OpenCV, NumPy, Tesseract OCR | Tesseract 5.4 | ✅ | `pytest ai-pipeline/` | pHash(DCT), ORB keypoints, CLIP embeddings (lru_cache) |
| Frontend | NOT STARTED | — | ❌ | — | Spec recommends Next.js + Tailwind + wagmi/viem |
| Chain | Avalanche C-Chain Fuji testnet | — | ✅ | — | Chain ID `43113` |
| CI | Không có | — | ❌ | — | Chưa thiết lập |
| Docker | backend/Dockerfile | — | ✅ | `docker build` | Cho backend deployment |

## Avalanche test environment

| Mục | Giá trị |
|---|---|
| Network | Avalanche Fuji C-Chain (testnet) |
| Chain ID | `43113` |
| RPC | `https://api.avax-test.network/ext/bc/C/rpc` |
| Faucet | core.app faucet (cần Quốc tự xin) |
| Explorer | testnet.snowtrace.io |

**Lưu ý:** Không rải chain ID/RPC thành literal trong source — dùng environment/config tập trung (`.env`).

## AI Pipeline chi tiết

| Thành phần | Mô tả |
|---|---|
| pHash (DCT) | Perceptual hash — phát hiện ảnh trùng/reuse, bền với nén lại |
| ORB keypoints | Keypoint matching — so sánh ảnh listing ↔ seller ↔ buyer, loại false match từ giấy nonce |
| OCR nonce | Tesseract OCR — dò vùng giấy trắng, whitelist hex, 3 biến thể tiền xử lý, bảng nhầm lẫn OCR, cho phép 1 lỗi Levenshtein |
| CLIP embeddings | Semantic similarity — lru_cache tránh load lại model mỗi lần |
| Video support | Trích keyframe từ video unbox, nonce đạt nếu bất kỳ khung nào match |
| Explainable Report | `draw_match_visual()` — PNG keypoint cho frontend hiển thị |

## Nguyên tắc lựa chọn stack

1. Giữ framework đang chạy ổn — đã có 177 tests pass.
2. Chỉ nâng cấp vì security, compatibility, bug hoặc requirement có bằng chứng.
3. Không chạy đồng thời nhiều framework test.
4. Không đưa RPC URL, wallet secret hoặc credential vào Git.
5. Mỗi thay đổi stack cần Decision Log và kế hoạch rollback.
