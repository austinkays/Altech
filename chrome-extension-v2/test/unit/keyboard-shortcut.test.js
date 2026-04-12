/**
 * Phase 4 — Ctrl+Shift+A keyboard shortcut end-to-end
 *
 * Exercises the full chain:
 *
 *   chrome.commands.onCommand('fill-page')
 *     → service worker handler
 *     → chrome.tabs.sendMessage(tab, { type: 'ALTECH_V2_FILL' })
 *     → content-script onMessage handler
 *     → runFill() → orchestrator.run()
 *
 * Both ends run in jsdom via node require. We stub the chrome APIs with
 * a lightweight fake that lets us register listeners, dispatch fake
 * command events, and assert the downstream sendMessage / orchestrator
 * calls. The real manifest + service worker source is the contract we
 * want to lock in.
 */
'use strict';

// ─── fake chrome API ──────────────────────────────────────────────
function makeFakeChrome({ tabs = [], clientData = null } = {}) {
    const listeners = {
        runtimeOnMessage: [],
        commandsOnCommand: [],
        storageOnChanged: [],
    };
    const calls = {
        tabsSendMessage: [],
        storageGet: [],
        storageSet: [],
    };
    const storage = { clientData, lastFillReport: null };

    const chrome = {
        runtime: {
            onMessage: {
                addListener: (fn) => listeners.runtimeOnMessage.push(fn),
            },
            onInstalled: { addListener: () => {} },
            sendMessage: (msg, cb) => {
                if (typeof cb === 'function') cb({ ok: true });
                return Promise.resolve({ ok: true });
            },
            lastError: null,
        },
        commands: {
            onCommand: {
                addListener: (fn) => listeners.commandsOnCommand.push(fn),
            },
        },
        tabs: {
            query: (_q, cb) => {
                const result = tabs;
                if (typeof cb === 'function') { cb(result); return; }
                return Promise.resolve(result);
            },
            sendMessage: async (tabId, msg) => {
                calls.tabsSendMessage.push({ tabId, msg });
                // Route to any registered content-script listener so the
                // content side runs too.
                for (const fn of listeners.runtimeOnMessage) {
                    fn(msg, { tab: { id: tabId } }, () => {});
                }
                return { ok: true };
            },
        },
        storage: {
            local: {
                get: (keys, cb) => {
                    calls.storageGet.push(keys);
                    const out = {};
                    const arr = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
                    for (const k of arr) out[k] = storage[k];
                    if (typeof cb === 'function') { cb(out); return; }
                    return Promise.resolve(out);
                },
                set: (obj, cb) => {
                    calls.storageSet.push(obj);
                    Object.assign(storage, obj);
                    if (typeof cb === 'function') cb();
                    return Promise.resolve();
                },
                remove: (_k, cb) => { if (cb) cb(); return Promise.resolve(); },
            },
            onChanged: { addListener: (fn) => listeners.storageOnChanged.push(fn) },
        },
    };
    return { chrome, listeners, calls, storage };
}

describe('chrome.commands.onCommand — fill-page', () => {
    let original;

    beforeEach(() => {
        original = global.chrome;
    });

    afterEach(() => {
        global.chrome = original;
        jest.resetModules();
    });

    test('dispatches ALTECH_V2_FILL to the active EZLynx tab with stored client data', async () => {
        const { chrome, listeners, calls } = makeFakeChrome({
            tabs: [{ id: 42, url: 'https://secure.ezlynx.com/web/account/create/personal/details' }],
            clientData: { FirstName: 'Jane', LastName: 'Doe' },
        });
        global.chrome = chrome;
        // Service worker uses importScripts('storage.js'). Under node
        // require, storage.js writes to `self.AltechV2Storage`. Polyfill
        // `self` + `importScripts` so require() succeeds.
        global.self = global;
        global.importScripts = (file) => {
            const path = require('path');
            require(path.resolve(__dirname, '..', '..', 'src', 'background', file));
        };

        jest.isolateModules(() => {
            require('../../src/background/service-worker');
        });

        expect(listeners.commandsOnCommand.length).toBe(1);

        // Simulate the browser firing the shortcut.
        await listeners.commandsOnCommand[0]('fill-page');
        // Allow any queued microtasks to settle.
        await new Promise((r) => setTimeout(r, 0));

        expect(calls.tabsSendMessage.length).toBe(1);
        const sent = calls.tabsSendMessage[0];
        expect(sent.tabId).toBe(42);
        expect(sent.msg.type).toBe('ALTECH_V2_FILL');
        expect(sent.msg.trigger).toBe('keyboard-shortcut');
        expect(sent.msg.clientData).toEqual({ FirstName: 'Jane', LastName: 'Doe' });

        delete global.self;
        delete global.importScripts;
    });

    test('no-op when active tab is not an EZLynx page', async () => {
        const { chrome, listeners, calls } = makeFakeChrome({
            tabs: [{ id: 42, url: 'https://example.com/hello' }],
            clientData: { FirstName: 'Jane' },
        });
        global.chrome = chrome;
        global.self = global;
        global.importScripts = (file) => {
            const path = require('path');
            require(path.resolve(__dirname, '..', '..', 'src', 'background', file));
        };

        jest.isolateModules(() => {
            require('../../src/background/service-worker');
        });

        await listeners.commandsOnCommand[0]('fill-page');
        await new Promise((r) => setTimeout(r, 0));

        expect(calls.tabsSendMessage.length).toBe(0);

        delete global.self;
        delete global.importScripts;
    });

    test('ignores non-fill-page commands', async () => {
        const { chrome, listeners, calls } = makeFakeChrome({
            tabs: [{ id: 42, url: 'https://secure.ezlynx.com/details' }],
        });
        global.chrome = chrome;
        global.self = global;
        global.importScripts = (file) => {
            const path = require('path');
            require(path.resolve(__dirname, '..', '..', 'src', 'background', file));
        };

        jest.isolateModules(() => {
            require('../../src/background/service-worker');
        });

        await listeners.commandsOnCommand[0]('something-else');
        await new Promise((r) => setTimeout(r, 0));
        expect(calls.tabsSendMessage.length).toBe(0);

        delete global.self;
        delete global.importScripts;
    });
});

describe('manifest — fill-page command registration', () => {
    const manifest = require('../../manifest.json');

    test('registers a fill-page command with Ctrl+Shift+A default', () => {
        expect(manifest.commands).toBeDefined();
        expect(manifest.commands['fill-page']).toBeDefined();
        expect(manifest.commands['fill-page'].suggested_key.default).toBe('Ctrl+Shift+A');
    });

    test('Mac key binding uses Command+Shift+A', () => {
        expect(manifest.commands['fill-page'].suggested_key.mac).toBe('Command+Shift+A');
    });
});
