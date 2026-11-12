# TASK-005 — Contracts: thêm `withdraw` và người nhận từ chối AVAX vào invariant; test biên deadline và liveness của trade flagged

## 1. Task Metadata

| Trường | Giá trị |
|---|---|
| Task ID | `TASK-005` |
| Title | Contract invariant & boundary test hardening (tests only) |
| Priority | **P2** (Risk tier P0 vì vùng tiền; thay đổi chỉ là test) |
| Affected module | `contracts/test/` |
| Suggested agent role | Smart Contract Test Engineer |
| Branch | `phase/4k-contract-tests` (từ `main`) |
| Dependencies | Không. Song song được với mọi task khác |
| Related findings | TST-04, FPA-17, ghi nhận hành vi SEC-04; QA rerun cho FPA-22/FPA-24 ([báo cáo thẩm định](../../audit/REPORT_VALIDATION_AND_REMEDIATION_PLAN.md) §3.5, §4) |
| Owner approval | Không cần. **Không sửa `contracts/src/`, không redeploy.** `Deploy authorized: No` |
| Security review required | Yes (review tính đúng của invariant) |

## 2. Problem Description

- Handler invariant [`contracts/test/EscrowInvariant.t.sol`](../../../contracts/test/EscrowInvariant.t.sol) L38-125 có 10 hành động: `create`, `deposit`, `cancelUnfunded`, `evidence`, `attest`, `complain`, `resolveDispute`, `resolveClean`, `cancelTimeout`, `warp`.
  - **Không có `withdraw`.** Mọi actor nhận AVAX bình thường nên nhánh `_payout` thất bại → `pendingWithdrawals` (`contracts/src/Escrow.sol` L347-354) và `withdraw()` (L312-319) không được fuzz trong invariant.
  - Invariant `invariant_BalanceMatchesOutstanding` (L146-152) đã tính `pendingWithdrawals` nhưng giá trị này luôn bằng 0 trong mọi lần chạy. Hiện chỉ có một unit test cho nhánh này (`test_RejectingReceiverCannotBlockDispute`, `Escrow.t.sol` L797).
- Biên thời gian `block.timestamp == deadline` có test cho một số hàm (`test_SubmitEvidence_AtDeadlineOk` L420, `test_Attest_AfterEvidenceDeadlineWithinGrace` L481). Chưa thấy test đối xứng tại đúng `disputeDeadline` cho cặp `resolveClean` (`>`) / `fileComplaint` (`<=`) (`Escrow.sol` L237, L253). **Agent phải xác nhận lại bằng cách đọc toàn bộ `Escrow.t.sol` trước khi thêm**, để không tạo test trùng.
- Hành vi liveness (SEC-04, chờ Owner OD-03) chưa được test ghi nhận: trade `flagged` không ai khiếu nại thì ở mãi `Attested` (`resolveClean` revert L236; `cancelOnEvidenceTimeout` revert L298).
- FULL audit tuyên bố "7 suites, 80 passed" nhưng không tái lập được (FPA-22). Task này tạo bằng chứng chạy thật.

## 3. Expected Outcome

1. Invariant chạy với handler có thêm:
   - (a) `withdraw(actorSeed)`;
   - (b) ít nhất một actor là contract **có thể bật/tắt** việc từ chối nhận AVAX, tham gia như seller hoặc buyer.
   - Hai invariant hiện có vẫn pass ở cấu hình `foundry.toml` (`runs = 256`, `depth = 200`, `fail_on_revert = true`).
2. Thêm invariant hoặc ghost-variable chứng minh không ai rút được nhiều hơn số mình được ghi nhận. Ví dụ: tổng AVAX actor đã nhận ≤ tổng đã nạp. Agent chọn cách diễn đạt và giải thích.
3. Unit test biên tại đúng `disputeDeadline`, `disputeDeadline + 1`, `evidenceDeadline + ATTEST_WINDOW (+1)` cho các hàm liên quan, nếu chưa có.
4. Unit test "known limitation" ghi nhận trade flagged không khiếu nại không thể kết thúc ngoài `fileComplaint` → `resolveDispute`. Tên test thể hiện đây là hành vi hiện tại chờ OD-03, **không** khẳng định đó là hành vi đúng.
5. `contracts/src/**` không đổi.

## 4. Scope

**Được sửa:**

