/**
 * App Object Initialization
 * Creates the global App object with default state, workflows, tool config,
 * and step titles. Must load BEFORE app-core.js which extends it.
 */
const App = {
    data: {},
    step: 0,
    flow: [],
    storageKey: STORAGE_KEYS.FORM,
    quotesKey: STORAGE_KEYS.QUOTES,
    docIntelKey: STORAGE_KEYS.DOC_INTEL,
    scanFiles: [],
    extractedData: null,
    encryptionEnabled: true, // Toggle encryption on/off
    drivers: [], // Array of driver objects
    vehicles: [], // Array of vehicle objects
    selectedQuoteIds: new Set(),
    docIntelFiles: [],
    docIntelResults: null,
    mapApiKey: null,
    mapPreviewCache: {},
    mapPreviewTimer: null,
    saveTimeout: null,
    saveToken: 0,
    
    workflows: {
        home: ['step-0', 'step-1', 'step-3', 'step-5', 'step-6'],
        auto: ['step-0', 'step-1', 'step-3', 'step-4', 'step-5', 'step-6'],
        both: ['step-0', 'step-1', 'step-3', 'step-4', 'step-5', 'step-6']
    },

    // Config-driven tool registry — single source of truth for landing page,
    // navigation, breadcrumbs, and init logic. Add/remove/reorder tools here.
    // Categories: 'intake' | 'export' | 'compliance' | 'workflow' | 'beta'
    // Flag `beta: true` surfaces a "BETA" pill in the sidebar.
    toolConfig: [
        // ── Intake & Quoting ──
        { key: 'quoting',      icon: '✏️', color: 'icon-blue',    title: 'Personal Intake',   name: 'Personal Intake',    containerId: 'quotingTool',           htmlFile: 'plugins/quoting.html',           category: 'intake' },
        { key: 'commercial',   icon: '🏢', color: 'icon-amber',   title: 'Commercial Intake', name: 'Commercial Intake',  containerId: 'commercialQuoterTool',  initModule: 'CommercialQuoter',     htmlFile: 'plugins/commercial-quoter.html', category: 'intake' },
        { key: 'quotecompare', icon: '⚖️', color: 'icon-emerald', title: 'Quote Compare',     name: 'Quote Compare',      containerId: 'quoteCompareTool',      initModule: 'QuoteCompare',         htmlFile: 'plugins/quotecompare.html',      category: 'beta', beta: true },
        // ── Export ──
        { key: 'ezlynx',       icon: '⚡', color: 'icon-indigo',  title: 'EZLynx Export',     name: 'EZLynx Export',      containerId: 'ezlynxTool',            initModule: 'EZLynxTool',           htmlFile: 'plugins/ezlynx.html',            category: 'export' },
        { key: 'hawksoft',     icon: '📤', color: 'icon-blue',    title: 'HawkSoft Export',   name: 'HawkSoft Export',    containerId: 'hawksoftTool',          initModule: 'HawkSoftExport',       htmlFile: 'plugins/hawksoft.html',          category: 'export' },
        { key: 'decimport',    icon: '📥', color: 'icon-blue',    title: 'PDF to HawkSoft',   name: 'PDF to HawkSoft',    containerId: 'decImportTool',         initModule: 'DecImport',            htmlFile: 'plugins/dec-import.html',        category: 'beta', beta: true },
        { key: 'tasksheet',    icon: '✅', color: 'icon-green',   title: 'Task Sheet',        name: 'Task Sheet',         containerId: 'taskSheetTool',         initModule: 'TaskSheetModule',      htmlFile: 'plugins/task-sheet.html',        category: 'export' },
        // ── Compliance ──
        { key: 'compliance',   icon: '🛡️', color: 'icon-indigo',  title: 'CGL Compliance',    name: 'CGL Compliance',     containerId: 'complianceTool',        initModule: 'ComplianceDashboard',  badge: 'cglBadge',       htmlFile: 'plugins/compliance.html',  category: 'compliance' },
        { key: 'reminders',    icon: '⏰', color: 'icon-orange',  title: 'Reminders',         name: 'Reminders',          containerId: 'remindersTool',         initModule: 'Reminders',            badge: 'remindersBadge', htmlFile: 'plugins/reminders.html',   category: 'compliance' },
        { key: 'calllogger',   icon: '📞', color: 'icon-blue',    title: 'HawkSoft Logger',   name: 'HawkSoft Logger',    containerId: 'callLoggerTool',        initModule: 'CallLogger',           htmlFile: 'plugins/call-logger.html',       category: 'compliance' },
        { key: 'returnedmail', icon: '↩️', color: 'icon-red',     title: 'Returned Mail',     name: 'Returned Mail',      containerId: 'returnedMailTool',      initModule: 'ReturnedMailTracker',  htmlFile: 'plugins/returned-mail.html',     category: 'beta', beta: true },
        // ── Workflow Tools ──
        { key: 'quickref',     icon: '📖', color: 'icon-teal',    title: 'Quick Reference',   name: 'Quick Reference',    containerId: 'quickrefTool',          initModule: 'QuickRef',             htmlFile: 'plugins/quickref.html',          category: 'workflow' },
        { key: 'endorsement',  icon: '📝', color: 'icon-blue',    title: 'Endorsement Parser',name: 'Endorsement Parser', containerId: 'endorsementTool',       initModule: 'EndorsementParser',    htmlFile: 'plugins/endorsement.html',       category: 'workflow' },
        { key: 'email',        icon: '✉️', color: 'icon-violet',  title: 'Email Composer',    name: 'Email Composer',     containerId: 'emailTool',             initModule: 'EmailComposer',        htmlFile: 'plugins/email.html',             category: 'beta', beta: true },
        { key: 'prospect',     icon: '🔭', color: 'icon-amber',   title: 'Prospect Intel',    name: 'Prospect Intel',     containerId: 'prospectTool',          initModule: 'ProspectInvestigator', htmlFile: 'plugins/prospect.html',          category: 'workflow' },
        { key: 'accounting',   icon: '🧾', color: 'icon-amber',   title: 'Accounting',        name: 'Accounting',         containerId: 'accountingTool',        initModule: 'AccountingExport',     htmlFile: 'plugins/accounting.html',        category: 'workflow' },
        { key: 'vindecoder',   icon: '🚗', color: 'icon-emerald', title: 'VIN Decoder',       name: 'VIN Decoder',        containerId: 'vinDecoderTool',        initModule: 'VinDecoder',           htmlFile: 'plugins/vin-decoder.html',       category: 'workflow' },
        // ── In Development (Beta) ──
        { key: 'intakev2',     icon: '🧭', color: 'icon-violet',  title: 'Personal Intake v2',name: 'Personal Intake v2', containerId: 'intakeV2Tool',          initModule: 'IntakeV2',             htmlFile: 'plugins/intake-v2.html',         category: 'beta', beta: true },
        { key: 'broadform',    icon: '🎯', color: 'icon-amber',   title: 'Carrier Match',     name: 'Carrier Match',      containerId: 'broadformTool',         initModule: 'Broadform',            htmlFile: 'plugins/tools/broadform.html',   category: 'beta', beta: true },
        { key: 'intake',       icon: '✨', color: 'icon-violet',  title: 'Quote Bot',         name: 'Quote Bot',          containerId: 'intakeTool',            initModule: 'IntakeAssist',         htmlFile: 'plugins/intake-assist.html',     category: 'beta', beta: true },
    ],

    stepTitles: {
        'step-0': 'Policy Scan',
        'step-1': 'Personal Information',
        'step-3': 'Property Details',
        'step-4': 'Vehicle & Driver Info',
        'step-5': 'Risk Factors & Additional Info',
        'step-6': 'Review & Export'
    },
};

// Expose App globally for testing and external tool access
window.App = App;

// ── Production log suppression ──
// console.warn and console.error always pass through.
// console.log is suppressed on production (altech.agency) to avoid leaking
// internal state to users who open DevTools. Toggle via localStorage:
//   localStorage.setItem('altech_debug', 'true')  →  re-enables logs
(function() {
    const isProd = location.hostname === 'altech.agency' || location.hostname.endsWith('.vercel.app');
    const debugOverride = localStorage.getItem(STORAGE_KEYS.DEBUG) === 'true';
    if (isProd && !debugOverride) {
        // eslint-disable-next-line no-console
        console.log = () => {};
        // eslint-disable-next-line no-console
        console.info = () => {};
        // console.warn and console.error are intentionally preserved
    }
    if (debugOverride && typeof document !== 'undefined') {
        const apply = () => document.body && document.body.classList.add('debug-mode');
        if (document.body) apply();
        else document.addEventListener('DOMContentLoaded', apply, { once: true });
    }
})();
