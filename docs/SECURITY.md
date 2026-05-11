# Altech Toolkit — Security Overview

**Document purpose.** This is a one-page reference for E&O cyber insurance
underwriters, agency audits, and internal management asking "how is client
data protected?" It is written for non-engineers but lists the specific
technical controls and code paths an auditor can verify.

**Scope.** The Altech Toolkit is a single-user-per-device web application
used by insurance agency staff to draft quotes, manage compliance, and
prepare client correspondence. Client data (Nonpublic Personal Information,
NPI as defined by GLBA) is entered into the app and persisted both locally
(browser storage on the user's device) and remotely (Supabase Postgres,
encrypted).

**Last reviewed.** May 11, 2026.

---

## 1. Encryption at rest

| Surface | Technology | Key source | Status |
|---|---|---|---|
| **Local form data, quotes, vaults** (browser localStorage) | AES-256-GCM via Web Crypto API | User passphrase → Argon2id → master key | Encrypted |
| **Compliance state, reminders, client history, glossary, carrier overrides** (browser localStorage) | AES-256-GCM via Web Crypto API | Same key as above | Encrypted ([js/secure-storage.js](../js/secure-storage.js)) |
| **HawkSoft policy rows, compliance annotations** (browser IndexedDB) | AES-256-GCM | Same key as above | Encrypted ([js/compliance-idb.js](../js/compliance-idb.js)) |
| **Supabase `user_blobs` / `user_quotes` / `user_crypto_meta`** (Postgres) | AES-256-GCM with AAD (Additional Authenticated Data) binding to `(table, row id, user id)` | Same key | Encrypted ([js/supabase-sync.js](../js/supabase-sync.js)) |
| **Supabase Postgres disk** | At-rest encryption (AWS RDS / GCP, AES-256) | Provider-managed | Encrypted by provider |

**Key derivation.** The master key is derived from the user's chosen
passphrase via **Argon2id** (memory-hard, 64 MiB memory cost, 3 iterations,
1 thread, 32-byte output) — current industry standard for password-based
encryption. The salt is per-user and randomly generated. Pre-Argon2id
vaults use **PBKDF2-HMAC-SHA256** with 600,000 iterations (OWASP 2025
recommendation). Code: [js/crypto-helper.js](../js/crypto-helper.js).

**Key custody.** The master key is never transmitted off the device. Only
the user's passphrase can derive it, and the passphrase is never stored
anywhere. The Supabase server holds only ciphertext — even a full database
breach would not expose client data.

**Authenticated encryption.** All ciphertext uses AES-GCM with an
Additional Authenticated Data (AAD) tag bound to the row's identity
`(table name, row id, user id)`. A compromised server cannot move a
ciphertext from one row to another or relabel it for a different user
without the auth tag failing on decrypt. Code:
[js/crypto-aad.js](../js/crypto-aad.js).

---

## 2. Encryption in transit

| Hop | Technology |
|---|---|
| Browser ↔ Supabase | TLS 1.2+ (HTTPS) enforced by Supabase |
| Browser ↔ Altech API (Vercel) | TLS 1.2+ enforced by Vercel |
| Altech API ↔ Supabase | TLS 1.2+ |

HTTPS is enforced via `Strict-Transport-Security` header
(`max-age=31536000; includeSubDomains`).
Code: [lib/security.js](../lib/security.js).

---

## 3. Authentication & access control

| Control | Detail |
|---|---|
| **Authentication** | Supabase Auth (email + password). One user per agency device. |
| **Multi-factor authentication** | TOTP-based (time-based one-time password) via authenticator apps. Required to push data to the cloud. Code: [js/auth-mfa-ui.js](../js/auth-mfa-ui.js). |
| **Idle-lock** | The cryptographic vault auto-locks after **15 minutes of inactivity** (configurable). Subsequent decrypts require re-entering the passphrase. Implements the "session controls on unattended workstations" requirement. Code: [js/idle-lock.js](../js/idle-lock.js). |
| **Row-level security (RLS)** | Every public Supabase table has `enable row level security` plus an explicit `(auth.uid() = user_id)` policy. The `0005_rls_audit.sql` migration refuses to apply if any public table is missing RLS or a policy. Verified continuously by [scripts/verify-rls.mjs](../scripts/verify-rls.mjs). |
| **API endpoints** | Every endpoint that handles user data requires a valid bearer token (Supabase JWT or, as a fallback, Firebase ID token). Verified server-side in [lib/security.js](../lib/security.js) via `verifyAuthToken`. |

---

## 4. Bug-report data exfiltration prevention

In-app bug reports are posted to a public GitHub Issues repository. To
prevent accidental NPI leakage:

1. **Client-side scrub** runs before the report leaves the browser.
   Patterns redacted to `[REDACTED-…]`:
   - SSN (hyphenated or space-separated 9 digits)
   - US phone numbers (most formats)
   - Email addresses
   - Credit card numbers (13-19 digit runs)
   - VIN numbers (17 alphanumeric chars per VIN spec)
   - Dates of birth (M/D/YYYY)
2. **Server-side scrub** runs again as defense-in-depth in
   [api/config.js](../api/config.js) before the GitHub Issue is
   created.
3. **UI warning** in the bug report modal explicitly tells users
   not to include client names, addresses, or screenshots showing PII.

Code: [js/bug-report.js](../js/bug-report.js), [api/config.js](../api/config.js).

---

## 5. Data minimization & retention

