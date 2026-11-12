# Project Risk Register – Escrow Marketplace

> **Nguồn gốc baseline:** `docs/audit/AGENT_RULES_AUDIT_REPORT.md` (Audit 11/11/2026, baseline commit `7a0c5e9`).  
> **Khởi tạo:** 2026-11-12 (Task ESC-090, Milestone 3) theo chỉ thị C-19 và AC-15.  
> **Mục đích:** Theo dõi tập trung toàn bộ các rủi ro, lỗ hổng, sai lệch quy trình và tài liệu đã được kiểm toán; phân định rõ trách nhiệm xử lý và tiến độ khắc phục.

---

## 1. Nguyên Tắc Quản Trị & Vận Hành (Governance)

1. **Vòng đời trạng thái:**
   - `OPEN`: Rủi ro đã được xác nhận từ đợt audit, chưa có task đang xử lý.
   - `IN_PROGRESS (<Task>)`: Đang được xử lý trong phạm vi của một Task Specification được duyệt (ví dụ: `IN_PROGRESS (ESC-090)` hoặc `IN_PROGRESS (ESC-080)`).
   - `FIXED`: Đã được giải quyết triệt để và merged vào nhánh chính (`main`).
   - `BLOCKED-OWNER`: Bị chặn do chờ quyết định nghiệp vụ hoặc chỉ thị bền vững từ Project Owner (các câu hỏi mở Q2–Q6).
   - `ACCEPTED-BY-OWNER`: Rủi ro tồn đọng được Project Owner chính thức chấp nhận (cho giai đoạn demo/testnet) kèm lý do ghi rõ.

2. **Quyền hạn cập nhật trạng thái:**
   - **Duy nhất Project Owner có quyền thiết lập hoặc phê duyệt trạng thái ACCEPTED-BY-OWNER.**
   - Các AI agent (Antigravity, Claude Code, Cowork) chỉ được chuyển trạng thái sang `IN_PROGRESS` khi có Task Spec `READY`, và sang `FIXED` khi task đã được QA duyệt và merge. Tuyệt đối không tự ý chuyển rủi ro sang `ACCEPTED-BY-OWNER`.

3. **Quy tắc an toàn task song song (AGENTS.md §6.4):**
   - Vi phạm có sẵn trong codebase được liệt kê trong `docs/agent-ops/RISK_REGISTER.md` **không** làm task khác bị `BLOCKED` nếu task đó không có phạm vi sửa đổi vi phạm đó.
   - Tuy nhiên, task thực thi **không được phép làm vi phạm đó trầm trọng hơn** (no degradation).

4. **Kiểm tra Release Gate:**
   - Tại mốc đánh giá Release Gate, tất cả các rủi ro mức độ `Critical` và `High` bắt buộc phải ở trạng thái `FIXED`, `IN_PROGRESS` (kèm mitigation rõ ràng), `BLOCKED-OWNER` (được ghi nhận trong Known Limitations), hoặc `ACCEPTED-BY-OWNER`.

---

## 2. Bảng Tổng Hợp Theo Mức Độ Rủi Ro (Summary)

| Phân nhóm | Critical | High | Medium | Low | Tổng | Trạng thái ban đầu |
|---|---|---|---|---|---|---|
| **RA** (Rule Architecture) | 1 | 3 | 5 | 0 | **9** | 1 IN_PROGRESS (ESC-090), 8 OPEN |
| **PC** (Project Consistency) | 1 | 2 | 4 | 2 | **9** | 3 BLOCKED-OWNER, 6 OPEN |
| **SEC** (Security) | 1 | 3 | 5 | 1 | **10** | 2 IN_PROGRESS (ESC-080), 3 BLOCKED-OWNER, 5 OPEN |
| **SE** (Software Engineering) | 0 | 1 | 5 | 2 | **8** | 8 OPEN |
| **TST** (Testing) | 0 | 3 | 5 | 0 | **8** | 1 IN_PROGRESS (ESC-080), 7 OPEN |
| **QA** (QA & Release Gate) | 0 | 2 | 3 | 0 | **5** | 5 OPEN |
| **Tổng cộng** | **3** | **14** | **27** | **5** | **49** | **4 IN_PROGRESS, 6 BLOCKED-OWNER, 39 OPEN** |

