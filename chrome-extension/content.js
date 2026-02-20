/**
 * Altech EZLynx Filler — Content Script
 *
 * Injected into EZLynx pages. Fills form fields using data from
 * chrome.storage.local. Handles text inputs, native <select>,
 * and Angular Material mat-select dropdowns with fuzzy matching.
 *
 * Ported from python_backend/ezlynx_filler.py for in-browser execution.
 */

// ═══════════════════════════════════════════════════════════════
// §1  CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const FILL_DELAY    = 250;   // ms between field fills (was 120 — too fast for Angular)
const DROPDOWN_WAIT = 1000;  // ms to wait for overlay after click (was 700)
const RETRY_WAIT    = 1800;  // ms before retrying failed dropdowns (was 1200)

// ═══════════════════════════════════════════════════════════════
// §2  ABBREVIATION EXPANSIONS
// ═══════════════════════════════════════════════════════════════

const ABBREVIATIONS = {
    // Gender
    'M': 'Male', 'F': 'Female',
    // Marital
    'S': 'Single', 'D': 'Divorced', 'W': 'Widowed',
    'SEP': 'Separated', 'DP': 'Domestic Partner',
    // States
    'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas',
    'CA':'California','CO':'Colorado','CT':'Connecticut','DE':'Delaware',
    'DC':'District of Columbia','FL':'Florida','GA':'Georgia','HI':'Hawaii',
    'ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa',
    'KS':'Kansas','KY':'Kentucky','LA':'Louisiana','ME':'Maine',
    'MD':'Maryland','MA':'Massachusetts','MI':'Michigan','MN':'Minnesota',
    'MS':'Mississippi','MO':'Missouri','MT':'Montana','NE':'Nebraska',
    'NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey','NM':'New Mexico',
    'NY':'New York','NC':'North Carolina','ND':'North Dakota','OH':'Ohio',
    'OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island',
    'SC':'South Carolina','SD':'South Dakota','TN':'Tennessee','TX':'Texas',
    'UT':'Utah','VT':'Vermont','VA':'Virginia','WA':'Washington',
    'WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming',
    // Education
    'HS': 'High School Diploma', 'BA': 'Bachelors', 'BS': 'Bachelors',
    'MA': 'Masters', 'PHD': 'Phd', 'GED': 'High School Diploma',
    'JD': 'Law Degree', 'MD': 'Medical Degree',
    // Suffixes / Prefixes
    'JR': 'Jr', 'SR': 'Sr', 'II': 'II', 'III': 'III',
    'MR': 'Mr', 'MRS': 'Mrs', 'DR': 'Dr',
    // Vehicle use
    'COMMUTE': 'To/From Work', 'WORK': 'To/From Work', 'SCHOOL': 'To/From School',
    // Dwelling Type — map Altech values to EZLynx expected values
    'SINGLE FAMILY': 'One Family', 'SFR': 'One Family', 'SINGLE-FAMILY': 'One Family',
    'ONE FAMILY': 'One Family',
    'CONDO': 'Condo', 'CONDOMINIUM': 'Condo',
    'TOWNHOME': 'Townhouse', 'TOWNHOUSE': 'Townhouse', 'TOWN HOME': 'Townhouse',
    'ROW HOUSE': 'Rowhouse', 'ROWHOUSE': 'Rowhouse',
    'DUPLEX': 'Two Family', 'TWO FAMILY': 'Two Family', '2 FAMILY': 'Two Family',
    'TRIPLEX': 'Three Family', 'THREE FAMILY': 'Three Family', '3 FAMILY': 'Three Family',
    'FOURPLEX': 'Four Family', 'FOUR FAMILY': 'Four Family', '4 FAMILY': 'Four Family', 'QUADPLEX': 'Four Family',
    'MANUFACTURED': 'Mobile Home', 'MOBILE HOME': 'Mobile Home', 'MOBILE': 'Mobile Home',
    'MODULAR': 'Modular', 'PREFAB': 'Modular',
    // Occupancy
    'OWNER': 'Owner', 'OWNER OCCUPIED': 'Owner', 'PRIMARY': 'Owner',
    'TENANT': 'Tenant', 'TENANT OCCUPIED': 'Renter Occupied', 'RENTER': 'Tenant',
    'SEASONAL': 'Seasonal', 'VACATION': 'Seasonal',
    // Foundation
    'CRAWLSPACE': 'Crawl Space - Enclosed', 'CRAWL SPACE': 'Crawl Space - Enclosed',
    'BASEMENT FINISHED': 'Basement - Finished', 'FINISHED BASEMENT': 'Basement - Finished',
    'BASEMENT UNFINISHED': 'Basement - Unfinished', 'UNFINISHED BASEMENT': 'Basement - Unfinished',
    'BASEMENT': 'Basement - Unfinished',
    'SLAB': 'Slab', 'CONCRETE SLAB': 'Slab',
    'PIER/PILE': 'Pilings/stilts', 'PIER': 'Pilings/stilts', 'STILTS': 'Pilings/stilts', 'PILINGS': 'Pilings/stilts',
    'OPEN': 'Open',
    // Exterior Walls
    'BRICK': 'Brick', 'BRICK VENEER': 'Brick Veneer', 'STONE': 'Stone', 'STONE VENEER': 'Stone Veneer',
    'FRAME': 'Frame', 'WOOD FRAME': 'Frame', 'WOOD': 'Frame',
    'VINYL SIDING': 'Vinyl Siding', 'VINYL': 'Vinyl Siding',
    'STUCCO': 'Stucco', 'HARDY BOARD': 'Hardie Board', 'HARDIE BOARD': 'Hardie Board', 'FIBER CEMENT': 'Hardie Board',
    'ALUMINUM SIDING': 'Aluminum Siding', 'ALUMINUM': 'Aluminum Siding',
    'LOG': 'Log',
    // Roof Type (material)
    'COMP SHINGLE': 'Asphalt shingles', 'COMPOSITION': 'Asphalt shingles', 'ASPHALT': 'Asphalt shingles',
    'ASPHALT SHINGLE': 'Asphalt shingles', 'ASPHALT SHINGLES': 'Asphalt shingles',
    'ARCHITECTURAL': 'Architectural shingles', 'ARCHITECTURAL SHINGLE': 'Architectural shingles',
    'WOOD SHAKE': 'Wood shakes', 'SHAKE': 'Wood shakes', 'CEDAR': 'Wood shakes',
    'WOOD SHINGLE': 'Wood shingles', 'TILE': 'Tile', 'CLAY TILE': 'Clay tile',
    'CONCRETE TILE': 'Concrete tile', 'SLATE': 'Slate',
    'METAL': 'Metal', 'STANDING SEAM': 'Metal', 'TIN': 'Metal',
    'TPO': 'Single-ply membrane', 'RUBBER': 'Single-ply membrane', 'EPDM': 'Single-ply membrane',
    'TAR': 'Built-up', 'BUILT-UP': 'Built-up', 'ROLLED': 'Rolled composition',
    // Roof Design (shape)
    'GABLE': 'Gable', 'HIP': 'Hip', 'FLAT': 'Flat', 'GAMBREL': 'Gambrel',
    'MANSARD': 'Mansard', 'SHED': 'Shed', 'A-FRAME': 'A-Frame',
    // Construction Style
    'COLONIAL': 'Colonial', 'RANCH': 'Ranch', 'SPLIT LEVEL': 'Split Level',
    'CAPE COD': 'Cape Cod', 'VICTORIAN': 'Victorian', 'CONTEMPORARY': 'Contemporary',
    'CRAFTSMAN': 'Craftsman', 'TUDOR': 'Tudor', 'MEDITERRANEAN': 'Mediterranean',
    'BI-LEVEL': 'Bi-Level', 'TRI-LEVEL': 'Tri-Level',
    // Heating
    'FORCED AIR': 'Forced Air', 'CENTRAL': 'Forced Air',
    'BASEBOARD': 'Electric Baseboard', 'ELECTRIC': 'Electric Baseboard',
    'HEAT PUMP': 'Heat Pump', 'RADIANT': 'Radiant', 'STEAM': 'Steam',
    'HOT WATER': 'Hot Water',
    'SPACE': 'Space Heater', 'SPACE HEATER': 'Space Heater',
    'WOOD STOVE': 'Wood Stove', 'FIREPLACE': 'Fireplace',
    'GAS': 'Forced Air', 'OIL': 'Oil',
    // Alarms
    'MONITORED': 'Central', 'LOCAL': 'Local', 'NONE': 'None',
    // Pool
    'YES': 'Yes', 'NO': 'No',
    'ABOVE GROUND': 'Above Ground', 'IN GROUND': 'In Ground', 'IN-GROUND': 'In Ground',
    // Policy
    'HO3': 'HO3 - Dwelling', 'HO4': 'HO4 - Renters',
    'HO5': 'HO5', 'HO6': 'HO6 - Condo',
    'DP1': 'DP1', 'DP3': 'DP3',
    'NO COVERAGE': 'No Coverage',
};

