/**
 * Compliance Business Logic — Pure functions for policy classification
 * 
 * Extracted from compliance.js so tests can import directly 
 * without fragile source-code parsing.
 */

// Non-syncing carriers that require manual verification
export const NON_SYNCING_CARRIERS = [
  'Hiscox',
  'IES',
  'HCC Surety',
  'BTIS'
];

export function calculateDaysUntilExpiration(expirationDate) {
  const expDate = new Date(expirationDate);
  const today = new Date();
  const diffTime = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function getExpirationStatus(daysUntilExpiration) {
  if (daysUntilExpiration < 0) return 'expired';
  if (daysUntilExpiration <= 5) return 'critical';
  if (daysUntilExpiration < 60) return 'expiring-soon';
  return 'active';
}

export function isGeneralLiabilityPolicy(policy) {
  const policyStatus = (policy.status || '').toLowerCase();
  if (policyStatus === 'prospect' || policyStatus === 'cancelled' || policyStatus === 'canceled') {
    return false;
  }

  const glCodes = [
    'cgl', 'gl', 'bop', 'bopgl', 'cumbr',
    'general liability', 'commercial general liability',
    'gen liab', 'comm gen liab', 'liability'
  ];

  const excludeCodes = [
    'auto', 'ca', 'personal', 'home', 'renters', 'condo',
    'life', 'health', 'dental', 'vision', 'flood', 'earthquake',
    'workers', 'wc', 'property', 'fire', 'umbrella', 'boat',
    'rv', 'motorcycle', 'dwelling', 'garage', 'garag'
  ];

  const policyNumber = (policy.policyNumber || '').toUpperCase();
  if (policyNumber.startsWith('CA') ||
      policyNumber.startsWith('HO') ||
      policyNumber.startsWith('PA') ||
      policyNumber.startsWith('DP') ||
      policyNumber.startsWith('FL')) {
    return false;
  }

  const allFieldsToCheck = [policy.type, policy.applicationType, policy.title];

  for (const field of allFieldsToCheck) {
    if (field && typeof field === 'string') {
      const fieldLower = field.toLowerCase();
      for (const excludeCode of excludeCodes) {
        if (fieldLower.includes(excludeCode)) {
          return false;
        }
      }
    }
  }

  let hasCglLob = false;
  if (policy.loBs && Array.isArray(policy.loBs)) {
    for (const lob of policy.loBs) {
      if (lob.code && typeof lob.code === 'string') {
        const codeLower = lob.code.toLowerCase();
        for (const glCode of glCodes) {
          if (codeLower === glCode || codeLower.includes(glCode)) {
            hasCglLob = true;
            break;
          }
        }
        if (hasCglLob) break;
      }
    }
  }

  if (hasCglLob) return true;

  if (policy.loBs && Array.isArray(policy.loBs)) {
    for (const lob of policy.loBs) {
      if (lob.code && typeof lob.code === 'string') {
        const codeLower = lob.code.toLowerCase();
        for (const excludeCode of excludeCodes) {
          if (codeLower.includes(excludeCode)) {
            return false;
          }
        }
      }
    }
  }

  if (policy.type && typeof policy.type === 'string') {
    const typeLower = policy.type.toLowerCase();
    for (const glCode of glCodes) {
      if (typeLower === glCode || (glCode.length > 5 && typeLower.includes(glCode))) {
        return true;
      }
    }
  }

  if (policy.applicationType && typeof policy.applicationType === 'string') {
    const appTypeLower = policy.applicationType.toLowerCase();
    for (const glCode of glCodes) {
      if (appTypeLower.includes(glCode)) {
        return true;
      }
    }
  }

  if (policy.title && typeof policy.title === 'string') {
    const titleLower = policy.title.toLowerCase();
    for (const glCode of glCodes) {
      if (titleLower === glCode || titleLower.includes(glCode)) {
        return true;
      }
    }
  }

  return false;
}

export function isSuretyBondPolicy(policy) {
  const policyStatus = (policy.status || '').toLowerCase();
  if (policyStatus === 'prospect' || policyStatus === 'cancelled' || policyStatus === 'canceled') {
    return false;
  }

  const bondCodes = [
    'surety', 'sure', 'bond', 'sb',
    'contractor bond', 'license bond', 'permit bond',
    'performance bond', 'bid bond', 'fidelity'
  ];

  const fieldsToCheck = [policy.type, policy.applicationType, policy.title];

  for (const field of fieldsToCheck) {
    if (field && typeof field === 'string') {
      const fieldLower = field.toLowerCase();
      for (const code of bondCodes) {
        if (fieldLower.includes(code)) {
          return true;
        }
      }
    }
  }

  if (policy.loBs && Array.isArray(policy.loBs)) {
    for (const lob of policy.loBs) {
      if (lob.code && typeof lob.code === 'string') {
        const codeLower = lob.code.toLowerCase();
        for (const code of bondCodes) {
          if (codeLower === code || codeLower.includes(code)) {
            return true;
          }
        }
      }
    }
  }

  const policyNumber = (policy.policyNumber || '').toUpperCase();
  if (policyNumber.startsWith('SB') || policyNumber.startsWith('SURE') || policyNumber.startsWith('BOND')) {
    return true;
  }

  return false;
}

export function requiresManualVerification(carrier) {
  return NON_SYNCING_CARRIERS.some(
    nonSyncCarrier => carrier.toLowerCase().includes(nonSyncCarrier.toLowerCase())
  );
}

export function isCommercialPolicy(policy) {
  const policyStatus = (policy.status || '').toLowerCase();
  if (policyStatus === 'prospect' || policyStatus === 'cancelled' || policyStatus === 'canceled') {
    return false;
  }

  const personalCodes = [
    'home', 'homeowner', 'ho', 'renters', 'condo', 'dwelling',
    'personal auto', 'personal', 'life', 'health', 'dental', 'vision',
    'flood', 'earthquake', 'boat', 'rv', 'motorcycle', 'pet',
    'travel', 'wedding', 'special event'
  ];

  const policyNumber = (policy.policyNumber || '').toUpperCase();
  if (policyNumber.startsWith('HO') || policyNumber.startsWith('DP') ||
      policyNumber.startsWith('FL') || policyNumber.startsWith('PA')) {
    return false;
  }

  const commercialCodes = [
    'cgl', 'gl', 'bop', 'bopgl', 'general liability', 'commercial general liability',
    'gen liab', 'comm gen liab', 'liability',
    'autob', 'commercial auto', 'comm auto', 'ca', 'business auto', 'hired auto',
    'non-owned auto', 'truck', 'fleet',
    'workers', 'wc', 'work comp', 'workers comp', 'workers compensation',
    'cpkge', 'commercial package', 'comm pkg', 'package',
    'cumbr', 'commercial umbrella', 'comm umbrella', 'excess',
    'property', 'commercial property', 'comm prop', 'bldg', 'building',
    'prpty', 'cp',
    'inland', 'inland marine', 'im',
    'crime', 'employee dishonesty',
    'epli', 'employment practices',
    'do', 'd&o', 'directors', 'officers',
    'eo', 'e&o', 'errors', 'professional',
    'cyber', 'data breach',
    'pollution', 'environmental',
    'liquor', 'llqu',
    'garage', 'garag', 'garagekeepers',
    'artisan', 'contractor',
    'surety', 'sure', 'bond', 'sb', 'fidelity',
    'commercial'
  ];

  const fieldsToCheck = [policy.type, policy.applicationType, policy.title];

  for (const field of fieldsToCheck) {
    if (field && typeof field === 'string') {
      const fieldLower = field.toLowerCase();
      for (const code of personalCodes) {
        if (fieldLower.includes(code)) {
          return false;
        }
      }
    }
  }

  if (policy.loBs && Array.isArray(policy.loBs)) {
    let hasCommercialLob = false;
    for (const lob of policy.loBs) {
      if (lob.code && typeof lob.code === 'string') {
        const codeLower = lob.code.toLowerCase();
        for (const code of commercialCodes) {
          if (codeLower === code || codeLower.includes(code)) {
            hasCommercialLob = true;
            break;
          }
        }
        if (hasCommercialLob) break;
      }
    }
    if (hasCommercialLob) return true;

    for (const lob of policy.loBs) {
      if (lob.code && typeof lob.code === 'string') {
        const codeLower = lob.code.toLowerCase();
        for (const code of personalCodes) {
          if (codeLower.includes(code)) {
            return false;
          }
        }
      }
    }
  }

  for (const field of fieldsToCheck) {
    if (field && typeof field === 'string') {
      const fieldLower = field.toLowerCase();
      for (const code of commercialCodes) {
        if (fieldLower === code || fieldLower.includes(code)) {
          return true;
        }
      }
    }
  }

  return false;
}

export function getCommercialPolicyType(policy) {
  if (isSuretyBondPolicy(policy)) return 'bond';

  const allText = [
    policy.type, policy.applicationType, policy.title,
    ...(policy.loBs || []).map(l => l.code || '')
  ].filter(Boolean).join(' ').toLowerCase();

  if (/autob|commercial auto|comm auto|business auto|hired auto|fleet|truck/i.test(allText)) return 'auto';
  if (/workers|wc|work comp/i.test(allText)) return 'wc';
  if (/cpkge|commercial package|comm pkg/i.test(allText)) return 'pkg';
  if (/cumbr|commercial umbrella|comm umbrella|excess/i.test(allText)) return 'umbrella';
  if (/inland|im/i.test(allText)) return 'im';
  if (/epli|employment practices/i.test(allText)) return 'epli';
  if (/d&o|directors.*officers|officers.*directors/i.test(allText)) return 'do';
  if (/e&o|errors.*omissions|professional/i.test(allText)) return 'eo';
  if (/cyber|data breach/i.test(allText)) return 'cyber';
  if (/crime|employee dishonesty/i.test(allText)) return 'crime';
  if (/liquor|llqu/i.test(allText)) return 'liquor';
  if (/garage|garag/i.test(allText)) return 'garage';
  if (/pollution|environmental/i.test(allText)) return 'pollution';
  if (/bop/i.test(allText)) return 'bop';
  if (/prpty|commercial property|comm prop|cp|bldg|building/i.test(allText)) return 'property';
  if (/property/i.test(allText)) return 'property';

  if (isGeneralLiabilityPolicy(policy)) return 'cgl';

  return 'commercial';
}

export function getPersonalPolicyType(policy) {
  const allText = [
    policy.type, policy.applicationType, policy.title,
    ...(policy.loBs || []).map(l => l.code || '')
  ].filter(Boolean).join(' ').toLowerCase();

  const pn = (policy.policyNumber || '').toUpperCase();

  if (/homeowner|ho\d/i.test(allText) || pn.startsWith('HO')) return 'homeowner';
  if (/personal auto/i.test(allText) || pn.startsWith('PA')) return 'personal-auto';
  if (/renter/i.test(allText)) return 'renters';
  if (/condo/i.test(allText)) return 'condo';
  if (/dwelling/i.test(allText) || pn.startsWith('DP')) return 'dwelling';
  if (/flood/i.test(allText) || pn.startsWith('FL')) return 'flood';
  if (/earthquake/i.test(allText)) return 'earthquake';
  if (/boat|watercraft/i.test(allText)) return 'boat';
  if (/rv|recreational vehicle/i.test(allText)) return 'rv';
  if (/motorcycle/i.test(allText)) return 'motorcycle';
  if (/umbrella/i.test(allText)) return 'personal-umbrella';
  if (/life/i.test(allText)) return 'life';
  if (/health|dental|vision/i.test(allText)) return 'health';

  return 'personal';
}
