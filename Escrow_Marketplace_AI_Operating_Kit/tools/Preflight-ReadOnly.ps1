$ErrorActionPreference = 'Continue'
Write-Host '=== Escrow Marketplace Read-only Preflight ==='
Write-Host "Path: $(Get-Location)"

Write-Host "`n--- Expected modules ---"
@('backend', 'contracts', 'ai-pipeline', 'docs', '.venv', 'pytest.ini', 'requirements-dev.txt', '.gitignore') | ForEach-Object {
    if (Test-Path -LiteralPath $_) { Write-Host "[FOUND] $_" -ForegroundColor Green }
    else { Write-Host "[NOT FOUND] $_" -ForegroundColor Yellow }
}

Write-Host "`n--- Git repository ---"
$gitRoot = git rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -eq 0 -and $gitRoot) {
    Write-Host "Root: $gitRoot"
    Write-Host 'Branch:'
    git branch --show-current
    Write-Host 'Status:'
    git status --short
    Write-Host 'Worktrees:'
    git worktree list
} else {
    Write-Warning 'This folder is not currently detected as a Git repository. Do not enable parallel code-writing worktrees until Git is safely initialized and a baseline is recorded.'
}

Write-Host "`n--- Python / pytest availability ---"
if (Get-Command python -ErrorAction SilentlyContinue) {
    python --version
    python -m pytest --version 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Warning 'pytest is not available through the current Python interpreter. Do not install anything until Phase 0 checks the project environment.' }
} else { Write-Warning 'python command is not available in PATH.' }

Write-Host "`n--- Ignore checks ---"
if (git rev-parse --is-inside-work-tree 2>$null) {
    foreach ($candidate in @('.venv', '.env', '__pycache__')) {
        $ignored = git check-ignore $candidate 2>$null
        if ($LASTEXITCODE -eq 0 -and $ignored) { Write-Host "[IGNORED] $candidate" -ForegroundColor Green }
        else { Write-Warning "$candidate is not confirmed ignored by Git. Review .gitignore before staging files. No file contents were read." }
    }
}

Write-Host "`nPreflight finished. No files were changed, no package was installed, and no project tests were executed."
