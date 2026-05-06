"""
radar.py — Underwriting Radar.

Monitors carrier portals for updated underwriting / product-guide PDFs.

Flow per carrier (see check_carrier):
    1. Load the carrier's saved Playwright storage_state from disk
       (produced by setup_auth.py). If missing, alert and skip.
    2. Open a fresh browser context with that state, navigate to the manuals
       page, and check whether we're still authenticated. If we hit a login
       wall, alert ("session_expired") and stop — the human needs to re-run
       setup_auth.py.
    3. Locate the target PDF anchor by text-substring or href-regex match.
    4. Cheap change detection: HEAD the PDF URL and compare ETag /
       Last-Modified / final-URL against what we stored last time.
    5. If anything cheap changed (or this is a brand-new carrier), download
       the PDF and SHA-256 it. Compare hash to the previous run.
       - Identical hash    -> false alarm; update bookkeeping, drop the file.
       - New hash          -> save with timestamped filename, fire
                              "pdf_updated" alert, record new state.
    6. Errors are caught per-carrier so one broken portal doesn't take down
       the whole run. A failure fires an "error" alert with the message.

Designed to run on a schedule: nightly cron, Cloud Scheduler -> Cloud Run Job,
GitHub Actions schedule, etc. Idempotent and safe to run repeatedly.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import logging
import os
import re
import smtplib
import sqlite3
import sys
from contextlib import contextmanager
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Iterator, Optional

import httpx
import yaml
from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    TimeoutError as PWTimeout,
    async_playwright,
)


LOG = logging.getLogger("radar")


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #


class CarrierConfig:
    """One entry in config.yaml's `carriers:` list.

    Required keys: key, name, url, state_file, and at least one of
    pdf_match.text_contains / pdf_match.href_pattern.
    """

    __slots__ = (
        "key",
        "name",
        "state",
        "line",
        "url",
        "state_file",
        "pdf_text_contains",
        "pdf_href_pattern",
        "login_url_markers",
        "login_text_markers",
        "wait_selector",
    )

    def __init__(self, raw: dict[str, Any]):
        self.key: str = raw["key"]                              # e.g. "travelers_auto_wa"
        self.name: str = raw["name"]                            # human-readable
        self.state: str = raw.get("state", "")
        self.line: str = raw.get("line", "")
        self.url: str = raw["url"]
        self.state_file: str = raw["state_file"]

        match_cfg = raw.get("pdf_match", {}) or {}
        self.pdf_text_contains: Optional[str] = match_cfg.get("text_contains")
        self.pdf_href_pattern: Optional[str] = match_cfg.get("href_pattern")
        if not self.pdf_text_contains and not self.pdf_href_pattern:
            raise ValueError(
                f"carrier {self.key!r}: pdf_match needs text_contains or href_pattern"
            )

        login_cfg = raw.get("login_indicators", {}) or {}
        self.login_url_markers: list[str] = login_cfg.get("url_contains", []) or []
        self.login_text_markers: list[str] = login_cfg.get("text_contains", []) or []

        # Optional CSS selector to wait for before scraping. Useful when the
        # manuals page renders link list async (SPAs, lazy tables).
        self.wait_selector: Optional[str] = raw.get("wait_selector")


def load_config(path: Path) -> tuple[list[CarrierConfig], dict]:
    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    carriers = [CarrierConfig(c) for c in (raw.get("carriers") or [])]
    settings = raw.get("settings", {}) or {}
    return carriers, settings


# --------------------------------------------------------------------------- #
# State DB (SQLite)
# --------------------------------------------------------------------------- #
#
# A single-table SQLite file holds the last-known fingerprint per carrier so
# we can tell "changed" from "unchanged" between runs. We chose SQLite over a
# JSON blob for atomic writes and so the file survives a process kill mid-run.


@contextmanager
def state_db(path: Path) -> Iterator[sqlite3.Connection]:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pdf_state (
            carrier_key    TEXT PRIMARY KEY,
            last_url       TEXT,
            last_etag      TEXT,
            last_modified  TEXT,
            last_sha256    TEXT,
            last_filename  TEXT,
            last_check_at  TEXT,
            last_change_at TEXT
        )
        """
    )
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_prior_state(conn: sqlite3.Connection, key: str) -> Optional[dict]:
    row = conn.execute(
        "SELECT * FROM pdf_state WHERE carrier_key = ?", (key,)
    ).fetchone()
    return dict(row) if row else None


