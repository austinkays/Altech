/**
 * Property Intelligence — Unified property data endpoint.
 *
 * Thin router over per-mode helpers in ./_property-*.js.
 * Usage: POST /api/property-intelligence?mode=<mode>
 *
 * Modes:
 *   arcgis           — Parcel data (county ArcGIS) + FEMA flood
 *   satellite        — Satellite + Street View AI vision analysis
 *   zillow           — Tiered property lookup (Rentcast → Apify → Gemini)
 *   listing-search   — Redfin/Zillow URL or address → structured facts
 *   rentcast         — Direct Rentcast lookup
 *   firestation      — Nearest fire station + protection class
 *   rag-interpret    — RAG interpretation (delegated to _rag-interpreter)
 *   validate-address — Google Address Validation + geocoding fallback
 */

import { securityMiddleware } from '../lib/security.js';
import { isUpstreamTimeout, sendUpstreamTimeout } from './_fetch-timeout.js';
import { ragHandler } from './_rag-interpreter.js';
import { handleArcgis } from './_property-arcgis.js';
import { handleSatellite } from './_property-satellite.js';
import { handleZillow } from './_property-zillow.js';
import { handleListingSearch } from './_property-listing.js';
import { handleFireStation } from './_property-firestation.js';
import { handleValidateAddress } from './_property-address-validate.js';
import { fetchRentcastData } from './_property-rentcast.js';

async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  const { mode } = req.query;

  try {
    switch (mode) {
      case 'arcgis':
        return await handleArcgis(req, res);
      case 'satellite':
        return await handleSatellite(req, res);
      case 'zillow':
        return await handleZillow(req, res);
      case 'listing-search':
        return await handleListingSearch(req, res);
      case 'rentcast': {
        const { address, city, state, zip } = req.body || {};
        if (!address || !city || !state) {
          return res.status(400).json({ error: 'Missing required fields: address, city, state' });
        }
        try {
          const result = await fetchRentcastData(address, city, state, zip || '');
          if (!result) return res.status(404).json({ error: 'not_found' });
          return res.status(200).json({ success: true, source: 'Rentcast', ...result });
        } catch (e) {
          return res.status(500).json({ success: false, error: e.message });
        }
      }
      case 'firestation':
        return await handleFireStation(req, res);
      case 'rag-interpret':
        return await ragHandler(req, res);
      case 'validate-address':
        return await handleValidateAddress(req, res);
      default:
        return res.status(400).json({
          error: `Invalid mode "${mode}". Use ?mode=arcgis|satellite|zillow|listing-search|rentcast|firestation|rag-interpret|validate-address`
        });
    }
  } catch (error) {
    console.error(`[PropertyIntelligence] ${mode} error:`, error);
    if (isUpstreamTimeout(error)) return sendUpstreamTimeout(res, req.requestId);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}

export default securityMiddleware(handler);
