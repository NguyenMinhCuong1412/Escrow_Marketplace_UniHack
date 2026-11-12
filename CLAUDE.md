# UniHack 2026 — Escrow Marketplace (Avalanche dApp)

## Tóm tắt
Marketplace escrow cho đồ sưu tầm trên Avalanche. Bằng chứng giao dịch (ảnh đóng gói / video unbox) được AI xác thực tự động bằng pipeline pHash + ORB + OCR nonce (`attest()`). Track: AI Agents and Security.

## Team & Mốc thời gian
- **Team:** Hứa Kiến Quốc (Team Lead — CV/DS), Nguyễn Minh Cường, Nguyễn Phú Nguyên Vũ.
- **Mốc:** Nộp bài: 21/11/2026 23:59 (VN) · Demo Day: 30/11/2026.
- **Tiêu chí:** Technical 25% · Avalanche 25% · Creativity 15% · Impact 15% · Presentation 10% · UI/UX 10%.

## Cấu trúc thư mục
```
├── .agents/
│   ├── AGENTS.md             # Always-on project rules & role matrix
│   ├── rules/                # Domain rules (10-90, 55-ai-authority.md)
│   └── skills/               # Reusable skills (implement-task, qa-review, release-gate)
├── CLAUDE.md                 # Hướng dẫn Claude Code
├── README.md                 # Project README
├── docs/
│   ├── context/              # Source of truth (DECISION_LOG, BUSINESS_REQUIREMENTS, ...)
│   ├── specs/                # FRONTEND_SPEC, L1_MODULE_SPEC, ...
│   └── agent-ops/            # MASTER_DISPATCH.md, TEST_MATRIX.md, RISK_REGISTER.md, tasks/, reports/
├── backend/                  # FastAPI + AI pipeline integration
├── contracts/                # Solidity (Foundry)
├── ai-pipeline/              # pHash + ORB + OCR + QR nonce (CLIP tuỳ chọn, mặc định HSV histogram)
└── frontend/                 # Next.js 14 + wagmi/viem
```

## Workflow & Phân quyền
- **Phân quyền:** Tuân thủ role matrix tại `AGENTS.md §2a`. Claude Code là engineering agent ngang hàng Antigravity theo Task Spec (`READY`).
- **Thực hiện task:** Đọc `docs/agent-ops/MASTER_DISPATCH.md` → tìm task `READY` → thực hiện trong worktree riêng → viết report `docs/agent-ops/reports/`.
- **Review & Merge:** Cowork review theo `qa-review` skill; chỉ Project Owner mới có quyền merge.

## Quy tắc
- Ưu tiên tối đa hóa điểm theo tiêu chí chấm; nhắc deadline khi liên quan; giữ code đủ gọn.
- Khi cần thông tin, đọc `docs/context/` theo precedence `AGENTS.md §0`; nếu nguồn mâu thuẫn hoặc thiếu quyết định → hỏi Owner.