def upsert_state(conn: sqlite3.Connection, key: str, fields: dict) -> None:
    """UPSERT only the columns provided in `fields`. Never overwrites a column
    you didn't pass — so a "no change" run can update last_check_at without
    blanking last_sha256."""
    cols = ["carrier_key"] + list(fields.keys())
    placeholders = ",".join(["?"] * len(cols))
    updates = ",".join(f"{k}=excluded.{k}" for k in fields)
    sql = (
        f"INSERT INTO pdf_state ({','.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT(carrier_key) DO UPDATE SET {updates}"
    )
    conn.execute(sql, [key] + list(fields.values()))


# --------------------------------------------------------------------------- #
# Alerting
# --------------------------------------------------------------------------- #


async def post_webhook(url: str, payload: dict) -> None:
    """POST a JSON payload. Works as-is for Slack incoming webhooks (use the
    `text` field), Discord, Microsoft Teams, n8n, Make, Zapier, or any custom
    HTTP receiver. We don't shape the payload to a specific provider so this
    stays portable — the user's webhook can transform it downstream.
    """
    if not url:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
    except Exception as exc:  # pragma: no cover - external system
        LOG.exception("webhook alert failed: %s", exc)


def send_email(settings: dict, subject: str, body: str) -> None:
    """Optional SMTP fallback — only fires if smtp_host is set."""
    host = settings.get("smtp_host")
    if not host:
        return
    msg = EmailMessage()
    msg["From"] = settings.get("smtp_from", "")
    msg["To"] = settings.get("smtp_to", "")
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP_SSL(host, int(settings.get("smtp_port", 465))) as smtp:
            user = settings.get("smtp_user")
            pwd = settings.get("smtp_pass")
            if user and pwd:
                smtp.login(user, pwd)
            smtp.send_message(msg)
    except Exception as exc:  # pragma: no cover - external system
        LOG.exception("SMTP alert failed: %s", exc)


async def alert(
    settings: dict, kind: str, carrier: CarrierConfig, detail: dict
) -> None:
    """Fire all configured channels (webhook + optional email) for one event.

    `kind` is one of: pdf_updated | session_expired | pdf_not_found |
    missing_state | error. Downstream automations can route on it.
    """
    payload = {
        "kind": kind,
        "carrier_key": carrier.key,
        "carrier_name": carrier.name,
        "state": carrier.state,
        "line": carrier.line,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "detail": detail,
    }
    LOG.info("alert [%s] %s :: %s", kind, carrier.name, detail)
    await post_webhook(settings.get("webhook_url", ""), payload)

    subject = f"[Underwriting Radar] {kind} — {carrier.name}"
    body_lines = [f"{k}: {v}" for k, v in payload.items() if k != "detail"]
    body_lines.append("")
    body_lines.append("Detail:")
    for k, v in detail.items():
        body_lines.append(f"  {k}: {v}")
    send_email(settings, subject, "\n".join(body_lines))


# --------------------------------------------------------------------------- #
# Page-level helpers
# --------------------------------------------------------------------------- #


def looks_like_login(page_url: str, page_html: str, carrier: CarrierConfig) -> bool:
    """Cheap heuristic: did the carrier bounce us to a login page?

    We check the URL first (login pages usually have /login or /signin in the
    path), then fall back to text markers in the rendered HTML for portals
    that overlay a login modal on the same URL.
    """
    url_l = page_url.lower()
    if any(marker.lower() in url_l for marker in carrier.login_url_markers):
        return True
    html_l = page_html.lower()
    return any(marker.lower() in html_l for marker in carrier.login_text_markers)


async def find_target_pdf(
    page: Page, carrier: CarrierConfig
) -> Optional[dict]:
    """Find the first <a> on the page matching ALL configured filters.

    Filters are AND-combined: if both text_contains and href_pattern are set,
    both must match the same anchor. This avoids the "wrong PDF on the page"
    failure mode (e.g. picking up a dwelling fire guide when you wanted auto).
    """
    # Pulling href + textContent in a single evaluate_all is much cheaper than
    # iterating via locators when the page has hundreds of links.
    anchors = await page.locator("a").evaluate_all(
        "els => els.map(a => ({ href: a.href, text: (a.textContent || '').trim() }))"
    )

    href_re = (
        re.compile(carrier.pdf_href_pattern, re.IGNORECASE)
        if carrier.pdf_href_pattern
        else None
    )
    needle = (carrier.pdf_text_contains or "").lower()

    for a in anchors:
        href = a.get("href") or ""
        text_l = (a.get("text") or "").lower()

        if href_re and not href_re.search(href):
            continue
        if needle and needle not in text_l:
            continue
        # Both filters either matched or weren't configured — but at least one
        # was configured (validated in CarrierConfig.__init__), so this is a
        # legitimate match.
        return a

    return None


