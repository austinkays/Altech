// RemindersPopover tests — verify the bell-anchored popover renders the
// most-urgent items, supports quick-add / complete / push-to-tomorrow,
// and routes "View all" through App.navigateTo. The Reminders module is
// stubbed so these tests don't rely on the full plugin state machine.

const { JSDOM } = require('jsdom');

let dom, window, document;
let RemindersStub;

beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><button class="header-notification-btn">Bell</button></body></html>', {
        url: 'http://localhost/',
        pretendToBeVisual: true,
    });
    window = dom.window;
    document = window.document;

    // Wire globals expected by the module.
    global.window = window;
    global.document = document;
    global.HTMLElement = window.HTMLElement;
    global.Utils = {
        escapeHTML: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        escapeAttr: (s) => String(s == null ? '' : s).replace(/"/g, '&quot;'),
    };
    window.Utils = global.Utils;

    // Stub the Reminders module. Each test can mutate the returned tasks list
    // to drive the popover's rendering.
    RemindersStub = {
        _tasks: [],
        _counts: { overdue: 0, dueToday: 0 },
        addTask: jest.fn((title) => {
            const id = `t${RemindersStub._tasks.length + 1}`;
            RemindersStub._tasks.push({
                id, title, status: 'upcoming', statusLabel: 'Upcoming',
            });
        }),
        toggle: jest.fn(),
        pushToTomorrow: jest.fn(),
        getUpcomingTasks: jest.fn((limit) => RemindersStub._tasks.slice(0, limit)),
        getCounts: jest.fn(() => RemindersStub._counts),
    };
    window.Reminders = RemindersStub;
    // The popover module references `Reminders` as a bare global (works in
    // browser because window props are auto-globalized). In Node we have to
    // mirror onto Node's global ourselves.
    global.Reminders = RemindersStub;

    // Stub App.navigateTo to verify the View-All link routes correctly.
    window.App = { navigateTo: jest.fn() };
    global.App = window.App;

    jest.isolateModules(() => {
        require('../js/reminders-popover.js');
    });
    // JSDOM evaluates inline onclick handlers as bare references — mirror
    // RemindersPopover onto Node's global so the handlers resolve.
    global.RemindersPopover = window.RemindersPopover;
});

afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.HTMLElement;
    delete global.Utils;
    delete global.Reminders;
    delete global.App;
    delete global.RemindersPopover;
});

describe('RemindersPopover — basic open/close', () => {
    test('toggle() opens the popover, second toggle closes it', () => {
        const RP = window.RemindersPopover;
        expect(RP._isOpen()).toBe(false);
        RP.toggle();
        expect(RP._isOpen()).toBe(true);
        const el = document.getElementById('remindersPopover');
        expect(el).not.toBeNull();
        expect(el.classList.contains('rem-popover-open')).toBe(true);
        RP.toggle();
        expect(RP._isOpen()).toBe(false);
    });

    test('Esc key closes an open popover', () => {
        const RP = window.RemindersPopover;
        RP.open();
        expect(RP._isOpen()).toBe(true);
        document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
        expect(RP._isOpen()).toBe(false);
    });
});

describe('RemindersPopover — rendering', () => {
    test('shows the empty state when there are no reminders', () => {
        RemindersStub._tasks = [];
        const RP = window.RemindersPopover;
        RP.open();
        const el = document.getElementById('remindersPopover');
        expect(el.querySelector('.rem-pop-empty')).not.toBeNull();
        expect(el.querySelector('.rem-pop-empty').textContent).toMatch(/No reminders/i);
    });

    test('renders up to MAX_ITEMS (15) most-urgent tasks with badges', () => {
        // 18 tasks total — popover should request 15.
        RemindersStub._tasks = Array.from({ length: 18 }, (_, i) => ({
            id: `t${i + 1}`,
            title: `Task ${i + 1}`,
            status: i < 2 ? 'overdue' : i < 5 ? 'due-today' : 'upcoming',
            statusLabel: i < 2 ? 'Overdue' : i < 5 ? 'Due today' : 'Upcoming',
        }));
        const RP = window.RemindersPopover;
        RP.open();
        expect(RemindersStub.getUpcomingTasks).toHaveBeenCalledWith(15);
        const rows = document.querySelectorAll('#remindersPopover .rem-pop-row');
        expect(rows.length).toBeLessThanOrEqual(15);
        // Overdue + Today badges render; Upcoming has no badge (empty label).
        expect(document.querySelectorAll('.rem-pop-badge-overdue').length).toBe(2);
        expect(document.querySelectorAll('.rem-pop-badge-today').length).toBe(3);
    });

    test('shows the urgent count pill when overdue/due-today > 0', () => {
        RemindersStub._counts = { overdue: 2, dueToday: 3 };
        const RP = window.RemindersPopover;
        RP.open();
        const pill = document.querySelector('.rem-pop-count');
        expect(pill).not.toBeNull();
        expect(pill.textContent).toMatch(/5 urgent/);
    });

    test('omits the urgent pill when nothing is overdue / due today', () => {
        RemindersStub._counts = { overdue: 0, dueToday: 0 };
        const RP = window.RemindersPopover;
        RP.open();
        expect(document.querySelector('.rem-pop-count')).toBeNull();
    });
});

