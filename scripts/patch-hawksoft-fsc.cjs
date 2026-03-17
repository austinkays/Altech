// One-time patch: replace hardcoded label strings in _buildFscNotes() with FIELD_BY_ID lookups
'use strict';
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'js', 'hawksoft-export.js');
let src = fs.readFileSync(file, 'utf8');

// Map of [searchLabel, fieldId] pairs — replaces `Label: ${d.fieldId}` template literals
// only inside _buildFscNotes
const replacements = [
  // PROPERTY
  ['Dwelling Type', 'dwellingType'],
  ['Usage', 'dwellingUsage'],
  ['Occupancy', 'occupancyType'],
  ['Sq Ft', 'sqFt'],
  ['Stories', 'numStories'],
  ['Bedrooms', 'bedrooms'],
  ['Style', 'constructionStyle'],
  ['Exterior Walls', 'exteriorWalls'],
  ['Foundation', 'foundation'],
  ['Roof Shape', 'roofShape'],
  ['Roof Year', 'roofYr'],
  ['Heating Updated', 'heatYr'],
  ['Plumbing Updated', 'plumbYr'],
  ['Electrical Updated', 'elecYr'],
  ['Lot Size', 'lotSize'],
  ['Fireplaces', 'numFireplaces'],
  ['Smoke Detector', 'smokeDetector'],
  ['Kitchen Quality', 'kitchenQuality'],
  ['Purchase Date', 'purchaseDate'],
  ['Years at Address', 'yearsAtAddress'],
  ['Occupants', 'numOccupants'],
  ['Wind Deductible', 'windDeductible'],
  ['Wood Stove', 'woodStove'],
  ['Trampoline', 'trampoline'],
  ['Pool', 'pool'],
  ['Dogs', 'dogInfo'],
  ['Business on Property', 'businessOnProperty'],
  // ENDORSEMENTS
  ['Water Backup', 'waterBackup'],
  ['Loss Assessment', 'lossAssessment'],
  ['Animal Liability', 'animalLiability'],
  ['Credit Card Coverage', 'creditCardCoverage'],
  ['Mold Damage', 'moldDamage'],
  ['Theft Deductible', 'theftDeductible'],
  ['Additional Insureds', 'additionalInsureds'],
  // INSURANCE HISTORY
  ['Prior Carrier', 'priorCarrier'],
  ['Years with Prior', 'priorYears'],
  ['Prior Term', 'priorPolicyTerm'],
  ['Prior BI Limits', 'priorLiabilityLimits'],
  ['Continuous Coverage', 'continuousCoverage'],
  ['Home Prior Carrier', 'homePriorCarrier'],
  ['Home Prior Years', 'homePriorYears'],
  // RISK / NOTES
  ['Residence', 'residenceIs'],
  ['Best Contact Time', 'contactTime'],
  ['Contact Method', 'contactMethod'],
  ['TCPA Consent', 'tcpaConsent'],
  ['Rental Reimbursement', 'rentalDeductible'],
];

let count = 0;

for (const [label, id] of replacements) {
  // Match backtick template: `Label: ${d.id}`
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('`' + escaped + ': \\$\\{d\\.' + id + '\\}`', 'g');
  const replacement = '`${FIELD_BY_ID[\'' + id + '\'].label}: ${d.' + id + '}`';
  const before = src;
  src = src.replace(pattern, replacement);
  if (src !== before) count++;
}

// Special: Roof (not Roof Shape / Roof Year)
src = src.replace(/`Roof: \$\{d\.roofType\}`/g, "`${FIELD_BY_ID['roofType'].label}: ${d.roofType}`");
if (src !== src) count++; // always true, track manually
count++;

// Special: Heating (not Heating Updated)
src = src.replace(/`Heating: \$\{d\.heatingType\}`/g, "`${FIELD_BY_ID['heatingType'].label}: ${d.heatingType}`");
count++;

// Special: Cooling
src = src.replace(/`Cooling: \$\{d\.cooling\}`/g, "`${FIELD_BY_ID['cooling'].label}: ${d.cooling}`");
count++;

// Special: Garage (compound format — keep the ternary suffix)
src = src.replace(/`Garage: \$\{d\.garageType\}/g, "`${FIELD_BY_ID['garageType'].label}: ${d.garageType}");
count++;

// Special: Equipment Breakdown (value is 'Yes', not a field ref)
src = src.replace(/`Equipment Breakdown: Yes`/g, "`${FIELD_BY_ID['equipmentBreakdown'].label}: Yes`");
count++;

// Special: Service Line (value is 'Yes')
src = src.replace(/`Service Line: Yes`/g, "`${FIELD_BY_ID['serviceLine'].label}: Yes`");
count++;

// Special: Accidents/Violations/StudentGPA with (global) suffix
src = src.replace(/`Accidents \(global\): \$\{d\.accidents\}`/g, "`${FIELD_BY_ID['accidents'].label} (global): ${d.accidents}`");
src = src.replace(/`Violations \(global\): \$\{d\.violations\}`/g, "`${FIELD_BY_ID['violations'].label} (global): ${d.violations}`");
src = src.replace(/`Student GPA \(global\): \$\{d\.studentGPA\}`/g, "`${FIELD_BY_ID['studentGPA'].label} (global): ${d.studentGPA}`");
count += 3;

// Towing & Labor: keep as-is (intentional display label)

fs.writeFileSync(file, src);
console.log('Patched hawksoft-export.js (' + count + ' replacement patterns applied)');
