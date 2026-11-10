# Current Project Status

> Last updated: 2026-11-05  
> Status: `Phase 0 + 1 + 2 DONE — đang chuẩn bị Phase 3 (Frontend + Deploy Fuji)`

## High-level

- [x] Repo folder structure shared by Project Owner.
- [x] Cowork Project points to repo root.
- [x] Historical context consolidated into CLAUDE.md (nay chuyển sang KIT docs/context/).
- [x] Canonical context validated by Project Owner.
- [x] Phase 0 Project Assessment completed.
- [x] Phase 1 (AI Pipeline + Backend) completed with full test coverage.
- [x] Phase 2 (Spec documents) completed — FRONTEND_SPEC, VAI3_DYNAMIC_DEPOSIT_SPEC, L1_MODULE_SPEC, SLIDE_AND_VIDEO_SCRIPT.
- [ ] Frontend coded (theo docs/FRONTEND_SPEC.md).
- [ ] Deploy lên Fuji testnet.
- [ ] Slide pitch + video demo hoàn thành.
- [ ] Nộp bài trước 21/11/2026 23:59.

## Module status

| Module | Folder | Audit status | Tests | Kết quả | Owner |
|---|---|---|---|---|---|
| Smart Contract | `contracts/src/` | ✅ AUDITED + FIXED | 81 Foundry tests (unit + fuzz + 2 invariant, 51.200 lời gọi ngẫu nhiên) | **ALL PASS** | Quốc |
| AI Pipeline | `ai-pipeline/` | ✅ AUDITED + FIXED | 59 unit tests (ảnh/video tổng hợp `tests/synth.py`) | **ALL PASS** — OCR nonce ~99% trên ảnh tổng hợp; CHƯA hiệu chỉnh ảnh viết tay thật | Quốc |
| Backend | `backend/` | ✅ AUDITED + FIXED | 23 unit + 14 integration tests (anvil thật) | **ALL PASS** — E2E `demo_local.py` pass (clean→resolveClean; fraud→flagged→dispute) | Quốc |
| Frontend/UI | chưa tồn tại | ❌ NOT STARTED | — | Spec tại `docs/FRONTEND_SPEC.md` | TBD |
| Deploy Fuji | — | ❌ NOT DONE | — | Chờ ví deployer/agent + AVAX faucet | Quốc |
| Docs (Phase 2) | `docs/` | ✅ DONE | — | FRONTEND_SPEC, VAI3_DYNAMIC_DEPOSIT_SPEC, L1_MODULE_SPEC, SLIDE_AND_VIDEO_SCRIPT | Quốc |

## Test commands

```bash
# Smart contracts (Foundry)
cd contracts && forge test

# AI Pipeline + Backend (Python)
.venv/Scripts/python -m pytest
# (cần anvil chạy nền + Tesseract cài sẵn cho integration test)
```

## Toolchain đã cài trên máy

| Tool | Version | Đường dẫn |
|---|---|---|
| Foundry (forge, cast, anvil) | 1.5.1 | `~/.foundry/bin` |
| Python | 3.12 | `.venv` |
| Tesseract OCR | 5.4 | `C:\Program Files\Tesseract-OCR` |
| OpenZeppelin | v5.1.0 | `contracts/lib/` |
| forge-std | latest | `contracts/lib/` |

## Blockers hiện tại

- Cần ví deployer + ví agent riêng, xin AVAX Fuji faucet (Quốc tự làm)
- Cần người/AI code frontend theo `docs/FRONTEND_SPEC.md`
- Cần thu thập 40–60 cặp ảnh thật (có nhãn) để hiệu chỉnh ngưỡng AI

## Timeline

| Giai đoạn | Việc |
|---|---|
| Đến ~11/11 | Thu thập ảnh thật, bắt đầu frontend |
| 12–15/11 | Nối end-to-end trên Fuji, frontend tích hợp |
| **16/11** | **Đóng băng tính năng** |
| 17–20/11 | Slide, quay video, kiểm tra link ẩn danh |
| **21/11 23:59** | **Hạn chót nộp bài** |
| 30/11 | Final Demo Day (nếu vào Top 10) |

## Update log

| Date | Update | Source |
|---|---|---|
| 2026-11-04 | Phase 0+1+2 hoàn thành: 81 contract tests, 59 AI tests, 37 backend tests pass. 12 bug bảo mật đã sửa. | Claude Code audit |
| 2026-11-05 | Chuyển sang KIT structure, sync thông tin từ CLAUDE.md | Cowork session |
