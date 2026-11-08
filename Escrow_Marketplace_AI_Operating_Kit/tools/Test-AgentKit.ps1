$ErrorActionPreference = 'Stop'

$required = @(
    'AGENTS.md', '00_READ_ME_FIRST.md',
    'guides/01_SETUP_COWORK_ANTIGRAVITY.md', 'guides/02_IMPORT_OLD_CHATS.md',
    'guides/03_PROJECT_KNOWLEDGE_BASE.md', 'guides/04_AGENT_ROLES.md',
    'guides/05_RULES_AND_STANDARDS.md', 'guides/06_WORKFLOW_AND_QA_GATES.md',
    'guides/07_FIRST_RUN_AND_COMMANDS.md', 'guides/08_MAINTENANCE.md',
    'guides/09_OFFICIAL_REFERENCES.md',
    'docs/context/PROJECT_BRIEF.md', 'docs/context/COMPETITION_CONTEXT.md',
    'docs/context/PRODUCT_VISION.md', 'docs/context/BUSINESS_REQUIREMENTS.md',
    'docs/context/TECH_STACK.md', 'docs/context/DECISION_LOG.md',
    'docs/context/OPEN_QUESTIONS.md', 'docs/context/CURRENT_STATUS.md',
    'docs/agent-ops/COWORK_PROJECT_INSTRUCTIONS.md',
    'docs/agent-ops/PHASE_0_DISCOVERY_PROMPT.md',
    'docs/agent-ops/CHAT_EXTRACTION_PROMPT.md',
    'docs/agent-ops/CONTEXT_CONSOLIDATION_PROMPT.md',
    'docs/agent-ops/TASK_TEMPLATE.md',
    '.agents/rules/10-product-scope.md', '.agents/rules/20-architecture.md',
    '.agents/rules/30-backend.md', '.agents/rules/40-smart-contract.md',
    '.agents/rules/50-ai-pipeline.md', '.agents/rules/60-ui-ux.md',
    '.agents/rules/70-security.md', '.agents/rules/80-testing.md',
    '.agents/rules/90-git-docs.md',
    '.agents/skills/project-discovery/SKILL.md',
    '.agents/skills/implement-task/SKILL.md',
    '.agents/skills/qa-review/SKILL.md'
)

$missing = @()
foreach ($item in $required) {
    if (-not (Test-Path -LiteralPath $item)) { $missing += $item }
}

$ruleFiles = Get-ChildItem -LiteralPath '.agents/rules' -Filter '*.md' -File -ErrorAction SilentlyContinue
$badRules = @()
foreach ($file in $ruleFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    if ($content -notmatch '(?m)^---\s*\r?\ntrigger:\s*(always_on|model_decision|glob|manual)\s*\r?\n') {
        $badRules += $file.Name
    }
}

$skillFiles = Get-ChildItem -Path '.agents/skills/*/SKILL.md' -File -ErrorAction SilentlyContinue

Write-Host '=== Escrow Marketplace Agent Kit Check ==='
if ($missing.Count -eq 0) { Write-Host '[PASS] Required files exist.' -ForegroundColor Green }
else { Write-Host '[FAIL] Missing required files:' -ForegroundColor Red; $missing | ForEach-Object { Write-Host " - $_" } }

if ($badRules.Count -eq 0) { Write-Host '[PASS] Rule frontmatter uses a supported trigger.' -ForegroundColor Green }
else { Write-Host '[FAIL] Invalid rule frontmatter:' -ForegroundColor Red; $badRules | ForEach-Object { Write-Host " - $_" } }

if ($skillFiles.Count -ge 3) { Write-Host "[PASS] Found $($skillFiles.Count) Agent Skills." -ForegroundColor Green }
else { Write-Host "[WARN] Found $($skillFiles.Count) Agent Skills; expected at least 3." -ForegroundColor Yellow }

if ($missing.Count -gt 0 -or $badRules.Count -gt 0 -or $skillFiles.Count -lt 3) { exit 1 }
Write-Host '[PASS] Kit structure is valid. This script did not modify project source or run application tests.' -ForegroundColor Green
