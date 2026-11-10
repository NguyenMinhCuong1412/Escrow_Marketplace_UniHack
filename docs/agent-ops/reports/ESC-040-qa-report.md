# QA Review Report — ESC-040 (Phase 4C)

**Task:** ESC-040 — Frontend Integration: IPFS Upload + AI Verify + Evidence Flow + Admin  
**Reviewer:** Cowork (PM/QA)  
**Branch:** `phase/4c-frontend-integration`  
**Commit:** `a1ad5bc`  
**Date:** 2026-11-10  

---

## Verdict: `ACCEPT` ✅

> Tất cả 10 AC pass. Scope tuân thủ (14 files, toàn bộ trong `frontend/` + report). Không dependency mới, không secret leak. Server-side API keys đúng pattern. Evidence hash matching đúng backend. 3 findings mức INFO (không block).

---

## 1. Scope Check

| Kiểm tra | Kết quả |
|---|---|
| Commit `a1ad5bc` chỉ chạm `frontend/` + `docs/agent-ops/reports/` | ✅ PASS — 14 files, toàn bộ trong scope |
| Không sửa `frontend/app/layout.tsx` (out of scope) | ✅ PASS |
| Không sửa `frontend/lib/wagmi.ts` (out of scope) | ✅ PASS |
| Không sửa `backend/`, `contracts/`, `ai-pipeline/` | ✅ PASS |
| Không thêm dependency mới vào `package.json` | ✅ PASS — `git diff a1ad5bc^..a1ad5bc -- frontend/package.json` trống |
| Branch riêng, không merge vào main | ✅ PASS |
| PINATA_JWT chỉ trong server route (`app/api/pin/route.ts`) | ✅ PASS — `process.env.PINATA_JWT`, không NEXT_PUBLIC_ prefix |
| ATTEST_API_KEY chỉ trong server route (`app/api/verify/route.ts`) | ✅ PASS — `process.env.ATTEST_API_KEY`, không NEXT_PUBLIC_ prefix |

> **Lưu ý scope mở rộng hợp lý:** 3 files không nằm trong danh sách scope tường minh của task spec nhưng cần thiết cho tính năng: `app/api/verify/route.ts` (proxy AI verify — AC-04 yêu cầu), `app/trade/new/page.tsx` (listing image upload cho IPFS flow), `components/Navbar.tsx` (tích hợp PendingWithdrawalBanner + admin link). Không file nào vi phạm out-of-scope constraints. Xem Finding #2.

---

## 2. Acceptance Criteria