// ═══════════════════════════════════════════════════════════════
// §3  TEXT FIELD MAPPINGS (data key → CSS selector arrays)
// ═══════════════════════════════════════════════════════════════

const TEXT_FIELD_MAP = {
    FirstName: [
        "input[name*='FirstName' i]", "input[id*='FirstName' i]",
        "input[placeholder*='First Name' i]", "input[formcontrolname*='firstName' i]",
    ],
    LastName: [
        "input[name*='LastName' i]", "input[id*='LastName' i]",
        "input[placeholder*='Last Name' i]", "input[formcontrolname*='lastName' i]",
    ],
    MiddleName: [
        "input[name*='MiddleName' i]", "input[name*='MiddleInitial' i]",
        "input[id*='MiddleName' i]", "input[placeholder*='Middle' i]",
        "input[formcontrolname*='middleName' i]",
    ],
    DOB: [
        "input[name*='DateOfBirth' i]", "input[name*='DOB' i]",
        "input[id*='DateOfBirth' i]", "input[id*='DOB' i]",
        "input[placeholder*='Date of Birth' i]", "input[placeholder*='MM/DD/YYYY' i]",
        "input[formcontrolname*='dob' i]", "input[formcontrolname*='dateOfBirth' i]",
    ],
    SSN: [
        "input[name*='SSN' i]", "input[name*='SocialSecurity' i]",
        "input[id*='SSN' i]", "input[formcontrolname*='ssn' i]",
    ],
    Email: [
        "input[name*='Email' i]", "input[id*='Email' i]",
        "input[type='email']", "input[formcontrolname*='email' i]",
    ],
    Phone: [
        "input[name*='Phone' i]", "input[name*='HomePhone' i]",
        "input[id*='Phone' i]", "input[type='tel']",
        "input[formcontrolname*='phone' i]",
    ],
    CellPhone: [
        "input[name*='CellPhone' i]", "input[name*='MobilePhone' i]",
        "input[id*='CellPhone' i]", "input[formcontrolname*='cellPhone' i]",
    ],
    Address: [
        "input[name*='Address' i]", "input[name*='StreetAddress' i]",
        "input[id*='Address' i]", "input[name*='Street' i]",
        "input[formcontrolname*='address' i]",
    ],
    City: [
        "input[name*='City' i]", "input[id*='City' i]",
        "input[formcontrolname*='city' i]",
    ],
    Zip: [
        "input[name*='Zip' i]", "input[name*='ZipCode' i]",
        "input[name*='PostalCode' i]", "input[id*='Zip' i]",
        "input[formcontrolname*='zip' i]",
    ],
    LicenseNumber: [
        "input[name*='License' i]", "input[name*='DLNumber' i]",
        "input[id*='License' i]", "input[formcontrolname*='license' i]",
    ],
    VIN: [
        "input[name*='VIN' i]", "input[id*='VIN' i]",
        "input[placeholder*='VIN' i]", "input[formcontrolname*='vin' i]",
    ],
    VehicleMake: [
        "input[name*='Make' i]", "input[id*='Make' i]",
        "input[formcontrolname*='make' i]",
    ],
    VehicleModel: [
        "input[name*='Model' i]", "input[id*='Model' i]",
        "input[formcontrolname*='model' i]",
    ],
    AnnualMiles: [
        "input[name*='Miles' i]", "input[name*='Mileage' i]",
        "input[name*='AnnualMileage' i]", "input[formcontrolname*='annualMileage' i]",
    ],
    SqFt: [
        "input[name*='SqFt' i]", "input[name*='SquareFeet' i]",
        "input[name*='LivingArea' i]", "input[formcontrolname*='squareFeet' i]",
    ],
    YearBuilt: [
        "input[name*='YearBuilt' i]", "input[id*='YearBuilt' i]",
        "input[formcontrolname*='yearBuilt' i]",
        "input[placeholder*='Year Built' i]",
    ],
    RoofYear: [
        "input[name*='RoofYear' i]", "input[name*='YearRoof' i]",
        "input[name*='RoofUpdate' i]", "input[name*='RoofRenovation' i]",
        "input[formcontrolname*='roofYear' i]",
    ],
    PurchaseDate: [
        "input[name*='PurchaseDate' i]", "input[name*='DateOfPurchase' i]",
        "input[formcontrolname*='purchaseDate' i]",
        "input[placeholder*='Purchase Date' i]",
    ],
    Mortgagee: [
        "input[name*='Mortgagee' i]", "input[name*='Lienholder' i]",
        "input[formcontrolname*='mortgagee' i]",
        "input[name*='MortgageCompany' i]",
    ],
    DwellingCoverage: [
        "input[name*='CoverageA' i]", "input[name*='DwellingCov' i]",
        "input[formcontrolname*='coverageA' i]",
        "input[name*='DwellingAmount' i]",
    ],
    LotSize: [
        "input[name*='LotSize' i]", "input[name*='Lot' i]",
        "input[formcontrolname*='lotSize' i]",
        "input[placeholder*='Lot Size' i]",
    ],
    Bedrooms: [
        "input[name*='Bedroom' i]", "input[id*='Bedroom' i]",
        "input[formcontrolname*='bedrooms' i]",
    ],
    GarageSpaces: [
        "input[name*='Garage' i]", "input[name*='GarageStalls' i]",
        "input[formcontrolname*='garage' i]",
    ],
    NumFireplaces: [
        "input[name*='Fireplace' i]", "input[id*='Fireplace' i]",
        "input[formcontrolname*='fireplace' i]",
    ],
    EffectiveDate: [
        "input[name*='EffectiveDate' i]", "input[name*='InceptionDate' i]",
        "input[formcontrolname*='effectiveDate' i]",
    ],
};

// ═══════════════════════════════════════════════════════════════
// §4  DROPDOWN LABEL MAPPINGS (page-aware)
// ═══════════════════════════════════════════════════════════════

// Base labels — safe on ANY EZLynx page
const BASE_DROPDOWN_LABELS = {
    Gender:          ['gender'],
    MaritalStatus:   ['marital status', 'marital'],
    State:           ['address state', 'state'],
    Suffix:          ['suffix'],
    Prefix:          ['prefix'],
    Education:       ['education'],
    Occupation:      ['occupation title', 'occupation'],
    Industry:        ['occupation industry', 'industry'],
    Relationship:    ['relationship', 'relation'],
    ApplicantType:   ['applicant type'],
    DLStatus:        ['dl status', 'license status', 'driver license status'],
    LeadSource:      ['lead source'],
    Language:        ['preferred language', 'language'],
    County:          ['county'],
    AddressType:     ['address type'],
    YearsAtAddress:  ['years at address'],
    MonthsAtAddress: ['months at address'],
    PhoneType:       ['phone type'],
    ContactMethod:   ['contact method'],
    ContactTime:     ['contact time'],
    EmailType:       ['email type'],
};

