# Decision Log

Ghi các quyết định đã được Owner phê duyệt. Không xóa quyết định cũ; đánh dấu `SUPERSEDED` khi có quyết định thay thế.

| ID | Date | Decision | Status | Rationale | Owner | Evidence / Related task |
|---|---|---|---|---|---|---|
| DEC-000 | 2026-11-05 | Dùng Cowork làm management/assessment layer; Antigravity làm engineering execution layer | CONFIRMED | Tách trách nhiệm, không giả định có native bridge giữa hai app | Project Owner | AI Operating Kit |
| DEC-001 | 2026-11-05 | Dùng Git worktree/branch cho các agent code độc lập | CONFIRMED | Tránh cùng ghi vào một working tree | Project Owner | Antigravity Projects documentation |
| DEC-002 | 2026-11-05 | Giữ nguyên stack hiện có cho tới khi audit và có phê duyệt thay đổi | CONFIRMED | Tránh migration không cần thiết; 177 tests pass | Project Owner | Initial repo structure |
| DEC-003 | 2026-11-05 | Không dùng tiền thật/mainnet trong giai đoạn MVP/demo | CONFIRMED | Giới hạn rủi ro thử nghiệm; Fuji testnet only | Project Owner | Project safety constraint |
| DEC-004 | 2026-11-04 | Token model B — Utility token thuần (`CollectibleToken`): mint 1:1 khi deposit AVAX, burn 1:1 khi giải ngân/hoàn cọc. Soulbound (non-transferable) | CONFIRMED | Căn cứ pháp lý: "Ký Cược" theo Điều 328 BLDS 2015 — bảo đảm nghĩa vụ, không phải đầu tư. Tránh bị xem là chứng khoán khi pitch | Quốc | `contracts/src/CollectibleToken.sol` |
| DEC-005 | 2026-11-04 | Agent approach B trước (FastAPI endpoint `/verify-evidence`, request-driven). Nâng lên A (event listener chạy nền) chỉ sau feature freeze 16/11 nếu dư thời gian | CONFIRMED | Đơn giản hơn, dễ test, đủ cho demo. Listener là stretch goal | Quốc | `backend/attest_service.py` |
| DEC-006 | 2026-11-04 | Deposit = 30% giá trị món hàng (`MAX_DEPOSIT_BPS = 3000`), cố định | CONFIRMED | Đủ đơn giản cho MVP. Dynamic deposit theo risk score (Vai 3) là stretch goal — spec tại `docs/VAI3_DYNAMIC_DEPOSIT_SPEC.md` | Quốc | `contracts/src/Escrow.sol` |
| DEC-007 | 2026-11-04 | Penalty = 5% bên vi phạm trong dispute (`PENALTY_BPS = 500`) | CONFIRMED | Đủ để răn đe nhưng không quá nặng | Quốc | `contracts/src/Escrow.sol` |
| DEC-008 | 2026-11-04 | Evidence window 3 ngày, dispute window 2 ngày — immutable, truyền qua constructor. Giới hạn ≤ 365 ngày. Demo dùng vài phút | CONFIRMED | Production dùng thời gian thật; demo cần nhanh. Immutable vì đổi giữa chừng gây mất công bằng | Quốc | Constructor params |
| DEC-009 | 2026-11-04 | Agent wallet dùng private key riêng, quản lý trong `.env` cục bộ — không commit | CONFIRMED | Tách quyền agent và deployer. Key compromise chỉ ảnh hưởng attestation, không rút được tiền | Quốc | `backend/.env.example` |
| DEC-010 | 2026-11-04 | `resolveDispute(id, address(0))` = không ai sai (AI flag nhầm) → hoàn đủ cọc cả hai bên | CONFIRMED | Cần escape hatch cho false positive của AI. Công bằng | Quốc | Foundry tests |
| DEC-011 | 2026-11-04 | Frontend chỉ viết spec (Phase 2) — AI khác hoặc team member code theo `docs/FRONTEND_SPEC.md`. Đề xuất: Next.js + Tailwind + wagmi/viem | CONFIRMED | Tiết kiệm token Claude Code cho phần nặng (contract + AI + backend) | Quốc | `docs/FRONTEND_SPEC.md` |
| DEC-012 | 2026-11-04 | Feature freeze 16/11/2026. Sau đó chỉ slide + video + kiểm tra link | CONFIRMED | Đảm bảo đủ thời gian cho presentation (10% điểm) và kiểm tra nộp bài | Quốc | Timeline |
| DEC-013 | 2026-11-08 | Listing image chỉ validate `ipfs://` + ghi `listing_hash` vào report; chưa neo on-chain | PROPOSED | Người gọi vẫn có thể đưa CID tuỳ ý; roadmap thêm `listingHash` vào `createTrade()` on-chain | Project Owner | Task 3A-03 |
| DEC-014 | 2026-11-08 | Vai trò owner trong `resolveDispute`: (1) Minimal arbiter (ví team), (2) Multisig Safe, (3) AI resolve + on-chain appeal | PROPOSED | Cần quyết định mức độ phân quyền giải quyết khiếu nại cho hackathon vs roadmap | Project Owner | Task 3A-06 |

---

### DL-013: Listing image chưa neo on-chain (PROPOSED)
- Hiện tại: `listing_image_url` chỉ validate `ipfs://` + ghi hash vào report.
- Hạn chế: người gọi vẫn có thể đưa CID ảnh listing tuỳ ý — chưa có ràng buộc on-chain.
- Roadmap: thêm `listingHash` vào `createTrade()` trong smart contract.
- Trạng thái: PROPOSED — chờ team quyết định.

### DL-014: Vai trò owner trong resolveDispute (PROPOSED)
- Hiện tại: `resolveDispute()` dùng modifier `onlyOwner`.
- Phương án:
  (1) Owner = ví riêng team, nói rõ là "minimal arbiter" → đơn giản, đủ cho hackathon
  (2) Multisig (vd Gnosis Safe) → phân quyền tốt hơn, phức tạp hơn
  (3) AI agent resolve + cơ chế kháng cáo on-chain → roadmap dài hạn
- Trạng thái: PROPOSED — chờ team quyết định.
