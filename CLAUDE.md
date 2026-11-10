# UniHack 2026 — Escrow Marketplace (Avalanche dApp)

## Tóm tắt

Hackathon dApp trên Avalanche — marketplace escrow cho đồ sưu tầm. Bằng chứng giao dịch (ảnh đóng gói / video unbox) được **AI xác thực tự động** bằng pipeline pHash + ORB + OCR nonce. Track: **AI Agents and Security**.

## Team

| Thành viên | Vai trò |
|---|---|
| Hứa Kiến Quốc | Team Lead — Computer Vision/Data Science |
| Nguyễn Minh Cường | Thành viên |
| Nguyễn Phú Nguyên Vũ | Thành viên |

## Mốc thời gian

- **Deadline nộp bài:** 21/11/2026 23:59 (giờ VN)
- **Demo Day:** 30/11/2026
- **Tiêu chí:** Technical 25% · Avalanche 25% · Creativity 15% · Impact 15% · Presentation 10% · UI/UX 10%

## Cấu trúc thư mục

```
├── .agents/                  # Antigravity rules, skills & AGENTS.md
├── CLAUDE.md                 # File này
├── README.md                 # README dự án
├── .agents/                  # Antigravity rules & skills
│   ├── rules/                # Domain rules (product, arch, backend, contract, AI, UI, security, testing, git)
│   └── skills/               # Reusable skills (implement-task, project-discovery, qa-review)
├── docs/
│   ├── context/              # Source of truth — project state
│   │   ├── CURRENT_STATUS.md
│   │   ├── DECISION_LOG.md
│   │   ├── OPEN_QUESTIONS.md
│   │   ├── PROJECT_BRIEF.md
│   │   ├── BUSINESS_REQUIREMENTS.md
│   │   ├── TECH_STACK.md
│   │   ├── COMPETITION_CONTEXT.md
│   │   ├── PRODUCT_VISION.md
│   │   └── USER_PERSONAS.md
│   ├── specs/                # Product specifications
│   │   ├── FRONTEND_SPEC.md
│   │   ├── L1_MODULE_SPEC.md
│   │   ├── SLIDE_AND_VIDEO_SCRIPT.md
│   │   └── VAI3_DYNAMIC_DEPOSIT_SPEC.md
│   └── agent-ops/            # Agent workflow
│       ├── MASTER_DISPATCH.md     # ★ Entry point cho Antigravity
│       ├── TASK_DISPATCH_PROMPT.md
│       ├── QA_REVIEW_PROMPT.md
│       ├── TASK_TEMPLATE.md
│       ├── RELEASE_GATE_PROMPT.md
│       ├── tasks/            # Task specifications (ESC-xxx.md)
│       └── reports/          # Task reports (ESC-xxx-report.md)
├── backend/                  # FastAPI + AI pipeline integration
├── contracts/                # Solidity (Foundry)
├── ai-pipeline/              # pHash + ORB + OCR + CLIP
└── frontend/                 # Next.js (chưa tạo, Phase 4A)
```

## Workflow

- **Antigravity** (engineering): Đọc `docs/agent-ops/MASTER_DISPATCH.md` → tìm Phase → đọc task spec → thực hiện → ghi report.
- **Cowork** (PM/QA): Đọc report → review theo `docs/agent-ops/QA_REVIEW_PROMPT.md` → ACCEPT/CHANGES_REQUESTED/BLOCKED.
- **Project Owner** (user): Dispatch phase → chờ report → gửi review → merge branch.

## Quy tắc

- Ưu tiên **tối đa hóa điểm** theo tiêu chí chấm.
- Nhắc deadline khi liên quan.
- Giữ code **đủ gọn** cho timeline 30 ngày.
- Khi cần thông tin chi tiết, đọc file trong `docs/context/` — không hỏi lại user.
