"""
EZLynx Form Schema Scraper

Opens EZLynx in Chromium and injects a floating toolbar directly into the
browser page. No terminal interaction needed — all controls are in-browser:

  [Scrape This Page]  [Save & Close]  [X dropdowns captured]

Handles Angular Material dropdowns (mat-select), native <select> elements,
custom role="listbox" components, and searches all iframes.

Usage:
    python scrape_ezlynx_schema.py
    python scrape_ezlynx_schema.py --output my_schema.json
"""

import argparse
import json
import os
import sys
import time

# Fix Windows console encoding
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


EZLYNX_URL = "https://app.ezlynx.com"
PLACEHOLDER_TEXTS = {"", "select", "select one", "-- select --", "- select -",
                     "--select--", "choose", "choose one", "none", "--",
                     "please select", "select...", "- none -"}

# ── Floating toolbar HTML/CSS/JS injected into every page ──
# Top-left, compact, draggable. Light self-healing (no subtree MutationObserver).
TOOLBAR_HTML = """
(function() {
    // Persist state on window so it survives re-injection
    if (typeof window._altech_action === 'undefined') window._altech_action = '';
    if (typeof window._altech_total === 'undefined') window._altech_total = 0;
    if (typeof window._altech_status_msg === 'undefined') window._altech_status_msg = 'Navigate to a form tab, then click Scrape.';

    function createToolbar() {
        var old = document.getElementById('_altech_toolbar');
        if (old) old.remove();
        if (!document.body) return;

        var bar = document.createElement('div');
        bar.id = '_altech_toolbar';
        bar.innerHTML = `
            <div id="_altech_bar_inner" style="
                position:fixed; top:8px; left:50%; transform:translateX(-50%); z-index:999999;
                background:rgba(22,33,62,0.95); color:#fff;
                padding:6px 14px; border-radius:10px;
                box-shadow:0 4px 20px rgba(0,0,0,0.35); font-family:-apple-system,BlinkMacSystemFont,sans-serif;
                display:flex; align-items:center; gap:8px;
                border:1px solid rgba(255,255,255,0.12);
                cursor:grab; user-select:none; font-size:12px;
            ">
                <span style="font-weight:700; font-size:12px;">Altech</span>
                <button id="_altech_scrape_btn" style="
                    background:#007AFF; color:#fff; border:none; border-radius:6px;
                    padding:5px 12px; font-size:11px; font-weight:600; cursor:pointer;
                ">Scrape</button>
                <button id="_altech_save_btn" style="
                    background:#34c759; color:#fff; border:none; border-radius:6px;
                    padding:5px 12px; font-size:11px; font-weight:600; cursor:pointer;
                ">Save & Close</button>
                <span id="_altech_count" style="color:rgba(255,255,255,0.7); font-size:11px;">
                    ${window._altech_total} saved</span>
                <span id="_altech_status" style="color:rgba(255,255,255,0.5); font-size:10px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${window._altech_status_msg}</span>
            </div>
        `;
        document.body.appendChild(bar);

        // ── Draggable ──
        var inner = document.getElementById('_altech_bar_inner');
        var dragging = false, dx = 0, dy = 0;
        inner.addEventListener('mousedown', function(e) {
            if (e.target.tagName === 'BUTTON') return;
            dragging = true; dx = e.clientX - inner.getBoundingClientRect().left; dy = e.clientY - inner.getBoundingClientRect().top;
            inner.style.cursor = 'grabbing';
            e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
            if (!dragging) return;
            inner.style.left = (e.clientX - dx) + 'px';
            inner.style.top = (e.clientY - dy) + 'px';
            inner.style.transform = 'none';
        });
        document.addEventListener('mouseup', function() { dragging = false; if (inner) inner.style.cursor = 'grab'; });

        document.getElementById('_altech_scrape_btn').addEventListener('click', function(e) {
            e.stopPropagation();
            window._altech_action = 'scrape';
            this.textContent = 'Scraping...';
            this.style.background = '#555';
            this.disabled = true;
        });
        document.getElementById('_altech_save_btn').addEventListener('click', function(e) {
            e.stopPropagation();
            window._altech_action = 'save';
            this.textContent = 'Saving...';
            this.style.background = '#555';
            this.disabled = true;
        });
    }

    createToolbar();

    // ── Light self-healing: only watch direct children of body (not subtree) ──
    if (!window._altech_observer) {
        window._altech_observer = new MutationObserver(function() {
            if (!document.getElementById('_altech_toolbar') && document.body) {
                setTimeout(createToolbar, 400);
            }
        });
        window._altech_observer.observe(document.body, { childList: true });
    }

    // ── Angular route changes ──
    if (!window._altech_nav_listener) {
        window._altech_nav_listener = true;
        ['popstate', 'hashchange'].forEach(function(evt) {
            window.addEventListener(evt, function() {
                setTimeout(function() {
                    if (!document.getElementById('_altech_toolbar')) createToolbar();
                }, 600);
            });
        });
    }
})();
"""

