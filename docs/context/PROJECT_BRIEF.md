# Project Brief – Escrow Marketplace cho đồ sưu tầm

> Trạng thái: `UPDATED (MKT-005) – đồng bộ theo codebase hiện tại`
> Cập nhật: 2026-11-15
> Verified against commit: `bdb1e138cc6ccf0030e784f4eb0c6c18c75660a5` (working tree gồm thay đổi MKT-001..MKT-005 chưa commit — cập nhật hash sau khi merge)

## Tổng quan

- **Tên dự án:** **Escrow Marketplace** (`DEC-017` `CONFIRMED`)
- **Cuộc thi:** Team1 Vietnam UniHack: Build on Avalanche (02–30/11/2026, team1vn.xyz)
- **Track:** AI Agents and Security
- **Mục tiêu:** Sàn giao dịch đồ sưu tầm P2P (LEGO, mô hình, figure, thẻ bài, xu sưu tầm) kết hợp ký quỹ cọc 30% AVAX trên Avalanche C-Chain và AI Agent chứng thực bằng chứng đóng gói/mở hộp on-chain
- **Trạng thái:** Smart Contracts đã deploy Fuji (`43113.json`), Backend + Marketplace SQLite WAL + AI Pipeline + Frontend Next.js 15 & BFF đã hoàn thiện và vá bảo mật P1 (`MKT-001..MKT-005`); đang chờ Avalanche Fuji Manual Verification trước khi Final Freeze

## Team

| Thành viên | Vai trò | Ghi chú |
|---|---|---|
| Hứa Kiến Quốc (MSSV 25127130) | Team Lead — Contract, AI Pipeline, Backend | Sinh viên năm 2 CNTT, nền tảng Computer Vision/Data Science |
| Nguyễn Minh Cường | Thành viên | — |
| Nguyễn Phú Nguyên Vũ | Thành viên | — |

## Cấu trúc dự án

```text
project-root/
├── contracts/                         # Foundry project
│   ├── src/
│   │   ├── Escrow.sol                 # Smart contract chính — 30% AVAX deposit custody, state machine, penalty, reputation
│   │   └── CollectibleToken.sol       # Utility token Soulbound (CDU) — mint/burn 1:1 với AVAX deposit
│   ├── test/                          # Foundry tests (unit + fuzz + invariant)
│   ├── script/
│   │   ├── Deploy.s.sol               # Deploy script, ghi deployments/<chainId>.json
│   │   └── e2e_anvil.sh               # E2E test trên anvil local
│   ├── deployments/43113.json         # Địa chỉ & window đã deploy trên Avalanche Fuji
│   └── lib/                           # OpenZeppelin v5.1.0, forge-std
├── ai-pipeline/                       # AI verification pipeline
│   ├── evidence_check.py              # pHash + ORB + QR/OCR nonce + video keyframe + CLIP tùy chọn
│   └── tests/                         # Unit tests + synth.py (ảnh test tổng hợp)
├── backend/                           # FastAPI backend + Marketplace persistence
│   ├── attest_service.py              # Attest API, URI registry, HMAC/replay guard, Marketplace routes
│   ├── listings.py & db.py            # Marketplace SQLite WAL (DATA_DIR/marketplace.db), TTL 30m, chain sync
│   ├── auto_agent.py                  # Auto agent background loop (DEC-013)
│   ├── chain.py                       # Web3 interaction layer
│   ├── abi/                           # Contract ABI files
│   ├── tests/                         # Backend, Marketplace & Anvil integration tests (`pytest -rs`)
│   ├── Dockerfile                     # Container build
│   └── .env.example                   # Cấu hình mẫu
├── frontend/                          # Next.js 15 App Router + BFF + Web3 UI
│   ├── app/                           # Marketplace `/`, `/listings/[id]`, `/sell`, `/trades`, `/trade/*`, `/auth*`, `/admin`, BFF `/api/*`
│   ├── components/                    # UI components (Shopee-style cards, Core/Local Wallet, AI Report)
│   ├── lib/                           # BFF HMAC proxy, auth-session (fail-closed), CSRF/SSRF/pin security, local-wallet
│   ├── test/                          # Security, auth, wallet & marketplace unit tests (`npm test`)
│   └── .env.local.example             # Biến môi trường mẫu (BFF & Session secrets)
├── docs/                              # Specs, context docs & agent-ops reports
│   ├── context/                       # Nguồn sự thật dự án
│   ├── agent-ops/                     # Task specs, QA/Release reports, RISK_REGISTER.md
│   ├── audit/                         # Báo cáo audit quy trình & bảo mật
│   └── specs/                         # Đặc tả thiết kế (FRONTEND_SPEC, VAI3, L1_MODULE, SLIDE_AND_VIDEO_SCRIPT)
├── .agents/                           # Agent rules & skills (`.agents/rules/`, `.agents/skills/`)
├── CLAUDE.md                          # Pointer file cho Claude Code sessions
├── pytest.ini                         # Python test config
└── requirements-dev.txt               # Python dev dependencies
```

## Ràng buộc

- Giữ stack hiện tại (Foundry + FastAPI + SQLite WAL + OpenCV/Tesseract + Next.js 15 BFF).
- Không dùng tiền thật hoặc mainnet — Fuji testnet only (`DEC-003`).
- Contract chỉ giữ cọc 30% AVAX mỗi bên (`MAX_DEPOSIT_BPS = 3000`); AI chỉ được ký `attest()`, mọi giải ngân sạch qua `resolveClean()` và tranh chấp qua `Owner` (`resolveDispute()`).
- Kiểm thử phải chạy lại và trích đúng số liệu từ report mới nhất (`MKT-005-remediation-report.md`).
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
