---
name: release-gate
description: Evaluates Escrow Marketplace release readiness across DEMO-READY and PRODUCTION-READY tiers, enforcing submission links, security toggles, gas balances, and test evidence.
---

# Release Gate Skill

## Authority & Precedence

Nguồn thẩm quyền duy nhất cho quy trình đánh giá Release Gate trước khi nộp bài hoặc phát hành bản demo trong toàn bộ dự án Escrow Marketplace (C-15, AC-13, QA-02, MR-14). Referenced by `docs/agent-ops/RELEASE_GATE_PROMPT.md`.

## Use when

Được Project Owner hoặc Release Lead kích hoạt để đánh giá tổng thể hệ thống trước các mốc phát hành quan trọng: hoàn thành đợt tích hợp, nộp bài dự thi UniHack (hạn chót: 21/11/2026 23:59), hoặc chuẩn bị cho Demo Day (30/11/2026).

## Evaluation Tiers

Quy trình Release Gate đánh giá hệ thống theo 2 cấp độ độc lập và minh bạch:

---

### Tier 1: DEMO-READY Criteria (Bắt buộc cho Hackathon Submission)

Bắt buộc hoàn thành và đạt 100% trước 21/11/2026 23:59. Mọi hạng mục phải có lệnh hoặc bằng chứng kiểm chứng cụ thể:

| # | Hạng mục kiểm tra | Tiêu chí chấp nhận | Lệnh / Bằng chứng kiểm tra | Trạng thái |
|---|---|---|---|---|
| 1 | **Anonymous Links** | Mọi link nộp bài (GitHub repo, slide deck, demo video) mở được hoàn toàn ở chế độ ẩn danh (incognito browser) không cần đăng nhập hay xin quyền. | Mở trực tiếp các URL trên cửa sổ incognito; dán HTTP Status Code 200 hoặc screenshot xác nhận. | PASS / FAIL |
| 2 | **README Zero TBD** | `README.md` không còn bất kỳ đánh dấu `[TBD]` nào; hướng dẫn cài đặt, kiến trúc và địa chỉ contract đầy đủ. | `grep -rn "\[TBD\]" README.md` (yêu cầu kết quả rỗng). | PASS / FAIL |
| 3 | **Fuji Contract Parity** | Địa chỉ smart contract trên Avalanche Fuji trong tài liệu và cấu hình backend/frontend khớp chính xác với `contracts/deployments/43113.json`. | So sánh `contracts/deployments/43113.json` với `README.md`, `backend/.env.example` và `frontend/lib/contracts.ts`. | PASS / FAIL |
| 4 | **Dangerous Toggles on 43113** | Trên chain 43113 (Fuji), toàn bộ toggle nguy hiểm phải TẮT: `ALLOW_LOCAL_HOSTS=false`, `ENFORCE_EVIDENCE_HASH=true`, `ATTEST_API_KEY` có giá trị và fail-closed, mock IPFS tắt (có `PINATA_JWT`). Bật bất kỳ toggle nào trên 43113 ⇒ FAIL ngay lập tức. | Kiểm tra file cấu hình môi trường chạy demo trên Fuji (`.env`); xác nhận giá trị các biến cấu hình. | PASS / FAIL |
| 5 | **Agent Wallet Gas** | Ví của AI Agent (`onlyAgent`) có đủ số dư AVAX testnet trên Fuji để thực thi các giao dịch `attest` trong toàn bộ kịch bản demo (tối thiểu >= 0.5 AVAX). | `cast balance --rpc-url https://api.avax-test.network/ext/bc/C/rpc <AGENT_ADDRESS>`. | PASS / FAIL |
| 6 | **`AGENT_AUTO` Mode** | Backend auto agent (`backend/auto_agent.py`) được cấu hình đúng chế độ tự động cho kịch bản demo và kết nối thông suốt với Fuji RPC. | Kiểm tra biến `AGENT_AUTO=true` và log khởi động của agent daemon. | PASS / FAIL |
| 7 | **Backup Video** | Có sẵn video demo quay trước dự phòng kịch bản end-to-end, lưu trữ cục bộ, sẵn sàng trình chiếu nếu RPC hoặc mạng Fuji gặp sự cố lúc thuyết trình. | Kiểm tra file video cục bộ (`.mp4`), thời lượng và chất lượng phát hình ảnh/âm thanh. | PASS / FAIL |
| 8 | **Test Suite (Skip = 0)** | Tất cả test suite bắt buộc theo `docs/agent-ops/TEST_MATRIX.md` chạy thành công với số lượng test skip bằng 0 (`skipped=0`), trừ khi có phê duyệt ngoại lệ của Owner. | Dán output tổng kết từ `pytest -rs`, `forge test`, và `npm run build`. | PASS / FAIL |
| 9 | **Risk Register Check** | Mọi finding có mức độ Critical và High trong `docs/agent-ops/RISK_REGISTER.md` phải có trạng thái `FIXED` hoặc `ACCEPTED-BY-OWNER`. | Lọc các dòng Critical và High trong `docs/agent-ops/RISK_REGISTER.md` (không còn dòng OPEN/IN_PROGRESS). | PASS / FAIL |
| 10 | **Media Claims Parity** | Nội dung slide thuyết trình và video demo không tuyên bố những tính năng chưa triển khai hoặc chưa được Owner quyết định (đối chiếu Q2, Q3). | Rà soát slide/script với `docs/context/BUSINESS_REQUIREMENTS.md` và `docs/context/DECISION_LOG.md`. | PASS / FAIL |