// Auto-specific — only on /rating/auto/ pages
const AUTO_DROPDOWN_LABELS = {
    AutoPolicyType:          ['policy type'],
    PolicyTerm:              ['new policy term', 'policy term'],
    PriorCarrier:            ['prior carrier'],
    PriorPolicyTerm:         ['prior policy term'],
    PriorYearsWithCarrier:   ['years with prior carrier'],
    PriorLiabilityLimits:    ['prior liability limits'],
    YearsContinuousCoverage: ['years with continuous coverage'],
    NumResidents:            ['number of residents'],
    DLState:           ['license state', 'dl state', 'driver license state'],
    AgeLicensed:       ['age licensed'],
    DriverEducation:   ['driver education'],
    GoodDriver:        ['good driver'],
    SR22Required:      ['sr-22 required', 'sr22'],
    VehicleYear:       ['year'],
    VehicleUse:        ['vehicle use'],
    PassiveRestraints: ['passive restraints'],
    AntiLockBrakes:    ['anti-lock brakes'],
    AntiTheft:         ['anti-theft'],
    OwnershipType:     ['ownership type'],
    BodilyInjury:      ['bodily injury'],
    PropertyDamage:    ['property damage'],
    MedPaymentsAuto:   ['medical payments'],
    Comprehensive:     ['comprehensive'],
    Collision:         ['collision'],
    UMPD:              ['uninsured motorist property damage'],
    ResidenceIs:       ['residence is'],
};

// Home-specific — only on /rating/home/ pages
const HOME_DROPDOWN_LABELS = {
    HomePolicyType:    ['policy/form type', 'policy type', 'form type'],
    HomePriorCarrier:  ['prior carrier', 'current carrier'],
    HomePriorPolicyTerm: ['prior policy term'],
    HomePriorYears:    ['years with prior carrier', 'years with carrier'],
    DwellingUsage:     ['dwelling usage', 'usage'],
    OccupancyType:     ['occupancy type', 'occupancy'],
    DwellingType:      ['dwelling type', 'dwelling style'],
    NumStories:        ['number of stories', 'stories', '# stories'],
    ConstructionStyle: ['construction style', 'construction type', 'style of home', 'architectural style'],
    RoofType:          ['roof type', 'roof material', 'roofing material'],
    RoofDesign:        ['roof design', 'roof shape'],
    FoundationType:    ['foundation type', 'foundation'],
    ExteriorWalls:     ['exterior walls', 'exterior wall', 'siding type', 'siding'],
    HeatingType:       ['heating type', 'primary heat', 'heating source', 'heat type'],
    SecondaryHeating:  ['secondary heating source type', 'secondary heating', 'secondary heat'],
    Cooling:           ['cooling type', 'cooling', 'air conditioning', 'ac type'],
    BurglarAlarm:      ['burglar alarm', 'burglar alarm type'],
    FireDetection:     ['fire detection', 'fire alarm', 'fire detection type'],
    SprinklerSystem:   ['sprinkler system', 'sprinkler', 'fire sprinkler'],
    SmokeDetector:     ['smoke detector', 'smoke alarm'],
    ProtectionClass:   ['protection class', 'fire protection class'],
    FeetFromHydrant:   ['feet from hydrant', 'distance from hydrant', 'hydrant distance'],
    NumFullBaths:      ['number of full baths', 'full baths', 'full bathrooms', '# full baths'],
    NumHalfBaths:      ['number of half baths', 'half baths', 'half bathrooms', '# half baths'],
    NumOccupants:      ['number of occupants', 'occupants', '# occupants'],
    GarageType:        ['garage type', 'garage'],
    GarageSpaces:      ['garage stalls', 'number of cars', 'garage capacity', 'garage spaces'],
    NumFireplaces:     ['number of fireplaces', 'fireplaces', '# fireplaces'],
    Pool:              ['swimming pool', 'pool', 'pool type'],
    Trampoline:        ['trampoline'],
    HomePersonalLiability: ['personal liability', 'liability limit'],
    HomeMedicalPayments:   ['medical payments', 'med pay'],
    AllPerilsDeductible:   ['all perils deductible', 'all peril deductible', 'deductible'],
    TheftDeductible:       ['theft deductible'],
    WindDeductible:        ['wind deductible', 'wind/hail deductible', 'hurricane deductible'],
};

// Native <select> fallback selectors
const DROPDOWN_SELECT_MAP = {
    Gender:        ["select[name*='Gender' i]", "select[id*='Gender' i]", "select[formcontrolname*='gender' i]"],
    MaritalStatus: ["select[name*='Marital' i]", "select[id*='Marital' i]", "select[formcontrolname*='marital' i]"],
    State:         ["select[name='State' i]", "select[id='State' i]", "select[name*='AddressState' i]", "select[formcontrolname*='state' i]"],
    Suffix:        ["select[name*='Suffix' i]", "select[id*='Suffix' i]"],
    Prefix:        ["select[name*='Prefix' i]", "select[id*='Prefix' i]"],
    Education:     ["select[name*='Education' i]", "select[id*='Education' i]"],
    Occupation:    ["select[name*='Occupation' i]", "select[id*='Occupation' i]"],
    Industry:      ["select[name*='Industry' i]", "select[id*='Industry' i]"],
    DLStatus:      ["select[name*='DLStatus' i]", "select[name*='LicenseStatus' i]"],
    DLState:       ["select[name*='LicenseState' i]", "select[name*='DLState' i]"],
    County:        ["select[name*='County' i]", "select[id*='County' i]", "select[formcontrolname*='county' i]"],
    YearsAtAddress: ["select[name*='YearsAtAddress' i]", "select[name*='YearsAt' i]", "select[formcontrolname*='yearsAt' i]"],
};


// ═══════════════════════════════════════════════════════════════
// §5  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/** Dice coefficient bigram similarity (0–1). */
function similarity(a, b) {
    a = (a || '').toLowerCase();
    b = (b || '').toLowerCase();
    if (a === b) return 1.0;
    if (a.length < 2 || b.length < 2) return 0;
    const bg = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i+2); m.set(k, (m.get(k)||0)+1); } return m; };
    const aB = bg(a), bB = bg(b);
    let inter = 0;
    for (const [k,v] of aB) inter += Math.min(v, bB.get(k) || 0);
    const total = a.length - 1 + b.length - 1;
    return total > 0 ? (2 * inter) / total : 0;
}

/** Find the best fuzzy match from candidates. Returns { text, score } or null. */
function bestMatch(target, candidates, cutoff = 0.4) {
    let best = null, bestScore = 0;
    for (const c of candidates) {
        const s = similarity(target, c);
        if (s > bestScore) { bestScore = s; best = c; }
    }
    // Also try substring match
    const tl = target.toLowerCase();
    for (const c of candidates) {
        const cl = c.toLowerCase();
        if (cl.includes(tl) || tl.includes(cl)) {
            const s = Math.max(similarity(target, c), 0.6);
            if (s > bestScore) { bestScore = s; best = c; }
        }
    }
    return bestScore >= cutoff ? { text: best, score: bestScore } : null;
}

/** Expand abbreviations. */
function expand(val) {
    return ABBREVIATIONS[(val || '').toUpperCase()] || val;
}

/** Check if element is visible. */
function isVisible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
}

/** Wait ms. */
const wait = ms => new Promise(r => setTimeout(r, ms));

/** Set value on an input and dispatch Angular-compatible events. */
function setInputValue(el, value) {
    // Focus the element
    el.focus();
    el.dispatchEvent(new Event('focus', { bubbles: true }));

    // Clear existing value
    const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
    )?.set;

    if (nativeSetter) {
        nativeSetter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        nativeSetter.call(el, value);
    } else {
        el.value = '';
        el.value = value;
    }

    // Dispatch all events Angular might listen for
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
}


// ═══════════════════════════════════════════════════════════════
// §6  PAGE DETECTION
// ═══════════════════════════════════════════════════════════════

