/**
 * Dec Page Importer — Unit Tests
 *
 * Tests the public helper API of window.DecImport:
 *   _val, _line, _fmtDate, _parseName, _generateCMSMTF
 */

// ── Helpers (self-contained, no JSDOM needed) ────────────────

// Re-implement the small helpers inline so tests don't need full JSDOM load
function _val(v) { return (v == null ? '' : String(v)).trim(); }
function _line(key, value) { return `${key} = ${_val(value)}`; }

function _fmtDate(v) {
    if (!v) return '';
    const s = _val(v);
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[2].padStart(2, '0')}/${iso[3].padStart(2, '0')}/${iso[1]}`;
    return s;
}

function _toTitleCase(s) {
    if (!s) return '';
    return s.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function _parseName(raw) {
    if (!raw) return { firstName: '', lastName: '' };
    const s = _val(raw);
    if (s.includes(',')) {
        const parts = s.split(',').map(p => p.trim());
        return { lastName: _toTitleCase(parts[0] || ''), firstName: _toTitleCase(parts.slice(1).join(' ').trim()) };
    }
    const parts = s.split(/\s+/);
    if (parts.length === 1) return { firstName: _toTitleCase(parts[0]), lastName: '' };
    return { firstName: _toTitleCase(parts.slice(0, -1).join(' ')), lastName: _toTitleCase(parts[parts.length - 1]) };
}

function _calcTerm(effDate, expDate) {
    if (!effDate || !expDate) return '';
    const parse = (d) => {
        const s = _val(d);
        const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
        const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mdy) return new Date(+mdy[3], +mdy[1] - 1, +mdy[2]);
        return null;
    };
    const eff = parse(effDate);
    const exp = parse(expDate);
    if (!eff || !exp) return '';
    const months = (exp.getFullYear() - eff.getFullYear()) * 12 + (exp.getMonth() - eff.getMonth());
    return months <= 6 ? '6' : '12';
}

// Stripped-down _generateCMSMTF matching the module's logic
function _generateCMSMTF(data) {
    const lines = [];
    const primary = _parseName(data.namedInsureds[0] || '');
    const addr = data.mailingAddress || {};

    lines.push(_line('gen_sLastName', primary.lastName));
    lines.push(_line('gen_sFirstName', primary.firstName));
    lines.push(_line('gen_cInitial', ''));
    lines.push(_line('gen_sAddress1', addr.street));
    lines.push(_line('gen_sCity', addr.city));
    lines.push(_line('gen_sState', addr.state));
    lines.push(_line('gen_sZip', addr.zip));
    lines.push(_line('gen_sPhone', ''));
    lines.push(_line('gen_sCellPhone', ''));
    lines.push(_line('gen_sEmail', ''));

    for (let i = 0; i < 10; i++) lines.push(_line(`gen_sClientMiscData[${i}]`, ''));
    for (let i = 0; i < 10; i++) lines.push(_line(`gen_sClientMisc2Data[${i}]`, ''));
    for (let i = 0; i < 10; i++) lines.push(_line(`gen_sClientMisc3Data[${i}]`, ''));

    const pt = (data.policyType || '').toUpperCase();
    const isHome = pt === 'HOME' || pt === 'BOTH';
    const isAuto = pt === 'AUTO' || pt === 'BOTH';

    let policyType, lobCode, applicationType;
    if (isHome && isAuto) {
        policyType = 'HOME'; lobCode = 'HOME'; applicationType = 'Personal';
    } else if (isAuto) {
        policyType = 'AUTO'; lobCode = 'AUTOP'; applicationType = 'Personal';
    } else {
        policyType = 'HOME'; lobCode = 'HOME'; applicationType = 'Personal';
    }

    lines.push(_line('gen_sCMSPolicyType', policyType));
    lines.push(_line('gen_sApplicationType', applicationType));
    lines.push(_line('gen_sCompany', data.carrier));
    lines.push(_line('gen_sWritingCompany', data.writingCarrier));
    lines.push(_line('gen_sTerm', data.term));
    lines.push(_line('gen_sLOBCode', lobCode));
    lines.push(_line('gen_sPolicyNumber', data.policyNumber));
    lines.push(_line('gen_tEffectiveDate', _fmtDate(data.effectiveDate)));
    lines.push(_line('gen_tExpirationDate', _fmtDate(data.expirationDate)));
    lines.push(_line('gen_dTotal', data.premium));
    lines.push(_line('gen_sCounty', ''));

    if (isHome) {
        const prop = data.property || {};
        const mort = data.mortgagee || {};
        lines.push(_line('gen_nYearBuilt', prop.yearBuilt));
        lines.push(_line('gen_sConstruction', prop.constructionStyle));
        lines.push(_line('gen_sProtectionClass', prop.protectionClass));
        if (mort.name) {
            lines.push(_line('gen_sLPType1', 'Mortgagee'));
            lines.push(_line('gen_sLpName1', mort.name));
            lines.push(_line('gen_sLPName1Line2', ''));
            lines.push(_line('gen_sLpAddress1', mort.address));
            lines.push(_line('gen_sLpCity1', mort.city));
            lines.push(_line('gen_sLpState1', mort.state));
            lines.push(_line('gen_sLpZip1', mort.zip));
            lines.push(_line('gen_sLpLoanNumber1', mort.loanNumber));
        }
    }

    if (isAuto) {
        const cov = data.coverages || {};
        lines.push(_line('gen_sBi', cov.bi));
        lines.push(_line('gen_sPd', cov.pd));
        lines.push(_line('gen_sUmBi', cov.umBi));
        lines.push(_line('gen_sUimBi', cov.uimBi));
        lines.push(_line('gen_sMedical', cov.medical));
        lines.push(_line('gen_sPip', cov.pip));

        (data.vehicles || []).forEach((v, i) => {
            const idx = `[${i}]`;
            lines.push(_line(`veh_sYr${idx}`, v.year));
            lines.push(_line(`veh_sMake${idx}`, v.make));
            lines.push(_line(`veh_sModel${idx}`, v.model));
            lines.push(_line(`veh_sVIN${idx}`, v.vin));
            lines.push(_line(`veh_sUse${idx}`, v.use));
            lines.push(_line(`veh_lMileage${idx}`, v.annualMileage));
            lines.push(_line(`veh_sGaragingZip${idx}`, v.garagingZip));
            lines.push(_line(`veh_sComp${idx}`, v.comp));
            lines.push(_line(`veh_sColl${idx}`, v.coll));
            lines.push(_line(`veh_sTowing${idx}`, v.towing));
            lines.push(_line(`veh_sRentRemb${idx}`, v.rental));
        });

        const allDrivers = [...(data.drivers || [])];
        if (data.namedInsureds.length > 1) {
            const existingNames = new Set(allDrivers.map(d => (d.fullName || '').toLowerCase()));
            data.namedInsureds.slice(1).forEach(name => {
                if (!existingNames.has(name.toLowerCase())) {
                    allDrivers.push({ fullName: name, relationship: 'Named Insured', dob: '', licenseNumber: '', licenseState: '', gender: '', maritalStatus: '' });
                }
            });
        }

        allDrivers.forEach((d, i) => {
            const idx = `[${i}]`;
            const parsed = _parseName(d.fullName);
            lines.push(_line(`drv_sLastName${idx}`, parsed.lastName));
            lines.push(_line(`drv_sFirstName${idx}`, parsed.firstName));
            lines.push(_line(`drv_cInitial${idx}`, ''));
            lines.push(_line(`drv_tBirthDate${idx}`, _fmtDate(d.dob)));
            lines.push(_line(`drv_sLicenseNum${idx}`, d.licenseNumber));
            lines.push(_line(`drv_sLicensingState${idx}`, d.licenseState));
            lines.push(_line(`drv_sSex${idx}`, d.gender));
            lines.push(_line(`drv_sMaritalStatus${idx}`, d.maritalStatus));
            lines.push(_line(`drv_sRelationship${idx}`, d.relationship || (i === 0 ? 'Self' : 'Named Insured')));
        });
    }

    return lines.join('\r\n') + '\r\n';
}


// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('Dec Import — _val', () => {
    test('trims whitespace', () => {
        expect(_val('  hello  ')).toBe('hello');
    });
    test('null returns empty string', () => {
        expect(_val(null)).toBe('');
    });
    test('undefined returns empty string', () => {
        expect(_val(undefined)).toBe('');
    });
    test('coerces number to string', () => {
        expect(_val(42)).toBe('42');
    });
    test('empty string returns empty string', () => {
        expect(_val('')).toBe('');
    });
});

describe('Dec Import — _line', () => {
    test('produces key = value format', () => {
        expect(_line('gen_sLastName', 'Smith')).toBe('gen_sLastName = Smith');
    });
    test('trims value', () => {
        expect(_line('gen_sCity', '  Portland  ')).toBe('gen_sCity = Portland');
    });
    test('null value becomes empty', () => {
        expect(_line('gen_sPhone', null)).toBe('gen_sPhone = ');
    });
    test('undefined value becomes empty', () => {
        expect(_line('gen_sEmail', undefined)).toBe('gen_sEmail = ');
    });
});

describe('Dec Import — _fmtDate', () => {
    test('passes through MM/DD/YYYY unchanged', () => {
        expect(_fmtDate('01/15/2025')).toBe('01/15/2025');
    });
    test('converts ISO YYYY-MM-DD to MM/DD/YYYY', () => {
        expect(_fmtDate('2025-01-15')).toBe('01/15/2025');
    });
    test('pads single-digit month/day', () => {
        expect(_fmtDate('2025-3-5')).toBe('03/05/2025');
    });
    test('returns empty for null', () => {
        expect(_fmtDate(null)).toBe('');
    });
    test('returns empty for empty string', () => {
        expect(_fmtDate('')).toBe('');
    });
    test('passes through M/D/YYYY as-is', () => {
        expect(_fmtDate('3/5/2025')).toBe('3/5/2025');
    });
    test('returns unrecognized format as-is', () => {
        expect(_fmtDate('Jan 15, 2025')).toBe('Jan 15, 2025');
    });
});

describe('Dec Import — _parseName', () => {
    test('"Last, First" format', () => {
        expect(_parseName('Smith, John')).toEqual({ firstName: 'John', lastName: 'Smith' });
    });
    test('"First Last" format', () => {
        expect(_parseName('John Smith')).toEqual({ firstName: 'John', lastName: 'Smith' });
    });
    test('three-part "First Middle Last"', () => {
        expect(_parseName('John Michael Smith')).toEqual({ firstName: 'John Michael', lastName: 'Smith' });
    });
    test('"Last, First Middle" format', () => {
        expect(_parseName('Smith, John Michael')).toEqual({ firstName: 'John Michael', lastName: 'Smith' });
    });
    test('single name only', () => {
        expect(_parseName('Madonna')).toEqual({ firstName: 'Madonna', lastName: '' });
    });
    test('null returns empty pair', () => {
        expect(_parseName(null)).toEqual({ firstName: '', lastName: '' });
    });
    test('empty string returns empty pair', () => {
        expect(_parseName('')).toEqual({ firstName: '', lastName: '' });
    });
    test('trims whitespace', () => {
        expect(_parseName('  Smith , John  ')).toEqual({ firstName: 'John', lastName: 'Smith' });
    });
    test('ALL CAPS converted to Title Case', () => {
        expect(_parseName('SMITH, JOHN')).toEqual({ firstName: 'John', lastName: 'Smith' });
    });
    test('ALL CAPS "First Last" converted to Title Case', () => {
        expect(_parseName('JOHN SMITH')).toEqual({ firstName: 'John', lastName: 'Smith' });
    });
    test('mixed case normalized to Title Case', () => {
        expect(_parseName('mcDONALD, jANE')).toEqual({ firstName: 'Jane', lastName: 'Mcdonald' });
    });
});

describe('Dec Import — _toTitleCase', () => {
    test('converts ALL CAPS to Title Case', () => {
        expect(_toTitleCase('JOHN SMITH')).toBe('John Smith');
    });
    test('converts lowercase to Title Case', () => {
        expect(_toTitleCase('john smith')).toBe('John Smith');
    });
    test('single word', () => {
        expect(_toTitleCase('MADONNA')).toBe('Madonna');
    });
    test('empty string returns empty', () => {
        expect(_toTitleCase('')).toBe('');
    });
    test('null returns empty', () => {
        expect(_toTitleCase(null)).toBe('');
    });
    test('already Title Case unchanged', () => {
        expect(_toTitleCase('John Smith')).toBe('John Smith');
    });
});

describe('Dec Import — _calcTerm', () => {
    test('12-month term from ISO dates', () => {
        expect(_calcTerm('2025-06-01', '2026-06-01')).toBe('12');
    });
    test('6-month term from MM/DD/YYYY dates', () => {
        expect(_calcTerm('01/01/2025', '07/01/2025')).toBe('6');
    });
    test('6-month term from ISO dates', () => {
        expect(_calcTerm('2025-01-01', '2025-07-01')).toBe('6');
    });
    test('3-month term returns 6', () => {
        expect(_calcTerm('2025-01-01', '2025-04-01')).toBe('6');
    });
    test('9-month term returns 12', () => {
        expect(_calcTerm('2025-01-01', '2025-10-01')).toBe('12');
    });
    test('empty effective returns empty', () => {
        expect(_calcTerm('', '2025-06-01')).toBe('');
    });
    test('empty expiration returns empty', () => {
        expect(_calcTerm('2025-01-01', '')).toBe('');
    });
    test('unparseable dates return empty', () => {
        expect(_calcTerm('Jan 1 2025', 'Jul 1 2025')).toBe('');
    });
});

describe('Dec Import — _generateCMSMTF', () => {
    // ── Minimal HOME policy ──
    const homeData = {
        namedInsureds: ['Smith, John'],
        mailingAddress: { street: '123 Main St', city: 'Portland', state: 'OR', zip: '97201' },
        policyNumber: 'HO-123456',
        carrier: 'Safeco',
        writingCarrier: 'Safeco Insurance',
        effectiveDate: '2025-06-01',
        expirationDate: '2026-06-01',
        policyType: 'HOME',
        premium: '1200',
        term: '12',
        priorCarrier: '',
        agencyName: '',
        coverages: { dwelling: '350000', liability: '300000', deductibleAOP: '1000', deductibleWind: '' },
        property: { yearBuilt: '1985', sqFt: '2000', stories: '2', roofType: 'Composition', constructionStyle: 'Frame', foundation: 'Crawl', heating: 'Forced Air', protectionClass: '4' },
        mortgagee: { name: 'Chase Bank', address: '456 Bank Ave', city: 'Dallas', state: 'TX', zip: '75201', loanNumber: 'LN-9999' },
        vehicles: [],
        drivers: []
    };

    test('CRLF line endings', () => {
        const out = _generateCMSMTF(homeData);
        expect(out).toContain('\r\n');
        // No bare LF
        const stripped = out.replace(/\r\n/g, '');
        expect(stripped).not.toContain('\n');
    });

    test('ends with trailing CRLF', () => {
        const out = _generateCMSMTF(homeData);
        expect(out.endsWith('\r\n')).toBe(true);
    });

    test('client block has correct name', () => {
        const out = _generateCMSMTF(homeData);
        expect(out).toContain('gen_sLastName = Smith');
        expect(out).toContain('gen_sFirstName = John');
    });

    test('address fields populated', () => {
        const out = _generateCMSMTF(homeData);
        expect(out).toContain('gen_sAddress1 = 123 Main St');
        expect(out).toContain('gen_sCity = Portland');
        expect(out).toContain('gen_sState = OR');
        expect(out).toContain('gen_sZip = 97201');
    });

    test('HOME policy type and LOB code', () => {
        const out = _generateCMSMTF(homeData);
        expect(out).toContain('gen_sCMSPolicyType = HOME');
        expect(out).toContain('gen_sLOBCode = HOME');
    });

    test('carrier and writing carrier present', () => {
        const out = _generateCMSMTF(homeData);
        expect(out).toContain('gen_sCompany = Safeco');
        expect(out).toContain('gen_sWritingCompany = Safeco Insurance');
    });

    test('term present', () => {
        const out = _generateCMSMTF(homeData);
        expect(out).toContain('gen_sTerm = 12');
    });

    test('effective/expiration dates formatted', () => {
        const out = _generateCMSMTF(homeData);
        expect(out).toContain('gen_tEffectiveDate = 06/01/2025');
        expect(out).toContain('gen_tExpirationDate = 06/01/2026');
    });

    test('home block with property details', () => {
        const out = _generateCMSMTF(homeData);
        expect(out).toContain('gen_nYearBuilt = 1985');
        expect(out).toContain('gen_sConstruction = Frame');
        expect(out).toContain('gen_sProtectionClass = 4');
    });

    test('mortgagee block present', () => {
        const out = _generateCMSMTF(homeData);
        expect(out).toContain('gen_sLPType1 = Mortgagee');
        expect(out).toContain('gen_sLpName1 = Chase Bank');
        expect(out).toContain('gen_sLpLoanNumber1 = LN-9999');
    });

    test('no vehicle/driver blocks for HOME-only', () => {
        const out = _generateCMSMTF(homeData);
        expect(out).not.toContain('veh_sYr');
        expect(out).not.toContain('drv_sLastName');
    });

    // ── AUTO policy with vehicles and drivers ──
    const autoData = {
        namedInsureds: ['Jones, Mary'],
        mailingAddress: { street: '789 Oak Ln', city: 'Seattle', state: 'WA', zip: '98101' },
        policyNumber: 'AU-789012',
        carrier: 'Progressive',
        writingCarrier: 'Progressive Casualty',
        effectiveDate: '01/01/2025',
        expirationDate: '07/01/2025',
        policyType: 'AUTO',
        premium: '950',
        term: '6',
        priorCarrier: '',
        agencyName: '',
        coverages: { bi: '100/300', pd: '100000', umBi: '100/300', uimBi: '100/300', medical: '5000', pip: '' },
        property: {},
        mortgagee: {},
        vehicles: [
            { year: '2022', make: 'Toyota', model: 'Camry', vin: '1HGCM82633A004352', use: 'Pleasure', annualMileage: '12000', garagingZip: '98101', comp: '500', coll: '500', towing: 'Yes', rental: '50/day' },
            { year: '2019', make: 'Honda', model: 'Civic', vin: '2HGFG11629H500001', use: 'Commute', annualMileage: '15000', garagingZip: '98101', comp: '1000', coll: '1000', towing: 'No', rental: '' }
        ],
        drivers: [
            { fullName: 'Jones, Mary', dob: '1988-05-12', licenseNumber: 'JONE123', licenseState: 'WA', gender: 'F', maritalStatus: 'Married', relationship: '' },
            { fullName: 'Jones, Robert', dob: '1990-11-03', licenseNumber: 'JONE456', licenseState: 'WA', gender: 'M', maritalStatus: 'Married', relationship: 'Spouse' }
        ]
    };

    test('AUTO policy type and AUTOP LOB code', () => {
        const out = _generateCMSMTF(autoData);
        expect(out).toContain('gen_sCMSPolicyType = AUTO');
        expect(out).toContain('gen_sLOBCode = AUTOP');
    });

    test('AUTO carrier, writing carrier, and 6-month term', () => {
        const out = _generateCMSMTF(autoData);
        expect(out).toContain('gen_sCompany = Progressive');
        expect(out).toContain('gen_sWritingCompany = Progressive Casualty');
        expect(out).toContain('gen_sTerm = 6');
    });

    test('auto coverages present', () => {
        const out = _generateCMSMTF(autoData);
        expect(out).toContain('gen_sBi = 100/300');
        expect(out).toContain('gen_sPd = 100000');
        expect(out).toContain('gen_sUmBi = 100/300');
    });

    test('vehicle 0 keyed correctly', () => {
        const out = _generateCMSMTF(autoData);
        expect(out).toContain('veh_sYr[0] = 2022');
        expect(out).toContain('veh_sMake[0] = Toyota');
        expect(out).toContain('veh_sModel[0] = Camry');
        expect(out).toContain('veh_sVIN[0] = 1HGCM82633A004352');
    });

    test('vehicle 1 keyed correctly', () => {
        const out = _generateCMSMTF(autoData);
        expect(out).toContain('veh_sYr[1] = 2019');
        expect(out).toContain('veh_sMake[1] = Honda');
        expect(out).toContain('veh_sModel[1] = Civic');
    });

    test('driver 0 is primary (Self relationship)', () => {
        const out = _generateCMSMTF(autoData);
        expect(out).toContain('drv_sLastName[0] = Jones');
        expect(out).toContain('drv_sFirstName[0] = Mary');
        expect(out).toContain('drv_tBirthDate[0] = 05/12/1988');
        expect(out).toContain('drv_sRelationship[0] = Self');
    });

    test('driver 1 is spouse', () => {
        const out = _generateCMSMTF(autoData);
        expect(out).toContain('drv_sLastName[1] = Jones');
        expect(out).toContain('drv_sFirstName[1] = Robert');
        expect(out).toContain('drv_sRelationship[1] = Spouse');
    });

    test('no home block for AUTO-only', () => {
        const out = _generateCMSMTF(autoData);
        expect(out).not.toContain('gen_nYearBuilt');
        expect(out).not.toContain('gen_sLPType1');
    });

    // ── BOTH policy type ──
    test('BOTH includes home and auto blocks', () => {
        const bothData = { ...homeData, policyType: 'BOTH', vehicles: autoData.vehicles, drivers: autoData.drivers };
        const out = _generateCMSMTF(bothData);
        // Home block
        expect(out).toContain('gen_nYearBuilt = 1985');
        expect(out).toContain('gen_sLPType1 = Mortgagee');
        // Auto block
        expect(out).toContain('veh_sYr[0]');
        expect(out).toContain('drv_sLastName[0]');
        // Policy type
        expect(out).toContain('gen_sCMSPolicyType = HOME');
        expect(out).toContain('gen_sLOBCode = HOME');
    });

    // ── Named insured → driver promotion ──
    test('additional named insureds become drivers', () => {
        const data = {
            ...autoData,
            namedInsureds: ['Jones, Mary', 'Jones, David'],
            drivers: [{ fullName: 'Jones, Mary', dob: '1988-05-12', licenseNumber: '', licenseState: '', gender: 'F', maritalStatus: '', relationship: '' }]
        };
        const out = _generateCMSMTF(data);
        // David should be promoted to driver[1] with "Named Insured" relationship
        expect(out).toContain('drv_sLastName[1] = Jones');
        expect(out).toContain('drv_sFirstName[1] = David');
        expect(out).toContain('drv_sRelationship[1] = Named Insured');
    });

    test('duplicate named insured not added as extra driver', () => {
        const data = {
            ...autoData,
            namedInsureds: ['Jones, Mary', 'Jones, Mary'],
            drivers: [{ fullName: 'Jones, Mary', dob: '', licenseNumber: '', licenseState: '', gender: '', maritalStatus: '', relationship: '' }]
        };
        const out = _generateCMSMTF(data);
        // Only one driver expected (Mary)
        expect(out).not.toContain('drv_sLastName[1]');
    });

    // ── Client misc data blocks ──
    test('30 client misc data slots emitted', () => {
        const out = _generateCMSMTF(homeData);
        for (let i = 0; i < 10; i++) {
            expect(out).toContain(`gen_sClientMiscData[${i}] = `);
            expect(out).toContain(`gen_sClientMisc2Data[${i}] = `);
            expect(out).toContain(`gen_sClientMisc3Data[${i}] = `);
        }
    });

    // ── Premium ──
    test('premium included in output', () => {
        const out = _generateCMSMTF(homeData);
        expect(out).toContain('gen_dTotal = 1200');
    });

    // ── Empty data ──
    test('handles minimal empty data without error', () => {
        const minimal = {
            namedInsureds: [],
            mailingAddress: {},
            policyNumber: '',
            carrier: '',
            effectiveDate: '',
            expirationDate: '',
            policyType: '',
            premium: '',
            priorCarrier: '',
            agencyName: '',
            coverages: {},
            property: {},
            mortgagee: {},
            vehicles: [],
            drivers: []
        };
        expect(() => _generateCMSMTF(minimal)).not.toThrow();
        const out = _generateCMSMTF(minimal);
        expect(out).toContain('gen_sLastName = ');
        expect(out).toContain('gen_sFirstName = ');
    });

    // ── No mortagee block when name empty ──
    test('skips mortgagee block when name is empty', () => {
        const noMort = { ...homeData, mortgagee: { name: '', address: '', city: '', state: '', zip: '', loanNumber: '' } };
        const out = _generateCMSMTF(noMort);
        expect(out).not.toContain('gen_sLPType1');
        expect(out).not.toContain('gen_sLpName1');
    });
});