# ── JavaScript that runs IN the browser to scrape all dropdowns ──
# Handles native <select>, Angular Material mat-select, and custom dropdowns
SCRAPE_JS = """
() => {
    const PLACEHOLDERS = new Set(['', 'select', 'select one', '-- select --',
        '- select -', '--select--', 'choose', 'choose one', 'none', '--',
        'please select', 'select...', '- none -']);

    function isPlaceholder(value, text) {
        if (!text.trim()) return true;
        if (PLACEHOLDERS.has(text.trim().toLowerCase())) return true;
        if ((value === '' || value === '-1' || value === '0') &&
            (PLACEHOLDERS.has(text.trim().toLowerCase()) || !text.trim())) return true;
        return false;
    }

    function getLabel(el) {
        // 1. Check id -> matching <label for="id">
        const id = el.id || el.getAttribute('id') || '';
        if (id) {
            const lbl = document.querySelector('label[for="' + id + '"]');
            if (lbl) {
                const t = lbl.textContent.trim().replace(/\\*/g, '').trim();
                if (t) return t;
            }
        }

        // 2. aria-label
        const aria = el.getAttribute('aria-label');
        if (aria && aria.trim()) return aria.trim();

        // 3. aria-labelledby
        const ariaBy = el.getAttribute('aria-labelledby');
        if (ariaBy) {
            const ref = document.getElementById(ariaBy);
            if (ref) {
                const t = ref.textContent.trim();
                if (t) return t;
            }
        }

        // 4. Closest fieldset > legend
        const fieldset = el.closest('fieldset, .mat-form-field, [class*="form-field"]');
        if (fieldset) {
            const legend = fieldset.querySelector('legend, .mat-form-field-label, label, [class*="label"]');
            if (legend) {
                const t = legend.textContent.trim().replace(/\\*/g, '').trim();
                if (t) return t;
            }
        }

        // 5. Ancestor label
        const parentLabel = el.closest('label');
        if (parentLabel) {
            const t = parentLabel.textContent.trim().split('\\n')[0].trim().replace(/\\*/g, '').trim();
            if (t) return t;
        }

        // 6. Previous sibling label or text
        let prev = el.previousElementSibling;
        if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV')) {
            const t = prev.textContent.trim().replace(/\\*/g, '').trim();
            if (t && t.length < 50) return t;
        }

        // 7. Parent's previous sibling (common in grid layouts)
        const parent = el.parentElement;
        if (parent) {
            prev = parent.previousElementSibling;
            if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN')) {
                const t = prev.textContent.trim().replace(/\\*/g, '').trim();
                if (t && t.length < 50) return t;
            }
        }

        // 8. title attribute
        const title = el.getAttribute('title');
        if (title && title.trim()) return title.trim();

        // 9. placeholder
        const placeholder = el.getAttribute('placeholder') || el.getAttribute('data-placeholder');
        if (placeholder && placeholder.trim()) return placeholder.trim();

        // 10. Fallback to name or id
        const name = el.getAttribute('name') || el.getAttribute('formcontrolname');
        if (name) return name;
        if (id) return id;

        return '(unknown)';
    }

    const results = {};

    // ── 1. Native <select> elements ──
    document.querySelectorAll('select').forEach(sel => {
        if (sel.offsetParent === null && !sel.closest('[style*="overflow"]')) return; // hidden
        const label = getLabel(sel);
        const values = [];
        sel.querySelectorAll('option').forEach(opt => {
            const v = opt.value || '';
            const t = opt.textContent.trim();
            if (!isPlaceholder(v, t)) values.push(t);
        });
        if (values.length > 0) {
            let key = label;
            let suffix = 2;
            while (results[key] && JSON.stringify(results[key]) !== JSON.stringify(values)) {
                key = label + ' (' + suffix + ')'; suffix++;
            }
            results[key] = values;
        }
    });

    // ── 2. Angular Material mat-select ──
    document.querySelectorAll('mat-select, [role="listbox"]').forEach(el => {
        if (el.offsetParent === null) return;
        const label = getLabel(el);
        // mat-select stores options in mat-option children or via aria
        const values = [];
        el.querySelectorAll('mat-option, [role="option"]').forEach(opt => {
            const t = opt.textContent.trim();
            const v = opt.getAttribute('value') || '';
            if (!isPlaceholder(v, t)) values.push(t);
        });
        if (values.length > 0) {
            let key = label;
            let suffix = 2;
            while (results[key] && JSON.stringify(results[key]) !== JSON.stringify(values)) {
                key = label + ' (' + suffix + ')'; suffix++;
            }
            results[key] = values;
        }
    });

    // ── 3. Custom dropdowns with role="combobox" ──
    document.querySelectorAll('[role="combobox"]').forEach(el => {
        if (el.offsetParent === null) return;
        const label = getLabel(el);
        const listboxId = el.getAttribute('aria-owns') || el.getAttribute('aria-controls');
        if (listboxId) {
            const listbox = document.getElementById(listboxId);
            if (listbox) {
                const values = [];
                listbox.querySelectorAll('[role="option"], li, .option, [class*="option"]').forEach(opt => {
                    const t = opt.textContent.trim();
                    if (t && !isPlaceholder('', t)) values.push(t);
                });
                if (values.length > 0) {
                    let key = label;
                    let suffix = 2;
                    while (results[key] && JSON.stringify(results[key]) !== JSON.stringify(values)) {
                        key = label + ' (' + suffix + ')'; suffix++;
                    }
                    results[key] = values;
                }
            }
        }
    });

    // ── 4. Scan for Kendo UI / PrimeNG / custom select-like elements ──
    const customSelectors = [
        '.k-dropdown', '.k-dropdownlist',       // Kendo UI
        '.p-dropdown',                            // PrimeNG
        '[class*="dropdown"][class*="select"]',   // Generic
        '.custom-select',                         // Bootstrap custom
        '[data-role="dropdownlist"]',              // Kendo data-role
    ];
    customSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            if (el.offsetParent === null) return;
            if (el.tagName === 'SELECT') return; // already handled
            const label = getLabel(el);
            const values = [];
            el.querySelectorAll('li, [role="option"], option, .k-item, .p-dropdown-item').forEach(opt => {
                const t = opt.textContent.trim();
                if (t && !isPlaceholder('', t)) values.push(t);
            });
            if (values.length > 0) {
                let key = label;
                let suffix = 2;
                while (results[key] && JSON.stringify(results[key]) !== JSON.stringify(values)) {
                    key = label + ' (' + suffix + ')'; suffix++;
                }
                results[key] = values;
            }
        });
    });

    return {
        dropdowns: results,
        debug: {
            selectCount: document.querySelectorAll('select').length,
            matSelectCount: document.querySelectorAll('mat-select').length,
            roleListbox: document.querySelectorAll('[role="listbox"]').length,
            roleCombobox: document.querySelectorAll('[role="combobox"]').length,
            allInputs: document.querySelectorAll('input, select, textarea').length,
            iframeCount: document.querySelectorAll('iframe').length,
            url: window.location.href
        }
    };
}
"""


