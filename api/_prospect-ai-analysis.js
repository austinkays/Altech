/**
 * AI-powered commercial underwriting analysis.
 * Aggregates L&I, SOS, OSHA, SAM, and Google Places data into a structured
 * prompt and asks the AI (via the multi-provider router) to produce a
 * dossier with a fixed-shape JSON response.
 *
 * Uses Google Search grounding when the provider is Google.
 */

import { verifyFirebaseToken } from '../lib/security.js';
import { createRouter, extractJSON } from './_ai-router.js';

export async function handleAIAnalysis(req, res) {
  if (req.method !== 'POST') {
    return { success: false, error: 'POST method required for AI analysis' };
  }

  // Require auth (AI analysis consumes quota)
  const user = await verifyFirebaseToken(req);
  if (!user) {
    return { success: false, error: 'Authentication required for AI analysis.' };
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return { success: false, error: 'Invalid JSON body' };
  }

  const { businessName, state, li, sos, osha, sam, places, aiSettings } = body;
  const ai = createRouter(aiSettings);

  const dataContext = buildDataContext(businessName, state, li, sos, osha, sam, places);

  // Count how many data sources returned useful data
  const hasLI = li && !li.error && li.contractor;
  const hasSOS = sos && !sos.error && sos.entity;
  const hasOSHA = osha && !osha.error && osha.summary;
  const hasSAM = sam && sam.available && sam.entities?.length > 0;
  const hasPlaces = places && places.available && places.profile;
  const sourcesAvailable = [hasLI, hasSOS, hasOSHA, hasSAM, hasPlaces].filter(Boolean).length;

  const systemPrompt = `You are an expert commercial insurance underwriter, risk analyst, and business intelligence researcher. You produce thorough prospect dossiers for insurance producers. ${ai.isGoogle ? 'Use Google Search grounding to research the business independently beyond the provided data.' : 'Augment the provided data with your own knowledge where possible.'} Return ONLY valid JSON — no markdown, no code fences.`;

  const userPrompt = `## Data Collection Results
The following data was gathered from public records APIs and Google Places. Some sources may have failed (captchas, rate limits, or the business simply isn't in that database). **When data sources failed or returned nothing, use your knowledge to fill gaps.** Do not just report "no data available" — actively analyze this business from every angle.

${sourcesAvailable === 0 ? '⚠️ ALL automated data sources failed. You MUST use your own knowledge to research this business independently.\n' : `${sourcesAvailable}/5 data sources returned results.\n`}
${(!sos || !sos.entity) ? '⚠️ SECRETARY OF STATE DATA GAP: SOS entity data was unavailable (anti-bot protection or lookup failure). Entity type, formation date, registered agent, and officers/governors are UNKNOWN. You MUST flag this in riskAssessment, redFlags, and underwritingNotes. Use your knowledge to infer entity structure where possible, but clearly mark inferences as unverified.\n' : ''}

${dataContext}

## Your Task
Research "${businessName}" in ${state} THOROUGHLY. Find everything about this business:
- Website URL, social media accounts (Facebook, LinkedIn, Instagram, Yelp, BBB, etc.)
- Physical location details: building type, estimated square footage, owned vs leased
- Services offered, service area/geographic coverage
- Business history: founding date, milestones, growth trajectory, acquisitions
- Ownership structure, key personnel, number of employees
- Revenue estimates, fleet size, number of projects, equipment
- Customer reviews, reputation, complaints, BBB rating
- News articles, press releases, awards, certifications
- Legal filings, lawsuits, judgments
- Competitor landscape and market position in their area

Produce a JSON response with these EXACT keys (all string values unless noted — be detailed and specific, never vague):

{
  "executiveSummary": "2-3 sentence overview: (1) what the business does, (2) size/age indicators (employees, revenue, years), (3) overall risk posture. Do NOT repeat details covered in other fields. Be concise and actionable.",
  "riskRating": "Just one word: LOW / MODERATE / ELEVATED / HIGH / CRITICAL",
  "estimatedEmployees": "Number or range string, e.g. '6-8' or '25'",
  "estimatedRevenue": "Annual revenue range string, e.g. '$600,000 - $1,280,000'",
  "yearsInBusiness": "Number, e.g. 27. Compute from founding date if known.",
  "businessProfile": "Comprehensive profile: what the business does day-to-day, all services offered, specialties, entity structure, ownership details, management team if known, estimated employee count, estimated annual revenue range, years in business, growth trajectory. Paint a full picture.",
  "serviceArea": "Geographic coverage: cities, counties, or regions they serve. If a contractor, where they typically work. If multi-location, list all locations. Include any out-of-state work. Be specific to their market.",
  "website": "The business's primary website URL. If no website exists, say 'No website found'.",
  "socialMedia": "List ONE platform per line. Format each as 'Platform: URL or handle'. Include: Google Business, Facebook, LinkedIn, Instagram, Yelp, BBB, Angi/HomeAdvisor, Nextdoor, industry directories. If a platform is not found, say 'Platform: Not found'. Example:\\nGoogle Business: https://...\\nFacebook: https://...\\nLinkedIn: Not found",
  "buildingInfo": "Physical premises details: building type (office, warehouse, retail, mixed-use), estimated square footage, owned vs leased, any notable features (yard, shop, warehouse space), parking, signage. If they work from a commercial location vs home-based. Multiple locations if applicable.",
  "businessHistory": "Founding story and timeline: when established, by whom, major milestones, mergers/acquisitions, name changes, ownership transitions, notable projects, growth phases, any periods of difficulty. Include dates where possible.",
  "keyPersonnel": "List ONE person per line. Format: 'Name (Title/Role) — credentials/notes'. Include owners, officers, principals, key management. Cross-reference SOS governors, L&I owners, and web presence. Example:\\nNeil Worland (Owner) — Licensed Agent, Commercial Lines\\nJane Smith (Office Manager) — CIC certified 2015",
  "riskAssessment": "Thorough risk analysis covering: license/compliance status, OSHA history, entity standing, financial stability indicators, operational risks, industry-specific hazards, litigation exposure, reputation risks. Justify your riskRating with clear evidence.",
  "redFlags": "List ALL specific concerns as numbered items. Include: expired/missing licenses, OSHA violations, inactive status, recent formation, negative reviews, lawsuits, high-risk operations, missing data that should exist, BBB complaints, legal actions, liens, judgments. If genuinely none, say 'No significant red flags identified.'",
  "recommendedCoverages": "List ONE coverage per line. Format: 'Coverage Name: $limit details (reason)'. Include as applicable: GL, WC (by class code), Commercial Auto, Umbrella/Excess, E&O, Builders Risk, Inland Marine, Cyber, EPLI, D&O, Commercial Property (building + BPP), Business Income, Equipment Breakdown, Pollution, Installation Floater. Example:\\nGeneral Liability (CGL): $1,000,000/$2,000,000 (premises liability, advertising injury)\\nWorkers Comp: Class 8810 - Clerical ($X per $100 payroll)\\nCyber Liability: $250,000-$500,000 (client data protection)",
  "glClassification": "The most likely ISO GL class code(s) with descriptions, e.g. '91302 - Janitorial Services' or '58122 - Restaurants'. If multiple operations, list each. Format: 'XXXXX - Description'.",
  "naicsAnalysis": "Primary and secondary NAICS codes with descriptions. Explain what they indicate about operations and insurance implications.",
  "underwritingNotes": "Specific items the underwriter should verify as numbered action items: loss runs (how many years), safety programs, prior carrier info, subcontractor management (certificates, additional insured requirements), fleet size, payroll by class code, square footage, revenue breakdown, contractual obligations, employee count by location. Be actionable and thorough.",
  "competitiveIntel": "Business intelligence: estimated premium range for their risk profile, likely current coverage gaps, price sensitivity indicators, growth trajectory, best approach for the producer, key selling points, renewal timing estimates, what competitors might be offering, any leverage points."
}`;

  try {
    const searchResult = await ai.askWithSearch(systemPrompt, userPrompt, {
      temperature: 0.3,
      maxTokens: 12288
    });

    const rawText = searchResult?.text || (typeof searchResult === 'string' ? searchResult : '');
    if (!rawText) {
      console.error('[AI Analysis] Empty AI response');
      return { success: false, error: 'AI returned empty response' };
    }

    const analysis = extractJSON(rawText);
    if (!analysis) {
      console.error('[AI Analysis] Failed to parse AI response:', rawText.substring(0, 500));
      return { success: false, error: 'AI returned invalid response format' };
    }

    return {
      success: true,
      source: `${ai.provider} AI (Commercial Underwriting Analysis)`,
      groundedSearch: searchResult?.grounded || ai.isGoogle,
      aiProvider: ai.provider,
      analysis
    };
  } catch (error) {
    console.error('[AI Analysis] Error:', error);
    return { success: false, error: `AI analysis failed: ${error.message}` };
  }
}