- `contracts/test/EscrowInvariant.t.sol`
- `contracts/test/Escrow.t.sol` (chỉ thêm test, không sửa/xoá test hiện có)
- `docs/agent-ops/reports/TASK-005-report.md`

**Phải đọc trước:** `contracts/src/Escrow.sol`, `contracts/src/CollectibleToken.sol`, `contracts/foundry.toml`, toàn bộ `contracts/test/*.sol`.

**Không được sửa:** `contracts/src/`, `contracts/script/`, `contracts/deployments/`, `contracts/lib/`, `foundry.toml`; mọi module khác.

**Ngoài phạm vi:** Slither/static analysis (cần OD-08); thay đổi contract cho SEC-03/04 (OD-03).

## 5. Implementation Guidance

1. Actor từ chối nhận: contract nhỏ trong file test, có `receive()` revert khi cờ bật. Handler gọi `deposit`/`submitEvidence` thay mặt actor qua `vm.prank`.
2. Handler `withdraw`: chọn actor, bỏ qua (`return`) nếu `pendingWithdrawals == 0` để giữ `fail_on_revert = true`. Tắt cờ từ chối trước khi rút để nhánh thành công được phủ; cũng phủ nhánh thất bại (`withdraw failed`) bằng cách bắt revert trong handler hoặc tách thành unit test.
3. Ghost variable: lưu tổng nạp và tổng nhận theo actor ngay trong handler.
4. Ghi số `calls`/`reverts` của invariant run vào report.

## 6. Test Requirements

| Loại | Test |
|---|---|
| Invariant | Handler mới + 2 invariant cũ + ≥1 invariant mới (mục 3.2) |
| Unit (boundary) | `resolveClean` tại `disputeDeadline` revert, tại `+1` OK; `fileComplaint` của party tại `disputeDeadline` OK, tại `+1` revert; `attest` tại `evidenceDeadline + ATTEST_WINDOW` OK, `+1` revert (nếu chưa có); `cancelOnEvidenceTimeout` khi đủ bằng chứng tại `evidenceDeadline + ATTEST_WINDOW` revert, `+1` OK |
| Unit (known limitation) | Trade flagged không khiếu nại: sau thời gian dài vẫn `Attested`; `resolveClean` và `cancelOnEvidenceTimeout` revert |
| Unit (rejecting receiver) | `resolveClean` với buyer từ chối → seller vẫn nhận; buyer có `pendingWithdrawals`; buyer `withdraw` sau khi bật nhận → nhận đúng số |
| Regression | Toàn bộ `forge test` |

## 7. Acceptance Criteria

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-01 | Handler có `withdraw` và actor từ chối nhận; invariant pass (`runs=256`, `depth=200`) | Output `forge test --match-contract EscrowInvariantTest -vv` (gồm số calls/reverts) |
| AC-02 | Invariant mới (mục 3.2) pass | Output |
| AC-03 | Test biên và known-limitation pass; không trùng test hiện có | Output + danh sách tên test mới |
| AC-04 | Toàn bộ `forge test` pass; báo số suite/test thật | Output |
| AC-05 | `forge build` không có warning mới. Liệt kê warning hiện có để đóng FPA-24 | Output |
| AC-06 | `git diff --name-only main...HEAD` chỉ gồm `contracts/test/*.sol` + report | Output |

## 8. Verification Commands

```bash
cd contracts
forge build
forge test -vv
forge test --match-contract EscrowInvariantTest -vv
git diff --name-only main...HEAD
```

## 9. Risks and Rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Handler revert làm invariant fail giả (`fail_on_revert = true`) | Guard điều kiện trước mỗi lời gọi |
| Invariant mới sai về mặt toán học | QA review công thức; chạy thêm với `runs` lớn hơn ở máy dev (ghi vào report) |
| Một test mới lộ ra bug thật trong contract | **Không sửa contract.** Dừng, báo finding mới, Owner quyết định (sau freeze cần OD-10 + redeploy) |

**Rollback:** revert branch (chỉ test).

## 10. Required Completion Report

`docs/agent-ops/reports/TASK-005-report.md` gồm:

- File thay đổi
- Danh sách test mới
- Lệnh và output đầy đủ của `forge build` / `forge test` (số suite, passed, failed, skipped; invariant runs/calls/reverts)
- Phiên bản `forge`
- Test không chạy và lý do
- Hạn chế
- Sai lệch so với spec
- Mọi hành vi contract đáng ngờ phát hiện được (không sửa)
