---
name: project-discovery
description: Performs a read-only discovery of the Escrow Marketplace repository, maps modules and dependencies, and prepares evidence-based assessment findings before implementation.
---

# Project Discovery Skill

## Use when

The user asks to understand the repository, assess the current state, map architecture, identify gaps, or prepare the first backlog.

## Procedure

1. Read `AGENTS.md` and all canonical context files under `docs/context/`.
2. Inspect `git status`, current branch and repo root.
3. Map folders, entry points, runtime, dependencies, test files, configuration and external integrations. Exclude `.venv`, caches, build artifacts and secret values.
4. Inspect `backend/`, `contracts/`, `ai-pipeline/` and any frontend if present.
5. Record evidence with path/line/section. Separate confirmed facts, assumptions, proposals and unknowns.
6. Identify mismatches between requirements, docs and implementation.
7. Do not change application code, install dependencies, migrate data or deploy.
8. Write reports only to the authorized report folder if the task permits it.

## Output

- Architecture map.
- Module inventory and toolchain.
- Current test commands and status.
- Prioritized risks/gaps.
- Open questions for Project Owner.
- Backlog proposals with dependencies and acceptance criteria.