async def head_metadata(
    client: httpx.AsyncClient, url: str, cookies: dict[str, str]
) -> dict:
    """HEAD the PDF and pull change-detection headers. Returns {} on failure
    so callers can fall back to a full GET + hash."""
    try:
        resp = await client.head(url, cookies=cookies, follow_redirects=True)
        return {
            "etag": resp.headers.get("etag"),
            "last_modified": resp.headers.get("last-modified"),
            "final_url": str(resp.url),
        }
    except Exception as exc:
        LOG.warning("HEAD failed for %s: %s", url, exc)
        return {}


async def download_pdf(
    client: httpx.AsyncClient,
    url: str,
    cookies: dict[str, str],
    dest: Path,
) -> str:
    """Download to `dest` and return the SHA-256 hex digest of the body."""
    resp = await client.get(url, cookies=cookies, follow_redirects=True)
    resp.raise_for_status()
    body = resp.content
    sha = hashlib.sha256(body).hexdigest()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(body)
    return sha


def slugify(value: str) -> str:
    """Filesystem-safe slug. Used to build deterministic filenames like
    Travelers_Auto_WA_20260505_141203.pdf."""
    return re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")


def build_filename(carrier: CarrierConfig, when: datetime) -> str:
    parts = [slugify(carrier.name)]
    if carrier.line:
        parts.append(slugify(carrier.line))
    if carrier.state:
        parts.append(slugify(carrier.state))
    parts.append(when.strftime("%Y%m%d_%H%M%S"))
    return "_".join(p for p in parts if p) + ".pdf"


# --------------------------------------------------------------------------- #
# Per-carrier flow
# --------------------------------------------------------------------------- #


async def check_carrier(
    browser: Browser,
    carrier: CarrierConfig,
    settings: dict,
    conn: sqlite3.Connection,
    staging_dir: Path,
) -> None:
    state_path = Path(carrier.state_file)
    if not state_path.exists():
        # No saved session — nothing we can do unattended. Alert and bail so
        # the operator knows to run setup_auth.py for this carrier.
        LOG.error(
            "[%s] missing state file %s — run setup_auth.py first",
            carrier.key,
            state_path,
        )
        await alert(
            settings,
            "missing_state",
            carrier,
            {"state_file": str(state_path)},
        )
        return

    context: BrowserContext = await browser.new_context(
        storage_state=str(state_path)
    )
    page = await context.new_page()
    try:
        LOG.info("[%s] -> %s", carrier.key, carrier.url)
        await page.goto(carrier.url, wait_until="domcontentloaded", timeout=45_000)

        # Optional: wait for a known selector before scraping (SPAs, lazy
        # loaders). networkidle is unreliable on portals that long-poll.
        if carrier.wait_selector:
            try:
                await page.wait_for_selector(carrier.wait_selector, timeout=15_000)
            except PWTimeout:
                LOG.warning(
                    "[%s] wait_selector %r never appeared",
                    carrier.key,
                    carrier.wait_selector,
                )
        else:
            try:
                await page.wait_for_load_state("networkidle", timeout=10_000)
            except PWTimeout:
                pass

        html = await page.content()

        # Detect logged-out state — session expired or got revoked.
        if looks_like_login(page.url, html, carrier):
            LOG.warning("[%s] hit login wall — session expired", carrier.key)
            await alert(
                settings,
                "session_expired",
                carrier,
                {"url": page.url, "state_file": str(state_path)},
            )
            return

        match = await find_target_pdf(page, carrier)
        if not match:
            LOG.warning(
                "[%s] no PDF matching filters at %s", carrier.key, carrier.url
            )
            await alert(
                settings,
                "pdf_not_found",
                carrier,
                {
                    "url": carrier.url,
                    "text_contains": carrier.pdf_text_contains,
                    "href_pattern": carrier.pdf_href_pattern,
                },
            )
            return

        pdf_url: str = match["href"]
        LOG.info("[%s] candidate PDF %s", carrier.key, pdf_url)

        # Pull the live cookie jar from the authenticated context so httpx
        # can fetch the PDF as the same user. Without this, the PDF host
        # often returns the login page instead of binary content.
        live_cookies = await context.cookies()
        cookie_jar = {c["name"]: c["value"] for c in live_cookies}

        async with httpx.AsyncClient(
            timeout=60,
            headers={"User-Agent": "UnderwritingRadar/1.0"},
        ) as client:
            meta = await head_metadata(client, pdf_url, cookie_jar)

            prior = get_prior_state(conn, carrier.key) or {}
            now_iso = datetime.now(timezone.utc).isoformat()

            url_changed = pdf_url != (prior.get("last_url") or "")
            etag = meta.get("etag")
            etag_changed = bool(etag) and etag != prior.get("last_etag")
            mtime = meta.get("last_modified")
            mtime_changed = bool(mtime) and mtime != prior.get("last_modified")

            cheap_signal_changed = url_changed or etag_changed or mtime_changed
            first_run = not prior

            # Optimization: if we have prior state and nothing cheap changed,
            # skip the download. Most runs land here.
            if not first_run and not cheap_signal_changed:
                LOG.info("[%s] no change", carrier.key)
                upsert_state(conn, carrier.key, {"last_check_at": now_iso})
                return

            # Either first run or something cheap changed — confirm with a
            # full download + hash. Some carrier CDNs strip ETag/Last-Modified,
            # so this is the source of truth.
            stamp_dt = datetime.now()
            fname = build_filename(carrier, stamp_dt)
            dest = staging_dir / fname
            sha = await download_pdf(client, pdf_url, cookie_jar, dest)

            if prior.get("last_sha256") == sha:
                # Cheap signals lied (CDN edge cache rotation, query-string
                # cache buster, etc). Hash matches -> no real change.
                LOG.info("[%s] hash unchanged after download (false alarm)", carrier.key)
                dest.unlink(missing_ok=True)
                upsert_state(
                    conn,
                    carrier.key,
                    {
                        "last_url": pdf_url,
                        "last_etag": etag,
                        "last_modified": mtime,
                        "last_check_at": now_iso,
                    },
                )
                return

            # Real change. Record + alert.
            upsert_state(
                conn,
                carrier.key,
                {
                    "last_url": pdf_url,
                    "last_etag": etag,
                    "last_modified": mtime,
                    "last_sha256": sha,
                    "last_filename": fname,
                    "last_check_at": now_iso,
                    "last_change_at": now_iso,
                },
            )
            await alert(
                settings,
                "pdf_updated",
                carrier,
                {
                    "filename": fname,
                    "saved_to": str(dest.resolve()),
                    "pdf_url": pdf_url,
                    "etag": etag,
                    "last_modified": mtime,
                    "sha256": sha,
                    "previous_sha256": prior.get("last_sha256"),
                    "first_run": first_run,
                },
            )
    finally:
        await context.close()


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #


