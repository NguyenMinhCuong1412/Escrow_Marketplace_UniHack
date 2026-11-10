# Current Project Status

> Last updated: 2026-11-11  
> Status: `Phase 5 (Deploy Fuji) DONE, chờ QA — chuẩn bị Phase 6 (E2E trên Fuji)`

## High-level

- [x] Repo folder structure + context docs consolidated.
- [x] Phase 0 Project Assessment completed.
- [x] Phase 1 (AI Pipeline + Backend) completed with full test coverage.
- [x] Phase 2 (Spec documents) completed.
- [x] Phase 3A (Backend hardening — SSRF + API key) completed.
- [x] Phase 4A (Frontend scaffold) completed — ESC-020.
- [x] Phase 4B (Core pages) completed — ESC-030.
- [x] Phase 4C (Frontend integration — IPFS, AI verify, dispute) completed — ESC-040.
- [x] All branches merged to `main`. Docs committed.
- [x] Phase 5 — Deploy contracts to Fuji testnet (ESC-050) — deployed + verified 11/11, chờ QA review.
- [ ] Phase 6 — E2E integration test on Fuji (ESC-060).
- [ ] Phase 7 — Slide pitch + video demo + final submission (ESC-070).
- [ ] Nộp bài trước 21/11/2026 23:59.

## Module status

| Module | Folder | Status | Tests | Owner |
|---|---|---|---|---|
| Smart Contract | `contracts/src/` | ✅ AUDITED + FIXED | 81 Foundry tests (unit + fuzz + invariant) ALL PASS | Quốc |
| AI Pipeline | `ai-pipeline/` | ✅ AUDITED + FIXED | 59 unit tests ALL PASS | Quốc |
| Backend | `backend/` | ✅ AUDITED + FIXED (Phase 3A hardened) | 23 unit + 14 integration tests ALL PASS | Quốc |
| Frontend | `frontend/` | ✅ CODED + INTEGRATED (Phase 4A→4C) | Manual testing done | Quốc |
| Deploy Fuji | `contracts/deployments/43113.json` | ✅ DEPLOYED + VERIFIED (Escrow `0x1F048Bc735CF0277FeFd3fAaA3dA7d8d2c4cCbCf`) | `/health` OK, xem `ESC-050-report.md` | Quốc |
| Slide + Video | `docs/specs/` | Script drafted | — | Quốc |

## Test commands

```bash
# Smart contracts (Foundry)
cd contracts && forge test

# AI Pipeline + Backend (Python)
.venv/Scripts/python -m pytest
```

## Blockers hiện tại

- ESC-050 chờ QA review + merge `phase/5-deploy-fuji`
- ESC-060 (E2E test) cần `PINATA_JWT` thật trong `frontend/.env.local`
- ESC-070 (submission) blocked by ESC-060

## Timeline

| Giai đoạn | Việc |
|---|---|
| **10–11/11** | Tạo ví, faucet, push main, deploy Fuji (Phase 5) |
| 12–15/11 | E2E test trên Fuji (Phase 6), fix bug nếu có |
| **16/11** | **Feature freeze** |
| 17–20/11 | Slide, quay video, kiểm tra link ẩn danh (Phase 7) |
| **21/11 23:59** | **Deadline nộp bài** |
| 30/11 | Final Demo Day |
