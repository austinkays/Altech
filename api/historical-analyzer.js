import { securityMiddleware } from '../lib/security.js';
import { createRouter, extractJSON } from './_ai-router.js';

/**
 * Phase 5: Historical Data & Comparative Analysis
 * 
 * Analyze property history and market trends:
 * - Property value trends over time
 * - Market comparisons (neighborhood, county, state)
 * - Historical flood insurance rates
 * - Property appreciation/depreciation rates
 * - Market conditions timeline
 * - Risk assessment changes
 * 
 * Routes through user's chosen AI provider via _ai-router.js.
 * Falls back to Google Gemini via env key when no user settings provided.
 * 
 * IMPORTANT DISCLAIMERS:
 * - Historical values are AI estimates based on regional trends, NOT official appraisals
 * - Insurance rate projections are directional, not quotes
 * - Always verify with actual market data and professional appraisals
 */

/**
 * Analyze historical property values
 * 
 * @param {Object} options
 * @param {string} options.address - Property address
 * @param {string} options.city - City
 * @param {string} options.state - State
 * @param {number} options.yearBuilt - Year property was built
 * @param {number} options.lastKnownValue - Last known property value (optional)
 * @param {string} options.county - County name
 * @returns {Promise<Object>} Historical value analysis
 */
async function analyzeValueHistory(options, ai) {
  const { address, city, state, yearBuilt, lastKnownValue, county } = options;

  if (!address || !city || !state) {
    return {
      success: false,
      error: "Address, city, and state required",
      data: {}
    };
  }

  try {
    const systemPrompt = `You are a real estate market analyst specializing in residential property valuation. Provide data-driven estimates based on regional market trends, economic indicators, and historical patterns.

CRITICAL DISCLAIMERS TO INCLUDE:
- All values are AI estimates based on regional trends, NOT official appraisals
- Actual values may differ significantly based on property condition, improvements, and micro-market factors
- Always verify with a licensed appraiser for official valuations

Return ONLY valid JSON — no markdown, no code fences.`;

    const prompt = `Analyze property value trends for:
- Address: ${address}, ${city}, ${state}
- Year Built: ${yearBuilt || 'Unknown'}
- Last Known Value: ${lastKnownValue ? `$${lastKnownValue}` : 'Unknown'}
- County: ${county || 'Unknown'}

Provide a comprehensive value history analysis covering:
1. Estimated values at 10yr, 5yr, 3yr, 1yr ago, and current (based on regional trends)
2. Annual appreciation rate vs county/state averages
3. Major economic events affecting this region's real estate
4. How flood/wildfire risk trends have changed
5. Comparable property price ranges

Return JSON:
{
  "valueHistory": {
    "tenYearsAgo": { "year": 2016, "estimatedValue": 350000, "confidence": 0.75 },
    "fiveYearsAgo": { "year": 2021, "estimatedValue": 420000, "confidence": 0.80 },
    "threeYearsAgo": { "year": 2023, "estimatedValue": 480000, "confidence": 0.85 },
    "oneYearAgo": { "year": 2025, "estimatedValue": 520000, "confidence": 0.85 },
    "current": { "year": 2026, "estimatedValue": 550000, "confidence": 0.80 }
  },
  "appreciationRate": {
    "annualAverage": 0.065,
    "fiveYearRate": 0.31,
    "tenYearRate": 0.57,
    "comparison": "comparison to county average"
  },
  "marketTimeline": [
    { "year": 2016, "event": "description", "impact": "effect on values" }
  ],
  "currentTrend": "stable|rising|declining with detail",
  "riskAssessment": {
    "floodRisk": { "trend": "increasing|stable|decreasing", "reason": "explanation" },
    "wildfireRisk": { "trend": "increasing|stable|decreasing", "reason": "explanation" }
  },
  "comparables": {
    "neighborhood": { "avgValue": 525000, "range": "450000 - 650000" },
    "county": { "avgValue": 485000, "range": "300000 - 750000" },
    "positioning": "where this property sits relative to averages"
  },
  "disclaimer": "These are AI-generated estimates based on regional trends. Not an official appraisal.",
  "confidence": 0.75,
  "sources": ["Regional market data", "Historical trends", "Economic indicators"]
}`;

    const responseText = await ai.ask(systemPrompt, prompt, { temperature: 0.3, maxTokens: 2048 });

    const parsedData = extractJSON(responseText);
    if (parsedData) {
      return {
        success: true,
        data: parsedData,
        confidence: parsedData.confidence || 0.75,
        dataSource: "phase5-historical-values",
        aiProvider: ai.provider,
        timestamp: new Date().toISOString()
      };
    }

    return {
      success: true,
      data: { raw_response: responseText },
      confidence: 0.65,
      dataSource: "phase5-historical-values"
    };
  } catch (error) {
    console.error("Value history analysis error:", error.message);
    return {
      success: false,
      error: error.message,
      data: {}
    };
  }
}

