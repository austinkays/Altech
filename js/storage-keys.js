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

    // ── Personal Intake v2 (phone-first rebuild — Home + Auto + Boat + RV) ──
    // Lives alongside v1 (`FORM`/`QUOTES`) during rollout. Gated by INTAKE_V2_ENABLED.
    INTAKE_V2:              'altech_v6_intake_v2',         // IntakeV2.data — live draft (encrypted, cloud-synced)
    INTAKE_V2_QUOTES:       'altech_v6_intake_v2_quotes',  // saved v2 quotes (encrypted, cloud-synced)
    INTAKE_V2_ENABLED:      'altech_intake_v2_enabled',    // '1' shows the sidebar tile + lets users opt in
    INTAKE_V2_MODE:         'altech_intake_v2_mode',       // 'quick' | 'full' — per-device preference
    INTAKE_V2_RAILS:        'altech_intake_v2_rails',      // 'expanded' | 'collapsed' — workspace chrome state
    AGENCY_DEFAULTS:        'altech_agency_defaults',      // shared smart-default values (state, deductibles, term) — cloud-synced

    // ── Biometric / passkey unlock (per-device, never synced) ───────────────
    // Each entry: { credentialId, prfSaltB64, wrappedMKB64, kdfTree, label,
    // createdAt }. Wrapped MK is encrypted by a key derived from the
    // WebAuthn PRF extension output, so the bytes themselves are useless
    // without the matching authenticator (Touch ID / Face ID / Windows
    // Hello / hardware key). Per-device because the credential lives on the
    // authenticator — to unlock from another device, register a passkey
    // there too.
    BIOMETRIC_CREDENTIALS:  'altech_biometric_credentials',

    // ── Plugin data (cloud-synced) ───────────────────────────────────────────
    COMMERCIAL_DRAFT:       'altech_commercial_v1',      // commercial intake draft (encrypted, cloud-synced)
    COMMERCIAL_QUOTES:      'altech_commercial_quotes',  // saved commercial quotes (encrypted, cloud-synced)
    CARRIER_OVERRIDES:      'altech_carrier_overrides',   // user-edited carrier rule overrides (cloud-synced via SYNC_DOCS.carrierOverrides)
    CGL_STATE:              'altech_cgl_state',
    QUICKREF_CARDS:         'altech_quickref_cards',
    QUICKREF_NUMBERS:       'altech_quickref_numbers',
    QUICKREF_EMOJIS:        'altech_quickref_emojis',
    REMINDERS:              'altech_reminders',
    REMINDERS_DIGEST_SHOWN: 'altech_reminders_digest_shown', // YYYY-MM-DD — last date the daily digest toast was shown (local-only, per-device)
    REMINDERS_COMPLETIONS:  'altech_reminders_completions', // per-task completion ledger ({id:[ISO,…]}). Local-only, NEVER synced (not in DOC_LOCAL_KEYS) — survives restoreFromCloud()'s blind blob overwrite so a completed 'once' task can't resurrect as "Past due"
    CLIENT_HISTORY:         'altech_client_history',
    AGENCY_GLOSSARY:        'altech_agency_glossary', // max 500 chars
    ACCT_VAULT:             'altech_acct_vault_v2',   // encrypted AES-256-GCM
    ACCT_VAULT_META:        'altech_acct_vault_meta', // PIN hash + salt

    // ── Plugin data (local-only) ─────────────────────────────────────────────
    CGL_CACHE:              'altech_cgl_cache',
    EMAIL_DRAFTS:           'altech_email_drafts',    // encrypted
    EMAIL_CUSTOM_PROMPT:    'altech_email_custom_prompt',
    SAVED_PROSPECTS:        'altech_saved_prospects',
    PROSPECT_TO_QUOTER:     'altech_prospect_to_quoter', // temp transfer key (cleared after consumption)
    VIN_HISTORY:            'altech_vin_history',     // max 20 entries
    QUOTE_COMPARISONS:      'altech_v6_quote_comparisons', // max 20
    INTAKE_ASSIST:          'altech_intake_assist',
    HAWKSOFT_SETTINGS:      'altech_hawksoft_settings',
    HAWKSOFT_HISTORY:       'altech_hawksoft_history',
    HAWKSOFT_INITIALS:      'altech_hawksoft_initials',  // per-user agent initials for the HawkSoft Logger RE: prefix — cloud-synced (entered once)
    EZLYNX_FORMDATA:        'altech_ezlynx_formdata',
    EZLYNX_INCIDENTS:       'altech_ezlynx_incidents',
    EZLYNX_EXT_CONFIRMED:  'altech_ezlynx_ext_confirmed',
    EZLYNX_XML_PATH:        'altech_ezlynx_xml_path',
    EZLYNX_FILLER_LAST_RUN: 'altech_ezlynx_filler_last_run', // desktop Playwright filler last-run audit (ts, outcome, fill counts)
    EZLYNX_XML_LAST_EXPORT:  'altech_ezlynx_xml_last_export',  // ACORD XML export audit (ts, filename, bytes) — Build B safety-net path
    EXPORT_HISTORY:         'altech_export_history',
    EXPORT_PICKER_LAST:     'altech_export_picker_last',  // last-checked formats in the unified Export Files picker
    CALL_LOGGER:            'altech_call_logger',
    RETURNED_MAIL:          'altech_returned_mail',
    BSB_API_KEY:            'altech_bsb_apikey',
    BSB_CACHE:              'altech_bsb_cache',
    DRIVERS:                'altech_drivers',         // legacy driver array storage
    VEHICLES:               'altech_vehicles',        // legacy vehicle array storage
    ACCT_VAULT_V1:          'altech_acct_vault',      // legacy migration key
    ACCT_HISTORY:           'altech_acct_history',
    QUICKREF_SECTIONS:      'altech_quickref_sections',

    // ── Settings & identity ──────────────────────────────────────────────────
    DARK_MODE:              'altech_dark_mode',       // cloud-synced via settings doc
    THEME:                  'altech_theme',           // cloud-synced via settings doc ('default'|'light'|'aurora')
    ONBOARDED:              'altech_onboarded',
    USER_NAME:              'altech_user_name',
    AGENCY_PROFILE:         'altech_agency_profile',
    ENCRYPTION_SALT:        'altech_encryption_salt', // PBKDF2 salt (legacy v1 device-bound key) — never sync
    PASSPHRASE_SALT:        'altech_passphrase_salt', // PBKDF2 salt for v2 passphrase-derived key (per-device copy of the Supabase-stored salt) — never sync
    E2E_CRYPTO_V2:          'altech_e2e_crypto_v2',   // feature flag: '1' = passphrase-derived key, anything else = legacy device-bound key
    VAULT_LOCAL_META:       'altech_vault_meta_local', // v2 vault metadata cache (passphrase salt + wrapped MK). Stub until Phase 2 swaps in Supabase.
    SYNC_META:              'altech_sync_meta',
    SYNC_BACKEND:           'altech_sync_backend',    // Path B Phase 2 feature flag: 'firebase' (default) | 'supabase'. Flipped by Phase 4 migration.
    MIGRATION_ENABLED:      'altech_migration_enabled', // Phase 4a feature flag: '1' = show the Firebase→Supabase migration modal. Dev/admin-only during rollout.
    MIGRATION_STATE:        'altech_migration_state', // Phase 4a per-user migration progress: 'not-started' | 'in-progress' | 'complete' | 'error:<msg>'. Survives reload so a crashed migration can resume.
    MIGRATION_DRY_RUN:      'altech_migration_dry_run', // Phase D-2: '1' = Session 2 pipeline copies but does NOT flip SYNC_BACKEND. Lets admins verify decryption on Supabase copy before committing.
    PRE_MIGRATION_BACKUP:   'altech_pre_migration_backup', // Phase D-3: snapshot of localStorage taken right before the Firebase→Supabase pipeline begins. 30-day TTL, then auto-cleaned. Lets a single user roll back if Supabase decryption fails.
    ACTIVITY_LOG:           'altech_activity_log',  // Phase 1 reliability: ring buffer of recent saves/syncs/exports/AI calls. Local-only (never synced) — surfaces what happened when something feels broken.
    SYNC_META_SUPABASE:     'altech_sync_meta_supabase', // last-pushed-at per doc_key, Supabase backend only
    CLOUD_SYNC_DISABLED:    'altech_cloud_sync_disabled', // user opt-out flag — local-only, never sync (would be circular)
    GEMINI_KEY:             'gemini_api_key',
    AI_SETTINGS:            'altech_ai_settings',
    AI_SALT:                'altech_ai_salt',
    DEBUG:                  'altech_debug',

    // ── UI state (local-only) ────────────────────────────────────────────────
    SIDEBAR_COLLAPSED:      'altech_sidebar_collapsed',
    IDLE_TIMEOUT_MS:        'altech_idle_timeout_ms', // Idle-lock threshold (default 15 min, 0 = disabled). Per-device preference.
    WEATHER_CACHE:          'altech_weather_cache',
    WEATHER_LOCATION:       'altech_weather_location',
    DEVICE_ID:              'altech_device_id',

    // ── Decryption recovery ──────────────────────────────────────────────────
    // When CryptoHelper.decrypt returns null (key mismatch, corrupted
    // ciphertext, etc.), App parks the original ciphertext here instead of
    // silently dropping it. Never cloud-synced — local-only safety net. If the
    // user recovers a key/passphrase later, these blobs are their path back.
    DECRYPTION_RECOVERY:    'altech_decryption_recovery',

    // ── Firestore-only paths (not localStorage) ─────────────────────────────────
    // These are Firestore document paths written directly — NOT localStorage keys.
    // RENTCAST_USAGE:      users/{uid}/rentcast_usage/{YYYY-MM}
    //   Fields: { count: number, resetDate: "YYYY-MM-01" }
    // RENTCAST_OVERAGE_LOG: users/{uid}/rentcast_overage_log/{ISO-timestamp}
    //   Fields: { timestamp, address, monthlyCount, approvedBy, action: "approved_overage" }
    //   These records are permanent and must never be deleted.
});
