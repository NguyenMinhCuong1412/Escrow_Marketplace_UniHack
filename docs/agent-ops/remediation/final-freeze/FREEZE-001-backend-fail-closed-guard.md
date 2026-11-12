# Task Specification — FREEZE-001

## Metadata

- **Task ID:** `FREEZE-001`
- **Title:** Backend fail-closed trên chain ≠ 31337 (key rỗng hoặc toggle nguy hiểm) + `/health.security_toggles`
- **Priority:** P1
- **Status:** READY (sau khi FZ-01 xong: ESC-080 đã merge vào `main`)
- **Deploy authorized:** No
- **Risk tier:** P1 (auth / đường tới `attest`)
- **Requested by:** Cowork (Final Pre-Freeze Audit, finding FZ-02)
- **Assigned role:** Backend Engineer (Antigravity hoặc Claude Code)
- **Branch/worktree:** `freeze/001-backend-fail-closed`, tạo từ `main` sau khi ESC-080 merge
- **Related decision:** Rule `30-backend.md:L10`, `70-security.md:L15-16` (ESC-090, Owner duyệt 12/11). Đây là **tập con** của `TASK-001`; phần SE-05 và rate-limit vẫn thuộc TASK-001, làm sau freeze

## Context

Kiểm chứng tại `5b02f5b`:

- `backend/attest_service.py:L467-472` `check_api_key`: khi `ATTEST_API_KEY` rỗng, hàm chỉ ghi warning rồi cho qua, **trên mọi chain**.
- `ALLOW_LOCAL_HOSTS` (`L115`) tắt toàn bộ kiểm tra IP (`L204`, `L221`).
- `ENFORCE_EVIDENCE_HASH=false` (`L117`) bỏ ràng buộc URI↔hash on-chain (`L532`).
- Không có kiểm tra nào theo chain.
- `backend/.env.example:L14` mặc định key rỗng.

**Root cause:** cấu hình mặc định fail-open (RC-2).

**Tác động:** trên Fuji, chỉ cần một lần cấu hình sai là bất kỳ ai cũng gọi được endpoint tới `attest()` (tốn gas ví agent), hoặc mất chống SSRF và ràng buộc hash. Release Gate theo rule 70 sẽ từ chối.

## Goal

Khi chain kết nối **khác 31337**, nếu có bất kỳ điều kiện nào sau đây thì `POST /verify-evidence` và `POST /trade/{id}/uris` trả **503** với `error_code="INSECURE_CONFIG"`, không chạy pipeline và không gửi `attest`:

- `ATTEST_API_KEY` rỗng;
- `ALLOW_LOCAL_HOSTS=true`;
- `ENFORCE_EVIDENCE_HASH=false`.

Ngoài ra:

- **Auto agent** không verify hay attest trong cấu hình như trên, và `/health.agent_error` nêu lý do.
- `GET /health` trả thêm khối `security_toggles`: `{api_key_set, allow_local_hosts, enforce_evidence_hash, ipfs_gateway_host, insecure_for_chain}`. Khối này **không** chứa giá trị secret.
- Trên chain 31337, hành vi giữ nguyên như hiện tại.

## Scope – allowed files/paths

- `backend/attest_service.py`
- `backend/.env.example` (chỉ thêm ghi chú về guard)
- `backend/tests/test_service_unit.py`, `backend/tests/conftest.py`
- `docs/agent-ops/reports/FREEZE-001-report.md` (tạo mới)

## Out of scope – do not edit

- `contracts/`, `ai-pipeline/`, `frontend/`, `backend/chain.py`, `backend/auto_agent.py` (agent đi qua `run_verification` nên guard đặt ở đó là đủ), `docs/context/`, `.agents/`
- Không đổi thông điệp lỗi 4xx hiện có. Không làm SE-05 hay rate-limit (TASK-001). Không thêm dependency.

## Dependencies

- FZ-01: ESC-080 phải merge vào `main` trước (cùng sửa `attest_service.py` và `test_service_unit.py`).
- Chạy song song được với FREEZE-002 vì không có file chung.

## Acceptance Criteria

