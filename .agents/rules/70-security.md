---
trigger: always_on
description: "Use for security reviews or changes involving authentication, authorization, user data, secrets, external inputs, transactions, or deployment."
---

# Security Rules

- Áp dụng least privilege, deny-by-default và kiểm tra quyền rõ ràng phía server.
- Quyền hạn AI: Xem `.agents/rules/55-ai-authority.md`.
- Baseline: OWASP ASVS 5.0 **Level 1** cho bản demo; OWASP Top 10:2025 và Smart Contract Top 10:2025.
- Không đọc, in, commit private key, seed phrase, token, password hoặc file `.env`. Testnet keys vẫn là secret.
- Không dùng tiền thật/mainnet trong dev/demo (DEC-003).

## Toggle Nguy Hiểm & Môi Trường
- Các toggle: `ALLOW_LOCAL_HOSTS=true`, `ENFORCE_EVIDENCE_HASH=false`, `ATTEST_API_KEY` rỗng, và IPFS mock (thiếu `PINATA_JWT`) chỉ được phép trên chain `31337` (local anvil).
- Bật bất kỳ toggle nào trên chain `43113` (Fuji) là vi phạm nghiêm trọng và bị từ chối tại Release Gate.

## Upload & IPFS
- Mock CID không được dùng ngoài chain `31337`.
- Upload phải kiểm tra magic bytes cho MIME type; dữ liệu đưa lên IPFS là công khai và vĩnh viễn.

## Privacy & Branding
- **Privacy**: Chính sách chính thức chờ Owner (Q6); tối thiểu không log URI bằng chứng kèm địa chỉ ví ở mức INFO.
- **Branding (DEC-017 / Q10)**: Chuỗi người dùng thấy hoặc ký phải dùng tên chính thức **Escrow Marketplace**; tuyệt đối không dùng tên dự án khác (như "TrustPact").

## Secret Scanning
- Quét secret trong toàn bộ lịch sử git trước khi công khai repository (công cụ do Owner phê duyệt; quét theo tên file là không đủ).