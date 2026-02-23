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

const EXTENSION_VERSION = '0.6.7';
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

// Direct mat-select[formcontrolname] selectors — tried BEFORE label-based lookup
// These bypass the label search entirely when the Angular formcontrolname is known.
const PRIORITY_SELECTORS = {
    Prefix:       "mat-select[formcontrolname='prefix']",
    Suffix:       "mat-select[formcontrolname='suffix']",
    DLState:      "mat-select[formcontrolname='driverLicenseState']",
    // Relationship is Co-Applicant-scoped — used by fillScopedDropdown, not global fill
    Relationship: "mat-select[formcontrolname='relationship']",
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

/**
 * Context-specific abbreviation groups for ambiguous codes.
 * MA → Massachusetts (state) vs Masters (education)
 * MD → Maryland (state) vs Medical Degree (education)
 * S  → Single (marital) vs potential state code confusion
 */
const CONTEXT_ABBREVS = {
    state: {
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
        'WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming'
    },
    education: {
        'HS':'High School Diploma','BA':'Bachelors','BS':'Bachelors',
        'MA':'Masters','PHD':'Phd','GED':'High School Diploma',
        'JD':'Law Degree','MD':'Medical Degree'
    },
    marital: {
        'S':'Single','D':'Divorced','W':'Widowed',
        'SEP':'Separated','DP':'Domestic Partner'
    },
    gender: { 'M':'Male','F':'Female' }
};

/** Pattern map: field key substrings → which context to use */
const FIELD_CONTEXT_MAP = {
    state:     ['state', 'dlstate', 'licensestate', 'garagingstate'],
    education: ['education', 'degree'],
    marital:   ['marital'],
    gender:    ['gender', 'sex']
};

/** Expand abbreviations with optional field-key context to resolve ambiguity. */
function expand(val, fieldKey) {
    const upper = (val || '').toUpperCase();
    if (!upper) return val;

    // If field key provided, check for context-specific expansion first
    if (fieldKey) {
        const keyLower = fieldKey.toLowerCase();
        for (const [ctx, patterns] of Object.entries(FIELD_CONTEXT_MAP)) {
            if (patterns.some(p => keyLower.includes(p))) {
                if (CONTEXT_ABBREVS[ctx][upper]) return CONTEXT_ABBREVS[ctx][upper];
                break; // Only match first context
            }
        }
    }

    return ABBREVIATIONS[upper] || val;
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
// §5.5  YES/NO TOGGLE FILLER (activates hidden Angular sections)
// ═══════════════════════════════════════════════════════════════

/**
 * Map of clientData boolean/yes-no keys → label search patterns on EZLynx.
 * Each entry: labels (to locate the toggle), trueValues (data values meaning "on").
 */
const TOGGLE_MAP = {
    Pool:               { labels: ['swimming pool', 'pool'], trueValues: ['yes', 'in ground', 'in-ground', 'above ground', 'true'] },
    Trampoline:         { labels: ['trampoline'], trueValues: ['yes', 'true'] },
    WoodStove:          { labels: ['wood stove', 'wood burning stove', 'wood burning'], trueValues: ['yes', 'true'] },
    CoApplicant:        { labels: ['co-applicant', 'coapplicant', 'co applicant', 'is there a co-applicant'], trueValues: ['yes', 'true'] },
    PriorInsurance:     { labels: ['prior insurance', 'currently insured', 'prior coverage'], trueValues: ['yes', 'true'] },
    SR22Required:       { labels: ['sr-22', 'sr22', 'sr-22 required'], trueValues: ['yes', 'true'] },
    GoodStudent:        { labels: ['good student'], trueValues: ['yes', 'true'] },
    DogOnPremises:      { labels: ['dog', 'dog on premises', 'aggressive dog', 'animal'], trueValues: ['yes', 'true'] },
    BusinessOnPremises: { labels: ['business on premises', 'home business', 'business conducted'], trueValues: ['yes', 'true'] },
    Smoker:             { labels: ['smoker', 'tobacco', 'tobacco user'], trueValues: ['yes', 'true'] },
    DayCare:            { labels: ['day care', 'daycare', 'child care', 'childcare'], trueValues: ['yes', 'true'] },
    Farming:            { labels: ['farming', 'farm activities', 'farm use'], trueValues: ['yes', 'true'] },
    Fence:              { labels: ['fence', 'fenced'], trueValues: ['yes', 'true'] },
    DeadBolts:          { labels: ['dead bolt', 'deadbolt', 'dead bolts'], trueValues: ['yes', 'true'] },
    GatedCommunity:     { labels: ['gated community', 'gated'], trueValues: ['yes', 'true'] },
    NewPurchase:        { labels: ['new purchase', 'newly purchased', 'recent purchase'], trueValues: ['yes', 'true'] },
    MultiPolicy:        { labels: ['multi-policy', 'multipolicy', 'multi policy', 'package discount'], trueValues: ['yes', 'true'] },
};

/**
 * Find a mat-slide-toggle, mat-checkbox, or mat-radio-button (Yes option)
 * near a label matching the given patterns.
 * Returns { element, type, isActive } or null.
 */
function findToggleByLabel(labelPatterns) {
    const norm = s => (s || '').replace(/[*:]/g, '').trim().toLowerCase();

    // Poison words: if the element's text contains ANY of these, skip it entirely.
    // This prevents sibling toggles (e.g. "Client Center Access") from hijacking
    // the match when we're looking for "Co-Applicant".
    const POISON_WORDS = ['client center', 'clientcenter'];

    for (const pattern of labelPatterns) {
        const pat = pattern.toLowerCase();

        // Search mat-slide-toggles
        for (const toggle of document.querySelectorAll('mat-slide-toggle, [class*="mat-slide-toggle"]')) {
            if (!isVisible(toggle)) continue;
            const text = norm(toggle.textContent);
            if (POISON_WORDS.some(pw => text.includes(pw))) continue;
            if (text.includes(pat) || pat.includes(text)) {
                const isActive = toggle.classList.contains('mat-checked') ||
                                 toggle.classList.contains('mat-mdc-slide-toggle-checked') ||
                                 toggle.querySelector('input[type="checkbox"]')?.checked || false;
                return { element: toggle, type: 'mat-slide-toggle', isActive };
            }
        }

        // Search mat-checkbox (some yes/no fields use checkboxes)
        for (const cb of document.querySelectorAll('mat-checkbox, [class*="mat-checkbox"]')) {
            if (!isVisible(cb)) continue;
            const text = norm(cb.textContent);
            if (POISON_WORDS.some(pw => text.includes(pw))) continue;
            if (text.includes(pat) || pat.includes(text)) {
                const isActive = cb.classList.contains('mat-checkbox-checked') ||
                                 cb.classList.contains('mat-mdc-checkbox-checked') ||
                                 cb.querySelector('input[type="checkbox"]')?.checked || false;
                return { element: cb, type: 'mat-checkbox', isActive };
            }
        }

        // Search labels near mat-radio-buttons (for Yes/No radio pairs)
        for (const lbl of document.querySelectorAll('label, legend, [class*="label"], .mat-form-field-label')) {
            const text = norm(lbl.textContent);
            if (!text || text.length > 60) continue;
            if (!text.includes(pat) && !pat.includes(text)) continue;

            const container = lbl.closest(
                '.mat-form-field, fieldset, .form-group, [class*="form-field"], ' +
                '[class*="form-group"], .field-wrapper, .col, [class*="col-"]'
            ) || lbl.parentElement;

            if (container) {
                const radios = container.querySelectorAll('mat-radio-button, [class*="mat-radio-button"]');
                if (radios.length > 0) {
                    // Find the "Yes" radio
                    for (const radio of radios) {
                        const radioText = norm(radio.textContent);
                        if (radioText === 'yes' || radioText.includes('yes')) {
                            const isActive = radio.classList.contains('mat-radio-checked') ||
                                             radio.classList.contains('mat-mdc-radio-checked');
                            return { element: radio, type: 'mat-radio-button', isActive };
                        }
                    }
                }
            }
        }

        // Also search native checkboxes near matching labels
        for (const lbl of document.querySelectorAll('label')) {
            const text = norm(lbl.textContent);
            if (!text || text.length > 60) continue;
            if (!text.includes(pat) && !pat.includes(text)) continue;

            const forId = lbl.getAttribute('for') || lbl.htmlFor;
            if (forId) {
                const el = document.getElementById(forId);
                if (el && el.type === 'checkbox' && isVisible(el)) {
                    return { element: el, type: 'native-checkbox', isActive: el.checked };
                }
            }
        }
    }

    return null;
}

/**
 * Click a toggle/checkbox/radio to its desired state.
 */
function clickToggle(found) {
    if (found.type === 'mat-slide-toggle') {
        const input = found.element.querySelector('input[type="checkbox"]');
        if (input) input.click();
        else found.element.click();
    } else if (found.type === 'mat-checkbox') {
        const input = found.element.querySelector('input[type="checkbox"]');
        if (input) input.click();
        else found.element.click();
    } else if (found.type === 'mat-radio-button') {
        const input = found.element.querySelector('input[type="radio"]');
        if (input) input.click();
        else found.element.click();
    } else if (found.type === 'native-checkbox') {
        found.element.click();
    }
}

/**
 * Fill Yes/No toggles BEFORE text/dropdown fields.
 * Clicks toggles to reveal hidden Angular sections so their fields
 * are present in the DOM when fillText/fillCustomDropdown runs.
 */
async function fillYesNoToggles(smartData, report) {
    updateToolbarStatus('Activating Yes/No toggles...');

    for (const [key, config] of Object.entries(TOGGLE_MAP)) {
        const value = smartData[key];
        if (!value) continue;

        const shouldBeOn = config.trueValues.includes(String(value).toLowerCase());
        if (!shouldBeOn) continue; // Only activate toggles, never deactivate

        const found = findToggleByLabel(config.labels);
        if (!found) {
            report.details.push({ field: key, type: 'toggle', status: 'SKIP', value, reason: 'Toggle not found on page' });
            continue;
        }

        if (found.isActive) {
            report.details.push({ field: key, type: 'toggle', status: 'OK', value, reason: 'Already active' });
            continue;
        }

        // Click the toggle to activate it
        updateToolbarStatus(`Toggle: ${key}...`);
        clickToggle(found);

        // Wait for Angular to render the newly revealed fields
        await wait(500);

        report.details.push({ field: key, type: 'toggle', status: 'OK', value });
        report.textFilled++; // Count toggles as filled fields
    }
}

function detectPage() {
    const url = location.href.toLowerCase();
    // Also check page title/heading for extra detection
    const title = (document.title || '').toLowerCase();
    const h1 = (document.querySelector('h1, h2, .page-title, [class*="title"]')?.textContent || '').toLowerCase();

    // Auto pages
    if (url.includes('/rating/auto/') || url.includes('/auto/')) {
        if (url.includes('incident') || url.includes('violation') || url.includes('claim') || url.includes('accident'))
            return 'auto-incident';
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
        page === 'auto-policy' || page === 'auto-driver' || page === 'auto-vehicle' || page === 'auto-coverage' || page === 'auto-incident') {
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

function fillNativeSelect(selectors, value, fieldKey) {
    if (!value || !String(value).trim()) return false;
    const target = String(value).trim();
    const expanded = expand(target, fieldKey);

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

async function fillCustomDropdown(labelPatterns, value, fieldKey) {
    if (!value || !String(value).trim()) return false;
    const target = String(value).trim();
    const expanded = expand(target, fieldKey);

    // ── Priority selector: try direct formcontrolname match first ──
    if (fieldKey && PRIORITY_SELECTORS[fieldKey]) {
        const priorityEl = document.querySelector(PRIORITY_SELECTORS[fieldKey]);
        if (priorityEl && isVisible(priorityEl)) {
            console.log(`[Altech Filler] Using priority selector for ${fieldKey}`);
            // It's always a mat-select (custom dropdown)
            try {
                priorityEl.click();
                priorityEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                await wait(DROPDOWN_WAIT);

                const overlaySels = [
                    '.cdk-overlay-container mat-option',
                    '.cdk-overlay-container [role="option"]',
                    '.mat-select-panel mat-option',
                ];
                let optionEls = [];
                for (const osel of overlaySels) {
                    const els = document.querySelectorAll(osel);
                    if (els.length > 0) { optionEls = Array.from(els); break; }
                }
                if (optionEls.length > 0) {
                    const optionTexts = optionEls.map(el => el.textContent.trim()).filter(t => t);
                    let bestOpt = null;
                    for (const attempt of [target, expanded]) {
                        for (const ot of optionTexts) {
                            if (ot.toLowerCase() === attempt.toLowerCase()) { bestOpt = ot; break; }
                        }
                        if (bestOpt) break;
                    }
                    if (!bestOpt) {
                        const m = bestMatch(expanded, optionTexts) || bestMatch(target, optionTexts);
                        if (m) bestOpt = m.text;
                    }
                    if (bestOpt) {
                        for (const el of optionEls) {
                            if (el.textContent.trim() === bestOpt) {
                                el.click();
                                await wait(200);
                                return true;
                            }
                        }
                    }
                }
                // Close overlay if priority attempt didn't match
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await wait(100);
            } catch (e) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }
            // Fall through to label-based lookup if priority selector didn't work
        }
    }

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


// ─── §7b  SCOPED FILL UTILITIES (Container-restricted) ───

/**
 * Fill a text input WITHIN a container element, not the global document.
 * Searches by CSS selectors first, then by label proximity inside the container.
 * Returns true if a field was filled.
 */
function fillScopedText(container, selectors, value) {
    if (!container || !value || !String(value).trim()) return false;
    const val = String(value).trim();

    // Strategy 1: CSS selectors scoped to container
    if (Array.isArray(selectors)) {
        for (const sel of selectors) {
            try {
                const el = container.querySelector(sel);
                if (el && isVisible(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                    setInputValue(el, val);
                    return true;
                }
            } catch (e) { /* skip invalid selector */ }
        }
    }
    return false;
}

/**
 * Fill a text input WITHIN a container by finding it near a label inside that container.
 * Like fillTextByLabel but limited to the given container.
 */
function fillScopedTextByLabel(container, labelText, value) {
    if (!container || !value || !String(value).trim()) return false;
    const val = String(value).trim();
    const norm = s => (s || '').replace(/[*:]/g, '').trim().toLowerCase();
    const pat = labelText.toLowerCase();

    for (const lbl of container.querySelectorAll('label, legend, [class*="label"]')) {
        const text = norm(lbl.textContent);
        if (!text || text.length > 60) continue;
        if (text !== pat && !text.includes(pat)) continue;

        // label[for]
        const forId = lbl.getAttribute('for') || lbl.htmlFor;
        if (forId) {
            const el = document.getElementById(forId);
            if (el && container.contains(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && isVisible(el)) {
                setInputValue(el, val);
                return true;
            }
        }

        // Nearest input inside label's form-field wrapper
        const wrapper = lbl.closest(
            '.mat-form-field, fieldset, .form-group, [class*="form-field"], ' +
            '[class*="form-group"], .field-wrapper, .col, [class*="col-"]'
        ) || lbl.parentElement;

        if (wrapper && container.contains(wrapper)) {
            const inp = wrapper.querySelector('input, textarea');
            if (inp && isVisible(inp)) {
                setInputValue(inp, val);
                return true;
            }
        }
    }
    return false;
}

/**
 * Fill a dropdown WITHIN a container element.
 * Finds a mat-select or native <select> near a label inside the container,
 * then opens it and picks the best match from the CDK overlay.
 * Returns true if filled.
 */
async function fillScopedDropdown(container, labelPatterns, value, fieldKey) {
    if (!container || !value || !String(value).trim()) return false;
    const target = String(value).trim();
    const expanded = expand(target, fieldKey);
    const norm = s => (s || '').replace(/[*:]/g, '').trim().toLowerCase();

    let ddEl = null;
    let ddType = null;

    // Priority selector: try direct formcontrolname match WITHIN the container first
    if (fieldKey && PRIORITY_SELECTORS[fieldKey]) {
        const priorityEl = container.querySelector(PRIORITY_SELECTORS[fieldKey]);
        if (priorityEl && isVisible(priorityEl)) {
            ddEl = priorityEl;
            ddType = 'custom';
            console.log(`[Altech Filler] Scoped priority selector hit for ${fieldKey}`);
        }
    }

    // Label-based search within the container
    if (!ddEl) {
        for (const pattern of labelPatterns) {
            const pat = pattern.toLowerCase();
            for (const lbl of container.querySelectorAll(
                'label, legend, .mat-form-field-label, [class*="label"], ' +
                '[class*="form-field"] > span, [class*="form-field"] > div'
            )) {
                const text = norm(lbl.textContent);
                if (!text || text.length > 60) continue;
                if (text !== pat && !text.includes(pat)) continue;

                // label[for]
                const forId = lbl.getAttribute('for') || lbl.htmlFor;
                if (forId) {
                    const el = document.getElementById(forId);
                    if (el && container.contains(el)) {
                        if (el.tagName === 'SELECT') { ddEl = el; ddType = 'native'; break; }
                        if (el.tagName === 'MAT-SELECT' || el.getAttribute('role') === 'listbox' || el.getAttribute('role') === 'combobox') {
                            ddEl = el; ddType = 'custom'; break;
                        }
                    }
                }

                const wrapper = lbl.closest(
                    '.mat-form-field, fieldset, .form-group, .form-field, ' +
                    '[class*="form-field"], [class*="form-group"], .field-wrapper, ' +
                    '.col, .column, [class*="col-"]'
                ) || lbl.parentElement;

                if (wrapper && container.contains(wrapper)) {
                    const sel = wrapper.querySelector('select');
                    if (sel && isVisible(sel)) { ddEl = sel; ddType = 'native'; break; }
                    const matSel = wrapper.querySelector('mat-select, [role="listbox"], [role="combobox"]');
                    if (matSel) { ddEl = matSel; ddType = 'custom'; break; }
                }
            }
            if (ddEl) break;
        }
    }

    if (!ddEl) return false;

    // Native select
    if (ddType === 'native') {
        const options = Array.from(ddEl.options)
            .filter(o => o.text.trim() && !['', 'select', 'select one', '-- select --'].includes(o.text.trim().toLowerCase()))
            .map(o => ({ text: o.text.trim(), value: o.value }));
        for (const attempt of [target, expanded]) {
            for (const opt of options) {
                if (opt.text.toLowerCase() === attempt.toLowerCase() || opt.value.toLowerCase() === attempt.toLowerCase()) {
                    ddEl.value = opt.value;
                    ddEl.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }
            }
        }
        const optTexts = options.map(o => o.text);
        const match = bestMatch(expanded, optTexts) || bestMatch(target, optTexts);
        if (match) {
            const opt = options.find(o => o.text === match.text);
            if (opt) { ddEl.value = opt.value; ddEl.dispatchEvent(new Event('change', { bubbles: true })); return true; }
        }
        return false;
    }

    // Custom dropdown (Angular Material) — click to open overlay (overlay is global, not in container)
    try { ddEl.click(); ddEl.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (e) { return false; }
    await wait(DROPDOWN_WAIT);

    const overlaySels = [
        '.cdk-overlay-container mat-option',
        '.cdk-overlay-container [role="option"]',
        '[role="listbox"] [role="option"]',
        '.mat-select-panel mat-option',
        '.mat-option',
    ];

    let optionEls = [];
    for (const osel of overlaySels) {
        const els = document.querySelectorAll(osel);
        if (els.length > 0) { optionEls = Array.from(els); break; }
    }

    if (!optionEls.length) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return false;
    }

    const optionTexts = optionEls.map(el => el.textContent.trim()).filter(t => t && !['', 'select', 'select one'].includes(t.toLowerCase()));

    let bestOpt = null;
    for (const attempt of [target, expanded]) {
        for (const ot of optionTexts) {
            if (ot.toLowerCase() === attempt.toLowerCase()) { bestOpt = ot; break; }
        }
        if (bestOpt) break;
    }
    if (!bestOpt) {
        const m = bestMatch(expanded, optionTexts) || bestMatch(target, optionTexts);
        if (m) bestOpt = m.text;
    }

    if (bestOpt) {
        for (const el of optionEls) {
            if (el.textContent.trim() === bestOpt) {
                el.click();
                await wait(200);
                return true;
            }
        }
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(100);
    return false;
}


// ═══════════════════════════════════════════════════════════════
// §8  FLOATING TOOLBAR (Shadow DOM isolated)
// ═══════════════════════════════════════════════════════════════

let toolbarShadow = null;
let toolbarWasShown = false;

function injectToolbar() {
    toolbarWasShown = true;
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
            .btn-report { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.6); font-size: 10px; padding: 4px 8px; }
            .btn-report:hover { color: #fff; background: rgba(255,255,255,0.2); }
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
            <button class="btn btn-report" id="tb-report" style="display:none;">📋</button>
            <button class="btn btn-close" id="tb-close">✕</button>
            <span class="status" id="tb-status"></span>
        </div>
    `;

    // Load client name
    chrome.storage.local.get(['clientData', 'lastFillReport'], ({ clientData, lastFillReport }) => {
        const clientEl = shadow.getElementById('tb-client');
        if (clientData) {
            const name = [clientData.FirstName, clientData.LastName].filter(Boolean).join(' ');
            clientEl.textContent = name || 'Client loaded';
        } else {
            clientEl.textContent = 'No client — use extension popup';
        }
        // Show report button if previous report exists
        if (lastFillReport) {
            const reportBtn = shadow.getElementById('tb-report');
            if (reportBtn) reportBtn.style.display = '';
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

        // Show report button for quick re-access
        const reportBtn = shadow.getElementById('tb-report');
        if (reportBtn) reportBtn.style.display = '';

        // Show injection report panel
        showInjectionReport(shadow, result);
    });

    // Report button (re-open last fill report)
    shadow.getElementById('tb-report').addEventListener('click', async (e) => {
        e.stopPropagation();
        const { lastFillReport } = await chrome.storage.local.get('lastFillReport');
        if (lastFillReport) {
            showInjectionReport(shadow, lastFillReport);
        }
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

/** Escape HTML special chars to prevent XSS in innerHTML templates. */
function escapeHTML(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str || '').replace(/[&<>"']/g, c => map[c]);
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

    const pageNames = {
        'applicant': 'Applicant', 'auto-policy': 'Auto Policy',
        'auto-incident': 'Incidents', 'auto-driver': 'Drivers',
        'auto-vehicle': 'Vehicles', 'auto-coverage': 'Coverage',
        'home-dwelling': 'Home Dwelling', 'home-coverage': 'Home Coverage',
        'lead-info': 'Lead Info',
    };
    const pageName = pageNames[result.page] || result.page || 'Unknown';

    const rows = (result.details || []).map(d => {
        let icon, cls;
        if (d.status === 'OK') { icon = '✅'; cls = 'ok'; }
        else if (d.status === 'OK_RETRY') { icon = '🔄'; cls = 'retry'; }
        else if (d.status === 'info') { icon = 'ℹ️'; cls = 'info'; }
        else { icon = '❌'; cls = 'skip'; }
        const reason = d.reason || (d.status === 'SKIP' ? 'Not found on page' : '');
        const valTrunc = d.value ? (d.value.length > 20 ? d.value.slice(0, 20) + '…' : d.value) : '';
        return `<div class="rpt-row ${cls}">
            <span class="rpt-icon">${icon}</span>
            <span class="rpt-field">${escapeHTML(d.field)}</span>
            <span class="rpt-type">${escapeHTML(d.type)}</span>
            ${valTrunc ? `<span class="rpt-val" title="${escapeHTML(d.value)}">${escapeHTML(valTrunc)}</span>` : ''}
            ${reason ? `<span class="rpt-reason">${escapeHTML(reason)}</span>` : ''}
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
            .rpt-val { color: rgba(150,200,255,0.7); font-size: 10px; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .rpt-reason { color: rgba(255,150,150,0.8); font-size: 10px; margin-left: auto; }
            .rpt-row.info { background: rgba(0,122,255,0.08); }
            .rpt-close { background: none; border: none; color: rgba(255,255,255,0.5); cursor: pointer;
                font-size: 16px; line-height: 1; padding: 2px 6px; }
            .rpt-close:hover { color: #fff; }
            .rpt-body::-webkit-scrollbar { width: 5px; }
            .rpt-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
        </style>
        <div class="rpt-panel">
            <div class="rpt-header">
                <h3>📋 Fill Report — ${escapeHTML(pageName)}</h3>
                <button class="rpt-close" id="rpt-close-btn">✕</button>
            </div>
            <div class="rpt-summary">
                ${total} filled${skipped > 0 ? ` · ${skipped} skipped` : ''} · ${result.details?.length || 0} fields attempted${result.timestamp ? ` · ${new Date(result.timestamp).toLocaleTimeString()}` : ''}
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
    console.log(`[Altech Filler v${EXTENSION_VERSION}] Starting fill...`);
    const report = { textFilled: 0, textSkipped: 0, ddFilled: 0, ddSkipped: 0, details: [], page: detectPage(), timestamp: new Date().toISOString() };
    if (!clientData) return report;

    // Load previously scraped options for smarter value translation
    let knownOptions = {};
    try {
        const stored = await chrome.storage.local.get('knownOptions');
        knownOptions = stored?.knownOptions || {};
    } catch (e) { /* no scrape data yet */ }

    // Pre-process client data: for DROPDOWN fields only, find closest matches
    // from scraped option lists. Text fields (DOB, Phone, Address, etc.) are
    // left untouched — matching them against dropdown options corrupts values.
    const smartData = { ...clientData };

    // Truncate ZIP to 5 digits — EZLynx rejects ZIP+4
    if (smartData.Zip) smartData.Zip = String(smartData.Zip).replace(/[^0-9]/g, '').slice(0, 5);

    // Keys that are text fields — must NOT be fuzzy-matched against dropdown options
    const _textFieldKeys = new Set(Object.keys(TEXT_FIELD_MAP));

    for (const [key, value] of Object.entries(smartData)) {
        if (!value || typeof value !== 'string') continue;
        // Skip text fields — their values are free-form, not dropdown selections
        if (_textFieldKeys.has(key)) continue;
        // Skip arrays/objects (Drivers, Vehicles, Incidents)
        if (Array.isArray(value) || typeof value === 'object') continue;

        const expanded = expand(value, key);

        // Check all known option lists for a better match
        for (const [label, options] of Object.entries(knownOptions)) {
            if (!Array.isArray(options) || options.length === 0) continue;
            // Only try if label seems related to this key
            const labelLower = label.toLowerCase().replace(/[^a-z]/g, '');
            const keyLower = key.toLowerCase().replace(/[^a-z]/g, '');
            // Require minimum 3-char overlap to prevent false matches on short keys
            if (keyLower.length < 3 || labelLower.length < 3) continue;
            if (!labelLower.includes(keyLower) && !keyLower.includes(labelLower)) continue;

            // Try to find exact or fuzzy match in known options
            const match = bestMatch(expanded, options) || bestMatch(value, options);
            if (match && match.score >= 0.6) {
                smartData[key] = match.text;
                break;
            }
        }
    }

    // ── Yes/No toggles (reveal hidden Angular sections FIRST) ──
    await fillYesNoToggles(smartData, report);

    // ── Text fields ──
    updateToolbarStatus('Filling text fields...');
    for (const [key, selectors] of Object.entries(TEXT_FIELD_MAP)) {
        const value = smartData[key];
        if (!value) continue;

        updateToolbarStatus(`Text: ${key}...`);
        const filled = fillText(selectors, value) || fillTextByLabel(key, value);
        if (filled) {
            report.textFilled++;
            report.details.push({ field: key, type: 'text', status: 'OK', value: value });
        } else {
            report.textSkipped++;
            report.details.push({ field: key, type: 'text', status: 'SKIP', value: value });
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
        let filled = await fillCustomDropdown(labelPatterns, value, key);

        // Fallback to native <select> selectors
        if (!filled && DROPDOWN_SELECT_MAP[key]) {
            filled = fillNativeSelect(DROPDOWN_SELECT_MAP[key], value, key);
        }

        if (filled) {
            report.ddFilled++;
            report.details.push({ field: key, type: 'dropdown', status: 'OK', value: value });
        } else {
            report.ddSkipped++;
            report.details.push({ field: key, type: 'dropdown', status: 'SKIP', value: value });
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

            let filled = await fillCustomDropdown(labelPatterns, value, key);
            if (!filled && DROPDOWN_SELECT_MAP[key]) {
                filled = fillNativeSelect(DROPDOWN_SELECT_MAP[key], value, key);
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

    // ── Co-Applicant injection (Applicant page only) ──
    const coApPage = detectPage();
    const coApp = smartData.CoApplicant || clientData.CoApplicant;
    if (coApPage === 'applicant' && coApp && coApp.FirstName) {
        updateToolbarStatus('Adding Co-Applicant...');
        console.log('[Altech Filler] Co-Applicant detected, injecting:', coApp);

        // Step 1: Click "Add contact" button
        let addContactClicked = false;
        const addBtnPatterns = ['Add contact', 'Add Contact', 'Add another contact', 'Add Another Contact', '+ Contact', 'New Contact'];
        const allBtns = [...document.querySelectorAll('button, a, [role="button"], .mat-button, .mat-raised-button, .mat-flat-button, .mat-icon-button')];
        for (const btn of allBtns) {
            const text = (btn.textContent || '').trim();
            if (addBtnPatterns.some(p => text.toLowerCase().includes(p.toLowerCase()))) {
                btn.click();
                addContactClicked = true;
                console.log(`[Altech Filler] Clicked "${text}" for Co-Applicant`);
                break;
            }
        }
        // Fallback: aria-label / title
        if (!addContactClicked) {
            for (const pat of addBtnPatterns) {
                const btn = document.querySelector(`[aria-label*="${pat}" i], [title*="${pat}" i]`);
                if (btn) { btn.click(); addContactClicked = true; console.log(`[Altech Filler] Clicked add-contact by aria-label: ${pat}`); break; }
            }
        }

        if (addContactClicked) {
            await wait(1200); // Wait for Angular expansion animation

            // Step 2: Find the LAST expansion panel (the new Co-Applicant section)
            const panels = document.querySelectorAll('mat-expansion-panel, .mat-expansion-panel, [class*="expansion-panel"], [class*="contact-panel"], [class*="co-applicant"], [class*="additional-contact"]');
            const coApContainer = panels.length > 0 ? panels[panels.length - 1] : null;

            if (coApContainer) {
                console.log('[Altech Filler] Found Co-Applicant container:', coApContainer.className);

                // Step 3: Mark as Co-Applicant (checkbox / toggle / radio)
                // STRICT targeting: must match "co-applicant" AND must NOT contain "client center"
                const coApLabelPatterns = ['co-applicant', 'coapplicant', 'make this contact co', 'co applicant'];
                const coApPoisonWords = ['client center', 'clientcenter'];
                let markedCoAp = false;

                // Try mat-slide-toggles first (most common for this field)
                for (const toggle of coApContainer.querySelectorAll('mat-slide-toggle, [class*="mat-slide-toggle"]')) {
                    if (!isVisible(toggle)) continue;
                    const toggleText = (toggle.textContent || '').toLowerCase();
                    if (coApPoisonWords.some(pw => toggleText.includes(pw))) continue;
                    if (coApLabelPatterns.some(p => toggleText.includes(p))) {
                        const input = toggle.querySelector('input[type="checkbox"]');
                        if (input) input.click(); else toggle.click();
                        markedCoAp = true;
                        console.log('[Altech Filler] Marked Co-Applicant via mat-slide-toggle');
                        break;
                    }
                }

                // Fallback: checkboxes / radio buttons inside the container
                if (!markedCoAp) {
                    for (const ctrl of coApContainer.querySelectorAll('mat-checkbox, mat-radio-button, input[type="checkbox"], input[type="radio"], label')) {
                        const ctrlText = (ctrl.textContent || ctrl.getAttribute('aria-label') || '').toLowerCase();
                        if (coApPoisonWords.some(pw => ctrlText.includes(pw))) continue;
                        if (coApLabelPatterns.some(p => ctrlText.includes(p))) {
                            ctrl.click();
                            markedCoAp = true;
                            console.log('[Altech Filler] Marked Co-Applicant checkbox/toggle');
                            break;
                        }
                    }
                }

                // Fallback: check for a dropdown labeled "Contact Type" or "Type" with a Co-Applicant option
                if (!markedCoAp) {
                    const typeLabels = ['contact type', 'type', 'role'];
                    const filled = await fillScopedDropdown(coApContainer, typeLabels, 'Co-Applicant', 'ContactType');
                    if (filled) {
                        markedCoAp = true;
                        console.log('[Altech Filler] Set Contact Type dropdown to Co-Applicant');
                    }
                }

                await wait(800); // Wait for Co-Applicant fields to render

                // Step 4: Scoped fill — Co-Applicant fields WITHIN this container only
                const coApFields = {
                    FirstName:    { selectors: TEXT_FIELD_MAP.FirstName,  label: 'first name' },
                    LastName:     { selectors: TEXT_FIELD_MAP.LastName,   label: 'last name' },
                    DOB:          { selectors: TEXT_FIELD_MAP.DOB,        label: 'date of birth' },
                    SSN:          { selectors: TEXT_FIELD_MAP.SSN,        label: 'ssn' },
                };
                const coApDropdowns = {
                    Gender:       { labels: ['gender', 'sex'],              key: 'Gender' },
                    Relationship: { labels: ['relationship', 'relation'],   key: 'Relationship' },
                    MaritalStatus:{ labels: ['marital', 'marital status'],  key: 'MaritalStatus' },
                };

                // Fill scoped text fields
                for (const [field, cfg] of Object.entries(coApFields)) {
                    const val = coApp[field];
                    if (!val) continue;
                    updateToolbarStatus(`CoApp: ${field}...`);
                    const filled = fillScopedText(coApContainer, cfg.selectors, val) ||
                                   fillScopedTextByLabel(coApContainer, cfg.label, val);
                    if (filled) {
                        report.textFilled++;
                        report.details.push({ field: `CoApp.${field}`, type: 'text', status: 'OK', value: val });
                    } else {
                        report.textSkipped++;
                        report.details.push({ field: `CoApp.${field}`, type: 'text', status: 'SKIP', value: val });
                    }
                    await wait(FILL_DELAY);
                }

                // Fill scoped dropdowns
                for (const [field, cfg] of Object.entries(coApDropdowns)) {
                    const val = coApp[field];
                    if (!val) continue;
                    updateToolbarStatus(`CoApp: ${field}...`);
                    const filled = await fillScopedDropdown(coApContainer, cfg.labels, val, cfg.key);
                    if (filled) {
                        report.ddFilled++;
                        report.details.push({ field: `CoApp.${field}`, type: 'dropdown', status: 'OK', value: val });
                    } else {
                        report.ddSkipped++;
                        report.details.push({ field: `CoApp.${field}`, type: 'dropdown', status: 'SKIP', value: val });
                    }
                    await wait(FILL_DELAY);
                }

                report.details.push({ field: 'CoApplicant', type: 'info', status: markedCoAp ? 'OK' : 'WARN', reason: markedCoAp ? 'Injected & marked' : 'Injected but could not mark as Co-Applicant' });
                updateToolbarStatus('Co-Applicant filled');
            } else {
                console.warn('[Altech Filler] Could not find Co-Applicant container after clicking Add contact');
                report.details.push({ field: 'CoApplicant', type: 'info', status: 'FAIL', reason: 'Container not found after add click' });
            }
        } else {
            console.warn('[Altech Filler] No "Add contact" button found on applicant page');
            report.details.push({ field: 'CoApplicant', type: 'info', status: 'FAIL', reason: 'Add contact button not found' });
        }
    }

    // ── Multi-driver / multi-vehicle / multi-incident fill ──
    const fillPage_page = detectPage();
    if (fillPage_page === 'auto-driver' && clientData.Drivers && clientData.Drivers.length > 1) {
        await fillMultiDrivers(clientData, report);
    }
    if (fillPage_page === 'auto-vehicle' && clientData.Vehicles && clientData.Vehicles.length > 1) {
        await fillMultiVehicles(clientData, report);
    }
    // Smart fill: only fill incidents if the client actually has them
    if (fillPage_page === 'auto-incident' && clientData.Incidents && clientData.Incidents.length > 0) {
        await fillMultiIncidents(clientData, report);
    } else if (fillPage_page === 'auto-incident' && (!clientData.Incidents || clientData.Incidents.length === 0)) {
        updateToolbarStatus('\u2728 No incidents to fill \u2014 client has a clean record');
        report.details.push({ field: 'Incidents', type: 'info', status: 'SKIP', reason: 'No incidents in client data' });
    }

    const total = report.textFilled + report.ddFilled;
    const skipped = report.textSkipped + report.ddSkipped;
    updateToolbarStatus(`✓ Done! ${total} filled` + (skipped > 0 ? `, ${skipped} skipped` : ''));

    console.log(`[Altech Filler] Fill complete: ${total} filled, ${skipped} skipped`, report.details);

    // Persist report for later review
    try { chrome.storage.local.set({ lastFillReport: report }); } catch (e) { /* ignore */ }

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
        : type === 'vehicle'
        ? ['Add Vehicle', 'Add Another Vehicle', 'New Vehicle', '+ Vehicle']
        : ['Add Incident', 'Add Violation', 'Add Accident', 'Add Claim', 'Add Another', '+ Incident', '+ Violation'];

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
// §9c  INCIDENT FILL (Violations, Accidents, Claims)
// ═══════════════════════════════════════════════════════════════
//
// Real EZLynx incident page has three separate sections:
//   Accidents:   accidentDate-{i}, accident-driver-{i}, accidentDescription-{i},
//                accident-vehicleInvolved-{i}, pdAmount-{i}, biAmount-{i},
//                collisionAmount-{i}, mpAmount-{i}
//   Violations:  violationDate-{i}, violation-driver-{i}, violationDescription-{i}
//   Comp Losses: compLoss-dateOfLoss-{i}, compLoss-driver-{i},
//                compLoss-lossDescription-{i}, compLoss-vehicleInvolved-{i}, Amount-{i}

/**
 * Fill a text field by its EZLynx element ID (exact or partial).
 * Returns true if successful.
 */
function fillById(id, value) {
    if (!value) return false;
    const el = document.getElementById(id);
    if (el && isVisible(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        setInputValue(el, String(value).trim());
        return true;
    }
    // Fallback: partial ID match (EZLynx sometimes adds prefixes)
    const partial = document.querySelector(`[id*="${id}"]`);
    if (partial && isVisible(partial) && (partial.tagName === 'INPUT' || partial.tagName === 'TEXTAREA')) {
        setInputValue(partial, String(value).trim());
        return true;
    }
    return false;
}

/**
 * Fill a single accident entry at the given index.
 */
async function fillAccidentFields(incident, idx, report) {
    const prefix = `Accident${idx + 1}`;

    // Date (text)
    if (incident.Date) {
        const filled = fillById(`accidentDate-${idx}`, incident.Date) ||
                        fillTextByLabel('Date of Accident', incident.Date);
        report.details.push({ field: `${prefix}.Date`, type: 'text', status: filled ? 'OK' : 'SKIP', value: incident.Date });
        filled ? report.textFilled++ : report.textSkipped++;
        await wait(FILL_DELAY);
    }

    // Driver (dropdown)
    if (incident.Driver) {
        const filled = await fillCustomDropdown([`accident-driver-${idx}`, 'accident driver', 'driver'], incident.Driver);
        report.details.push({ field: `${prefix}.Driver`, type: 'dropdown', status: filled ? 'OK' : 'SKIP', value: incident.Driver });
        filled ? report.ddFilled++ : report.ddSkipped++;
        await wait(FILL_DELAY);
    }

    // Description (dropdown — At Fault With Injury, Not At Fault, etc.)
    if (incident.Subtype) {
        const filled = await fillCustomDropdown([`accidentDescription-${idx}`, 'accident description', 'description'], incident.Subtype);
        report.details.push({ field: `${prefix}.Description`, type: 'dropdown', status: filled ? 'OK' : 'SKIP', value: incident.Subtype });
        filled ? report.ddFilled++ : report.ddSkipped++;
        await wait(FILL_DELAY);
    }

    // Vehicle involved (dropdown)
    if (incident.Vehicle) {
        const filled = await fillCustomDropdown([`accident-vehicleInvolved-${idx}`, 'vehicle involved'], incident.Vehicle);
        report.details.push({ field: `${prefix}.Vehicle`, type: 'dropdown', status: filled ? 'OK' : 'SKIP', value: incident.Vehicle });
        filled ? report.ddFilled++ : report.ddSkipped++;
        await wait(FILL_DELAY);
    }

    // Amount fields (text — PD, BI, Collision, MP)
    if (incident.Amount) {
        // Try the specific amount fields
        const pdFilled = fillById(`pdAmount-${idx}`, incident.Amount);
        if (pdFilled) {
            report.textFilled++;
            report.details.push({ field: `${prefix}.PD Amount`, type: 'text', status: 'OK', value: incident.Amount });
        }
        await wait(FILL_DELAY);
    }
}

/**
 * Fill a single violation entry at the given index.
 */
async function fillViolationFields(incident, idx, report) {
    const prefix = `Violation${idx + 1}`;

    // Date (text)
    if (incident.Date) {
        const filled = fillById(`violationDate-${idx}`, incident.Date) ||
                        fillTextByLabel('Date of Violation', incident.Date);
        report.details.push({ field: `${prefix}.Date`, type: 'text', status: filled ? 'OK' : 'SKIP', value: incident.Date });
        filled ? report.textFilled++ : report.textSkipped++;
        await wait(FILL_DELAY);
    }

    // Driver (dropdown)
    if (incident.Driver) {
        const filled = await fillCustomDropdown([`violation-driver-${idx}`, 'violation driver', 'driver'], incident.Driver);
        report.details.push({ field: `${prefix}.Driver`, type: 'dropdown', status: filled ? 'OK' : 'SKIP', value: incident.Driver });
        filled ? report.ddFilled++ : report.ddSkipped++;
        await wait(FILL_DELAY);
    }

    // Description (dropdown — Speeding, DUI, etc.)
    if (incident.Subtype) {
        const filled = await fillCustomDropdown([`violationDescription-${idx}`, 'violation description', 'violation'], incident.Subtype);
        report.details.push({ field: `${prefix}.Description`, type: 'dropdown', status: filled ? 'OK' : 'SKIP', value: incident.Subtype });
        filled ? report.ddFilled++ : report.ddSkipped++;
        await wait(FILL_DELAY);
    }
}

/**
 * Fill a single comprehensive loss entry at the given index.
 */
async function fillCompLossFields(incident, idx, report) {
    const prefix = `CompLoss${idx + 1}`;

    // Date of Loss (text)
    if (incident.Date) {
        const filled = fillById(`compLoss-dateOfLoss-${idx}`, incident.Date) ||
                        fillTextByLabel('Date of Loss', incident.Date);
        report.details.push({ field: `${prefix}.Date`, type: 'text', status: filled ? 'OK' : 'SKIP', value: incident.Date });
        filled ? report.textFilled++ : report.textSkipped++;
        await wait(FILL_DELAY);
    }

    // Driver (dropdown)
    if (incident.Driver) {
        const filled = await fillCustomDropdown([`compLoss-driver-${idx}`, 'comp loss driver', 'driver'], incident.Driver);
        report.details.push({ field: `${prefix}.Driver`, type: 'dropdown', status: filled ? 'OK' : 'SKIP', value: incident.Driver });
        filled ? report.ddFilled++ : report.ddSkipped++;
        await wait(FILL_DELAY);
    }

    // Loss Description (dropdown — FIRE, HIT ANIMAL, THEFT, etc.)
    if (incident.Subtype) {
        const filled = await fillCustomDropdown([`compLoss-lossDescription-${idx}`, 'loss description', 'description'], incident.Subtype);
        report.details.push({ field: `${prefix}.Description`, type: 'dropdown', status: filled ? 'OK' : 'SKIP', value: incident.Subtype });
        filled ? report.ddFilled++ : report.ddSkipped++;
        await wait(FILL_DELAY);
    }

    // Vehicle Involved (dropdown)
    if (incident.Vehicle) {
        const filled = await fillCustomDropdown([`compLoss-vehicleInvolved-${idx}`, 'vehicle involved'], incident.Vehicle);
        report.details.push({ field: `${prefix}.Vehicle`, type: 'dropdown', status: filled ? 'OK' : 'SKIP', value: incident.Vehicle });
        filled ? report.ddFilled++ : report.ddSkipped++;
        await wait(FILL_DELAY);
    }

    // Amount (text)
    if (incident.Amount) {
        const filled = fillById(`Amount-${idx}`, incident.Amount) ||
                        fillTextByLabel('Amount', incident.Amount);
        report.details.push({ field: `${prefix}.Amount`, type: 'text', status: filled ? 'OK' : 'SKIP', value: incident.Amount });
        filled ? report.textFilled++ : report.textSkipped++;
        await wait(FILL_DELAY);
    }
}

/**
 * Fill all incidents on the EZLynx incidents page.
 * Separates Incidents[] into accidents, violations, and comp losses,
 * then fills each section using the real EZLynx indexed field patterns.
 *
 * For additional entries (index > 0), clicks the Add button in that section.
 */
async function fillMultiIncidents(clientData, report) {
    const incidents = clientData.Incidents;
    if (!Array.isArray(incidents) || incidents.length === 0) {
        updateToolbarStatus('\u2728 No incidents \u2014 skipping');
        return;
    }

    // Separate by type
    const accidents   = incidents.filter(i => (i.Type || '').toLowerCase() === 'accident');
    const violations  = incidents.filter(i => (i.Type || '').toLowerCase() === 'violation');
    const compLosses  = incidents.filter(i => (i.Type || '').toLowerCase() === 'claim');

    const total = accidents.length + violations.length + compLosses.length;
    updateToolbarStatus(`Filling ${total} incident(s): ${accidents.length} accident, ${violations.length} violation, ${compLosses.length} claim...`);

    // Fill accidents
    for (let i = 0; i < accidents.length; i++) {
        if (i > 0) {
            updateToolbarStatus(`Adding accident ${i + 1}...`);
            clickAddButton('incident'); // "Add Accident" / "Add Another"
            await wait(RETRY_WAIT);
        }
        await fillAccidentFields(accidents[i], i, report);
    }

    // Fill violations
    for (let i = 0; i < violations.length; i++) {
        if (i > 0) {
            updateToolbarStatus(`Adding violation ${i + 1}...`);
            clickAddButton('incident');
            await wait(RETRY_WAIT);
        }
        await fillViolationFields(violations[i], i, report);
    }

    // Fill comp losses
    for (let i = 0; i < compLosses.length; i++) {
        if (i > 0) {
            updateToolbarStatus(`Adding claim ${i + 1}...`);
            clickAddButton('incident');
            await wait(RETRY_WAIT);
        }
        await fillCompLossFields(compLosses[i], i, report);
    }
}


// ═══════════════════════════════════════════════════════════════
// §10  SPA NAVIGATION DETECTION
// ═══════════════════════════════════════════════════════════════

let lastUrl = location.href;

function onPageChange() {
    // Auto-show toolbar when navigating to the personal lines create page
    if (location.href.includes('/web/account/create/personal') && !document.getElementById('altech-filler-host')) {
        injectToolbar();
    }
    // Re-inject toolbar if it was removed by Angular DOM rebuild AND was previously shown
    else if (toolbarWasShown && !document.getElementById('altech-filler-host')) {
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
                    'auto-incident': 'Auto incident',
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
    if (toolbarWasShown && !document.getElementById('altech-filler-host') && toolbarShadow) {
        toolbarShadow = null;
        injectToolbar();
    }
});
bodyObserver.observe(document.body, { childList: true });


// ═══════════════════════════════════════════════════════════════
// §10.5  PAGE SCRAPER — Extracts all form fields & dropdown options
// ═══════════════════════════════════════════════════════════════

async function scrapePage() {
    console.log(`[Altech Scraper v${EXTENSION_VERSION}] Starting scrape...`);
    const page = detectPage();
    const url = location.href;
    const result = {
        page,
        url,
        timestamp: new Date().toISOString(),
        textFields: [],
        dropdowns: {},
        nativeSelects: {},
        cascadeSequences: [],
        stats: { totalInputs: 0, totalNativeSelects: 0, totalCustomDropdowns: 0, totalOptions: 0 }
    };

    // ── 1. Scrape all text inputs ──
    const inputs = document.querySelectorAll('input, textarea');
    for (const inp of inputs) {
        if (!isVisible(inp)) continue;
        if (['hidden', 'submit', 'button', 'reset', 'file'].includes(inp.type)) continue;

        // Checkboxes and radios go to their own section
        if (inp.type === 'checkbox' || inp.type === 'radio') continue;

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

    // ── 1b. Scrape checkboxes, radios, mat-checkboxes, mat-slide-toggles ──
    result.checkboxes = [];
    result.stats.totalCheckboxes = 0;

    // Native checkboxes
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    for (const cb of checkboxes) {
        if (!isVisible(cb)) continue;
        const label = findLabelFor(cb);
        result.checkboxes.push({
            type: 'checkbox',
            name: cb.name || '',
            id: cb.id || '',
            label: label || '',
            checked: cb.checked,
            value: cb.value || '',
            disabled: cb.disabled
        });
        result.stats.totalCheckboxes++;
    }

    // Native radio buttons (group by name)
    const radios = document.querySelectorAll('input[type="radio"]');
    const radioGroups = {};
    for (const rb of radios) {
        if (!isVisible(rb)) continue;
        const grp = rb.name || rb.id || 'unknown';
        if (!radioGroups[grp]) radioGroups[grp] = { type: 'radio-group', name: grp, options: [] };
        radioGroups[grp].options.push({
            label: findLabelFor(rb) || rb.value || '',
            value: rb.value || '',
            checked: rb.checked,
            id: rb.id || ''
        });
    }
    result.radioGroups = Object.values(radioGroups);
    result.stats.totalRadioGroups = result.radioGroups.length;

    // Angular Material checkboxes (mat-checkbox)
    const matCheckboxes = document.querySelectorAll('mat-checkbox, [class*="mat-checkbox"]');
    for (const mc of matCheckboxes) {
        if (!isVisible(mc)) continue;
        const label = mc.querySelector('.mat-checkbox-label, .mdc-label, label')?.textContent?.trim()
            || mc.textContent?.trim() || '';
        const isChecked = mc.classList.contains('mat-checkbox-checked')
            || mc.classList.contains('mat-mdc-checkbox-checked')
            || mc.querySelector('input[type="checkbox"]')?.checked || false;
        result.checkboxes.push({
            type: 'mat-checkbox',
            label,
            id: mc.id || mc.querySelector('input')?.id || '',
            checked: isChecked,
            disabled: mc.classList.contains('mat-checkbox-disabled')
        });
        result.stats.totalCheckboxes++;
    }

    // Angular Material slide toggles (mat-slide-toggle)
    const matToggles = document.querySelectorAll('mat-slide-toggle, [class*="mat-slide-toggle"]');
    for (const mt of matToggles) {
        if (!isVisible(mt)) continue;
        const label = mt.querySelector('.mat-slide-toggle-content, .mdc-label, label')?.textContent?.trim()
            || mt.textContent?.trim() || '';
        const isChecked = mt.classList.contains('mat-checked')
            || mt.classList.contains('mat-mdc-slide-toggle-checked')
            || mt.querySelector('input[type="checkbox"]')?.checked || false;
        result.checkboxes.push({
            type: 'mat-slide-toggle',
            label,
            id: mt.id || mt.querySelector('input')?.id || '',
            checked: isChecked,
            disabled: mt.classList.contains('mat-disabled')
        });
        result.stats.totalCheckboxes++;
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

    // ── 3b. PRIORITY TARGET FORCE-OPEN: Ensure key dropdowns are scraped ──
    // Some dropdowns (prefix, suffix, driverLicenseState, relationship) use
    // direct formcontrolname selectors. If the general phase-3 sweep missed them
    // (e.g. label mismatch), force-open each one here by its PRIORITY_SELECTORS entry.
    const priorityKeys = Object.keys(PRIORITY_SELECTORS);
    for (const pKey of priorityKeys) {
        // Check if already captured under any label in result.dropdowns
        const alreadyCaptured = Object.values(result.dropdowns).some(d =>
            d.options && d.options.length > 0 &&
            (d.label || '').toLowerCase().includes(pKey.toLowerCase())
        );
        if (alreadyCaptured) continue;

        const pEl = document.querySelector(PRIORITY_SELECTORS[pKey]);
        if (!pEl || !isVisible(pEl)) continue;

        const pLabel = findLabelFor(pEl) || pKey;
        const pCurrent = pEl.querySelector('.mat-select-value-text, .mat-mdc-select-value-text, [class*="select-value"]')?.textContent?.trim() || '';

        let pOptions = [];
        try {
            pEl.click();
            await wait(350);
            const panelId = pEl.getAttribute('aria-owns') || pEl.getAttribute('aria-controls');
            let optEls = [];
            if (panelId) {
                const panel = document.getElementById(panelId);
                if (panel) optEls = panel.querySelectorAll('mat-option, [role="option"]');
            }
            if (optEls.length === 0) {
                const panes = document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane');
                if (panes.length > 0) optEls = panes[panes.length - 1].querySelectorAll('mat-option, [role="option"]');
            }
            pOptions = Array.from(optEls).map(el => el.textContent.trim()).filter(t => t && !['', 'select', 'select one', '--select--'].includes(t.toLowerCase()));
            await closeDropdown(pEl);
        } catch (e) {
            nukeOverlays();
            await wait(50);
        }

        if (pOptions.length > 0) {
            result.dropdowns[pLabel] = {
                id: pEl.id || '',
                ariaLabel: pEl.getAttribute('aria-label') || '',
                label: pLabel,
                options: pOptions,
                currentValue: pCurrent,
                optionCount: pOptions.length,
                source: 'priority-selector'
            };
            result.stats.totalCustomDropdowns++;
            result.stats.totalOptions += pOptions.length;
            console.log(`[Altech Scraper] Priority target "${pKey}" force-opened: ${pOptions.length} options`);
        }
    }

    // ── 3c. DEPENDENT SEQUENCE: Industry → Occupation (uses existing filler logic) ──
    // Use fillCustomDropdown to set Industry to "Retired", which unlocks Occupation.
    // Scrape both option sets, then restore Industry to blank.
    result.dependentSequence = { industry: null, occupation: null, triggered: false };

    // Helper: returns true if a mat-option is blank / placeholder
    const isBlankOption = (el) => {
        const t = (el.textContent || '').trim();
        if (!t) return true;
        const low = t.toLowerCase();
        return ['', 'select', 'select one', '-- select --', '--select--',
                'choose', 'none', 'select...', '—'].includes(low) || low.length < 2;
    };

    // Try multiple formcontrolname variants, then label-based fallback
    let industryEl = document.querySelector("mat-select[formcontrolname='industry']")
        || document.querySelector("mat-select[formcontrolname='industryCode']")
        || document.querySelector("mat-select[formcontrolname='occupationIndustry']")
        || document.querySelector("mat-select[formcontrolname='occupationIndustryCode']")
        || document.querySelector("mat-select[formcontrolname='applicantIndustry']");

    // Label-based fallback: scan all mat-selects for a matching label via findLabelFor
    if (!industryEl || !isVisible(industryEl)) {
        const industryLabels = BASE_DROPDOWN_LABELS.Industry || ['occupation industry', 'industry'];
        for (const dd of document.querySelectorAll('mat-select')) {
            if (!isVisible(dd)) continue;
            const lbl = (findLabelFor(dd) || '').toLowerCase();
            if (industryLabels.some(l => lbl.includes(l))) {
                industryEl = dd;
                console.log(`[Altech Scraper] Industry found via findLabelFor: "${lbl}"`);
                break;
            }
        }
    }

    // Broader label search: check mat-select placeholder text, trigger text, aria-label,
    // mat-form-field wrapper label, and mat-label inside the wrapper.
    // EZLynx Angular Material may use these instead of standard <label> elements.
    if (!industryEl || !isVisible(industryEl)) {
        const industryPatterns = ['industry'];
        for (const dd of document.querySelectorAll('mat-select')) {
            if (!isVisible(dd)) continue;
            // Check placeholder attribute
            const placeholder = (dd.getAttribute('placeholder') || '').toLowerCase();
            // Check aria-label
            const ariaLabel = (dd.getAttribute('aria-label') || '').toLowerCase();
            // Check aria-labelledby
            let labelledByText = '';
            const ariaLabelledBy = dd.getAttribute('aria-labelledby');
            if (ariaLabelledBy) {
                const lblEl = document.getElementById(ariaLabelledBy);
                labelledByText = (lblEl?.textContent || '').toLowerCase();
            }
            // Check mat-select-placeholder span inside the trigger
            const phSpan = dd.querySelector('.mat-select-placeholder, .mat-mdc-select-placeholder, [class*="select-placeholder"]');
            const phText = (phSpan?.textContent || '').toLowerCase();
            // Check mat-form-field wrapper for mat-label or label
            const formField = dd.closest('mat-form-field, .mat-form-field, .mat-mdc-form-field, [class*="form-field"]');
            let wrapperLabelText = '';
            if (formField) {
                const matLabel = formField.querySelector('mat-label, .mat-form-field-label, .mdc-floating-label, [class*="form-field-label"]');
                wrapperLabelText = (matLabel?.textContent || '').replace(/[*:]/g, '').trim().toLowerCase();
            }

            const allTexts = [placeholder, ariaLabel, labelledByText, phText, wrapperLabelText].filter(t => t);
            if (allTexts.some(t => industryPatterns.some(p => t.includes(p)))) {
                industryEl = dd;
                console.log(`[Altech Scraper] Industry found via broad label search: placeholder="${placeholder}" aria="${ariaLabel}" wrapper="${wrapperLabelText}" ph="${phText}"`);
                break;
            }
        }
    }

    // Try the filler's findDropdownByLabel as another fallback (different DOM traversal)
    if (!industryEl || !isVisible(industryEl)) {
        const fdbResult = findDropdownByLabel(BASE_DROPDOWN_LABELS.Industry || ['occupation industry', 'industry']);
        if (fdbResult && fdbResult.el && isVisible(fdbResult.el)) {
            industryEl = fdbResult.el;
            console.log(`[Altech Scraper] Industry found via findDropdownByLabel (type: ${fdbResult.type})`);
        }
    }

    // Also check native <select> elements for Industry
    if (!industryEl || !isVisible(industryEl)) {
        for (const sel of (DROPDOWN_SELECT_MAP.Industry || [])) {
            const found = document.querySelector(sel);
            if (found && isVisible(found)) {
                console.log('[Altech Scraper] Found Industry as native <select>');
                industryEl = found;
                break;
            }
        }
    }

    // Log what we found (or didn't) — with full diagnostic dump if not found
    if (!industryEl || !isVisible(industryEl)) {
        console.log('[Altech Scraper] Industry dropdown NOT FOUND by any method — dumping all mat-selects for diagnosis:');
        const allMatSelects = document.querySelectorAll('mat-select');
        allMatSelects.forEach((ms, i) => {
            const fcn = ms.getAttribute('formcontrolname') || '';
            const lbl = findLabelFor(ms) || '';
            const ph = ms.getAttribute('placeholder') || '';
            const ariaL = ms.getAttribute('aria-label') || '';
            const vis = isVisible(ms);
            const ff = ms.closest('mat-form-field, .mat-form-field, [class*="form-field"]');
            const wrapLabel = ff?.querySelector('mat-label, .mat-form-field-label, .mdc-floating-label')?.textContent?.trim() || '';
            const triggerText = ms.querySelector('.mat-select-value, .mat-mdc-select-value, [class*="select-value"]')?.textContent?.trim() || '';
            console.log(`  [${i}] fcn="${fcn}" label="${lbl}" wrapper="${wrapLabel}" ph="${ph}" aria="${ariaL}" trigger="${triggerText}" vis=${vis}`);
        });
        console.log('[Altech Scraper] Checking if Occupation is directly accessible...');

        // Direct Occupation check: if Occupation exists and is NOT disabled, scrape it directly
        let directOccEl = document.querySelector("mat-select[formcontrolname='occupation']")
            || document.querySelector("mat-select[formcontrolname='occupationCode']")
            || document.querySelector("mat-select[formcontrolname='occupationTitle']");

        if (!directOccEl || !isVisible(directOccEl)) {
            const occLabels = BASE_DROPDOWN_LABELS.Occupation || ['occupation title', 'occupation'];
            for (const dd of document.querySelectorAll('mat-select')) {
                if (!isVisible(dd)) continue;
                const lbl = (findLabelFor(dd) || '').toLowerCase();
                if (occLabels.some(l => lbl.includes(l))) { directOccEl = dd; break; }
            }
        }

        if (directOccEl && isVisible(directOccEl)) {
            const isDisabled = directOccEl.classList.contains('mat-select-disabled') ||
                directOccEl.classList.contains('mat-mdc-select-disabled') ||
                directOccEl.getAttribute('aria-disabled') === 'true' ||
                directOccEl.hasAttribute('disabled');

            if (!isDisabled) {
                console.log('[Altech Scraper] Occupation is directly accessible (not disabled) — scraping without Industry trigger');
                let occOptions = [];
                try {
                    directOccEl.click();
                    await wait(500);
                    let optEls = Array.from(
                        document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane mat-option, .cdk-overlay-container .cdk-overlay-pane [role="option"]')
                    );
                    occOptions = optEls.filter(el => !isBlankOption(el)).map(el => el.textContent.trim());
                    directOccEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    await wait(200);
                } catch (e) { nukeOverlays(); }

                if (occOptions.length > 0) {
                    const occLabel = findLabelFor(directOccEl) || 'Occupation';
                    result.dropdowns[occLabel] = {
                        id: directOccEl.id || '', label: occLabel,
                        options: occOptions, currentValue: '',
                        optionCount: occOptions.length, source: 'direct-occupation'
                    };
                    result.stats.totalOptions += occOptions.length;
                    console.log(`[Altech Scraper] Direct Occupation: ${occOptions.length} options`);
                }
            } else {
                console.log('[Altech Scraper] Occupation exists but is disabled — needs Industry trigger (not found on page)');
            }
        }
    }

    if (industryEl && isVisible(industryEl)) {
        console.log(`[Altech Scraper] Found Industry dropdown (tag: ${industryEl.tagName}) — single-open: scrape + fill "Retired"...`);

        let industryOptions = [];
        let sequenceFailed = false;
        let filled = false;

        const isNativeSelect = industryEl.tagName === 'SELECT';

        if (isNativeSelect) {
            // ── Native <select> path ──
            industryOptions = Array.from(industryEl.options)
                .filter(o => o.text.trim() && !['', 'select', 'select one', '-- select --'].includes(o.text.trim().toLowerCase()))
                .map(o => o.text.trim());
            console.log(`[Altech Scraper] Industry (native): ${industryOptions.length} options`);

            const retiredOpt = Array.from(industryEl.options).find(o =>
                o.text.toLowerCase().includes('retired') || o.value.toLowerCase().includes('retired')
            );
            if (retiredOpt) {
                industryEl.value = retiredOpt.value;
                industryEl.dispatchEvent(new Event('change', { bubbles: true }));
                filled = true;
                console.log(`[Altech Scraper] Selected "Retired" on native <select>`);
            } else {
                console.warn('[Altech Scraper] "Retired" not in native Industry options');
            }
        } else {
            // ── mat-select path: SINGLE OPEN — scrape + click "Retired" in one go ──
            try {
                // Ensure no stale overlays
                nukeOverlays();
                await wait(200);

                // Open the dropdown
                industryEl.click();
                await wait(1000);

                // Collect options from overlay
                let allOptEls = Array.from(
                    document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane mat-option, .cdk-overlay-container .cdk-overlay-pane [role="option"]')
                );

                // Fallback: try panel by aria-owns/controls
                if (allOptEls.length === 0) {
                    const panelId = industryEl.getAttribute('aria-owns') || industryEl.getAttribute('aria-controls');
                    if (panelId) {
                        const panel = document.getElementById(panelId);
                        if (panel) allOptEls = Array.from(panel.querySelectorAll('mat-option, [role="option"]'));
                    }
                }

                // Fallback: try mat-select-panel class
                if (allOptEls.length === 0) {
                    allOptEls = Array.from(document.querySelectorAll('.mat-select-panel mat-option, .mat-mdc-select-panel mat-option'));
                }

                // Fallback: broader overlay scan (any mat-option anywhere in overlays)
                if (allOptEls.length === 0) {
                    allOptEls = Array.from(document.querySelectorAll('.cdk-overlay-container mat-option'));
                }

                // If still 0, try dispatching a second click and waiting longer
                if (allOptEls.length === 0) {
                    console.log('[Altech Scraper] Industry: 0 options on first try — retrying with focus+click...');
                    industryEl.focus();
                    industryEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    industryEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    industryEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    await wait(1200);
                    allOptEls = Array.from(
                        document.querySelectorAll('.cdk-overlay-container mat-option, .mat-select-panel mat-option, .mat-mdc-select-panel mat-option, [role="option"]')
                    ).filter(el => isVisible(el));
                }

                industryOptions = allOptEls
                    .filter(el => !isBlankOption(el))
                    .map(el => el.textContent.trim());

                console.log(`[Altech Scraper] Industry: ${allOptEls.length} total option elements, ${industryOptions.length} valid. First 5: ${industryOptions.slice(0, 5).join(', ')}`);

                // Find "Retired" and click it IN THE SAME OVERLAY (no close/reopen)
                let retiredEl = allOptEls.find(el => (el.textContent || '').trim().toLowerCase() === 'retired');
                if (!retiredEl) {
                    retiredEl = allOptEls.find(el => (el.textContent || '').trim().toLowerCase().includes('retired'));
                }

                if (retiredEl) {
                    retiredEl.click();
                    await wait(400);
                    filled = true;
                    console.log(`[Altech Scraper] Clicked "Retired": "${(retiredEl.textContent || '').trim()}"`);
                } else if (allOptEls.length > 0) {
                    // "Retired" not found — pick any non-blank option to trigger Occupation
                    const fallbackOpt = allOptEls.find(el => !isBlankOption(el));
                    if (fallbackOpt) {
                        fallbackOpt.click();
                        await wait(400);
                        filled = true;
                        console.log(`[Altech Scraper] "Retired" not found — used fallback: "${(fallbackOpt.textContent || '').trim()}"`);
                    }
                } else {
                    console.warn(`[Altech Scraper] Industry overlay has 0 options — overlay may not have opened`);
                    industryEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    await wait(200);
                }
            } catch (e) {
                console.warn('[Altech Scraper] Industry open/fill failed:', e.message);
                nukeOverlays();
            }
        }

        if (!filled) {
            console.warn('[Altech Scraper] Industry fill failed — aborting dependent sequence');
            sequenceFailed = true;
        }

        result.dependentSequence.industry = {
            options: industryOptions,
            optionCount: industryOptions.length,
            triggerValue: filled ? 'Retired' : null
        };

        const industryLabel = findLabelFor(industryEl) || 'Industry';
        result.dropdowns[industryLabel] = {
            ...(result.dropdowns[industryLabel] || {}),
            id: industryEl.id || '',
            label: industryLabel,
            options: industryOptions,
            optionCount: industryOptions.length,
            currentValue: ''
        };

        if (filled && !sequenceFailed) {
            // 3. Wait for backend to unlock Occupation via XHR
            await wait(1500);

            // 4. Force-open Occupation and scrape its options
            let occupationEl = document.querySelector("mat-select[formcontrolname='occupation']")
                || document.querySelector("mat-select[formcontrolname='occupationCode']")
                || document.querySelector("mat-select[formcontrolname='occupationTitle']")
                || document.querySelector("mat-select[formcontrolname='applicantOccupation']");

            // Label-based fallback for Occupation via findLabelFor
            if (!occupationEl || !isVisible(occupationEl)) {
                const occLabels = BASE_DROPDOWN_LABELS.Occupation || ['occupation title', 'occupation'];
                for (const dd of document.querySelectorAll('mat-select')) {
                    if (!isVisible(dd)) continue;
                    if (dd === industryEl) continue; // Skip the Industry element itself
                    const lbl = (findLabelFor(dd) || '').toLowerCase();
                    if (occLabels.some(l => lbl.includes(l))) {
                        occupationEl = dd;
                        break;
                    }
                }
            }

            // Broader label search: aria-label, wrapper label, placeholder
            if (!occupationEl || !isVisible(occupationEl)) {
                const occPatterns = ['occupation'];
                for (const dd of document.querySelectorAll('mat-select')) {
                    if (!isVisible(dd)) continue;
                    if (dd === industryEl) continue;
                    const ariaLabel = (dd.getAttribute('aria-label') || '').toLowerCase();
                    const ph = (dd.getAttribute('placeholder') || '').toLowerCase();
                    const ff = dd.closest('mat-form-field, .mat-form-field, .mat-mdc-form-field, [class*="form-field"]');
                    const wrapLabel = ff?.querySelector('mat-label, .mat-form-field-label, .mdc-floating-label')?.textContent?.trim()?.toLowerCase() || '';
                    let lblById = '';
                    const alby = dd.getAttribute('aria-labelledby');
                    if (alby) { lblById = (document.getElementById(alby)?.textContent || '').toLowerCase(); }
                    const allTexts = [ariaLabel, ph, wrapLabel, lblById].filter(t => t);
                    if (allTexts.some(t => occPatterns.some(p => t.includes(p)))) {
                        occupationEl = dd;
                        console.log(`[Altech Scraper] Occupation found via broad search after Industry trigger`);
                        break;
                    }
                }
            }

            // Check if Occupation is still disabled (needs more wait time)
            if (occupationEl && isVisible(occupationEl)) {
                const isDisabled = occupationEl.classList.contains('mat-select-disabled') ||
                    occupationEl.classList.contains('mat-mdc-select-disabled') ||
                    occupationEl.getAttribute('aria-disabled') === 'true' ||
                    occupationEl.hasAttribute('disabled');
                if (isDisabled) {
                    console.log('[Altech Scraper] Occupation still disabled after 1.5s — waiting 2s more...');
                    await wait(2000);
                }
            }

            if (occupationEl && isVisible(occupationEl)) {
                let occOptions = [];
                try {
                    occupationEl.click();
                    await wait(800);

                    let occOptEls = Array.from(
                        document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane mat-option, .cdk-overlay-container .cdk-overlay-pane [role="option"]')
                    );
                    if (occOptEls.length === 0) {
                        const panelId = occupationEl.getAttribute('aria-owns') || occupationEl.getAttribute('aria-controls');
                        if (panelId) {
                            const panel = document.getElementById(panelId);
                            if (panel) occOptEls = Array.from(panel.querySelectorAll('mat-option, [role="option"]'));
                        }
                    }

                    occOptions = occOptEls
                        .filter(el => !isBlankOption(el))
                        .map(el => el.textContent.trim());

                    console.log(`[Altech Scraper] Occupation: ${occOptEls.length} total, ${occOptions.length} valid options`);

                    // Close Occupation overlay
                    occupationEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    await wait(200);
                } catch (e) {
                    console.warn('[Altech Scraper] Occupation open/scrape failed:', e.message);
                    nukeOverlays();
                }

                result.dependentSequence.occupation = {
                    options: occOptions,
                    optionCount: occOptions.length,
                    dependsOn: 'Industry',
                    triggerValue: 'Retired'
                };

                const occLabel = findLabelFor(occupationEl) || 'Occupation';
                result.dropdowns[occLabel] = {
                    ...(result.dropdowns[occLabel] || {}),
                    id: occupationEl.id || '',
                    label: occLabel,
                    options: occOptions,
                    optionCount: occOptions.length,
                    currentValue: '',
                    dependsOn: 'Industry'
                };
                result.stats.totalOptions += occOptions.length;
            } else {
                console.warn('[Altech Scraper] Occupation mat-select not found after Industry trigger');
            }

            // 5. Restore Industry — re-open and click the empty/null first option
            nukeOverlays();
            await wait(100);
            try {
                industryEl.click();
                await wait(800);
                const restoreOpts = Array.from(
                    document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane mat-option, .cdk-overlay-container .cdk-overlay-pane [role="option"]')
                );
                if (restoreOpts.length > 0) {
                    restoreOpts[0].click();   // First option = blank/null placeholder
                    console.log('[Altech Scraper] Restored Industry to first (blank) option');
                    await wait(200);
                } else {
                    industryEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    await wait(100);
                }
            } catch (e) {
                industryEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }
        }

        nukeOverlays();
        await wait(200);
        result.dependentSequence.triggered = !sequenceFailed;

        console.log(`[Altech Scraper] Dependent sequence: Industry (${industryOptions.length} opts) → Occupation (${result.dependentSequence.occupation?.optionCount || 0} opts)`);
    } else {
        console.log('[Altech Scraper] Industry dropdown not found — skipping dependent sequence');
    }

    // ── 3d. CASCADE SEQUENCES — fill parent dropdowns to unlock greyed-out children ──
    // On the home page (and some auto pages), certain dropdowns are disabled until
    // a parent dropdown is selected first.  We fill the parent with a representative
    // trigger value, wait for the child to become enabled, scrape the child's options,
    // then restore the parent to blank.

    const CASCADE_DEFS = [
        // ── Home page cascades ──
        {
            name: 'Garage Type → Garage Spaces',
            pages: ['home-dwelling', 'home-coverage'],
            parentFormControlNames: ['garageType', 'garageStyle'],
            parentLabels: HOME_DROPDOWN_LABELS.GarageType,
            triggerValue: 'Attached',
            childFormControlNames: ['garageStalls', 'numberOfGarageStalls', 'garageSpaces', 'numGarageStalls', 'numOfGarageStalls'],
            childLabels: HOME_DROPDOWN_LABELS.GarageSpaces,
            childKey: 'Garage Spaces',
            waitMs: 900
        },
        {
            name: 'Dwelling Type → Number of Stories',
            pages: ['home-dwelling', 'home-coverage'],
            parentFormControlNames: ['dwellingType', 'dwellingStyle', 'dwelling'],
            parentLabels: HOME_DROPDOWN_LABELS.DwellingType,
            triggerValue: 'One Family',
            childFormControlNames: ['numberOfStories', 'numStories', 'stories', 'numOfStories', 'storyType'],
            childLabels: HOME_DROPDOWN_LABELS.NumStories,
            childKey: 'Number of Stories',
            waitMs: 900
        },
        {
            name: 'Dwelling Type → Construction Style',
            pages: ['home-dwelling', 'home-coverage'],
            parentFormControlNames: ['dwellingType', 'dwellingStyle', 'dwelling'],
            parentLabels: HOME_DROPDOWN_LABELS.DwellingType,
            triggerValue: 'One Family',
            childFormControlNames: ['constructionStyle', 'styleOfHome', 'homeStyle', 'architecturalStyle', 'constructionType'],
            childLabels: HOME_DROPDOWN_LABELS.ConstructionStyle,
            childKey: 'Construction Style',
            waitMs: 900
        },
        {
            name: 'Roof Type → Roof Design',
            pages: ['home-dwelling', 'home-coverage'],
            parentFormControlNames: ['roofType', 'roofMaterial', 'roofingMaterial'],
            parentLabels: HOME_DROPDOWN_LABELS.RoofType,
            triggerValue: 'Asphalt shingles',
            childFormControlNames: ['roofShape', 'roofDesign', 'roofStyle'],
            childLabels: HOME_DROPDOWN_LABELS.RoofDesign,
            childKey: 'Roof Design',
            waitMs: 800
        },
        // ── Applicant page cascades ──
        {
            // Our arch-nemesis: Industry unlocks Occupation via XHR.
            // §3c handles this with dedicated logic, but this entry acts as a
            // safety-net fallback for any page where §3c didn't fire or failed.
            name: 'Industry → Occupation',
            pages: ['applicant', 'lead-info', 'ezlynx', 'unknown'],
            parentFormControlNames: ['industry'],
            parentLabels: BASE_DROPDOWN_LABELS.Industry,
            triggerValue: 'Retired',
            childFormControlNames: ['occupation'],
            childLabels: BASE_DROPDOWN_LABELS.Occupation,
            childKey: 'Occupation',
            waitMs: 1500  // XHR round-trip — needs more time than local Angular changes
        },
        // ── Auto page cascades ──
        {
            name: 'Vehicle Year → Vehicle Make',
            pages: ['auto-vehicle'],
            parentFormControlNames: ['year', 'vehicleYear', 'modelYear'],
            parentLabels: AUTO_DROPDOWN_LABELS.VehicleYear || ['year'],
            triggerValue: '2020',
            childFormControlNames: ['make', 'vehicleMake'],
            childLabels: ['make', 'vehicle make'],
            childKey: 'Vehicle Make',
            waitMs: 1200
        },
    ];

    // Helper: find a mat-select by ordered list of formcontrolname values
    const findDropdownByFormControl = (names) => {
        for (const name of names) {
            const el = document.querySelector(`mat-select[formcontrolname='${name}']`);
            if (el && isVisible(el)) return el;
        }
        return null;
    };

    // Helper: find a mat-select by label match
    const findDropdownByLabel = (labels) => {
        for (const dd of document.querySelectorAll('mat-select')) {
            if (!isVisible(dd)) continue;
            const lbl = (findLabelFor(dd) || '').toLowerCase();
            if (labels.some(l => lbl.includes(l.toLowerCase()) || l.toLowerCase().includes(lbl))) return dd;
        }
        return null;
    };

    // Helper: check if a mat-select is disabled (greyed out)
    const isMatSelectDisabled = (el) => {
        if (!el) return true;
        return el.classList.contains('mat-select-disabled') ||
               el.classList.contains('mat-mdc-select-disabled') ||
               el.getAttribute('aria-disabled') === 'true' ||
               el.hasAttribute('disabled');
    };

    // Helper: open a mat-select and collect its option texts
    const scrapeDropdownOptions = async (el) => {
        let options = [];
        try {
            el.click();
            await wait(500);
            const panelId = el.getAttribute('aria-owns') || el.getAttribute('aria-controls');
            let optEls = [];
            if (panelId) {
                const panel = document.getElementById(panelId);
                if (panel) optEls = panel.querySelectorAll('mat-option, [role="option"]');
            }
            if (optEls.length === 0) {
                const panes = document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane');
                if (panes.length > 0) optEls = panes[panes.length - 1].querySelectorAll('mat-option, [role="option"]');
            }
            options = Array.from(optEls)
                .map(e => e.textContent.trim())
                .filter(t => t && !['', 'select', 'select one', '--select--'].includes(t.toLowerCase()));
            await closeDropdown(el);
        } catch (e) {
            nukeOverlays();
            await wait(50);
        }
        return options;
    };

    // Track parents already filled so we only trigger each parent once
    // (multiple children may share the same parent, e.g. DwellingType → Stories + Style)
    const cascadeParentsFilled = new Set();

    for (const seq of CASCADE_DEFS) {
        // Only run sequences relevant to the current page
        if (seq.pages && seq.pages.length > 0 && !seq.pages.includes(page)) continue;

        // Skip if an earlier dedicated sequence (e.g. §3c Industry→Occupation) already
        // captured this child's options — avoid redundant XHR-triggering fills.
        // Guard: exclude dropdowns whose label ALSO matches a parent label to prevent
        // false positives (e.g. "Occupation Industry" label contains "occupation" but
        // is the parent, not the child).
        const childAlreadyCaptured = Object.values(result.dropdowns).some(d => {
            if (!d.options || d.options.length === 0) return false;
            const lbl = (d.label || '').toLowerCase();
            const matchesChild = seq.childLabels.some(l => lbl.includes(l.toLowerCase()));
            if (!matchesChild) return false;
            const matchesParent = seq.parentLabels.some(l => lbl.includes(l.toLowerCase()));
            return !matchesParent;  // Only count as captured if NOT also a parent match
        });
        if (childAlreadyCaptured) {
            console.log(`[Altech Cascade] "${seq.name}" — child already captured by earlier sequence, skipping`);
            continue;
        }

        const parentEl = findDropdownByFormControl(seq.parentFormControlNames)
                      || findDropdownByLabel(seq.parentLabels);
        if (!parentEl) {
            console.log(`[Altech Cascade] "${seq.name}" — parent not found, skipping`);
            continue;
        }

        const childEl = findDropdownByFormControl(seq.childFormControlNames)
                     || findDropdownByLabel(seq.childLabels);
        if (!childEl) {
            console.log(`[Altech Cascade] "${seq.name}" — child not found, skipping`);
            continue;
        }

        // If child is already enabled, its options were captured in §3 — no cascade needed
        if (!isMatSelectDisabled(childEl)) {
            console.log(`[Altech Cascade] "${seq.name}" — child already enabled, skipping cascade`);
            continue;
        }

        // Fill parent if we haven't already (handles multi-child parents)
        const parentId = parentEl.getAttribute('formcontrolname') || parentEl.id || seq.name;
        if (!cascadeParentsFilled.has(parentId)) {
            console.log(`[Altech Cascade] "${seq.name}" — filling parent with "${seq.triggerValue}"...`);
            const filled = await fillCustomDropdown(seq.parentLabels, seq.triggerValue, seq.name.split('→')[0].trim());
            if (!filled) {
                console.warn(`[Altech Cascade] "${seq.name}" — parent fill failed, skipping`);
                result.cascadeSequences.push({ name: seq.name, status: 'parent-fill-failed' });
                continue;
            }
            cascadeParentsFilled.add(parentId);
            await wait(seq.waitMs);
        } else {
            // Parent was already set by an earlier cascade for this parent — give it a moment
            await wait(300);
        }

        // Re-query child after parent was filled — it should now be enabled
        const unlockedChild = findDropdownByFormControl(seq.childFormControlNames)
                           || findDropdownByLabel(seq.childLabels);

        if (!unlockedChild || isMatSelectDisabled(unlockedChild)) {
            console.warn(`[Altech Cascade] "${seq.name}" — child still disabled after parent fill`);
            result.cascadeSequences.push({ name: seq.name, status: 'child-still-disabled' });
            continue;
        }

        // Scrape the now-enabled child
        const childOptions = await scrapeDropdownOptions(unlockedChild);
        const childLabel = findLabelFor(unlockedChild) || seq.childKey;

        // Store/overwrite in result.dropdowns (child may have had 0 options from §3)
        result.dropdowns[childLabel] = {
            id: unlockedChild.id || '',
            ariaLabel: unlockedChild.getAttribute('aria-label') || '',
            label: childLabel,
            options: childOptions,
            currentValue: '',
            optionCount: childOptions.length,
            source: 'cascade-scrape',
            unlockedBy: seq.name
        };
        result.stats.totalOptions += childOptions.length;

        result.cascadeSequences.push({
            name: seq.name,
            status: 'success',
            parentTrigger: seq.triggerValue,
            childKey: childLabel,
            optionsScraped: childOptions.length
        });

        console.log(`[Altech Cascade] "${seq.name}" — scraped ${childOptions.length} options from "${childLabel}"`);
    }

    // Restore all cascade-filled parent dropdowns back to blank
    if (cascadeParentsFilled.size > 0) {
        // Deduplicate: only restore each unique parent once
        const restoredIds = new Set();
        for (const seq of CASCADE_DEFS) {
            const parentEl = findDropdownByFormControl(seq.parentFormControlNames)
                          || findDropdownByLabel(seq.parentLabels);
            if (!parentEl) continue;
            const parentId = parentEl.getAttribute('formcontrolname') || parentEl.id || seq.name;
            if (!cascadeParentsFilled.has(parentId) || restoredIds.has(parentId)) continue;
            restoredIds.add(parentId);

            nukeOverlays();
            await wait(100);
            try {
                parentEl.click();
                await wait(700);
                const allOpts = Array.from(
                    document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane mat-option, .cdk-overlay-container .cdk-overlay-pane [role="option"]')
                );
                if (allOpts.length > 0) {
                    const blankOpt = allOpts.find(o => isBlankOption(o)) || allOpts[0];
                    blankOpt.click();
                    await wait(300);
                    console.log(`[Altech Cascade] Restored parent for "${seq.name}" to blank`);
                } else {
                    parentEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    await wait(100);
                }
            } catch (e) {
                nukeOverlays();
            }
        }
    }

    nukeOverlays();
    await wait(200);
    const cascadeSuccess = result.cascadeSequences.filter(s => s.status === 'success').length;
    console.log(`[Altech Cascade] ${result.cascadeSequences.length} sequence(s) processed, ${cascadeSuccess} successful`);

    // ── 4. DEEP SCRAPE: Toggle inactive controls to reveal hidden fields ──
    // Click every inactive toggle/checkbox, wait for Angular to render,
    // scrape newly revealed fields, then restore the original state.
    result.deepScrape = { revealedFields: [], togglesExpanded: 0 };

    // Collect all inactive toggles and checkboxes
    const inactiveToggles = [];

    // mat-slide-toggles that are OFF
    for (const toggle of document.querySelectorAll('mat-slide-toggle, [class*="mat-slide-toggle"]')) {
        if (!isVisible(toggle)) continue;
        if (toggle.classList.contains('mat-disabled')) continue;
        const isChecked = toggle.classList.contains('mat-checked') ||
                          toggle.classList.contains('mat-mdc-slide-toggle-checked') ||
                          toggle.querySelector('input[type="checkbox"]')?.checked || false;
        if (!isChecked) {
            const label = toggle.querySelector('.mat-slide-toggle-content, .mdc-label, label')?.textContent?.trim()
                || toggle.textContent?.trim() || '';
            inactiveToggles.push({ element: toggle, type: 'mat-slide-toggle', label });
        }
    }

    // mat-checkboxes that are OFF
    for (const cb of document.querySelectorAll('mat-checkbox, [class*="mat-checkbox"]')) {
        if (!isVisible(cb)) continue;
        if (cb.classList.contains('mat-checkbox-disabled')) continue;
        const isChecked = cb.classList.contains('mat-checkbox-checked') ||
                          cb.classList.contains('mat-mdc-checkbox-checked') ||
                          cb.querySelector('input[type="checkbox"]')?.checked || false;
        if (!isChecked) {
            const label = cb.querySelector('.mat-checkbox-label, .mdc-label, label')?.textContent?.trim()
                || cb.textContent?.trim() || '';
            inactiveToggles.push({ element: cb, type: 'mat-checkbox', label });
        }
    }

    // mat-radio-button groups — find "Yes" options that are not selected
    const processedRadioGroups = new Set();
    for (const lbl of document.querySelectorAll('label, legend, [class*="label"]')) {
        const container = lbl.closest(
            '.mat-form-field, fieldset, .form-group, [class*="form-field"], ' +
            '[class*="form-group"], .field-wrapper, .col, [class*="col-"]'
        ) || lbl.parentElement;
        if (!container) continue;
        // Avoid processing the same container twice
        if (processedRadioGroups.has(container)) continue;

        const radios = container.querySelectorAll('mat-radio-button, [class*="mat-radio-button"]');
        if (radios.length < 2) continue;
        processedRadioGroups.add(container);

        // Find "Yes" radio that is NOT currently selected
        for (const radio of radios) {
            const radioText = (radio.textContent || '').trim().toLowerCase();
            if (radioText === 'yes' || radioText.includes('yes')) {
                const isActive = radio.classList.contains('mat-radio-checked') ||
                                 radio.classList.contains('mat-mdc-radio-checked');
                if (!isActive) {
                    const groupLabel = lbl.textContent?.replace(/[*:]/g, '').trim() || '';
                    inactiveToggles.push({ element: radio, type: 'mat-radio-button', label: groupLabel });
                }
                break;
            }
        }
    }

    console.log(`[Altech Deep Scrape] Found ${inactiveToggles.length} inactive toggles to expand`);

    // Snapshot existing field IDs/names before expansion
    const existingFieldIds = new Set();
    document.querySelectorAll('input, select, textarea, mat-select').forEach(el => {
        if (el.id) existingFieldIds.add(el.id);
        if (el.name) existingFieldIds.add(el.name);
    });

    // Click each inactive toggle, scrape new fields, then click back
    for (const item of inactiveToggles) {
        try {
            // Click to activate
            const input = item.element.querySelector('input[type="checkbox"], input[type="radio"]');
            if (input) input.click();
            else item.element.click();

            await wait(500); // Let Angular render

            // Scrape any newly-appeared fields
            const newInputs = document.querySelectorAll('input, textarea');
            for (const inp of newInputs) {
                if (!isVisible(inp)) continue;
                if (['hidden', 'submit', 'button', 'reset', 'file', 'checkbox', 'radio'].includes(inp.type)) continue;
                if (inp.id && existingFieldIds.has(inp.id)) continue;
                if (inp.name && existingFieldIds.has(inp.name)) continue;

                const fieldLabel = findLabelFor(inp);
                result.deepScrape.revealedFields.push({
                    revealedBy: item.label,
                    type: inp.type || 'text',
                    name: inp.name || '',
                    id: inp.id || '',
                    label: fieldLabel || '',
                    placeholder: inp.placeholder || '',
                    required: inp.required || inp.getAttribute('aria-required') === 'true'
                });
                // Track so we don't re-add
                if (inp.id) existingFieldIds.add(inp.id);
                if (inp.name) existingFieldIds.add(inp.name);
            }

            // Also scrape any new dropdowns (native + Angular Material)
            const newSelects = document.querySelectorAll('select');
            for (const sel of newSelects) {
                if (!isVisible(sel)) continue;
                const selKey = sel.name || sel.id;
                if (selKey && existingFieldIds.has(selKey)) continue;

                const selLabel = findLabelFor(sel);
                const options = Array.from(sel.options)
                    .map(o => o.text.trim())
                    .filter(t => t && !['', 'select', 'select one', '-- select --', '--select--', 'choose'].includes(t.toLowerCase()));

                if (options.length > 0) {
                    const key = selLabel || selKey || `revealed_select_${result.deepScrape.revealedFields.length}`;
                    result.nativeSelects[key] = {
                        name: sel.name || '', id: sel.id || '', label: selLabel || '',
                        options, currentValue: '', required: sel.required,
                        revealedBy: item.label
                    };
                    result.stats.totalNativeSelects++;
                    result.stats.totalOptions += options.length;
                }
                if (sel.id) existingFieldIds.add(sel.id);
                if (sel.name) existingFieldIds.add(sel.name);
            }

            const newMatSelects = document.querySelectorAll('mat-select, [role="listbox"], [role="combobox"]');
            for (const ms of newMatSelects) {
                if (!isVisible(ms)) continue;
                const msKey = ms.id || ms.getAttribute('aria-label');
                if (msKey && existingFieldIds.has(msKey)) continue;

                const msLabel = findLabelFor(ms);
                result.deepScrape.revealedFields.push({
                    revealedBy: item.label,
                    type: 'mat-select',
                    id: ms.id || '',
                    label: msLabel || '',
                    ariaLabel: ms.getAttribute('aria-label') || ''
                });
                if (ms.id) existingFieldIds.add(ms.id);
            }

            result.deepScrape.togglesExpanded++;

            // Click back to restore original state
            if (item.type === 'mat-radio-button') {
                // For radios, find and click the "No" or first non-Yes option to deselect
                const container = item.element.closest(
                    '.mat-form-field, fieldset, .form-group, [class*="form-field"], ' +
                    '[class*="form-group"], .field-wrapper, .col, [class*="col-"]'
                ) || item.element.parentElement;
                if (container) {
                    const radios = container.querySelectorAll('mat-radio-button, [class*="mat-radio-button"]');
                    for (const radio of radios) {
                        const radioText = (radio.textContent || '').trim().toLowerCase();
                        if (radioText === 'no' || radioText.includes('no')) {
                            const noInput = radio.querySelector('input[type="radio"]');
                            if (noInput) noInput.click();
                            else radio.click();
                            break;
                        }
                    }
                }
            } else {
                // Toggles/checkboxes: click again to deactivate
                if (input) input.click();
                else item.element.click();
            }

            await wait(300); // Let Angular tear down the section

        } catch (e) {
            console.warn(`[Altech Deep Scrape] Error expanding toggle "${item.label}":`, e.message);
        }
    }

    result.stats.deepScrapeToggles = inactiveToggles.length;
    result.stats.deepScrapeRevealed = result.deepScrape.revealedFields.length;
    console.log(`[Altech Deep Scrape] Expanded ${result.deepScrape.togglesExpanded} toggles, found ${result.deepScrape.revealedFields.length} hidden fields`);

    // ── 5. PRIOR ADDRESS REVEAL: Primary Applicant only ──
    // Years At Address can be a text <input>, a <mat-select>, or a native <select>.
    // We detect the element type, set a low value to trigger the Prior Address section,
    // scrape newly revealed fields, then restore the original state.
    result.priorAddressReveal = { triggered: false, revealedFields: [] };

    // ── 5a. Find Years At Address element (input → mat-select → native select) ──
    let yaElement = null;
    let yaType = null; // 'input' | 'mat-select' | 'native-select'

    // Try text input first
    const yaInput = document.querySelector(
        "input[formcontrolname='yearsAtAddress'], " +
        "input[formcontrolname='yearsAtCurrentAddress'], " +
        "input[name*='YearsAtAddress' i], " +
        "input[name*='yearsAt' i], " +
        "input[id*='yearsAtAddress' i]"
    );
    if (yaInput && isVisible(yaInput)) {
        yaElement = yaInput;
        yaType = 'input';
    }

    // Try mat-select
    if (!yaElement) {
        let yaMat = document.querySelector("mat-select[formcontrolname='yearsAtAddress']")
            || document.querySelector("mat-select[formcontrolname='yearsAtCurrentAddress']")
            || document.querySelector("mat-select[formcontrolname='yearsAtCurrentRes']")
            || document.querySelector("mat-select[formcontrolname='yearsAt']");

        // Label-based fallback for mat-select
        if (!yaMat || !isVisible(yaMat)) {
            const yaLabels = BASE_DROPDOWN_LABELS.YearsAtAddress || ['years at address'];
            for (const dd of document.querySelectorAll('mat-select')) {
                if (!isVisible(dd)) continue;
                const lbl = (findLabelFor(dd) || '').toLowerCase();
                if (yaLabels.some(l => lbl.includes(l))) { yaMat = dd; break; }
            }
        }

        // Broader label search: also check aria-label and placeholder text
        if (!yaMat || !isVisible(yaMat)) {
            for (const dd of document.querySelectorAll('mat-select')) {
                if (!isVisible(dd)) continue;
                const ariaLabel = (dd.getAttribute('aria-label') || '').toLowerCase();
                const ariaLabelledBy = dd.getAttribute('aria-labelledby');
                let labelledByText = '';
                if (ariaLabelledBy) {
                    const lblEl = document.getElementById(ariaLabelledBy);
                    labelledByText = (lblEl?.textContent || '').toLowerCase();
                }
                if (ariaLabel.includes('years at address') || labelledByText.includes('years at address') ||
                    ariaLabel.includes('years at current') || labelledByText.includes('years at current')) {
                    yaMat = dd;
                    break;
                }
            }
        }

        if (yaMat && isVisible(yaMat)) {
            yaElement = yaMat;
            yaType = 'mat-select';
        }
    }

    // Try native select
    if (!yaElement) {
        for (const sel of (DROPDOWN_SELECT_MAP.YearsAtAddress || [])) {
            const found = document.querySelector(sel);
            if (found && isVisible(found)) { yaElement = found; yaType = 'native-select'; break; }
        }
    }

    if (yaElement) {
        let originalYearsValue = '';
        console.log(`[Altech Scraper] Found Primary Years At Address (${yaType})`);

        // Snapshot current fields before injection
        const prePriorFields = new Set();
        document.querySelectorAll('input, select, textarea, mat-select').forEach(el => {
            if (el.id) prePriorFields.add(el.id);
            if (el.name) prePriorFields.add(el.name);
        });

        // ── 5b. Set a low value to trigger Prior Address reveal ──
        if (yaType === 'input') {
            originalYearsValue = yaElement.value || '';
            console.log(`[Altech Scraper] Years At Address input, original: "${originalYearsValue}". Injecting "1"...`);
            setInputValue(yaElement, '1');
        } else if (yaType === 'mat-select') {
            originalYearsValue = yaElement.querySelector('.mat-select-value-text, .mat-mdc-select-value-text, [class*="select-value"]')?.textContent?.trim() || '';
            console.log(`[Altech Scraper] Years At Address mat-select, original: "${originalYearsValue}". Selecting low value...`);
            try {
                yaElement.click();
                await wait(500);
                const yaOptEls = Array.from(
                    document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane mat-option, .cdk-overlay-container .cdk-overlay-pane [role="option"]')
                );
                // Find a low-value option: "0", "1", "Less than 1", etc.
                const lowOption = yaOptEls.find(o => {
                    const t = (o.textContent || '').trim().toLowerCase();
                    return ['0', '1', 'less than 1', '< 1', 'less than 3', '0-2'].some(v => t === v || t.startsWith(v));
                }) || yaOptEls.find(o => /^[0-2]$/.test((o.textContent || '').trim()));
                if (lowOption) {
                    lowOption.click();
                    await wait(200);
                    console.log(`[Altech Scraper] Selected low option: "${(lowOption.textContent || '').trim()}"`);
                } else if (yaOptEls.length > 1) {
                    yaOptEls[1].click(); // Second option (first is usually blank/placeholder)
                    await wait(200);
                    console.log('[Altech Scraper] Selected second option as fallback');
                } else {
                    yaElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    await wait(100);
                }
            } catch (e) {
                console.warn('[Altech Scraper] Years At Address mat-select open failed:', e.message);
                nukeOverlays();
            }
        } else if (yaType === 'native-select') {
            originalYearsValue = yaElement.value;
            const lowOpt = Array.from(yaElement.options).find(o => /^[0-2]$/.test(o.value.trim()) || o.text.toLowerCase().includes('less'));
            if (lowOpt) {
                yaElement.value = lowOpt.value;
            } else if (yaElement.options.length > 1) {
                yaElement.value = yaElement.options[1].value;
            }
            yaElement.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`[Altech Scraper] Years At Address native select, original: "${originalYearsValue}"`);
        }

        // Wait for Angular to render the Previous Address section
        await wait(1000);

        // baseScrape: capture newly revealed fields
        const priorSection = document.querySelector(
            '[class*="prior-address" i], [class*="previous-address" i], ' +
            '[class*="priorAddress" i], [class*="previousAddress" i], ' +
            '[data-section*="prior" i], [data-section*="previous" i]'
        );

        let foundPriorFields = false;

        // Scrape new text inputs
        for (const inp of document.querySelectorAll('input, textarea')) {
            if (!isVisible(inp)) continue;
            if (['hidden', 'submit', 'button', 'reset', 'file', 'checkbox', 'radio'].includes(inp.type)) continue;
            if (inp.id && prePriorFields.has(inp.id)) continue;
            if (inp.name && prePriorFields.has(inp.name)) continue;

            const fieldLabel = findLabelFor(inp);
            result.priorAddressReveal.revealedFields.push({
                revealedBy: 'Years At Address = 1',
                type: inp.type || 'text',
                name: inp.name || '', id: inp.id || '',
                label: fieldLabel || '', placeholder: inp.placeholder || '',
                required: inp.required || inp.getAttribute('aria-required') === 'true'
            });
            result.textFields.push({
                type: inp.type || 'text', name: inp.name || '', id: inp.id || '',
                placeholder: inp.placeholder || '', label: fieldLabel || '',
                value: '', required: inp.required || inp.getAttribute('aria-required') === 'true',
                source: 'prior-address-reveal'
            });
            result.stats.totalInputs++;
            foundPriorFields = true;
            if (inp.id) prePriorFields.add(inp.id);
            if (inp.name) prePriorFields.add(inp.name);
        }

        // Scrape new native selects
        for (const sel of document.querySelectorAll('select')) {
            if (!isVisible(sel)) continue;
            const selKey = sel.name || sel.id;
            if (selKey && prePriorFields.has(selKey)) continue;

            const selLabel = findLabelFor(sel);
            const options = Array.from(sel.options)
                .map(o => o.text.trim())
                .filter(t => t && !['', 'select', 'select one', '-- select --', '--select--', 'choose'].includes(t.toLowerCase()));

            if (options.length > 0) {
                const key = selLabel || selKey || `prior_select_${result.priorAddressReveal.revealedFields.length}`;
                result.nativeSelects[key] = {
                    name: sel.name || '', id: sel.id || '', label: selLabel || '',
                    options, currentValue: '', required: sel.required,
                    revealedBy: 'Years At Address = 1'
                };
                result.stats.totalNativeSelects++;
                result.stats.totalOptions += options.length;
            }
            result.priorAddressReveal.revealedFields.push({
                revealedBy: 'Years At Address = 1', type: 'select',
                name: sel.name || '', id: sel.id || '', label: selLabel || ''
            });
            foundPriorFields = true;
            if (sel.id) prePriorFields.add(sel.id);
            if (sel.name) prePriorFields.add(sel.name);
        }

        // Scrape new mat-selects
        for (const ms of document.querySelectorAll('mat-select, [role="listbox"], [role="combobox"]')) {
            if (!isVisible(ms)) continue;
            const msKey = ms.id || ms.getAttribute('aria-label');
            if (msKey && prePriorFields.has(msKey)) continue;

            const msLabel = findLabelFor(ms);

            let options = [];
            try {
                ms.click();
                await wait(350);
                const panelId = ms.getAttribute('aria-owns') || ms.getAttribute('aria-controls');
                let optEls = [];
                if (panelId) {
                    const panel = document.getElementById(panelId);
                    if (panel) optEls = panel.querySelectorAll('mat-option, [role="option"]');
                }
                if (optEls.length === 0) {
                    const panes = document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane');
                    if (panes.length > 0) optEls = panes[panes.length - 1].querySelectorAll('mat-option, [role="option"]');
                }
                options = Array.from(optEls).map(el => el.textContent.trim()).filter(t => t && t.toLowerCase() !== '' && t.toLowerCase() !== 'select');
                await closeDropdown(ms);
            } catch (e) { nukeOverlays(); await wait(50); }

            const ddKey = msLabel || msKey || `prior_dd_${result.priorAddressReveal.revealedFields.length}`;
            result.dropdowns[ddKey] = {
                id: ms.id || '', ariaLabel: ms.getAttribute('aria-label') || '',
                label: msLabel || '', options, currentValue: '',
                optionCount: options.length, revealedBy: 'Years At Address = 1'
            };
            result.stats.totalCustomDropdowns++;
            result.stats.totalOptions += options.length;
            result.priorAddressReveal.revealedFields.push({
                revealedBy: 'Years At Address = 1', type: 'mat-select',
                id: ms.id || '', label: msLabel || '', options
            });
            foundPriorFields = true;
            if (ms.id) prePriorFields.add(ms.id);
        }

        result.priorAddressReveal.triggered = foundPriorFields || !!priorSection;

        // ── 5d. Restore original value ──
        if (yaType === 'input') {
            setInputValue(yaElement, originalYearsValue);
        } else if (yaType === 'mat-select') {
            nukeOverlays();
            await wait(100);
            try {
                yaElement.click();
                await wait(500);
                const restoreOpts = Array.from(
                    document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane mat-option, .cdk-overlay-container .cdk-overlay-pane [role="option"]')
                );
                if (originalYearsValue) {
                    const origOpt = restoreOpts.find(o => (o.textContent || '').trim() === originalYearsValue);
                    if (origOpt) {
                        origOpt.click();
                        await wait(200);
                    } else if (restoreOpts.length > 0) {
                        restoreOpts[0].click(); // First option (blank/placeholder)
                        await wait(200);
                    }
                } else if (restoreOpts.length > 0) {
                    restoreOpts[0].click(); // First option (blank/placeholder)
                    await wait(200);
                } else {
                    yaElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                }
            } catch (e) {
                nukeOverlays();
            }
        } else if (yaType === 'native-select') {
            yaElement.value = originalYearsValue;
            yaElement.dispatchEvent(new Event('change', { bubbles: true }));
        }

        await wait(300); // Let Angular tear down the Prior Address section
        console.log(`[Altech Scraper] Prior Address reveal (${yaType}): triggered=${result.priorAddressReveal.triggered}, fields=${result.priorAddressReveal.revealedFields.length}`);
    } else {
        // Diagnostic: log what mat-selects ARE on the page to help debug
        const allMatSelects = document.querySelectorAll('mat-select');
        console.log(`[Altech Scraper] Primary Years At Address element not found (tried input, mat-select, native select) — skipping Prior Address reveal`);
        console.log(`[Altech Scraper] DEBUG: ${allMatSelects.length} mat-selects on page. Labels:`);
        allMatSelects.forEach((ms, i) => {
            const lbl = findLabelFor(ms) || '';
            const fcn = ms.getAttribute('formcontrolname') || '';
            const vis = isVisible(ms);
            console.log(`  [${i}] formcontrolname="${fcn}" label="${lbl}" visible=${vis}`);
        });
    }

    result.stats.priorAddressRevealed = result.priorAddressReveal.revealedFields.length;

    // ── 6. BUTTON-EXPANSION SCRAPE: Click "Add contact", activate Co-Applicant toggle, THEN scrape ──
    result.buttonExpansion = { revealedFields: [], buttonsExpanded: 0 };

    const addContactPatterns = ['add contact', 'add another contact', '+ contact', 'new contact'];
    const allButtons = [...document.querySelectorAll('button, a, [role="button"], .mat-button, .mat-raised-button, .mat-flat-button, .mat-icon-button')];
    let addContactBtn = null;

    for (const btn of allButtons) {
        const text = (btn.textContent || '').trim().toLowerCase();
        if (addContactPatterns.some(p => text.includes(p))) {
            addContactBtn = btn;
            break;
        }
    }
    // Fallback: aria-label / title
    if (!addContactBtn) {
        for (const pat of addContactPatterns) {
            const btn = document.querySelector(`[aria-label*="${pat}" i], [title*="${pat}" i]`);
            if (btn) { addContactBtn = btn; break; }
        }
    }

    if (addContactBtn) {
        console.log('[Altech Scraper] Found "Add contact" button, expanding for Co-Applicant scrape...');

        // Snapshot existing field IDs/names before expansion
        const preClickFields = new Set();
        document.querySelectorAll('input, select, textarea, mat-select').forEach(el => {
            if (el.id) preClickFields.add(el.id);
            if (el.name) preClickFields.add(el.name);
        });

        // Step 1: Click "Add contact" and wait for Angular to render
        addContactBtn.click();
        await wait(1000);

        // Step 2: Find the newly created container (last expansion panel / contact block)
        const panels = document.querySelectorAll(
            'mat-expansion-panel, .mat-expansion-panel, [class*="expansion-panel"], ' +
            '[class*="contact-panel"], [class*="co-applicant"], [class*="additional-contact"]'
        );
        const newContainer = panels.length > 0 ? panels[panels.length - 1] : null;

        // Step 3: Find and activate the Co-Applicant toggle by TEXT CONTENT.
        // Angular DOM order ≠ visual order, so we NEVER rely on index.
        // The toggle text literally contains "Co-Applicant" — just find it.
        let activatedCoAp = false;

        // Search a scope for the Co-Applicant toggle by text content
        const findCoApToggle = (scope) => {
            // Gather all mat-slide-toggles and mat-checkboxes
            const allToggles = [
                ...scope.querySelectorAll('mat-slide-toggle'),
                ...scope.querySelectorAll('mat-checkbox')
            ];
            // Log what we see for diagnostics
            console.log(`[Altech Scraper] Searching ${allToggles.length} toggles for "Co-Applicant":`);
            allToggles.forEach((el, i) => {
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                console.log(`  [${i}] <${el.tagName.toLowerCase()}> text="${t.slice(0, 80)}" visible=${isVisible(el)}`);
            });

            // Primary: find toggle whose text includes "Co-Applicant" (case-insensitive)
            const byText = allToggles.find(t =>
                isVisible(t) && /co.?applicant/i.test(t.textContent)
            );
            if (byText) return byText;

            // Fallback: process of elimination — exclude "Client Center" toggles
            const nonClientCenter = allToggles.filter(t =>
                isVisible(t) && !/client\s*center/i.test(t.textContent)
            );
            if (nonClientCenter.length === 1) {
                console.log('[Altech Scraper] Fallback: 1 non-Client-Center toggle → assuming Co-Applicant');
                return nonClientCenter[0];
            }

            return null;
        };

        // 3a. Search inside the new container first, then full page
        let coApToggle = newContainer ? findCoApToggle(newContainer) : null;
        if (!coApToggle) {
            console.log('[Altech Scraper] Co-Applicant toggle not in container — searching full page...');
            coApToggle = findCoApToggle(document);
        }

        // 3b. Retry with extra wait if Angular hasn't rendered it yet
        if (!coApToggle) {
            console.log('[Altech Scraper] Co-Applicant toggle not found — waiting 2s and retrying...');
            await wait(2000);
            coApToggle = newContainer ? findCoApToggle(newContainer) : null;
            if (!coApToggle) coApToggle = findCoApToggle(document);
        }

        // 3c. Click the toggle (inner checkbox first — matches filler behavior)
        if (coApToggle) {
            const alreadyChecked = coApToggle.classList.contains('mat-checked') ||
                coApToggle.classList.contains('mat-mdc-slide-toggle-checked') ||
                coApToggle.classList.contains('mat-checkbox-checked') ||
                coApToggle.querySelector('input[type="checkbox"]')?.checked || false;

            if (!alreadyChecked) {
                const innerCb = coApToggle.querySelector('input[type="checkbox"]');
                if (innerCb) {
                    innerCb.click();
                    console.log(`[Altech Scraper] Clicked Co-Applicant inner checkbox: "${(coApToggle.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60)}"`);
                } else {
                    coApToggle.click();
                    console.log(`[Altech Scraper] Clicked Co-Applicant toggle element`);
                }
                // Verify click took effect after 300ms; try outer click if not
                await wait(300);
                const verified = coApToggle.classList.contains('mat-checked') ||
                    coApToggle.classList.contains('mat-mdc-slide-toggle-checked') ||
                    coApToggle.classList.contains('mat-checkbox-checked') ||
                    coApToggle.querySelector('input[type="checkbox"]')?.checked || false;
                if (!verified) {
                    console.log('[Altech Scraper] Toggle still unchecked — trying alternate click...');
                    coApToggle.click();
                    await wait(200);
                }
            } else {
                console.log('[Altech Scraper] Co-Applicant toggle already active — skipping click');
            }
            activatedCoAp = true;
        } else {
            console.warn('[Altech Scraper] Co-Applicant toggle NOT FOUND after 2 attempts');
        }

        // Step 4: Wait for Co-Applicant fields (Relationship, Industry, etc.) to render
        if (activatedCoAp) {
            await wait(1500);
            console.log('[Altech Scraper] Co-Applicant toggle active — fields should be rendered');
        } else {
            console.warn('[Altech Scraper] Could not activate Co-Applicant toggle — scraping without it');
            await wait(500);
        }

        // Step 4b: Mini-Cascade — Co-Applicant Industry → Occupation
        // These dropdowns only appear AFTER the toggle flip (they weren't in the
        // DOM when §3d's Cascade Engine ran). We use fillCustomDropdown's pattern:
        // open dropdown → fuzzy-match "Retired" → click option. This unlocks
        // Occupation via XHR. We scrape it, mark both in preClickFields so the
        // baseScrape below skips them, then restore Industry to blank.
        if (activatedCoAp) {
            const coApScope = newContainer || document;
            let coApIndustry = null;
            const coApMatSelects = coApScope.querySelectorAll('mat-select');
            console.log(`[Altech Scraper] Mini-Cascade: searching ${coApMatSelects.length} mat-selects in CoAp scope for Industry...`);

            for (const ms of coApMatSelects) {
                if (!isVisible(ms)) continue;
                const lbl = (findLabelFor(ms) || '').toLowerCase();
                const wf = ms.closest('mat-form-field, [class*="form-field"]');
                const wrapLbl = wf?.querySelector('mat-label, .mat-form-field-label, .mdc-floating-label')?.textContent?.trim()?.toLowerCase() || '';
                const ariaLbl = (ms.getAttribute('aria-label') || '').toLowerCase();
                console.log(`  mat-select: lbl="${lbl}" wrapLbl="${wrapLbl}" ariaLbl="${ariaLbl}"`);
                if ([lbl, wrapLbl, ariaLbl].some(t => t.includes('industry'))) {
                    // Ensure it's a NEW one (not the primary already handled in §3c)
                    const msId = ms.id || ms.getAttribute('formcontrolname') || '';
                    if (msId && preClickFields.has(msId)) { console.log(`    → skipped (primary, id="${msId}")`); continue; }
                    coApIndustry = ms;
                    break;
                }
            }

            if (coApIndustry) {
                console.log('[Altech Scraper] Mini-Cascade: filling Co-Applicant Industry → "Retired" to unlock Occupation...');
                try {
                    nukeOverlays();
                    await wait(200);

                    // ── Open Industry dropdown (same pattern fillCustomDropdown uses) ──
                    coApIndustry.click();
                    await wait(1000);

                    let coApIndOpts = Array.from(
                        document.querySelectorAll('.cdk-overlay-container mat-option, .mat-select-panel mat-option, [role="option"]')
                    ).filter(el => isVisible(el));

                    // Capture Industry options while the overlay is open
                    const indOptions = coApIndOpts.filter(el => !isBlankOption(el)).map(el => (el.textContent || '').trim());

                    // ── Fuzzy-match "Retired" (exact → includes → any non-blank) ──
                    let retiredEl = coApIndOpts.find(el => (el.textContent || '').trim().toLowerCase() === 'retired');
                    if (!retiredEl) retiredEl = coApIndOpts.find(el => (el.textContent || '').trim().toLowerCase().includes('retired'));
                    if (!retiredEl && coApIndOpts.length > 0) retiredEl = coApIndOpts.find(el => !isBlankOption(el));

                    if (retiredEl) {
                        retiredEl.click();
                        console.log(`[Altech Scraper] Mini-Cascade: selected "${(retiredEl.textContent || '').trim()}" → waiting 1500 ms for Occupation XHR...`);
                        await wait(1500);

                        // ── Scrape the now-unlocked Co-Applicant Occupation ──
                        let coApOcc = null;
                        for (const ms of coApScope.querySelectorAll('mat-select')) {
                            if (!isVisible(ms) || ms === coApIndustry) continue;
                            const lbl = (findLabelFor(ms) || '').toLowerCase();
                            const wf = ms.closest('mat-form-field, [class*="form-field"]');
                            const wrapLbl = wf?.querySelector('mat-label, .mat-form-field-label, .mdc-floating-label')?.textContent?.trim()?.toLowerCase() || '';
                            const ariaLbl = (ms.getAttribute('aria-label') || '').toLowerCase();
                            if ([lbl, wrapLbl, ariaLbl].some(t => t.includes('occupation'))) {
                                coApOcc = ms;
                                break;
                            }
                        }

                        if (coApOcc && isVisible(coApOcc)) {
                            let occOpts = [];
                            try {
                                coApOcc.click();
                                await wait(500);
                                let optEls = Array.from(
                                    document.querySelectorAll('.cdk-overlay-container mat-option, [role="option"]')
                                ).filter(el => isVisible(el));
                                occOpts = optEls.filter(el => !isBlankOption(el)).map(el => el.textContent.trim());
                                await closeDropdown(coApOcc);
                            } catch (e) { nukeOverlays(); }

                            if (occOpts.length > 0) {
                                const occLabel = findLabelFor(coApOcc) || 'Co-Applicant Occupation';
                                result.dropdowns[occLabel] = {
                                    id: coApOcc.id || '', label: occLabel,
                                    options: occOpts, optionCount: occOpts.length,
                                    currentValue: '', revealedBy: 'Add contact',
                                    dependsOn: 'Co-Applicant Industry',
                                    source: 'mini-cascade'
                                };
                                result.stats.totalCustomDropdowns++;
                                result.stats.totalOptions += occOpts.length;
                                console.log(`[Altech Scraper] Mini-Cascade: Co-Applicant Occupation unlocked — ${occOpts.length} options`);
                            }
                            // Mark Occupation in preClickFields → baseScrape will skip it
                            if (coApOcc.id) preClickFields.add(coApOcc.id);
                            const occAriaLabel = coApOcc.getAttribute('aria-label');
                            if (occAriaLabel) preClickFields.add(occAriaLabel);
                        } else {
                            console.log('[Altech Scraper] Mini-Cascade: Co-Applicant Occupation not found after Industry fill');
                        }

                        // Store Industry options in result
                        const indLabel = findLabelFor(coApIndustry) || 'Co-Applicant Industry';
                        result.dropdowns[indLabel] = {
                            id: coApIndustry.id || '', label: indLabel,
                            options: indOptions, optionCount: indOptions.length,
                            currentValue: '', revealedBy: 'Add contact',
                            source: 'mini-cascade'
                        };
                        result.stats.totalCustomDropdowns++;
                        result.stats.totalOptions += indOptions.length;

                        // Mark Industry in preClickFields → baseScrape will skip it
                        if (coApIndustry.id) preClickFields.add(coApIndustry.id);
                        const indAriaLabel = coApIndustry.getAttribute('aria-label');
                        if (indAriaLabel) preClickFields.add(indAriaLabel);

                        // ── Restore Co-Applicant Industry to blank ──
                        nukeOverlays();
                        await wait(100);
                        try {
                            coApIndustry.click();
                            await wait(800);
                            const restoreOpts = Array.from(
                                document.querySelectorAll('.cdk-overlay-container mat-option, [role="option"]')
                            ).filter(el => isVisible(el));
                            if (restoreOpts.length > 0) {
                                restoreOpts[0].click();
                                await wait(200);
                            } else {
                                coApIndustry.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                            }
                        } catch (e) { nukeOverlays(); }

                        console.log('[Altech Scraper] Mini-Cascade: Industry restored to blank, Occupation options captured');
                    } else {
                        coApIndustry.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                        console.log('[Altech Scraper] Mini-Cascade: "Retired" not found in Co-Applicant Industry — Occupation stays locked');
                    }
                } catch (e) {
                    console.warn('[Altech Scraper] Mini-Cascade failed:', e.message);
                    nukeOverlays();
                }
            } else {
                console.log('[Altech Scraper] Mini-Cascade: Co-Applicant Industry not found — Occupation will remain locked');
            }
        }

        // Step 5: NOW run the full scrape on the container (baseScrape)

        // Scrape new text inputs
        const postInputs = document.querySelectorAll('input, textarea');
        for (const inp of postInputs) {
            if (!isVisible(inp)) continue;
            if (['hidden', 'submit', 'button', 'reset', 'file', 'checkbox', 'radio'].includes(inp.type)) continue;
            if (inp.id && preClickFields.has(inp.id)) continue;
            if (inp.name && preClickFields.has(inp.name)) continue;

            const fieldLabel = findLabelFor(inp);
            result.buttonExpansion.revealedFields.push({
                revealedBy: 'Add contact',
                type: inp.type || 'text',
                name: inp.name || '',
                id: inp.id || '',
                label: fieldLabel || '',
                placeholder: inp.placeholder || '',
                required: inp.required || inp.getAttribute('aria-required') === 'true'
            });
            result.textFields.push({
                type: inp.type || 'text', name: inp.name || '', id: inp.id || '',
                placeholder: inp.placeholder || '', label: fieldLabel || '',
                value: '', required: inp.required || inp.getAttribute('aria-required') === 'true',
                source: 'button-expansion'
            });
            result.stats.totalInputs++;
            if (inp.id) preClickFields.add(inp.id);
            if (inp.name) preClickFields.add(inp.name);
        }

        // Scrape new native selects
        const postSelects = document.querySelectorAll('select');
        for (const sel of postSelects) {
            if (!isVisible(sel)) continue;
            const selKey = sel.name || sel.id;
            if (selKey && preClickFields.has(selKey)) continue;

            const selLabel = findLabelFor(sel);
            const options = Array.from(sel.options)
                .map(o => o.text.trim())
                .filter(t => t && !['', 'select', 'select one', '-- select --', '--select--', 'choose'].includes(t.toLowerCase()));

            if (options.length > 0) {
                const key = selLabel || selKey || `contact_select_${result.buttonExpansion.revealedFields.length}`;
                result.nativeSelects[key] = {
                    name: sel.name || '', id: sel.id || '', label: selLabel || '',
                    options, currentValue: '', required: sel.required,
                    revealedBy: 'Add contact'
                };
                result.stats.totalNativeSelects++;
                result.stats.totalOptions += options.length;
            }
            result.buttonExpansion.revealedFields.push({
                revealedBy: 'Add contact', type: 'select',
                name: sel.name || '', id: sel.id || '', label: selLabel || ''
            });
            if (sel.id) preClickFields.add(sel.id);
            if (sel.name) preClickFields.add(sel.name);
        }

        // Scrape new Angular Material dropdowns
        const postMatSelects = document.querySelectorAll('mat-select, [role="listbox"], [role="combobox"]');
        for (const ms of postMatSelects) {
            if (!isVisible(ms)) continue;
            const msKey = ms.id || ms.getAttribute('aria-label');
            if (msKey && preClickFields.has(msKey)) continue;

            const msLabel = findLabelFor(ms);

            // Open to capture options
            let options = [];
            try {
                ms.click();
                await wait(350);
                const panelId = ms.getAttribute('aria-owns') || ms.getAttribute('aria-controls');
                let optionEls = [];
                if (panelId) {
                    const panel = document.getElementById(panelId);
                    if (panel) optionEls = panel.querySelectorAll('mat-option, [role="option"]');
                }
                if (optionEls.length === 0) {
                    const panes = document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane');
                    if (panes.length > 0) optionEls = panes[panes.length - 1].querySelectorAll('mat-option, [role="option"]');
                }
                options = Array.from(optionEls).map(el => el.textContent.trim()).filter(t => t && t.toLowerCase() !== '' && t.toLowerCase() !== 'select');
                await closeDropdown(ms);
            } catch (e) { nukeOverlays(); await wait(50); }

            const ddKey = msLabel || msKey || `contact_dd_${result.buttonExpansion.revealedFields.length}`;
            result.dropdowns[ddKey] = {
                id: ms.id || '', ariaLabel: ms.getAttribute('aria-label') || '',
                label: msLabel || '', options, currentValue: '',
                optionCount: options.length, revealedBy: 'Add contact'
            };
            result.stats.totalCustomDropdowns++;
            result.stats.totalOptions += options.length;
            result.buttonExpansion.revealedFields.push({
                revealedBy: 'Add contact', type: 'mat-select',
                id: ms.id || '', label: msLabel || '', options
            });
            if (ms.id) preClickFields.add(ms.id);
        }

        if (newContainer) {
            for (const ctrl of newContainer.querySelectorAll('mat-checkbox, mat-slide-toggle, mat-radio-button, input[type="checkbox"], input[type="radio"]')) {
                if (!isVisible(ctrl)) continue;
                const ctrlLabel = ctrl.querySelector('.mat-checkbox-label, .mat-slide-toggle-content, .mdc-label, label')?.textContent?.trim()
                    || ctrl.textContent?.trim() || findLabelFor(ctrl) || '';
                result.buttonExpansion.revealedFields.push({
                    revealedBy: 'Add contact',
                    type: ctrl.tagName?.toLowerCase() || 'control',
                    label: ctrlLabel
                });
            }
        }

        result.buttonExpansion.buttonsExpanded = 1;

        // Step 6: Clean up — delete the Co-Applicant container so the form stays clean
        let deletedContact = false;
        const deletePatterns = ['delete', 'remove', 'trash', 'close', 'cancel', 'x'];

        // 6a. Search inside the new container
        if (newContainer) {
            for (const btn of newContainer.querySelectorAll('button, [role="button"], a, .mat-icon-button, mat-icon, [class*="icon"]')) {
                const text = (btn.textContent || '').trim().toLowerCase();
                const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                const title = (btn.getAttribute('title') || '').toLowerCase();
                const hasIcon = btn.querySelector('mat-icon, [class*="trash"], [class*="delete"], [class*="remove"], [class*="close"]');
                const matIconText = btn.tagName === 'MAT-ICON' ? text : '';
                if (deletePatterns.some(p => text.includes(p) || ariaLabel.includes(p) || title.includes(p) || matIconText.includes(p)) || hasIcon) {
                    btn.click();
                    deletedContact = true;
                    console.log(`[Altech Scraper] Clicked delete in container: "${text.slice(0, 30)}"`);
                    break;
                }
            }
        }

        // 6b. Search sibling elements
        if (!deletedContact && newContainer) {
            const nextSib = newContainer.nextElementSibling;
            const prevSib = newContainer.previousElementSibling;
            for (const sib of [nextSib, prevSib].filter(Boolean)) {
                for (const btn of [sib, ...sib.querySelectorAll('button, [role="button"], a, mat-icon')]) {
                    const text = (btn.textContent || '').trim().toLowerCase();
                    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    if (deletePatterns.some(p => text.includes(p) || ariaLabel.includes(p))) {
                        btn.click();
                        deletedContact = true;
                        console.log(`[Altech Scraper] Clicked delete in sibling: "${text.slice(0, 30)}"`);
                        break;
                    }
                }
                if (deletedContact) break;
            }
        }

        // 6c. Search parent expansion panel header for collapse/delete
        if (!deletedContact && newContainer) {
            const parent = newContainer.closest('mat-expansion-panel, .mat-expansion-panel, [class*="expansion"]');
            if (parent) {
                for (const btn of parent.querySelectorAll('.mat-expansion-panel-header button, mat-panel-title button, button, [role="button"]')) {
                    const text = (btn.textContent || '').trim().toLowerCase();
                    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    if (deletePatterns.some(p => text.includes(p) || ariaLabel.includes(p))) {
                        btn.click();
                        deletedContact = true;
                        console.log(`[Altech Scraper] Clicked delete in parent panel: "${text.slice(0, 30)}"`);
                        break;
                    }
                }
            }
        }

        // 6d. Handle confirmation dialog that may appear after clicking delete
        if (deletedContact) {
            await wait(500);
            const confirmBtns = document.querySelectorAll(
                '.mat-dialog-actions button, .mat-mdc-dialog-actions button, ' +
                '.cdk-overlay-container button, [class*="dialog"] button, [class*="modal"] button'
            );
            for (const btn of confirmBtns) {
                const text = (btn.textContent || '').trim().toLowerCase();
                if (['yes', 'ok', 'confirm', 'delete', 'remove', 'continue'].some(p => text.includes(p))) {
                    btn.click();
                    console.log(`[Altech Scraper] Confirmed delete dialog: "${text}"`);
                    await wait(500);
                    break;
                }
            }
        }
        if (deletedContact) {
            await wait(500);
        } else {
            console.log('[Altech Scraper] No delete button found for Co-Applicant container — user may need to remove manually');
        }

        console.log(`[Altech Scraper] Button expansion revealed ${result.buttonExpansion.revealedFields.length} Co-Applicant fields`);
    } else {
        // No "Add contact" button — the Co-Applicant toggle might be a standalone element on the main form
        console.log('[Altech Scraper] No "Add contact" button found — checking for standalone Co-Applicant toggle on main page...');
        const allDocToggles = [
            ...document.querySelectorAll('mat-slide-toggle, [class*="mat-slide-toggle"]'),
            ...document.querySelectorAll('mat-checkbox, [class*="mat-checkbox"]')
        ].filter(el => isVisible(el));
        console.log(`[Altech Scraper] ${allDocToggles.length} visible toggles/checkboxes on page (no Add contact button):`);
        allDocToggles.forEach((el, i) => {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
            const fcn = el.getAttribute('formcontrolname') || '';
            console.log(`  [${i}] <${el.tagName?.toLowerCase()}> fcn="${fcn}" text="${t}"`);
        });
    }

    result.stats.buttonExpansionRevealed = result.buttonExpansion.revealedFields.length;

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
            // Show toolbar with fill report after popup-triggered fill
            injectToolbar();
            if (toolbarShadow) {
                const btn = toolbarShadow.getElementById('tb-fill');
                const status = toolbarShadow.getElementById('tb-status');
                const reportBtn = toolbarShadow.getElementById('tb-report');
                const total = report.textFilled + report.ddFilled;
                const skipped = report.textSkipped + report.ddSkipped;
                if (status) status.textContent = `\u2713 ${total} filled` + (skipped > 0 ? `, ${skipped} skipped` : '');
                if (btn) { btn.disabled = false; btn.textContent = 'Fill Again'; }
                if (reportBtn) reportBtn.style.display = '';
                showInjectionReport(toolbarShadow, report);
            }
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

    // Auto-show toolbar only on the EZLynx personal lines create page.
    // On all other EZLynx pages, the toolbar appears after a fill is triggered.
    if (location.href.includes('/web/account/create/personal')) {
        setTimeout(injectToolbar, 1500);
    }

    console.log('[Altech Filler] Content script loaded on', location.href, '| Page:', detectPage());
}
