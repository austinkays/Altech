/**
 * App Object Initialization
 * Creates the global App object with default state, workflows, tool config,
 * and step titles. Must load BEFORE app-core.js which extends it.
 */
const App = {
    data: {},
    step: 0,
    flow: [],
    storageKey: 'altech_v6',
    quotesKey: 'altech_v6_quotes',
    docIntelKey: 'altech_v6_docintel',
    scanFiles: [],
    extractedData: null,
    encryptionEnabled: true, // Toggle encryption on/off
    drivers: [], // Array of driver objects
    vehicles: [], // Array of vehicle objects
    selectedQuoteIds: new Set(),
    docIntelFiles: [],
    docIntelResults: null,
    initialDlScan: null,
    mapApiKey: null,
    mapPreviewCache: {},
    mapPreviewTimer: null,
    saveTimeout: null,
    saveToken: 0,
    
    workflows: {
        home: ['step-0', 'step-1', 'step-2', 'step-3', 'step-5', 'step-6'],
        auto: ['step-0', 'step-1', 'step-2', 'step-4', 'step-5', 'step-6'],
        both: ['step-0', 'step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6']
    },

    toolNames: {
        quoting: 'Personal Intake',
        coi: 'COI Generator',
        prospect: 'Prospect Investigator',
        compliance: 'CGL Compliance',
        qna: 'Policy Q&A',
        email: 'Email Composer',
        quickref: 'Quick Reference',
        accounting: 'Accounting Export',
        hawksoft: 'HawkSoft Export',
        ezlynx: 'EZLynx Export',
        quotecompare: 'Quote Compare'
    },

    // Config-driven tool registry — single source of truth for landing page,
    // navigation, breadcrumbs, and init logic. Add/remove/reorder tools here.
    toolConfig: [
        // ── Quoting & Sales ──
        { key: 'quoting',      icon: '🏠', color: 'icon-blue',    title: 'Personal Lines',  name: 'Personal Intake',       containerId: 'quotingTool',      htmlFile: 'plugins/quoting.html', category: 'quoting' },
        { key: 'intake',       icon: '🤖', color: 'icon-violet',  title: 'AI Intake',       name: 'AI Intake',             containerId: 'intakeTool',       initModule: 'IntakeAssist',      htmlFile: 'plugins/intake-assist.html', category: 'quoting' },
        { key: 'qna',          icon: '💬', color: 'icon-rose',    title: 'Policy Q&A',      name: 'Policy Q&A',            containerId: 'qnaTool',          initModule: 'PolicyQA',          htmlFile: 'plugins/qna.html',         category: 'quoting' },
        { key: 'quotecompare', icon: '⚖️', color: 'icon-emerald', title: 'Quote Compare',   name: 'Quote Compare',          containerId: 'quoteCompareTool', initModule: 'QuoteCompare',      htmlFile: 'plugins/quotecompare.html', category: 'quoting' },
        // ── Export & Integration ──
        { key: 'ezlynx',       icon: '⚡', color: 'icon-indigo',  title: 'EZLynx Export',   name: 'EZLynx Export',          containerId: 'ezlynxTool',       initModule: 'EZLynxTool',        htmlFile: 'plugins/ezlynx.html',     category: 'export' },
        { key: 'hawksoft',     icon: '📤', color: 'icon-blue',    title: 'HawkSoft Export', name: 'HawkSoft Export',        containerId: 'hawksoftTool',     initModule: 'HawkSoftExport',    htmlFile: 'plugins/hawksoft.html',    category: 'export' },
        // ── Documents & Compliance ──
        { key: 'coi',          icon: '📋', color: 'icon-teal',    title: 'COI Generator',   name: 'COI Generator',          containerId: 'coiTool',          initModule: 'COI',               htmlFile: 'plugins/coi.html',         category: 'docs', hidden: true },
        { key: 'compliance',   icon: '🛡️', color: 'icon-indigo',  title: 'CGL & Bonds',     name: 'CGL Compliance',         containerId: 'complianceTool',   initModule: 'ComplianceDashboard', badge: 'cglBadge', htmlFile: 'plugins/compliance.html', category: 'docs' },
        { key: 'reminders',    icon: '⏰', color: 'icon-orange',  title: 'Reminders',       name: 'Task Reminders',         containerId: 'remindersTool',    initModule: 'Reminders',           badge: 'remindersBadge', htmlFile: 'plugins/reminders.html', category: 'docs' },
        // ── Operations ──
        { key: 'prospect',     icon: '🔍', color: 'icon-amber',   title: 'Prospect Intel',  name: 'Prospect Investigator',  containerId: 'prospectTool',     initModule: 'ProspectInvestigator', htmlFile: 'plugins/prospect.html', category: 'ops' },
        { key: 'email',        icon: '✉️', color: 'icon-violet',  title: 'Email Composer',  name: 'Email Composer',         containerId: 'emailTool',        initModule: 'EmailComposer',     htmlFile: 'plugins/email.html',       category: 'ops' },
        { key: 'accounting',   icon: '💰', color: 'icon-amber',   title: 'Accounting',      name: 'Accounting Export',      containerId: 'accountingTool',   initModule: 'AccountingExport',  htmlFile: 'plugins/accounting.html',  category: 'ops' },
        { key: 'quickref',     icon: '📖', color: 'icon-teal',    title: 'Quick Reference', name: 'Quick Reference',        containerId: 'quickrefTool',     initModule: 'QuickRef',          htmlFile: 'plugins/quickref.html',    category: 'ops' },
        { key: 'vindecoder',   icon: '🚗', color: 'icon-emerald', title: 'VIN Decoder',     name: 'VIN Decoder',            containerId: 'vinDecoderTool',   initModule: 'VinDecoder',        htmlFile: 'plugins/vin-decoder.html', category: 'ops' },
        // ┌────────────────────────────────────────────────────────────┐
        // │  ADD NEW TOOLS HERE                                        │
        // │  Copy a line above and set: key, icon, color, title,    │
        // │  name, containerId, initModule, category                │
        // │  Categories: 'quoting' | 'docs' | 'ops' | 'ref'        │
        // └────────────────────────────────────────────────────────────┘
    ],

    stepTitles: {
        'step-0': 'Policy Scan',
        'step-1': 'Personal Information',
        'step-2': 'Coverage Type',
        'step-3': 'Property Details',
        'step-4': 'Vehicle & Driver Info',
        'step-5': 'Risk Factors & Additional Info',
        'step-6': 'Review & Export'
    },
};

// Expose App globally for testing and external tool access
window.App = App;