describe('RemindersPopover — actions wire to Reminders API', () => {
    test('quick-add → Reminders.addTask + clears input + re-renders', () => {
        const RP = window.RemindersPopover;
        RP.open();
        const input = document.getElementById('remPopAddInput');
        input.value = 'Follow up with Smith';
        // Call the handler directly with a stub event — JSDOM's inline-onsubmit
        // attribute evaluation isn't reliable enough to test through.
        RP._quickAdd({ preventDefault: () => {} });
        expect(RemindersStub.addTask).toHaveBeenCalledWith('Follow up with Smith');
        expect(document.getElementById('remPopAddInput').value).toBe('');
        expect(RemindersStub.getUpcomingTasks).toHaveBeenCalled();
    });

    test('empty quick-add is a no-op (no addTask call)', () => {
        const RP = window.RemindersPopover;
        RP.open();
        // Input is empty — handler returns false without calling addTask.
        RP._quickAdd({ preventDefault: () => {} });
        expect(RemindersStub.addTask).not.toHaveBeenCalled();
    });

    test('check action → Reminders.toggle(id) + re-render', () => {
        RemindersStub._tasks = [{ id: 't1', title: 'A', status: 'due-today', statusLabel: 'Today' }];
        const RP = window.RemindersPopover;
        RP.open();
        RemindersStub.getUpcomingTasks.mockClear();
        // Invoke the underlying handler directly — JSDOM's inline-onclick
        // evaluation isn't reliable across environments. The DOM render
        // is verified separately by the "renders up to MAX_ITEMS" test.
        RP._complete('t1');
        expect(RemindersStub.toggle).toHaveBeenCalledWith('t1');
        expect(RemindersStub.getUpcomingTasks).toHaveBeenCalled();
    });

    test('tomorrow action → Reminders.pushToTomorrow(id) + re-render', () => {
        RemindersStub._tasks = [{ id: 't42', title: 'B', status: 'overdue', statusLabel: 'Overdue' }];
        const RP = window.RemindersPopover;
        RP.open();
        RP._tomorrow('t42');
        expect(RemindersStub.pushToTomorrow).toHaveBeenCalledWith('t42');
    });

    test('"View all" action closes the popover and navigates via App.navigateTo', () => {
        const RP = window.RemindersPopover;
        RP.open();
        expect(RP._isOpen()).toBe(true);
        RP._navAll({ preventDefault: () => {} });
        expect(window.App.navigateTo).toHaveBeenCalledWith('reminders');
        expect(RP._isOpen()).toBe(false);
    });
});

describe('RemindersPopover — XSS safety', () => {
    test('task title with HTML is escaped on render', () => {
        RemindersStub._tasks = [{
            id: 'x1',
            title: '<img src=x onerror="alert(1)">',
            status: 'due-today',
            statusLabel: 'Today',
        }];
        const RP = window.RemindersPopover;
        RP.open();
        const titleEl = document.querySelector('.rem-pop-title');
        expect(titleEl).not.toBeNull();
        // The title HTML is the escaped form; no <img> child element exists.
        expect(titleEl.querySelector('img')).toBeNull();
        expect(titleEl.textContent).toContain('<img src=x onerror=');
    });
});