function detectPage() {
    const url = location.href.toLowerCase();
    // Also check page title/heading for extra detection
    const title = (document.title || '').toLowerCase();
    const h1 = (document.querySelector('h1, h2, .page-title, [class*="title"]')?.textContent || '').toLowerCase();

    // Auto pages
    if (url.includes('/rating/auto/') || url.includes('/auto/')) {
        if (url.includes('driver'))   return 'auto-driver';
        if (url.includes('vehicle'))  return 'auto-vehicle';
        if (url.includes('coverage')) return 'auto-coverage';
        return 'auto-policy';
    }
    // Home pages
    if (url.includes('/rating/home/') || url.includes('/home/')) {
        if (url.includes('coverage') || url.includes('endorsement')) return 'home-coverage';
        return 'home-dwelling';
    }
    // Lead info
    if (url.includes('/lead-info') || url.includes('/lead/'))  return 'lead-info';

    // Applicant / Personal Lines — match many possible URL patterns
    if (url.includes('applicant') || url.includes('/personal-lines/') ||
        url.includes('/personal/') || url.includes('/account/create') ||
        url.includes('/create/personal') || url.includes('/account/edit') ||
        title.includes('applicant') || h1.includes('applicant')) {
        return 'applicant';
    }

    // Generic EZLynx page
    if (url.includes('ezlynx.com'))   return 'ezlynx';
    return 'unknown';
}

function getActiveDropdowns() {
    const url = location.href.toLowerCase();
    const page = detectPage();
    const active = { ...BASE_DROPDOWN_LABELS };
    // Auto pages
    if (url.includes('/rating/auto/') || url.includes('/auto/') || 
        page === 'auto-policy' || page === 'auto-driver' || page === 'auto-vehicle' || page === 'auto-coverage') {
        Object.assign(active, AUTO_DROPDOWN_LABELS);
    }
    // Home pages
    if (url.includes('/rating/home/') || url.includes('/home/') || 
        page === 'home-dwelling' || page === 'home-coverage') {
        Object.assign(active, HOME_DROPDOWN_LABELS);
    }
    // On applicant page, include home dropdowns too since some appear there
    if (page === 'applicant') {
        // Some home/auto fields can appear on the main applicant form
        Object.assign(active, HOME_DROPDOWN_LABELS);
        Object.assign(active, AUTO_DROPDOWN_LABELS);
    }
    return active;
}


// ═══════════════════════════════════════════════════════════════
// §7  FILL FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/** Fill a text input using CSS selector list. Returns true if filled. */
function fillText(selectors, value) {
    if (!value || !String(value).trim()) return false;
    for (const sel of selectors) {
        try {
            const el = document.querySelector(sel);
            if (el && isVisible(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                setInputValue(el, String(value).trim());
                return true;
            }
        } catch (e) { /* selector might be invalid */ }
    }
    return false;
}

/** Fill a text input by finding it near a label. */
function fillTextByLabel(labelText, value) {
    if (!value || !String(value).trim()) return false;
    const norm = s => (s || '').replace(/[*:]/g, '').trim().toLowerCase();
    const pat = labelText.toLowerCase();

    for (const lbl of document.querySelectorAll('label, legend, [class*="label"]')) {
        const text = norm(lbl.textContent);
        if (!text || text.length > 60) continue;
        if (text !== pat && !text.includes(pat)) continue;

        // Found label → find nearest input
        const forId = lbl.getAttribute('for') || lbl.htmlFor;
        if (forId) {
            const el = document.getElementById(forId);
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && isVisible(el)) {
                setInputValue(el, String(value).trim());
                return true;
            }
        }

        const container = lbl.closest(
            '.mat-form-field, fieldset, .form-group, [class*="form-field"], ' +
            '[class*="form-group"], .field-wrapper, .col, [class*="col-"]'
        ) || lbl.parentElement;

        if (container) {
            const inp = container.querySelector('input, textarea');
            if (inp && isVisible(inp)) {
                setInputValue(inp, String(value).trim());
                return true;
            }
        }
    }
    return false;
}


// ─── Native <select> filling with fuzzy match ───

