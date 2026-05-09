/**
 * Activity Log — unit tests for the ring buffer + persistence + dedupe.
 * Loads js/activity-log.js into a JSDOM context with a stub localStorage.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'activity-log.js'), 'utf8');
const KEY = 'altech_activity_log';

function bootstrapLog() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'http://localhost',
        runScripts: 'outside-only',
    });
    dom.window.STORAGE_KEYS = { ACTIVITY_LOG: KEY };
    dom.window.eval(SRC);
    return dom;
}

describe('ActivityLog', () => {
    test('public API is exposed', () => {
        const dom = bootstrapLog();
        const a = dom.window.ActivityLog;
        expect(typeof a.add).toBe('function');
        expect(typeof a.list).toBe('function');
        expect(typeof a.lastStatus).toBe('function');
        expect(typeof a.subscribe).toBe('function');
        expect(typeof a.clear).toBe('function');
        expect(typeof a.openPanel).toBe('function');
        dom.window.close();
    });

    test('add() prepends an entry, list() returns newest-first', () => {
        const dom = bootstrapLog();
        const { ActivityLog } = dom.window;
        ActivityLog.add({ type: 'save', message: 'first', area: 'cgl' });
        ActivityLog.add({ type: 'save', message: 'second', area: 'cgl' });
        const list = ActivityLog.list();
        expect(list).toHaveLength(2);
        expect(list[0].message).toBe('second');
        expect(list[1].message).toBe('first');
        dom.window.close();
    });

    test('lastStatus reflects most recent entry', () => {
        const dom = bootstrapLog();
        const { ActivityLog } = dom.window;
        expect(ActivityLog.lastStatus()).toBeNull();
        ActivityLog.add({ type: 'save', message: 'ok' });
        ActivityLog.add({ type: 'error', message: 'broke', ok: false });
        const last = ActivityLog.lastStatus();
        expect(last.ok).toBe(false);
        expect(last.message).toBe('broke');
        dom.window.close();
    });

    test('persists to localStorage and survives reload', () => {
        const dom = bootstrapLog();
        dom.window.ActivityLog.add({ type: 'save', message: 'persisted' });
        const stored = dom.window.localStorage.getItem(KEY);
        expect(stored).toContain('persisted');
        dom.window.close();

        // Re-bootstrap (simulates reload) using SAME storage by sharing key
        const dom2 = new JSDOM('<!doctype html><html><body></body></html>', {
            url: 'http://localhost',
            runScripts: 'outside-only',
        });
        dom2.window.STORAGE_KEYS = { ACTIVITY_LOG: KEY };
        dom2.window.localStorage.setItem(KEY, stored);
        dom2.window.eval(SRC);
        const list = dom2.window.ActivityLog.list();
        expect(list).toHaveLength(1);
        expect(list[0].message).toBe('persisted');
        dom2.window.close();
    });

    test('caps at 100 entries (oldest dropped)', () => {
        const dom = bootstrapLog();
        const { ActivityLog } = dom.window;
        for (let i = 0; i < 150; i++) {
            ActivityLog.add({ type: 'save', message: `entry-${i}` });
        }
        const list = ActivityLog.list();
        expect(list).toHaveLength(100);
        // Most recent should be entry-149, oldest in buffer should be entry-50.
        expect(list[0].message).toBe('entry-149');
        expect(list[list.length - 1].message).toBe('entry-50');
        dom.window.close();
    });

    test('subscribe fires on add and unsubscribe stops further calls', () => {
        const dom = bootstrapLog();
        const { ActivityLog } = dom.window;
        const seen = [];
        const unsub = ActivityLog.subscribe(e => seen.push(e && e.message));
        ActivityLog.add({ type: 'save', message: 'a' });
        ActivityLog.add({ type: 'save', message: 'b' });
        unsub();
        ActivityLog.add({ type: 'save', message: 'c' });
        expect(seen).toEqual(['a', 'b']);
        dom.window.close();
    });

    test('clear() empties the buffer + storage and notifies subscribers', () => {
        const dom = bootstrapLog();
        const { ActivityLog } = dom.window;
        ActivityLog.add({ type: 'save', message: 'x' });
        let cleared = false;
        ActivityLog.subscribe(e => { if (e === null) cleared = true; });
        ActivityLog.clear();
        expect(ActivityLog.list()).toHaveLength(0);
        expect(cleared).toBe(true);
        expect(dom.window.localStorage.getItem(KEY)).toBe('[]');
        dom.window.close();
    });

    test('add() truncates very long detail strings', () => {
        const dom = bootstrapLog();
        const { ActivityLog } = dom.window;
        const longDetail = 'x'.repeat(2000);
        ActivityLog.add({ type: 'error', message: 'big', detail: longDetail, ok: false });
        const e = ActivityLog.list()[0];
        expect(e.detail.length).toBe(500);
        dom.window.close();
    });

    test('add() with no message is a no-op (defensive)', () => {
        const dom = bootstrapLog();
        const { ActivityLog } = dom.window;
        ActivityLog.add({});
        ActivityLog.add(null);
        expect(ActivityLog.list()).toHaveLength(0);
        dom.window.close();
    });

    test('errored entries have ok=false; default ok is true', () => {
        const dom = bootstrapLog();
        const { ActivityLog } = dom.window;
        ActivityLog.add({ type: 'save', message: 'ok-by-default' });
        ActivityLog.add({ type: 'error', message: 'broke', ok: false });
        const list = ActivityLog.list();
        expect(list[0].ok).toBe(false);
        expect(list[1].ok).toBe(true);
        dom.window.close();
    });

    test('openPanel/closePanel render and remove the slide-out', () => {
        const dom = bootstrapLog();
        const { ActivityLog } = dom.window;
        ActivityLog.add({ type: 'save', message: 'visible' });
        ActivityLog.openPanel();
        const panel = dom.window.document.getElementById('altechActivityPanel');
        expect(panel).not.toBeNull();
        expect(panel.querySelector('#altechActivityList').textContent).toContain('visible');
        ActivityLog.closePanel();
        expect(panel.style.right).toBe('-420px');
        dom.window.close();
    });
});
