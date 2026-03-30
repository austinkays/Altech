// storage-keys.js — Single source of truth for all localStorage keys used by Altech.
// Import: window.STORAGE_KEYS.<KEY>
// Do not hardcode 'altech_*' strings in modules — reference this registry instead.
// Synced column: refer to cloud-sync.js and AGENTS.md §7.1 for the full sync matrix.

/* eslint-disable */
window.STORAGE_KEYS = Object.freeze({
    // ── Core form data ──────────────────────────────────────────────────────
    FORM:                   'altech_v6',            // App.data (encrypted, cloud-synced)
    QUOTES:                 'altech_v6_quotes',     // saved drafts (encrypted, cloud-synced)
    DOC_INTEL:              'altech_v6_docintel',   // document intel results

    // ── Plugin data (cloud-synced) ───────────────────────────────────────────
    COMMERCIAL_DRAFT:       'altech_commercial_v1',      // commercial intake draft (encrypted, cloud-synced)
    COMMERCIAL_QUOTES:      'altech_commercial_quotes',  // saved commercial quotes (encrypted, cloud-synced)
    CGL_STATE:              'altech_cgl_state',
    QUICKREF_CARDS:         'altech_quickref_cards',
    QUICKREF_NUMBERS:       'altech_quickref_numbers',
    QUICKREF_EMOJIS:        'altech_quickref_emojis',
    REMINDERS:              'altech_reminders',
    CLIENT_HISTORY:         'altech_client_history',
    AGENCY_GLOSSARY:        'altech_agency_glossary', // max 500 chars
    ACCT_VAULT:             'altech_acct_vault_v2',   // encrypted AES-256-GCM
    ACCT_VAULT_META:        'altech_acct_vault_meta', // PIN hash + salt

    // ── Plugin data (local-only) ─────────────────────────────────────────────
    CGL_CACHE:              'altech_cgl_cache',
    COI_DRAFT:              'altech_coi_draft',
    EMAIL_DRAFTS:           'altech_email_drafts',    // encrypted
    EMAIL_CUSTOM_PROMPT:    'altech_email_custom_prompt',
    SAVED_PROSPECTS:        'altech_saved_prospects',
    PROSPECT_TO_QUOTER:     'altech_prospect_to_quoter', // temp transfer key (cleared after consumption)
    VIN_HISTORY:            'altech_vin_history',     // max 20 entries
    QNA:                    'altech_v6_qna',
    QUOTE_COMPARISONS:      'altech_v6_quote_comparisons', // max 20
    INTAKE_ASSIST:          'altech_intake_assist',
    HAWKSOFT_SETTINGS:      'altech_hawksoft_settings',
    HAWKSOFT_HISTORY:       'altech_hawksoft_history',
    EZLYNX_FORMDATA:        'altech_ezlynx_formdata',
    EZLYNX_INCIDENTS:       'altech_ezlynx_incidents',
    EZLYNX_EXT_CONFIRMED:  'altech_ezlynx_ext_confirmed',
    EXPORT_HISTORY:         'altech_export_history',
    CALL_LOGGER:            'altech_call_logger',
    RETURNED_MAIL:          'altech_returned_mail',
    BSB_API_KEY:            'altech_bsb_apikey',
    BSB_CACHE:              'altech_bsb_cache',
    ACCT_VAULT_V1:          'altech_acct_vault',      // legacy migration key
    ACCT_HISTORY:           'altech_acct_history',
    QUICKREF_SECTIONS:      'altech_quickref_sections',

    // ── Settings & identity ──────────────────────────────────────────────────
    DARK_MODE:              'altech_dark_mode',       // cloud-synced via settings doc
    ONBOARDED:              'altech_onboarded',
    USER_NAME:              'altech_user_name',
    AGENCY_PROFILE:         'altech_agency_profile',
    ENCRYPTION_SALT:        'altech_encryption_salt', // PBKDF2 salt — never sync
    SYNC_META:              'altech_sync_meta',
    GEMINI_KEY:             'gemini_api_key',
    AI_SETTINGS:            'altech_ai_settings',
    AI_SALT:                'altech_ai_salt',
    DEBUG:                  'altech_debug',

    // ── UI state (local-only) ────────────────────────────────────────────────
    SIDEBAR_COLLAPSED:      'altech_sidebar_collapsed',
    WEATHER_CACHE:          'altech_weather_cache',
    WEATHER_LOCATION:       'altech_weather_location',
    DEVICE_ID:              'altech_device_id',

    // ── Firestore-only paths (not localStorage) ─────────────────────────────────
    // These are Firestore document paths written directly — NOT localStorage keys.
    // RENTCAST_USAGE:      users/{uid}/rentcast_usage/{YYYY-MM}
    //   Fields: { count: number, resetDate: "YYYY-MM-01" }
    // RENTCAST_OVERAGE_LOG: users/{uid}/rentcast_overage_log/{ISO-timestamp}
    //   Fields: { timestamp, address, monthlyCount, approvedBy, action: "approved_overage" }
    //   These records are permanent and must never be deleted.
});
