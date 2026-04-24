/**
 * Altech EZLynx V2 — dismissOverlay tests
 *
 * Covers the early-exit fast path (when no overlay is open, the function
 * must NOT block on a setTimeout) and the cascade cleanup behavior that
 * fires when stacked overlays are present.
 */
const { dismissOverlay, hasOpenOverlay } = require('../../src/content/special-cases/dismiss-overlay');

afterEach(() => { document.body.innerHTML = ''; });

function makeOverlayWith(optionCount) {
    const container = document.createElement('div');
    container.className = 'cdk-overlay-container';
    const backdrop = document.createElement('div');
    backdrop.className = 'cdk-overlay-backdrop';
    container.appendChild(backdrop);
    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';
    for (let i = 0; i < optionCount; i++) {
        const opt = document.createElement('mat-option');
        opt.className = 'mat-mdc-option';
        opt.textContent = 'Option ' + i;
        pane.appendChild(opt);
    }
    container.appendChild(pane);
    document.body.appendChild(container);
    return container;
}

describe('hasOpenOverlay', () => {
    test('returns false on a clean document', () => {
        expect(hasOpenOverlay()).toBe(false);
    });

    test('returns true when a backdrop exists', () => {
        const bd = document.createElement('div');
        bd.className = 'cdk-overlay-backdrop';
        document.body.appendChild(bd);
        expect(hasOpenOverlay()).toBe(true);
    });

    test('returns true when an option panel is mounted', () => {
        makeOverlayWith(2);
        expect(hasOpenOverlay()).toBe(true);
    });
});

describe('dismissOverlay — fast path', () => {
    test('returns false synchronously fast when no overlay is open', async () => {
        const start = Date.now();
        const result = await dismissOverlay();
        const elapsed = Date.now() - start;
        expect(result).toBe(false);
        // Should resolve in well under 50 ms — the old implementation slept
        // 300 ms unconditionally. We assert << 50 ms to catch regressions.
        expect(elapsed).toBeLessThan(50);
    });
});

describe('dismissOverlay — backdrop click path', () => {
    test('clicks every backdrop, not just the first', async () => {
        const clicks = [];
        // Two stacked overlays.
        for (let i = 0; i < 2; i++) {
            const bd = document.createElement('div');
            bd.className = 'cdk-overlay-backdrop';
            bd.dataset.idx = String(i);
            bd.addEventListener('click', () => clicks.push(i));
            document.body.appendChild(bd);
        }
        await dismissOverlay(0); // 0ms delay so test is fast
        expect(clicks).toEqual([0, 1]);
    });

    test('returns true when at least one overlay was found', async () => {
        const bd = document.createElement('div');
        bd.className = 'cdk-overlay-backdrop';
        document.body.appendChild(bd);
        const result = await dismissOverlay(0);
        expect(result).toBe(true);
    });
});

describe('dismissOverlay — escalation', () => {
    test('force-removes overlay panes when options remain after Escape', async () => {
        // Make an overlay whose backdrop click is a no-op (simulates a
        // page that intercepts the click — the symptom that produced
        // the original bug screenshot).
        const container = makeOverlayWith(3);
        const backdrop = container.querySelector('.cdk-overlay-backdrop');
        // Cancel the click before it fires — the overlay won't close
        // through normal means, forcing the cleanup escalation.
        backdrop.addEventListener('click', (e) => e.stopPropagation(), true);

        const result = await dismissOverlay(0);
        expect(result).toBe(true);

        // The pane should have been force-removed.
        expect(document.querySelectorAll('.cdk-overlay-pane').length).toBe(0);
        expect(document.querySelectorAll('.cdk-overlay-backdrop').length).toBe(0);
    });
});