function fillNativeSelect(selectors, value) {
    if (!value || !String(value).trim()) return false;
    const target = String(value).trim();
    const expanded = expand(target);

    for (const sel of selectors) {
        try {
            const selectEl = document.querySelector(sel);
            if (!selectEl || selectEl.tagName !== 'SELECT' || !isVisible(selectEl)) continue;

            const options = Array.from(selectEl.options)
                .filter(o => o.text.trim() && !['', 'select', 'select one', '-- select --', '--select--', 'choose'].includes(o.text.trim().toLowerCase()))
                .map(o => ({ text: o.text.trim(), value: o.value }));

            if (!options.length) continue;

            // Exact match
            for (const attempt of [target, expanded]) {
                for (const opt of options) {
                    if (opt.text.toLowerCase() === attempt.toLowerCase() || opt.value.toLowerCase() === attempt.toLowerCase()) {
                        selectEl.value = opt.value;
                        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                }
            }

            // Fuzzy match
            const optTexts = options.map(o => o.text);
            for (const attempt of [expanded, target]) {
                const match = bestMatch(attempt, optTexts);
                if (match) {
                    const opt = options.find(o => o.text === match.text);
                    if (opt) {
                        selectEl.value = opt.value;
                        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                }
            }
        } catch (e) { /* skip */ }
    }
    return false;
}


// ─── Find dropdown element by label text ───

function findDropdownByLabel(labelPatterns) {
    const norm = s => (s || '').replace(/[*:]/g, '').trim().toLowerCase();

    for (const pattern of labelPatterns) {
        const pat = pattern.toLowerCase();

        for (const lbl of document.querySelectorAll(
            'label, legend, .mat-form-field-label, [class*="label"], ' +
            '[class*="form-field"] > span, [class*="form-field"] > div'
        )) {
            const text = norm(lbl.textContent);
            if (!text || text.length > 60) continue;
            if (text !== pat && !text.includes(pat)) continue;

            // Check label[for]
            const forId = lbl.getAttribute('for') || lbl.htmlFor;
            if (forId) {
                const el = document.getElementById(forId);
                if (el && (el.tagName === 'SELECT' || el.tagName === 'MAT-SELECT' ||
                    el.getAttribute('role') === 'listbox' || el.getAttribute('role') === 'combobox')) {
                    return { el, type: el.tagName.toLowerCase() === 'select' ? 'native' : 'custom' };
                }
            }

            // Check parent container
            const container = lbl.closest(
                '.mat-form-field, fieldset, .form-group, .form-field, ' +
                '[class*="form-field"], [class*="form-group"], .field-wrapper, ' +
                '.col, .column, [class*="col-"]'
            ) || lbl.parentElement;

            if (container) {
                const sel = container.querySelector('select');
                if (sel && isVisible(sel)) return { el: sel, type: 'native' };

                const matSel = container.querySelector('mat-select, [role="listbox"], [role="combobox"]');
                if (matSel) return { el: matSel, type: 'custom' };
            }

            // Check next sibling
            let next = lbl.nextElementSibling;
            while (next) {
                if (next.tagName === 'SELECT') return { el: next, type: 'native' };
                if (next.tagName === 'MAT-SELECT' || next.getAttribute('role') === 'listbox') {
                    return { el: next, type: 'custom' };
                }
                next = next.nextElementSibling;
            }
        }
    }
    return null;
}


// ─── Custom dropdown (Angular Material) filling ───

async function fillCustomDropdown(labelPatterns, value) {
    if (!value || !String(value).trim()) return false;
    const target = String(value).trim();
    const expanded = expand(target);

    const found = findDropdownByLabel(labelPatterns);
    if (!found) return false;

    // If it's a native select, handle directly
    if (found.type === 'native') {
        const selectEl = found.el;
        const options = Array.from(selectEl.options)
            .filter(o => o.text.trim() && !['', 'select', 'select one', '-- select --'].includes(o.text.trim().toLowerCase()))
            .map(o => ({ text: o.text.trim(), value: o.value }));

        for (const attempt of [target, expanded]) {
            for (const opt of options) {
                if (opt.text.toLowerCase() === attempt.toLowerCase() || opt.value.toLowerCase() === attempt.toLowerCase()) {
                    selectEl.value = opt.value;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }
            }
        }
        const optTexts = options.map(o => o.text);
        const match = bestMatch(expanded, optTexts) || bestMatch(target, optTexts);
        if (match) {
            const opt = options.find(o => o.text === match.text);
            if (opt) {
                selectEl.value = opt.value;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        }
        return false;
    }

    // Custom dropdown: click to open overlay
    const ddEl = found.el;
    try {
        ddEl.click();
        ddEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } catch (e) { return false; }

    await wait(DROPDOWN_WAIT);

    // Try keyboard shortcut first (Angular Material supports typeahead)
    try {
        const typeVal = expanded !== target ? expanded : target;
        for (const char of typeVal) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
            await wait(40);
        }
        await wait(200);

        // Check if overlay closed (selection made)
        const overlayGone = !document.querySelector('.cdk-overlay-container mat-option, .cdk-overlay-container [role="option"]');
        if (overlayGone) return true;

        // Press Escape if keyboard didn't work, we'll try click method
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await wait(200);

        // Re-open the dropdown
        ddEl.click();
        await wait(DROPDOWN_WAIT);
    } catch (e) { /* continue to manual method */ }

    // Find options in CDK overlay
    const overlaySels = [
        '.cdk-overlay-container mat-option',
        '.cdk-overlay-container [role="option"]',
        '[role="listbox"] [role="option"]',
        '.mat-select-panel mat-option',
        '.mat-option',
        '.cdk-overlay-pane mat-option',
        '[class*="overlay"] [role="option"]',
        '[class*="dropdown"] li',
        '[class*="select-panel"] [class*="option"]',
    ];

    let optionEls = [];
    for (const osel of overlaySels) {
        const els = document.querySelectorAll(osel);
        if (els.length > 0) { optionEls = Array.from(els); break; }
    }

    if (!optionEls.length) {
        // Close and bail
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return false;
    }

    const optionTexts = optionEls
        .map(el => el.textContent.trim())
        .filter(t => t && !['', 'select', 'select one'].includes(t.toLowerCase()));

    // Find best match
    let bestOpt = null;

    // Exact
    for (const attempt of [target, expanded]) {
        for (const ot of optionTexts) {
            if (ot.toLowerCase() === attempt.toLowerCase()) { bestOpt = ot; break; }
        }
        if (bestOpt) break;
    }

    // Fuzzy
    if (!bestOpt) {
        const m = bestMatch(expanded, optionTexts) || bestMatch(target, optionTexts);
        if (m) bestOpt = m.text;
    }

    if (bestOpt) {
        // Click the matching option
        for (const el of optionEls) {
            if (el.textContent.trim() === bestOpt) {
                el.click();
                await wait(200);
                return true;
            }
        }
    }

    // Close overlay if no match
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(100);
    return false;
}


// ═══════════════════════════════════════════════════════════════
// §8  FLOATING TOOLBAR (Shadow DOM isolated)
// ═══════════════════════════════════════════════════════════════

let toolbarShadow = null;

function injectToolbar() {
    if (document.getElementById('altech-filler-host')) return;

    const host = document.createElement('div');
    host.id = 'altech-filler-host';
    host.style.cssText = 'position:fixed; top:0; left:0; width:0; height:0; z-index:2147483647; pointer-events:none;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    toolbarShadow = shadow;

    shadow.innerHTML = `
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            .toolbar {
                position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
                background: rgba(22, 33, 62, 0.95); color: #fff;
                padding: 7px 14px; border-radius: 10px;
                box-shadow: 0 4px 24px rgba(0,0,0,0.4);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                display: flex; align-items: center; gap: 8px;
                border: 1px solid rgba(255,255,255,0.12);
                cursor: grab; user-select: none; font-size: 12px;
                pointer-events: auto;
                max-width: calc(100vw - 40px);
            }
            .toolbar.dragging { cursor: grabbing; }
            .brand { font-weight: 700; font-size: 12px; white-space: nowrap; }
            .client { color: rgba(255,255,255,0.7); font-size: 11px; max-width: 140px;
                      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .btn {
                border: none; border-radius: 6px; padding: 5px 12px;
                font-size: 11px; font-weight: 600; cursor: pointer;
                font-family: inherit; white-space: nowrap;
                transition: filter 0.15s;
            }
            .btn:hover { filter: brightness(1.1); }
            .btn:active { filter: brightness(0.9); }
            .btn:disabled { opacity: 0.5; cursor: not-allowed; }
            .btn-fill { background: #007AFF; color: #fff; }
            .btn-close { background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.7); }
            .status {
                color: rgba(255,255,255,0.5); font-size: 10px; max-width: 200px;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
        </style>
        <div class="toolbar" id="toolbar">
            <span class="brand">⚡ Altech</span>
            <span class="client" id="tb-client">Loading...</span>
            <button class="btn btn-fill" id="tb-fill">Fill This Page</button>
            <button class="btn btn-close" id="tb-close">✕</button>
            <span class="status" id="tb-status"></span>
        </div>
    `;

    // Load client name
    chrome.storage.local.get('clientData', ({ clientData }) => {
        const clientEl = shadow.getElementById('tb-client');
        if (clientData) {
            const name = [clientData.FirstName, clientData.LastName].filter(Boolean).join(' ');
            clientEl.textContent = name || 'Client loaded';
        } else {
            clientEl.textContent = 'No client — use extension popup';
        }
    });

    // Fill button
    shadow.getElementById('tb-fill').addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = shadow.getElementById('tb-fill');
        const status = shadow.getElementById('tb-status');
        btn.disabled = true;
        btn.textContent = '⏳ Filling...';
        status.textContent = '';

        const { clientData } = await chrome.storage.local.get('clientData');
        if (!clientData) {
            status.textContent = 'No data. Use popup to paste.';
            btn.disabled = false;
            btn.textContent = 'Fill This Page';
            return;
        }

        const result = await fillPage(clientData);
        const total = result.textFilled + result.ddFilled;
        const skipped = result.textSkipped + result.ddSkipped;
        status.textContent = `✓ ${total} filled` + (skipped > 0 ? `, ${skipped} skipped` : '');
        btn.disabled = false;
        btn.textContent = 'Fill Again';

        // Show injection report panel
        showInjectionReport(shadow, result);
    });

    // Close button
    shadow.getElementById('tb-close').addEventListener('click', (e) => {
        e.stopPropagation();
        host.remove();
        toolbarShadow = null;
    });

    // Draggable toolbar
    const bar = shadow.getElementById('toolbar');
    let dragging = false, dx = 0, dy = 0;
    bar.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        dragging = true;
        const rect = bar.getBoundingClientRect();
        dx = e.clientX - rect.left;
        dy = e.clientY - rect.top;
        bar.classList.add('dragging');
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        bar.style.left = (e.clientX - dx) + 'px';
        bar.style.top = (e.clientY - dy) + 'px';
        bar.style.transform = 'none';
    });
    document.addEventListener('mouseup', () => {
        dragging = false;
        if (bar) bar.classList.remove('dragging');
    });
}

/**
 * Show a floating injection report panel inside the toolbar's Shadow DOM.
 * Displays per-field ✅/❌/🔄 status with failure reasons.
 */
