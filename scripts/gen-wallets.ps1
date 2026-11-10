# Tao 2 vi Fuji (Deployer + AI Agent), ghi key thang vao .env.
# KHONG in private key ra man hinh. Chay tu thu muc goc repo:
#   powershell -ExecutionPolicy Bypass -File scripts\gen-wallets.ps1
#
# Private key sinh bang CSPRNG cua .NET. `cast` chi dung de suy ra address
# (khong phu thuoc format/stream output cua `cast wallet new`).
param([switch]$Force)
$ErrorActionPreference = "Stop"

$cast = Get-Command cast -ErrorAction SilentlyContinue
if ($cast) { $cast = $cast.Source } else { $cast = "$env:USERPROFILE\.foundry\bin\cast.exe" }
if (-not (Test-Path $cast)) { throw "Khong tim thay cast. Kiem tra Foundry da cai chua." }

$contractsEnv = Join-Path $PSScriptRoot "..\contracts\.env"
$backendEnv   = Join-Path $PSScriptRoot "..\backend\.env"
$utf8 = New-Object System.Text.UTF8Encoding($false)

function New-PrivateKey {
    # 32 byte ngau nhien, hop le voi secp256k1: khac 0 va < n.
    # Moi key >= n deu bat dau bang 15 byte 0xFF -> loai truong hop do.
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        do {
            $b = New-Object byte[] 32
            $rng.GetBytes($b)
            $allZero = @($b | Where-Object { $_ -ne 0 }).Count -eq 0
            $tooBig  = @($b[0..14] | Where-Object { $_ -ne 0xFF }).Count -eq 0
        } while ($allZero -or $tooBig)
    } finally { $rng.Dispose() }
    return "0x" + (($b | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Get-Address([string]$pk) {
    # Gom ca stdout + stderr; KHONG in $out (phong truong hop cast echo key khi loi).
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { $out = (& $cast wallet address --private-key $pk 2>&1 | ForEach-Object { "$_" }) -join "`n" }
    finally { $ErrorActionPreference = $prev }
    $m = [regex]::Match($out, '(?m)^\s*(0x[0-9a-fA-F]{40})\s*$')
    if (-not $m.Success) { throw "cast wallet address that bai (exit code $LASTEXITCODE)." }
    return $m.Groups[1].Value
}

function New-Wallet {
    $pk = New-PrivateKey
    return @{ Address = (Get-Address $pk); Key = $pk }
}

function Set-EnvVar([string]$path, [string]$name, [string]$value) {
    $text = [IO.File]::ReadAllText($path)
    $pattern = "(?m)^$name=.*$"
    if ($text -notmatch $pattern) { throw "Khong thay dong $name= trong $path" }
    $text = [regex]::Replace($text, $pattern, "$name=$value")
    [IO.File]::WriteAllText($path, $text, $utf8)
}

# Chong ghi de key da co
$existing = [regex]::Match([IO.File]::ReadAllText($contractsEnv), '(?m)^PRIVATE_KEY=(\S+)').Groups[1].Value
if ($existing -and -not $Force) { throw "contracts\.env da co PRIVATE_KEY. Them -Force neu muon tao lai." }

$deployer = New-Wallet
$agent    = New-Wallet
if ($deployer.Address -eq $agent.Address) { throw "Hai vi trung nhau (khong the xay ra) - chay lai." }

Set-EnvVar $contractsEnv "PRIVATE_KEY"       $deployer.Key
Set-EnvVar $contractsEnv "AGENT_ADDRESS"     $agent.Address
Set-EnvVar $backendEnv   "AGENT_PRIVATE_KEY" $agent.Key

# Tu kiem tra: doc lai key tu file, suy ra address, so khop
$chkDeployer = Get-Address ([regex]::Match([IO.File]::ReadAllText($contractsEnv), '(?m)^PRIVATE_KEY=(\S+)').Groups[1].Value)
$chkAgent    = Get-Address ([regex]::Match([IO.File]::ReadAllText($backendEnv),   '(?m)^AGENT_PRIVATE_KEY=(\S+)').Groups[1].Value)
if ($chkDeployer -ne $deployer.Address -or $chkAgent -ne $agent.Address) { throw "Self-check FAIL: key trong .env khong khop address." }

Write-Host ""
Write-Host "Da ghi key vao contracts\.env va backend\.env (khong in key). Self-check OK." -ForegroundColor Green
Write-Host "Deployer address : $($deployer.Address)"
Write-Host "AI Agent address : $($agent.Address)"
Write-Host ""
Write-Host "-> Chuyen AVAX (C-Chain) tu Core: 0.25 -> Deployer, 0.15 -> AI Agent"
Write-Host "-> BACKUP contracts\.env va backend\.env ra ngoai repo."
