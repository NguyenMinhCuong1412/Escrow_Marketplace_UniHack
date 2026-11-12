# TASK-002 — Frontend: khôi phục đăng ký URI bằng chứng cho AI Agent và chặn mock IPFS ngoài anvil

## 1. Task Metadata

| Trường | Giá trị |
|---|---|
| Task ID | `TASK-002` |
| Title | Evidence URI recovery + mock IPFS guard |
| Priority | **P1** (luồng demo chính có thể kẹt) |
| Affected module | `frontend/` |
| Suggested agent role | Frontend Engineer |
| Branch | `phase/4h-evidence-uri-recovery` (từ `main` sau ESC-080 merge) |
| Dependencies | **ESC-080 merged** (cùng sửa `components/AgentStatusCard.tsx`, `components/VerifyProgress.tsx`; ESC-080 thêm luồng ký lại listing) |
| Related findings | NEW-02, SEC-05 ([báo cáo thẩm định](../../audit/REPORT_VALIDATION_AND_REMEDIATION_PLAN.md) §5, §3.3) |
| Owner approval | Không cần. OD-05 (privacy) chỉ ảnh hưởng mục 5.6 tuỳ chọn. `Deploy authorized: No` |
| Security review required | Yes (chạm `frontend/app/api/pin/route.ts`) |

## 2. Problem Description

**NEW-02: URI bằng chứng có thể mất vĩnh viễn**

- [`frontend/components/EvidenceUploader.tsx`](../../../frontend/components/EvidenceUploader.tsx) L105-121 gửi `submitEvidence` và chờ receipt. URI chỉ được `setStoredEvidenceUri` **sau** receipt (L122).
- L125-131: nếu `registerUri` lỗi, trang chỉ hiện toast cảnh báo.
- Không có chỗ nào khác gọi lại `registerUri` cho vai `seller`/`buyer` (grep trong `app/`, `components/`: chỉ `app/trade/new/page.tsx:L198` cho listing và `EvidenceUploader.tsx:L127`).
- [`components/AgentStatusCard.tsx`](../../../frontend/components/AgentStatusCard.tsx) L98 hướng dẫn "Bên nộp cần mở lại trang này", nhưng trang không tự đăng ký lại.
- [`backend/auto_agent.py`](../../../backend/auto_agent.py) L173-175: agent chờ vô hạn khi thiếu URI. Sau `EVIDENCE_WINDOW + ATTEST_WINDOW` (1200 s trên Fuji) trade chỉ còn hoàn cọc qua `cancelOnEvidenceTimeout`.

**SEC-05: mock IPFS vẫn neo được on-chain**

- [`frontend/app/api/pin/route.ts`](../../../frontend/app/api/pin/route.ts) L40-46 trả `ipfs://mock…` khi thiếu `PINATA_JWT`, bất kể chain.
- `EvidenceUploader.tsx` L96-98 chỉ hiện toast rồi vẫn `submitEvidence` CID giả. Backend không tải được CID này, nên trade chết.

**Root cause:** trạng thái ngoài chuỗi (URI) chỉ tồn tại trong một trình duyệt và một lần gọi, không có đối soát với chain (RC-3). Cấu hình thiếu bị che bằng chế độ giả lập (RC-2).

**Tác động:** demo thất bại khi backend gián đoạn tạm thời hoặc người dùng reload trong lúc chờ xác nhận. Không mất tiền.

## 3. Expected Outcome

1. URI được lưu bền (localStorage, key hiện có `evidence:<chain>:<trade>:<role>` trong [`lib/ipfs.ts`](../../../frontend/lib/ipfs.ts) L68) **ngay sau khi upload IPFS thành công và trước khi ký `submitEvidence`**. Reload giữa chừng không làm mất URI.
2. Trên trang giao dịch, khi backend báo `missing_uris` chứa `seller` hoặc `buyer` **và** trình duyệt có URI đã lưu cho vai đó **và** `keccak256(utf8(uri))` khớp evidence hash on-chain, trang tự gọi `registerUri` (hoặc hiện nút "Gửi lại đường dẫn cho AI Agent"). Agent chọn tự động hay nút, nhưng phải có ít nhất một đường không cần tải lại file.
3. Nếu hash không khớp, trang **không** gửi và hiện thông báo rõ.
4. Người nộp mất localStorage được dán `ipfs://…`. Client kiểm hash khớp on-chain trước khi gửi; backend vẫn kiểm lại (L652-656).
5. Khi `NEXT_PUBLIC_CHAIN_ID` ≠ `31337` và thiếu `PINATA_JWT`, `/api/pin` trả **503** với thông điệp cấu hình, không trả CID giả. `EvidenceUploader` từ chối neo on-chain nếu `mock === true` trên chain ≠ 31337 (phòng thủ hai lớp).
6. Luồng hiện tại (upload → ký → đăng ký thành công ngay) không đổi trải nghiệm.

## 4. Scope

**Được sửa:**

- `frontend/components/EvidenceUploader.tsx`
- `frontend/components/AgentStatusCard.tsx`
- `frontend/lib/ipfs.ts`
- `frontend/app/api/pin/route.ts`
- `frontend/app/trade/[id]/page.tsx` (chỉ phần gắn component/hook khôi phục)
- `frontend/hooks/` (được tạo **một** hook mới nếu cần, ví dụ `useEvidenceUriSync.ts`)
- `docs/agent-ops/reports/TASK-002-report.md`

**Phải đọc trước:** `frontend/lib/backend.ts` (`registerUri` L196, `getAgentStatus` L219 / `AgentStatus.missing_uris` L172, `getRegisteredUris` L226; `evidenceHashOf` và `isMockUri` trong `lib/ipfs.ts` L46, L57); `frontend/lib/contracts.ts`; `backend/attest_service.py` L626-661 (quy tắc chấp nhận URI).

