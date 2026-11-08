# Open Questions

Các mục đã được trả lời ghi rõ câu trả lời và nguồn. Các mục còn mở cần Owner quyết định.

| ID | Question | Why it matters | Answer / Proposed options | Owner | Status |
|---|---|---|---|---|---|
| Q-001 | Backend framework, database và API structure? | Giữ stack và lập test plan | **FastAPI (Python 3.12), không dùng DB — pHash store lưu file JSON.** Endpoints: `/verify-evidence`, `/health`, `/trade/{id}`, `/report/{id}` | Quốc | ✅ ANSWERED |
| Q-002 | Contract đang dùng Solidity/toolchain nào? | Quyết định test/deploy | **Solidity + Foundry 1.5.1 + OpenZeppelin v5.1.0 + forge-std** | Quốc | ✅ ANSWERED |
| Q-003 | Frontend hiện có ở đâu, hay chưa được tạo? | Không tạo folder trùng hoặc sai kiến trúc | **Frontend CHƯA tồn tại.** Spec tại `docs/FRONTEND_SPEC.md`. Đề xuất: Next.js + Tailwind + wagmi/viem | Quốc | ✅ ANSWERED |
| Q-004 | Buyer/Seller/Arbitrator/Admin có role nào và quyền gì? | Access control | **Xem `BUSINESS_REQUIREMENTS.md` — actors table.** Không có human arbitrator; AI Agent thay thế | Quốc | ✅ ANSWERED |
| Q-005 | State machine và điều kiện release/refund/dispute/timeout? | Trái tim nghiệp vụ escrow | **Xem `BUSINESS_REQUIREMENTS.md` — state machine.** Đã code và test (81 Foundry tests) | Quốc | ✅ ANSWERED |
| Q-006 | Token, decimals, fee và chain nào dùng trong demo? | Contract/API/UI | **AVAX trên Fuji testnet (chain ID 43113).** CollectibleToken là utility/receipt (mint/burn 1:1), không phải payment token | Quốc | ✅ ANSWERED |
| Q-007 | AI Pipeline làm nhiệm vụ nào, có ảnh hưởng dispute? | Safety và boundary | **AI verify evidence tự động, gọi `attest()`. Không chuyển tiền trực tiếp** — contract enforce dựa trên attestation result | Quốc | ✅ ANSWERED |
| Q-008 | Hạn nộp và rubric cuộc thi? | Ưu tiên MVP | **Xem `COMPETITION_CONTEXT.md`.** Deadline 21/11/2026 23:59 VN. Rubric: Tech 25%, Avalanche 25%, Creativity 15%, Impact 15%, Presentation 10%, UI/UX 10% | Quốc | ✅ ANSWERED |
| Q-009 | Git repository có sạch, có secret bị track? | Worktree an toàn | **ĐÃ HOÀN TẤT PREFLIGHT AUDIT.** Git history chỉ chứa Anvil test key mặc định (`0xac09...`), không có private key thật hay credentials sản xuất. Working tree sạch, không track file `.env` hoặc credential thật. | Lead / Quốc | ✅ RESOLVED |
| Q-010 | Hệ thống deployment/CI/demo environment? | Release plan | Chưa có CI pipeline. Deploy script (`Deploy.s.sol`) sẵn nhưng chưa deploy lên Fuji. Dockerfile cho backend có sẵn | Quốc | ⬜ OPEN |
| Q-011 | Tên chính thức của dự án? | Branding, repo name, slide | Chưa chốt — cần Owner quyết định | Quốc | ⬜ OPEN |
| Q-012 | Category đồ sưu tầm cụ thể cho bản demo? | Focus demo, không dàn trải | Chọn 1 category cụ thể (trading cards? sneakers? đồ cổ? figure?) để demo rõ ràng | Quốc | ⬜ OPEN |
| Q-013 | Ai code frontend theo `docs/FRONTEND_SPEC.md`? | Resource planning | Cường? Vũ? AI agent khác? | Quốc | ⬜ OPEN |