def inject_toolbar(page):
    """Inject or re-inject the floating toolbar into the current page."""
    try:
        page.evaluate(TOOLBAR_HTML)
    except Exception as e:
        print(f"  [!] Could not inject toolbar: {e}")


def update_toolbar(page, count, status_text=""):
    """Update the counter and status text on the toolbar (and window state for re-injection)."""
    try:
        page.evaluate(f"""(() => {{
            window._altech_total = {count};
            window._altech_status_msg = {json.dumps(status_text)};

            const c = document.getElementById('_altech_count');
            if (c) c.textContent = '{count} saved';
            const s = document.getElementById('_altech_status');
            if (s) {{
                s.textContent = {json.dumps(status_text)};
                s.title = {json.dumps(status_text)};
            }}
            const btn = document.getElementById('_altech_scrape_btn');
            if (btn) {{
                btn.textContent = 'Scrape';
                btn.style.background = '#007AFF';
                btn.disabled = false;
            }}
        }})()""")
    except Exception:
        pass


def reset_action_flag(page):
    """Clear the action flag so we can wait for the next click."""
    try:
        page.evaluate("window._altech_action = ''")
    except Exception:
        pass


def wait_for_action(page):
    """Poll for a toolbar button click. Returns 'scrape', 'save', or ''."""
    try:
        action = page.evaluate("window._altech_action || ''")
        return action
    except Exception:
        return ''