| ID | Tiêu chí | Traces | Verification method | Evidence artifact |
|---|---|---|---|---|
| AC-01 | Có hàm thuần `insecure_reasons(settings, chain_id) -> list[str]`; trả `[]` khi `chain_id == 31337` | Rule 30/70 | Unit test thuần, không cần RPC | pytest |
| AC-02 | chain 43113 + key rỗng → `POST /verify-evidence` trả 503, `error_code == "INSECURE_CONFIG"`; `send_attest` không được gọi | SEC-02 | Unit test với fake client | pytest |
| AC-03 | chain 43113 + `allow_local_hosts=True` → 503; chain 43113 + `enforce_evidence_hash=False` → 503 | SEC-06 | Unit test | pytest |
| AC-04 | chain 43113 + key rỗng → `POST /trade/{id}/uris` trả 503 | SEC-02 | Unit test | pytest |
| AC-05 | Chain 31337 + key rỗng → hành vi cũ (không 503 vì guard); chain 43113 + cấu hình đúng + key sai → vẫn 401 | Hồi quy | Unit test | pytest |
| AC-06 | Auto agent trên cấu hình không an toàn không gọi `attest`; `/health.agent_error` chứa `INSECURE_CONFIG` | Rule 55 | Unit test gọi `agent.tick()` với fake client | pytest |
| AC-07 | `/health` có đủ 5 khoá trong `security_toggles`; body không chứa giá trị key | Rule 70 | Unit test kiểm tra chuỗi key không xuất hiện | pytest |
| AC-08 | Toàn bộ Python suite pass, **skip = 0** (anvil + Tesseract) | TEST_MATRIX | `python -m pytest -rs` | Dòng tổng kết |
| AC-09 | `git diff --name-only main...HEAD` ⊆ Scope | Rule 90 | Lệnh git | Output |

## Test Requirements

- **TEST_MATRIX rows applied:** `backend/` P0 ("Attest Authorization Fail-Closed"), `backend/` P1.
- **Skip policy:** `.agents/rules/80-testing.md`, chạy với `-rs`; skip > 0 ⇒ BLOCKED.
- **Unit:** AC-01..AC-07.
- **Integration:** không thêm test. 23 test `test_integration_anvil.py` (chain 31337) phải pass mà không đổi kỳ vọng.
- **Regression:** `python -m pytest -rs` từ gốc repo.
- **Security review required?** **Yes**, vì task chạm `backend/attest_service.py`.

## Implementation constraints

- Chain ID chỉ có sau khi `get_client()` khởi tạo lười. Đặt guard ở một điểm duy nhất, đầu `run_verification` và `register_uri`, dùng `c.chain_id()` (nên cache lại), và ghi lý do vào report.
- Không chặn khởi động tiến trình, vì backend vẫn cần `/health` để báo lỗi cấu hình.
- KISS: không thêm middleware hay framework.
- Đọc `.agents/AGENTS.md` và các rule `30`, `55`, `70`, `80`, `90` trước khi làm.

## Verification commands

```powershell
.\.venv\Scripts\python.exe -m pytest -rs backend/tests/test_service_unit.py
.\.venv\Scripts\python.exe -m pytest -rs
git diff --name-only main...HEAD
```

## Regression risks

| Rủi ro | Giảm thiểu |
|---|---|
| Demo Fuji bị khoá vì quên key | Đây là hành vi mong muốn. Checklist freeze kiểm `/health.security_toggles.insecure_for_chain == false` |
| Integration test dùng `ALLOW_LOCAL_HOSTS` bị chặn | Guard bỏ qua chain 31337 |
| Gọi `chain_id()` mỗi request làm tăng latency RPC | Cache sau lần gọi đầu |

**Rollback:** revert branch. Không có thay đổi on-chain.

## Deliverables

- File thay đổi, lệnh và output thật, dòng tổng kết `N passed, M failed, K skipped`.
- **Known violations touched:** SEC-02 (phần auth), SEC-06.
- **Docs cần sync:** `docs/specs/FRONTEND_SPEC.md` §4 (`/health`).

## Review outcome

- **Reviewer:** Cowork (`.agents/skills/qa-review/SKILL.md`, có security review)
- **Result:** —
