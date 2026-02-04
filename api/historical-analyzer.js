import { GoogleGenerativeAI } from "@google/generative-ai";

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
 * Temperature: 0.3 (analysis-based, slightly more reasoning)
 * Model: gemini-2.0-flash-001
 */

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

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
async function analyzeValueHistory(options) {
  const { address, city, state, yearBuilt, lastKnownValue, county } = options;

  if (!address || !city || !state) {
    return {
      success: false,
      error: "Address, city, and state required",
      data: {}
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });

    const prompt = `You are a real estate market analyst. Based on historical data patterns and market knowledge, analyze property value trends.

Property Details:
- Address: ${address}, ${city}, ${state}
- Year Built: ${yearBuilt || 'Unknown'}
- Last Known Value: ${lastKnownValue ? `$${lastKnownValue}` : 'Unknown'}
- County: ${county || 'Unknown'}

Provide Analysis:

1. ESTIMATED VALUE HISTORY (5-year intervals if possible)
   - Estimate values for: 10 years ago, 5 years ago, 3 years ago, 1 year ago, current
   - Base estimates on regional market trends
   - Consider inflation, property age, market cycles

2. APPRECIATION RATE
   - Annual appreciation percentage (typical for this area)
   - Compare to county and state averages
   - Account for market cycles

3. MARKET CONDITIONS TIMELINE
   - Major economic events affecting real estate (2008 crash, 2020 pandemic, etc.)
   - How they impacted this county/region
   - Current market trend (rising/stable/declining)

4. RISK FACTORS OVER TIME
   - How flood risk has changed (climate, building codes)
   - How wildfire risk has changed (climate, vegetation)
   - Historical insurance rate trends

5. COMPARABLE PROPERTIES
   - Similar properties in neighborhood
   - Price range for same year/size/condition
   - Market positioning (above/below average)

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
    "comparison": "Above county average (3.2% annually)"
  },
  "marketTimeline": [
    { "year": 2016, "event": "Post-2008 recovery", "impact": "slow growth" },
    { "year": 2020, "event": "COVID-19 pandemic", "impact": "surge in demand" },
    { "year": 2024, "event": "Interest rate increases", "impact": "cooling market" }
  ],
  "currentTrend": "stable with slight upward pressure",
  "riskAssessment": {
    "floodRisk": { "trend": "increasing", "reason": "Climate change, increased precipitation" },
    "wildfireRisk": { "trend": "stable", "reason": "Distance from wildland interface" }
  },
  "comparables": {
    "neighborhood": { "avgValue": 525000, "range": "450000 - 650000" },
    "county": { "avgValue": 485000, "range": "300000 - 750000" },
    "positioning": "Slightly above neighborhood average"
  },
  "confidence": 0.75,
  "sources": ["Regional market data", "Historical trends", "Economic indicators"]
}`;

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1500
      }
    });

    const responseText = response.content.parts[0].text;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedData = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          data: parsedData,
          confidence: parsedData.confidence || 0.75,
          dataSource: "phase5-historical-values",
          timestamp: new Date().toISOString()
        };
      }
    } catch (parseError) {
      return {
        success: true,
        data: { raw_response: responseText },
        confidence: 0.65,
        dataSource: "phase5-historical-values"
      };
    }
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
async function analyzeInsuranceHistory(options) {
  const { address, city, state, county, riskLevel = 'all' } = options;

  if (!county || !state) {
    return {
      success: false,
      error: "County and state required",
      data: {}
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });

    const prompt = `You are an insurance expert analyzing historical insurance trends and risk.

Property Location: ${address || 'General'}, ${city || 'Area'}, ${state}, ${county} County

Risk Assessment Type: ${riskLevel}

Analyze historical insurance trends:

1. HOMEOWNERS INSURANCE TRENDS
   - Average rates 10 years ago, 5 years ago, 1 year ago, current
   - Rate increase/decrease percentage
   - Factors driving changes (claims, market competition, regulations)

2. FLOOD INSURANCE HISTORY
   - Has FEMA flood maps changed for this area?
   - Historical flood claims in county
   - Insurance availability and cost trends
   - Future outlook (climate change, development)

3. WILDFIRE INSURANCE
   - Availability trends (especially in high-risk areas)
   - Rate changes over time
   - Company participation changes
   - Risk outlook

4. WIND/WEATHER INSURANCE
   - Hurricane/wind insurance availability
   - Cost trends
   - Risk factors for this location

5. RATE PREDICTIONS
   - Likely insurance rate trends (next 3-5 years)
   - Factors that could accelerate/mitigate increases
   - Recommendations for property owner

Return JSON:
{
  "homeownersInsurance": {
    "historicalRates": [
      { "year": 2016, "avgRate": 1100, "avgValue": 350000, "ratePercent": 0.314 },
      { "year": 2020, "avgRate": 1400, "avgValue": 420000, "ratePercent": 0.333 },
      { "year": 2025, "avgRate": 1800, "avgValue": 520000, "ratePercent": 0.346 },
      { "year": 2026, "avgRate": 1950, "avgValue": 550000, "ratePercent": 0.355 }
    ],
    "trend": "increasing",
    "causes": ["Material cost inflation", "Increased claims frequency", "Market consolidation"]
  },
  "floodInsurance": {
    "available": true,
    "historicalRates": [
      { "year": 2016, "avgRate": 650 },
      { "year": 2026, "avgRate": 950 }
    ],
    "trend": "increasing significantly",
    "reason": "NFIP rate adjustments, climate risk",
    "mapChanges": "Potential future updates based on climate models"
  },
  "wildfireInsurance": {
    "available": true,
    "riskLevel": "moderate",
    "trend": "rates increasing, some carriers restricting coverage",
    "outlook": "Continued restrictions likely in high-risk areas"
  },
  "ratePrediction": {
    "nextThreeYears": "6-8% annual increase likely",
    "factors": [
      "Climate change impacts",
      "Increased claim frequency",
      "Reinsurance cost increases"
    ],
    "mitigation": [
      "Home hardening improvements",
      "Reduce wildfire risk (defensible space)",
      "Shop competitors annually"
    ]
  },
  "confidence": 0.70,
  "sources": ["Insurance industry data", "Rate trends", "Risk modeling"]
}`;

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1500
      }
    });

    const responseText = response.content.parts[0].text;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedData = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          data: parsedData,
          confidence: parsedData.confidence || 0.70,
          dataSource: "phase5-insurance-history",
          timestamp: new Date().toISOString()
        };
      }
    } catch (parseError) {
      return {
        success: true,
        data: { raw_response: responseText },
        confidence: 0.65,
        dataSource: "phase5-insurance-history"
      };
    }
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
async function compareToMarketBaseline(options) {
  const { propertyValue, yearBuilt, sqft, city, state, county } = options;

  if (!propertyValue || !city || !state) {
    return {
      success: false,
      error: "Property value, city, and state required",
      data: {}
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });

    const prompt = `You are a real estate market analyst. Compare this property to market baselines.

Property:
- Estimated Value: $${propertyValue}
- Year Built: ${yearBuilt || 'Unknown'}
- Square Footage: ${sqft || 'Unknown'} sq ft
- Location: ${city}, ${state}, ${county} County

Provide Market Comparison:

1. VALUATION ASSESSMENT
   - Fair market value estimate
   - Overvalued/undervalued assessment
   - Price per square foot comparison

2. NEIGHBORHOOD POSITIONING
   - Compared to similar properties
   - Price trends in neighborhood
   - Buyer demand factors

3. MARKET SEGMENT
   - Entry-level / Mid-range / Luxury
   - Target buyer demographics
   - Days on market typical for this segment

4. INVESTMENT POTENTIAL
   - Appreciation likelihood
   - Rental potential (if applicable)
   - Risk factors
   - Opportunities for improvement

5. RECOMMENDATIONS
   - Best use cases for this property
   - Suggested improvements
   - Timing considerations
   - Risk mitigation strategies

Return JSON:
{
  "valuationAssessment": {
    "estimatedFairValue": 560000,
    "comparison": "Fairly valued, in line with market",
    "pricePerSqft": 302,
    "marketAverage": 295,
    "assessment": "Slightly above average (typical for quality)"
  },
  "neighborhoodPositioning": {
    "similar": { "range": "480000 - 620000", "median": 550000 },
    "yourProperty": "At market median",
    "trend": "Steady appreciation 3-4% annually",
    "demandLevel": "High (good schools, proximity to employment)"
  },
  "marketSegment": {
    "segment": "Mid-range residential",
    "targetBuyers": "Growing families, professionals",
    "typicalDaysOnMarket": 28,
    "competitivePosition": "Moderate (good value, established neighborhood)"
  },
  "investmentPotential": {
    "appreciationLikelihood": "Moderate (3-4% annually expected)",
    "rentalPotential": "Good (neighborhood attracts renters)",
    "riskFactors": ["Interest rate sensitivity", "School district changes"],
    "improvements": ["Kitchen update", "Exterior refresh"],
    "roiIfImproved": "6-8% over 5 years with $20k improvements"
  },
  "recommendations": [
    "Good buy at current price point",
    "Prioritize kitchen and exterior updates",
    "Lock in rate before anticipated increases",
    "Monitor flood insurance rates (increasing 5%+ annually)"
  ],
  "confidence": 0.80,
  "sources": ["Market data", "Comparable sales", "Economic indicators"]
}`;

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1500
      }
    });

    const responseText = response.content.parts[0].text;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedData = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          data: parsedData,
          confidence: parsedData.confidence || 0.80,
          dataSource: "phase5-market-comparison",
          timestamp: new Date().toISOString()
        };
      }
    } catch (parseError) {
      return {
        success: true,
        data: { raw_response: responseText },
        confidence: 0.70,
        dataSource: "phase5-market-comparison"
      };
    }
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
async function generateTimelineReport(options) {
  const { address, city, state, county, yearBuilt, propertyValue, sqft } = options;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });

    const prompt = `Create a comprehensive property timeline report.

Property: ${address || 'Property'}, ${city}, ${state}, ${county} County
Year Built: ${yearBuilt || 'Unknown'}
Current Value: $${propertyValue || 'Unknown'}

Generate a timeline covering:

1. CONSTRUCTION ERA
   - Building code standards of the time
   - Common issues for properties built in ${yearBuilt}
   - Major upgrades likely needed by now

2. ECONOMIC/MARKET HISTORY
   - Market conditions when built
   - Major events affecting property values
   - Current market position in cycle

3. RISK EVOLUTION
   - How flood/wildfire/wind risk has changed
   - Building code improvements since construction
   - Mitigation opportunities

4. INSURANCE EVOLUTION
   - Product availability changes
   - Rate trend history
   - Future outlook

5. FUTURE OUTLOOK (Next 5-10 years)
   - Value projections
   - Risk projections
   - Insurance cost projections

Return JSON:
{
  "timeline": [
    {
      "year": 1985,
      "event": "Property constructed",
      "context": "Post-1984 building codes, common construction methods",
      "relevance": "Likely needs roof/HVAC updates by now"
    },
    {
      "year": 2008,
      "event": "Financial crisis",
      "context": "Real estate market crash, property values declined 20%+",
      "relevance": "If purchased then, excellent value positioning"
    },
    {
      "year": 2020,
      "event": "COVID-19 pandemic",
      "context": "Remote work boom, property values surged",
      "relevance": "Significant appreciation occurred"
    },
    {
      "year": 2024,
      "event": "Interest rate normalization",
      "context": "Market cooling after 2020-2023 surge",
      "relevance": "Current buyer market conditions favorable"
    }
  ],
  "constructionEraIssues": [
    "Single-pane windows (consider upgrade)",
    "Older HVAC systems (replacement due)",
    "Asbestos potential (pre-1980s)",
    "Foundation settling common (inspect)"
  ],
  "valueProjection": {
    "current": 550000,
    "fiveYears": 640000,
    "tenYears": 740000,
    "assumptions": ["3.5% annual appreciation", "No major economic crisis"]
  },
  "riskProjection": {
    "flood": "Increasing due to climate change",
    "insurance": "Costs up 5-7% annually",
    "physical": "Roof/HVAC replacement likely within 5 years"
  },
  "recommendations": [
    "Proactive maintenance to protect value",
    "Consider improvements to offset insurance increases",
    "Monitor flood insurance changes (likely to increase)",
    "Plan major system replacements (roof, HVAC)"
  ],
  "confidence": 0.75
}`;

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2000
      }
    });

    const responseText = response.content.parts[0].text;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedData = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          data: parsedData,
          confidence: parsedData.confidence || 0.75,
          dataSource: "phase5-timeline-report",
          timestamp: new Date().toISOString()
        };
      }
    } catch (parseError) {
      return {
        success: true,
        data: { raw_response: responseText },
        confidence: 0.70,
        dataSource: "phase5-timeline-report"
      };
    }
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
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, address, city, state, county, yearBuilt, propertyValue, sqft, riskLevel } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Action required' });
  }

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
        });
        break;

      case 'analyzeInsurance':
        result = await analyzeInsuranceHistory({
          address: address || '',
          city: city || '',
          state: state || '',
          county: county || '',
          riskLevel: riskLevel || 'all'
        });
        break;

      case 'compareMarket':
        result = await compareToMarketBaseline({
          propertyValue: propertyValue || 0,
          yearBuilt: yearBuilt || null,
          sqft: sqft || null,
          city: city || '',
          state: state || '',
          county: county || ''
        });
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
        });
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
