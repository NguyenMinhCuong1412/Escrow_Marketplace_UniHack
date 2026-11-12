# Release Gate Pointer

> Nguồn duy nhất cho quy trình Release Gate: `.agents/skills/release-gate/SKILL.md`.

Đánh giá gate theo 2 cấp trong skill trước khi bàn giao:
1. DEMO-READY: link ẩn danh, README không TBD, toggle nguy hiểm tắt, gas ví agent, video backup, skip=0, Critical/High fixed/accepted.
2. PRODUCTION-READY: luôn đánh giá rào cản thực tế (testnet, owner EOA, chưa audit).
3. Verdict: ACCEPT FOR DEMO, ACCEPT WITH KNOWN LIMITATIONS, REJECT/BLOCKED.
4. Ghi output tại `docs/agent-ops/reports/RELEASE-GATE-<YYYY-MM-DD>.md`.