function showInjectionReport(shadow, result) {
    // Remove existing report
    const existing = shadow.getElementById('injection-report');
    if (existing) existing.remove();

    const total = result.textFilled + result.ddFilled;
    const skipped = result.textSkipped + result.ddSkipped;

    const rows = (result.details || []).map(d => {
        let icon, cls;
        if (d.status === 'OK') { icon = '✅'; cls = 'ok'; }
        else if (d.status === 'OK_RETRY') { icon = '🔄'; cls = 'retry'; }
        else { icon = '❌'; cls = 'skip'; }
        const reason = d.reason || (d.status === 'SKIP' ? 'Field not found on page' : '');
        return `<div class="rpt-row ${cls}">
            <span class="rpt-icon">${icon}</span>
            <span class="rpt-field">${d.field}</span>
            <span class="rpt-type">${d.type}</span>
            ${reason ? `<span class="rpt-reason">${reason}</span>` : ''}
        </div>`;
    }).join('');

    const panel = document.createElement('div');
    panel.id = 'injection-report';
    panel.innerHTML = `
        <style>
            #injection-report .rpt-panel {
                position: fixed; top: 50px; right: 12px; width: 340px; max-height: 60vh;
                background: rgba(22, 33, 62, 0.97); color: #fff; border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                overflow: hidden; pointer-events: auto; z-index: 2147483647;
                border: 1px solid rgba(255,255,255,0.15);
            }
            .rpt-header {
                padding: 10px 14px; background: rgba(255,255,255,0.08);
                display: flex; justify-content: space-between; align-items: center;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .rpt-header h3 { font-size: 13px; font-weight: 700; }
            .rpt-summary { font-size: 11px; color: rgba(255,255,255,0.6); padding: 6px 14px;
                border-bottom: 1px solid rgba(255,255,255,0.06); }
            .rpt-body { max-height: calc(60vh - 80px); overflow-y: auto; padding: 4px 0; }
            .rpt-row { display: flex; align-items: center; gap: 6px; padding: 4px 14px; font-size: 11px;
                border-bottom: 1px solid rgba(255,255,255,0.04); }
            .rpt-row.skip { background: rgba(255,59,48,0.08); }
            .rpt-row.retry { background: rgba(255,204,0,0.08); }
            .rpt-icon { font-size: 12px; flex-shrink: 0; }
            .rpt-field { font-weight: 600; min-width: 90px; }
            .rpt-type { color: rgba(255,255,255,0.4); font-size: 10px; }
            .rpt-reason { color: rgba(255,150,150,0.8); font-size: 10px; margin-left: auto; }
            .rpt-close { background: none; border: none; color: rgba(255,255,255,0.5); cursor: pointer;
                font-size: 16px; line-height: 1; padding: 2px 6px; }
            .rpt-close:hover { color: #fff; }
            .rpt-body::-webkit-scrollbar { width: 5px; }
            .rpt-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
        </style>
        <div class="rpt-panel">
            <div class="rpt-header">
                <h3>📋 Injection Report</h3>
                <button class="rpt-close" id="rpt-close-btn">✕</button>
            </div>
            <div class="rpt-summary">
                ${total} filled${skipped > 0 ? ` · ${skipped} skipped` : ''} · ${result.details?.length || 0} fields attempted
            </div>
            <div class="rpt-body">${rows || '<div style="padding:10px;color:rgba(255,255,255,0.4);">No fields attempted</div>'}</div>
        </div>
    `;

    shadow.appendChild(panel);

    // Close button
    shadow.getElementById('rpt-close-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        panel.remove();
    });

    // Auto-close after 30 seconds
    setTimeout(() => { if (panel.parentNode) panel.remove(); }, 30000);
}

function updateToolbarStatus(text) {
    if (!toolbarShadow) return;
    const el = toolbarShadow.getElementById('tb-status');
    if (el) el.textContent = text;
}


// ═══════════════════════════════════════════════════════════════
// §9  FILL ORCHESTRATION
// ═══════════════════════════════════════════════════════════════

async function fillPage(clientData) {
    const report = { textFilled: 0, textSkipped: 0, ddFilled: 0, ddSkipped: 0, details: [] };
    if (!clientData) return report;

    // Load previously scraped options for smarter value translation
    let knownOptions = {};
    try {
        const stored = await chrome.storage.local.get('knownOptions');
        knownOptions = stored?.knownOptions || {};
    } catch (e) { /* no scrape data yet */ }

    // Pre-process client data: if we have scraped option lists, find closest matches
    const smartData = { ...clientData };

    // Truncate ZIP to 5 digits — EZLynx rejects ZIP+4
    if (smartData.Zip) smartData.Zip = String(smartData.Zip).replace(/[^0-9]/g, '').slice(0, 5);

    for (const [key, value] of Object.entries(smartData)) {
        if (!value || typeof value !== 'string') continue;
        const expanded = expand(value);

        // Check all known option lists for a better match
        for (const [label, options] of Object.entries(knownOptions)) {
            if (!Array.isArray(options) || options.length === 0) continue;
            // Only try if label seems related to this key
            const labelLower = label.toLowerCase().replace(/[^a-z]/g, '');
            const keyLower = key.toLowerCase().replace(/[^a-z]/g, '');
            if (!labelLower.includes(keyLower) && !keyLower.includes(labelLower)) continue;

            // Try to find exact or fuzzy match in known options
            const match = bestMatch(expanded, options) || bestMatch(value, options);
            if (match && match.score >= 0.5) {
                smartData[key] = match.text;
                break;
            }
        }
    }

    // ── Text fields ──
    updateToolbarStatus('Filling text fields...');
    for (const [key, selectors] of Object.entries(TEXT_FIELD_MAP)) {
        const value = smartData[key];
        if (!value) continue;

        updateToolbarStatus(`Text: ${key}...`);
        const filled = fillText(selectors, value) || fillTextByLabel(key, value);
        if (filled) {
            report.textFilled++;
            report.details.push({ field: key, type: 'text', status: 'OK' });
        } else {
            report.textSkipped++;
            report.details.push({ field: key, type: 'text', status: 'SKIP' });
        }
        await wait(FILL_DELAY);
    }

    // ── Dropdowns ──
    const activeDropdowns = getActiveDropdowns();
    const page = detectPage();
    updateToolbarStatus(`Dropdowns (${page})...`);

    const failedDropdowns = [];

    for (const [key, labelPatterns] of Object.entries(activeDropdowns)) {
        const value = smartData[key];
        if (!value) continue;

        updateToolbarStatus(`Dropdown: ${key}...`);

        // Try custom dropdown (label-based) first
        let filled = await fillCustomDropdown(labelPatterns, value);

        // Fallback to native <select> selectors
        if (!filled && DROPDOWN_SELECT_MAP[key]) {
            filled = fillNativeSelect(DROPDOWN_SELECT_MAP[key], value);
        }

        if (filled) {
            report.ddFilled++;
            report.details.push({ field: key, type: 'dropdown', status: 'OK' });
        } else {
            report.ddSkipped++;
            report.details.push({ field: key, type: 'dropdown', status: 'SKIP' });
            failedDropdowns.push({ key, labelPatterns, value });
        }
        await wait(FILL_DELAY);
    }

    // ── Retry failed dropdowns (dependent dropdowns may have loaded now) ──
    if (failedDropdowns.length > 0) {
        updateToolbarStatus(`Retrying ${failedDropdowns.length} dropdown(s)...`);
        await wait(RETRY_WAIT);

        for (const { key, labelPatterns, value } of failedDropdowns) {
            updateToolbarStatus(`Retry: ${key}...`);

            let filled = await fillCustomDropdown(labelPatterns, value);
            if (!filled && DROPDOWN_SELECT_MAP[key]) {
                filled = fillNativeSelect(DROPDOWN_SELECT_MAP[key], value);
            }

            if (filled) {
                report.ddFilled++;
                report.ddSkipped--;
                // Update details
                const entry = report.details.find(d => d.field === key && d.status === 'SKIP');
                if (entry) entry.status = 'OK_RETRY';
            }
            await wait(FILL_DELAY);
        }
    }

    // ── Multi-driver / multi-vehicle fill (for pages with arrays in clientData) ──
    const fillPage_page = detectPage();
    if (fillPage_page === 'auto-driver' && clientData.Drivers && clientData.Drivers.length > 1) {
        await fillMultiDrivers(clientData, report);
    }
    if (fillPage_page === 'auto-vehicle' && clientData.Vehicles && clientData.Vehicles.length > 1) {
        await fillMultiVehicles(clientData, report);
    }

    const total = report.textFilled + report.ddFilled;
    const skipped = report.textSkipped + report.ddSkipped;
    updateToolbarStatus(`✓ Done! ${total} filled` + (skipped > 0 ? `, ${skipped} skipped` : ''));

    console.log(`[Altech Filler] Fill complete: ${total} filled, ${skipped} skipped`, report.details);
    return report;
}

// ═══════════════════════════════════════════════════════════════
// §9b  MULTI-DRIVER / MULTI-VEHICLE FILL
// ═══════════════════════════════════════════════════════════════

/**
 * Click the "Add Driver" or "Add Vehicle" button on the current EZLynx page.
 * Returns true if a button was found and clicked.
 */