| AC | Tiêu chí | Verdict | Chi tiết |
|---|---|---|---|
| AC-01 | IPFS upload ảnh (JPEG/PNG/WEBP ≤ 10 MB) qua server route `/api/pin` | ✅ PASS | `app/api/pin/route.ts`: `runtime = 'nodejs'`, validate MIME (`image/jpeg`, `image/png`, `image/webp`) + size ≤ 10 MB. `PINATA_JWT` server-only. Upload via `fetch` tới Pinata API. Mock fallback: sha256-based deterministic CID khi không có JWT. Response: `{ uri, cid, mock }`. Client-side: `ipfs.ts` `uploadToIpfs()` gọi `/api/pin`. |
| AC-02 | IPFS upload video (MP4 ≤ 50 MB) | ✅ PASS | Cùng route `/api/pin`: validate `video/mp4` + size ≤ 50 MB. `ipfs.ts` constants: `MAX_IMAGE_BYTES = 10 * 1024 * 1024`, `MAX_VIDEO_BYTES = 50 * 1024 * 1024`. `EvidenceUploader` cho buyer accept `IMAGE_TYPES + VIDEO_TYPES`, seller chỉ `IMAGE_TYPES`. |
| AC-03 | Evidence submission flow: upload → hash → submitEvidence tx | ✅ PASS | `EvidenceUploader.tsx`: 3-step toast (upload IPFS → compute `evidenceHashOf(uri)` → `writeContractAsync` `submitEvidence(tradeId, evidenceHash)` → `waitForTransactionReceipt`). Hash: `keccak256(toBytes(uri))` từ viem — **khớp backend** `evidence_hash_of(uri)` = `keccak256(uri.encode())` trong `chain.py`. Save URI to localStorage keyed `evidence:${chainId}:${tradeId}:${role}`. Role-based: seller = image only, buyer = image + video. Disabled states đúng: `hasSubmitted`, `isEvidenceExpired`, `isActionDisabled`. |
| AC-04 | AI verify button gọi backend qua proxy | ✅ PASS | `VerifyProgress.tsx`: shows khi `canVerify` (cả seller + buyer evidence hash non-zero). 6 verify steps ticker (2.2s intervals). Load URIs từ localStorage, có manual fallback input. Gọi `verifyEvidence()` → proxy qua `/api/verify/route.ts` → backend `/verify-evidence`. Proxy: `ATTEST_API_KEY` server-only, 120s timeout (AbortController), validate `trade_id` (positive int) + 3 URI params (string ≤ 2048). Hardcode `dry_run: false`, `include_visual: true`. |
| AC-05 | Report page: risk score + 4 AI checks + visual match | ✅ PASS | `trade/[id]/report/page.tsx` (529 lines): risk gauge SVG (green <40, amber <70, red ≥70). **4 check cards:** (1) OCR Nonce Seller — expected vs found, edit distance; (2) OCR Nonce Buyer — expected vs found, frames checked; (3) pHash reuse — unique/duplicate; (4) ORB+RANSAC inliers — threshold 15, listing↔seller/buyer. Visual match: base64 PNG + zoom modal. Risk formula transparent display. Raw JSON accordion. Xem Finding #3 về CLIP vs OCR split. |
| AC-06 | Verify report hash on-chain | ✅ PASS | `backend.ts` `verifyReportOnChain(reportJson, reportHashOnChain)`: dùng `keccak256(toBytes(reportJson))` so sánh on-chain hash. **Đúng pattern:** dùng `report_json` string gốc từ backend response (đã serialize), tránh re-serialize gây sai key ordering. `.toLowerCase()` comparison. UI: nút "Xác minh on-chain" hiện computed vs expected hash, check/X icon. |
| AC-07 | Admin page: dispute resolution | ✅ PASS | `admin/page.tsx` (704 lines): `owner()` check → 3-tier access control (not connected / not owner / authorized). Batch `useReadContracts` multicall tất cả trades. 3 tabs: Disputed (state=3), Flagged (state=2+flagged), All. Resolve: 3 buttons (Phạt Seller = `resolveDispute(id, seller)`, Phạt Buyer = `resolveDispute(id, buyer)`, Hoà giải = `resolveDispute(id, address(0))`). Confirmation modal + penalty calc (`depositRequired * 500n / 10000n` = 5%). Flagged: `fileComplaint(tradeId)`. Buttons disabled khi `!isOwner`. |
| AC-08 | Pending withdrawal banner | ✅ PASS | `PendingWithdrawalBanner.tsx`: `useReadContract` `pendingWithdrawals(address)` với `refetchInterval: 6000`. Amber gradient banner khi `pendingAmount > 0n`. `formatAvax(pendingAmount)` + "Rút tiền ngay" → `writeContractAsync` `withdraw()` → receipt wait → refetch. Tích hợp vào `Navbar.tsx` (render trên header). |
| AC-09 | Error mapping ≥ 5 revert patterns | ✅ PASS | `errors.ts` `getReadableError()`: **16+ patterns** — AlreadyDeposited, violator not a party, zero address, evidence window closed, empty evidence, evidence already submitted, dispute window still open/closed, trade flagged, caller is not owner, nothing to withdraw, v.v. Vượt xa yêu cầu ≥ 5. |
| AC-10 | `npm run build` pass, 0 errors | ✅ PASS (from report) | Report evidence: `✓ Compiled successfully`, 8 static routes + 2 API routes, 0 errors. **NOT RE-RUN** bởi reviewer — dựa vào build output trong agent report. |

---

## 3. Findings

### Finding #1 — Branch name mismatch (Severity: INFO)

- **Task spec:** `phase/4c-integration`
- **Thực tế:** `phase/4c-frontend-integration`
- **Ảnh hưởng:** Thuần naming, không ảnh hưởng chức năng. Report ghi đúng branch thực tế. Consistent với pattern ESC-020 (`phase/4a-frontend-scaffold`), ESC-030 (`phase/4b-core-pages`).

### Finding #2 — 3 files ngoài danh sách scope tường minh (Severity: INFO)

- `frontend/app/api/verify/route.ts` (NEW) — Cần thiết cho AC-04: proxy server-side giữ `ATTEST_API_KEY` bảo mật.
- `frontend/app/trade/new/page.tsx` (modified) — Listing image upload IPFS — cần cho evidence flow hoàn chỉnh (ảnh niêm yết dùng làm reference cho ORB matching).
- `frontend/components/Navbar.tsx` (modified) — Tích hợp `PendingWithdrawalBanner` (AC-08) + admin link.
- **Đánh giá:** Cả 3 đều hợp lý và không vi phạm out-of-scope constraints (backend/, contracts/, ai-pipeline/, layout.tsx, wagmi.ts). Nên bổ sung vào task spec cho nhất quán.

### Finding #3 — AC-05: "CLIP" trong task spec → 2 OCR checks trong implementation (Severity: INFO)

