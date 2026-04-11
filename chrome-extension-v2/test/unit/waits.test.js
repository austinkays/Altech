/**
 * Altech EZLynx V2 — Waits test suite
 */
const { pollPredicate } = require('../../src/content/waits/poll-predicate');
const { waitElement } = require('../../src/content/waits/wait-element');
const { waitEnabled } = require('../../src/content/waits/wait-enabled');
const { waitChildAtomsReady } = require('../../src/content/waits/wait-child-atoms-ready');

afterEach(() => { document.body.innerHTML = ''; });

describe('pollPredicate', () => {
    test('resolves immediately when predicate starts true', async () => {
        const r = await pollPredicate(() => 'yes', { timeoutMs: 1000, intervalMs: 10 });
        expect(r.ok).toBe(true);
        expect(r.value).toBe('yes');
    });

    test('resolves after the predicate becomes true', async () => {
        let flag = false;
        setTimeout(() => { flag = true; }, 30);
        const r = await pollPredicate(() => flag, { timeoutMs: 500, intervalMs: 10 });
        expect(r.ok).toBe(true);
    });

    test('returns { ok: false } on timeout', async () => {
        const r = await pollPredicate(() => false, { timeoutMs: 80, intervalMs: 20 });
        expect(r.ok).toBe(false);
        expect(r.elapsedMs).toBeGreaterThanOrEqual(60);
    });

    test('swallows predicate exceptions and keeps polling', async () => {
        let calls = 0;
        const r = await pollPredicate(() => {
            calls++;
            if (calls < 3) throw new Error('boom');
            return 'ok';
        }, { timeoutMs: 500, intervalMs: 10 });
        expect(r.ok).toBe(true);
        expect(r.value).toBe('ok');
    });
});

describe('waitElement', () => {
    test('resolves to the element once it exists', async () => {
        setTimeout(() => {
            const el = document.createElement('div');
            el.id = 'appears-later';
            document.body.appendChild(el);
        }, 30);
        const el = await waitElement('#appears-later', { timeoutMs: 500 });
        expect(el).not.toBeNull();
        expect(el.id).toBe('appears-later');
    });

    test('returns null on timeout', async () => {
        const el = await waitElement('#never-appears', { timeoutMs: 60 });
        expect(el).toBeNull();
    });
});

describe('waitEnabled', () => {
    test('resolves once disabled flips to false', async () => {
        const el = document.createElement('input');
        el.disabled = true;
        document.body.appendChild(el);
        setTimeout(() => { el.disabled = false; }, 30);
        const ok = await waitEnabled(el, { timeoutMs: 500 });
        expect(ok).toBe(true);
    });

    test('returns false on timeout', async () => {
        const el = document.createElement('input');
        el.disabled = true;
        document.body.appendChild(el);
        const ok = await waitEnabled(el, { timeoutMs: 60 });
        expect(ok).toBe(false);
    });

    test('returns false when element is null', async () => {
        expect(await waitEnabled(null)).toBe(false);
    });
});

describe('waitChildAtomsReady', () => {
    test('resolves when all child ids exist', async () => {
        setTimeout(() => {
            ['poolType', 'poolFenced'].forEach((id) => {
                const el = document.createElement('div');
                el.id = id;
                document.body.appendChild(el);
            });
        }, 30);
        const ok = await waitChildAtomsReady(['poolType', 'poolFenced'], { timeoutMs: 500 });
        expect(ok).toBe(true);
    });

    test('trivially resolves for an empty list', async () => {
        expect(await waitChildAtomsReady([])).toBe(true);
    });

    test('returns false when not all ids appear in time', async () => {
        // Only create one of the two expected ids.
        const el = document.createElement('div');
        el.id = 'onlyOne';
        document.body.appendChild(el);
        const ok = await waitChildAtomsReady(['onlyOne', 'missing'], { timeoutMs: 80 });
        expect(ok).toBe(false);
    });
});