def is_placeholder(text: str) -> bool:
    """Check if text is a placeholder that should be skipped."""
    if not text.strip():
        return True
    return text.strip().lower() in PLACEHOLDER_TEXTS


def scrape_frame(frame, existing_schema: dict, frame_name: str = "main") -> dict:
    """Run the in-browser JS scraper on a single frame."""
    schema = dict(existing_schema)

    try:
        result = frame.evaluate(SCRAPE_JS)
    except Exception as e:
        print(f"  [!] Could not scrape frame '{frame_name}': {e}")
        return schema

    dropdowns = result.get("dropdowns", {})
    debug = result.get("debug", {})

    print(f"\n  [{frame_name}] Page: {debug.get('url', '?')}")
    print(f"  [{frame_name}] DOM stats: {debug.get('allInputs', 0)} form elements, "
          f"{debug.get('selectCount', 0)} <select>, {debug.get('matSelectCount', 0)} mat-select, "
          f"{debug.get('roleListbox', 0)} role=listbox, {debug.get('roleCombobox', 0)} role=combobox, "
          f"{debug.get('iframeCount', 0)} iframes")

    new_count = 0
    for key, values in dropdowns.items():
        # Dedupe with existing schema
        final_key = key
        suffix = 2
        while final_key in schema and schema[final_key] != values:
            final_key = f"{key} ({suffix})"
            suffix += 1

        if final_key not in schema:
            new_count += 1

        schema[final_key] = values
        print(f"  [v] '{final_key}' - {len(values)} options")

    if not dropdowns:
        print(f"  [!] No dropdowns found in {frame_name} frame.")

    print(f"  [{frame_name}] This frame: {new_count} new, {len(schema)} total across all frames")
    return schema


def scrape_all_frames(page, existing_schema: dict) -> dict:
    """Scrape the main frame AND all iframes on the page."""
    schema = dict(existing_schema)

    # 1. Scrape main frame
    schema = scrape_frame(page, schema, "main")

    # 2. Scrape all child frames (iframes)
    frames = page.frames
    print(f"\n  [*] Page has {len(frames)} frames total (including main)")

    for i, frame in enumerate(frames):
        if frame == page.main_frame:
            continue  # Already scraped
        frame_name = frame.name or frame.url or f"frame-{i}"
        # Truncate long names
        if len(frame_name) > 60:
            frame_name = frame_name[:57] + "..."
        try:
            schema = scrape_frame(frame, schema, frame_name)
        except Exception as e:
            print(f"  [!] Error scraping frame '{frame_name}': {e}")

    return schema


def click_all_dropdowns_to_populate(page):
    """
    Pre-click Angular Material dropdowns to populate lazy options.
    Runs entirely in-browser via a single async evaluate — no Python round-trips.
    Only targets mat-select (native <select> already has options in DOM).
    """
    try:
        result = page.evaluate("""async () => {
            const triggers = Array.from(document.querySelectorAll(
                'mat-select, [role="combobox"], .k-dropdown, .k-dropdownlist, [data-role="dropdownlist"]'
            )).filter(el => el.offsetParent !== null);

            let clicked = 0;
            for (const el of triggers) {
                try {
                    el.click();
                    await new Promise(r => setTimeout(r, 150));
                    // Close overlay
                    const esc = new KeyboardEvent('keydown', {key:'Escape', code:'Escape', keyCode:27, bubbles:true});
                    document.dispatchEvent(esc);
                    document.body.click();
                    await new Promise(r => setTimeout(r, 80));
                    clicked++;
                } catch(e) {}
            }
            // Final cleanup
            const overlay = document.querySelector('.cdk-overlay-backdrop');
            if (overlay) overlay.click();
            return clicked;
        }""")
        if result and result > 0:
            print(f"  [*] Pre-clicked {result} custom dropdowns (in-browser, no round-trips)")
    except Exception as e:
        print(f"  [!] Pre-click step error: {e}")


