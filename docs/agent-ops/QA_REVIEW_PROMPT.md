# QA Review Pointer

> Nguồn duy nhất cho quy trình QA: `.agents/skills/qa-review/SKILL.md`.
Thực hiện review độc lập theo hướng dẫn trong skill:
1. Đọc Task Spec, diff (`git diff --name-only`), và task report.
2. Đánh giá 4 verdict: ACCEPT, ACCEPT WITH LIMITATIONS, CHANGES_REQUESTED, BLOCKED.
3. Bắt buộc chạy lại test suite; kiểm tra skip policy (`.agents/rules/80-testing.md`).
4. Ghi output tại `docs/agent-ops/reports/<TASK_ID>-qa-report.md`.
Không chấp nhận chỉ dựa vào lời agent tự báo done.