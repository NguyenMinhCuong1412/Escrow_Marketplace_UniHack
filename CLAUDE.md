# UniHack 2026 — Escrow Marketplace cho đồ sưu tầm (chưa đặt tên chính thức)

> File này là tổng quan ngắn gọn. Chi tiết nằm trong bộ KIT tại `Escrow_Marketplace_AI_Operating_Kit/docs/context/`. Luôn đọc file context tương ứng khi cần thông tin chính xác.

## Tóm tắt dự án

Hackathon dApp trên Avalanche — marketplace escrow cho đồ sưu tầm, nơi bằng chứng giao dịch (ảnh đóng gói / video unbox) được **AI xác thực tự động** bằng pipeline pHash + ORB + OCR nonce. Track: **AI Agents and Security**. Điểm khác biệt chính: **không cần broker thứ 3** — AI agent gọi `attest()` on-chain thay vì người duyệt thủ công.

## Team

| Thành viên | Vai trò |
|---|---|
| Hứa Kiến Quốc | Team Lead — nền tảng Computer Vision/Data Science, phụ trách contracts + AI pipeline + backend |
| Nguyễn Minh Cường | Thành viên — chưa phân công cụ thể |
| Nguyễn Phú Nguyên Vũ | Thành viên — chưa phân công cụ thể |

## Mốc thời gian & Tiêu chí chấm

- **Deadline nộp bài:** 21/11/2026 23:59 (giờ VN)
- **Final Demo Day:** 30/11/2026
- **Tiêu chí:** Technical Implementation 25% · Avalanche Integration 25% · Creativity 15% · Impact & Use Case 15% · Presentation 10% · UI/UX 10%

## Trạng thái hiện tại

Phase 0 + 1 + 2 **XONG**. Kết quả test: 81 Foundry (contract) · 59 AI pipeline · 37 backend (23 unit + 14 integration) — tất cả **PASS**. Frontend **CHƯA code**. Deploy Fuji **CHƯA**.

## Nguồn chi tiết (KIT)

| File | Nội dung |
|---|---|
| `Escrow_Marketplace_AI_Operating_Kit/docs/context/COMPETITION_CONTEXT.md` | Thể lệ cuộc thi, deadline, rubric |
| `Escrow_Marketplace_AI_Operating_Kit/docs/context/PRODUCT_VISION.md` | Vision, value proposition, MVP outcomes |
| `Escrow_Marketplace_AI_Operating_Kit/docs/context/BUSINESS_REQUIREMENTS.md` | Actors, state machine, luồng nghiệp vụ |
| `Escrow_Marketplace_AI_Operating_Kit/docs/context/TECH_STACK.md` | Framework, version, test commands |
| `Escrow_Marketplace_AI_Operating_Kit/docs/context/CURRENT_STATUS.md` | Trạng thái code, test results |
| `Escrow_Marketplace_AI_Operating_Kit/docs/context/DECISION_LOG.md` | Quyết định kiến trúc đã chốt |
| `Escrow_Marketplace_AI_Operating_Kit/docs/context/OPEN_QUESTIONS.md` | Việc còn mở |
| `Escrow_Marketplace_AI_Operating_Kit/docs/context/USER_PERSONAS.md` | User personas |

## Quy tắc cho Claude Code

- Ưu tiên các quyết định giúp **tối đa hóa điểm** theo bảng tiêu chí trên.
- Nhắc tôi về **deadline** khi liên quan.
- Giữ code Solidity/smart contract **đủ gọn** để hoàn thành trong timeline 30 ngày.
- Khi cần thông tin chi tiết (quyết định đã chốt, bug đã sửa, spec...), đọc file KIT tương ứng — không hỏi lại người dùng những gì đã ghi.
