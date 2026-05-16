/**
 * Commercial Prospect Investigator — Unified public-records lookup endpoint.
 *
 * Thin router over per-source helpers in ./_prospect-*.js.
 * Usage: /api/prospect-lookup?type=<type>
 *
 * Types:
 *   li           — WA L&I Contractor Registry
 *   or-ccb       — Oregon Construction Contractors Board
 *   sos          — Secretary of State entity lookup (WA, OR, AZ)
 *   osha         — OSHA inspection database
 *   sam          — SAM.gov federal entity registration
 *   places       — Google Places business profile
 *   ai-analysis  — AI commercial-underwriting dossier (auth required, POST)
 */

import { securityMiddleware } from '../lib/security.js';
import { isUpstreamTimeout, sendUpstreamTimeout } from './_fetch-timeout.js';
import { handleLILookup } from './_prospect-li.js';
import { handleORCCBLookup } from './_prospect-or-ccb.js';
import { handleSOSLookup } from './_prospect-sos.js';
import { handleOSHALookup } from './_prospect-osha.js';
import { handleSAMLookup } from './_prospect-sam.js';
import { handlePlacesLookup } from './_prospect-places.js';
import { handleAIAnalysis } from './_prospect-ai-analysis.js';

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { type } = req.query;
    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: type (must be "li", "sos", "osha", or "ai-analysis")'
      });
    }

    let result;
    switch (type) {
      case 'li':          result = await handleLILookup(req.query); break;
      case 'sos':         result = await handleSOSLookup(req.query); break;
      case 'or-ccb':      result = await handleORCCBLookup(req.query); break;
      case 'osha':        result = await handleOSHALookup(req.query); break;
      case 'ai-analysis': result = await handleAIAnalysis(req, res); break;
      case 'sam':         result = await handleSAMLookup(req.query); break;
      case 'places':      result = await handlePlacesLookup(req.query); break;
      default:
        return res.status(400).json({
          success: false,
          error: `Invalid type: ${type}. Must be "li", "sos", "or-ccb", "osha", "ai-analysis", "sam", or "places"`
        });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('[Prospect Lookup] Error:', error);
    if (isUpstreamTimeout(error)) return sendUpstreamTimeout(res, req.requestId);
    res.status(500).json({
      success: false,
      error: error.message,
      available: false
    });
  }
}

export default securityMiddleware(handler);
