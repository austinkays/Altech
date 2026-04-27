/**
 * Phonetic Speller — small popup utility for repeating client info
 * back over the phone. Uses the APCO phonetic alphabet
 * (Adam, Boy, Charles…) — same set as the VIN decoder.
 *
 * Public API:
 *   PhoneticSpeller.open(seed?)  // open the popup, optional pre-fill
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
                    <div id="phoneticReadout" class="phonetic-readout" aria-live="polite"></div>
                    <div class="phonetic-actions">
                        <button type="button" class="btn btn-secondary phonetic-copy">📋 Copy reading</button>
                        <button type="button" class="btn phonetic-clear">Clear</button>
                    </div>
                    <p class="phonetic-hint">APCO alphabet — Adam, Boy, Charles… Read each spelling aloud to confirm.</p>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#phoneticInput');
        const readout = overlay.querySelector('#phoneticReadout');

        const update = () => { readout.innerHTML = _renderHtml(input.value); };
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
            const text = _renderPlain(input.value);
            if (!text) return;
            _copy(text);
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('📋 Phonetic reading copied');
            }
        });

        document.addEventListener('keydown', _onKey);
        return overlay;
    }

    function _onKey(e) {
        if (e.key === 'Escape' && _overlay && _overlay.classList.contains('active')) {
            close();
        }
    }

    function _renderHtml(text) {
        if (!text) return '<span class="phonetic-empty">Phonetic reading appears here.</span>';
        return text.toUpperCase().split('').map(ch => {
            if (ch === ' ') return '<span class="phonetic-space">␣ space</span>';
            const word = PHONETIC[ch];
            if (!word) return `<span class="phonetic-pair phonetic-pair-other"><span class="phonetic-char">${_escape(ch)}</span></span>`;
            return `<span class="phonetic-pair"><span class="phonetic-char">${ch}</span><span class="phonetic-word">${word}</span></span>`;
        }).join('');
    }

    function _renderPlain(text) {
        if (!text) return '';
        return text.toUpperCase().split('').map(ch => {
            if (ch === ' ') return '(space)';
            const word = PHONETIC[ch];
            return word ? `${ch} as in ${word}` : ch;
        }).join(', ');
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

    function open(seed) {
        if (!_overlay) _overlay = _build();
        const input = _overlay.querySelector('#phoneticInput');
        const readout = _overlay.querySelector('#phoneticReadout');
        if (typeof seed === 'string') input.value = seed;
        readout.innerHTML = _renderHtml(input.value);
        _overlay.classList.add('active');
        setTimeout(() => input.focus(), 50);
    }

    function close() {
        if (_overlay) _overlay.classList.remove('active');
    }

    return { open, close };
})();
