/**
 * Altech EZLynx V2 — Jest test setup
 *
 * jsdom doesn't implement document.execCommand, so we polyfill
 * 'insertText' and 'delete' to mimic their behaviour on a focused input.
 * This only covers the "wrote to the DOM" half of the V2 fill contract;
 * the "reached Angular FormControl" half is validated manually per §12.3.
 */

// Polyfill execCommand on jsdom's document.
if (typeof document !== 'undefined' && typeof document.execCommand !== 'function') {
    document.execCommand = function (cmd, _ui, arg) {
        const el = document.activeElement;
        if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return false;
        if (cmd === 'insertText') {
            const str = arg == null ? '' : String(arg);
            // Respect current selection range if available.
            const start = el.selectionStart != null ? el.selectionStart : (el.value || '').length;
            const end = el.selectionEnd != null ? el.selectionEnd : start;
            const cur = el.value || '';
            el.value = cur.slice(0, start) + str + cur.slice(end);
            try { el.setSelectionRange(start + str.length, start + str.length); } catch (_) {}
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        }
        if (cmd === 'delete') {
            const start = el.selectionStart != null ? el.selectionStart : 0;
            const end = el.selectionEnd != null ? el.selectionEnd : (el.value || '').length;
            const cur = el.value || '';
            el.value = cur.slice(0, start) + cur.slice(end);
            try { el.setSelectionRange(start, start); } catch (_) {}
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        }
        return false;
    };
}

// jsdom has querySelectorAll but `.mat-mdc-option` won't exist in our
// bare-bones test fixtures by default — individual tests construct them.
