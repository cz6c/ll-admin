# PyInstaller build — icloud-sync-agent.exe → src-tauri/resources/
# Maintainer flow: see README.md; invoked by `pnpm run cs:sidecar-build` from apps/admin.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$Root = $PSScriptRoot
$Dist = Join-Path $Root "dist"
$ExeName = "icloud-sync-agent.exe"
$AgentPy = Join-Path $Root "agent.py"
$ProtocolPy = Join-Path $Root "protocol.py"
$Requirements = Join-Path $Root "requirements.txt"
$VenvDir = Join-Path $Root ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$PyInstaller = Join-Path $VenvDir "Scripts\pyinstaller.exe"
$ResourcesDir = Join-Path $Root "..\..\src-tauri\resources"
$ResourceExe = Join-Path $ResourcesDir $ExeName

Write-Host "[icloud-sync] build.ps1 — PyInstaller one-file build" -ForegroundColor Cyan

foreach ($path in @($AgentPy, $ProtocolPy, $Requirements)) {
    if (-not (Test-Path $path)) {
        throw "Missing prerequisite: $path"
    }
}

if (-not (Test-Path $VenvPython)) {
    Write-Host "Creating venv at $VenvDir ..." -ForegroundColor Yellow
    & py -3 -m venv $VenvDir
    if (-not (Test-Path $VenvPython)) {
        throw "Failed to create venv. Install Python 3.11+ and ensure 'py -3' works."
    }
}

$VendorRoot = Join-Path $Root "vendor"
$VendorZip = Join-Path $VendorRoot "icloudpd-v1.32.3.zip"
$VendorExtract = Join-Path $VendorRoot "icloud_photos_downloader-1.32.3"
$VendorSrc = Join-Path $VendorExtract "src"

if (-not (Test-Path $VendorSrc)) {
    Write-Host "Fetching icloudpd v1.32.3 vendor (pyicloud_ipd) ..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force $VendorRoot | Out-Null
    if (-not (Test-Path $VendorZip)) {
        Invoke-WebRequest -Uri "https://github.com/icloud-photos-downloader/icloud_photos_downloader/archive/refs/tags/v1.32.3.zip" -OutFile $VendorZip
    }
    Expand-Archive -Force -Path $VendorZip -DestinationPath $VendorRoot
    if (-not (Test-Path $VendorSrc)) {
        throw "Vendor extract failed: $VendorSrc missing"
    }
}

Write-Host "Installing/updating sidecar dependencies + PyInstaller ..." -ForegroundColor Yellow
& $VenvPython -m pip install -q -r $Requirements pyinstaller

& $PyInstaller `
    --onefile `
    --name icloud-sync-agent `
    --clean `
    --distpath $Dist `
    --workpath (Join-Path $Root "build") `
    --specpath $Root `
    --paths $VendorSrc `
    --collect-submodules pyicloud_ipd `
    --collect-submodules foundation `
    --hidden-import pyicloud_ipd.base `
    --collect-data certifi `
    $AgentPy

$BuiltExe = Join-Path $Dist $ExeName
if (-not (Test-Path $BuiltExe)) {
    throw "Build failed: $BuiltExe missing"
}

New-Item -ItemType Directory -Force $ResourcesDir | Out-Null
Copy-Item $BuiltExe $ResourceExe -Force

$SizeMb = [math]::Round((Get-Item $ResourceExe).Length / 1MB, 1)
Write-Host "Built: $ResourceExe ($SizeMb MB)" -ForegroundColor Green

Write-Host "Smoke: version handshake ..." -ForegroundColor Yellow
$versionOut = ('{"cmd":"version"}' | & $ResourceExe | Out-String).Trim()
Write-Host $versionOut

try {
    $versionJson = $versionOut | ConvertFrom-Json
} catch {
    throw "Version handshake failed: invalid JSON output: $versionOut"
}

if ($versionJson.type -ne "version" -or [int]$versionJson.protocol -ne 1) {
    throw "Version handshake failed: expected type=version protocol=1, got: $versionOut"
}

Write-Host "Smoke OK: type=version protocol=1" -ForegroundColor Green
