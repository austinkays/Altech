/**
 * Apify Client Helper — Shared HTTP client for Apify actor sync runs
 * 
 * NOT a serverless function (underscore prefix — Vercel ignores it).
 * Used by property-intelligence.js to call Redfin Detail and Zillow Search actors.
 * 
 * Actors:
 *   - tri_angle/redfin-detail  → Full property facts via address or URL
 *   - maxcopell/zillow-scraper → Zillow listing data via search query or URL
 */

const APIFY_BASE = 'https://api.apify.com/v2';
const DEFAULT_TIMEOUT_MS = 60_000; // 60s — actors use browser scraping

/**
 * Run an Apify actor synchronously and return dataset items.
 * @param {string} actorSlug  e.g. 'tri_angle~redfin-detail'
 * @param {object} input      Actor input payload
 * @param {number} [timeoutMs=60000]  Client-side abort timeout
 * @returns {object[]|null}   Array of dataset items, or null on error/empty
 */
export async function runActorSync(actorSlug, input, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const token = (process.env.APIFY_API_KEY || '').trim();
  if (!token) {
    console.log('[Apify] Skipped — APIFY_API_KEY not set');
    return null;
  }

  const timeoutSecs = Math.floor(timeoutMs / 1000);
  const url = `${APIFY_BASE}/acts/${actorSlug}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSecs}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs + 5000); // grace buffer

  const startTime = Date.now();
  const inputSummary = sanitizeInputForLog(input);
  console.log(`[Apify] Running ${actorSlug} — input: ${JSON.stringify(inputSummary)}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[Apify] ${actorSlug} HTTP ${response.status} (${elapsed}s): ${errText.slice(0, 200)}`);
      return null;
    }

    const items = await response.json();
    if (!Array.isArray(items) || items.length === 0) {
      console.log(`[Apify] ${actorSlug} returned empty results (${elapsed}s)`);
      return null;
    }

    console.log(`[Apify] ${actorSlug} returned ${items.length} item(s) (${elapsed}s)`);
    return items;
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    if (err.name === 'AbortError') {
      console.warn(`[Apify] ${actorSlug} timed out after ${elapsed}s`);
    } else {
      console.warn(`[Apify] ${actorSlug} error (${elapsed}s):`, err.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Redfin Detail — scrape full property facts by address or URL.
 * Actor: tri_angle/redfin-detail (O4t1ic2ZC0CNiRPR3)
 * 
 * @param {object} opts
 * @param {string[]} [opts.addresses]    Plain addresses (e.g. ["123 Main St, Vancouver, WA 98661"])
 * @param {{url:string}[]} [opts.detailUrls]  Redfin listing URLs (e.g. [{url:"https://www.redfin.com/..."}])
 * @param {boolean} [opts.useResidentialProxies=false]
 * @returns {object[]|null}  Array of property detail objects, or null
 */
export async function runRedfinDetail({ addresses, detailUrls, useResidentialProxies = false } = {}) {
  const input = {};
  if (addresses && addresses.length > 0) input.addresses = addresses;
  if (detailUrls && detailUrls.length > 0) input.detailUrls = detailUrls;
  if (useResidentialProxies) input.useResidentialProxies = true;

  if (!input.addresses && !input.detailUrls) {
    console.warn('[Apify] runRedfinDetail called with no addresses or URLs');
    return null;
  }

  return runActorSync('tri_angle~redfin-detail', input, 60_000);
}

/**
 * Zillow Search — scrape Zillow listings by search query or URL.
 * Actor: maxcopell/zillow-scraper
 * 
 * @param {object} opts
 * @param {string} [opts.search]       Search query (address, zip, city)
 * @param {string[]} [opts.startUrls]  Direct Zillow listing URLs
 * @param {number} [opts.maxItems=3]   Max results to return
 * @param {boolean} [opts.simple=false] true = basic fields only; false = full Zillow data
 * @returns {object[]|null}  Array of listing objects, or null
 */
export async function runZillowSearch({ search, startUrls, maxItems = 3, simple = false } = {}) {
  const input = { maxItems, simple };
  if (search) input.search = search;
  if (startUrls && startUrls.length > 0) input.startUrls = startUrls.map(u => typeof u === 'string' ? { url: u } : u);

  if (!input.search && !input.startUrls) {
    console.warn('[Apify] runZillowSearch called with no search query or URLs');
    return null;
  }

  return runActorSync('maxcopell~zillow-scraper', input, 60_000);
}

/**
 * Strip sensitive data from input before logging.
 */
function sanitizeInputForLog(input) {
  if (!input || typeof input !== 'object') return input;
  const safe = {};
  if (input.addresses) safe.addresses = input.addresses;
  if (input.detailUrls) safe.detailUrls = input.detailUrls.map(u => typeof u === 'object' ? u.url : u);
  if (input.search) safe.search = input.search;
  if (input.startUrls) safe.startUrls = input.startUrls.map(u => typeof u === 'object' ? u.url : u);
  if (input.maxItems) safe.maxItems = input.maxItems;
  return safe;
}