function clickAddButton(type) {
    // EZLynx uses various button patterns
    const patterns = type === 'driver'
        ? ['Add Driver', 'Add Another Driver', 'New Driver', '+ Driver']
        : ['Add Vehicle', 'Add Another Vehicle', 'New Vehicle', '+ Vehicle'];

    const buttons = [...document.querySelectorAll('button, a, [role="button"], mat-icon, .mat-button, .mat-raised-button, .mat-flat-button')];
    for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        if (patterns.some(p => text.toLowerCase().includes(p.toLowerCase()))) {
            btn.click();
            console.log(`[Altech Filler] Clicked "${text}" button`);
            return true;
        }
    }
    // Fallback: find by aria-label
    for (const pattern of patterns) {
        const btn = document.querySelector(`[aria-label*="${pattern}" i], [title*="${pattern}" i]`);
        if (btn) {
            btn.click();
            console.log(`[Altech Filler] Clicked add button by aria-label: ${pattern}`);
            return true;
        }
    }
    return false;
}

/**
 * Fill a single driver's fields on the current page.
 * `driver` is an object from clientData.Drivers[].
 */
async function fillDriverFields(driver, index, report) {
    if (!driver) return;
    const driverData = {
        FirstName: driver.FirstName,
        LastName: driver.LastName,
        DOB: driver.DOB,
        Gender: driver.Gender,
        MaritalStatus: driver.MaritalStatus,
        Relationship: driver.Relationship,
        Occupation: driver.Occupation,
        Education: driver.Education,
        LicenseNumber: driver.LicenseNumber,
        DLState: driver.DLState,
        AgeLicensed: driver.AgeLicensed
    };

    for (const [key, value] of Object.entries(driverData)) {
        if (!value) continue;
        const selectors = TEXT_FIELD_MAP[key];
        if (selectors) {
            const filled = fillText(selectors, value) || fillTextByLabel(key, value);
            if (filled) {
                report.textFilled++;
                report.details.push({ field: `Driver${index + 1}.${key}`, type: 'text', status: 'OK' });
            } else {
                report.textSkipped++;
                report.details.push({ field: `Driver${index + 1}.${key}`, type: 'text', status: 'SKIP' });
            }
            await wait(FILL_DELAY);
        }
    }
}

/**
 * Fill a single vehicle's fields on the current page.
 * `vehicle` is an object from clientData.Vehicles[].
 */
async function fillVehicleFields(vehicle, index, report) {
    if (!vehicle) return;
    const vehicleData = {
        VIN: vehicle.VIN,
        VehicleYear: vehicle.Year,
        VehicleMake: vehicle.Make,
        VehicleModel: vehicle.Model,
        VehicleUse: vehicle.Use,
        AnnualMiles: vehicle.AnnualMiles,
        OwnershipType: vehicle.Ownership
    };

    for (const [key, value] of Object.entries(vehicleData)) {
        if (!value) continue;
        const selectors = TEXT_FIELD_MAP[key];
        if (selectors) {
            const filled = fillText(selectors, value) || fillTextByLabel(key, value);
            if (filled) {
                report.textFilled++;
                report.details.push({ field: `Vehicle${index + 1}.${key}`, type: 'text', status: 'OK' });
            } else {
                report.textSkipped++;
                report.details.push({ field: `Vehicle${index + 1}.${key}`, type: 'text', status: 'SKIP' });
            }
            await wait(FILL_DELAY);
        }
    }
}

/**
 * Fill all drivers from clientData.Drivers[] on an auto-driver page.
 * Clicks "Add Driver" for each additional driver beyond the first.
 */
async function fillMultiDrivers(clientData, report) {
    const drivers = clientData.Drivers;
    if (!Array.isArray(drivers) || drivers.length === 0) return;

    updateToolbarStatus(`Filling ${drivers.length} driver(s)...`);

    for (let i = 0; i < drivers.length; i++) {
        if (i > 0) {
            // Click "Add Driver" for additional drivers
            updateToolbarStatus(`Adding driver ${i + 1}...`);
            const clicked = clickAddButton('driver');
            if (!clicked) {
                report.details.push({ field: `Driver${i + 1}`, type: 'action', status: 'SKIP', reason: 'Add Driver button not found' });
                console.warn(`[Altech Filler] Could not find "Add Driver" button for driver ${i + 1}`);
                continue;
            }
            // Wait for the new form to render
            await wait(RETRY_WAIT);
        }
        await fillDriverFields(drivers[i], i, report);
    }
}

/**
 * Fill all vehicles from clientData.Vehicles[] on an auto-vehicle page.
 * Clicks "Add Vehicle" for each additional vehicle beyond the first.
 */
async function fillMultiVehicles(clientData, report) {
    const vehicles = clientData.Vehicles;
    if (!Array.isArray(vehicles) || vehicles.length === 0) return;

    updateToolbarStatus(`Filling ${vehicles.length} vehicle(s)...`);

    for (let i = 0; i < vehicles.length; i++) {
        if (i > 0) {
            // Click "Add Vehicle" for additional vehicles
            updateToolbarStatus(`Adding vehicle ${i + 1}...`);
            const clicked = clickAddButton('vehicle');
            if (!clicked) {
                report.details.push({ field: `Vehicle${i + 1}`, type: 'action', status: 'SKIP', reason: 'Add Vehicle button not found' });
                console.warn(`[Altech Filler] Could not find "Add Vehicle" button for vehicle ${i + 1}`);
                continue;
            }
            // Wait for the new form to render
            await wait(RETRY_WAIT);
        }
        await fillVehicleFields(vehicles[i], i, report);
    }
}


// ═══════════════════════════════════════════════════════════════
// §10  SPA NAVIGATION DETECTION
// ═══════════════════════════════════════════════════════════════

let lastUrl = location.href;

function onPageChange() {
    // Re-inject toolbar if it was removed by Angular DOM rebuild
    if (!document.getElementById('altech-filler-host')) {
        injectToolbar();
    }
    // Update client name in toolbar
    if (toolbarShadow) {
        chrome.storage.local.get('clientData', ({ clientData }) => {
            const el = toolbarShadow.getElementById('tb-client');
            const status = toolbarShadow.getElementById('tb-status');
            if (el && clientData) {
                el.textContent = [clientData.FirstName, clientData.LastName].filter(Boolean).join(' ') || 'Client loaded';
            }
            if (status) {
                const page = detectPage();
                const pageNames = {
                    'applicant': 'Applicant page', 'auto-policy': 'Auto policy',
                    'auto-driver': 'Auto driver', 'auto-vehicle': 'Auto vehicle',
                    'auto-coverage': 'Auto coverage', 'home-dwelling': 'Home dwelling',
                    'home-coverage': 'Home coverage', 'lead-info': 'Lead info',
                };
                status.textContent = pageNames[page] || 'Navigate to a form';
            }
        });
    }
}

// Poll for URL changes (Angular SPA doesn't fire popstate)
setInterval(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        onPageChange();
    }
}, 1000);

// Also listen for standard navigation events
window.addEventListener('popstate', onPageChange);
window.addEventListener('hashchange', onPageChange);

// Watch for major DOM changes (Angular route changes rebuild body)
const bodyObserver = new MutationObserver(() => {
    if (!document.getElementById('altech-filler-host') && toolbarShadow) {
        toolbarShadow = null;
        injectToolbar();
    }
});
bodyObserver.observe(document.body, { childList: true });


// ═══════════════════════════════════════════════════════════════
// §10.5  PAGE SCRAPER — Extracts all form fields & dropdown options
// ═══════════════════════════════════════════════════════════════

