# Open Questions

> Verified against commit: `bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5` (working tree gồm thay đổi MKT-001..MKT-005 chưa commit — cập nhật hash sau khi merge)

Các mục đã được trả lời ghi rõ câu trả lời và nguồn. Các mục còn mở cần Owner quyết định.

| ID | Question | Why it matters | Answer / Proposed options | Owner | Status |
|---|---|---|---|---|---|
| Q-001 | Backend framework, database và API structure? | Giữ stack và lập test plan | **FastAPI (Python 3.12) + SQLite WAL (`DATA_DIR/marketplace.db` cho Marketplace) + JSON store (pHash/URI/Report).** Endpoints chính: `/health`, `/trade/{id}`, `/trade/{id}/uris`, `/trade/{id}/nonce-qr.png`, `/verify-evidence`, `/report/{id}`, `/agent/status/{id}`, `/listings/*`, `/requests/*`, `/trades/{id}/sync`, `/trades/{id}/context` | Quốc | ✅ ANSWERED |
| Q-002 | Contract đang dùng Solidity/toolchain nào? | Quyết định test/deploy | **Solidity + Foundry 1.5.1 + OpenZeppelin v5.1.0 + forge-std** | Quốc | ✅ ANSWERED |
| Q-003 | Frontend hiện có ở đâu, hay chưa được tạo? | Không tạo folder trùng hoặc sai kiến trúc | **Frontend Next.js `15.5.29` (App Router) + Tailwind + wagmi/viem + RainbowKit + Local Wallet + BFF HMAC đã triển khai tại `frontend/`** (`ESC-020..MKT-005`) | Quốc | ✅ ANSWERED |
| Q-004 | Buyer/Seller/Arbitrator/Admin có role nào và quyền gì? | Access control | **Xem `BUSINESS_REQUIREMENTS.md` — actors table.** AI Agent (`onlyAgent`) chỉ gọi `attest()`; luồng sạch hoàn cọc qua `resolveClean()`; tranh chấp do **Owner/Arbiter** xử lý qua `resolveDispute()` (`DEC-014`, `OD-02`, `OD-03`) | Quốc | ✅ ANSWERED |
| Q-005 | State machine và điều kiện release/refund/dispute/timeout? | Trái tim nghiệp vụ escrow | **Xem `BUSINESS_REQUIREMENTS.md` — 6 trạng thái enum trong `Escrow.sol` (`Created`, `AwaitingEvidence`, `Attested`, `Disputed`, `Resolved`, `Cancelled`) và vòng đời Marketplace** | Quốc | ✅ ANSWERED |
| Q-006 | Token, decimals, fee và chain nào dùng trong demo? | Contract/API/UI | **AVAX trên Fuji testnet (chain ID 43113, Anvil 31337 cho dev local).** Contract chỉ giữ cọc 30% AVAX (`OD-01`). `CollectibleToken` (CDU) là utility token Soulbound mint/burn 1:1 | Quốc | ✅ ANSWERED |
| Q-007 | AI Pipeline làm nhiệm vụ nào, có ảnh hưởng dispute? | Safety và boundary | **AI verify evidence tự động (QR/OCR nonce + pHash + ORB), chỉ gọi `attest()`. Không chuyển tiền hay xử lý dispute trực tiếp** — contract enforce và Owner phân xử `resolveDispute()` | Quốc | ✅ ANSWERED |
| Q-008 | Hạn nộp và rubric cuộc thi? | Ưu tiên MVP | **Xem `COMPETITION_CONTEXT.md`.** Deadline 21/11/2026 23:59 VN. Rubric: Tech 25%, Avalanche 25%, Creativity 15%, Impact 15%, Presentation 10%, UI/UX 10% | Quốc | ✅ ANSWERED |
| Q-009 | Git repository có sạch, có secret bị track? | Worktree an toàn | `.gitignore` đã loại `.env` / `.env*.local`; tuy nhiên quét lịch sử git bằng `gitleaks` (`SEC-09`, `0D-08`) vẫn cần Owner chạy trước khi public repo | Quốc | ⏳ PENDING-OWNER |
| Q-010 | Hệ thống deployment/CI/demo environment? | Release plan | Contracts đã deploy Fuji (`contracts/deployments/43113.json`, Escrow `0x19D053c84941411888f5b9e40c854365fdd4eb00`); `backend/Dockerfile` có sẵn; CI hoãn sau nộp bài (`0D-08`). Còn chờ cấu hình `.env`, nạp >= `0.5 AVAX` cho Agent, kiểm thử tay Fuji và URL Live dApp (`PENDING-OWNER`) | Quốc | ⏳ PENDING-OWNER |
| Q-011 | Tên chính thức của dự án? | Branding, repo name, slide | **Escrow Marketplace** (`DEC-017` `CONFIRMED`) | Quốc | ✅ ANSWERED |
| Q-012 | Category đồ sưu tầm cụ thể cho bản demo? | Focus demo, không dàn trải | **Đa danh mục đồ sưu tầm (`MKT-001..004`): LEGO, Mô hình, Figure, Thẻ bài, Xu sưu tầm, Khác** (hiển thị từ DB thật, không mock seed) | Quốc | ✅ ANSWERED |
| Q-013 | Ai code frontend theo `docs/FRONTEND_SPEC.md`? | Resource planning | **Đã triển khai xong `frontend/` qua `ESC-020..MKT-005`** (`DEC-011` chuyển `SUPERSEDED`) | Quốc | ✅ ANSWERED |
