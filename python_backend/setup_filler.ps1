# Altech EZLYNX Filler — one-time setup (Windows / PowerShell)
#
# Installs Playwright + Chromium so python_backend/ezlynx_filler.py can run.
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File python_backend\setup_filler.ps1

$ErrorActionPreference = "Stop"

Write-Host ">> Checking Python..." -ForegroundColor Cyan
$pythonCmd = $null
foreach ($candidate in @("python", "py -3", "python3")) {
    try {
        $version = & cmd /c "$candidate --version 2>&1"
        if ($LASTEXITCODE -eq 0) {
            $pythonCmd = $candidate
            Write-Host "Found: $candidate -> $version"
            break
        }
    } catch {}
}
if (-not $pythonCmd) {
    Write-Host "ERROR: Python not found. Install Python 3.9+ from python.org." -ForegroundColor Red
    exit 1
}

Write-Host ">> Installing Playwright..." -ForegroundColor Cyan
& cmd /c "$pythonCmd -m pip install --upgrade pip"
& cmd /c "$pythonCmd -m pip install playwright"

Write-Host ">> Downloading Chromium for Playwright..." -ForegroundColor Cyan
& cmd /c "$pythonCmd -m playwright install chromium"

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  Setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "  Smoke test:"
Write-Host "    cd $(Get-Location)"
Write-Host "    $pythonCmd python_backend\ezlynx_filler.py ``"
Write-Host "        --client sample_client_data.json ``"
Write-Host "        --schema ezlynx_schema.json"
Write-Host ""
Write-Host "  Chromium will open. Log in to EZLYNX manually, navigate to"
Write-Host "  the page you want to fill, then follow the script prompts."
Write-Host ""
Write-Host "  Walk these pages and write down per-page fill rate:"
Write-Host "    1. Applicant / client info"
Write-Host "    2. Auto policy info"
Write-Host "    3. Drivers (single + multi-driver)"
Write-Host "    4. Vehicles (single + multi-vehicle)"
Write-Host "    5. Auto coverage"
Write-Host "    6. Home dwelling info"
Write-Host "    7. Home coverage"
Write-Host ""
Write-Host "  Report back to Claude with what filled / what skipped /"
Write-Host "  what left dropdowns open, per page."
Write-Host "================================================================" -ForegroundColor Green
