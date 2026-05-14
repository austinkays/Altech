// Unit tests for the v2 Rentcast counter helpers — focuses on the
// pure-logic seams (AAD envelope detection, period reset math,
// snapshot shape). Network + UI flows (modal, subscribe fan-out) are
// covered by the integration smoke in tests/intake-v2.test.js.

const fs = require('fs');
const path = require('path');

function loadRentcast() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'intake-v2-rentcast.js'), 'utf8');
    const sandbox = {
        window: {},
        document: {
            createElement: () => ({
                classList: { add() {}, remove() {}, toggle() {} },
                setAttribute() {},
                addEventListener() {},
                appendChild() {},
                querySelector() { return null; },
                hidden: true,
            }),
            body: { appendChild() {} },
            addEventListener() {},
        },
        console,
        setTimeout,
        clearTimeout,
    };
    sandbox.window.IntakeV2MapsKey = { getPricing: async () => null };
    // No Sync — _readBlob / _writeBlob short-circuit to no-ops which is
    // what we want for the snapshot-fallback path.
    new Function('window', 'document', 'console', 'setTimeout', 'clearTimeout', source)
        (sandbox.window, sandbox.document, sandbox.console, sandbox.setTimeout, sandbox.clearTimeout);
    return { sandbox, mod: sandbox.window.IntakeV2Rentcast };
}

describe('IntakeV2Rentcast — snapshot fallback', () => {
    test('Returns sane defaults when window.Sync is missing', async () => {
        const { mod } = loadRentcast();
        const snap = await mod.getSnapshot();
        expect(snap.count).toBe(0);
        expect(snap.limit).toBe(50);       // default limit when pricing endpoint absent
        expect(snap.remaining).toBe(50);
        expect(snap.isOver).toBe(false);
        expect(snap.nextReset).toBeInstanceOf(Date);
    });

    test('Snapshot uses the pricing endpoint freeMonthlyLimit when present', async () => {
        const { sandbox, mod } = loadRentcast();
        sandbox.window.IntakeV2MapsKey.getPricing = async () => ({
            perCall: 0.75, freeMonthlyLimit: 100, currency: 'USD',
        });
        const snap = await mod.getSnapshot();
        expect(snap.limit).toBe(100);
        expect(snap.remaining).toBe(100);
        expect(snap.pricing.perCall).toBe(0.75);
    });
});

describe('IntakeV2Rentcast — AAD envelope defense (bug-hunt #2)', () => {
    test('A v=2 AAD envelope on the blob is treated as missing, not as a counter', async () => {
        // If SupabaseSync's row-AAD wrap ever stamps `{v:2, iv, ct}`
        // over the metering blob, the keys look like
        // `{count: undefined, periodDay: undefined, periodStart:
        // undefined}` — every read would silently zero the counter.
        // The defense returns null so the fallback `{0, 1, ''}` kicks
        // in instead.
        const { sandbox, mod } = loadRentcast();
        sandbox.window.Sync = {
            pullBlob: async (key) => key === 'rentcastUsage'
                ? { ciphertext: JSON.stringify({ v: 2, iv: 'abc', ct: 'xyz' }) }
                : null,
            pushBlob: async () => ({ ok: true }),
        };
        const snap = await mod.getSnapshot();
        // Counter falls through to the default (count=0) instead of
        // adopting the envelope keys as the shape.
        expect(snap.count).toBe(0);
        expect(snap.remaining).toBe(50);
    });

    test('A genuine counter blob is parsed and returned', async () => {
        const { sandbox, mod } = loadRentcast();
        const today = new Date();
        const periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
            .toISOString().slice(0, 10);
        sandbox.window.Sync = {
            pullBlob: async () => ({
                ciphertext: JSON.stringify({ count: 12, periodDay: 1, periodStart }),
            }),
            pushBlob: async () => ({ ok: true }),
        };
        const snap = await mod.getSnapshot();
        expect(snap.count).toBe(12);
        expect(snap.remaining).toBe(38);
    });

    test('A blob with a periodStart older than the computed last-reset zeros the counter', async () => {
        // Auto-reset on the first read after the monthly boundary.
        const { sandbox, mod } = loadRentcast();
        sandbox.window.Sync = {
            pullBlob: async () => ({
                ciphertext: JSON.stringify({ count: 49, periodDay: 1, periodStart: '2020-01-01' }),
            }),
            pushBlob: async () => ({ ok: true }),
        };
        const snap = await mod.getSnapshot();
        expect(snap.count).toBe(0);  // old period — auto-reset
    });
});