- **Task spec ESC-040 line 61:** "từng check (pHash, ORB, OCR nonce, **CLIP**)"
- **FRONTEND_SPEC §3.6 response schema:** field `embedding_similarity` với `embedding_backend: "hsv-histogram"` — **không phải CLIP** mà là HSV histogram.
- **Implementation:** 4 check cards = OCR Nonce Seller + OCR Nonce Buyer + pHash + ORB. `embedding_similarity` có trong `VerifyReport` type nhưng không hiện card riêng.
- **Đánh giá:** Implementation **chính xác hơn task spec**. Backend thực tế dùng HSV histogram (không phải CLIP), và tách OCR thành seller/buyer (hữu ích hơn vì video buyer có nhiều frames). Field `embedding_similarity` vẫn accessible qua raw JSON accordion. Task spec nên cập nhật "CLIP" → "OCR nonce seller/buyer" để khớp thực tế.
- **Ảnh hưởng:** Không. UI hiển thị đúng 4 checks quan trọng nhất theo backend output.

---

## 4. Các kiểm tra khác

| Hạng mục | Kết quả |
|---|---|
| Evidence hash matching (frontend ↔ backend) | ✅ — `evidenceHashOf(uri)` = `keccak256(toBytes(uri))` (viem) khớp `evidence_hash_of(uri)` = `keccak256(uri.encode())` (Python). Cùng input encoding UTF-8. |
| Report hash verification | ✅ — Dùng `report_json` string gốc từ backend, không re-serialize → tránh key ordering mismatch. `keccak256(toBytes(reportJson)).toLowerCase()` so sánh on-chain `reportHash`. |
| Secret leak | ✅ — `PINATA_JWT` chỉ trong `app/api/pin/route.ts` (server). `ATTEST_API_KEY` chỉ trong `app/api/verify/route.ts` (server). `NEXT_PUBLIC_BACKEND_URL` + `NEXT_PUBLIC_IPFS_GATEWAY` dùng client-side (intended, không chứa secret). Không hardcode key/seed nào. |
| State transition UI | ✅ — `EvidenceUploader` hiện đúng khi state=1 (AwaitingEvidence). `VerifyProgress` hiện khi cả 2 evidence hash non-zero. Report link hiện khi state≥2 hoặc reportHash non-zero. Admin resolve chỉ cho state=3 (Disputed). Flagged filter: state=2 + flagged=true. |
| AI prompt injection risk | ✅ LOW — Backend response (`VerifyReport`) render qua structured components (gauge, cards, badges), không raw HTML injection. Risk score hiển thị số, notes hiển thị trong styled list. Raw JSON accordion dùng `<pre>` + `JSON.stringify` (safe). Visual match PNG render qua base64 `<img>` src. Manual URI input có length constraint (2048 chars). |
| localStorage usage | ✅ — Evidence URIs + listing URIs wrapped trong try/catch. Keyed by `chainId:tradeId:role` (tránh collision). Dùng cho UX convenience (pre-fill URIs cho verify), không phải critical state. Fallback manual input khi localStorage trống. |
| Server route runtime | ✅ — Cả `/api/pin` và `/api/verify` đều `runtime = 'nodejs'` (cần cho `process.env` access, file handling). |
| Timeout handling | ✅ — `/api/verify` proxy: 120s AbortController timeout, trả 504 khi timeout. Client `VerifyProgress`: toast error on fetch failure. |
| wagmi v2 hooks | ✅ — `useReadContract`, `useReadContracts` (multicall), `useWriteContract`, `useAccount`. Refetch patterns hợp lý: `PendingWithdrawalBanner` 6s, admin batch staleTime 10s. |
| Responsive / accessibility | ✅ — Tailwind responsive classes (`sm:`, `md:`, `lg:`). Buttons có disabled states. Toast messages tiếng Việt. Color coding: green/amber/red cho risk levels. |
| Dependency changes | ✅ NONE — `package.json` không thay đổi. Tất cả imports dùng packages đã có từ ESC-020/030 (wagmi, viem, lucide-react, sonner). |

---

## 5. Tests chưa chạy (reviewer limitations)

- `npm run build`: **NOT RE-RUN** — dựa vào evidence từ agent report (build output log đầy đủ, 0 errors).
- IPFS upload flow (Pinata): **NOT RUN** — cần `PINATA_JWT` env var. Mock fallback path kiểm tra qua code review.
- AI verify end-to-end: **NOT RUN** — cần backend running + `ATTEST_API_KEY`.
- Admin dispute resolution: **NOT RUN** — cần deployed contract + owner wallet + trade ở state Disputed.
- Withdrawal banner: **NOT RUN** — cần `pendingWithdrawals > 0` trên contract.

---

## 6. Tóm tắt

**ACCEPT** — Tất cả 10 AC pass. Phase 4C hoàn thành IPFS upload pipeline (server-side Pinata + mock fallback), AI verification proxy (server-side API key, 120s timeout), full evidence submission flow (hash matching đúng backend), explainable report page (4 AI checks + visual + on-chain verification), admin dispute resolution (3 options + penalty calc), và withdrawal banner. Secret management đúng pattern (PINATA_JWT, ATTEST_API_KEY server-only). 3 findings INFO (branch naming, scope extension, CLIP→OCR naming) không ảnh hưởng chức năng. Code quality tốt: structured components, proper error handling, responsive UI tiếng Việt.

ESC-040 sẵn sàng merge.