/**
 * Analyze insurance history and trends
 * 
 * @param {Object} options
 * @param {string} options.address - Property address
 * @param {string} options.city - City
 * @param {string} options.state - State
 * @param {string} options.county - County name
 * @param {string} options.riskLevel - flood|wildfire|wind|all
 * @returns {Promise<Object>} Insurance history and trends
 */
async function analyzeInsuranceHistory(options, ai) {
  const { address, city, state, county, riskLevel = 'all' } = options;

  if (!county || !state) {
    return {
      success: false,
      error: "County and state required",
      data: {}
    };
  }

  try {
    const systemPrompt = `You are an insurance market analyst with deep knowledge of P&C insurance trends, NFIP rate changes, state regulatory actions, and catastrophe modeling. Provide specific, data-driven analysis.

IMPORTANT: Base analysis on known insurance market trends and regulatory changes. Clearly distinguish between historical facts and projections. Return ONLY valid JSON.`;

    const prompt = `Analyze insurance trends for property at: ${address || 'General area'}, ${city || ''}, ${state}, ${county} County.
Risk focus: ${riskLevel}

Provide analysis on:
1. Homeowners insurance rate trends (10yr, 5yr, 1yr, current averages for this county)
2. FEMA flood map changes and NFIP rate evolution (Risk Rating 2.0 impacts)
3. Wildfire insurance availability and carrier restrictions
4. Wind/weather insurance trends
5. 3-5 year rate predictions with specific actionable mitigations

Return JSON:
{
  "homeownersInsurance": {
    "historicalRates": [
      { "year": 2016, "avgRate": 1100, "avgValue": 350000, "ratePercent": 0.314 }
    ],
    "trend": "increasing|stable|decreasing",
    "causes": ["specific cause 1", "specific cause 2"]
  },
  "floodInsurance": {
    "available": true,
    "historicalRates": [{ "year": 2016, "avgRate": 650 }],
    "trend": "description",
    "reason": "NFIP Risk Rating 2.0, climate risk",
    "mapChanges": "specific FEMA map change info for this area"
  },
  "wildfireInsurance": {
    "available": true,
    "riskLevel": "low|moderate|high|very_high",
    "trend": "description of carrier behavior",
    "outlook": "future outlook"
  },
  "ratePrediction": {
    "nextThreeYears": "X-Y% annual increase likely",
    "factors": ["factor 1", "factor 2"],
    "mitigation": ["actionable step 1", "actionable step 2"]
  },
  "disclaimer": "Rate estimates based on market trends. Not a quote. Consult licensed agents for actual rates.",
  "confidence": 0.70,
  "sources": ["Insurance industry data", "Rate trends"]
}`;

    const responseText = await ai.ask(systemPrompt, prompt, { temperature: 0.3, maxTokens: 2048 });

    const parsedData = extractJSON(responseText);
    if (parsedData) {
      return {
        success: true,
        data: parsedData,
        confidence: parsedData.confidence || 0.70,
        dataSource: "phase5-insurance-history",
        aiProvider: ai.provider,
        timestamp: new Date().toISOString()
      };
    }

    return {
      success: true,
      data: { raw_response: responseText },
      confidence: 0.65,
      dataSource: "phase5-insurance-history"
    };
  } catch (error) {
    console.error("Insurance history error:", error.message);
    return {
      success: false,
      error: error.message,
      data: {}
    };
  }
}

/**
 * Compare property to market baseline
 * 
 * @param {Object} options
 * @param {number} options.propertyValue - Current estimated property value
 * @param {number} options.yearBuilt - Year built
 * @param {number} options.sqft - Square footage
 * @param {string} options.city - City
 * @param {string} options.state - State
 * @param {string} options.county - County
 * @returns {Promise<Object>} Comparison analysis
 */
async function compareToMarketBaseline(options, ai) {
  const { propertyValue, yearBuilt, sqft, city, state, county } = options;

  if (!propertyValue || !city || !state) {
    return {
      success: false,
      error: "Property value, city, and state required",
      data: {}
    };
  }

  try {
    const systemPrompt = `You are a real estate market analyst producing comparative market analyses. Base estimates on regional market data and economic indicators. Return ONLY valid JSON — no markdown.`;

    const prompt = `Compare this property to market baselines:
- Estimated Value: $${propertyValue}
- Year Built: ${yearBuilt || 'Unknown'}
- Square Footage: ${sqft || 'Unknown'} sq ft
- Location: ${city}, ${state}, ${county} County

Provide:
1. Fair market value assessment and price/sqft comparison
2. Neighborhood positioning vs similar properties
3. Market segment classification and days-on-market typical
4. Investment potential: appreciation likelihood, rental potential, improvements ROI
5. Actionable recommendations

Return JSON:
{
  "valuationAssessment": {
    "estimatedFairValue": 560000,
    "comparison": "assessment text",
    "pricePerSqft": 302,
    "marketAverage": 295,
    "assessment": "detailed assessment"
  },
  "neighborhoodPositioning": {
    "similar": { "range": "480000 - 620000", "median": 550000 },
    "yourProperty": "position description",
    "trend": "trend description",
    "demandLevel": "demand factors"
  },
  "marketSegment": {
    "segment": "segment name",
    "targetBuyers": "buyer description",
    "typicalDaysOnMarket": 28,
    "competitivePosition": "position description"
  },
  "investmentPotential": {
    "appreciationLikelihood": "outlook",
    "rentalPotential": "assessment",
    "riskFactors": ["factor 1"],
    "improvements": ["recommended improvement 1"],
    "roiIfImproved": "ROI estimate"
  },
  "recommendations": ["recommendation 1", "recommendation 2"],
  "disclaimer": "AI-generated market comparison. Not an official appraisal.",
  "confidence": 0.80
}`;

    const responseText = await ai.ask(systemPrompt, prompt, { temperature: 0.3, maxTokens: 2048 });

    const parsedData = extractJSON(responseText);
    if (parsedData) {
      return {
        success: true,
        data: parsedData,
        confidence: parsedData.confidence || 0.80,
        dataSource: "phase5-market-comparison",
        aiProvider: ai.provider,
        timestamp: new Date().toISOString()
      };
    }

    return {
      success: true,
      data: { raw_response: responseText },
      confidence: 0.70,
      dataSource: "phase5-market-comparison"
    };
  } catch (error) {
    console.error("Market comparison error:", error.message);
    return {
      success: false,
      error: error.message,
      data: {}
    };
  }
}

