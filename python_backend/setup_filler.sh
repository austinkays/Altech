#!/usr/bin/env bash
# Altech EZLYNX Filler — one-time setup (macOS / Linux / WSL)
#
# Installs Playwright + Chromium so python_backend/ezlynx_filler.py can run.
# Run from repo root:  bash python_backend/setup_filler.sh

set -e

echo ">> Checking Python..."
if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: python3 not found. Install Python 3.9+ first."
    exit 1
fi
python3 --version

echo ">> Installing Playwright..."
python3 -m pip install --upgrade pip
python3 -m pip install playwright

echo ">> Downloading Chromium for Playwright..."
python3 -m playwright install chromium

echo ""
echo "================================================================"
echo "  Setup complete."
echo ""
echo "  Smoke test:"
echo "    cd $(pwd)"
echo "    python3 python_backend/ezlynx_filler.py \\"
echo "        --client sample_client_data.json \\"
echo "        --schema ezlynx_schema.json"
echo ""
echo "  Chromium will open. Log in to EZLYNX manually, navigate to"
echo "  the page you want to fill, then follow the script prompts."
echo ""
echo "  Walk these pages and write down per-page fill rate:"
echo "    1. Applicant / client info"
echo "    2. Auto policy info"
echo "    3. Drivers (single + multi-driver)"
echo "    4. Vehicles (single + multi-vehicle)"
echo "    5. Auto coverage"
echo "    6. Home dwelling info"
echo "    7. Home coverage"
echo ""
echo "  Report back to Claude with what filled / what skipped /"
echo "  what left dropdowns open, per page."
echo "================================================================"
