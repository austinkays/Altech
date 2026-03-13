/**
 * Blind Spot Brief — Admin-Only News Analysis Plugin
 * 
 * Compares left/right media coverage to identify blind spots.
 * Routes through /api/anthropic-proxy with web_search tool.
 * Requires admin role + user-supplied Anthropic API key.
 */
window.BlindSpotBrief = (() => {
    'use strict';

    const API_KEY_STORAGE = 'altech_bsb_apikey';
    const CACHE_KEY = 'altech_bsb_cache';
    let _isLoading = false;
    let _progressTimer = null;

    const PROGRESS_STEPS = [
        { pct: 8,  text: 'Searching left-leaning outlets...' },
        { pct: 22, text: 'Searching right-leaning outlets...' },
        { pct: 40, text: 'Cross-referencing coverage...' },
        { pct: 55, text: 'Identifying blind spots...' },
        { pct: 70, text: 'Verifying sources...' },
        { pct: 82, text: 'Compiling analysis...' },
        { pct: 92, text: 'Formatting results...' }
    ];

    function init() {
        _wireEvents();
        _restoreCache();
    }

    // ── API Key Management ──

    function _getApiKey() {
        try {
            // 1. BSB-specific key (user override via localStorage)
            const bsbKey = localStorage.getItem(API_KEY_STORAGE);
            if (bsbKey) return bsbKey;
            // 2. Fall back to AI Provider settings if it's an Anthropic key
            if (typeof AIProvider !== 'undefined') {
                const settings = AIProvider.getSettings();
                if (settings.apiKey && settings.apiKey.startsWith('sk-ant-')) {
                    return settings.apiKey;
                }
            }
            return '';
        } catch { return ''; }
    }

    // ── Event Wiring ──

    function _wireEvents() {
        const runBtn = document.getElementById('bsbRunBtn');
        if (runBtn) runBtn.addEventListener('click', _run);

        const clearBtn = document.getElementById('bsbClearBtn');
        if (clearBtn) clearBtn.addEventListener('click', _clearResults);
    }

    // ── Main Run ──

    async function _run() {
        if (_isLoading) return;

        const apiKey = _getApiKey();
        if (!apiKey || !apiKey.startsWith('sk-ant-')) {
            App.toast('Set an Anthropic API key in Settings → AI Provider first', 'error');
            return;
        }

        _isLoading = true;
        _showLoading(true);
        _clearResults();

        try {
            const data = await _callApi(apiKey);
            _saveCache(data);
            _renderResults(data);
        } catch (err) {
            _showError(err.message || 'Analysis failed');
        } finally {
            _isLoading = false;
            _showLoading(false);
        }
    }

    // ── API Call ──

    async function _callApi(apiKey) {
        const systemPrompt = `You are a nonpartisan media analyst. Your job is to compare what left-leaning and right-leaning news outlets are covering — and more importantly, what each side is NOT covering that the other IS covering.

TRUSTED OUTLETS (use for primary facts):
- Left-leaning: NPR, AP News, Reuters, PBS, The New York Times, The Washington Post, The Guardian, MSNBC, CNN, BBC, CBS News, NBC News, The Atlantic, Vox, ProPublica
- Right-leaning: Fox News, The Daily Wire, The Blaze, New York Post, Washington Examiner, Washington Times, Breitbart, National Review, The Federalist, Newsmax, The Daily Caller, Townhall, The Epoch Times, Just the News

NON-TRUSTED (do NOT use as sources, but may reference if a story originates there):
- Random blogs, social media posts, unverified Substacks, conspiracy sites, satire outlets

RULES:
1. Search for today's top stories across both left and right outlets
2. Find stories that are prominently covered by one side but ignored or buried by the other
3. Only include genuine blind spots — not just different framing of the same story
4. If both sides cover a story but with different emphasis, note that separately
5. Back every claim with a specific source and URL
6. Aim for 5-8 blind spots per side — the more the better
7. Include 3-5 stories both sides ARE covering but framing differently (for contrast)

OUTPUT FORMAT: Return a JSON object (and nothing else) with this structure:
{
  "leftBlindSpots": [
    {
      "headline": "Short headline",
      "summary": "2-3 sentence explanation of the story and why it matters",
      "sources": [{"name": "Outlet Name", "url": "https://..."}],
      "whyBlindSpot": "Brief explanation of why the left is likely not covering this"
    }
  ],
  "rightBlindSpots": [
    {
      "headline": "Short headline",
      "summary": "2-3 sentence explanation",
      "sources": [{"name": "Outlet Name", "url": "https://..."}],
      "whyBlindSpot": "Brief explanation of why the right is likely not covering this"
    }
  ],
  "bothCovering": [
    {
      "headline": "Short headline",
      "summary": "How both sides are covering it differently",
      "leftSources": [{"name": "Outlet", "url": "https://..."}],
      "rightSources": [{"name": "Outlet", "url": "https://..."}]
    }
  ]
}`;

        const userMessage = `Search today's news from both left-leaning and right-leaning outlets. Find stories that are blind spots — covered by one side but not the other. Return the JSON object as specified.`;

        const response = await Auth.apiFetch('/api/anthropic-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey,
                model: 'claude-haiku-4-20250514',
                max_tokens: 32000,
                system: systemPrompt,
                tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 20 }],
                messages: [{ role: 'user', content: userMessage }]
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `API error (${response.status})`);
        }

        const result = await response.json();
        console.log('[BSB] API response stop_reason:', result.stop_reason);
        console.log('[BSB] Content blocks:', result.content?.length, result.content?.map(b => b.type));

        // Extract JSON from response content blocks
        let jsonText = '';
        if (result.content) {
            for (const block of result.content) {
                if (block.type === 'text' && block.text) {
                    jsonText += block.text;
                }
            }
        }

        if (!jsonText) {
            console.error('[BSB] No text content found in response. Full result:', JSON.stringify(result).slice(0, 2000));
            throw new Error('No text content in API response. stop_reason: ' + (result.stop_reason || 'unknown'));
        }

        console.log('[BSB] Raw text length:', jsonText.length);
        console.log('[BSB] Raw text preview:', jsonText.slice(0, 500));
        if (jsonText.length > 500) console.log('[BSB] Raw text tail:', jsonText.slice(-300));

        // Parse JSON — strip preamble narration and code fences
        jsonText = jsonText.trim();
        if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }

        // Model often returns thinking/search narration before the JSON object.
        // Extract the outermost { ... } block.
        const firstBrace = jsonText.indexOf('{');
        if (firstBrace > 0) {
            console.log('[BSB] Stripping', firstBrace, 'chars of preamble narration before JSON');
            jsonText = jsonText.slice(firstBrace);
        }
        // Find the matching closing brace from the end
        const lastBrace = jsonText.lastIndexOf('}');
        if (lastBrace >= 0 && lastBrace < jsonText.length - 1) {
            console.log('[BSB] Trimming', jsonText.length - lastBrace - 1, 'chars after final }');
            jsonText = jsonText.slice(0, lastBrace + 1);
        }

        try {
            return JSON.parse(jsonText);
        } catch (parseErr) {
            console.error('[BSB] JSON parse failed:', parseErr.message);
            console.error('[BSB] Attempted to parse (first 1000 chars):', jsonText.slice(0, 1000));
            console.error('[BSB] Attempted to parse (last 500 chars):', jsonText.slice(-500));
            throw new Error('Could not parse analysis results — check console for details. stop_reason: ' + (result.stop_reason || 'unknown'));
        }
    }

    // ── Rendering ──

    function _renderResults(data, cachedTs) {
        const container = document.getElementById('bsbResults');
        if (!container) return;

        const d = cachedTs ? new Date(cachedTs) : new Date();
        const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const label = cachedTs ? 'Cached from' : 'Generated';

        let html = `<div class="bsb-date">${label} ${dateStr} at ${timeStr}</div>`;

        // Left blind spots (stories the LEFT is missing)
        if (data.leftBlindSpots?.length) {
            html += _renderSection('Stories the Left is Missing', 'bsb-section-left', data.leftBlindSpots);
        }

        // Right blind spots (stories the RIGHT is missing)
        if (data.rightBlindSpots?.length) {
            html += _renderSection('Stories the Right is Missing', 'bsb-section-right', data.rightBlindSpots);
        }

        // Both covering
        if (data.bothCovering?.length) {
            html += `<div class="bsb-section bsb-section-both">
                <h3 class="bsb-section-title">Both Sides Covering</h3>`;
            for (const story of data.bothCovering) {
                html += `<div class="bsb-card bsb-card-both">
                    <h4 class="bsb-card-headline">${_esc(story.headline)}</h4>
                    <p class="bsb-card-summary">${_esc(story.summary)}</p>
                    <div class="bsb-sources-row">
                        <div class="bsb-sources-col">
                            <span class="bsb-sources-label">Left:</span>
                            ${_renderSources(story.leftSources)}
                        </div>
                        <div class="bsb-sources-col">
                            <span class="bsb-sources-label">Right:</span>
                            ${_renderSources(story.rightSources)}
                        </div>
                    </div>
                </div>`;
            }
            html += `</div>`;
        }

        container.innerHTML = html;
        document.getElementById('bsbClearBtn')?.classList.remove('hidden');
    }

    function _renderSection(title, cssClass, items) {
        let html = `<div class="bsb-section ${cssClass}">
            <h3 class="bsb-section-title">${_esc(title)}</h3>`;
        for (const item of items) {
            html += `<div class="bsb-card">
                <h4 class="bsb-card-headline">${_esc(item.headline)}</h4>
                <p class="bsb-card-summary">${_esc(item.summary)}</p>
                <p class="bsb-card-why"><strong>Why blind spot:</strong> ${_esc(item.whyBlindSpot)}</p>
                <div class="bsb-sources">${_renderSources(item.sources)}</div>
            </div>`;
        }
        html += `</div>`;
        return html;
    }

    function _renderSources(sources) {
        if (!sources?.length) return '';
        return sources.map(s => {
            if (s.url) {
                return `<a class="bsb-source-chip" href="${_escAttr(s.url)}" target="_blank" rel="noopener noreferrer">${_esc(s.name)}</a>`;
            }
            return `<span class="bsb-source-chip">${_esc(s.name)}</span>`;
        }).join(' ');
    }

    // ── UI Helpers ──

    function _showLoading(show) {
        const loader = document.getElementById('bsbLoader');
        const runBtn = document.getElementById('bsbRunBtn');
        if (loader) loader.classList.toggle('hidden', !show);
        if (runBtn) runBtn.disabled = show;

        if (show) {
            _startProgressSteps();
        } else {
            _stopProgressSteps();
        }
    }

    function _startProgressSteps() {
        let idx = 0;
        _updateProgress(PROGRESS_STEPS[0].pct, PROGRESS_STEPS[0].text);

        _progressTimer = setInterval(() => {
            idx++;
            if (idx < PROGRESS_STEPS.length) {
                _updateProgress(PROGRESS_STEPS[idx].pct, PROGRESS_STEPS[idx].text);
            } else {
                // Hold at last step — real completion will clear it
                clearInterval(_progressTimer);
                _progressTimer = null;
            }
        }, 8000); // ~8s per step, 7 steps ≈ 56s total
    }

    function _stopProgressSteps() {
        if (_progressTimer) {
            clearInterval(_progressTimer);
            _progressTimer = null;
        }
        _updateProgress(100, 'Done!');
    }

    function _updateProgress(pct, text) {
        const fill = document.getElementById('bsbProgressFill');
        const step = document.getElementById('bsbProgressStep');
        if (fill) fill.style.width = pct + '%';
        if (step) step.textContent = text;
    }

    function _showError(msg) {
        const container = document.getElementById('bsbResults');
        if (container) {
            container.innerHTML = `<div class="bsb-error">${_esc(msg)}</div>`;
        }
    }

    function _clearResults() {
        const container = document.getElementById('bsbResults');
        if (container) container.innerHTML = '';
        document.getElementById('bsbClearBtn')?.classList.add('hidden');
    }

    // ── Cache ──

    function _saveCache(data) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        } catch (e) { console.warn('[BSB] Cache save failed:', e); }
    }

    function _restoreCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return;
            const { ts, data } = JSON.parse(raw);
            if (!data || !ts) return;
            _renderResults(data, ts);
        } catch (e) { console.warn('[BSB] Cache restore failed:', e); }
    }

    // ── Escaping ──

    function _esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    function _escAttr(str) {
        return _esc(str).replace(/"/g, '&quot;');
    }

    return { init };
})();
