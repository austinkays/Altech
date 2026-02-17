/**
 * Altech Property Scraper — Content Script
 *
 * Injected programmatically into Zillow, Redfin, county GIS/assessor sites,
 * and any property-related page. Extracts structured property data that maps
 * directly to Altech form field IDs.
 *
 * Injected via chrome.scripting.executeScript from background.js.
 * Returns data as the last expression (IIFE pattern).
 */

(() => {
  'use strict';

  const url  = window.location.href;
  const host = window.location.hostname.toLowerCase();
  const body = document.body;
  if (!body) return { error: 'No document body', url };

  const pageText = body.innerText || '';

  // ═══════════════════════════════════════════════════════════════
  // §1  SITE DETECTION
  // ═══════════════════════════════════════════════════════════════

  function detectSiteType() {
    if (host.includes('zillow.com'))     return 'zillow';
    if (host.includes('redfin.com'))     return 'redfin';
    if (host.includes('realtor.com'))    return 'realtor';
    if (host.includes('trulia.com'))     return 'trulia';
    if (host.includes('portlandmaps'))   return 'gis';
    if (host.includes('gis.') || host.includes('gismo.') ||
        host.includes('arcgis')  || host.includes('parcelviewer') ||
        url.includes('/assessor') || url.includes('/parcel') ||
        url.includes('/property-search') || url.includes('/taxsifter') ||
        url.includes('propertysearch') || url.includes('beacon.schneidercorp'))
      return 'gis';
    return 'generic';
  }

  // ═══════════════════════════════════════════════════════════════
  // §2  FIELD PATTERN MAP  (Altech field ID → search patterns)
  // ═══════════════════════════════════════════════════════════════

  const FIELD_PATTERNS = {
    yrBuilt:           [/\byear\s*built\b/i, /\byr\s*built\b/i, /\bbuilt\s*in\b/i, /\bconstruction\s*year\b/i],
    sqFt:              [/\b(?:total|living|finished)?\s*(?:sq(?:uare)?\s*f(?:oo|ee)?t(?:age)?|area|sqft)\b/i, /\bliving\s*area\b/i, /\bbuilding\s*(?:sq|area)\b/i],
    lotSize:           [/\blot\s*(?:size|area|dim)\b/i, /\bacreage\b/i, /\bland\s*area\b/i, /\bparcel\s*(?:size|area)\b/i],
    bedrooms:          [/\bbed(?:room)?s?\b/i],
    fullBaths:         [/\b(?:full\s*)?bath(?:room)?s?\b/i],
    halfBaths:         [/\bhalf\s*bath\b/i, /\b(?:1\/2|½)\s*bath\b/i, /\bpartial\s*bath\b/i],
    numStories:        [/\bstori?(?:es|y)\b/i, /\b(?:#|num(?:ber)?\s*(?:of\s*)?)?levels?\b/i, /\bfloors?\b/i],
    roofType:          [/\broof\s*(?:type|material|cover(?:ing)?|surface)?\b/i, /\broofing\b/i],
    roofShape:         [/\broof\s*(?:shape|style|design)\b/i],
    foundation:        [/\bfoundation(?:\s*type)?\b/i, /\bbasement\b/i],
    exteriorWalls:     [/\b(?:exterior|ext)\s*(?:wall|finish|material|siding)?\b/i, /\bsiding(?:\s*type)?\b/i],
    constructionStyle: [/\bconstruction(?:\s*(?:type|style|class|quality))?\b/i, /\bbuilding\s*(?:type|style)\b/i, /\bproperty\s*(?:type|style|class)\b/i, /\bdwelling\s*(?:type|style)\b/i, /\bresidence\s*type\b/i],
    heatingType:       [/\bheat(?:ing)?(?:\s*(?:type|source|system|fuel))?\b/i],
    cooling:           [/\bcool(?:ing)?(?:\s*(?:type|system))?\b/i, /\ba(?:ir)?\s*condition(?:ing)?\b/i, /\bhvac\b/i],
    garageType:        [/\bgarage\s*(?:type)?\b/i, /\bparking\s*(?:type|feature)\b/i],
    garageSpaces:      [/\bgarage\s*(?:spaces?|cars?|size|cap)\b/i, /\bparking\s*spaces?\b/i],
    pool:              [/\b(?:swimming\s*)?pool\b/i],
    numFireplaces:     [/\bfireplace\b/i],
    sewer:             [/\bsewer(?:\s*(?:type|system|info))?\b/i, /\bsewage\b/i],
    waterSource:       [/\bwater\s*(?:source|supply|type)\b/i],
    flooring:          [/\bfloor(?:ing)?(?:\s*(?:type|material))?\b/i, /\bfloor\s*cover\b/i],
    assessedValue:     [/\bassess(?:ed)?\s*value\b/i, /\btotal\s*(?:assessed\s*)?value\b/i, /\bmarket\s*value\b/i, /\bappraised\b/i],
    ownerName:         [/\bowner(?:\s*name)?\b/i, /\bproperty\s*owner\b/i, /\btaxpayer\b/i],
    parcelId:          [/\bparcel\s*(?:id|num|#|no)\b/i, /\b(?:tax\s*)?(?:apn|folio|pin)\b/i],
    purchaseDate:      [/\b(?:last\s*)?(?:sale|sold|purchase|transfer)\s*date\b/i],
    address:           [/\b(?:site|property|street)\s*address\b/i, /\bsitus\b/i],
    city:              [/\b(?:site\s*)?city\b/i],
    state:             [/\b(?:site\s*)?state\b/i],
    zip:               [/\b(?:site\s*)?zip\b/i],
    woodStove:         [/\bwood\s*(?:stove|burning)\b/i],
  };

  // Fields that should contain only numbers
  const NUMERIC_FIELDS = new Set([
    'yrBuilt', 'sqFt', 'bedrooms', 'fullBaths', 'halfBaths',
    'numStories', 'garageSpaces', 'numFireplaces', 'assessedValue'
  ]);

  // ═══════════════════════════════════════════════════════════════
  // §3  VALUE CLEANING / NORMALIZATION
  // ═══════════════════════════════════════════════════════════════

  function cleanValue(key, raw) {
    if (!raw) return '';
    let v = String(raw).trim();
    // Remove leading separators
    v = v.replace(/^[:\-–—=]\s*/, '');
    // Remove leading/trailing quotes
    v = v.replace(/^["']|["']$/g, '');

    if (key === 'yrBuilt') {
      const m = v.match(/(\d{4})/);
      return m ? m[1] : '';
    }
    if (key === 'sqFt' || key === 'assessedValue') {
      return v.replace(/[$,\s]/g, '').replace(/[^0-9.]/g, '') || '';
    }
    if (NUMERIC_FIELDS.has(key)) {
      const m = v.match(/(\d+)/);
      return m ? m[1] : '';
    }
    if (key === 'lotSize') {
      // Normalize to acres
      const sqftMatch = v.match(/([\d,.]+)\s*(?:sq(?:uare)?\s*f(?:oo|ee)?t|sqft)/i);
      if (sqftMatch) {
        const acres = parseFloat(sqftMatch[1].replace(/,/g, '')) / 43560;
        return acres.toFixed(2);
      }
      const acreMatch = v.match(/([\d,.]+)\s*acre/i);
      if (acreMatch) return acreMatch[1].replace(/,/g, '');
      const numMatch = v.match(/([\d,.]+)/);
      return numMatch ? numMatch[1].replace(/,/g, '') : '';
    }
    if (key === 'pool') {
      if (/yes|true|in[- ]?ground|above[- ]?ground|private|community/i.test(v)) return 'Yes';
      if (/no|none|false|n\/a/i.test(v)) return 'No';
    }
    if (key === 'woodStove') {
      if (/yes|true|wood/i.test(v)) return 'Yes';
      if (/no|none|false/i.test(v)) return 'No';
    }
    if (key === 'sewer') {
      if (/public|municipal|city|sanitary/i.test(v)) return 'Public';
      if (/septic|private/i.test(v)) return 'Septic';
    }
    if (key === 'waterSource') {
      if (/public|municipal|city/i.test(v)) return 'Public';
      if (/well|private/i.test(v)) return 'Well';
    }

    // Cap at reasonable length
    return v.length > 120 ? v.substring(0, 120) : v;
  }

  // ═══════════════════════════════════════════════════════════════
  // §4  EXTRACTION STRATEGIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Match a label against FIELD_PATTERNS and store value in data.
   * Returns true if a match was made.
   */
  function matchAndStore(data, label, value) {
    if (!label || !value || value.length > 300) return false;
    const labelClean = label.trim();
    if (labelClean.length > 60) return false;

    for (const [key, patterns] of Object.entries(FIELD_PATTERNS)) {
      if (data[key]) continue; // already found
      for (const pattern of patterns) {
        if (pattern.test(labelClean)) {
          const cleaned = cleanValue(key, value);
          if (cleaned) {
            data[key] = cleaned;
            return true;
          }
        }
      }
    }
    return false;
  }

  // ── Strategy A: Scan <table> rows ──
  function scanTables() {
    const data = {};
    const tables = document.querySelectorAll('table');

    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('th, td');
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim();
          const value = cells[cells.length >= 3 ? 2 : 1].textContent.trim();
          matchAndStore(data, label, value);
        }
        // Single-cell "Label: Value"
        if (cells.length === 1) {
          const text = cells[0].textContent.trim();
          const m = text.match(/^([^:]{2,50}):\s*(.+)$/);
          if (m) matchAndStore(data, m[1], m[2]);
        }
      }
    }
    return data;
  }

  // ── Strategy B: Scan <dl> definition lists ──
  function scanDefinitionLists() {
    const data = {};
    const dls = document.querySelectorAll('dl');

    for (const dl of dls) {
      const dts = dl.querySelectorAll('dt');
      for (const dt of dts) {
        const label = dt.textContent.trim();
        // Try next sibling dd
        let dd = dt.nextElementSibling;
        while (dd && dd.tagName !== 'DD' && dd.tagName !== 'DT') dd = dd.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          matchAndStore(data, label, dd.textContent.trim());
        }
      }
    }
    return data;
  }

  // ── Strategy C: Scan adjacent element pairs (label → value) ──
  function scanKeyValueElements() {
    const data = {};
    const candidates = document.querySelectorAll(
      'span, div, p, label, strong, b, th, dt, h4, h5, h6, li'
    );

    for (const el of candidates) {
      // Only match small text nodes (labels are short)
      const text = el.textContent.trim();
      if (text.length < 2 || text.length > 60) continue;
      // Skip if this element has many children (it's a container, not a label)
      if (el.children.length > 3) continue;
      // Check if its own text (excluding children) matches a pattern
      const ownText = getOwnText(el).trim();
      if (ownText.length < 2) continue;

      for (const [key, patterns] of Object.entries(FIELD_PATTERNS)) {
        if (data[key]) continue;
        for (const pattern of patterns) {
          if (!pattern.test(ownText)) continue;
          const value = getAdjacentValue(el);
          if (!value) continue;
          const cleaned = cleanValue(key, value);
          if (cleaned) {
            data[key] = cleaned;
            break;
          }
        }
      }
    }
    return data;
  }

  /** Get element's own text (not from children) */
  function getOwnText(el) {
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    }
    return text;
  }

  /** Find the value adjacent to a label element */
  function getAdjacentValue(el) {
    // 1. Next sibling element
    let next = el.nextElementSibling;
    if (next && next.children.length <= 3) {
      const t = next.textContent.trim();
      if (t.length >= 1 && t.length < 200) return t;
    }

    // 2. Parent's next sibling
    const parentNext = el.parentElement?.nextElementSibling;
    if (parentNext && parentNext.children.length <= 3) {
      const t = parentNext.textContent.trim();
      if (t.length >= 1 && t.length < 200) return t;
    }

    // 3. Next sibling within parent
    const parent = el.parentElement;
    if (parent) {
      const kids = Array.from(parent.children);
      const idx = kids.indexOf(el);
      if (idx >= 0 && idx < kids.length - 1) {
        const sib = kids[idx + 1];
        if (sib.children.length <= 3) {
          const t = sib.textContent.trim();
          if (t.length >= 1 && t.length < 200) return t;
        }
      }
    }

    // 4. Text after label colon within the same parent
    const fullText = el.parentElement?.textContent || '';
    const labelText = el.textContent;
    const afterIdx = fullText.indexOf(labelText);
    if (afterIdx >= 0) {
      const after = fullText.substring(afterIdx + labelText.length).trim();
      const firstLine = after.split('\n')[0].trim().replace(/^[:\-–—]\s*/, '');
      if (firstLine.length >= 1 && firstLine.length < 200) return firstLine;
    }

    return null;
  }

  // ── Strategy D: Regex scan of page text lines ──
  function scanTextLines() {
    const data = {};
    const lines = pageText.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 2 && l.length < 200);

    for (const line of lines) {
      // "Label: Value" format
      const colonMatch = line.match(/^([^:\n]{2,50}):\s*(.{1,150})$/);
      if (colonMatch) {
        matchAndStore(data, colonMatch[1], colonMatch[2]);
      }
    }
    return data;
  }

  // ── Strategy E: ArcGIS popup / info panel ──
  function scanArcGISPopup() {
    const data = {};
    // ArcGIS Web AppBuilder / Experience Builder popup selectors
    const popupSelectors = [
      '.esri-popup__content',
      '.esri-feature__content',
      '.esriPopupWrapper',
      '.attrTable',
      '.esri-feature-table',
      '.jimu-widget-feature-info',
      '[class*="popup-content"]',
      '[class*="attribute-table"]',
      '[class*="PropertyInfo"]',
      '[class*="parcel-info"]',
      '[class*="parcel-detail"]',
    ];

    for (const sel of popupSelectors) {
      const panels = document.querySelectorAll(sel);
      for (const panel of panels) {
        // Scan tables inside
        const rows = panel.querySelectorAll('tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('th, td');
          if (cells.length >= 2) {
            matchAndStore(data, cells[0].textContent.trim(), cells[1].textContent.trim());
          }
        }
        // Scan dl inside
        const dts = panel.querySelectorAll('dt');
        for (const dt of dts) {
          let dd = dt.nextElementSibling;
          while (dd && dd.tagName !== 'DD' && dd.tagName !== 'DT') dd = dd.nextElementSibling;
          if (dd?.tagName === 'DD') {
            matchAndStore(data, dt.textContent.trim(), dd.textContent.trim());
          }
        }
      }
    }
    return data;
  }

  // ═══════════════════════════════════════════════════════════════
  // §5  SITE-SPECIFIC SCRAPERS
  // ═══════════════════════════════════════════════════════════════

  function scrapeZillow() {
    const data = {};

    // ── Header summary: "X bd   X ba   X,XXX sqft" ──
    const bedMatch  = pageText.match(/(\d+)\s*(?:bd|bed(?:room)?s?)\b/i);
    const bathMatch = pageText.match(/(\d+)\s*(?:ba(?:th)?(?:room)?s?)\b/i);
    const sqftMatch = pageText.match(/([\d,]+)\s*sqft/i);
    if (bedMatch)  data.bedrooms  = bedMatch[1];
    if (bathMatch) data.fullBaths = bathMatch[1];
    if (sqftMatch) data.sqFt      = sqftMatch[1].replace(/,/g, '');

    // ── Year Built ──
    const yrMatch = pageText.match(/year\s*built[:\s]*(\d{4})/i);
    if (yrMatch) data.yrBuilt = yrMatch[1];

    // ── Lot Size ──
    const lotMatch = pageText.match(/lot[:\s]*([\d,.]+)\s*(acres?|sq(?:uare)?\s*f(?:oo|ee)?t|sqft)/i);
    if (lotMatch) {
      if (/sq/i.test(lotMatch[2])) {
        data.lotSize = (parseFloat(lotMatch[1].replace(/,/g, '')) / 43560).toFixed(2);
      } else {
        data.lotSize = lotMatch[1].replace(/,/g, '');
      }
    }

    // ── Garage ──
    const garageSpaceMatch = pageText.match(/(?:garage|parking)\s*(?:spaces?)?[:\s]*(\d+)/i);
    if (garageSpaceMatch) data.garageSpaces = garageSpaceMatch[1];
    const garageTypeMatch = pageText.match(/(attached|detached|built[- ]?in|carport)\s*garage/i);
    if (garageTypeMatch) data.garageType = capitalize(garageTypeMatch[1]);

    // ── Heating ──
    const heatMatch = pageText.match(/heat(?:ing)?(?:\s*(?:type|features?))?[:\s]+([^\n,]{3,60})/i);
    if (heatMatch && !/history|cost|bill|saving/i.test(heatMatch[1])) {
      data.heatingType = heatMatch[1].trim();
    }

    // ── Cooling ──
    const coolMatch = pageText.match(/cool(?:ing)?(?:\s*(?:type|features?))?[:\s]+([^\n,]{3,60})/i);
    if (coolMatch && !/cost|bill|saving/i.test(coolMatch[1])) {
      data.cooling = coolMatch[1].trim();
    }

    // ── Roof ──
    const roofMatch = pageText.match(/roof(?:\s*(?:type|material))?[:\s]+([^\n,]{3,60})/i);
    if (roofMatch) data.roofType = roofMatch[1].trim();

    // ── Foundation ──
    const foundMatch = pageText.match(/foundation[:\s]+([^\n,]{3,60})/i);
    if (foundMatch) data.foundation = foundMatch[1].trim();

    // ── Exterior / Siding ──
    const extMatch = pageText.match(/(?:exterior|siding)(?:\s*(?:type|material))?[:\s]+([^\n,]{3,60})/i);
    if (extMatch) data.exteriorWalls = extMatch[1].trim();

    // ── Construction ──
    const constMatch = pageText.match(/construction(?:\s*(?:type|material))?[:\s]+([^\n,]{3,60})/i);
    if (constMatch) data.constructionStyle = constMatch[1].trim();

    // ── Pool ──
    if (/\bpool\b/i.test(pageText) && !/no\s*pool|pool\s*none/i.test(pageText)) {
      data.pool = 'Yes';
    }

    // ── Fireplace ──
    const fpMatch = pageText.match(/(\d+)\s*fireplace/i);
    if (fpMatch) {
      data.numFireplaces = fpMatch[1];
    } else if (/\bfireplace\b/i.test(pageText) && !/no\s*fireplace/i.test(pageText)) {
      data.numFireplaces = '1';
    }

    // ── Stories ──
    const storyMatch = pageText.match(/(\d+)\s*(?:stor(?:ies|y)|levels?)\b/i);
    if (storyMatch) data.numStories = storyMatch[1];

    // ── Sewer ──
    if (/public\s*sewer|municipal\s*sewer|city\s*sewer/i.test(pageText)) data.sewer = 'Public';
    else if (/\bseptic\b/i.test(pageText)) data.sewer = 'Septic';

    // ── Water ──
    if (/public\s*water|municipal\s*water|city\s*water/i.test(pageText)) data.waterSource = 'Public';
    else if (/\bwell\s*water\b|\bprivate\s*well\b/i.test(pageText)) data.waterSource = 'Well';

    // ── Flooring ──
    const floorMatch = pageText.match(/floor(?:ing)?(?:\s*(?:type|material))?[:\s]+([^\n]{3,60})/i);
    if (floorMatch && !/plan|layout|square/i.test(floorMatch[1])) {
      data.flooring = floorMatch[1].trim();
    }

    // ── Address from page title ──
    const title = document.title || '';
    // Zillow titles: "123 Main St, City, ST 12345 | Zillow"
    const addrMatch = title.match(/^(.+?)\s*[\|–—-]\s*(?:Zillow|Redfin|Realtor)/i);
    if (addrMatch) data.address = addrMatch[1].trim();

    return data;
  }

  function scrapeRedfin() {
    const data = {};

    // Redfin header area
    const bedMatch  = pageText.match(/(\d+)\s*(?:Bed|BR)/i);
    const bathMatch = pageText.match(/(\d+)\s*(?:Bath|BA)/i);
    const sqftMatch = pageText.match(/([\d,]+)\s*(?:Sq\.\s*Ft|sqft)/i);
    if (bedMatch)  data.bedrooms  = bedMatch[1];
    if (bathMatch) data.fullBaths = bathMatch[1];
    if (sqftMatch) data.sqFt      = sqftMatch[1].replace(/,/g, '');

    // Year Built
    const yrMatch = pageText.match(/(?:year\s*built|built)[:\s]*(\d{4})/i);
    if (yrMatch) data.yrBuilt = yrMatch[1];

    // Lot Size
    const lotMatch = pageText.match(/lot\s*size[:\s]*([\d,.]+)\s*(acres?|sq\s*ft)/i);
    if (lotMatch) {
      if (/sq/i.test(lotMatch[2])) {
        data.lotSize = (parseFloat(lotMatch[1].replace(/,/g, '')) / 43560).toFixed(2);
      } else {
        data.lotSize = lotMatch[1].replace(/,/g, '');
      }
    }

    // Stories
    const storyMatch = pageText.match(/(\d+)\s*(?:Stor(?:ies|y)|Levels?)\b/i);
    if (storyMatch) data.numStories = storyMatch[1];

    // Garage
    const garageMatch = pageText.match(/(\d+)\s*(?:car\s*)?garage/i);
    if (garageMatch) data.garageSpaces = garageMatch[1];

    // Address from title
    const title = document.title || '';
    const addrMatch = title.match(/^(.+?)\s*[\|–—-]\s*(?:Redfin)/i);
    if (addrMatch) data.address = addrMatch[1].trim();

    return data;
  }

  // ═══════════════════════════════════════════════════════════════
  // §6  UTILITY HELPERS
  // ═══════════════════════════════════════════════════════════════

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
  }

  /** Merge b into a, only if key not already in a */
  function merge(a, b) {
    for (const [k, v] of Object.entries(b)) {
      if (!a[k] && v) a[k] = v;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // §7  MAIN EXECUTION
  // ═══════════════════════════════════════════════════════════════

  const siteType = detectSiteType();
  let data = {};

  // 1. Run site-specific scraper first (highest confidence)
  if (siteType === 'zillow')  data = scrapeZillow();
  if (siteType === 'redfin')  data = scrapeRedfin();

  // 2. Run generic strategies, merging new finds only
  const strategies = [
    scanTables,
    scanDefinitionLists,
    scanKeyValueElements,
    scanTextLines,
  ];
  // Add ArcGIS popup scan for GIS sites
  if (siteType === 'gis') strategies.unshift(scanArcGISPopup);

  for (const strategy of strategies) {
    try {
      merge(data, strategy());
    } catch (e) {
      // Strategy failed, continue with others
    }
  }

  // 3. Build address from parts if not already captured
  if (!data.address) {
    const title = document.title || '';
    // Try to extract address from page title
    const titleAddr = title.match(/^([\d]+\s+[^|–—\-]+)/);
    if (titleAddr) data.address = titleAddr[1].trim().replace(/\s*,\s*$/, '');
  }

  // 4. Remove empty values and internal-only fields
  const filtered = {};
  const internalOnly = new Set(['address', 'city', 'state', 'zip']);
  for (const [k, v] of Object.entries(data)) {
    if (v && String(v).trim()) {
      filtered[k] = String(v).trim();
    }
  }

  const fieldsFound = Object.keys(filtered).filter(k => !internalOnly.has(k));

  return {
    _source: 'altech-property-scraper',
    siteType,
    url,
    pageTitle: document.title || '',
    address: filtered.address || '',
    timestamp: new Date().toISOString(),
    data: filtered,
    fieldsFound,
    fieldCount: fieldsFound.length
  };
})();
