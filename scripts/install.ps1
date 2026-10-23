# allfilesZ — quick installer for Windows (PowerShell 5.1+).
#   irm https://raw.githubusercontent.com/dinaxy148822822-create/allfilesZ/main/scripts/install.ps1 | iex
# Downloads the latest NSIS setup and runs it.
$ErrorActionPreference = 'Stop'

$Repo = 'dinaxy148822822-create/allfilesZ'
$ProgressPreference = 'SilentlyContinue'

function Say($m) { Write-Host "▸ $m" -ForegroundColor Cyan }
function Die($m) { Write-Host "✘ $m" -ForegroundColor Red; exit 1 }

$Arch = switch ($env:PROCESSOR_ARCHITECTURE) {
  'ARM64' { 'arm64' }
  default { 'x64' }
}

Say 'Fetching latest release…'
$rel = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
if (-not $rel) { Die 'Could not resolve latest release.' }
$ver = $rel.tag_name.TrimStart('v')
Say "Latest version: $ver"

$asset = $rel.assets | Where-Object { $_.name -eq "allfilesZ-$ver-setup-$Arch.exe" } | Select-Object -First 1
if (-not $asset) { $asset = $rel.assets | Where-Object { $_.name -like '*setup*x64.exe' } | Select-Object -First 1 }
if (-not $asset) { Die 'No Windows installer found in the latest release.' }

$tmp = Join-Path $env:TEMP $asset.name
Say "Downloading $($asset.name)…"
Invoke-WebRequest $asset.browser_download_url -OutFile $tmp

Say 'Launching installer…'
Start-Process -FilePath $tmp -Wait
Say 'Done.'