def overlay_env_secrets(settings: dict) -> dict:
    """Let env vars override settings file values so secrets stay out of YAML.
    The radar reads RADAR_WEBHOOK_URL and RADAR_SMTP_* at runtime."""
    env_map = {
        "webhook_url": "RADAR_WEBHOOK_URL",
        "smtp_host": "RADAR_SMTP_HOST",
        "smtp_port": "RADAR_SMTP_PORT",
        "smtp_user": "RADAR_SMTP_USER",
        "smtp_pass": "RADAR_SMTP_PASS",
        "smtp_from": "RADAR_SMTP_FROM",
        "smtp_to": "RADAR_SMTP_TO",
    }
    for cfg_key, env_key in env_map.items():
        env_val = os.environ.get(env_key)
        if env_val:
            settings[cfg_key] = env_val
    return settings


async def run(args: argparse.Namespace) -> None:
    config_path = Path(args.config)
    carriers, settings = load_config(config_path)
    settings = overlay_env_secrets(settings)

    staging_dir = Path(settings.get("staging_dir", "staging_pdfs"))
    db_path = Path(settings.get("db_path", "db/radar_state.db"))
    headless = bool(settings.get("headless", True))

    # If --only is passed, narrow the carrier list — useful for debugging.
    if args.only:
        carriers = [c for c in carriers if c.key == args.only]
        if not carriers:
            LOG.error("no carrier matches --only=%s", args.only)
            return

    with state_db(db_path) as conn:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=headless)
            try:
                # Run carriers serially. Most insurance portals throttle hard
                # and the per-carrier work is mostly waiting on the network,
                # so concurrency buys little here and risks getting flagged.
                for carrier in carriers:
                    try:
                        await check_carrier(
                            browser, carrier, settings, conn, staging_dir
                        )
                    except Exception as exc:
                        LOG.exception("[%s] failed: %s", carrier.key, exc)
                        await alert(
                            settings,
                            "error",
                            carrier,
                            {"error": str(exc), "type": type(exc).__name__},
                        )
            finally:
                await browser.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Underwriting Radar — monitor carrier portals for updated PDFs."
    )
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument(
        "--only",
        default=None,
        help="Only check this carrier key (matches CarrierConfig.key).",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
    )

    asyncio.run(run(args))
    return 0


if __name__ == "__main__":
    sys.exit(main())