/**
 * Build a markdown data context from all investigation sources.
 * Caller passes whatever they have (li/sos/osha/sam/places may be null).
 */
function buildDataContext(businessName, state, li, sos, osha, sam, places) {
  const sections = [`**Business Name:** ${businessName || 'Unknown'}`, `**State:** ${state || 'Unknown'}`];

  // L&I / Contractor data
  if (li && !li.error && li.contractor) {
    const c = li.contractor;
    sections.push(`\n### Contractor License (${state === 'OR' ? 'OR CCB' : 'WA L&I'})`);
    sections.push(`- License #: ${c.licenseNumber || 'N/A'}`);
    sections.push(`- Status: ${c.status || 'Unknown'}`);
    sections.push(`- Type: ${c.licenseType || 'N/A'}`);
    sections.push(`- Classifications: ${(c.classifications || []).join(', ') || 'N/A'}`);
    sections.push(`- Expiration: ${c.expirationDate || 'N/A'}`);
    sections.push(`- Registration Date: ${c.registrationDate || 'N/A'}`);
    if (c.bondAmount) sections.push(`- Bond Amount: ${c.bondAmount}`);
    if (c.bondCompany) sections.push(`- Bond Company: ${c.bondCompany}`);
    if (c.insuranceCompany) sections.push(`- Insurance Company: ${c.insuranceCompany}`);
    if (c.insuranceAmount) sections.push(`- Insurance Amount: ${c.insuranceAmount}`);
    if (c.owners && c.owners.length > 0) {
      const ownerNames = c.owners.map(o => typeof o === 'string' ? o : o.name).filter(Boolean);
      sections.push(`- Owners/Principals: ${ownerNames.join(', ')}`);
    }
    if (c.address) sections.push(`- Address: ${c.address.street || ''}, ${c.address.city || ''} ${c.address.state || ''} ${c.address.zip || ''}`);
    if (c.violations && c.violations.length > 0) sections.push(`- ⚠️ Violations: ${c.violations.join('; ')}`);
  } else if (li && li.error) {
    sections.push(`\n### Contractor License: ${li.error}`);
  } else {
    sections.push(`\n### Contractor License: No data available`);
  }

  // Secretary of State
  if (sos && !sos.error && sos.entity) {
    const e = sos.entity;
    sections.push(`\n### Secretary of State — Business Entity`);
    if (e.partialData) {
      sections.push(`- ⚠️ PARTIAL DATA (source: ${e.dataSource || 'alternate lookup'}) — full SOS record could not be retrieved`);
      sections.push(`- Missing: registered agent, officers/governors, formation jurisdiction may be unavailable`);
    }
    sections.push(`- UBI: ${e.ubi || 'N/A'}`);
    sections.push(`- Entity Type: ${e.entityType || 'N/A'}`);
    sections.push(`- Status: ${e.status || 'Unknown'}`);
    sections.push(`- Formation Date: ${e.formationDate || 'N/A'}`);
    sections.push(`- Jurisdiction: ${e.jurisdiction || 'N/A'}`);
    if (e.businessActivity) sections.push(`- Business Activity: ${e.businessActivity}`);
    if (e.registeredAgent?.name) sections.push(`- Registered Agent: ${e.registeredAgent.name}`);
    if (e.governors && e.governors.length > 0) {
      sections.push(`- Governors/Officers: ${e.governors.map(g => `${g.name} (${g.title || 'Governor'})`).join(', ')}`);
    }
  } else if (sos && sos.manualSearch) {
    sections.push(`\n### Secretary of State — Business Entity`);
    sections.push(`- ⚠️ DATA UNAVAILABLE: SOS lookup required manual browser verification (anti-bot protection)`);
    sections.push(`- Entity type, formation date, registered agent, and officers are UNKNOWN`);
    sections.push(`- This is a significant underwriting data gap — flag for manual verification`);
  } else if (sos && sos.error) {
    sections.push(`\n### Business Entity: ${sos.error}`);
  } else {
    sections.push(`\n### Secretary of State: No data available — flag as underwriting gap`);
  }

  // OSHA
  if (osha && !osha.error && osha.summary) {
    sections.push(`\n### OSHA Inspection History`);
    sections.push(`- Total Inspections: ${osha.summary.totalInspections || 0}`);
    sections.push(`- Serious Violations: ${osha.summary.seriousViolations || 0}`);
    sections.push(`- Willful Violations: ${osha.summary.willfulViolations || 0}`);
    sections.push(`- Repeat Violations: ${osha.summary.repeatViolations || 0}`);
    sections.push(`- Total Penalties: $${(osha.summary.totalPenalties || 0).toLocaleString()}`);
    if (osha.inspections && osha.inspections.length > 0) {
      const latest = osha.inspections[0];
      sections.push(`- Most Recent Inspection: ${latest.inspectionDate || 'N/A'} (${latest.inspectionType || 'Unknown'})`);
      if (latest.naicsCode) sections.push(`- NAICS Code: ${latest.naicsCode} (${latest.naicsDescription || ''})`);
      if (latest.sicCode) sections.push(`- SIC Code: ${latest.sicCode} (${latest.sicDescription || ''})`);
    }
  } else if (osha && osha.error) {
    sections.push(`\n### OSHA: ${osha.error}`);
  } else {
    sections.push(`\n### OSHA: No violations found`);
  }

  // SAM.gov
  if (sam && sam.available && sam.entities && sam.entities.length > 0) {
    const e = sam.entities[0];
    sections.push(`\n### SAM.gov — Federal Registration`);
    sections.push(`- UEI: ${e.ueiSAM || 'N/A'}`);
    sections.push(`- CAGE Code: ${e.cageCode || 'N/A'}`);
    sections.push(`- Entity Type: ${e.entityType || 'N/A'}`);
    sections.push(`- Structure: ${e.entityStructure || 'N/A'}`);
    sections.push(`- Profit Structure: ${e.profitStructure || 'N/A'}`);
    sections.push(`- Registration Status: ${e.registrationStatus || 'N/A'}`);
    sections.push(`- Activation: ${e.activationDate || 'N/A'}`);
    sections.push(`- Expiration: ${e.expirationDate || 'N/A'}`);
    if (e.naicsCodes && e.naicsCodes.length > 0) {
      sections.push(`- NAICS Codes: ${e.naicsCodes.map(n => `${n.code}${n.isPrimary ? ' (primary)' : ''}`).join(', ')}`);
    }
  } else {
    sections.push(`\n### SAM.gov: No federal registration found (business may not have federal contracts)`);
  }

  // Google Places
  if (places && places.available && places.profile) {
    const p = places.profile;
    sections.push(`\n### Google Places — Business Profile`);
    if (p.name) sections.push(`- Google Business Name: ${p.name}`);
    if (p.address) sections.push(`- Address: ${p.address}`);
    if (p.phone) sections.push(`- Phone: ${p.phone}`);
    if (p.website) sections.push(`- Website: ${p.website}`);
    if (p.rating) sections.push(`- Google Rating: ${p.rating}/5 (${p.totalReviews || 0} reviews)`);
    if (p.businessStatus) sections.push(`- Business Status: ${p.businessStatus}`);
    if (p.types?.length) sections.push(`- Categories: ${p.types.join(', ')}`);
    if (p.hours?.length) sections.push(`- Hours: ${p.hours.join('; ')}`);
    if (p.reviews?.length) {
      sections.push(`- Recent Reviews:`);
      for (const r of p.reviews.slice(0, 3)) {
        sections.push(`  - ${r.rating}★ by ${r.author}: "${r.text.substring(0, 150)}${r.text.length > 150 ? '...' : ''}"`);
      }
    }
  } else {
    sections.push(`\n### Google Places: Not available or business not found on Google Maps`);
  }

  return sections.join('\n');
}