/**
 * Generate property timeline report
 * 
 * @param {Object} options - All above combined
 * @returns {Promise<Object>} Comprehensive timeline analysis
 */
async function generateTimelineReport(options, ai) {
  const { address, city, state, county, yearBuilt, propertyValue, sqft } = options;

  try {
    const systemPrompt = `You are a property historian and insurance advisor creating comprehensive property timelines. Combine construction era knowledge, economic history, and insurance trends into actionable insights. Return ONLY valid JSON.`;

    const prompt = `Create a comprehensive property timeline report:
- Property: ${address || 'Property'}, ${city}, ${state}, ${county} County
- Year Built: ${yearBuilt || 'Unknown'}
- Current Value: $${propertyValue || 'Unknown'}
- Square Footage: ${sqft || 'Unknown'}

Cover: construction era standards/common issues, economic/market history, risk evolution, insurance evolution, and 5-10 year outlook.

Return JSON:
{
  "timeline": [
    { "year": 1985, "event": "event description", "context": "background", "relevance": "insurance relevance" }
  ],
  "constructionEraIssues": ["issue 1 (specific to the year built)", "issue 2"],
  "valueProjection": {
    "current": 550000,
    "fiveYears": 640000,
    "tenYears": 740000,
    "assumptions": ["assumption 1"]
  },
  "riskProjection": {
    "flood": "trend description",
    "insurance": "cost trend description",
    "physical": "maintenance needs description"
  },
  "recommendations": ["actionable recommendation 1", "recommendation 2"],
  "disclaimer": "AI-generated estimates. Verify with professionals.",
  "confidence": 0.75
}`;

    const responseText = await ai.ask(systemPrompt, prompt, { temperature: 0.3, maxTokens: 2048 });

    const parsedData = extractJSON(responseText);
    if (parsedData) {
      return {
        success: true,
        data: parsedData,
        confidence: parsedData.confidence || 0.75,
        dataSource: "phase5-timeline-report",
        aiProvider: ai.provider,
        timestamp: new Date().toISOString()
      };
    }

    return {
      success: true,
      data: { raw_response: responseText },
      confidence: 0.70,
      dataSource: "phase5-timeline-report"
    };
  } catch (error) {
    console.error("Timeline report error:", error.message);
    return {
      success: false,
      error: error.message,
      data: {}
    };
  }
}

/**
 * Vercel serverless handler
 */
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, address, city, state, county, yearBuilt, propertyValue, sqft, riskLevel, aiSettings } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Action required' });
  }

  const ai = createRouter(aiSettings);

  try {
    let result;

    switch (action) {
      case 'analyzeValues':
        result = await analyzeValueHistory({
          address: address || '',
          city: city || '',
          state: state || '',
          yearBuilt: yearBuilt || null,
          lastKnownValue: propertyValue || null,
          county: county || ''
        }, ai);
        break;

      case 'analyzeInsurance':
        result = await analyzeInsuranceHistory({
          address: address || '',
          city: city || '',
          state: state || '',
          county: county || '',
          riskLevel: riskLevel || 'all'
        }, ai);
        break;

      case 'compareMarket':
        result = await compareToMarketBaseline({
          propertyValue: propertyValue || 0,
          yearBuilt: yearBuilt || null,
          sqft: sqft || null,
          city: city || '',
          state: state || '',
          county: county || ''
        }, ai);
        break;

      case 'generateTimeline':
        result = await generateTimelineReport({
          address: address || '',
          city: city || '',
          state: state || '',
          county: county || '',
          yearBuilt: yearBuilt || null,
          propertyValue: propertyValue || null,
          sqft: sqft || null
        }, ai);
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Historical analyzer error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export default securityMiddleware(handler);
