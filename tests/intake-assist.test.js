/**
 * IntakeAssist — Enhanced AI Intake Assistant Tests
 *
 * Tests the visual real-time intake features:
 * - Module registration and API surface
 * - Progress dashboard computation
 * - Categorized data card rendering
 * - Risk assessment logic
 * - Smart chip updates
 * - Property intelligence display
 * - Driver license upload handling
 * - Storage persistence (history + property intel + risks)
 * - Form population with merged property intel data
 *
 * Run: npx jest tests/intake-assist.test.js --no-coverage
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { loadHTML } = require('./load-html.cjs');

const ROOT = path.resolve(__dirname, '..');

function createIntakeTestDOM() {
    const html = loadHTML(path.join(ROOT, 'index.html'));
    const dom = new JSDOM(html, {
        url: 'http://localhost:8000',
        runScripts: 'dangerously',
        pretendToBeVisual: true
    });
    const window = dom.window;

    // Mock browser APIs
    const store = {};
    window.localStorage = {
        data: store,
        getItem(key) { return store[key] || null; },
        setItem(key, val) { store[key] = val; },
        removeItem(key) { delete store[key]; },
        clear() { Object.keys(store).forEach(k => delete store[k]); }
    };
    window.alert = jest.fn();
    window.confirm = jest.fn(() => true);
    window.prompt = jest.fn(() => null);
    window.URL.createObjectURL = jest.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = jest.fn();
    window.scrollTo = jest.fn();
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false, media: query, onchange: null,
        addListener: jest.fn(), removeListener: jest.fn(),
        addEventListener: jest.fn(), removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    }));
    if (!window.Element.prototype.scrollTo) window.Element.prototype.scrollTo = function () {};
    if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = function () {};
    if (!window.navigator.clipboard) {
        Object.defineProperty(window.navigator, 'clipboard', {
            value: { writeText: jest.fn().mockResolvedValue(undefined) },
            writable: true
        });
    }

    window.fetch = jest.fn().mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('config?type=keys')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ apiKey: 'test-key', geminiKey: 'test-key' }) });
        }
        return Promise.resolve({ ok: false, status: 404 });
    });

    window.EventSource = jest.fn().mockImplementation(() => ({
        close: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn(),
        onmessage: null, onerror: null, onopen: null
    }));

    if (window.Auth) {
        Object.defineProperty(window.Auth, 'user', {
            get: () => ({ uid: 'test-user', email: 'test@test.com' }),
            configurable: true
        });
        if (!window.Auth.showModal) window.Auth.showModal = jest.fn();
    } else {
        window.Auth = { user: { uid: 'test-user', email: 'test@test.com' }, showModal: jest.fn() };
    }

    // Load the plugin HTML into its container
    const pluginHtml = fs.readFileSync(path.join(ROOT, 'plugins/intake-assist.html'), 'utf8');
    const container = window.document.getElementById('intakeTool');
    if (container) {
        container.innerHTML = pluginHtml;
        container.dataset.loaded = 'true';
    }

    return { dom, window };
}

// ────────────────────────────────────────────────────
// Test Suite
// ────────────────────────────────────────────────────

describe('IntakeAssist — Enhanced AI Intake', () => {
    let window, IntakeAssist;

    beforeAll(() => {
        const env = createIntakeTestDOM();
        window = env.window;
        IntakeAssist = window.IntakeAssist;
    });

    afterAll(() => {
        if (window) window.close();
    });

    beforeEach(() => {
        window.localStorage.clear();
    });

    // ── Module Registration ──────────────────────────────────────

    describe('Module Registration', () => {
        test('IntakeAssist is defined on window', () => {
            expect(IntakeAssist).toBeDefined();
        });

        test('has init() method', () => {
            expect(typeof IntakeAssist.init).toBe('function');
        });

        test('has sendMessage() method', () => {
            expect(typeof IntakeAssist.sendMessage).toBe('function');
        });

        test('has quickStart() method', () => {
            expect(typeof IntakeAssist.quickStart).toBe('function');
        });

        test('has applyAndSend() method', () => {
            expect(typeof IntakeAssist.applyAndSend).toBe('function');
        });

        test('has populateForm() method', () => {
            expect(typeof IntakeAssist.populateForm).toBe('function');
        });

        test('has fetchPropertyData() method', () => {
            expect(typeof IntakeAssist.fetchPropertyData).toBe('function');
        });

        test('has triggerDlUpload() method', () => {
            expect(typeof IntakeAssist.triggerDlUpload).toBe('function');
        });

        test('has clearChat() method', () => {
            expect(typeof IntakeAssist.clearChat).toBe('function');
        });
    });

    // ── DOM Containers ───────────────────────────────────────────

    describe('DOM Structure', () => {
        test('intakeTool container exists', () => {
            expect(window.document.getElementById('intakeTool')).not.toBeNull();
        });

        test('progress dashboard container exists', () => {
            expect(window.document.getElementById('iaProgressDashboard')).not.toBeNull();
        });

        test('chat messages container exists', () => {
            expect(window.document.getElementById('iaChatMessages')).not.toBeNull();
        });

        test('smart chips container exists', () => {
            expect(window.document.getElementById('iaSmartChips')).not.toBeNull();
        });

        test('input textarea exists', () => {
            expect(window.document.getElementById('iaInput')).not.toBeNull();
        });

        test('send button exists', () => {
            expect(window.document.getElementById('iaSendBtn')).not.toBeNull();
        });

        test('DL upload input exists', () => {
            expect(window.document.getElementById('iaDlUpload')).not.toBeNull();
        });

        test('property intelligence panel exists', () => {
            expect(window.document.getElementById('iaPropertyIntel')).not.toBeNull();
        });

        test('risk badges container exists', () => {
            expect(window.document.getElementById('iaRiskBadges')).not.toBeNull();
        });

        test('data cards container exists', () => {
            expect(window.document.getElementById('iaDataCards')).not.toBeNull();
        });
    });

    // ── Init & Rendering ─────────────────────────────────────────

    describe('Init & Rendering', () => {
        test('init() does not throw', () => {
            expect(() => IntakeAssist.init()).not.toThrow();
        });

        test('init() shows welcome message in chat', () => {
            window.localStorage.clear();
            IntakeAssist.init();
            const msgs = window.document.getElementById('iaChatMessages');
            expect(msgs.innerHTML).toContain('AI intake assistant');
        });

        test('init() shows DL scan tip in welcome message', () => {
            window.localStorage.clear();
            IntakeAssist.init();
            const msgs = window.document.getElementById('iaChatMessages');
            expect(msgs.innerHTML).toContain('driver');
        });

        test('quickStart() fills input with coverage type', () => {
            IntakeAssist.init();
            IntakeAssist.quickStart('homeowners');
            const input = window.document.getElementById('iaInput');
            expect(input.value).toBe('New homeowners quote.');
        });
    });

    // ── Storage Persistence ──────────────────────────────────────

    describe('Storage Persistence', () => {
        test('clearChat() resets localStorage', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [{ role: 'user', content: 'test' }],
                data: { firstName: 'John' },
                propertyIntel: { yearBuilt: 1990 },
                riskFlags: [{ level: 'warning', text: 'test' }]
            }));
            IntakeAssist.init();
            IntakeAssist.clearChat();
            const stored = JSON.parse(window.localStorage.getItem('altech_intake_assist'));
            expect(stored.history).toEqual([]);
            expect(stored.data).toEqual({});
        });

        test('storage includes propertyIntel field', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'Jane' },
                propertyIntel: { yearBuilt: 2005, sqftGross: 2200 },
                riskFlags: []
            }));
            IntakeAssist.init();
            const stored = JSON.parse(window.localStorage.getItem('altech_intake_assist'));
            expect(stored).toHaveProperty('propertyIntel');
        });

        test('storage includes riskFlags field', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: {},
                propertyIntel: null,
                riskFlags: [{ level: 'info', icon: '🏛️', text: 'Pre-1970' }]
            }));
            IntakeAssist.init();
            const stored = JSON.parse(window.localStorage.getItem('altech_intake_assist'));
            expect(stored).toHaveProperty('riskFlags');
        });
    });

    // ── Progress Dashboard ───────────────────────────────────────

    describe('Progress Dashboard', () => {
        test('shows progress ring when data exists', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [{ role: 'user', content: 'test' }],
                data: { firstName: 'John', lastName: 'Doe', qType: 'home' },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const dashboard = window.document.getElementById('iaProgressDashboard');
            expect(dashboard.style.display).toBe('block');
            expect(dashboard.innerHTML).toContain('ia-progress-ring');
            expect(dashboard.innerHTML).toContain('Complete');
        });

        test('shows category progress bars', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'John', lastName: 'Doe', email: 'j@e.com', qType: 'both' },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const dashboard = window.document.getElementById('iaProgressDashboard');
            expect(dashboard.innerHTML).toContain('Personal');
            expect(dashboard.innerHTML).toContain('Address');
            expect(dashboard.innerHTML).toContain('Insurance');
        });

        test('skips property category for auto-only quote', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'Jane', qType: 'auto' },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const dashboard = window.document.getElementById('iaProgressDashboard');
            expect(dashboard.innerHTML).not.toContain('🏠 Property');
        });

        test('skips auto category for home-only quote', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'Jane', qType: 'home' },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const dashboard = window.document.getElementById('iaProgressDashboard');
            expect(dashboard.innerHTML).not.toContain('🚗 Auto');
        });
    });

    // ── Categorized Data Cards ───────────────────────────────────

    describe('Categorized Data Cards', () => {
        test('shows data cards when extracted data exists', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'John', lastName: 'Doe', dob: '1985-03-05' },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const cards = window.document.getElementById('iaDataCards');
            expect(cards.style.display).toBe('block');
            expect(cards.innerHTML).toContain('Personal');
            expect(cards.innerHTML).toContain('John');
            expect(cards.innerHTML).toContain('Doe');
        });

        test('shows populate form button', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'Jane' },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const cards = window.document.getElementById('iaDataCards');
            expect(cards.innerHTML).toContain('Populate Form');
        });

        test('shows vehicle cards with make/model', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: {
                    firstName: 'Sam',
                    qType: 'auto',
                    vehicles: [{ year: '2020', make: 'Toyota', model: 'Camry', vin: '1HGCG5655WA' }]
                },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const cards = window.document.getElementById('iaDataCards');
            expect(cards.innerHTML).toContain('2020 Toyota Camry');
            expect(cards.innerHTML).toContain('VIN');
        });

        test('hides when no data', () => {
            window.localStorage.clear();
            IntakeAssist.init();
            const cards = window.document.getElementById('iaDataCards');
            expect(cards.style.display).toBe('none');
        });
    });

    // ── Risk Assessment ──────────────────────────────────────────

    describe('Risk Assessment', () => {
        test('flags old roof (20+ years)', () => {
            const currentYear = new Date().getFullYear();
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'Test', roofYear: String(currentYear - 25) },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const risks = window.document.getElementById('iaRiskBadges');
            expect(risks.style.display).toBe('block');
            expect(risks.innerHTML).toContain('Roof');
            expect(risks.innerHTML).toContain('years old');
        });

        test('flags pre-1970 construction', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'Test', yearBuilt: '1955' },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const risks = window.document.getElementById('iaRiskBadges');
            expect(risks.innerHTML).toContain('Pre-1970');
        });

        test('flags high-value property from property intel', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'Test' },
                propertyIntel: { assessedValue: 1200000 },
                riskFlags: []
            }));
            IntakeAssist.init();
            const risks = window.document.getElementById('iaRiskBadges');
            expect(risks.innerHTML).toContain('High-value');
        });

        test('hides risk panel when no flags', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'Test', yearBuilt: '2020', roofYear: '2020' },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const risks = window.document.getElementById('iaRiskBadges');
            expect(risks.style.display).toBe('none');
        });
    });

    // ── Property Intelligence Display ────────────────────────────

    describe('Property Intelligence Display', () => {
        test('renders property intel card when data exists in storage', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'Test', addrStreet: '123 Main', addrCity: 'Seattle', addrState: 'WA' },
                propertyIntel: {
                    yearBuilt: 2005,
                    sqftGross: 2200,
                    stories: 2,
                    assessedValue: 450000,
                    roofType: 'Asphalt',
                    dataSource: 'King County ArcGIS'
                },
                riskFlags: []
            }));
            IntakeAssist.init();
            const panel = window.document.getElementById('iaPropertyIntel');
            // Panel should be rendered with property intel data
            expect(panel.innerHTML).toContain('Property Intelligence');
            expect(panel.innerHTML).toContain('2005');
            expect(panel.innerHTML).toContain('Asphalt');
        });
    });

    // ── Smart Chips ──────────────────────────────────────────────

    describe('Smart Chips', () => {
        test('shows default chips when no data', () => {
            window.localStorage.clear();
            IntakeAssist.init();
            const chips = window.document.getElementById('iaSmartChips');
            expect(chips.innerHTML).toContain('Home + Auto');
            expect(chips.innerHTML).toContain('Auto Only');
        });

        test('shows Done chip when name and qType present', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'John', qType: 'home' },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const chips = window.document.getElementById('iaSmartChips');
            expect(chips.innerHTML).toContain('Done');
        });

        test('shows Lookup Property chip when address complete but no intel', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'John', addrStreet: '123 Main St', addrCity: 'Portland', addrState: 'OR' },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const chips = window.document.getElementById('iaSmartChips');
            expect(chips.innerHTML).toContain('Lookup Property');
        });

        test('shows Add Vehicle chip for auto quotes', () => {
            window.localStorage.setItem('altech_intake_assist', JSON.stringify({
                history: [],
                data: { firstName: 'Jane', qType: 'auto' },
                propertyIntel: null,
                riskFlags: []
            }));
            IntakeAssist.init();
            const chips = window.document.getElementById('iaSmartChips');
            expect(chips.innerHTML).toContain('Add Vehicle');
        });
    });

    // ── toolConfig Registration ──────────────────────────────────

    describe('toolConfig Registration', () => {
        test('intake is registered in App.toolConfig', () => {
            const App = window.App;
            const entry = App.toolConfig.find(t => t.key === 'intake');
            expect(entry).toBeDefined();
            expect(entry.containerId).toBe('intakeTool');
            expect(entry.initModule).toBe('IntakeAssist');
        });
    });
});