def get_page_label(page):
    """Extract a human-readable label for the current EZLynx page."""
    try:
        info = page.evaluate("""() => {
            const h1 = document.querySelector('h1, h2, .page-title, [class*="title"]');
            const heading = h1 ? h1.textContent.trim() : '';
            const path = window.location.pathname;
            return { heading, path, url: window.location.href };
        }""")
        return info
    except Exception:
        return {"heading": "", "path": "", "url": ""}


def save_schema(output_file, all_schema, page_map):
    """Save schema to disk (called after each page scrape for safety)."""
    if not all_schema:
        return
    output_data = {"_pages": page_map}
    output_data.update(all_schema)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=4, ensure_ascii=False)


def scrape_current_page(page, all_schema, page_map, output_file):
    """Scrape the current page, update schema + page_map, auto-save."""
    page_info = get_page_label(page)
    page_key = page_info.get('path', 'unknown')
    page_label = page_info.get('heading', '') or page_key.split('/')[-1] or 'Unknown'

    # Skip if already scraped (unless user forced via Scrape button)
    if page_key in page_map:
        prev = page_map[page_key]
        dd_count = len(prev.get("dropdowns", []))
        print(f"  [*] Page already scraped: {page_label} ({dd_count} dropdowns) — skipping")
        update_toolbar(page, len(all_schema),
            f"Already scraped ({dd_count} dd). {len(all_schema)} total. Navigate or Save & Close.")
        return all_schema, page_map

    print(f"\n{'=' * 50}")
    print(f"[*] Auto-scraping: {page_label}")
    print(f"{'=' * 50}")

    update_toolbar(page, len(all_schema), f"Scraping {page_label}...")

    keys_before = set(all_schema.keys())

    # Pre-click custom dropdowns (runs in-browser, fast)
    click_all_dropdowns_to_populate(page)

    # Scrape
    try:
        all_schema = scrape_all_frames(page, all_schema)
    except Exception as e:
        print(f"[!] Scrape error: {e}")

    # Track page
    new_keys = [k for k in all_schema.keys() if k not in keys_before]
    existing_dd = set()
    for k in new_keys:
        existing_dd.add(k)
    # Include all keys found on this page (new ones)
    page_map[page_key] = {
        "label": page_label,
        "dropdowns": sorted(existing_dd),
        "lastScraped": time.strftime("%Y-%m-%dT%H:%M:%S")
    }

    # Auto-save immediately
    save_schema(output_file, all_schema, page_map)
    page_count = len(page_map)
    print(f"  [*] Auto-saved. {len(all_schema)} total from {page_count} page(s).")

    update_toolbar(page, len(all_schema),
        f"Done! {len(all_schema)} total, {page_count} pages. Navigate or Save & Close.")

    return all_schema, page_map