- **No analytics, no third-party trackers.** The app does not embed
  Google Analytics, Mixpanel, Segment, etc. No client data leaves the
  device for telemetry.
- **API logs.** Vercel access logs include URLs and status codes but
  never request bodies. Sensitive data is never logged at the
  application level (audited grep for `console.log(req.body)` etc).
- **Activity log (in-app).** A local ring buffer of save/sync/export
  events is kept on-device only — never synced. Used to show the user
  whether the app is healthy. Code: [js/activity-log.js](../js/activity-log.js).
- **Backups.** Supabase performs daily point-in-time backups (provider
  default). Backups are encrypted with the same E2E ciphertext shape
  as live data — even Supabase staff cannot decrypt them.

---

## 6. Vendor list

| Vendor | Role | Data sent | DPA status |
|---|---|---|---|
| Supabase | Database, auth | Ciphertext only — E2E encrypted | DPA in place |
| Vercel | Static hosting, serverless API | Request metadata + ciphertext when proxied | DPA in place |
| Google (Gemini AI, Places, Static Maps) | AI assistance + autocomplete | Address strings, structured prompts. **No SSN, DOB, phone.** | Google Cloud DPA |
| Anthropic (Claude API) | AI assistance (alternate) | Same as Gemini | Anthropic DPA |
| Rentcast | Property data lookup | Address strings | Rentcast TOS |
| GitHub | Bug-report destination | Scrubbed bug-report text only | GitHub DPA |
| Stripe | Subscription billing | Payment method tokens (never raw cards) | Stripe DPA |

**Firebase.** As of May 2026 (Phase D rollout), the Firebase backend is
deprecated. New sessions use Supabase exclusively. The Firebase code
modules remain in the repo as a one-release fallback; they will be
deleted in the next release once no user has explicitly opted back.

---

## 7. Audit trail

| Event | Logged where |
|---|---|
| User sign-in / sign-out | Supabase `auth.audit_log_entries` table (provider-managed) |
| Failed auth | Same |
| Local save / sync / export / AI call | Local ring buffer ([js/activity-log.js](../js/activity-log.js)) — visible to the user via the "Activity" pill in the app header |
| Sync conflicts | Surfaced via in-app dialog + activity log |
| Bug reports | GitHub Issues |
| Migration events (Phase 4 Firebase → Supabase) | Local activity log + Supabase `audit_log` table |

---

## 8. Incident response

The current single-user-per-agency model simplifies the incident response:

1. **Suspected compromise of a device.** User rotates passphrase via
   the in-app "Change Passphrase" flow ([js/vault-ui.js](../js/vault-ui.js)).
   The master key is re-derived; existing local ciphertext stays valid
   (passphrase rotation re-wraps the master key, not the data).
2. **Suspected compromise of Supabase.** Even with full server access,
   an attacker sees only ciphertext (AES-256-GCM with AAD binding).
   They cannot move ciphertext between rows or relabel rows for
   different users — the auth tag fails on decrypt.
3. **Lost device.** Power-on encryption (OS-level disk encryption — out
   of scope of this document, configured by the device's IT) plus the
   app's idle-lock (15 min) provide layered protection.
4. **Lost passphrase.** Recovery via the user's printed 24-word
   recovery key (generated at vault setup). Without the recovery key
   AND the passphrase, the data is unrecoverable — by design.

---

## 9. Verification — what an auditor can check

| Claim | Verify by |
|---|---|
| All NPI is encrypted at rest in localStorage | `grep -n 'SecureStorage' js/secure-storage.js` — look at `SENSITIVE` array; open any sensitive key in browser DevTools → Application → Local Storage and confirm the value is base64 (not JSON). |
| All NPI is encrypted at rest in IndexedDB | DevTools → Application → IndexedDB → `altech_cgl` → `cache` / `annotations` → values should be `{ __sec: 'v1', ct: '<base64>' }`. |
| Server cannot decrypt | In Supabase Dashboard, open the `public.user_blobs` table. The `ciphertext` column is the v=2 envelope `{v, iv, ct}` JSON or legacy base64 — neither readable without the user's master key. |
| RLS is on every public table | Run [scripts/verify-rls.mjs](../scripts/verify-rls.mjs) against the live project. It anon-connects, tries cross-user reads/writes, and reports any successes (should be zero). |
| Bug reports scrub PII | Open [tests/bug-report-scrub.test.js](../tests/bug-report-scrub.test.js) — 12 tests pin down the regex patterns and call-sites. |
| Idle-lock works | [tests/idle-lock.test.js](../tests/idle-lock.test.js) — 9 tests cover the timer + activity reset + configurable timeout. |
| Encryption at rest works | [tests/secure-storage.test.js](../tests/secure-storage.test.js) — 9 tests cover the migration, proxy, and round-trip. |

Full test suite: **2344 tests across 62 suites, 100% passing** (`npm test`).

---

## 10. Out of scope

This document covers application-level security. The following are
outside the application and are the responsibility of the device owner /
agency IT:

- Operating system patching, anti-malware, and disk encryption.
- Browser extensions (an attacker-controlled extension can read DOM
  and localStorage; this is a browser-level threat, not addressable
  in the app layer).
- Physical access controls on the user's device.
- Network-level controls (VPN, firewall, etc.).

---

**Contact.** Engineering questions: see `CLAUDE.md` and `AGENTS.md` in the
repository root. Compliance / DPA questions: contact the agency owner.
