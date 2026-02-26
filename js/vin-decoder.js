/**
 * VIN Decoder — Decode & Phonetically Read Vehicle Identification Numbers
 * Stores recent lookups to localStorage('altech_vin_history').
 */
window.VinDecoder = (() => {
    'use strict';

    const STORAGE_KEY = 'altech_vin_history';
    const MAX_HISTORY = 20;

    let _history = [];

    // ── APCO Phonetic Alphabet (Police / Insurance Industry Standard) ──
    const PHONETIC = {
        'A': 'Adam',    'B': 'Boy',     'C': 'Charles', 'D': 'David',
        'E': 'Edward',  'F': 'Frank',   'G': 'George',  'H': 'Henry',
        'I': 'Ida',     'J': 'John',    'K': 'King',    'L': 'Lincoln',
        'M': 'Mary',    'N': 'Nora',    'O': 'Ocean',   'P': 'Paul',
        'Q': 'Queen',   'R': 'Robert',  'S': 'Sam',     'T': 'Tom',
        'U': 'Union',   'V': 'Victor',  'W': 'William', 'X': 'X-ray',
        'Y': 'Young',   'Z': 'Zebra',
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

    // ── Position 2: Manufacturer (2-char fallback) ──
    const MANUFACTURER = {
        // ── United States (1, 4, 5) ──
        '1B': 'Dodge', '1C': 'Chrysler/FCA', '1D': 'Dodge',
        '1F': 'Ford', '1G': 'General Motors', '1H': 'Honda',
        '1J': 'Jeep', '1L': 'Lincoln', '1M': 'Mercury',
        '1N': 'Nissan', '1P': 'Plymouth', '1V': 'Volkswagen',
        '1Y': 'Chrysler / Dodge', '19': 'FCA / Stellantis',
        '4F': 'Mazda (US)', '4J': 'Mercedes-Benz', '4M': 'Mercury',
        '4S': 'Subaru (US)', '4T': 'Toyota', '4U': 'BMW (US)',
        '5F': 'Honda', '5L': 'Lincoln', '5N': 'Hyundai (US)',
        '5T': 'Toyota', '5X': 'Kia (US)', '5Y': 'BMW (US)',
        // ── Canada (2) ──
        '2C': 'Chrysler (Canada)', '2F': 'Ford (Canada)',
        '2G': 'General Motors (Canada)', '2H': 'Honda (Canada)',
        '2M': 'Mercury (Canada)', '2T': 'Toyota (Canada)',
        // ── Mexico (3) ──
        '3C': 'Chrysler (Mexico)', '3F': 'Ford (Mexico)',
        '3G': 'GM (Mexico)', '3H': 'Honda (Mexico)',
        '3N': 'Nissan (Mexico)', '3V': 'Volkswagen (Mexico)',
        // ── Japan (J) ──
        'JA': 'Isuzu', 'JD': 'Daihatsu', 'JF': 'Subaru (Fuji)',
        'JH': 'Honda', 'JK': 'Kawasaki', 'JL': 'Mitsubishi Trucks',
        'JM': 'Mazda / Mitsubishi', 'JN': 'Nissan / Infiniti',
        'JP': 'Honda (motorcycles)', 'JS': 'Suzuki',
        'JT': 'Toyota / Lexus', 'JY': 'Yamaha',
        // ── South Korea (K) ──
        'KL': 'GM Daewoo / Chevrolet', 'KM': 'Hyundai',
        'KN': 'Kia', 'KP': 'SsangYong',
        // ── China (L) ──
        'LB': 'BMW (China)', 'LF': 'Ford (China)',
        'LH': 'Honda (China)', 'LL': 'Lifan',
        'LS': 'GM (China)', 'LT': 'Toyota (China)',
        'LV': 'Volkswagen (China)', 'LZ': 'MG / Roewe',
        // ── United Kingdom (S) ──
        'SA': 'Jaguar / Land Rover', 'SB': 'Toyota (UK)',
        'SC': 'Lotus', 'SF': 'Aston Martin',
        'SH': 'Honda (UK)', 'SJ': 'Jaguar',
        'TM': 'Hyundai (Czech Republic)', 'TR': 'Husqvarna',
        // ── France / Spain (V) ──
        'VF': 'Renault / Peugeot / Citroën', 'VN': 'Renault Trucks',
        'VR': 'Renault', 'VS': 'SEAT', 'VV': 'Volkswagen (Spain)',
        // ── Germany (W) ──
        'W0': 'Opel', 'W1': 'Mercedes-Benz',
        'WA': 'Audi', 'WB': 'BMW', 'WD': 'Mercedes-Benz',
        'WF': 'Ford (Germany)', 'WM': 'smart (Mercedes)',
        'WP': 'Porsche', 'WV': 'Volkswagen',
        // ── Sweden / Finland (Y) ──
        'YK': 'Saab', 'YS': 'Saab', 'YT': 'Saab',
        'YV': 'Volvo',
        // ── Italy (Z) ──
        'ZA': 'Alfa Romeo', 'ZC': 'Fiat',
        'ZD': 'Aprilia / Yamaha (Italy)', 'ZF': 'Ferrari',
        'ZH': 'Maserati', 'ZL': 'Lamborghini',
        // ── India / Southeast Asia (M) ──
        'MA': 'Mahindra', 'MB': 'Suzuki (India)',
        'MC': 'Hyundai (India)', 'MH': 'Honda (Indonesia)',
        'MN': 'Ford (India)', 'MR': 'Toyota (Indonesia)',
        // ── Australia (6) / Brazil (9) ──
        '6F': 'Ford (Australia)', '6G': 'Holden (GM Australia)',
        '6T': 'Toyota (Australia)',
        '93': 'Volkswagen (Brazil)', '9B': 'Toyota (Brazil)',
        '9C': 'Honda (Brazil)', '9F': 'Ford (Brazil)',
    };

    // ── Full 3-char WMI codes (highest priority match) ──
    const WMI_3 = {
        // Mercedes-Benz
        '4JG': 'Mercedes-Benz', 'WDB': 'Mercedes-Benz', 'WDC': 'Mercedes-Benz',
        'WDD': 'Mercedes-Benz', 'WDF': 'Mercedes-Benz (Vans)', 'WMX': 'Mercedes-AMG',
        '55S': 'Mercedes-Benz',
        // BMW
        'WBA': 'BMW', 'WBS': 'BMW M', 'WBY': 'BMW i (Electric)',
        '5UX': 'BMW (US)', '5UM': 'BMW M (US)',
        // Audi
        'WAU': 'Audi', 'WA1': 'Audi (SUV)',
        // Volkswagen
        'WVW': 'Volkswagen', 'WVG': 'Volkswagen (SUV)',
        '3VW': 'Volkswagen (Mexico)',
        // Porsche
        'WP0': 'Porsche', 'WP1': 'Porsche (SUV)',
        // Toyota / Lexus
        '4T1': 'Toyota (Sedan)', '4T3': 'Toyota (SUV)', '4T4': 'Toyota (SUV)',
        '5TD': 'Toyota (Minivan)', '5TF': 'Toyota (Truck)',
        'JTD': 'Toyota (SUV)', 'JTE': 'Toyota (SUV)',
        '2T1': 'Toyota (Canada Sedan)', '2T3': 'Toyota (Canada SUV)',
        'JTH': 'Lexus',
        // Honda / Acura
        '1HG': 'Honda (Sedan)', '2HG': 'Honda (Canada Sedan)',
        '5J6': 'Honda (SUV)', '5FN': 'Honda (Minivan)',
        '19U': 'Acura', 'JH4': 'Acura',
        // Ford / Lincoln
        '1FA': 'Ford (Sedan)', '1FT': 'Ford (Truck)',
        '1FM': 'Ford (SUV)', '1FD': 'Ford (Heavy Truck)',
        '2FM': 'Ford (Canada SUV)', '3FA': 'Ford (Mexico Sedan)',
        '5LM': 'Lincoln (SUV)', '3LN': 'Lincoln (Mexico)',
        // General Motors
        '1G1': 'Chevrolet', '1GC': 'Chevrolet (Truck)', '1GN': 'Chevrolet (SUV)',
        '2G1': 'Chevrolet (Canada)', '3G1': 'Chevrolet (Mexico)',
        '1GT': 'GMC (Truck)', '1GK': 'GMC (SUV)',
        '1G6': 'Cadillac', '1GY': 'Cadillac (SUV)',
        '2G4': 'Buick (Canada)',
        // Chrysler / Stellantis
        '1C3': 'Chrysler', '1C4': 'Chrysler (SUV)',
        '2C3': 'Chrysler (Canada)', '3C4': 'Chrysler (Mexico)',
        '1C6': 'Ram', '3C6': 'Ram (Mexico)',
        // Jeep
        '1J4': 'Jeep', '1J8': 'Jeep (Commander)',
        '1C4': 'Jeep / Chrysler',
        // Nissan / Infiniti
        '1N4': 'Nissan (Sedan)', '1N6': 'Nissan (Truck)',
        '5N1': 'Nissan (SUV)', 'JN1': 'Nissan (Japan)',
        'JN8': 'Infiniti',
        // Hyundai / Kia / Genesis
        '5NP': 'Hyundai (Sedan)', '5NM': 'Hyundai (SUV)',
        'KMH': 'Hyundai', 'KNA': 'Kia',
        'KMJ': 'Genesis',
        // Subaru
        'JF1': 'Subaru', 'JF2': 'Subaru (SUV)',
        '4S3': 'Subaru (US Sedan)', '4S4': 'Subaru (US SUV)',
        // Mazda
        'JM1': 'Mazda (Sedan)', 'JM3': 'Mazda (SUV)',
        '3MY': 'Mazda (Mexico)',
        // Volvo
        'YV1': 'Volvo (Sedan)', 'YV4': 'Volvo (SUV)',
        // Tesla
        '5YJ': 'Tesla', '7SA': 'Tesla',
        // Rivian / Lucid / EV
        '7PD': 'Rivian', '7GR': 'Rivian',
    };

    // ── Position 3: Vehicle Type / Division ──
    const VEHICLE_TYPE_HINTS = {
        '1': 'Passenger Car', '2': 'Passenger Car / SUV', '3': 'Truck / MPV',
        '4': 'SUV / Crossover', '5': 'SUV / Crossover', '6': 'Van / MPV',
        '7': 'Truck / Commercial', '8': 'Heavy Truck / Bus',
        'A': 'Sedan / Hatchback', 'B': 'SUV / Crossover', 'C': 'Convertible / Coupe',
        'D': 'Truck / SUV', 'E': 'SUV / Crossover', 'F': 'Truck / SUV',
        'G': 'SUV / Multipurpose Vehicle', 'H': 'Van / Bus',
        'K': 'SUV / Crossover', 'L': 'Sedan / Hatchback',
        'N': 'SUV / Crossover', 'P': 'Sedan / Coupe',
        'R': 'SUV / Crossover', 'S': 'Sport / Performance',
        'T': 'Truck / Utility', 'U': 'Utility / Chassis',
        'V': 'Van / Multipurpose', 'W': 'Wagon / Estate',
        'X': 'SUV / Crossover', 'Y': 'SUV / Crossover',
    };

    // ── Known Assembly Plants (pos 11) ──
    const ASSEMBLY_PLANTS = {
        // Mercedes-Benz
        'MB-A': 'Tuscaloosa (Vance), Alabama', 'MB-E': 'Stuttgart, Germany',
        'MB-F': 'Sindelfingen, Germany', 'MB-J': 'Rastatt, Germany',
        'MB-H': 'Bremen, Germany', 'MB-D': 'Düsseldorf, Germany',
        // Toyota
        'TY-0': 'Toyota City, Japan', 'TY-2': 'Cambridge, Ontario',
        'TY-K': 'Georgetown, Kentucky', 'TY-U': 'Princeton, Indiana',
        'TY-6': 'Tahara, Japan', 'TY-X': 'San Antonio, Texas',
        // Ford
        'FD-A': 'Atlanta, Georgia', 'FD-C': 'Ontario, Canada',
        'FD-D': 'Dearborn, Michigan', 'FD-K': 'Kansas City, Missouri',
        'FD-L': 'Louisville, Kentucky', 'FD-P': 'Twin Cities, Minnesota',
        'FD-X': 'Louisville, Kentucky',
        // Honda
        'HN-A': 'Marysville, Ohio', 'HN-L': 'East Liberty, Ohio',
        'HN-C': 'Alliston, Ontario', 'HN-1': 'Suzuka, Japan',
        // BMW
        'BM-A': 'Munich, Germany', 'BM-B': 'Dingolfing, Germany',
        'BM-E': 'Spartanburg, South Carolina', 'BM-V': 'Leipzig, Germany',
        'BM-G': 'Graz, Austria (Magna)',
    };

    // ── Manufacturer short keys (for plant & model lookup) ──
    function _getMfgKey(wmi) {
        const code = wmi.substring(0, 3);
        const name = WMI_3[code] || '';
        if (name.includes('Mercedes') || name.includes('AMG')) return 'MB';
        if (name.includes('Toyota') || name.includes('Lexus')) return 'TY';
        if (name.includes('Ford') || name.includes('Lincoln')) return 'FD';
        if (name.includes('Honda') || name.includes('Acura')) return 'HN';
        if (name.includes('BMW')) return 'BM';
        if (name.includes('Chevrolet') || name.includes('GMC') || name.includes('Cadillac') || name.includes('Buick')) return 'GM';
        if (name.includes('Nissan') || name.includes('Infiniti')) return 'NS';
        if (name.includes('Jeep') || name.includes('Ram') || name.includes('Chrysler') || name.includes('Dodge')) return 'FC';
        if (name.includes('Hyundai') || name.includes('Genesis')) return 'HY';
        if (name.includes('Kia')) return 'KI';
        if (name.includes('Subaru')) return 'SB';
        if (name.includes('Volkswagen')) return 'VW';
        if (name.includes('Audi')) return 'AU';
        if (name.includes('Porsche')) return 'PO';
        if (name.includes('Tesla')) return 'TS';
        if (name.includes('Mazda')) return 'MZ';
        if (name.includes('Volvo')) return 'VO';
        // Fallback to 2-char manufacturer match
        const n2 = MANUFACTURER[wmi[0] + wmi[1]] || '';
        if (n2.includes('Mercedes')) return 'MB';
        if (n2.includes('Toyota') || n2.includes('Lexus')) return 'TY';
        if (n2.includes('Ford') || n2.includes('Lincoln')) return 'FD';
        if (n2.includes('Honda')) return 'HN';
        if (n2.includes('BMW')) return 'BM';
        if (n2.includes('General Motors') || n2.includes('Chevrolet') || n2.includes('Cadillac')) return 'GM';
        if (n2.includes('Nissan')) return 'NS';
        if (n2.includes('Jeep') || n2.includes('Chrysler') || n2.includes('Dodge') || n2.includes('FCA')) return 'FC';
        if (n2.includes('Hyundai')) return 'HY';
        if (n2.includes('Kia')) return 'KI';
        if (n2.includes('Subaru')) return 'SB';
        if (n2.includes('Volkswagen')) return 'VW';
        if (n2.includes('Mazda')) return 'MZ';
        return null;
    }

    // ── String cleanup helpers ──
    function _cleanMake(mfg) {
        let c = mfg.replace(/\s*\(.*?\)/g, '').trim();
        if (c.includes(' / ')) c = c.split(' / ')[0].trim();
        return c || mfg;
    }

    function _cleanBody(body) {
        if (!body) return null;
        const m = body.match(/\(([^)]+)\)/);
        if (m) return m[1];
        return body.split('/')[0].trim();
    }

    function _cleanDriveType(dt) {
        if (!dt) return null;
        return dt.split('/')[0].trim();
    }

    // ── NHTSA VIN Decoder API (free, no key required) ──
    let _lastDecodeVin = '';

    async function _fetchNHTSA(vin) {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 8000);
        try {
            const resp = await fetch(
                `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`,
                { signal: controller.signal }
            );
            clearTimeout(tid);
            if (!resp.ok) return null;
            const data = await resp.json();
            const r = {};
            for (const item of (data.Results || [])) {
                if (item.Value && item.Value.trim() && item.Value !== 'Not Applicable') {
                    r[item.Variable] = item.Value.trim();
                }
            }
            if (!r['Make'] && !r['Model']) return null;
            return {
                make: r['Make'] || null,
                model: r['Model'] || null,
                trim: r['Trim'] || r['Trim2'] || null,
                body: r['Body Class'] || null,
                doors: r['Doors'] || null,
                engine: _buildEngineStr(r),
                driveType: r['Drive Type'] || null,
                fuel: r['Fuel Type - Primary'] || null,
                plantCity: r['Plant City'] || null,
                plantState: r['Plant State'] || null,
                plantCountry: r['Plant Country'] || null,
                series: r['Series'] || r['Series2'] || null,
            };
        } catch (e) {
            clearTimeout(tid);
            return null;
        }
    }

    function _buildEngineStr(r) {
        const parts = [];
        if (r['Displacement (L)']) {
            parts.push(parseFloat(r['Displacement (L)']).toFixed(1) + 'L');
        }
        const cyl = r['Engine Number of Cylinders'];
        const cfg = r['Engine Configuration'];
        if (cyl && cfg) {
            const prefix = cfg === 'V-Shaped' ? 'V' : cfg === 'In-Line' ? 'I'
                : (cfg === 'Flat' || cfg === 'Opposed') ? 'H' : '';
            parts.push(prefix ? prefix + cyl : cyl + '-cyl');
        } else if (cyl) {
            parts.push(cyl + '-cyl');
        }
        const fuel = r['Fuel Type - Primary'];
        if (fuel && fuel !== 'Gasoline') parts.push(fuel);
        if (r['Turbo'] === 'Yes') parts.push('Turbo');
        return parts.length ? parts.join(' ') : null;
    }

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

        // 3-char WMI first, then 2-char fallback
        const mfgKey3 = wmi;
        const mfgKey2 = vin[0] + vin[1];
        const manufacturer = WMI_3[mfgKey3] || MANUFACTURER[mfgKey2] || 'Unknown Manufacturer';

        const vehicleType = VEHICLE_TYPE_HINTS[vin[2]] || 'Vehicle Division';
        const checkDigit = _validateCheckDigit(vin);
        const modelYear = MODEL_YEAR[vin[9]] || 'Unknown';
        const plantCode = vin[10];
        const serial = vin.substring(11, 17);

        // Resolve assembly plant name
        const mfgShort = _getMfgKey(wmi);
        const plantName = mfgShort ? (ASSEMBLY_PLANTS[mfgShort + '-' + plantCode] || null) : null;
        const plantDisplay = plantName ? `${plantName} (${plantCode})` : `Plant code: ${plantCode}`;

        // Build VDS description — show WMI context for pos 1-3
        const wmiLabel = WMI_3[mfgKey3]
            ? `${WMI_3[mfgKey3]} (WMI: ${mfgKey3})`
            : manufacturer;
        const vdsDesc = 'Body, engine, restraints, transmission (manufacturer-specific)';

        // Build per-position breakdown
        const positions = [
            { pos: 1,    char: vin[0],  section: 'WMI', label: 'Country of Origin',    value: country },
            { pos: 2,    char: vin[1],  section: 'WMI', label: 'Manufacturer',          value: wmiLabel },
            { pos: 3,    char: vin[2],  section: 'WMI', label: 'Vehicle Type / Division', value: vehicleType },
            { pos: '4-8', char: vds.substring(0, 5), section: 'VDS', label: 'Vehicle Attributes', value: vdsDesc },
            { pos: 9,    char: vin[8],  section: 'VDS', label: 'Check Digit',           value: checkDigit.valid ? '✅ Valid' : `⚠️ Expected ${checkDigit.expected}, got ${checkDigit.actual}` },
            { pos: 10,   char: vin[9],  section: 'VIS', label: 'Model Year',            value: String(modelYear) },
            { pos: 11,   char: vin[10], section: 'VIS', label: 'Assembly Plant',        value: plantDisplay },
            { pos: '12-17', char: serial, section: 'VIS', label: 'Production Sequence', value: `Serial #${serial}` },
        ];

        const make = _cleanMake(manufacturer);

        return {
            vin, wmi, vds, vis, country, manufacturer, make, vehicleType,
            modelYear, plant: plantCode, serial, checkDigit, positions,
            model: null, body: null, trim: null, engine: null,
            driveType: null, fuel: null, plantInfo: plantName || null,
            _nhtsaLoading: false
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

        // Hero section — Year Make Model + vehicle badges
        const heroMake = result.make || _cleanMake(result.manufacturer);
        const ymmParts = [];
        if (result.modelYear && result.modelYear !== 'Unknown') ymmParts.push(result.modelYear);
        ymmParts.push(heroMake);
        if (result.model) ymmParts.push(result.model);
        const ymm = ymmParts.join(' ');

        const bodyDisplay = result.body ? _cleanBody(result.body) : (result.vehicleType || null);
        const driveDisplay = result.driveType ? _cleanDriveType(result.driveType) : null;

        let heroBadges = '';
        if (result._nhtsaLoading) {
            heroBadges += '<span class="vin-badge vin-badge-loading">🔄 Fetching vehicle details…</span>';
        }
        if (bodyDisplay) heroBadges += `<span class="vin-badge vin-badge-body">${bodyDisplay}</span>`;
        if (result.engine) heroBadges += `<span class="vin-badge vin-badge-engine">⚙️ ${result.engine}</span>`;
        if (driveDisplay) heroBadges += `<span class="vin-badge vin-badge-drive">🛞 ${driveDisplay}</span>`;
        heroBadges += `<span class="vin-badge vin-badge-check">${result.checkDigit.valid ? '✅ Valid' : '⚠️ Invalid Check'}</span>`;

        const builtIn = result.plantInfo || result.country;
        const heroTrim = result.trim ? `<div class="vin-hero-trim">${result.trim}</div>` : '';

        const heroHTML = `
            <div class="vin-hero">
                <div class="vin-hero-ymm">${ymm}</div>
                ${heroTrim}
                <div class="vin-hero-badges">${heroBadges}</div>
                <div class="vin-hero-meta">🏭 Built in ${builtIn}</div>
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
                <p class="vin-phonetic-hint">Read each character using the APCO phonetic alphabet — the standard for insurance & police dispatchers</p>
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

        el.innerHTML = heroHTML + visualHTML + phoneticHTML + breakdownHTML;
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
                    ${item.modelYear !== 'Unknown' ? item.modelYear + ' ' : ''}${item.make || item.manufacturer}${item.model ? ' ' + item.model : ''}${item.body ? ' · ' + item.body : ''}
                </div>
            </div>
        `).join('');
    }

    // ── Actions ──

    async function decode() {
        const input = document.getElementById('vinInput');
        if (!input) return;

        const raw = input.value.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
        if (!raw) return;

        const result = _decode(raw);
        if (!result) { _renderResult(null); return; }

        // Render instantly with local data
        result._nhtsaLoading = true;
        _lastDecodeVin = result.vin;
        _renderResult(result);

        // Fetch full vehicle details from NHTSA (free, no API key)
        const nhtsa = await _fetchNHTSA(result.vin);

        // Guard: user may have decoded another VIN while waiting
        if (_lastDecodeVin !== result.vin) return;
        result._nhtsaLoading = false;

        if (nhtsa) {
            result.make = nhtsa.make || result.make;
            result.model = nhtsa.model || null;
            result.trim = nhtsa.trim || null;
            result.body = nhtsa.body || null;
            result.engine = nhtsa.engine || null;
            result.driveType = nhtsa.driveType || null;
            result.fuel = nhtsa.fuel || null;

            // Enrich plant info (keep local if more detailed)
            if (!result.plantInfo && (nhtsa.plantCity || nhtsa.plantState)) {
                result.plantInfo = [nhtsa.plantCity, nhtsa.plantState].filter(Boolean).join(', ');
            }

            // Update VDS breakdown row with actual decoded info
            if (result.model) {
                const vdsParts = [result.model];
                if (result.engine) vdsParts.push(result.engine);
                if (result.driveType) vdsParts.push(_cleanDriveType(result.driveType));
                const vdsRow = result.positions.find(p => p.pos === '4-8');
                if (vdsRow) vdsRow.value = vdsParts.join(' · ');
            }

            // Update plant breakdown row
            if (result.plantInfo) {
                const plantRow = result.positions.find(p => p.pos === 11);
                if (plantRow) plantRow.value = `${result.plantInfo} (${result.plant})`;
            }
        }

        // Re-render with enriched data
        _renderResult(result);

        // Save to history
        _history = _history.filter(h => h.vin !== result.vin);
        _history.unshift({
            vin: result.vin,
            manufacturer: result.manufacturer,
            make: result.make,
            model: result.model || null,
            body: result.body ? _cleanBody(result.body) : null,
            modelYear: result.modelYear,
            country: result.country,
            decodedAt: new Date().toISOString()
        });
        if (_history.length > MAX_HISTORY) _history = _history.slice(0, MAX_HISTORY);
        _save();
        _renderHistory();
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
        if (typeof App === 'undefined') return;

        // 1) Check vehicles array first (where VINs actually live)
        let vin = '';
        if (Array.isArray(App.vehicles) && App.vehicles.length > 0) {
            // Find the first vehicle with a VIN
            const vehWithVin = App.vehicles.find(v => v && v.vin && v.vin.trim());
            if (vehWithVin) vin = vehWithVin.vin.trim();
        }

        // 2) Fallback to App.data fields
        if (!vin && App.data) {
            vin = App.data.vehicleVin || App.data.vin || '';
        }

        if (vin) {
            const input = document.getElementById('vinInput');
            if (input) input.value = vin;
            decode();
            if (App.toast) App.toast('📥 VIN loaded from intake form');
        } else {
            if (App.toast) App.toast('⚠️ No VIN found — add a vehicle with a VIN in the quoting wizard first', 'error');
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
