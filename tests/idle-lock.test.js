// IdleLock tests — verify the inactivity timer fires CryptoHelper.lock on
// timeout, can be configured via STORAGE_KEYS.IDLE_TIMEOUT_MS, resets on
// user activity, and stops cleanly.

const _store = new Map();

beforeEach(() => {
    _store.clear();
    jest.useFakeTimers();

    globalThis.localStorage = {
        getItem: (k) => _store.has(k) ? _store.get(k) : null,
        setItem: (k, v) => _store.set(k, String(v)),
        removeItem: (k) => _store.delete(k),
        clear: () => _store.clear(),
        get length() { return _store.size; },
        key: (i) => Array.from(_store.keys())[i] || null,
    };
    globalThis.window = globalThis;
    globalThis.STORAGE_KEYS = Object.freeze({
        IDLE_TIMEOUT_MS: 'altech_idle_timeout_ms',
        E2E_CRYPTO_V2:   'altech_e2e_crypto_v2',
    });

    // EventTarget shim — IdleLock uses window.addEventListener / removeEventListener.
    const _listeners = new Map();
    globalThis.window.addEventListener = jest.fn((evt, cb) => {
        if (!_listeners.has(evt)) _listeners.set(evt, new Set());
        _listeners.get(evt).add(cb);
    });
    globalThis.window.removeEventListener = jest.fn((evt, cb) => {
        if (_listeners.has(evt)) _listeners.get(evt).delete(cb);
    });
    globalThis.window._listeners = _listeners;
    globalThis.window._fireEvent = (evt) => {
        if (_listeners.has(evt)) {
            for (const cb of _listeners.get(evt)) cb({ type: evt });
        }
    };

    // Minimal document for visibilitychange.
    globalThis.document = {
        visibilityState: 'visible',
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    };

    // CryptoHelper.lock spy — count calls.
    globalThis.CryptoHelper = {
        lock: jest.fn(),
        isV2Unlocked: jest.fn(() => true),
    };

    globalThis.ActivityLog = { add: jest.fn() };
    globalThis.window.ActivityLog = globalThis.ActivityLog;
});

afterEach(() => {
    jest.useRealTimers();
});

function loadIdleLock() {
    let IL;
    jest.isolateModules(() => {
        require('../js/idle-lock.js');
        IL = globalThis.window.IdleLock;
    });
    return IL;
}

describe('IdleLock — basic operation', () => {
    test('init() arms the timer; default timeout is 15 minutes', () => {
        const IL = loadIdleLock();
        expect(IL.DEFAULT_TIMEOUT_MS).toBe(15 * 60 * 1000);
        IL.init();
        expect(IL.isRunning()).toBe(true);
        expect(IL.getTimeoutMs()).toBe(15 * 60 * 1000);
    });

    test('timer firing calls CryptoHelper.lock() + logs activity event', () => {
        const IL = loadIdleLock();
        IL.init();
        // Fast-forward 15 min — the lock action fires.
        jest.advanceTimersByTime(15 * 60 * 1000 + 10);
        expect(CryptoHelper.lock).toHaveBeenCalledTimes(1);
        expect(ActivityLog.add).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'sync', area: 'idle-lock', ok: true })
        );
    });

    test('user activity resets the timer — no lock if events keep firing', () => {
        const IL = loadIdleLock();
        IL.init();
        // Simulate 14 min of work with activity every minute.
        for (let i = 0; i < 14; i++) {
            jest.advanceTimersByTime(60 * 1000);
            globalThis.window._fireEvent('mousemove');
        }
        // 14 minutes elapsed, but each mousemove reset the timer — no lock.
        expect(CryptoHelper.lock).not.toHaveBeenCalled();
        // Now go idle for the full timeout.
        jest.advanceTimersByTime(15 * 60 * 1000 + 10);
        expect(CryptoHelper.lock).toHaveBeenCalledTimes(1);
    });

    test('disabled (timeout=0) does not arm the timer', () => {
        _store.set('altech_idle_timeout_ms', '0');
        const IL = loadIdleLock();
        IL.init();
        expect(IL.isRunning()).toBe(false);
        jest.advanceTimersByTime(60 * 60 * 1000);
        expect(CryptoHelper.lock).not.toHaveBeenCalled();
    });

    test('custom timeout from localStorage is honored', () => {
        _store.set('altech_idle_timeout_ms', String(5 * 60 * 1000)); // 5 min
        const IL = loadIdleLock();
        IL.init();
        expect(IL.getTimeoutMs()).toBe(5 * 60 * 1000);
        jest.advanceTimersByTime(5 * 60 * 1000 + 10);
        expect(CryptoHelper.lock).toHaveBeenCalledTimes(1);
    });

    test('setTimeoutMs() persists + re-arms', () => {
        const IL = loadIdleLock();
        IL.init();
        IL.setTimeoutMs(2 * 60 * 1000); // 2 min
        expect(_store.get('altech_idle_timeout_ms')).toBe(String(2 * 60 * 1000));
        jest.advanceTimersByTime(2 * 60 * 1000 + 10);
        expect(CryptoHelper.lock).toHaveBeenCalledTimes(1);
    });

    test('stop() cancels the timer and removes listeners', () => {
        const IL = loadIdleLock();
        IL.init();
        IL.stop();
        expect(IL.isRunning()).toBe(false);
        jest.advanceTimersByTime(15 * 60 * 1000 + 10);
        expect(CryptoHelper.lock).not.toHaveBeenCalled();
    });

    test('lockNow() fires immediately', () => {
        const IL = loadIdleLock();
        IL.init();
        IL.lockNow();
        expect(CryptoHelper.lock).toHaveBeenCalledTimes(1);
    });

    test('onLock(cb) fires when the timer trips', () => {
        const IL = loadIdleLock();
        const cb = jest.fn();
        IL.onLock(cb);
        IL.init();
        jest.advanceTimersByTime(15 * 60 * 1000 + 10);
        expect(cb).toHaveBeenCalledTimes(1);
    });
});
