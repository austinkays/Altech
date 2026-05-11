/**
 * Command Palette — fuzzy ranking, item building, registration.
 * Loads js/command-palette.js into JSDOM with stubbed App + STORAGE_KEYS.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'command-palette.js'), 'utf8');

function bootstrap() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'http://localhost',
        runScripts: 'outside-only',
    });
    dom.window.STORAGE_KEYS = { CLIENT_HISTORY: 'altech_client_history' };
    dom.window.App = {
        toolConfig: [
            { key: 'quoting', icon: '✏️', title: 'Personal Intake' },
            { key: 'compliance', icon: '🛡️', title: 'CGL Compliance' },
            { key: 'reminders', icon: '⏰', title: 'Reminders' },
            { key: 'broadform', icon: '🎯', title: 'Carrier Match', beta: true },
        ],
        navigateTo: jest.fn(),
        toggleDarkMode: jest.fn(),
        goHome: jest.fn(),
        openExportPicker: jest.fn(),
        loadClientFromHistory: jest.fn(),
        startNewIntake: jest.fn(),
    };
    dom.window.eval(SRC);
    return dom;
}

describe('CommandPalette', () => {
    test('public API is exposed', () => {
        const dom = bootstrap();
        const cp = dom.window.CommandPalette;
        expect(typeof cp.open).toBe('function');
        expect(typeof cp.close).toBe('function');
        expect(typeof cp.toggle).toBe('function');
        expect(typeof cp.register).toBe('function');
        dom.window.close();
    });

    test('_score: exact match wins, prefix > substring > subsequence', () => {
        const dom = bootstrap();
        const { _score } = dom.window.CommandPalette._test;
        expect(_score('reminders', 'reminders')).toBeGreaterThan(_score('reminders', 'reminder'));
        expect(_score('reminders', 'reminder')).toBeGreaterThan(_score('reminders', 'mind'));
        expect(_score('reminders', 'mind')).toBeGreaterThan(_score('reminders', 'rds'));
        expect(_score('reminders', 'xyz')).toBe(0);
        dom.window.close();
    });

    test('_score: word-boundary prefix beats substring elsewhere', () => {
        const dom = bootstrap();
        const { _score } = dom.window.CommandPalette._test;
        // "Personal Intake" — query "intake" matches the second word boundary
        expect(_score('Personal Intake', 'intake')).toBeGreaterThan(_score('Personal Intake', 'sona'));
        dom.window.close();
    });

    test('_filter: tools and built-in actions are searchable', () => {
        const dom = bootstrap();
        const { _filter } = dom.window.CommandPalette._test;
        const remResults = _filter('reminder');
        // Both the "Add reminder" action and the Reminders tool should match
        const labels = remResults.map(r => r.label);
        expect(labels).toContain('Reminders');
        expect(labels).toContain('Add reminder');
        dom.window.close();
    });

    test('_filter: empty query returns default ordering', () => {
        const dom = bootstrap();
        const { _filter } = dom.window.CommandPalette._test;
        const all = _filter('');
        // Built-ins come first
        expect(all[0].id.startsWith('action:')).toBe(true);
        dom.window.close();
    });

    test('register() adds custom command, replaces by id', () => {
        const dom = bootstrap();
        const { CommandPalette } = dom.window;
        const run1 = jest.fn();
        const run2 = jest.fn();
        CommandPalette.register({ id: 'custom-1', label: 'Send email', run: run1 });
        let results = CommandPalette._test._filter('send email');
        expect(results.find(r => r.id === 'custom-1')).toBeTruthy();

        // Re-register with same id replaces (does not duplicate)
        CommandPalette.register({ id: 'custom-1', label: 'Send email v2', run: run2 });
        results = CommandPalette._test._filter('send email');
        const matches = results.filter(r => r.id === 'custom-1');
        expect(matches).toHaveLength(1);
        expect(matches[0].label).toBe('Send email v2');
        dom.window.close();
    });

    test('register() rejects malformed commands', () => {
        const dom = bootstrap();
        const { CommandPalette } = dom.window;
        CommandPalette.register({});
        CommandPalette.register(null);
        CommandPalette.register({ id: 'no-run', label: 'X' });  // missing run
        const all = CommandPalette._test._allItems();
        expect(all.find(i => i.id === 'no-run')).toBeUndefined();
        dom.window.close();
    });

    test('open() shows the palette; close() hides; toggle() flips state', () => {
        const dom = bootstrap();
        const { CommandPalette } = dom.window;
        CommandPalette.open();
        const p = dom.window.document.getElementById('altechCmdPalette');
        expect(p.style.display).toBe('block');
        CommandPalette.close();
        expect(p.style.display).toBe('none');
        CommandPalette.toggle();
        expect(p.style.display).toBe('block');
        dom.window.close();
    });

    test('open(initialQuery) pre-fills the input + filters results', () => {
        const dom = bootstrap();
        const { CommandPalette } = dom.window;
        CommandPalette.open('reminder');
        const input = dom.window.document.getElementById('altechCmdInput');
        expect(input.value).toBe('reminder');
        // First result should match the query
        const firstRow = dom.window.document.querySelector('[data-cmd-idx="0"]');
        expect(firstRow.textContent.toLowerCase()).toContain('reminder');
        dom.window.close();
    });

    test('Escape inside input closes the palette', () => {
        const dom = bootstrap();
        const { CommandPalette } = dom.window;
        CommandPalette.open();
        const input = dom.window.document.getElementById('altechCmdInput');
        const ev = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        input.dispatchEvent(ev);
        const p = dom.window.document.getElementById('altechCmdPalette');
        expect(p.style.display).toBe('none');
        dom.window.close();
    });

    test('client history is included when present', () => {
        const dom = bootstrap();
        dom.window.localStorage.setItem('altech_client_history', JSON.stringify([
            { id: 'c1', name: 'Sarah Mitchell', data: { addrCity: 'Vancouver' } },
            { id: 'c2', name: 'John Smith', data: { addrCity: 'Portland', qType: 'auto' } },
        ]));
        const all = dom.window.CommandPalette._test._allItems();
        const sarah = all.find(i => i.id === 'client:c1');
        expect(sarah).toBeTruthy();
        expect(sarah.label).toBe('Sarah Mitchell');
        expect(sarah.hint).toContain('Client');
        dom.window.close();
    });

    test('Phonetic speller command calls PhoneticSpeller.open', () => {
        const dom = bootstrap();
        const open = jest.fn();
        dom.window.PhoneticSpeller = { open };
        const item = dom.window.CommandPalette._test._allItems()
            .find(i => i.id === 'action:phonetic');
        expect(item).toBeTruthy();
        expect(item.label).toBe('Phonetic speller');
        item.run();
        expect(open).toHaveBeenCalledTimes(1);
        dom.window.close();
    });

    test('Phonetic command no-ops when PhoneticSpeller is unavailable', () => {
        const dom = bootstrap();
        // PhoneticSpeller intentionally absent.
        const item = dom.window.CommandPalette._test._allItems()
            .find(i => i.id === 'action:phonetic');
        expect(() => item.run()).not.toThrow();
        dom.window.close();
    });

    test('"New quote" command navigates to intake AND clears active client', () => {
        const dom = bootstrap();
        // Wire startNewClient (it was missing from the default mock; the old
        // command-palette code looked for startNewIntake which never existed,
        // so navigation alone left the previous client's data on screen).
        const startNewClient = jest.fn();
        dom.window.App.startNewClient = startNewClient;
        const item = dom.window.CommandPalette._test._allItems()
            .find(i => i.id === 'action:new-quote');
        expect(item).toBeTruthy();
        jest.useFakeTimers();
        item.run();
        expect(dom.window.App.navigateTo).toHaveBeenCalledWith('quoting');
        jest.advanceTimersByTime(250);
        expect(startNewClient).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
        dom.window.close();
    });
});
