# Project Brief – Escrow Marketplace cho đồ sưu tầm

> Trạng thái: `CONFIRMED – Phase 0+1+2 hoàn thành 04/11/2026`  
> Cập nhật: 2026-11-05

## Tổng quan

- **Tên dự án:** Escrow Marketplace (tên chính thức chưa chốt — xem `OPEN_QUESTIONS.md` Q-011)
- **Cuộc thi:** Team1 Vietnam UniHack: Build on Avalanche (02–30/11/2026, team1vn.xyz)
- **Track:** AI Agents and Security
- **Mục tiêu:** Marketplace với cơ chế escrow + AI verification tự động cho giao dịch đồ sưu tầm P2P
- **Trạng thái:** Phase 0+1+2 DONE. Đang chuẩn bị frontend + deploy Fuji

## Team

| Thành viên | Vai trò | Ghi chú |
|---|---|---|
| Hứa Kiến Quốc (MSSV 25127130) | Team Lead — Contract, AI Pipeline, Backend | Sinh viên năm 2 CNTT, nền tảng Computer Vision/Data Science |
| Nguyễn Minh Cường | Thành viên | Chưa phân công cụ thể |
| Nguyễn Phú Nguyên Vũ | Thành viên | Chưa phân công cụ thể |

## Cấu trúc dự án

```text
project-root/
├── contracts/                         # Foundry project
│   ├── src/
│   │   ├── Escrow.sol                 # Smart contract chính — custody, state machine, penalty, reputation
│   │   └── CollectibleToken.sol       # Utility token Soulbound — mint/burn 1:1 với AVAX deposit
│   ├── test/                          # 81 tests (unit + fuzz + invariant)
│   ├── script/
│   │   ├── Deploy.s.sol               # Deploy script, ghi deployments/<chainId>.json
│   │   └── e2e_anvil.sh               # E2E test trên anvil local
│   └── lib/                           # OpenZeppelin v5.1.0, forge-std
├── ai-pipeline/                       # AI verification pipeline
│   ├── evidence_check.py              # pHash + ORB + OCR nonce + CLIP + video support
│   └── tests/                         # 59 unit tests + synth.py (ảnh test tổng hợp)
├── backend/                           # FastAPI backend
│   ├── attest_service.py              # /verify-evidence, /health, /trade/{id}, /report/{id}
│   ├── chain.py                       # Web3 interaction layer
│   ├── abi/                           # Contract ABI files
│   ├── Dockerfile                     # Container build
│   └── .env.example                   # Cấu hình mẫu
├── docs/                              # Spec documents (Phase 2 output)
│   ├── FRONTEND_SPEC.md               # Spec cho frontend (chưa code)
│   ├── VAI3_DYNAMIC_DEPOSIT_SPEC.md   # Stretch goal: dynamic deposit
│   ├── L1_MODULE_SPEC.md              # Stretch goal: custom L1 reputation
│   └── SLIDE_AND_VIDEO_SCRIPT.md      # Outline slide + kịch bản video
├── .agents/                  # Agent rules & skills
│   ├── docs/context/                  # Nguồn sự thật dự án (file này)
│   ├── docs/agent-ops/                # Prompts, templates, reports
│   ├── .agents/rules/                 # Coding rules theo domain
│   ├── .agents/skills/                # Agent skills
│   ├── guides/                        # Setup guides 01–09
│   └── tools/                         # Validation scripts
├── CLAUDE.md                          # Pointer file cho Claude Code sessions
├── pytest.ini                         # Python test config
└── requirements-dev.txt               # Python dev dependencies
```

## Ràng buộc

- Giữ stack hiện tại (Foundry + FastAPI + OpenCV/Tesseract) — đã có 177 tests pass.
- Không dùng tiền thật hoặc mainnet — Fuji testnet only.
- AI không tự quyết định release/refund — chỉ attest, contract enforce.
- Giữ Solidity contract gọn — ưu tiên hoàn thiện hơn phức tạp (kinh nghiệm Solidity còn non).
- Mọi task code phải có acceptance criteria và test evidence.

## Tài liệu liên quan

- `COMPETITION_CONTEXT.md` — chi tiết cuộc thi + đối thủ
- `PRODUCT_VISION.md` — tầm nhìn sản phẩm + differentiator
- `BUSINESS_REQUIREMENTS.md` — actors, flow, state machine, invariants
- `TECH_STACK.md` — stack đã xác nhận
- `DECISION_LOG.md` — quyết định kiến trúc đã chốt
- `OPEN_QUESTIONS.md` — câu hỏi còn mở
- `CURRENT_STATUS.md` — tiến độ hiện tại
- `USER_PERSONAS.md` — personas giả thuyết
