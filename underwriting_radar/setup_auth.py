"""
setup_auth.py — one-time session bootstrap for the Underwriting Radar.

Run this LOCALLY on a machine with a real display. It opens a Chromium window
pointed at the carrier's login page; you log in by hand (including 2FA, SSO,
captcha, whatever the portal throws at you), navigate to confirm you can see
the manuals page, then come back to the terminal and press ENTER. The script
captures the full Playwright `storage_state` (cookies + localStorage + IndexedDB
keys it can serialize) and writes it to disk.

Why this approach?
  - Most carrier portals (Travelers, Progressive, Liberty, Nationwide, ...) sit
    behind 2FA, SSO, device fingerprinting, or risk-scoring login flows that
    will block any automated username/password submission.
  - A persisted `storage_state` is the same set of credentials your real
    browser holds after a successful login. Playwright re-attaches them to a
    fresh context on every run, so the radar starts already authenticated.
  - Sessions usually live anywhere from a few hours to a few weeks. The radar
    detects login walls (see radar.py:looks_like_login) and fires an alert so
    you know when to re-run this script.

Typical usage:
    python setup_auth.py \\
        --url https://agent.travelers.com/login \\
        --out states/travelers.json

Then run radar.py with a config that points its `state_file` at the saved file.
"""

import argparse
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright


async def capture_session(start_url: str, out_path: Path, user_agent: str | None) -> None:
    """Open a real browser, wait for the user to confirm they're logged in,
    then dump the storage state to `out_path`."""
    async with async_playwright() as p:
        # headless=False is the entire point — we need a real window for the
        # human to interact with the login flow.
        browser = await p.chromium.launch(headless=False)

        # Carriers fingerprint heavily. If a custom UA is needed, plumb it
        # through both here AND in radar.py so the second visit "looks the
        # same" as the first one. Mismatched UAs commonly invalidate sessions.
        ctx_kwargs: dict = {}
        if user_agent:
            ctx_kwargs["user_agent"] = user_agent

        context = await browser.new_context(**ctx_kwargs)
        page = await context.new_page()
        await page.goto(start_url)

        print()
        print(f"Browser opened at: {start_url}")
        print("  1) Sign in (handle 2FA / SSO / etc. as you normally would).")
        print("  2) Navigate to the manuals page you want the radar to scan.")
        print("  3) Confirm the PDFs are visible to you.")
        print("  4) Come back here and press ENTER to save the session.")
        print()

        # asyncio.to_thread keeps Playwright's event loop responsive while we
        # block on input(). Without this, the browser feels frozen.
        await asyncio.to_thread(input, "Press ENTER when fully logged in: ")

        out_path.parent.mkdir(parents=True, exist_ok=True)
        await context.storage_state(path=str(out_path))

        print()
        print(f"Saved storage state to: {out_path.resolve()}")
        print("Treat this file like a password — anyone with it can act as you.")
        print()

        await browser.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Capture a logged-in browser session for the Underwriting Radar."
    )
    parser.add_argument(
        "--url",
        required=True,
        help="Login URL to start at (e.g. https://agent.travelers.com/login)",
    )
    parser.add_argument(
        "--out",
        default="states/state.json",
        help="Where to write the storage_state JSON (default: states/state.json)",
    )
    parser.add_argument(
        "--user-agent",
        default=None,
        help="Optional custom User-Agent string. Must match the value used in radar.py.",
    )
    args = parser.parse_args()

    out_path = Path(args.out)
    if out_path.exists():
        # Don't silently overwrite — the existing file might still be valid.
        confirm = input(f"{out_path} already exists. Overwrite? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return 1

    asyncio.run(capture_session(args.url, out_path, args.user_agent))
    return 0


if __name__ == "__main__":
    sys.exit(main())