**Không được sửa:** `backend/`, `contracts/`, `ai-pipeline/`, `frontend/app/api/verify/*` và `frontend/app/api/uris/*` (TASK-001 sở hữu), `frontend/lib/backend.ts` (trừ khi cần thêm một hàm đọc; ghi rõ trong report), `frontend/lib/errors.ts`; không thêm dependency.

**Ngoài phạm vi:** khôi phục URI khi người dùng mất cả localStorage lẫn URI (ghi Known Limitation); ký lại listing (ESC-080 đã làm); `simulateContract`.

## 5. Implementation Guidance

1. Tách hàm thuần `uriMatchesOnchain(uri, onchainHash): boolean` (dùng `evidenceHashOf` hiện có) để dùng lại cho cả mục 2 và 4.
2. Trạng thái lưu: chấp nhận ghi URI trước khi ký. Nếu người dùng huỷ ký, URI thừa trong localStorage không gây hại vì mục 3.3 luôn kiểm hash. Không cần cờ "pending".
3. Tự động đăng ký lại: tránh vòng lặp gọi API. Chỉ thử khi `missing_uris` thay đổi; tối đa N lần mỗi lần mở trang; dùng lại `AgentStatusCard` polling hiện có.
4. `/api/pin`: đọc `process.env.NEXT_PUBLIC_CHAIN_ID` ở server route; giữ mock cho `31337` để dev local.
5. Thông điệp tiếng Việt, theo phong cách toast hiện có (`sonner`).
6. (Tuỳ chọn, chỉ khi OD-05 = A đã được ghi) thêm một dòng cảnh báo privacy dưới ô upload.

## 6. Test Requirements

Frontend chưa có test runner (cài thêm cần OD-08), nên kiểm chứng gồm build/type-check và **kiểm tra thủ công có ghi bằng chứng** trên anvil local:

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| M1 | Happy path: seller và buyer nộp, backend chạy | Agent tự attest (hồi quy) |
| M2 | Tắt backend → buyer nộp bằng chứng (tx thành công, đăng ký lỗi) → bật backend → mở lại trang giao dịch | URI buyer được đăng ký lại (tự động hoặc qua nút); `missing_uris` rỗng; agent attest |
| M3 | Reload trình duyệt ngay sau khi ký `submitEvidence`, trước khi có receipt | Sau khi tx xác nhận, mở lại trang → URI vẫn còn và được đăng ký |
| M4 | Dán URI sai (hash không khớp) | Bị từ chối phía client, không gọi `/api/uris` |
| M5 | Trình duyệt khác, dán đúng URI | Được đăng ký |
| M6 | `.env.local` có `NEXT_PUBLIC_CHAIN_ID=43113`, không có `PINATA_JWT` → upload | `/api/pin` trả 503; không có tx `submitEvidence` |
| M7 | Chain 31337 không có JWT | Mock vẫn hoạt động (hồi quy dev) |

Kiểm M6 bằng lệnh (server Next đang chạy): `curl -s -o /dev/null -w "%{http_code}" -F file=@<ảnh> http://localhost:3000/api/pin` → `503`.

Nếu OD-08 duyệt vitest: thêm unit test cho `uriMatchesOnchain` (khớp, lệch, chuỗi rỗng).

## 7. Acceptance Criteria

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-01 | URI được lưu trước khi gọi `writeContractAsync('submitEvidence')` | Đọc diff + M3 |
| AC-02 | Có đường đăng ký lại cho `seller`/`buyer` không cần tải lại file (M2, M5) | Ảnh/ghi hình + log mạng `/api/uris` 200 |
| AC-03 | Không bao giờ gửi URI có hash lệch on-chain (M4) | Ảnh + không có request |
| AC-04 | `/api/pin` trả 503 trên chain ≠ 31337 khi thiếu JWT; vẫn mock trên 31337 (M6, M7) | Output `curl` |
| AC-05 | M1 vẫn đạt | Tx hash `attest` trên anvil |
| AC-06 | `npm run build` và `npx tsc --noEmit` pass | Output |
| AC-07 | `git diff --name-only main...HEAD` ⊆ mục 4 | Output |

## 8. Verification Commands

```bash
cd frontend
npm ci
npx tsc --noEmit
npm run build
# kiểm thủ công: anvil + backend (AGENT_AUTO=true, ALLOW_LOCAL_HOSTS cho môi trường local) + `npm run dev`
git diff --name-only main...HEAD
```

## 9. Risks and Rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Vòng lặp gọi `/api/uris` gây 429 (rate-limit 60/phút ở backend L636) | Giới hạn số lần thử, chỉ thử khi trạng thái đổi |
| Dev local không có JWT bị chặn nhầm | Giữ mock cho 31337 (M7) |
| Xung đột với thay đổi của ESC-080 trong `AgentStatusCard` | Bắt đầu sau khi ESC-080 merge; rebase trên `main` |

**Rollback:** revert branch; không có thay đổi dữ liệu hay on-chain.

## 10. Required Completion Report

`docs/agent-ops/reports/TASK-002-report.md` gồm:

- File thay đổi
- Tóm tắt implementation và lý do chọn tự động hay nút
- Kết quả M1–M7: PASS/FAIL/NOT RUN, kèm ảnh chụp hoặc tx hash
- Lệnh đã chạy và output
- Test không chạy được và lý do
- Hạn chế còn lại (bắt buộc ghi: mất cả localStorage lẫn URI thì không khôi phục được)
- Sai lệch so với spec
- "Docs cần sync" (`docs/specs/FRONTEND_SPEC.md` §5)
