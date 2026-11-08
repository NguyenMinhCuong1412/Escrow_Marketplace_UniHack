---
trigger: model_decision
description: "Use for Git operations, folder structure, refactors, dependency changes, commits, and project documentation."
---

# Git, Structure and Documentation Rules

- Inspect `git status` and current branch before changes.
- Use isolated branch/worktree for independent code-writing agents.
- Each task lists owned files and no-touch paths; one writer per file at a time.
- Do not reset, clean, force-push, rewrite history, delete worktrees or merge without explicit authorization.
- Avoid unnecessary folders and one-file-per-concept explosion; mirror established repo conventions.
- Do not move/rename/delete files or run repo-wide formatting unless explicitly approved.
- Never track `.venv/`, `.env`, caches, build output, credentials or wallet files.
- Update docs when behavior/API/schema/state/config changes.
- Keep reports concise, evidence-based and traceable to task ID.
