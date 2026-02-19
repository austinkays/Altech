/**
 * VIN Decoder — Decode & Phonetically Read Vehicle Identification Numbers
 * Stores recent lookups to localStorage('altech_vin_history').
 */
window.VinDecoder = (() => {
    'use strict';

    const STORAGE_KEY = 'altech_vin_history';
    const MAX_HISTORY = 20;

    let _history = [];

    // ── NATO Phonetic Alphabet ──
    const PHONETIC = {
        'A': 'Alpha',   'B': 'Bravo',   'C': 'Charlie', 'D': 'Delta',
        'E': 'Echo',    'F': 'Foxtrot', 'G': 'Golf',    'H': 'Hotel',
        'J': 'Juliet',  'K': 'Kilo',    'L': 'Lima',    'M': 'Mike',
        'N': 'November','P': 'Papa',    'R': 'Romeo',   'S': 'Sierra',
        'T': 'Tango',   'U': 'Uniform', 'V': 'Victor',  'W': 'Whiskey',
        'X': 'X-ray',   'Y': 'Yankee',  'Z': 'Zulu',
        '0': 'Zero',    '1': 'One',     '2': 'Two',     '3': 'Three',
        '4': 'Four',    '5': 'Five',    '6': 'Six',     '7': 'Seven',
        '8': 'Eight',   '9': 'Nine'
    };

    // ── Position 1: Country of Origin ──
    const COUNTRY = {
        '1': 'United States', '4': 'United States', '5': 'United States',
        '2': 'Canada', '3': 'Mexico',
        'J': 'Japan', 'K': 'South Korea', 'L': 'China',
        'S': 'United Kingdom', 'V': 'France / Spain',
        'W': 'Germany', 'X': 'Russia / Europe', 'Y': 'Sweden / Finland',
        'Z': 'Italy',
        '6': 'Australia', '7': 'New Zealand',
        '8': 'Argentina / Chile', '9': 'Brazil',
        'A': 'South Africa', 'B': 'Angola / Kenya',
        'C': 'Benin / Madagascar', 'D': 'Egypt / Tunisia',
        'E': 'Ethiopia / Mozambique', 'F': 'Ghana / Nigeria',
        'G': 'Ivory Coast', 'H': 'Unknown (Africa)',
        'M': 'India / Indonesia / Thailand',
        'N': 'Iran / Pakistan / Turkey',
        'P': 'Philippines / Singapore',
        'R': 'Taiwan / UAE',
        'T': 'Czech Republic / Hungary / Portugal',
        'U': 'Romania / Poland'
    };

    // ── Position 2: Manufacturer ──
    const MANUFACTURER = {
        // US / Japan / Germany — common combos (pos1 + pos2)
        '1G': 'General Motors', '1C': 'Chrysler/FCA', '1F': 'Ford',
        '1H': 'Honda', '1N': 'Nissan', '1L': 'Lincoln',
        '2G': 'General Motors (Canada)', '2F': 'Ford (Canada)',
        '2H': 'Honda (Canada)', '2T': 'Toyota (Canada)',
        '3F': 'Ford (Mexico)', '3G': 'GM (Mexico)', '3N': 'Nissan (Mexico)',
        '3V': 'Volkswagen (Mexico)',
        '4T': 'Toyota', '5T': 'Toyota', '5F': 'Honda',
        'JH': 'Honda', 'JT': 'Toyota', 'JN': 'Nissan',
        'JM': 'Mazda', 'JF': 'Subaru (Fuji)', 'JS': 'Suzuki',
        'KM': 'Hyundai', 'KN': 'Kia', '5N': 'Hyundai', '5X': 'Kia',
        'WA': 'Audi', 'WB': 'BMW', 'WD': 'Mercedes-Benz',
        'WF': 'Ford (Germany)', 'WP': 'Porsche', 'WV': 'Volkswagen',
        'W0': 'Opel', 'W1': 'Mercedes-Benz',
        'SA': 'Jaguar / Land Rover', 'SC': 'Lotus', 'SF': 'Aston Martin',
        'SH': 'Honda (UK)', 'SJ': 'Jaguar',
        'VF': 'Renault / Peugeot', 'VS': 'SEAT',
        'YV': 'Volvo', 'YS': 'Saab',
        'ZA': 'Alfa Romeo', 'ZF': 'Ferrari', 'ZH': 'Maserati',
        'LF': 'Ford (China)', 'LH': 'Honda (China)', 'LT': 'Toyota (China)',
        'MA': 'Mahindra', 'MH': 'Honda (Indonesia)',
        '1V': 'Volkswagen', '19': 'FCA / Stellantis',
        '2C': 'Chrysler (Canada)',
    };

    // ── Position 3: Vehicle Type / Division ──
    const VEHICLE_TYPE_HINTS = {
        '1': 'Passenger Car', '2': 'Passenger Car / SUV', '3': 'Truck / MPV',
        '4': 'SUV / Crossover', '5': 'SUV / Crossover', '6': 'Van / MPV',
        '7': 'Truck / Commercial', '8': 'Heavy Truck / Bus',
    };

    // ── Position 10: Model Year ──
    const MODEL_YEAR = {
        'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014,
        'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
        'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024,
        'S': 2025, 'T': 2026, 'V': 2027, 'W': 2028, 'X': 2029,
        'Y': 2030,
        '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005,
        '6': 2006, '7': 2007, '8': 2008, '9': 2009,
    };

    // ── Persistence ──

    function _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_history));
        } catch (e) { /* quota */ }
    }

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) _history = JSON.parse(raw) || [];
        } catch (e) { _history = []; }
    }

    // ── Validation ──

    function _isValidVin(vin) {
        // VINs are exactly 17 chars, no I, O, Q
        return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin);
    }

    function _validateCheckDigit(vin) {
        const transliteration = {
            'A':1,'B':2,'C':3,'D':4,'E':5,'F':6,'G':7,'H':8,
            'J':1,'K':2,'L':3,'M':4,'N':5,'P':7,'R':9,
            'S':2,'T':3,'U':4,'V':5,'W':6,'X':7,'Y':8,'Z':9,
        };
        const weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
        let sum = 0;
        for (let i = 0; i < 17; i++) {
            const ch = vin[i].toUpperCase();
            const val = /\d/.test(ch) ? parseInt(ch) : (transliteration[ch] || 0);
            sum += val * weights[i];
        }
        const remainder = sum % 11;
        const expected = remainder === 10 ? 'X' : String(remainder);
        return { valid: vin[8].toUpperCase() === expected, expected, actual: vin[8].toUpperCase() };
    }

    // ── Decode Logic ──

    function _decode(vin) {
        vin = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
        if (vin.length !== 17) return null;

        const wmi = vin.substring(0, 3);   // World Manufacturer Identifier
        const vds = vin.substring(3, 9);   // Vehicle Descriptor Section
        const vis = vin.substring(9, 17);  // Vehicle Identifier Section

        const country = COUNTRY[vin[0]] || 'Unknown';
        const mfgKey2 = vin[0] + vin[1];
        const manufacturer = MANUFACTURER[mfgKey2] || 'Unknown Manufacturer';
        const vehicleType = VEHICLE_TYPE_HINTS[vin[2]] || (vin[2].match(/[A-Z]/) ? 'Vehicle Division' : 'Unknown');
        const checkDigit = _validateCheckDigit(vin);
        const modelYear = MODEL_YEAR[vin[9]] || 'Unknown';
        const plant = vin[10];
        const serial = vin.substring(11, 17);

        // Build per-position breakdown
        const positions = [
            { pos: 1,    char: vin[0],  section: 'WMI', label: 'Country of Origin',    value: country },
            { pos: 2,    char: vin[1],  section: 'WMI', label: 'Manufacturer',          value: manufacturer },
            { pos: 3,    char: vin[2],  section: 'WMI', label: 'Vehicle Type / Division', value: vehicleType },
            { pos: '4-8', char: vds.substring(0, 5), section: 'VDS', label: 'Vehicle Attributes', value: 'Body, engine, restraints, transmission (manufacturer-specific)' },
            { pos: 9,    char: vin[8],  section: 'VDS', label: 'Check Digit',           value: checkDigit.valid ? '✅ Valid' : `⚠️ Expected ${checkDigit.expected}, got ${checkDigit.actual}` },
            { pos: 10,   char: vin[9],  section: 'VIS', label: 'Model Year',            value: String(modelYear) },
            { pos: 11,   char: vin[10], section: 'VIS', label: 'Assembly Plant',        value: `Plant code: ${plant}` },
            { pos: '12-17', char: serial, section: 'VIS', label: 'Production Sequence', value: `Serial #${serial}` },
        ];

        return {
            vin, wmi, vds, vis, country, manufacturer, vehicleType,
            modelYear, plant, serial, checkDigit, positions
        };
    }

    // ── Phonetic Reading ──

    function _phonetic(vin) {
        return vin.toUpperCase().split('').map(ch => {
            const word = PHONETIC[ch];
            if (!word) return ch;
            return `<span class="vin-phonetic-char">${ch}</span> <span class="vin-phonetic-word">${word}</span>`;
        }).join('<span class="vin-phonetic-sep"> · </span>');
    }

    function _phoneticPlain(vin) {
        return vin.toUpperCase().split('').map(ch => {
            const word = PHONETIC[ch];
            return word ? `${ch} - ${word}` : ch;
        }).join('  ·  ');
    }

    // ── Rendering ──

    function _renderResult(result) {
        const el = document.getElementById('vinResult');
        if (!el) return;

        if (!result) {
            el.innerHTML = `<div class="vin-error">
                <span>⚠️</span>
                <div><strong>Invalid VIN</strong><br>Must be exactly 17 characters. Letters I, O, and Q are not used in VINs.</div>
            </div>`;
            el.style.display = 'block';
            return;
        }

        // Summary cards
        const summaryHTML = `
            <div class="vin-summary-grid">
                <div class="vin-summary-card">
                    <div class="vin-summary-label">Year</div>
                    <div class="vin-summary-value">${result.modelYear}</div>
                </div>
                <div class="vin-summary-card">
                    <div class="vin-summary-label">Manufacturer</div>
                    <div class="vin-summary-value">${result.manufacturer}</div>
                </div>
                <div class="vin-summary-card">
                    <div class="vin-summary-label">Country</div>
                    <div class="vin-summary-value">${result.country}</div>
                </div>
                <div class="vin-summary-card">
                    <div class="vin-summary-label">Check Digit</div>
                    <div class="vin-summary-value">${result.checkDigit.valid ? '✅ Valid' : '⚠️ Invalid'}</div>
                </div>
            </div>`;

        // Phonetic readout
        const phoneticHTML = `
            <div class="vin-section">
                <div class="vin-section-header">
                    <h3>📞 Phonetic Reading</h3>
                    <button class="vin-copy-btn" onclick="VinDecoder.copyPhonetic()" title="Copy phonetic reading">
                        📋 Copy
                    </button>
                </div>
                <div class="vin-phonetic-readout">${_phonetic(result.vin)}</div>
                <p class="vin-phonetic-hint">Read each character using the NATO phonetic alphabet for clear phone communication</p>
            </div>`;

        // Position breakdown
        const sectionColors = { WMI: 'vin-tag-blue', VDS: 'vin-tag-purple', VIS: 'vin-tag-green' };
        let breakdownRows = result.positions.map(p => `
            <div class="vin-breakdown-row">
                <div class="vin-pos">${p.pos}</div>
                <div class="vin-char-cell">${p.char}</div>
                <span class="vin-tag ${sectionColors[p.section] || ''}">${p.section}</span>
                <div class="vin-breakdown-info">
                    <strong>${p.label}</strong>
                    <span>${p.value}</span>
                </div>
            </div>
        `).join('');

        const breakdownHTML = `
            <div class="vin-section">
                <div class="vin-section-header">
                    <h3>🔍 Character Breakdown</h3>
                </div>
                <div class="vin-breakdown-legend">
                    <span class="vin-tag vin-tag-blue">WMI</span> World Manufacturer ID
                    <span class="vin-tag vin-tag-purple">VDS</span> Vehicle Descriptor
                    <span class="vin-tag vin-tag-green">VIS</span> Vehicle Identifier
                </div>
                <div class="vin-breakdown-list">${breakdownRows}</div>
            </div>`;

        // Visual VIN with color coding
        const wmiChars = result.vin.substring(0, 3).split('').map(c => `<span class="vin-vis-char vin-vis-wmi">${c}</span>`).join('');
        const vdsChars = result.vin.substring(3, 9).split('').map(c => `<span class="vin-vis-char vin-vis-vds">${c}</span>`).join('');
        const visChars = result.vin.substring(9, 17).split('').map(c => `<span class="vin-vis-char vin-vis-vis">${c}</span>`).join('');

        const visualHTML = `
            <div class="vin-visual">
                <div class="vin-visual-chars">${wmiChars}${vdsChars}${visChars}</div>
                <div class="vin-visual-labels">
                    <span class="vin-vis-label vin-vis-wmi-label">WMI (1-3)</span>
                    <span class="vin-vis-label vin-vis-vds-label">VDS (4-9)</span>
                    <span class="vin-vis-label vin-vis-vis-label">VIS (10-17)</span>
                </div>
            </div>`;

        el.innerHTML = visualHTML + summaryHTML + phoneticHTML + breakdownHTML;
        el.style.display = 'block';
    }

    function _renderHistory() {
        const el = document.getElementById('vinHistory');
        if (!el) return;

        if (_history.length === 0) {
            el.innerHTML = '<p class="vin-history-empty">No recent VINs decoded</p>';
            return;
        }

        el.innerHTML = _history.slice(0, 10).map((item, i) => `
            <div class="vin-history-item" onclick="VinDecoder.loadFromHistory(${i})">
                <div class="vin-history-vin">${item.vin}</div>
                <div class="vin-history-meta">
                    ${item.modelYear !== 'Unknown' ? item.modelYear + ' ' : ''}${item.manufacturer}
                </div>
            </div>
        `).join('');
    }

    // ── Actions ──

    function decode() {
        const input = document.getElementById('vinInput');
        if (!input) return;

        const raw = input.value.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
        if (!raw) return;

        const result = _decode(raw);
        _renderResult(result);

        // Add to history
        if (result) {
            _history = _history.filter(h => h.vin !== result.vin);
            _history.unshift({
                vin: result.vin,
                manufacturer: result.manufacturer,
                modelYear: result.modelYear,
                country: result.country,
                decodedAt: new Date().toISOString()
            });
            if (_history.length > MAX_HISTORY) _history = _history.slice(0, MAX_HISTORY);
            _save();
            _renderHistory();
        }
    }

    function clear() {
        const input = document.getElementById('vinInput');
        const result = document.getElementById('vinResult');
        if (input) input.value = '';
        if (result) { result.innerHTML = ''; result.style.display = 'none'; }
    }

    function loadFromHistory(idx) {
        if (idx < 0 || idx >= _history.length) return;
        const input = document.getElementById('vinInput');
        if (input) input.value = _history[idx].vin;
        decode();
    }

    function clearHistory() {
        _history = [];
        _save();
        _renderHistory();
        if (typeof App !== 'undefined' && App.toast) {
            App.toast('🗑 VIN history cleared');
        }
    }

    function copyVin() {
        const input = document.getElementById('vinInput');
        if (!input || !input.value.trim()) return;
        _copyText(input.value.trim().toUpperCase());
        if (typeof App !== 'undefined' && App.toast) {
            App.toast('📋 VIN copied to clipboard');
        }
    }

    function copyPhonetic() {
        const input = document.getElementById('vinInput');
        if (!input || !input.value.trim()) return;
        const vin = input.value.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
        _copyText(_phoneticPlain(vin));
        if (typeof App !== 'undefined' && App.toast) {
            App.toast('📋 Phonetic reading copied');
        }
    }

    function _copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => _fallbackCopy(text));
        } else {
            _fallbackCopy(text);
        }
    }

    function _fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        document.body.removeChild(ta);
    }

    // ── Load VIN from Intake ──
    function loadFromIntake() {
        if (typeof App === 'undefined' || !App.data) return;
        // Try to find VIN in the main form data
        const vin = App.data.vehicleVin || App.data.vin || App.data.vehicle1Vin || '';
        if (vin) {
            const input = document.getElementById('vinInput');
            if (input) input.value = vin;
            decode();
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('📥 VIN loaded from intake form');
            }
        } else {
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('⚠️ No VIN found in intake form');
            }
        }
    }

    // ── Init ──

    function init() {
        _load();
        _renderHistory();
        // Handle Enter key on input
        const input = document.getElementById('vinInput');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    decode();
                }
            });
        }
    }

    function render() {
        _renderHistory();
    }

    // ── Public API ──

    return {
        init,
        render,
        decode,
        clear,
        loadFromHistory,
        clearHistory,
        copyVin,
        copyPhonetic,
        loadFromIntake
    };
})();
