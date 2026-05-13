/**
 * Phonetic Speller — small popup utility for repeating client info
 * back over the phone. Uses the APCO phonetic alphabet
 * (Adam, Boy, Charles…) — same set as the VIN decoder.
 *
 * Public API:
 *   PhoneticSpeller.open(seed?)             // open with optional pre-fill (legacy)
 *   PhoneticSpeller.open({ seed, mode, hint, onCommit })
 *     mode: 'general' | 'vin' | 'dl' | 'plate' | 'email'
 *           'vin'    — auto-uppercase, strip spaces, warn on I/O/Q
 *           'dl'     — alphanumeric "read back" string, no auto-format
 *           'plate'  — uppercase, strip spaces, alphanumeric
 *           'email'  — special @ / dot phonetic, no uppercase
 *           'general' (default) — name-like text
 *     hint: optional one-line tooltip rendered under the input
 *     onCommit: callback(cleanedValue) when the user clicks "Apply" — if
 *       absent, the Apply button is hidden (read-only / copy-only flow)
 *   PhoneticSpeller.close()
 */
window.PhoneticSpeller = (() => {
    'use strict';

    // APCO Phonetic Alphabet — matches js/vin-decoder.js for consistency.
    const PHONETIC = {
        'A': 'Adam',    'B': 'Boy',     'C': 'Charles', 'D': 'David',
        'E': 'Edward',  'F': 'Frank',   'G': 'George',  'H': 'Henry',
        'I': 'Ida',     'J': 'John',    'K': 'King',    'L': 'Lincoln',
        'M': 'Mary',    'N': 'Nora',    'O': 'Ocean',   'P': 'Paul',
        'Q': 'Queen',   'R': 'Robert',  'S': 'Sam',     'T': 'Tom',
        'U': 'Union',   'V': 'Victor',  'W': 'William', 'X': 'X-ray',
        'Y': 'Young',   'Z': 'Zebra',
        '0': 'Zero',    '1': 'One',     '2': 'Two',     '3': 'Three',
        '4': 'Four',    '5': 'Five',    '6': 'Six',     '7': 'Seven',
        '8': 'Eight',   '9': 'Nine'
    };

    let _overlay = null;
    let _mode = 'general';        // current speller mode — see header
    let _onCommit = null;         // current apply callback, if any
    let _customHint = '';          // current per-open hint string

    function _build() {
        const overlay = document.createElement('div');
        overlay.className = 'phonetic-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Phonetic Speller');
        overlay.innerHTML = `
            <div class="phonetic-modal">
                <div class="phonetic-header">
                    <span class="phonetic-icon" aria-hidden="true">📞</span>
                    <h3 class="phonetic-title">Phonetic Speller</h3>
                    <button type="button" class="phonetic-close" aria-label="Close">✕</button>
                </div>
                <div class="phonetic-body">
                    <label class="phonetic-label" for="phoneticInput">Type a name, email, VIN, or any text</label>
                    <input id="phoneticInput" type="text" class="phonetic-input" autocomplete="off" spellcheck="false" placeholder="e.g. Smith">
                    <div id="phoneticWarning" class="phonetic-warning" role="alert" style="display:none"></div>
                    <div id="phoneticReadout" class="phonetic-readout" aria-live="polite"></div>
                    <div class="phonetic-actions">
                        <button type="button" class="btn phonetic-apply" style="display:none">✓ Apply to field</button>
                        <button type="button" class="btn btn-secondary phonetic-copy">📋 Copy reading</button>
                        <button type="button" class="btn phonetic-clear">Clear</button>
                    </div>
                    <p class="phonetic-hint phonetic-default-hint">APCO alphabet — Adam, Boy, Charles… Read each spelling aloud to confirm.</p>
                    <p class="phonetic-hint phonetic-custom-hint" style="display:none"></p>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#phoneticInput');
        const readout = overlay.querySelector('#phoneticReadout');
        const warning = overlay.querySelector('#phoneticWarning');
        const applyBtn = overlay.querySelector('.phonetic-apply');

        // _applyMode sanitizes the raw input per the current `_mode`, then
        // re-renders the readout. The warning surface (#phoneticWarning) is
        // VIN-specific today — agents who tried to enter an I/O/Q (which
        // never appear in a real VIN) used to type the wrong character
        // silently; the speller now flags it inline.
        const update = () => {
            let val = input.value;
            if (_mode === 'vin' || _mode === 'plate') {
                const cleaned = val.toUpperCase().replace(/\s+/g, '');
                if (cleaned !== val) {
                    const pos = input.selectionStart;
                    input.value = cleaned;
                    val = cleaned;
                    try { input.setSelectionRange(pos, pos); } catch (_) {}
                }
            }
            if (_mode === 'vin') {
                const bad = (val.match(/[IOQ]/g) || []);
                if (bad.length) {
                    warning.style.display = '';
                    warning.textContent = `⚠️ VINs never use I, O, or Q (typed: ${[...new Set(bad)].join(', ')}). Confirm the character.`;
                } else {
                    warning.style.display = 'none';
                }
            } else {
                warning.style.display = 'none';
            }
            readout.innerHTML = _renderHtml(val, _mode);
        };
        input.addEventListener('input', update);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        overlay.querySelector('.phonetic-close').addEventListener('click', close);
        overlay.querySelector('.phonetic-clear').addEventListener('click', () => {
            input.value = '';
            update();
            input.focus();
        });
        overlay.querySelector('.phonetic-copy').addEventListener('click', () => {
            const text = _renderPlain(input.value, _mode);
            if (!text) return;
            _copy(text);
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('📋 Phonetic reading copied');
            }
        });
        applyBtn.addEventListener('click', () => {
            if (typeof _onCommit !== 'function') return;
            try { _onCommit(input.value); } catch (e) { console.warn('[PhoneticSpeller] onCommit error:', e); }
            close();
        });

        document.addEventListener('keydown', _onKey);
        return overlay;
    }

    function _onKey(e) {
        if (e.key === 'Escape' && _overlay && _overlay.classList.contains('active')) {
            close();
        }
    }

    // Email mode keeps letter case (most email addresses are lowercase and
    // reading them back as `JOHN.SMITH@…` is unnatural) and turns the two
    // most-mis-spoken characters into named tokens.
    function _renderChunkHtml(ch) {
        if (ch === ' ') return '<span class="phonetic-space">␣ space</span>';
        if (ch === '@') return '<span class="phonetic-pair"><span class="phonetic-char">@</span><span class="phonetic-word">at</span></span>';
        if (ch === '.') return '<span class="phonetic-pair"><span class="phonetic-char">.</span><span class="phonetic-word">dot</span></span>';
        if (ch === '-') return '<span class="phonetic-pair"><span class="phonetic-char">-</span><span class="phonetic-word">dash</span></span>';
        if (ch === '_') return '<span class="phonetic-pair"><span class="phonetic-char">_</span><span class="phonetic-word">underscore</span></span>';
        const upper = ch.toUpperCase();
        const word = PHONETIC[upper];
        if (!word) return `<span class="phonetic-pair phonetic-pair-other"><span class="phonetic-char">${_escape(ch)}</span></span>`;
        return `<span class="phonetic-pair"><span class="phonetic-char">${_escape(ch)}</span><span class="phonetic-word">${word}</span></span>`;
    }
    function _renderChunkPlain(ch) {
        if (ch === ' ') return '(space)';
        if (ch === '@') return '@ at';
        if (ch === '.') return '. dot';
        if (ch === '-') return '- dash';
        if (ch === '_') return '_ underscore';
        const word = PHONETIC[ch.toUpperCase()];
        return word ? `${ch} as in ${word}` : ch;
    }

    function _renderHtml(text, mode) {
        if (!text) return '<span class="phonetic-empty">Phonetic reading appears here.</span>';
        // Email mode preserves case so the reading matches what the user
        // is staring at. Other modes upper-case the source — `vin`/`plate`
        // already uppercased on input; `general`/`dl` just uppercase here
        // so a lowercase `s` reads as `S as in Sam` instead of skipping.
        const src = mode === 'email' ? text : text.toUpperCase();
        return src.split('').map(_renderChunkHtml).join('');
    }

    function _renderPlain(text, mode) {
        if (!text) return '';
        const src = mode === 'email' ? text : text.toUpperCase();
        return src.split('').map(_renderChunkPlain).join(', ');
    }

    function _escape(s) {
        if (typeof Utils !== 'undefined' && Utils.escapeHTML) return Utils.escapeHTML(s);
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function _copy(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => _fallbackCopy(text));
        } else {
            _fallbackCopy(text);
        }
    }

    function _fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        document.body.removeChild(ta);
    }

    // `MODE_PLACEHOLDERS` tells the user what shape the speller expects
    // before they type. Keeping it small keeps the modal scannable on a
    // call.
    const MODE_PLACEHOLDERS = Object.freeze({
        general: 'e.g. Smith',
        vin:     'e.g. 1HGBH41JXMN109186',
        dl:      'e.g. SMI-J*-562-8K',
        plate:   'e.g. 7ABC123',
        email:   'e.g. john.smith@example.com',
    });

    function open(seedOrOpts) {
        if (!_overlay) _overlay = _build();
        const input    = _overlay.querySelector('#phoneticInput');
        const readout  = _overlay.querySelector('#phoneticReadout');
        const warning  = _overlay.querySelector('#phoneticWarning');
        const applyBtn = _overlay.querySelector('.phonetic-apply');
        const customHintEl  = _overlay.querySelector('.phonetic-custom-hint');
        const defaultHintEl = _overlay.querySelector('.phonetic-default-hint');

        // Accept either a bare seed string (legacy `open('Smith')`) or
        // the new options object. Defaulting to general mode preserves
        // the original behavior for every existing call site.
        let seed = '';
        _mode = 'general';
        _onCommit = null;
        _customHint = '';
        if (typeof seedOrOpts === 'string') {
            seed = seedOrOpts;
        } else if (seedOrOpts && typeof seedOrOpts === 'object') {
            seed = seedOrOpts.seed || '';
            if (seedOrOpts.mode && MODE_PLACEHOLDERS[seedOrOpts.mode]) _mode = seedOrOpts.mode;
            if (typeof seedOrOpts.hint === 'string') _customHint = seedOrOpts.hint;
            if (typeof seedOrOpts.onCommit === 'function') _onCommit = seedOrOpts.onCommit;
        }

        input.value = seed;
        input.placeholder = MODE_PLACEHOLDERS[_mode];
        warning.style.display = 'none';
        readout.innerHTML = _renderHtml(input.value, _mode);
        // Apply button only shows when the caller passed an `onCommit`
        // (i.e. wants the speller to write the cleaned value back into
        // the field on accept).
        applyBtn.style.display = _onCommit ? '' : 'none';
        if (_customHint) {
            customHintEl.textContent = _customHint;
            customHintEl.style.display = '';
            defaultHintEl.style.display = 'none';
        } else {
            customHintEl.style.display = 'none';
            defaultHintEl.style.display = '';
        }

        _overlay.classList.add('active');
        setTimeout(() => {
            input.focus();
            // Trigger one validation pass so the warning fires on a
            // pre-filled VIN that already contains I/O/Q.
            input.dispatchEvent(new Event('input'));
        }, 50);
    }

    function close() {
        if (_overlay) _overlay.classList.remove('active');
    }

    return { open, close };
})();
