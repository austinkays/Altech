/**
 * @file App export picker — readiness check + format selection modal
 *
 * Covers _buildExportReadiness(), _exportPickerFormats(), and the
 * openExportPicker() / _runSelectedExports() / _closeExportPicker()
 * lifecycle.
 */

const { JSDOM } = require('jsdom');
const path = require('path');
const { loadHTML } = require('./load-html.cjs');

function bootApp() {
    const html = loadHTML(path.join(__dirname, '../index.html'));
    const dom = new JSDOM(html, {
        url: 'http://localhost:8000',
        runScripts: 'dangerously',
        pretendToBeVisual: true,
    });
    const w = dom.window;
    w.scrollTo = () => {};
    if (!w.Element.prototype.scrollTo) w.Element.prototype.scrollTo = function () {};
    if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = function () {};
    return w;
}

describe('App export picker', () => {
    let App, win, doc;

    beforeAll(() => {
        win = bootApp();
        App = win.App;
        doc = win.document;
        expect(typeof App.openExportPicker).toBe('function');
        expect(typeof App._buildExportReadiness).toBe('function');
        expect(typeof App._runSelectedExports).toBe('function');
    });

    beforeEach(() => {
        App.data = {};
        App.drivers = [];
        App.vehicles = [];
        // Clear any leftover modal
        const m = doc.getElementById('ezExportPickerModal');
        if (m) m.remove();
    });

    describe('_buildExportReadiness', () => {
        test('reports zero gaps when all required fields are filled', () => {
            const FIELDS = win.FIELDS || [];
            const required = FIELDS.filter(f => f.ezlynxRequired);
            App.data = {};
            required.forEach(f => { App.data[f.storageKey] = 'X'; });
            const r = App._buildExportReadiness();
            expect(r.total).toBe(0);
            expect(r.gaps).toEqual([]);
        });

        test('reports every blank required field with section + step mapping', () => {
            App.data = {};
            const r = App._buildExportReadiness();
            expect(r.total).toBeGreaterThan(0);
            const firstName = r.gaps.find(g => g.id === 'firstName');
            expect(firstName).toBeDefined();
            expect(firstName.section).toBe('applicant');
            expect(firstName.stepId).toBe('step-1');

            const yrBuilt = r.gaps.find(g => g.id === 'yrBuilt');
            expect(yrBuilt).toBeDefined();
            expect(yrBuilt.stepId).toBe('step-3');

            const liability = r.gaps.find(g => g.id === 'liabilityLimits');
            expect(liability).toBeDefined();
            expect(liability.stepId).toBe('step-4');
        });

        test('skips fields that have any truthy value in App.data', () => {
            App.data = { firstName: 'Jane', lastName: 'Doe', dob: '1990-01-01' };
            const r = App._buildExportReadiness();
            expect(r.gaps.find(g => g.id === 'firstName')).toBeUndefined();
            expect(r.gaps.find(g => g.id === 'lastName')).toBeUndefined();
            expect(r.gaps.find(g => g.id === 'dob')).toBeUndefined();
        });
    });

    describe('_exportPickerFormats', () => {
        test('all formats enabled when qType=both', () => {
            App.data = { qType: 'both' };
            const formats = App._exportPickerFormats();
            const ids = formats.map(f => f.id).sort();
            expect(ids).toContain('pdf');
            expect(ids).toContain('ezxml');
            expect(ids).toContain('fsc');
            expect(ids).toContain('text');
            formats.forEach(f => expect(f.enabled).toBe(true));
        });

        test('ezxml stays enabled when qType=auto only', () => {
            App.data = { qType: 'auto' };
            const ezxml = App._exportPickerFormats().find(f => f.id === 'ezxml');
            expect(ezxml.enabled).toBe(true);
        });

        test('every format has a label, hint, and fn callable', () => {
            App.data = { qType: 'both' };
            App._exportPickerFormats().forEach(f => {
                expect(typeof f.label).toBe('string');
                expect(f.label.length).toBeGreaterThan(0);
                expect(typeof f.hint).toBe('string');
                expect(typeof f.fn).toBe('function');
            });
        });
    });

    describe('openExportPicker', () => {
        test('inserts modal with readiness panel + format checkboxes', () => {
            App.data = { firstName: 'Jane' };  // 1 field filled, many gaps
            App.openExportPicker();
            const modal = doc.getElementById('ezExportPickerModal');
            expect(modal).toBeTruthy();
            // Readiness panel surfaces gaps
            expect(modal.querySelector('.ez-picker-ready--gaps')).toBeTruthy();
            // Format checkboxes present
            const cbs = modal.querySelectorAll('.ez-picker-format__cb');
            expect(cbs.length).toBeGreaterThan(0);
        });

        test('shows "ready" panel when all required fields are filled', () => {
            const FIELDS = win.FIELDS || [];
            App.data = {};
            FIELDS.filter(f => f.ezlynxRequired).forEach(f => {
                App.data[f.storageKey] = 'X';
            });
            App.openExportPicker();
            const modal = doc.getElementById('ezExportPickerModal');
            expect(modal.querySelector('.ez-picker-ready--ok')).toBeTruthy();
            expect(modal.querySelector('.ez-picker-ready--gaps')).toBeFalsy();
        });

        test('jump-to-step links wire correctly (calls jumpToStep + closes modal)', () => {
            App.data = { firstName: 'Jane' };
            const jumpSpy = jest.spyOn(App, 'jumpToStep').mockImplementation(() => {});
            App.openExportPicker();
            const modal = doc.getElementById('ezExportPickerModal');
            const link = modal.querySelector('a[data-jump-step]');
            expect(link).toBeTruthy();
            link.click();
            expect(jumpSpy).toHaveBeenCalledWith(link.getAttribute('data-jump-step'));
            // Modal should be closed after jump
            expect(doc.getElementById('ezExportPickerModal')).toBeFalsy();
            jumpSpy.mockRestore();
        });
    });

    describe('_runSelectedExports', () => {
        test('fires only checked, enabled formats', () => {
            App.data = { qType: 'both' };
            const pdfSpy = jest.spyOn(App, 'exportPDF').mockResolvedValue(undefined);
            const xmlSpy = jest.spyOn(App, 'exportEZLynxXML').mockImplementation(() => {});
            const fscSpy = jest.spyOn(App, 'exportCMSMTF').mockImplementation(() => {});
            const textSpy = jest.spyOn(App, 'exportText').mockImplementation(() => {});

            App.openExportPicker();
            const modal = doc.getElementById('ezExportPickerModal');
            // Uncheck text + fsc, leave pdf + ezxml
            modal.querySelectorAll('.ez-picker-format__cb').forEach(cb => {
                cb.checked = (cb.value === 'pdf' || cb.value === 'ezxml');
            });
            App._runSelectedExports();

            expect(pdfSpy).toHaveBeenCalled();
            expect(xmlSpy).toHaveBeenCalled();
            expect(fscSpy).not.toHaveBeenCalled();
            expect(textSpy).not.toHaveBeenCalled();
            // Modal should have closed
            expect(doc.getElementById('ezExportPickerModal')).toBeFalsy();

            pdfSpy.mockRestore();
            xmlSpy.mockRestore();
            fscSpy.mockRestore();
            textSpy.mockRestore();
        });

        test('errors when nothing checked (toast, modal stays open)', () => {
            App.data = { qType: 'both' };
            const toastSpy = jest.spyOn(App, 'toast').mockImplementation(() => {});
            App.openExportPicker();
            const modal = doc.getElementById('ezExportPickerModal');
            modal.querySelectorAll('.ez-picker-format__cb').forEach(cb => { cb.checked = false; });
            App._runSelectedExports();
            expect(toastSpy).toHaveBeenCalledWith(expect.stringContaining('Pick at least one'), 'error');
            // Modal remains
            expect(doc.getElementById('ezExportPickerModal')).toBeTruthy();
            toastSpy.mockRestore();
        });

        test('persists last-checked formats to localStorage', () => {
            App.data = { qType: 'both' };
            const pdfSpy = jest.spyOn(App, 'exportPDF').mockResolvedValue(undefined);
            App.openExportPicker();
            const modal = doc.getElementById('ezExportPickerModal');
            modal.querySelectorAll('.ez-picker-format__cb').forEach(cb => {
                cb.checked = cb.value === 'pdf';
            });
            App._runSelectedExports();
            const key = win.STORAGE_KEYS.EXPORT_PICKER_LAST;
            const saved = JSON.parse(win.localStorage.getItem(key));
            expect(saved).toEqual(['pdf']);
            pdfSpy.mockRestore();
        });
    });

    describe('_closeExportPicker', () => {
        test('removes the modal from DOM', () => {
            App.data = {};
            App.openExportPicker();
            expect(doc.getElementById('ezExportPickerModal')).toBeTruthy();
            App._closeExportPicker();
            expect(doc.getElementById('ezExportPickerModal')).toBeFalsy();
        });

        test('safe to call when no modal open', () => {
            const m = doc.getElementById('ezExportPickerModal');
            if (m) m.remove();
            expect(() => App._closeExportPicker()).not.toThrow();
        });
    });
});