async function scrapePage() {
    const page = detectPage();
    const url = location.href;
    const result = {
        page,
        url,
        timestamp: new Date().toISOString(),
        textFields: [],
        dropdowns: {},
        nativeSelects: {},
        stats: { totalInputs: 0, totalNativeSelects: 0, totalCustomDropdowns: 0, totalOptions: 0 }
    };

    // ── 1. Scrape all text inputs ──
    const inputs = document.querySelectorAll('input, textarea');
    for (const inp of inputs) {
        if (!isVisible(inp)) continue;
        if (['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file'].includes(inp.type)) continue;

        const label = findLabelFor(inp);
        result.textFields.push({
            type: inp.type || 'text',
            name: inp.name || '',
            id: inp.id || '',
            placeholder: inp.placeholder || '',
            label: label || '',
            value: inp.value || '',
            required: inp.required || inp.getAttribute('aria-required') === 'true'
        });
        result.stats.totalInputs++;
    }

    // ── 2. Scrape native <select> dropdowns ──
    const selects = document.querySelectorAll('select');
    for (const sel of selects) {
        if (!isVisible(sel)) continue;
        const label = findLabelFor(sel);
        const key = label || sel.name || sel.id || `select_${result.stats.totalNativeSelects}`;
        const options = Array.from(sel.options)
            .map(o => o.text.trim())
            .filter(t => t && !['', 'select', 'select one', '-- select --', '--select--', 'choose', 'select...'].includes(t.toLowerCase()));

        result.nativeSelects[key] = {
            name: sel.name || '',
            id: sel.id || '',
            label: label || '',
            options,
            currentValue: sel.options[sel.selectedIndex]?.text?.trim() || '',
            required: sel.required || sel.getAttribute('aria-required') === 'true'
        };
        result.stats.totalNativeSelects++;
        result.stats.totalOptions += options.length;
    }

    // ── 3. Scrape Angular Material / custom dropdowns ──

    // Helper: forcefully clear all CDK overlay content
    const nukeOverlays = () => {
        const container = document.querySelector('.cdk-overlay-container');
        if (container) {
            // Remove all overlay panes (Angular will recreate as needed)
            container.querySelectorAll('.cdk-overlay-pane').forEach(p => p.remove());
            // Remove all backdrops
            container.querySelectorAll('.cdk-overlay-backdrop').forEach(b => b.remove());
        }
    };

    // Helper: close the currently focused mat-select cleanly
    const closeDropdown = async (ddEl) => {
        // 1. Send Escape directly to the element
        ddEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await wait(80);

        // 2. Click the backdrop if one exists
        const backdrop = document.querySelector('.cdk-overlay-backdrop');
        if (backdrop) {
            backdrop.click();
            await wait(80);
        }

        // 3. Blur the element to ensure Angular deactivates it
        ddEl.blur();
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }
        await wait(100);

        // 4. Check if overlay pane is gone; if not, force remove it
        const container = document.querySelector('.cdk-overlay-container');
        if (container) {
            const panes = container.querySelectorAll('.cdk-overlay-pane');
            for (const pane of panes) {
                if (pane.children.length > 0 && pane.querySelector('mat-option, [role="option"], [role="listbox"]')) {
                    pane.remove();
                }
            }
            // Remove any lingering backdrops
            container.querySelectorAll('.cdk-overlay-backdrop').forEach(b => b.remove());
        }
    };

    // Ensure overlay is clean before we start
    nukeOverlays();
    await wait(100);

    const customDDs = document.querySelectorAll('mat-select, [role="listbox"], [role="combobox"]');
    const totalDDs = Array.from(customDDs).filter(dd => isVisible(dd)).length;
    let ddIndex = 0;

    for (const dd of customDDs) {
        if (!isVisible(dd)) continue;
        ddIndex++;
        const label = findLabelFor(dd);
        const key = label || dd.getAttribute('aria-label') || dd.id || `custom_dd_${result.stats.totalCustomDropdowns}`;

        // Try to get current value without opening the dropdown
        const currentText = dd.querySelector('.mat-select-value-text, .mat-mdc-select-value-text, [class*="select-value"]')?.textContent?.trim() || '';

        let options = [];
        try {
            // Open the dropdown — click directly on the trigger element
            dd.click();
            await wait(350);  // Wait just enough for overlay to render

            // Find the panel that belongs to THIS dropdown (Angular uses aria-owns)
            const panelId = dd.getAttribute('aria-owns') || dd.getAttribute('aria-controls');
            let optionEls = [];

            if (panelId) {
                // Targeted: grab options from THIS dropdown's specific panel
                const panel = document.getElementById(panelId);
                if (panel) {
                    optionEls = panel.querySelectorAll('mat-option, [role="option"]');
                }
            }

            // Fallback: find the newest/last overlay pane (most recently opened)
            if (optionEls.length === 0) {
                const panes = document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane');
                if (panes.length > 0) {
                    const lastPane = panes[panes.length - 1];
                    optionEls = lastPane.querySelectorAll('mat-option, [role="option"]');
                }
            }

            options = Array.from(optionEls)
                .map(el => el.textContent.trim())
                .filter(t => t && !['', 'select', 'select one', '--select--'].includes(t.toLowerCase()));

            // Close immediately
            await closeDropdown(dd);

        } catch (e) {
            // Cleanup on failure
            nukeOverlays();
            await wait(50);
        }

        result.dropdowns[key] = {
            id: dd.id || '',
            ariaLabel: dd.getAttribute('aria-label') || '',
            label: label || '',
            options,
            currentValue: currentText,
            optionCount: options.length
        };
        result.stats.totalCustomDropdowns++;
        result.stats.totalOptions += options.length;
    }

    // ── Final cleanup: nuke all overlays and reset page state ──
    nukeOverlays();
    // Move focus to a neutral element so no dropdowns stay active
    document.body.click();
    document.body.focus();
    // Scroll back to top for a clean state
    window.scrollTo(0, 0);
    await wait(100);

    console.log('[Altech Scraper] Scraped page:', result.stats);
    return result;
}

/** Find the visible label text for a form element. */
function findLabelFor(el) {
    // 1. Check label[for]
    if (el.id) {
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        if (lbl) return lbl.textContent.replace(/[*:]/g, '').trim();
    }

    // 2. Check parent label
    const parentLabel = el.closest('label');
    if (parentLabel) {
        const text = parentLabel.textContent.replace(/[*:]/g, '').trim();
        // Remove the input value from the label text
        const val = (el.value || '').trim();
        return val ? text.replace(val, '').trim() : text;
    }

    // 3. Check closest form field container
    const container = el.closest(
        '.mat-form-field, fieldset, .form-group, [class*="form-field"], ' +
        '[class*="form-group"], .field-wrapper'
    );
    if (container) {
        const lbl = container.querySelector('label, legend, .mat-form-field-label, [class*="label"]');
        if (lbl) return lbl.textContent.replace(/[*:]/g, '').trim();
    }

    // 4. Check aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    // 5. Check placeholder
    if (el.placeholder) return el.placeholder.trim();

    return '';
}


// ═══════════════════════════════════════════════════════════════
// §11  MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'ping') {
        sendResponse({ ok: true });
        return;
    }

    if (msg.type === 'fillPage') {
        fillPage(msg.clientData).then(report => {
            sendResponse(report);
        });
        return true; // async
    }

    if (msg.type === 'getPageInfo') {
        sendResponse({ page: detectPage(), url: location.href });
        return;
    }

    if (msg.type === 'scrapePage') {
        scrapePage().then(result => sendResponse(result));
        return true; // async
    }
});

// Listen for data changes to update toolbar
chrome.storage.onChanged.addListener((changes) => {
    if (changes.clientData && toolbarShadow) {
        const data = changes.clientData.newValue;
        const el = toolbarShadow.getElementById('tb-client');
        if (el) {
            el.textContent = data
                ? ([data.FirstName, data.LastName].filter(Boolean).join(' ') || 'Client loaded')
                : 'No client — use popup';
        }
    }
});


// ═══════════════════════════════════════════════════════════════
// §12  INIT
// ═══════════════════════════════════════════════════════════════

// Prevent double-injection
if (window.__altechFillerLoaded) {
    console.log('[Altech Filler] Already loaded — skipping re-init.');
} else {
    window.__altechFillerLoaded = true;

    // Auto-inject toolbar when content script loads
    chrome.storage.local.get('settings', ({ settings }) => {
        if (!settings || settings.autoShowToolbar !== false) {
            // Small delay to let Angular finish rendering
            setTimeout(injectToolbar, 1500);
        }
    });

    console.log('[Altech Filler] Content script loaded on', location.href, '| Page:', detectPage());
}
