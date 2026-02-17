"""
HawkSoft Accounting Export — Receipts Only

Automates the "To Be Exported" workflow in HawkSoft's trust accounting:
  1. Opens browser → you log in manually (bypasses 2FA)
  2. Filters table: checks Receipt rows, unchecks everything else
  3. Clicks EXPORT → DOWNLOAD popup → saves hawksoft_receipts.csv

Usage:
    python hawksoft_export.py
    python hawksoft_export.py --output custom_name.csv
"""

import argparse
import os
import sys
import time
from pathlib import Path

# Fix Windows console encoding for emoji/unicode characters
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
except ImportError:
    print(
        "ERROR: playwright is not installed.\n"
        "  Run:  pip install playwright && python -m playwright install chromium",
        file=sys.stderr,
    )
    sys.exit(1)


HAWKSOFT_URL = "https://accounting.hawksoft.app/to-be-exported"
DEFAULT_OUTPUT = "hawksoft_receipts.csv"


def filter_receipts(page) -> dict:
    """Check Receipt rows, uncheck everything else. Returns counts."""
    rows = page.locator("tbody tr")
    count = rows.count()
    stats = {"checked": 0, "unchecked": 0, "total": count}

    for i in range(count):
        row = rows.nth(i)
        row_text = row.inner_text()
        checkbox = row.locator("input[type='checkbox']").first

        if "Receipt" in row_text:
            if not checkbox.is_checked():
                checkbox.check()
            stats["checked"] += 1
            print(f"  [v] Row {i + 1}: Receipt -- checked")
        else:
            if checkbox.is_checked():
                checkbox.uncheck()
            stats["unchecked"] += 1
            print(f"  [x] Row {i + 1}: Skipped (not a Receipt)")

    return stats


def export_and_download(page, save_path: str):
    """Click EXPORT → wait for Download popup → click DOWNLOAD → save file."""
    with page.expect_download(timeout=30_000) as download_info:
        # Click the main EXPORT button (top-right)
        page.get_by_role("button", name="EXPORT").click()
        print("  Clicked EXPORT — waiting for download popup...")

        # The popup asks for a filename; click the blue DOWNLOAD button inside it
        download_btn = page.get_by_role("button", name="DOWNLOAD")
        download_btn.wait_for(state="visible", timeout=10_000)
        download_btn.click()
        print("  Clicked DOWNLOAD in popup...")

    download = download_info.value
    download.save_as(save_path)
    print(f"  File saved → {save_path}")


def run(output: str = DEFAULT_OUTPUT, username: str = "", password: str = ""):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        # ── Step 1: Navigate & login ─────────────────────────────────
        print(f"\n[*] Opening HawkSoft: {HAWKSOFT_URL}")
        page.goto(HAWKSOFT_URL, wait_until="domcontentloaded")

        # Auto-login if credentials provided
        if username and password:
            print("[*] Credentials provided -- attempting auto-login...")
            try:
                # Wait for login form to appear
                page.wait_for_selector('input', timeout=10_000)
                time.sleep(1)  # Let the page settle

                # Find and fill username field
                user_field = page.locator('input[type="text"], input[type="email"], input[name*="user" i], input[placeholder*="user" i]').first
                user_field.fill(username)
                print(f"  [v] Filled username: {username[:3]}***")

                # Find and fill password field
                pass_field = page.locator('input[type="password"]').first
                pass_field.fill(password)
                print("  [v] Filled password: ****")

                # Click sign in button
                sign_in = page.get_by_role("button", name="SIGN IN")
                sign_in.click()
                print("  [v] Clicked SIGN IN")

                # Wait a moment for login to process
                time.sleep(3)

                # Check if we landed on the dashboard or if 2FA / error appeared
                current_url = page.url
                if "signin" in current_url.lower() or "login" in current_url.lower():
                    print("  [!] Still on login page -- 2FA or error may be showing.")
                    input(
                        "\n+--------------------------------------------------+\n"
                        "|  Complete 2FA or fix login in the browser.        |\n"
                        "|  Press ENTER here once you see the dashboard.     |\n"
                        "+--------------------------------------------------+\n"
                        ">>> "
                    )
                else:
                    print("  [v] Login appears successful!")
                    # Navigate to the export page if redirected elsewhere
                    if "to-be-exported" not in page.url:
                        print(f"  [*] Navigating to export page...")
                        page.goto(HAWKSOFT_URL, wait_until="domcontentloaded")
                        time.sleep(2)

            except Exception as e:
                print(f"  [!] Auto-login failed: {e}")
                print("  [!] Falling back to manual login.")
                input(
                    "\n+--------------------------------------------------+\n"
                    "|  LOG IN manually (handle 2FA if needed).          |\n"
                    "|  Press ENTER here once you see the dashboard.     |\n"
                    "+--------------------------------------------------+\n"
                    ">>> "
                )
        else:
            print("[*] No credentials provided -- manual login required.")
            input(
                "\n+--------------------------------------------------+\n"
                "|  LOG IN manually (handle 2FA if needed).          |\n"
                "|  Press ENTER here once you see the dashboard.     |\n"
                "+--------------------------------------------------+\n"
                ">>> "
            )

        # ── Step 2: Filter table ────────────────────────────────────
        print("\n[+] Filtering table -- Receipts only...")
        try:
            page.wait_for_selector("tbody tr", timeout=15_000)
        except PWTimeout:
            print("ERROR: No table rows found. Are you on the right page?", file=sys.stderr)
            browser.close()
            sys.exit(1)

        stats = filter_receipts(page)
        print(
            f"\n   Summary: {stats['checked']} receipts selected, "
            f"{stats['unchecked']} skipped, {stats['total']} total rows"
        )

        # ── Step 3: Export & download ───────────────────────────────
        print("\n[>] Exporting...")
        try:
            export_and_download(page, output)
        except PWTimeout:
            print("ERROR: Download timed out. The popup may not have appeared.", file=sys.stderr)
            browser.close()
            sys.exit(1)

        print(f"\n[OK] SUCCESS -- {output}")

        time.sleep(2)
        browser.close()


def main():
    parser = argparse.ArgumentParser(
        description="Export HawkSoft Receipts to CSV (auto or manual login, automated filter & download)"
    )
    parser.add_argument(
        "-o", "--output",
        default=DEFAULT_OUTPUT,
        help=f"Output filename (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "-u", "--username",
        default="",
        help="HawkSoft username/email for auto-login",
    )
    parser.add_argument(
        "-p", "--password",
        default="",
        help="HawkSoft password for auto-login",
    )
    args = parser.parse_args()
    run(output=args.output, username=args.username, password=args.password)


if __name__ == "__main__":
    main()