def run(output_file: str):
    print("--- EZLynx Schema Scraper ---")
    print("[*] Toolbar appears at top-center of the browser (draggable)")
    print("[*] AUTO-SCRAPES when you navigate to a new page")
    print("[*] AUTO-SAVES after each page (safe to close anytime)")
    print("[*] Skips pages already scraped\n")

    all_schema = {}
    page_map = {}

    # Load existing schema
    if os.path.exists(output_file):
        try:
            with open(output_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
            if "_pages" in existing:
                page_map = existing.pop("_pages")
            all_schema = {k: v for k, v in existing.items() if not k.startswith("_")}
            print(f"[*] Existing schema: {len(all_schema)} dropdowns, {len(page_map)} pages already scraped")
            if page_map:
                for pk, pv in page_map.items():
                    print(f"     {pv.get('label', pk)}: {len(pv.get('dropdowns', []))} dropdowns")
        except Exception:
            pass

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()

        # Track last scraped URL to avoid redundant scrapes
        last_scraped_path = [None]
        auto_scrape_pending = [False]

        def do_auto_scrape():
            """Run auto-scrape if we're on a new page with form elements."""
            nonlocal all_schema, page_map
            try:
                current_path = page.evaluate("window.location.pathname") or ""
            except Exception:
                return

            if current_path == last_scraped_path[0]:
                return  # Same page, skip

            # Check if this page has form elements (don't scrape login/dashboard)
            try:
                has_form = page.evaluate("""() => {
                    return document.querySelectorAll('select, mat-select, [role="combobox"], input, textarea').length > 3;
                }""")
            except Exception:
                has_form = False

            if not has_form:
                return

            last_scraped_path[0] = current_path
            all_schema, page_map = scrape_current_page(page, all_schema, page_map, output_file)

        try:
            print(f"[*] Opening EZLynx: {EZLYNX_URL}")
            page.goto(EZLYNX_URL, wait_until="domcontentloaded")
            time.sleep(1)

            inject_toolbar(page)
            print("[*] Toolbar injected. Log in, then navigate to any form page.")
            print("[*] Scraping happens automatically — just navigate!\n")

            # On full page loads
            page.on("load", lambda: inject_toolbar(page))

            # On SPA navigation — schedule auto-scrape
            def on_frame_navigated(frame):
                if frame == page.main_frame:
                    auto_scrape_pending[0] = True

            page.on("framenavigated", on_frame_navigated)

            last_check = time.time()
            running = True

            while running:
                time.sleep(0.4)

                # Handle pending auto-scrape (delayed to let Angular settle)
                if auto_scrape_pending[0]:
                    auto_scrape_pending[0] = False
                    time.sleep(0.8)  # Angular settling time
                    try:
                        inject_toolbar(page)
                        update_toolbar(page, len(all_schema), "Checking page...")
                    except Exception:
                        pass
                    do_auto_scrape()

                # Toolbar keepalive (every 2s)
                now = time.time()
                if now - last_check > 2:
                    try:
                        exists = page.evaluate("!!document.getElementById('_altech_toolbar')")
                        if not exists:
                            inject_toolbar(page)
                            update_toolbar(page, len(all_schema),
                                f"{len(all_schema)} saved. Navigate to scrape more pages.")
                    except Exception:
                        try:
                            time.sleep(0.3)
                            inject_toolbar(page)
                        except Exception:
                            pass
                    last_check = now

                # Check toolbar buttons
                action = wait_for_action(page)

                if action == 'scrape':
                    # Force re-scrape current page (even if already done)
                    try:
                        current_path = page.evaluate("window.location.pathname") or ""
                    except Exception:
                        current_path = ""
                    # Remove from page_map so it re-scrapes
                    if current_path in page_map:
                        del page_map[current_path]
                    last_scraped_path[0] = None
                    do_auto_scrape()
                    reset_action_flag(page)

                elif action == 'save':
                    print("\n[*] Save & Close requested.")
                    running = False

            # Final save
            save_schema(output_file, all_schema, page_map)
            print(f"\n[OK] Final save: {len(all_schema)} dropdowns from {len(page_map)} page(s)")
            for pk, pv in page_map.items():
                print(f"     {pv.get('label', pk)}: {len(pv.get('dropdowns', []))} dropdowns")

        except KeyboardInterrupt:
            print("\n[!] Interrupted.")
            save_schema(output_file, all_schema, page_map)
            if all_schema:
                print(f"[OK] Emergency save: {len(all_schema)} dropdowns")
        except Exception as e:
            print(f"\n[!] Error: {e}")
            save_schema(output_file, all_schema, page_map)
        finally:
            browser.close()
            print("[*] Browser closed.")


def main():
    parser = argparse.ArgumentParser(
        description="Scrape EZLynx form dropdowns into a JSON schema file"
    )
    parser.add_argument(
        "-o", "--output",
        default="ezlynx_schema.json",
        help="Output JSON filename (default: ezlynx_schema.json)",
    )
    args = parser.parse_args()
    run(output_file=args.output)


if __name__ == "__main__":
    main()