---

### Tier 2: PRODUCTION-READY Criteria (Môi trường thương mại thực tế)

Trong giai đoạn Hackathon / MVP hiện tại, cấp độ này **LUÔN ĐƯỢC ĐÁNH GIÁ LÀ "KHÔNG ĐẠT" (NOT PASSED)**. Báo cáo bắt buộc phải liệt kê các rào cản tài liệu hóa (Blockers to Production):

1. **Deployment Scope**: Hệ thống chỉ mới triển khai trên testnet Avalanche Fuji, chưa triển khai mainnet (tuân thủ DEC-003: cấm dùng tiền thật / mainnet trong dev/demo).
2. **Centralization Risk**: Smart contract thuộc quyền sở hữu của ví cá nhân EOA Owner, chưa chuyển giao cho Multi-Sig (Gnosis Safe) hoặc Timelock / DAO (SEC-03).
3. **Independent Security Audit**: Chưa được kiểm toán bảo mật độc lập bởi đơn vị thứ ba chuyên nghiệp đối với smart contracts và backend services.
4. **Demo Window Parameters**: Cửa sổ thời gian nộp bằng chứng và khiếu nại (`DISPUTE_WINDOW` = 600s, `EVIDENCE_WINDOW` = 600s, polling 90s) được rút ngắn để phục vụ demo, chưa an toàn cho giao dịch thương mại thực tế.
5. **Pending Governance Decisions**: Các câu hỏi nghiệp vụ nền tảng (Q2: escrow giữ cọc hay tiền hàng, Q3: human arbitrator, Q4: liveness Disputed, Q5: reputation delta, Q6: privacy policy) vẫn ở trạng thái UNKNOWN chờ Owner quyết định.

---

## 3 Verdicts

1. `ACCEPT FOR DEMO`: Đạt toàn bộ 10/10 tiêu chí của cấp độ DEMO-READY. Hệ thống sẵn sàng nộp bài và trình chiếu tại Demo Day.
2. `ACCEPT WITH KNOWN LIMITATIONS`: Đạt phần lớn tiêu chí DEMO-READY nhưng có một số hạn chế thứ yếu không chặn luồng chính (ví dụ: một số test integration bị hạn chế do môi trường, đã có video backup thay thế) và được Project Owner chấp thuận bằng văn bản.
3. `REJECT/BLOCKED`: Không đạt bất kỳ tiêu chí cốt lõi nào của DEMO-READY (link nộp bài không mở được ẩn danh, toggle nguy hiểm bật trên Fuji, ví agent hết gas, còn lỗi Critical/High chưa xử lý). Tuyệt đối không bàn giao hoặc nộp bài.

## Output

Báo cáo đánh giá Release Gate phải được lưu tại:
`docs/agent-ops/reports/RELEASE-GATE-<YYYY-MM-DD>.md`
