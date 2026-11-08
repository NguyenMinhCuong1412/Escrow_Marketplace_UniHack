# Bước 9 – Tài liệu nguồn chính thức

Các hướng dẫn trong bộ kit được thiết kế theo tài liệu chính thức được kiểm tra ngày **05/11/2026**. Giao diện và tính năng có thể tiếp tục thay đổi; khi menu khác, ưu tiên trang tài liệu hiện hành.

## Claude Cowork / Anthropic

- [Get started with Claude Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork) – desktop, global/folder instructions, parallel work, permissions và usage.
- [Organize your tasks with projects in Claude Cowork](https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork) – Use existing folder, project instructions, context, memory và giới hạn hiện tại.
- [Use Claude Cowork on web, desktop, and mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile) – local file access và yêu cầu Desktop app.

## Google Antigravity

- [Projects](https://antigravity.google/docs/projects/) – Project folders, Local mode, New Worktree mode và quyền theo project.
- [Rules](https://antigravity.google/docs/rules/) – `AGENTS.md`, `GEMINI.md`, `.agents/rules/*.md`, frontmatter và trigger.
- [Agent Skills](https://antigravity.google/docs/skills) – `SKILL.md`, progressive disclosure và `.agents/skills/`.
- [Custom Subagents](https://antigravity.google/docs/subagents) – subagents chạy song song, context riêng, workspace `inherit`/`branch`/`share`.
- [Workflows to skills migration](https://antigravity.google/docs/migration/workflows-to-skills) – hướng chuyển workflow cũ sang Skills.
- [Workflows](https://antigravity.google/docs/ide/workflows/) – tài liệu ghi workflow cũ ngừng hoạt động từ 19/10/2026; không lấy hệ thống cũ làm nền tảng mới.

## Security, quality và accessibility

- [OWASP ASVS 5.0.0](https://asvs.owasp.org/) – framework yêu cầu bảo mật cho web application/API.
- [OWASP Top 10:2025](https://top10.owasp.org/2025/) – nhóm rủi ro ứng dụng web.
- [OWASP Smart Contract Top 10:2025](https://owasp.org/projects/smart-contract-top-10) – nhóm rủi ro hợp đồng thông minh.
- [Solidity Security Considerations](https://docs.soliditylang.org/en/latest/security-considerations.html) – compiler warnings, modularity, checks-effects-interactions, fail-safe và peer review.
- [OpenZeppelin Contracts – Utils](https://docs.openzeppelin.com/contracts/5.x/api/utils) – tham khảo các primitive đã được kiểm chứng; phải xác minh version phù hợp.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) – tiêu chuẩn accessibility.

## Avalanche

- [Avalanche Primary Network](https://build.avax.network/docs/primary-network) – thông số C-Chain Mainnet và Fuji Testnet.
- [Avalanche C-Chain RPC](https://build.avax.network/docs/rpcs/c-chain) – RPC/API và chain ID.
- [Deploy a DApp on C-Chain with Foundry](https://build.avax.network/blog/deploy-a-dapp-on-c-chain-with-foundry) – tham khảo Foundry nếu dự án chưa có framework hợp đồng.

## Cách dùng các chuẩn này

- Đây là baseline tham chiếu, không phải tuyên bố dự án đã đạt/certified theo bất kỳ tiêu chuẩn nào.
- Chỉ áp dụng phần phù hợp với stack, threat model và phạm vi MVP.
- Trước khi deploy hoặc chọn phiên bản compiler/dependency, kiểm tra lại tài liệu chính thức mới nhất.
