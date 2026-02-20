/**
 * BugReport — Lightweight in-app bug reporting module
 * 
 * Opens a modal overlay where users describe a bug, pick a category,
 * optionally attach a screenshot, and submit. The report is sent to
 * /api/bug-report which creates a GitHub Issue.
 * 
 * Usage: BugReport.open()  — call from any button/link
 * 
 * @module BugReport
 */
window.BugReport = (() => {
    'use strict';

    let _modal = null;
    let _screenshotData = null;

    // ── Helpers ──────────────────────────────────────────────
    function escapeHTML(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    function getCurrentPage() {
        if (document.getElementById('landingPage')?.style.display !== 'none') return 'Landing Page';
        const activeStep = document.querySelector('.step:not(.hidden)');
        if (activeStep) {
            const title = document.getElementById('stepTitle')?.textContent || '';
            return title || activeStep.id || 'Unknown Step';
        }
        const activeTool = document.querySelector('.plugin-container[style*="display: block"], .plugin-container[style*="display:block"]');
        if (activeTool) return activeTool.id || 'Plugin';
        return 'Unknown';
    }

    function getAppVersion() {
        const footer = document.getElementById('landingFooter');
        if (footer) {
            const match = footer.textContent.match(/v[\d.]+/);
            if (match) return match[0];
        }
        return 'unknown';
    }

    // ── Screenshot (optional — canvas capture) ──────────────
    async function captureScreenshot() {
        // Use the simpler clipboard/file approach — user pastes or picks a file
        return null;
    }

    // ── Modal ───────────────────────────────────────────────
    function open() {
        if (_modal) close();

        _screenshotData = null;

        const overlay = document.createElement('div');
        overlay.className = 'bugreport-overlay';
        overlay.onclick = (e) => { if (e.target === overlay) close(); };

        overlay.innerHTML = `
            <div class="bugreport-modal" role="dialog" aria-labelledby="bugreport-title">
                <div class="bugreport-header">
                    <h3 id="bugreport-title">🐛 Report a Bug</h3>
                    <button class="bugreport-close" onclick="BugReport.close()" aria-label="Close">&times;</button>
                </div>
                <form id="bugreportForm" class="bugreport-body" onsubmit="BugReport.submit(event)">
                    <label class="bugreport-label" for="bugreport-category">Category</label>
                    <select id="bugreport-category" class="bugreport-select">
                        <option value="bug" selected>🐛 Bug / Something Broken</option>
                        <option value="ui">🎨 UI / Visual Issue</option>
                        <option value="feature">💡 Feature Request</option>
                        <option value="question">❓ Question</option>
                        <option value="other">📌 Other</option>
                    </select>

                    <label class="bugreport-label" for="bugreport-title-input">Title <span class="bugreport-req">*</span></label>
                    <input id="bugreport-title-input" class="bugreport-input" type="text" placeholder="Brief summary of the issue" required maxlength="120" autocomplete="off">

                    <label class="bugreport-label" for="bugreport-desc">Description</label>
                    <textarea id="bugreport-desc" class="bugreport-textarea" placeholder="What happened? What did you expect?" maxlength="2000" rows="3"></textarea>

                    <label class="bugreport-label" for="bugreport-steps">Steps to Reproduce</label>
                    <textarea id="bugreport-steps" class="bugreport-textarea" placeholder="1. Go to…&#10;2. Click on…&#10;3. See error" maxlength="1000" rows="3"></textarea>

                    <label class="bugreport-label">Screenshot <span class="bugreport-optional">(optional)</span></label>
                    <div class="bugreport-screenshot-zone" id="bugreport-screenshot-zone">
                        <input type="file" id="bugreport-file" accept="image/*" style="display:none" onchange="BugReport.handleFile(event)">
                        <div class="bugreport-screenshot-placeholder" id="bugreport-screenshot-placeholder" onclick="document.getElementById('bugreport-file').click()">
                            <span>📎 Click to attach or paste an image</span>
                        </div>
                        <img id="bugreport-screenshot-preview" class="bugreport-screenshot-preview" style="display:none">
                    </div>

                    <div class="bugreport-meta">
                        <span>Page: <strong>${escapeHTML(getCurrentPage())}</strong></span>
                        <span>Version: <strong>${escapeHTML(getAppVersion())}</strong></span>
                    </div>

                    <div class="bugreport-actions">
                        <button type="button" class="bugreport-btn bugreport-btn-cancel" onclick="BugReport.close()">Cancel</button>
                        <button type="submit" class="bugreport-btn bugreport-btn-submit" id="bugreport-submit-btn">
                            <span id="bugreport-submit-text">Submit Report</span>
                        </button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(overlay);
        _modal = overlay;

        // Focus title input
        requestAnimationFrame(() => {
            const input = document.getElementById('bugreport-title-input');
            if (input) input.focus();
        });

        // Paste handler for screenshots
        document.addEventListener('paste', handlePaste);

        // Escape key
        document.addEventListener('keydown', handleEscape);
    }

    function close() {
        if (_modal) {
            _modal.remove();
            _modal = null;
        }
        _screenshotData = null;
        document.removeEventListener('paste', handlePaste);
        document.removeEventListener('keydown', handleEscape);
    }

    function handleEscape(e) {
        if (e.key === 'Escape') close();
    }

    // ── Screenshot handling ────────────────────────────────
    function handlePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                processImageFile(file);
                break;
            }
        }
    }

    function handleFile(e) {
        const file = e.target?.files?.[0];
        if (file && file.type.startsWith('image/')) {
            processImageFile(file);
        }
    }

    function processImageFile(file) {
        if (!file) return;
        // Limit to 2 MB
        if (file.size > 2 * 1024 * 1024) {
            if (typeof App !== 'undefined') App.toast('Image too large (max 2 MB)', { type: 'error' });
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            _screenshotData = reader.result; // data:image/...;base64,...
            const preview = document.getElementById('bugreport-screenshot-preview');
            const placeholder = document.getElementById('bugreport-screenshot-placeholder');
            if (preview) {
                preview.src = _screenshotData;
                preview.style.display = 'block';
                preview.onclick = () => { removeScreenshot(); };
            }
            if (placeholder) placeholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    function removeScreenshot() {
        _screenshotData = null;
        const preview = document.getElementById('bugreport-screenshot-preview');
        const placeholder = document.getElementById('bugreport-screenshot-placeholder');
        if (preview) { preview.style.display = 'none'; preview.src = ''; }
        if (placeholder) placeholder.style.display = '';
    }

    // ── Submit ──────────────────────────────────────────────
    async function submit(e) {
        e.preventDefault();

        const btn = document.getElementById('bugreport-submit-btn');
        const btnText = document.getElementById('bugreport-submit-text');
        if (!btn || btn.disabled) return;

        const title       = document.getElementById('bugreport-title-input')?.value?.trim();
        const description = document.getElementById('bugreport-desc')?.value?.trim();
        const steps       = document.getElementById('bugreport-steps')?.value?.trim();
        const category    = document.getElementById('bugreport-category')?.value || 'bug';

        if (!title || title.length < 3) {
            if (typeof App !== 'undefined') App.toast('Please enter a title (min 3 characters)', { type: 'error' });
            document.getElementById('bugreport-title-input')?.focus();
            return;
        }

        // Disable button and show spinner
        btn.disabled = true;
        btnText.textContent = 'Submitting…';

        const payload = {
            title,
            description,
            steps,
            category,
            screenshot: _screenshotData || null,
            currentPage: getCurrentPage(),
            appVersion: getAppVersion(),
            userAgent: navigator.userAgent,
        };

        try {
            const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch) ? Auth.apiFetch.bind(Auth) : fetch;
            const res = await fetchFn('/api/config?type=bugreport', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok && data.success) {
                close();
                if (typeof App !== 'undefined') {
                    App.toast(`✅ Bug report #${data.issueNumber} submitted — thank you!`, { duration: 4000 });
                }
            } else if (res.status === 401) {
                if (typeof App !== 'undefined') App.toast('Please sign in to submit a bug report', { type: 'error' });
                btn.disabled = false;
                btnText.textContent = 'Submit Report';
            } else {
                throw new Error(data.error || `Server error (${res.status})`);
            }
        } catch (err) {
            console.error('[BugReport] Submit failed:', err);
            if (typeof App !== 'undefined') App.toast(`❌ ${err.message}`, { type: 'error', duration: 4000 });
            btn.disabled = false;
            btnText.textContent = 'Submit Report';
        }
    }

    // ── Public API ──────────────────────────────────────────
    return { open, close, submit, handleFile };
})();
