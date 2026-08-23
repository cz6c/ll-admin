# 下载 Windows x64 FFmpeg essentials → src-tauri/resources/ffmpeg.exe
# 维护：pnpm run cs:ffmpeg-fetch（apps/admin）
# 来源：GyanD/codexffmpeg essentials（GPL）；仅用于 HEIC 解码

$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
$ResourcesDir = Join-Path $Root "src-tauri\resources"
$TargetExe = Join-Path $ResourcesDir "ffmpeg.exe"
$VendorDir = Join-Path $Root "src-tauri\vendor\ffmpeg"

# 9.0.1 essentials（GPL；含 libhevc 解码 HEIC）
$ZipUrl = "https://github.com/GyanD/codexffmpeg/releases/download/9.0.1/ffmpeg-9.0.1-essentials_build.zip"
$ZipName = "ffmpeg-9.0.1-essentials_build.zip"
$ZipPath = Join-Path $VendorDir $ZipName

$TargetProbe = Join-Path $ResourcesDir "ffprobe.exe"

Write-Host "[ffmpeg-fetch] target: $TargetExe" -ForegroundColor Cyan

if ((Test-Path $TargetExe) -and (Test-Path $TargetProbe)) {
  Write-Host "[ffmpeg-fetch] already exists, skip download" -ForegroundColor Green
  exit 0
}

New-Item -ItemType Directory -Force $ResourcesDir | Out-Null
New-Item -ItemType Directory -Force $VendorDir | Out-Null

if (-not (Test-Path $ZipPath)) {
  Write-Host "[ffmpeg-fetch] downloading essentials build (~110MB) ..." -ForegroundColor Yellow
  Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath
}

if (-not (Test-Path $ZipPath) -or (Get-Item $ZipPath).Length -lt 1MB) {
  if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
  throw "Download failed or archive too small: $ZipPath"
}

$ExtractDir = Join-Path $VendorDir "extract"
if (Test-Path $ExtractDir) {
  Remove-Item -Recurse -Force $ExtractDir
}
New-Item -ItemType Directory -Force $ExtractDir | Out-Null
Expand-Archive -Force -Path $ZipPath -DestinationPath $ExtractDir

$BundledExe = Get-ChildItem -Path $ExtractDir -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
if (-not $BundledExe) {
  throw "ffmpeg.exe not found inside extracted archive"
}

$BundledProbe = Get-ChildItem -Path $ExtractDir -Recurse -Filter "ffprobe.exe" | Select-Object -First 1
$TargetProbe = Join-Path $ResourcesDir "ffprobe.exe"

Copy-Item -Force $BundledExe.FullName $TargetExe
if ($BundledProbe) {
  Copy-Item -Force $BundledProbe.FullName $TargetProbe
  Write-Host "[ffmpeg-fetch] installed: $TargetProbe" -ForegroundColor Green
}
Write-Host "[ffmpeg-fetch] installed: $TargetExe ($((Get-Item $TargetExe).Length / 1MB) MB)" -ForegroundColor Green