---

## 3. Danh Mục Chi Tiết 49 Rủi Ro (Risk Inventory)

| ID | Severity | Mô tả | Owner/Task xử lý | Trạng thái | Ngày cập nhật |
|---|---|---|---|---|---|
| RA-01 | Critical | Rule về quyền hạn AI mâu thuẫn trực tiếp với thiết kế đã CONFIRMED (cấm ký tx trong khi DEC-013/auto_agent.py gọi attest) | ESC-090 | IN_PROGRESS (ESC-090) | 2026-11-12 |
| RA-02 | High | Không có thứ tự ưu tiên giữa các nguồn sự thật; 4 tài liệu chỉ dẫn xung đột nhau | ESC-090 | OPEN | 2026-11-12 |
| RA-03 | High | Tài liệu "source of truth" đánh dấu CONFIRMED nhưng lỗi thời (frontend "chưa tạo", chưa deploy Fuji, CLIP, đếm ngược ngày) | ESC-090 | OPEN | 2026-11-12 |
| RA-04 | High | Decision Log không được quản trị: thiếu SUPERSEDED, DEC do agent ghi trong commit code, thay đổi nghiệp vụ thiếu DEC | Owner / ESC-090 | OPEN | 2026-11-12 |
| RA-05 | Medium | Không có ID requirement (REQ-xxx); nhãn trạng thái không thống nhất giữa các context docs | ESC-090 | OPEN | 2026-11-12 |
| RA-06 | Medium | Rule khó kiểm chứng do thiếu ngưỡng đo lường khách quan và checklist định lượng | ESC-090 | OPEN | 2026-11-12 |
| RA-07 | Medium | Tất cả domain rule dùng trigger model_decision, nguy cơ bỏ sót không nạp rule quan trọng | ESC-090 | OPEN | 2026-11-12 |
| RA-08 | Medium | 10-product-scope.md cấm tính năng reputation và admin dù đã CONFIRMED trong BR | ESC-090 | OPEN | 2026-11-12 |
| RA-09 | Medium | Trùng lặp quy tắc ở nhiều nơi (worktree, deploy, DoD), đã bắt đầu lệch câu chữ | ESC-090 | OPEN | 2026-11-12 |
| PC-01 | High | State machine trong BUSINESS_REQUIREMENTS mô tả khác với 6 trạng thái enum trong contract | Doc-sync task | OPEN | 2026-11-12 |
| PC-02 | Critical | Phạm vi escrow: contract chỉ giữ cọc hai chiều, tài liệu/pitch tuyên bố "giải ngân" tiền hàng (chờ Q2) | Owner | BLOCKED-OWNER | 2026-11-12 |
| PC-03 | High | Tuyên bố "không có human arbitrator" mâu thuẫn với việc owner là trọng tài resolveDispute (chờ Q3) | Owner | BLOCKED-OWNER | 2026-11-12 |
| PC-04 | Medium | Ngữ nghĩa cancelUnfunded mô tả sai là cần quá hạn, thực tế trong contract gọi được ngay khi ở state Created | Doc-sync task | OPEN | 2026-11-12 |
| PC-05 | Medium | Quy tắc reputation ±10/+5 trong resolveDispute không có trong BR và Decision Log (chờ Q5) | Owner | BLOCKED-OWNER | 2026-11-12 |
| PC-06 | Medium | Thời điểm sinh nonce trong slide/video ghi sai là "sau khi đủ cọc", thực tế sinh lúc createTrade | Doc-sync / Slide | OPEN | 2026-11-12 |
| PC-07 | Medium | Thành phần AI mô tả sai là dùng CLIP mặc định và thiếu QR nonce trong docs | Doc-sync / ESC-090 | OPEN | 2026-11-12 |
| PC-08 | Low | Tham số cửa sổ thời gian (submission, attest, dispute) ghi không đồng nhất giữa demo và production | Doc-sync task | OPEN | 2026-11-12 |
| PC-09 | Low | FRONTEND_SPEC cho phép http URL trong khi backend đã cấm và chỉ nhận ipfs:// | Doc-sync task | OPEN | 2026-11-12 |
| SEC-01 | Critical | Luồng verify thủ công cho phép người gọi bất kỳ chọn ảnh tham chiếu tuỳ ý, điều khiển kết quả AI (DEC-016) | ESC-080 | IN_PROGRESS (ESC-080) | 2026-11-12 |
| SEC-02 | High | API key không phải ranh giới xác thực; fail-open khi rỗng; rate-limit theo IP proxy sụp về 1 bucket | Backend hardening | OPEN | 2026-11-12 |
| SEC-03 | High | Tập trung quyền ở owner EOA (trọng tài, đổi agent bất kỳ lúc nào), BR ghi "quyền tối thiểu" (chờ Q4) | Owner | BLOCKED-OWNER | 2026-11-12 |
| SEC-04 | High | Không có lối thoát timeout cho trạng thái Disputed và trade bị flagged khi owner vắng mặt (chờ Q4) | Owner | BLOCKED-OWNER | 2026-11-12 |
| SEC-05 | Medium | Upload proxy /api/pin công khai không auth, dùng JWT chung, trả CID mock âm thầm làm chết trade | ESC-090 (rule) / Backend | OPEN | 2026-11-12 |
| SEC-06 | Medium | Toggle bảo mật nguy hiểm (ALLOW_LOCAL_HOSTS, ENFORCE_EVIDENCE_HASH) không bị rule kiểm soát | ESC-090 (rule) | OPEN | 2026-11-12 |
| SEC-07 | Medium | Lộ URI bằng chứng công khai trên IPFS và API không có auth, thiếu rule privacy bảo vệ PII (chờ Q6) | Owner | BLOCKED-OWNER | 2026-11-12 |
| SEC-08 | Medium | Thông điệp EIP-712 người dùng ký mang tên dự án đối thủ "TrustPact" (DEC-017) | ESC-080 | IN_PROGRESS (ESC-080) | 2026-11-12 |
| SEC-09 | Low | Kiểm tra secret trong lịch sử git mới chỉ quét tên file, chưa quét nội dung toàn bộ commit (chờ Q12) | Release Gate / Owner | OPEN | 2026-11-12 |
| SEC-10 | Medium | 40-smart-contract thiếu checklist kiểm tra tập trung quyền, liveness, setAgent, và randomness | ESC-090 | OPEN | 2026-11-12 |
| SE-01 | High | Quy trình Task Spec → Report → QA bị bỏ qua cho 3 lần merge (PR #5, #6, #7); rule thiếu cơ chế chặn (DEC-015) | ESC-090 | OPEN | 2026-11-12 |
| SE-02 | Medium | API contract trong spec/task lệch so với endpoint và schema thực tế của backend | ESC-090 (rule) / Doc-sync | OPEN | 2026-11-12 |
| SE-03 | Medium | ABI nhân bản ở 3 nơi (backend, frontend, contracts) không có cơ chế kiểm tra đồng bộ | ESC-090 (rule) | OPEN | 2026-11-12 |
| SE-04 | Medium | Dependency Python và frontend không được khoá phiên bản (thiếu lockfile); thiếu rule audit | ESC-090 / DevOps | OPEN | 2026-11-12 |
| SE-05 | Medium | Backend trả nguyên văn exception (str(e)) cho client, nguy cơ lộ URL RPC nội bộ và secret | ESC-090 (rule) / Backend | OPEN | 2026-11-12 |
| SE-06 | Low | Số lượng test được hardcode thành ít nhất 7 con số khác nhau trong các tài liệu tĩnh | ESC-090 | OPEN | 2026-11-12 |
| SE-07 | Medium | Branch hygiene và active ownership không được quản lý, tồn tại branch thừa và lệch tên spec | ESC-090 | OPEN | 2026-11-12 |
| SE-08 | Low | Thiếu file .gitattributes khiến line-ending CRLF trên Windows gây ra hàng trăm file modified giả | ESC-090 (rule) | OPEN | 2026-11-12 |
| TST-01 | High | 80-testing.md không định nghĩa ma trận test bắt buộc theo module và cấp độ rủi ro | ESC-090 | OPEN | 2026-11-12 |
| TST-02 | High | Test bị skip trong suite bắt buộc vẫn được báo cáo là "ALL PASS" mà không ghi số lượng skipped | ESC-090 | OPEN | 2026-11-12 |
| TST-03 | High | Frontend không có unit/integration test, thiếu ESLint thực, lỗi ưu tiên regex trong errors.ts | ESC-080 (errors.ts) / ESC-090 | IN_PROGRESS (ESC-080) | 2026-11-12 |
| TST-04 | Medium | Bộ test contract thiếu handler invariant cho withdraw, thiếu test biên deadline và victim +5 | Contract task | OPEN | 2026-11-12 |
| TST-05 | Medium | Không có test parity giữa backend và frontend về listing message, canonical JSON hash và ABI | ESC-090 (rule) / Test task | OPEN | 2026-11-12 |
| TST-06 | Medium | Pipeline AI/CV không có bộ dữ liệu đánh giá định lượng (FPR/FNR, accuracy) trên ảnh thực | ESC-090 (rule) | OPEN | 2026-11-12 |
| TST-07 | Medium | Thiếu test case cho failure-injection (RPC lỗi), concurrency (2 attest đồng thời), và recovery | ESC-090 (rule) | OPEN | 2026-11-12 |
| TST-08 | Medium | ESC-060 (E2E) có acceptance criteria không kiểm chứng được và thiếu báo cáo hoàn thành | QA task | OPEN | 2026-11-12 |
| QA-01 | High | Báo cáo QA ra verdict ACCEPT mà không chạy lại test suite bắt buộc; thiếu thang đo severity | ESC-090 | OPEN | 2026-11-12 |
| QA-02 | High | Release Gate chưa từng được thực thi; thiếu tiêu chí phân tách giữa DEMO-READY và PRODUCTION-READY | ESC-090 | OPEN | 2026-11-12 |
| QA-03 | Medium | Acceptance Criteria trong task spec không đo được hoặc sai lệch so với implementation thực tế | ESC-090 | OPEN | 2026-11-12 |
| QA-04 | Medium | Quy trình review diff phạm vi IN/OUT và kiểm tra regression chưa được chuẩn hoá ở phía QA | ESC-090 | OPEN | 2026-11-12 |
| QA-05 | Medium | Thiếu chuẩn vòng đời trạng thái task (DRAFT -> READY -> IN_PROGRESS -> IN_REVIEW -> ACCEPTED -> MERGED) | ESC-090 | OPEN | 2026-11-12 |

---

## 4. Ghi Chú Chi Tiết Các Hạng Mục Bị Chặn (BLOCKED-OWNER)

Các mục sau đây yêu cầu chỉ thị hoặc xác nhận chính thức từ Project Owner trước khi có thể triển khai:
1. **PC-02 (Q2)**: Xác nhận mô hình kinh tế escrow: (a) chỉ giữ cọc hai chiều (hoàn cọc cả hai nếu hợp lệ, tiền hàng thanh toán off-chain) hay (b) buyer ký quỹ cả tiền hàng (yêu cầu sửa contract).
2. **PC-03 (Q3)**: Chuẩn hoá tuyên bố phân xử tranh chấp: AI tự động hoàn tất luồng sạch (`resolveClean`); khi có khiếu nại hoặc cờ vi phạm, owner đóng vai trò trọng tài (`resolveDispute`). Lộ trình tương lai chuyển sang cơ chế phi tập trung.
3. **SEC-03 & SEC-04 (Q4)**: Chấp nhận rủi ro tập trung quyền hạn ở EOA owner cho bản testnet/demo; ghi nhận hạn chế không có timeout giải quyết tranh chấp trong Known Limitations.
4. **PC-05 (Q5)**: Xác nhận tham số thay đổi điểm uy tín khi tranh chấp: bên vi phạm −10 điểm, bên bị hại +5 điểm.
5. **SEC-07 (Q6)**: Chính sách quyền riêng tư đối với ảnh/video bằng chứng trên IPFS công khai (hiển thị cảnh báo người dùng trên giao diện upload).
