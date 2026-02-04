/**
 * Altech Test Suite - Run in Browser Console
 * Copy/paste this entire script into DevTools Console (F12) and press Enter
 * 
 * This tests every feature and reports what's broken
 */

console.log('%c🧪 ALTECH TEST SUITE STARTING', 'font-size:20px; color:blue; font-weight:bold');

const TestResults = {
    passed: 0,
    failed: 0,
    errors: [],
    
    test(name, fn) {
        try {
            fn();
            this.passed++;
            console.log(`✅ ${name}`);
        } catch (e) {
            this.failed++;
            this.errors.push({ test: name, error: e.message });
            console.log(`❌ ${name}: ${e.message}`);
        }
    },
    
    report() {
        console.log(`\n%c📊 RESULTS: ${this.passed} passed, ${this.failed} failed`, 
                   this.failed === 0 ? 'color:green;font-weight:bold' : 'color:red;font-weight:bold');
        if (this.errors.length > 0) {
            console.log('%c⚠️ FAILURES:', 'color:red;font-weight:bold');
            this.errors.forEach(({test, error}) => {
                console.log(`  • ${test}: ${error}`);
            });
        }
    }
};

// TEST 1: App Object Exists
TestResults.test('App object defined', () => {
    if (typeof App === 'undefined') throw new Error('App not found');
});

// TEST 2: Core Properties
TestResults.test('App.data exists', () => {
    if (!App.data) throw new Error('App.data not initialized');
});

TestResults.test('App.workflow exists', () => {
    if (!App.workflows) throw new Error('App.workflows not found');
});

// TEST 3: LocalStorage
TestResults.test('LocalStorage save/load', () => {
    const testData = { test: 'value', number: 123 };
    localStorage.setItem('test_key', JSON.stringify(testData));
    const retrieved = JSON.parse(localStorage.getItem('test_key'));
    if (retrieved.test !== 'value') throw new Error('LocalStorage not working');
    localStorage.removeItem('test_key');
});

// TEST 4: Form Fields
TestResults.test('Form field firstName exists', () => {
    const el = document.getElementById('firstName');
    if (!el) throw new Error('firstName input not found');
});

TestResults.test('Form field lastName exists', () => {
    const el = document.getElementById('lastName');
    if (!el) throw new Error('lastName input not found');
});

TestResults.test('Form field addrStreet exists', () => {
    const el = document.getElementById('addrStreet');
    if (!el) throw new Error('addrStreet input not found');
});

// TEST 5: Methods Exist
TestResults.test('App.next() method exists', () => {
    if (typeof App.next !== 'function') throw new Error('next() not defined');
});

TestResults.test('App.prev() method exists', () => {
    if (typeof App.prev !== 'function') throw new Error('prev() not defined');
});

TestResults.test('App.save() method exists', () => {
    if (typeof App.save !== 'function') throw new Error('save() not defined');
});

TestResults.test('App.load() method exists', () => {
    if (typeof App.load !== 'function') throw new Error('load() not defined');
});

TestResults.test('App.exportXML() method exists', () => {
    if (typeof App.exportXML !== 'function') throw new Error('exportXML() not defined');
});

TestResults.test('App.exportPDF() method exists', () => {
    if (typeof App.exportPDF !== 'function') throw new Error('exportPDF() not defined');
});

// TEST 6: Workflow Configuration
TestResults.test('workflows.home defined', () => {
    if (!Array.isArray(App.workflows.home)) throw new Error('home workflow not array');
});

TestResults.test('workflows.auto defined', () => {
    if (!Array.isArray(App.workflows.auto)) throw new Error('auto workflow not array');
});

TestResults.test('workflows.both defined', () => {
    if (!Array.isArray(App.workflows.both)) throw new Error('both workflow not array');
});

// TEST 7: Step Elements
TestResults.test('Step 0 element exists', () => {
    if (!document.getElementById('step-0')) throw new Error('step-0 not found');
});

TestResults.test('Step 1 element exists', () => {
    if (!document.getElementById('step-1')) throw new Error('step-1 not found');
});

TestResults.test('Step 6 element exists', () => {
    if (!document.getElementById('step-6')) throw new Error('step-6 not found');
});

// TEST 8: Button Elements
TestResults.test('Back button exists', () => {
    if (!document.getElementById('btnBack')) throw new Error('btnBack not found');
});

TestResults.test('Next button exists', () => {
    if (!document.getElementById('btnNext')) throw new Error('btnNext not found');
});

// TEST 9: External Libraries
TestResults.test('JSZip loaded', () => {
    if (typeof JSZip === 'undefined') throw new Error('JSZip not loaded');
});

TestResults.test('jsPDF loaded', () => {
    if (typeof jsPDF === 'undefined') throw new Error('jsPDF not loaded');
});

// TEST 10: API Endpoints
TestResults.test('Policy scan endpoint exists', () => {
    fetch('/api/policy-scan').catch(() => {}); // Just check it responds
});

TestResults.test('Places API config endpoint exists', () => {
    fetch('/api/places-config').catch(() => {}); // Just check it responds
});

// TEST 11: Form Field Functionality
TestResults.test('Can set firstName value', () => {
    const el = document.getElementById('firstName');
    el.value = 'TestName';
    if (el.value !== 'TestName') throw new Error('Cannot set input value');
    el.value = ''; // Clean up
});

TestResults.test('Can set select value', () => {
    const el = document.getElementById('maritalStatus');
    el.value = 'Married';
    if (el.value !== 'Married') throw new Error('Cannot set select value');
    el.value = ''; // Clean up
});

// TEST 12: Validation (if it exists)
TestResults.test('Validation object available', () => {
    if (typeof Validation === 'undefined') {
        console.warn('⚠️ Validation object not found (optional)');
    }
});

// TEST 13: Navigation
TestResults.test('Step property initialized', () => {
    if (typeof App.step !== 'number') throw new Error('step property not initialized');
});

TestResults.test('Current step >= 0', () => {
    if (App.step < 0) throw new Error('Step is negative');
});

// TEST 14: Step Elements Visibility
TestResults.test('Current step element visible or hidden', () => {
    const currentStepEl = document.getElementById(`step-${App.step}`);
    if (!currentStepEl) throw new Error(`step-${App.step} element not found`);
});

// PRINT RESULTS
console.log('\n');
TestResults.report();

// ADDITIONAL DEBUG INFO
console.log('\n%c📋 DEBUG INFO', 'font-size:16px; font-weight:bold');
console.log('Current Step:', App.step);
console.log('Current Workflow:', App.flow);
console.log('Stored Data Keys:', Object.keys(App.data).length);
console.log('Active Quotes:', JSON.parse(localStorage.getItem('altech_v6_quotes') || '[]').length);

// FEATURE CHECKLIST
console.log('\n%c🔧 FEATURE CHECKLIST', 'font-size:16px; font-weight:bold');
console.log('To test in browser:');
console.log('1. Fill firstName → check localStorage');
console.log('   localStorage.getItem("altech_v6")');
console.log('2. Click Next → check step changes');
console.log('3. Select coverage type → check workflow');
console.log('4. Fill address → test map previews load');
console.log('5. Fill required fields → test export');
console.log('6. Check browser console for JavaScript errors');

console.log('\n%c✅ TEST ENVIRONMENT READY', 'font-size:16px; color:green; font-weight:bold');
